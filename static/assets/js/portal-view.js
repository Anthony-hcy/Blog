/* Blog Portal — 站内管理视图（随笔式编辑器）
   通过 #/portal hash 在博客任意页面挂载管理界面，保留侧边栏/顶栏 */
(function () {
  'use strict';

  // ---------- 基础常量 ----------
  var LS = {
    token: 'portal_auth_token',
    email: 'portal_auth_email',
    repo: 'portal_repo',
    author: 'portal_author',
    last_loc: 'portal_last_loc',
  };
  var API = 'https://api.github.com';
  var POSTS_DIR = 'content/posts';
  var IMG_DIR = 'static/assets/img';
  var WORKFLOW = 'deploy.yml';
  var IMG_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

  // 站点基础路径（/Blog/ 或 /），用于图片 URL 与 marked 动态加载
  var BASE = (location.pathname.match(/^(\/[^/]+)?\//) || ['', '/'])[1] || '/';
  if (BASE.charAt(BASE.length - 1) !== '/') BASE += '/';
  var ASSET_PREFIX = BASE + 'assets/img/';
  var PORTAL_HASH = '#/portal';

  // ---------- 状态 ----------
  var state = { token: '', repo: '', author: '' };
  var currentTab = 'posts';
  var editingSlug = null;
  var editingDate = '';   // 正在编辑的文章原时间（编辑 memo 时保留原时间）
  var editingType = '';   // 正在编辑的文章原类型（memo|post），防止跨模式误覆盖
  var editMode = 'post'; // post | memo
  var allPosts = [];
  var allImages = [];
  var localDeleted = {}; // 已删除图片的墓碑：GitHub 目录缓存会让已删图片在列表刷新时短暂复活，用它挡住
  var editorView = 'edit'; // 编辑 | 预览
  var memoPhotos = []; // 说说模式的图片列表 [{url, name}]

  var AMAP_KEY = (document.body && document.body.dataset.amapKey || '').trim();
  var AMAP_JS_KEY = (document.body && document.body.dataset.amapJsKey || '').trim();
  var AMAP_JS_CODE = (document.body && document.body.dataset.amapJsCode || '').trim();
  var portalRoot = null;
  var cssLoaded = false;
  var markedLib = null;

  // ---------- 工具 ----------
  function $(id) { return document.getElementById(id); }

  function toast(msg, isError) {
    var t = document.querySelector('#portal-root .portal-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle('is-error', !!isError);
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function readLS(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function writeLS(key, val) { try { localStorage.setItem(key, val); } catch (_) {} }
  function clearLS(key) { try { localStorage.removeItem(key); } catch (_) {} }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeSlug(s) {
    return String(s || '').trim().replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  // 时间框：未选值时用自绘「yy/mm/dd --:--」盖住系统占位（原生控件空态格式由系统渲染，改不了）
  function syncDatePlaceholder() {
    var input = portalRoot.querySelector('#edit-date');
    var ph = portalRoot.querySelector('#edit-date-ph');
    if (!input || !ph) return;
    var empty = !input.value;
    input.classList.toggle('is-empty', empty);
    ph.classList.toggle('is-visible', empty);
  }

  function imgUrl(repoPath) {
    return ASSET_PREFIX + repoPath.replace(IMG_DIR + '/', '');
  }

  // GitHub raw 直链（上传后立即可显示；正文 Markdown 仍用站点路径）
  function rawImgUrl(repoPath) {
    return 'https://raw.githubusercontent.com/' + state.repo + '/main/' + repoPath;
  }

  // 日期序号命名：2026.09.04-01、-02……（同批次连续递增）
  var _datedSeq = { prefix: '', next: 1 };
  function datedName(ext) {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    var prefix = d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
    if (_datedSeq.prefix !== prefix) {
      var max = 0;
      allImages.forEach(function (img) {
        var m = img.name.match(new RegExp('^' + prefix.replace(/\./g, '\\.') + '-(\\d+)\\.'));
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      _datedSeq.prefix = prefix;
      _datedSeq.next = max + 1;
    }
    var safeExt = (ext || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    return prefix + '-' + pad(_datedSeq.next++) + '.' + safeExt;
  }

  // ---------- GitHub API ----------
  function gh(path, options) {
    options = options || {};
    var headers = {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + state.token,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (options.body && typeof options.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    return fetch(API + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body,
    }).then(function (res) {
      if (res.status === 204) return {};
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var msg = (data && data.message) || ('HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function listDir(path) { return gh('/repos/' + state.repo + '/contents/' + path); }
  function getFile(path) { return gh('/repos/' + state.repo + '/contents/' + path); }

  function putFile(path, content, message) {
    return gh('/repos/' + state.repo + '/contents/' + path, {
      method: 'PUT',
      body: { message: message, content: btoa(unescape(encodeURIComponent(content))) },
    });
  }

  function updateFile(path, content, message, sha) {
    return gh('/repos/' + state.repo + '/contents/' + path, {
      method: 'PUT',
      body: { message: message, content: btoa(unescape(encodeURIComponent(content))), sha: sha },
    });
  }

  function deleteFile(path, message, sha) {
    return gh('/repos/' + state.repo + '/contents/' + path, {
      method: 'DELETE',
      body: { message: message, sha: sha },
    });
  }

  // ---------- frontmatter ----------
  function buildPostMarkdown(data) {
    var lines = ['---'];
    lines.push('title: ' + data.title);
    lines.push('date: ' + data.date);
    lines.push('slug: ' + data.slug);
    lines.push('type: ' + data.type);
    if (data.category) lines.push('category: ' + data.category);
    if (data.tags && data.tags.length) lines.push('tags: [' + data.tags.join(', ') + ']');
    if (data.excerpt) lines.push('excerpt: ' + data.excerpt);
    if (data.banner) lines.push('banner: ' + data.banner);
    if (data.location) lines.push('location: ' + data.location);
    lines.push('draft: false');
    lines.push('---');
    lines.push('');
    lines.push(data.body || '');
    return lines.join('\n');
  }

  function parseFrontmatter(raw) {
    var data = {};
    var body = raw;
    var fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (fm) {
      fm[1].split(/\r?\n/).forEach(function (line) {
        var idx = line.indexOf(':');
        if (idx < 0) return;
        var key = line.slice(0, idx).trim();
        var val = line.slice(idx + 1).trim();
        if (/^\[.*\]$/.test(val)) {
          val = val.slice(1, -1).split(',').map(function (s) { return s.trim().replace(/^['"]|['"]$/g, ''); }).filter(Boolean);
        } else {
          val = val.replace(/^['"]|['"]$/g, '');
        }
        data[key] = val;
      });
      body = raw.slice(fm[0].length);
    }
    return { data: data, body: body.replace(/^\r?\n/, '') };
  }

  // ---------- 动态加载 marked ----------
  function loadMarked() {
    if (markedLib) return Promise.resolve(markedLib);
    return import(BASE + 'assets/marked.esm.js').then(function (m) {
      markedLib = m.marked;
      if (markedLib.setOptions) markedLib.setOptions({ gfm: true, breaks: true }); // 与博客构建渲染一致：单换行换行
      return markedLib;
    }).catch(function () {
      return null;
    });
  }

  // ---------- 注入样式 ----------
  function ensureCss() {
    if (cssLoaded) return;
    cssLoaded = true;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = BASE + 'assets/portal.css';
    document.head.appendChild(link);
    var style = document.createElement('style');
    style.textContent = [
      '#portal-root { --p-bg:#f5f5f7; --p-card:#fff; --p-text:#1c1c1e; --p-text-2:#6e6e73; --p-text-3:#aeaeb2; --p-accent:#0a84ff; --p-danger:#ff3b30; --p-border:#e5e5ea; --p-btn-bg:#f2f2f7; --p-radius:12px; }',
      '#portal-root { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif; }',
      '#portal-root .portal-view { display:none; }',
      '#portal-root .portal-view.is-active { display:block; }',
      '#portal-root [hidden] { display:none !important; }',
      '#portal-root .editor-view-row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }',
      '#portal-root .view-switch { display:flex; border:1px solid var(--p-border); border-radius:9px; overflow:hidden; }',
      '#portal-root .view-btn { min-width:64px; padding:8px 12px; text-align:center; border:0; background:var(--p-btn-bg); cursor:pointer; font-size:14px; color:var(--p-text-2); }',
      '#portal-root .view-switch .view-btn.is-active { background:var(--p-card); color:var(--p-accent); font-weight:600; }',
      '#portal-root .view-switch .view-btn + .view-btn { border-left:1px solid var(--p-border); }',
      '#portal-root .editor-view-row > .view-btn { min-width:44px; border:1px solid var(--p-border); border-radius:9px; background:var(--p-btn-bg); color:var(--p-text); font-size:15px; }',
      '#portal-root .editor-view-row > .view-btn:hover { border-color:var(--p-accent); color:var(--p-accent); }',
      '#portal-root .edit-body { width:100%; min-height:320px; border:1px solid var(--p-border); border-radius:10px; padding:14px 16px; background:var(--p-card); color:var(--p-text); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:14px; line-height:1.7; outline:none; resize:vertical; }',
      '#portal-root .edit-body:focus { border-color:var(--p-accent); }',
      '#portal-root .editor-preview-md { border:1px solid var(--p-border); border-radius:10px; padding:14px 16px; min-height:320px; background:var(--p-card); font-size:15px; line-height:1.8; color:var(--p-text); word-break:break-word; overflow-wrap:anywhere; }',
      '#portal-root .editor-preview-md img { max-width:100%; border-radius:8px; margin:0.4em 0; }',
      '#portal-root .editor-preview-md pre { background:var(--p-bg); border:1px solid var(--p-border); border-radius:8px; padding:12px; overflow-x:auto; margin:0.8em 0; }',
      '#portal-root .editor-preview-md code { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:13px; }',
      '#portal-root .editor-preview-md pre code { background:none; padding:0; }',
      '#portal-root .editor-preview-md blockquote { border-left:3px solid var(--p-accent); margin:0.8em 0; padding:4px 14px; color:var(--p-text-2); background:var(--p-bg); border-radius:0 8px 8px 0; }',
      '#portal-root .editor-preview-md table { border-collapse:collapse; margin:0.8em 0; }',
      '#portal-root .editor-preview-md th, #portal-root .editor-preview-md td { border:1px solid var(--p-border); padding:6px 10px; }',
      '#portal-root .edit-card { padding:20px 18px 18px; }',
      '#portal-root .memo-composer { background:var(--p-card); border:1px solid var(--p-border); border-radius:var(--p-radius); padding:8px 12px 16px; margin-bottom:14px; box-shadow:0 1px 3px rgba(0,0,0,.04); }',
      '#portal-root .memo-topbar { display:flex; justify-content:space-between; align-items:center; margin:0 -8px 6px; }',
      '#portal-root .memo-topbar-btn { background:none; border:0; padding:6px 2px; font-size:16px; color:var(--p-text); cursor:pointer; }',
      '#portal-root .memo-publish-btn { background:#07c160; border:0; color:#fff; font-size:15px; font-weight:600; padding:9px 26px; border-radius:9px; cursor:pointer; }',
      '#portal-root .memo-publish-btn:disabled { opacity:.45; cursor:default; }',
      '#portal-root .memo-textarea { width:100%; min-height:150px; border:0; outline:none; resize:vertical; background:transparent; color:var(--p-text); font-family:inherit; font-size:17px; line-height:1.7; resize:none; }',
      '#portal-root .memo-photos { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:6px; }',
      '#portal-root .memo-photos .memo-photo { position:relative; }',
      '#portal-root .memo-photos .memo-photo img { width:100%; aspect-ratio:1/1; object-fit:cover; border-radius:6px; display:block; }',
      '#portal-root .memo-photos .memo-photo-rm { position:absolute; top:-6px; right:-6px; width:22px; height:22px; border-radius:50%; border:0; background:var(--p-danger); color:#fff; cursor:pointer; font-size:12px; line-height:1; }',
      '#portal-root .memo-photo-add { aspect-ratio:1/1; background:var(--p-btn-bg); border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:26px; color:var(--p-text-3); }',
      '#portal-root .memo-photo-add:hover { color:var(--p-accent); }',
      '#portal-root .memo-loc-row { display:flex; align-items:center; gap:10px; margin-top:14px; padding-top:12px; border-top:1px solid var(--p-border); color:var(--p-text-3); }',
      '#portal-root .memo-loc-input { flex:1; border:0; outline:none; background:transparent; font-size:15px; color:var(--p-text); }',
      '#portal-root .memo-loc-input::placeholder { color:var(--p-text-3); }',
      '#portal-root .memo-loc-btn { background:none; border:0; padding:4px 6px; color:var(--p-accent); cursor:pointer; font-size:15px; }',
      '#portal-root .memo-loc-btn:disabled { opacity:.5; cursor:default; }',
      '#portal-root #btn-upload { min-width:44px; border:1px solid var(--p-border); border-radius:9px; background:var(--p-btn-bg); color:var(--p-text); font-size:15px; }',
      '#portal-root #btn-upload:hover { border-color:var(--p-accent); color:var(--p-accent); }',
      '#portal-root .portal-btn-lg { min-height:44px; padding:10px 22px; font-size:15px; border-radius:10px; }',
      '#portal-root .portal-edit-actions { display:flex; gap:10px; margin-top:14px; }',
      '#portal-root .portal-edit-actions .portal-btn { flex:1; }',
      '#portal-root .mode-switch { display:flex; gap:8px; margin-bottom:14px; }',
      '#portal-root .mode-btn { flex:1; padding:9px 0; text-align:center; border:1px solid var(--p-border); border-radius:9px; background:var(--p-card); cursor:pointer; font-size:14px; color:var(--p-text-2); }',
      '#portal-root .mode-btn.is-active { border-color:var(--p-accent); color:var(--p-accent); font-weight:600; background:#eef6ff; }',
      '#portal-root .date-wrap { position:relative; display:block; }',
      '#portal-root .date-wrap .date-ph { position:absolute; left:13px; top:50%; transform:translateY(-50%); color:var(--p-text-3); font-size:15px; pointer-events:none; display:none; }',
      '#portal-root .date-wrap .date-ph.is-visible { display:block; }',
      '#portal-root .date-wrap input.is-empty { color:transparent; }',
      '#portal-root .details-opt summary { cursor:pointer; color:var(--p-accent); font-size:13px; margin:10px 0 6px; }',
      '#portal-root .portal-edit-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }',
      '#portal-root .img-grid-mini { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:10px; }',
      '#portal-root .img-mini { position:relative; border:1px solid var(--p-border); border-radius:8px; overflow:hidden; }',
      '#portal-root .img-mini img { width:100%; aspect-ratio:1/1; object-fit:cover; display:block; cursor:zoom-in; }',
      '#portal-root .img-mini-actions { position:absolute; left:0; right:0; bottom:0; display:none; align-items:center; justify-content:center; gap:8px; padding:8px 0; background:linear-gradient(transparent, rgba(0,0,0,.6)); }',
      '#portal-root .img-mini:hover .img-mini-actions { display:flex; }',
      '#portal-root .img-mini-actions button { border:0; border-radius:6px; padding:4px 10px; font-size:12px; cursor:pointer; }',
      '@media (hover: none) { #portal-root .img-mini-actions { display:flex; } }',
      '@media (max-width:560px) {',
      '  #portal-root .portal-shell { padding:0 12px 40px; }',
      '  #portal-root .view-btn { min-width:56px; font-size:13px; }',
      '  #portal-root .edit-body { min-height:240px; font-size:14px; }',
      '  #portal-root .memo-photos { grid-template-columns:repeat(3,1fr); }',
      '  #portal-root .portal-field input, #portal-root .portal-field textarea, #portal-root .portal-field select { font-size:16px; }',
      '  #portal-root .date-wrap .date-ph { font-size:16px; }',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // =================================================================
  // 路由：挂载 / 卸载
  // =================================================================
  function isPortalHash() {
    return location.hash.indexOf(PORTAL_HASH) === 0;
  }

  function parsePortalQuery() {
    // 支持 ?tab=edit&slug=x（独立页面）与 #/portal?tab=edit&slug=x（站内视图）
    var q = '';
    if (location.search) {
      q = location.search.charAt(0) === '?' ? location.search.slice(1) : location.search;
    } else if (location.hash.indexOf(PORTAL_HASH) === 0) {
      q = location.hash.replace(PORTAL_HASH, '');
      if (q.charAt(0) === '?') q = q.slice(1);
    }
    var params = {};
    q.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      params[decodeURIComponent(pair.slice(0, idx))] = decodeURIComponent(pair.slice(idx + 1));
    });
    return params;
  }

  function route() {
    if (isPortalHash()) {
      mountPortal();
    } else {
      unmountPortal();
    }
  }

  function renderPortalContent() {
    renderShell();
    applyAuth();
    var params = parsePortalQuery();
    if (params.tab) {
      switchTab(params.tab);
      if (params.tab === 'edit' && params.slug) {
        loadPostForEdit(params.slug);
      }
    }
  }

  function mountPortal() {
    ensureCss();
    if (portalRoot && portalRoot.isConnected) return;

    // 已存在于 HTML（博客框架生成的 portal.html 提供 #portal-root 容器）
    var existing = document.getElementById('portal-root');
    if (existing) {
      portalRoot = existing;
      renderPortalContent();
      return;
    }

    portalRoot = document.createElement('div');
    portalRoot.id = 'portal-root';
    portalRoot.className = 'portal-root';

    // 站内视图：挂到 .layout-main 并隐藏原内容；独立页面：直接挂 body
    var layoutMain = document.querySelector('.layout-main');
    if (layoutMain) {
      var hiddenChildren = [];
      Array.prototype.forEach.call(layoutMain.children, function (child) {
        if (child.style.display === 'none') return;
        child.style.display = 'none';
        hiddenChildren.push(child);
      });
      portalRoot._hidden = hiddenChildren;
      layoutMain.appendChild(portalRoot);
    } else {
      document.body.appendChild(portalRoot);
    }

    renderPortalContent();
  }

  function unmountPortal() {
    if (!portalRoot) return;
    // 恢复原内容
    (portalRoot._hidden || []).forEach(function (child) {
      child.style.display = '';
    });
    portalRoot.parentNode && portalRoot.parentNode.removeChild(portalRoot);
    portalRoot = null;
  }

  // =================================================================
  // Shell 渲染
  // =================================================================
  function renderShell() {
    portalRoot.innerHTML =
      '<div class="portal-shell' + (currentTab === 'edit' ? ' is-editing' : '') + '">' +
        '<header class="portal-header">' +
          '<h1 class="portal-title">Portal</h1>' +
          '<div class="portal-header-actions">' +
            '<span class="portal-account" id="portal-account" hidden></span>' +
            '<button id="portal-signout" type="button" hidden>Sign Out</button>' +
          '</div>' +
        '</header>' +
        '<nav class="portal-tabs" id="portal-tabs" hidden>' +
          '<button class="portal-tab is-active" data-tab="posts" type="button">Posts</button>' +
          '<button class="portal-tab" data-tab="edit" type="button">Edit</button>' +
          '<button class="portal-tab" data-tab="images" type="button">Images</button>' +
          '<button class="portal-tab" data-tab="status" type="button">Status</button>' +
        '</nav>' +
        '<main class="portal-main">' +
          renderLoginView() +
          renderPostsView() +
          renderEditView() +
          renderImagesView() +
          renderStatusView() +
        '</main>' +
      '</div>' +
      '<div class="portal-toast" id="portal-toast" hidden></div>';

    bindShellEvents();
  }

  function renderLoginView() {
    return '<section class="portal-view is-active" id="view-login">' +
      '<div class="portal-card">' +
        '<h2 class="portal-card-title">Sign in</h2>' +
        '<p class="portal-hint">使用 GitHub Personal Access Token 登录（需要 repo 读写权限）。</p>' +
        '<label class="portal-field"><span>Owner / Repo</span>' +
          '<input type="text" id="portal-repo" placeholder="username/repository" autocomplete="off"></label>' +
        '<label class="portal-field"><span>Personal Access Token</span>' +
          '<input type="password" id="portal-token" placeholder="github_pat_..." autocomplete="off"></label>' +
        '<label class="portal-field"><span>你的名字（署名）</span>' +
          '<input type="text" id="portal-author" placeholder="我的名字"></label>' +
        '<button class="portal-btn portal-btn-primary" id="portal-signin" type="button">Sign in</button>' +
      '</div>' +
    '</section>';
  }

  function renderPostsView() {
    return '<section class="portal-view" id="view-posts" hidden>' +
      '<div class="portal-toolbar">' +
        '<input type="search" id="posts-search" class="portal-search" placeholder="搜索文章标题…">' +
        '<button class="portal-btn portal-btn-primary" id="btn-new-post" type="button">+ New post</button>' +
      '</div>' +
      '<div class="portal-list" id="posts-list"></div>' +
      '<div class="portal-hint" id="posts-count"></div>' +
    '</section>';
  }

  function renderEditView() {
    return '<section class="portal-view" id="view-edit" hidden>' +
      '<div class="mode-switch">' +
        '<button class="mode-btn is-active" data-mode="post" type="button">发文章</button>' +
        '<button class="mode-btn" data-mode="memo" type="button">发说说</button>' +
      '</div>' +
      // 发文章模式（单卡片：标题/时间/工具栏/编辑区/更多选项）
      '<div id="post-fields">' +
        '<div class="portal-card edit-card">' +
          '<label class="portal-field"><span>标题</span>' +
            '<input type="text" id="edit-title" placeholder="文章标题"></label>' +
          '<label class="portal-field"><span>时间</span>' +
            '<span class="date-wrap"><input type="datetime-local" id="edit-date"><span class="date-ph" id="edit-date-ph">yy/mm/dd --:--</span></span></label>' +
          '<div class="editor-view-row">' +
            '<div class="view-switch">' +
              '<button type="button" class="view-btn is-active" data-view="edit">编辑</button>' +
              '<button type="button" class="view-btn" data-view="preview">预览</button>' +
            '</div>' +
            '<button type="button" class="view-btn" id="btn-insert-image" title="添加图片"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>' +
          '</div>' +
          '<textarea id="edit-body" class="edit-body" placeholder="用 Markdown 写点什么…"></textarea>' +
          '<div class="editor-preview-md" id="edit-preview-md" hidden></div>' +
          '<details class="details-opt">' +
            '<summary>更多选项（slug/分类/标签/摘要/封面）</summary>' +
            '<div class="portal-grid">' +
              '<label class="portal-field"><span>Slug（留空自动生成）</span>' +
                '<input type="text" id="edit-slug" placeholder="自动生成"></label>' +
              '<label class="portal-field"><span>分类</span>' +
                '<input type="text" id="edit-category" placeholder="留空默认小作文"></label>' +
            '</div>' +
            '<div class="portal-grid">' +
              '<label class="portal-field"><span>标签（逗号分隔）</span>' +
                '<input type="text" id="edit-tags" placeholder="tag1, tag2"></label>' +
              '<label class="portal-field"><span>摘要（可选）</span>' +
                '<input type="text" id="edit-excerpt" placeholder="留空自动截取"></label>' +
            '</div>' +
            '<label class="portal-field"><span>封面（可选）</span>' +
              '<input type="text" id="edit-banner" placeholder="/assets/img/post/cover.png"></label>' +
          '</details>' +
        '</div>' +
      '</div>' +
      // 发说说模式（微信朋友圈风格：顶栏 取消/发表，大输入区，方形九宫格照片）
      '<div id="memo-fields" style="display:none">' +
        '<div class="memo-composer">' +
          '<div class="memo-topbar">' +
            '<button class="memo-topbar-btn" id="btn-memo-cancel" type="button">取消</button>' +
            '<button class="memo-publish-btn" id="btn-memo-publish" type="button">发表</button>' +
          '</div>' +
          '<textarea id="memo-text" class="memo-textarea" placeholder="这一刻的想法…"></textarea>' +
          '<div class="memo-photos" id="memo-photos"></div>' +
          '<div class="memo-loc-row">' +
            '<i class="fa-solid fa-location-dot" aria-hidden="true"></i>' +
            '<input type="text" id="memo-loc" class="memo-loc-input" placeholder="所在位置">' +
            '<button class="memo-loc-btn" id="btn-locate" type="button" title="自动定位到区/县"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="portal-edit-actions">' +
        '<button class="portal-btn portal-btn-lg" id="btn-cancel-edit" type="button">取消</button>' +
        '<button class="portal-btn portal-btn-primary portal-btn-lg" id="btn-save-post" type="button">发布</button>' +
      '</div>' +
    '</section>';
  }

  function renderImagesView() {
    return '<section class="portal-view" id="view-images" hidden>' +
      '<div class="portal-toolbar">' +
        '<button class="view-btn" id="btn-upload" type="button" title="上传图片"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>' +
        '<input type="file" id="img-file" multiple accept="image/*" style="display:none">' +
      '</div>' +
      '<div class="portal-progress" id="img-progress" hidden></div>' +
      '<div class="img-grid-mini" id="images-grid"></div>' +
    '</section>';
  }

  function renderStatusView() {
    return '<section class="portal-view" id="view-status" hidden>' +
      '<div class="portal-card">' +
        '<h2 class="portal-card-title">Build</h2>' +
        '<div class="portal-stat-row"><span class="portal-stat-label">Status</span>' +
          '<span class="portal-stat-value" id="status-build">-</span></div>' +
        '<div class="portal-actions"><button class="portal-btn portal-btn-outline" id="btn-rebuild" type="button">Rebuild Site</button></div>' +
      '</div>' +
      '<div class="portal-card">' +
        '<h2 class="portal-card-title">Site Content</h2>' +
        '<div class="portal-stat-row"><span class="portal-stat-label">Latest commit</span>' +
          '<span class="portal-stat-value portal-commit" id="status-commit">-</span></div>' +
      '</div>' +
    '</section>';
  }

  // =================================================================
  // Shell 事件
  // =================================================================

  function bindShellEvents() {
    portalRoot.querySelector('#portal-signin').addEventListener('click', signIn);
    portalRoot.querySelector('#portal-signout').addEventListener('click', signOut);
    portalRoot.querySelector('#btn-new-post').addEventListener('click', newPost);
    portalRoot.querySelector('#btn-cancel-edit').addEventListener('click', function () { switchTab('posts'); });
    portalRoot.querySelector('#btn-save-post').addEventListener('click', savePost);
    portalRoot.querySelector('#btn-upload').addEventListener('click', function () {
      portalRoot.querySelector('#img-file').click();
    });
    portalRoot.querySelector('#img-file').addEventListener('change', uploadImages);
    portalRoot.querySelector('#btn-rebuild').addEventListener('click', rebuildSite);
    portalRoot.querySelector('#posts-search').addEventListener('input', function () {
      renderPosts(allPosts, this.value.trim().toLowerCase());
    });

    // 时间框：选值/清空时同步占位覆盖层
    var dateInput = portalRoot.querySelector('#edit-date');
    dateInput.addEventListener('input', syncDatePlaceholder);
    dateInput.addEventListener('change', syncDatePlaceholder);
    syncDatePlaceholder();

    // 编辑/预览切换
    portalRoot.querySelectorAll('.view-switch .view-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { setEditorView(btn.dataset.view); });
    });
    portalRoot.querySelector('#btn-insert-image').addEventListener('click', openPicker);
    // 朋友圈风格发说说：顶栏发表/取消 + 九宫格 "+" 添加照片
    portalRoot.querySelector('#btn-memo-publish').addEventListener('click', savePost);
    portalRoot.querySelector('#btn-memo-cancel').addEventListener('click', function () { switchTab('posts'); });
    portalRoot.querySelector('#memo-photos').addEventListener('click', function (e) {
      if (e.target.closest('.memo-photo-add')) openPicker();
    });
    var locBtn = portalRoot.querySelector('#btn-locate');
    if (AMAP_KEY) {
      locBtn.addEventListener('click', function () { locateAmap(locBtn); });
    } else {
      locBtn.hidden = true; // 未配置高德 key 则不显示自动定位
    }

    // 模式切换
    portalRoot.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setEditMode(btn.dataset.mode);
      });
    });

    // 图片网格操作（Images 页）
    portalRoot.querySelector('#images-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) {
        // 点击图片本体（非按钮）→ 查看大图
        var pic = e.target.closest('.img-mini img');
        if (pic) openLightbox(pic.currentSrc || pic.getAttribute('src'));
        return;
      }
      var act = btn.dataset.act;
      if (act === 'delimg') {
        var repoPath = btn.dataset.repopath;
        var name = btn.dataset.name;
        if (!window.confirm('删除图片 ' + name + '？')) return;
        // 立即从本地列表与 DOM 移除（零延迟反馈）
        var idx = -1;
        allImages.forEach(function (img, i) { if (img.repoPath === repoPath) idx = i; });
        var removedImg = idx >= 0 ? allImages[idx] : null;
        if (idx >= 0) allImages.splice(idx, 1);
        renderImages();
        // 异步调 GitHub API 删除，失败则恢复
        localDeleted[repoPath] = 1; // 墓碑：防目录缓存复活
        getFile(repoPath).then(function (fd) {
          return deleteFile(repoPath, 'Delete image: ' + name, fd.sha);
        }).then(function () {
          toast('已删除');
        }).catch(function (err) {
          if (removedImg) allImages.unshift(removedImg); // 列表已是时间倒序，失败恢复插回最前
          renderImages();
          toast('删除失败: ' + err.message, true);
        });
      }
    });

    // Tab 切换
    portalRoot.querySelectorAll('.portal-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchTab(tab.dataset.tab); });
    });
  }

  function switchTab(name) {
    currentTab = name;
    var shell = portalRoot.querySelector('.portal-shell');
    shell.classList.toggle('is-editing', name === 'edit');
    portalRoot.querySelectorAll('.portal-tab').forEach(function (t) {
      t.classList.toggle('is-active', t.dataset.tab === name);
    });
    portalRoot.querySelectorAll('.portal-view').forEach(function (v) {
      v.classList.toggle('is-active', v.id === 'view-' + name);
      v.hidden = v.id !== 'view-' + name;
    });
    if (name === 'posts') renderPosts(allPosts, '');
    if (name === 'images') { if (!allImages.length) loadAllImages().then(renderImages); else renderImages(); }
    if (name === 'status') { loadStatus(); checkStuckRuns(); }
    if (name === 'edit') {
      // 手机端打开 Edit 默认进发说说；正在编辑的内容不被打断
      var isEmpty = !editingSlug && !portalRoot.querySelector('#edit-title').value &&
        !portalRoot.querySelector('#edit-body').value && !portalRoot.querySelector('#memo-text').value;
      if (isEmpty) setEditMode(window.matchMedia && window.matchMedia('(max-width: 560px)').matches ? 'memo' : 'post');
    }
  }

  // =================================================================
  // 登录
  // =================================================================
  function applyAuth() {
    state.token = readLS(LS.token);
    state.repo = readLS(LS.repo);
    state.author = readLS(LS.author);
    var authed = !!(state.token && state.repo);
    var tabs = portalRoot.querySelector('#portal-tabs');
    var account = portalRoot.querySelector('#portal-account');
    var signout = portalRoot.querySelector('#portal-signout');
    tabs.hidden = !authed;
    signout.hidden = !authed;
    account.hidden = !authed;
    if (authed) {
      account.textContent = state.repo;
      switchTab(currentTab);
      loadPosts();
      loadAllImages().then(renderImages);
      loadStatus();
      checkStuckRuns();
      // 侧边栏 Portal 链接显示（登录态）
      syncSidebarPortalLink(true);
    } else {
      showOnlyView('login');
      syncSidebarPortalLink(false);
    }
  }

  function showOnlyView(name) {
    portalRoot.querySelectorAll('.portal-view').forEach(function (v) {
      v.classList.toggle('is-active', v.id === 'view-' + name);
      v.hidden = v.id !== 'view-' + name;
    });
  }

  function syncSidebarPortalLink(visible) {
    document.querySelectorAll('.js-portal-nav-link').forEach(function (link) {
      link.style.display = visible ? '' : 'none';
      link.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  }

  function signIn() {
    var repo = portalRoot.querySelector('#portal-repo').value.trim();
    var token = portalRoot.querySelector('#portal-token').value.trim();
    var author = portalRoot.querySelector('#portal-author').value.trim();
    if (!repo || !token) { toast('请填写 Owner/Repo 和 Token', true); return; }
    state.repo = repo;
    state.token = token;
    state.author = author || state.author;
    writeLS(LS.repo, repo);
    writeLS(LS.token, token);
    writeLS(LS.author, state.author);
    writeLS(LS.email, state.author);
    applyAuth();
    toast('已登录');
  }

  function signOut() {
    clearLS(LS.token);
    clearLS(LS.repo);
    clearLS(LS.email);
    applyAuth();
    toast('已退出');
  }

  // =================================================================
  // Posts
  // =================================================================
  function renderPosts(posts, query) {
    var list = (posts || []).filter(function (p) {
      if (!query) return true;
      return p.title.toLowerCase().indexOf(query) >= 0;
    });
    var countEl = portalRoot.querySelector('#posts-count');
    countEl.textContent = list.length + ' / ' + posts.length + ' posts';
    var box = portalRoot.querySelector('#posts-list');
    box.innerHTML = '';
    list.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'post-item';
      item.innerHTML =
        '<div class="post-item-main">' +
          '<div class="post-item-title">' + esc(p.title) + '</div>' +
          '<div class="post-item-meta">' +
            '<span class="post-item-type">' + (p.type === 'memo' ? 'memo' : 'post') + '</span>' +
            '&nbsp;&nbsp;' + esc(p.dateFull || p.dateText) +
            '&nbsp;&nbsp;<span class="post-item-status">publish</span>' +
          '</div>' +
        '</div>' +
        '<div class="post-item-actions">' +
          '<button class="portal-btn" data-act="edit" data-slug="' + esc(p.slug) + '" type="button">Edit</button>' +
          '<button class="portal-btn" data-act="delete" data-slug="' + esc(p.slug) + '" type="button">Delete</button>' +
        '</div>';
      box.appendChild(item);
    });
  }

  function loadPosts() {
    listDir(POSTS_DIR).then(function (files) {
      var mdFiles = (files || []).filter(function (f) { return f.name.endsWith('.md'); });
      return Promise.all(mdFiles.map(function (f) {
        return getFile(POSTS_DIR + '/' + f.name).then(function (fileData) {
          var raw = '';
          try { raw = decodeURIComponent(escape(atob(fileData.content))); } catch (_) {}
          var parsed = parseFrontmatter(raw);
          var d = parsed.data;
          return {
            slug: f.name.replace(/\.md$/, ''),
            title: d.title || f.name,
            type: d.type === 'memo' ? 'memo' : 'post',
            dateText: (d.date || '').slice(0, 10),
            dateFull: d.date || '',
            dateMs: Date.parse(String(d.date || '').replace(' ', 'T')) || 0,
            sha: fileData.sha,
          };
        }).catch(function () { return null; }); // 单文件失败（如删除后目录缓存未更新致 404）只跳过该文件，不拖垮整个列表
      }));
    }).then(function (list) {
      // 按真实时间戳倒序（localeCompare 会忽略时分，导致同日内容顺序错乱）
      allPosts = list.filter(Boolean).sort(function (a, b) { return (b.dateMs || 0) - (a.dateMs || 0); });
      renderPosts(allPosts, '');
    }).catch(function (e) {
      toast('加载文章失败: ' + e.message, true);
      renderPosts([], '');
    });
  }

  function newPost() {
    editingSlug = null;
    editingDate = '';
    editingType = '';
    setEditMode('post');
    portalRoot.querySelector('#edit-title').value = '';
    // 新建文章时间留空 → 显示自绘占位「yy/mm/dd --:--」，保存时自动用发布时刻
    portalRoot.querySelector('#edit-date').value = '';
    syncDatePlaceholder();
    portalRoot.querySelector('#edit-slug').value = '';
    portalRoot.querySelector('#edit-category').value = '';
    portalRoot.querySelector('#edit-tags').value = '';
    portalRoot.querySelector('#edit-excerpt').value = '';
    portalRoot.querySelector('#edit-banner').value = '';
    portalRoot.querySelector('#edit-body').value = '';
    setEditorView('edit');
    memoPhotos = [];
    renderMemoPhotos();
    portalRoot.querySelector('#memo-text').value = '';
    // 自动填上次使用的位置（个人发布绝大多数在同一地点，免去重复手打）
    portalRoot.querySelector('#memo-loc').value = readLS(LS.last_loc);
    switchTab('edit');
  }

  function loadPostForEdit(slug) {
    getFile(POSTS_DIR + '/' + slug + '.md').then(function (fileData) {
      var raw = '';
      try { raw = decodeURIComponent(escape(atob(fileData.content))); } catch (_) {}
      var parsed = parseFrontmatter(raw);
      var d = parsed.data;
      editingSlug = slug;
      var isMemo = d.type === 'memo';
      editingDate = d.date || '';
      editingType = isMemo ? 'memo' : 'post';
      setEditMode(isMemo ? 'memo' : 'post');
      portalRoot.querySelector('#edit-title').value = d.title || '';
      var dt = d.date ? new Date(String(d.date).replace(' ', 'T')) : null;
      portalRoot.querySelector('#edit-date').value = (dt && !isNaN(dt.getTime()))
        ? dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate()) + 'T' + pad2(dt.getHours()) + ':' + pad2(dt.getMinutes())
        : '';
      syncDatePlaceholder();
      portalRoot.querySelector('#edit-slug').value = slug;
      portalRoot.querySelector('#edit-category').value = d.category || '';
      portalRoot.querySelector('#edit-tags').value = Array.isArray(d.tags) ? d.tags.join(', ') : String(d.tags || '');
      portalRoot.querySelector('#edit-excerpt').value = d.excerpt || '';
      portalRoot.querySelector('#edit-banner').value = d.banner || '';
      portalRoot.querySelector('#memo-text').value = isMemo ? parsed.body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim() : '';
      portalRoot.querySelector('#memo-loc').value = isMemo ? (d.location || '') : '';
      // 提取 memo 图片
      memoPhotos = [];
      if (isMemo) {
        var re = /!\[[^\]]*\]\(([^)]+)\)/g;
        var m;
        while ((m = re.exec(parsed.body)) !== null) {
          memoPhotos.push({ url: m[1], name: m[1].split('/').pop() });
        }
      }
      renderMemoPhotos();
      portalRoot.querySelector('#edit-body').value = parsed.body;
      setEditorView('edit');
      switchTab('edit');
      window.scrollTo(0, 0);
    }).catch(function (e) {
      toast('读取文章失败: ' + e.message, true);
    });
  }

  // =================================================================
  // 编辑器模式
  // =================================================================
  function setEditMode(mode) {
    editMode = mode;
    portalRoot.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.mode === mode);
    });
    var isPost = mode === 'post';
    portalRoot.querySelector('#post-fields').style.display = isPost ? '' : 'none';
    portalRoot.querySelector('#memo-fields').style.display = isPost ? 'none' : '';
    // 朋友圈式发说说的顶栏自带 取消/发表，隐藏底部共用按钮行
    var actions = portalRoot.querySelector('.portal-edit-actions');
    if (actions) actions.hidden = !isPost;
    if (!isPost) renderMemoPhotos(); // 确保九宫格 "+" 格已渲染
  }

  // 编辑/预览切换：编辑 = Markdown 文本框，预览 = marked 渲染
  function setEditorView(view) {
    editorView = view;
    var body = portalRoot.querySelector('#edit-body');
    var preview = portalRoot.querySelector('#edit-preview-md');
    if (!body || !preview) return;
    portalRoot.querySelectorAll('.view-switch .view-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === view);
    });
    if (view === 'preview') {
      body.hidden = true;
      loadMarked().then(function (md) {
        if (editorView !== 'preview') return; // 用户已切回编辑
        preview.innerHTML = md ? md.parse(body.value || '') : '<p>' + esc(body.value || '') + '</p>';
        preview.hidden = false;
      });
    } else {
      preview.hidden = true;
      body.hidden = false;
    }
  }


  // =================================================================
  // 保存
  // =================================================================
  function savePost() {
    if (editMode === 'post') {
      savePostMode();
    } else {
      saveMemoMode();
    }
  }

  function savePostMode() {
    var title = portalRoot.querySelector('#edit-title').value.trim();
    if (!title) { toast('请填写标题', true); return; }
    var body = portalRoot.querySelector('#edit-body').value.replace(/\r\n/g, '\n');
    var slug = safeSlug(portalRoot.querySelector('#edit-slug').value) ||
      safeSlug(title.toLowerCase().replace(/\s+/g, '-')) ||
      'post-' + Date.now();
    var md = buildPostMarkdown({
      title: title,
      date: portalRoot.querySelector('#edit-date').value
        ? portalRoot.querySelector('#edit-date').value.replace('T', ' ') + ':00+08:00'
        : (function () {
            var n = new Date();
            return n.getFullYear() + '-' + pad2(n.getMonth() + 1) + '-' + pad2(n.getDate()) +
              ' ' + pad2(n.getHours()) + ':' + pad2(n.getMinutes()) + ':00+08:00';
          })(),
      slug: slug,
      type: 'post',
      category: portalRoot.querySelector('#edit-category').value.trim() || '小作文',
      tags: portalRoot.querySelector('#edit-tags').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
      excerpt: portalRoot.querySelector('#edit-excerpt').value.trim(),
      banner: portalRoot.querySelector('#edit-banner').value.trim(),
      body: body,
    });
    commitPost(slug, md, title);
  }

  // 恢复定位按钮状态
  function locateReset(btn, oldText) {
    btn.disabled = false;
    btn.innerHTML = oldText;
  }

  // 高德 IP 定位兜底：国内安卓浏览器（含 PWA）网页定位依赖谷歌服务常被墙，
  // 失败时改用高德 IP 定位（只到城市级，用户可手动补充区县）
  // diag 数组收集各环节失败原因，全链路失败时展示给用户反馈
  function ipLocate(btn, oldText, note, diag) {
    return fetch('https://restapi.amap.com/v3/ip?key=' + AMAP_KEY)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var city = Array.isArray(d.city) ? '' : (d.city || '');
        var text = [d.province, city].filter(function (x) { return x && typeof x === 'string'; }).join(' ');
        if (d.status !== '1' || !text) {
          diag.push('IP:' + (d.info || '无结果'));
          return false;
        }
        portalRoot.querySelector('#memo-loc').value = text;
        toast((note ? note + '，' : '') + '网络定位到：' + text + '（可手动补充区县）');
        locateReset(btn, oldText);
        return true;
      })
      .catch(function () {
        diag.push('IP:网络失败');
        return false;
      });
  }

  // 全链路失败：显示版本号 + 各环节原因（方便远程排查）
  function failAll(btn, oldText, diag) {
    var ver = (document.querySelector('meta[name="build-version"]') || {}).content || '';
    var tag = ver.length >= 19 ? ver.slice(5, 10) + ' ' + ver.slice(11, 19) : 'unknown';
    toast('自动定位失败[' + tag + ' ' + diag.join('；') + ']，请手动输入位置', true);
    locateReset(btn, oldText);
  }

  // 高德 JS API 2.0 定位（国内最可靠：不走被墙的谷歌服务；含精确定位 + 城市级兜底）
  function amapJsLocate() {
    function loadScript() {
      if (window.AMap) return Promise.resolve();
      // 2021-12 之后申请的 JS Key 必须配安全密钥（官方要求：必须在脚本加载之前设置）
      if (AMAP_JS_CODE) {
        window._AMapSecurityConfig = { securityJsCode: AMAP_JS_CODE };
      }
      return new Promise(function (resolve, reject) {
        var sc = document.createElement('script');
        sc.src = 'https://webapi.amap.com/maps?v=2.0&key=' + AMAP_JS_KEY;
        sc.onload = function () { resolve(); };
        sc.onerror = function () { reject(new Error('高德 JS 加载失败')); };
        document.head.appendChild(sc);
      });
    }
    function plugin(name) {
      return new Promise(function (resolve) { AMap.plugin(name, function () { resolve(); }); });
    }
    return loadScript().then(function () { return plugin('AMap.Geolocation'); }).then(function () {
      return new Promise(function (resolve, reject) {
        var geo = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
        geo.getCurrentPosition(function (status, result) {
          if (status === 'complete' && result && result.position) {
            resolve({ type: 'loc', loc: result.position.lng.toFixed(6) + ',' + result.position.lat.toFixed(6) });
            return;
          }
          // 精确定位失败 → 高德城市级兜底（基站/IP，走高德自有服务）
          if (typeof geo.getCityInfo === 'function') {
            geo.getCityInfo(function (s2, r2) {
              if (s2 === 'complete' && r2 && (r2.province || r2.city)) {
                resolve({ type: 'city', text: [r2.province, r2.city].filter(function (x) { return x && typeof x === 'string'; }).join(' ') });
              } else {
                reject(new Error((r2 && r2.message) || 'AMap 定位失败'));
              }
            });
            return;
          }
          reject(new Error('AMap 定位失败'));
        });
      });
    });
  }

  // 高德自动定位：优先 GPS（WGS-84 → GCJ-02 → 逆地理到区/县）；失败退回 IP 定位（城市级）
  function locateAmap(btn) {
    if (!AMAP_KEY) { toast('定位服务未配置', true); return; }
    if (!navigator.geolocation) { ipLocate(btn, btn.innerHTML, '浏览器不支持定位', ['GPS:不支持']); return; }
    var oldText = btn.innerHTML;
    var diag = [];
    btn.disabled = true;
    btn.textContent = '…';
    function failAllNow() { failAll(btn, oldText, diag); }
    // 有 JS Key 时优先走高德 JS 定位（GCJ-02 直出，免坐标转换）
    if (AMAP_JS_KEY) {
      amapJsLocate().then(function (r) {
        if (r.type === 'city') {
          // 城市级兜底结果（高德基站/IP）
          portalRoot.querySelector('#memo-loc').value = r.text;
          toast('网络定位到：' + r.text + '（可手动补充区县）');
          locateReset(btn, oldText);
          return;
        }
        return fetch('https://restapi.amap.com/v3/geocode/regeo?key=' + AMAP_KEY + '&location=' + r.loc)
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d.status !== '1' || !d.regeocode) throw new Error('地名解析失败');
            var a = d.regeocode.addressComponent || {};
            var text = [a.province, a.city, a.district].filter(function (x) { return x && typeof x === 'string'; }).join(' ');
            if (!text) throw new Error('未获取到地名');
            portalRoot.querySelector('#memo-loc').value = text;
            toast('已定位：' + text);
            locateReset(btn, oldText);
          });
      }).catch(function (e) {
        diag.push('JS:' + (e && e.message ? e.message : '未知'));
        ipLocate(btn, oldText, '高德定位失败', diag).then(function (ok) { if (!ok) failAllNow(); });
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var ll = pos.coords.longitude.toFixed(6) + ',' + pos.coords.latitude.toFixed(6);
      fetch('https://restapi.amap.com/v3/assistant/coordinate/convert?key=' + AMAP_KEY + '&locations=' + ll + '&coordsys=gps')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.status !== '1' || !d.locations) { diag.push('GPS:转换失败'); throw new Error('x'); }
          return fetch('https://restapi.amap.com/v3/geocode/regeo?key=' + AMAP_KEY + '&location=' + d.locations).then(function (r) { return r.json(); });
        })
        .then(function (d) {
          if (d.status !== '1' || !d.regeocode) { diag.push('GPS:解析失败'); throw new Error('x'); }
          var a = d.regeocode.addressComponent || {};
          var text = [a.province, a.city, a.district].filter(function (x) { return x && typeof x === 'string'; }).join(' ');
          if (!text) { diag.push('GPS:无地名'); throw new Error('x'); }
          portalRoot.querySelector('#memo-loc').value = text;
          toast('已定位：' + text);
          locateReset(btn, oldText);
        })
        .catch(function () { ipLocate(btn, oldText, '精确定位失败', diag).then(function (ok) { if (!ok) failAllNow(); }); });
    }, function (err) {
      if (err && err.code === 1) { // 用户拒绝授权：不偷偷用 IP 定位
        toast('你拒绝了定位授权，可手动输入位置', true);
        locateReset(btn, oldText);
        return;
      }
      diag.push('GPS:' + (err && err.code === 3 ? '超时' : '不可用(code' + err.code + ')'));
      ipLocate(btn, oldText, '', diag).then(function (ok) { if (!ok) failAllNow(); });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  function saveMemoMode() {
    var text = portalRoot.querySelector('#memo-text').value.trim();
    if (!text && !memoPhotos.length) { toast('写点什么或传张图吧', true); return; }
    var btn = portalRoot.querySelector('#btn-memo-publish');
    var staged = memoPhotos.filter(function (p) { return p.staged && !p.uploaded; });

    // 第二段：全部图片就位后提交文章
    var doPublish = function () {
      var photoMd = memoPhotos.map(function (p) {
        return '![' + (p.name || 'image').replace(/\.[^.]+$/, '') + '](' + p.url + ')';
      }).join('\n');
      var body = text + (text && photoMd ? '\n\n' : '') + photoMd;
      var slug, dateStr;
      if (editingSlug && editingType === 'memo') {
        // 编辑已有说说：原地更新，复用原 slug 和原发布时间
        slug = editingSlug;
        dateStr = editingDate;
      }
      if (!slug) {
        var now = new Date();
        slug = 'memo-' + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) +
          '-' + pad2(now.getHours()) + pad2(now.getMinutes());
        dateStr = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) +
          ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':00+08:00';
      }
      var locVal = portalRoot.querySelector('#memo-loc').value.trim();
      if (locVal) writeLS(LS.last_loc, locVal); // 记住本次位置，下次自动填入
      var md = buildPostMarkdown({
        title: text.slice(0, 40) || 'memo',
        date: dateStr,
        slug: slug,
        type: 'memo',
        category: '碎碎念',
        location: locVal,
        tags: [],
        excerpt: '',
        banner: '',
        body: body,
      });
      commitPost(slug, md, text.slice(0, 40) || 'memo');
    };

    // 第一段：暂存图片统一上传（预留的文件名幂等，失败重试不产生重复）
    if (!staged.length) { doPublish(); return; }
    btn.disabled = true;
    var n = staged.length, done = 0;
    btn.textContent = '上传图片 0/' + n + ' …';
    Promise.all(staged.map(function (p) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          gh('/repos/' + state.repo + '/contents/' + IMG_DIR + '/' + p.dir + '/' + p.name, {
            method: 'PUT',
            body: { message: 'Upload image: ' + p.name, content: String(reader.result).split(',')[1] || '' },
          }).then(function () {
            p.url = ASSET_PREFIX + p.dir + '/' + p.name;
            p.rawUrl = rawImgUrl(IMG_DIR + '/' + p.dir + '/' + p.name);
            p.uploaded = true;
            done++;
            btn.textContent = '上传图片 ' + done + '/' + n + ' …';
            resolve();
          }, reject);
        };
        reader.onerror = reject;
        reader.readAsDataURL(p.blob);
      });
    })).then(function () {
      btn.textContent = '提交中…';
      doPublish();
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = '发表';
      toast('图片上传失败，请重试：' + (e && e.message ? e.message : '网络错误'), true);
    });
  }

  function commitPost(slug, md, title) {
    var btn = portalRoot.querySelector('#btn-save-post');
    var memoBtn = portalRoot.querySelector('#btn-memo-publish');
    if (btn) btn.disabled = true;
    if (memoBtn) memoBtn.disabled = true;
    var path = POSTS_DIR + '/' + slug + '.md';
    var msg = (editingSlug ? 'Update post: ' : 'New post: ') + slug;
    getFile(path).then(function (fileData) {
      return updateFile(path, md, msg, fileData.sha);
    }).catch(function (e) {
      if (e.status === 404 || e.message.indexOf('Not Found') >= 0 || e.message.indexOf('404') >= 0) return putFile(path, md, msg);
      throw e;
    }).then(function () {
      if (btn) btn.disabled = false;
      if (memoBtn) memoBtn.disabled = false;
      toast('已发布，等待自动构建…');
      editingSlug = slug;
      loadPosts();
      checkStuckRuns();
      setTimeout(function () { switchTab('posts'); }, 1200);
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      if (memoBtn) { memoBtn.disabled = false; memoBtn.textContent = '发表'; }
      toast('发布失败: ' + e.message, true);
    });
  }

  // =================================================================
  // Images
  // =================================================================
  function loadAllImages() {
    return gh('/repos/' + state.repo + '/git/trees/main?recursive=1').then(function (tree) {
      var items = (tree.tree || []).filter(function (n) {
        // 头像池（avatars/）不算站点图片，不进 Images 页；墓碑挡住已删图片因目录缓存复活
        return n.type === 'blob' && n.path.indexOf(IMG_DIR + '/') === 0 && IMG_EXT.test(n.path) &&
          n.path.indexOf(IMG_DIR + '/avatars/') !== 0 && !localDeleted[n.path];
      });
      // 按文件名倒序：日期序号命名（2026.09.05-01）天然按时间排，最新的在最前
      allImages = items.map(function (n) {
        return {
          repoPath: n.path,
          name: n.path.split('/').pop(),
          url: imgUrl(n.path),
          rawUrl: rawImgUrl(n.path),
        };
      }).sort(function (a, b) {
        return b.name.localeCompare(a.name, undefined, { numeric: true }) || b.repoPath.localeCompare(a.repoPath);
      });
      return allImages;
    });
  }

  // 缩略图用站点 URL（SW 缓存加速），加载失败（刚上传还没部署）自动换 raw 直链兜底
  function fallbackToRaw(imgEl, rawUrl) {
    imgEl.addEventListener('error', function () {
      if (rawUrl && imgEl.src !== rawUrl) imgEl.src = rawUrl;
    }, { once: true });
  }

  function renderImages() {
    var grid = portalRoot.querySelector('#images-grid');
    grid.innerHTML = '';
    allImages.forEach(function (img) {
      var cell = document.createElement('div');
      cell.className = 'img-mini';
      cell.innerHTML =
        '<img src="' + esc(img.dataUrl || img.url) + '" alt="" loading="lazy">' +
        '<div class="img-mini-actions">' +
          '<button data-act="delimg" data-name="' + esc(img.name) + '" data-repopath="' + esc(img.repoPath) + '" type="button">删除</button>' +
        '</div>';
      fallbackToRaw(cell.querySelector('img'), img.dataUrl ? '' : img.rawUrl);
      grid.appendChild(cell);
    });
  }

  // 点击缩略图 → 黑底全屏查看大图，点任意处关闭
  function openLightbox(src) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:300;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
    var img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width:92vw;max-height:92vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.4);';
    overlay.appendChild(img);
    overlay.addEventListener('click', function () { overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // 压缩大图（手机原图动辄 3-8MB，是加载慢的主因）：
  // 长边压到 ≤1600px、转 JPEG 质量 0.85；GIF/SVG/小图/压不动的原图保持原样
  function compressImageFile(file) {
    return new Promise(function (resolve) {
      function fallback() { resolve({ name: file.name, blob: file }); }
      if (!/^image\//.test(file.type || '')) return fallback();
      if (/^image\/(gif|svg\+xml)$/.test(file.type)) return fallback();
      if (file.size <= 600 * 1024) return fallback();
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        try {
          var maxSide = 1600;
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          var scale = Math.min(1, maxSide / Math.max(w, h, 1));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(function (blob) {
            if (!blob || blob.size >= file.size) return fallback(); // 没收益就用原图
            resolve({ name: file.name.replace(/\.[^.]+$/, '') + '.jpg', blob: blob });
          }, 'image/jpeg', 0.85);
        } catch (_) { fallback(); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); fallback(); };
      img.src = url;
    });
  }

  // 发说说：选图只本地暂存（压缩 + 预留文件名 + dataUrl 预览），零网络等待，发表时统一上传
  function stageImagesForMemo(files) {
    return Promise.all(Array.prototype.slice.call(files || []).map(function (file) {
      return compressImageFile(file).then(function (f) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () {
            var ext = ((f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')) || 'jpg';
            var entry = {
              staged: true,
              blob: f.blob,
              dataUrl: String(reader.result),
              name: datedName(ext),
              dir: 'gallery',
            };
            memoPhotos.push(entry);
            resolve(entry);
          };
          reader.onerror = function () { resolve(null); };
          reader.readAsDataURL(f.blob);
        });
      });
    })).then(function (entries) { return entries.filter(Boolean); });
  }

  // 批量上传：先按顺序压缩，再按顺序分配日期序号文件名，并行提交
  // 返回 [{name, url, rawUrl, dataUrl}]
  function uploadImagesBatch(files, dir, progressEl) {
    var arr = Array.prototype.slice.call(files || []);
    if (!arr.length) return Promise.reject(new Error('未选择图片'));
    if (progressEl) { progressEl.hidden = false; progressEl.textContent = '处理中…'; }
    return Promise.all(arr.map(compressImageFile)).then(function (prepared) {
      if (progressEl) progressEl.textContent = '上传中 0/' + arr.length + ' …';
      var done = 0;
      var tasks = prepared.map(function (f) {
        var ext = ((f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')) || 'jpg';
        var safeName = datedName(ext); // 同步按选择顺序分配序号
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            var base64 = String(reader.result).split(',')[1] || '';
            gh('/repos/' + state.repo + '/contents/' + IMG_DIR + '/' + dir + '/' + safeName, {
              method: 'PUT',
              body: { message: 'Upload image: ' + safeName, content: base64 },
            }).then(function () {
              done++;
              if (progressEl) progressEl.textContent = '上传中 ' + done + '/' + arr.length + ' …';
              resolve({
                name: safeName,
                url: ASSET_PREFIX + dir + '/' + safeName,
                rawUrl: rawImgUrl(IMG_DIR + '/' + dir + '/' + safeName),
                dataUrl: String(reader.result),
              });
            }, reject);
          };
          reader.onerror = reject;
          reader.readAsDataURL(f.blob);
        });
      });
      return Promise.all(tasks);
    });
  }

  function uploadImages() {
    var input = portalRoot.querySelector('#img-file');
    var files = input.files;
    if (!files || !files.length) { toast('请选择图片', true); return; }
    var dir = 'gallery';
    var progress = portalRoot.querySelector('#img-progress');
    progress.hidden = false;
    uploadImagesBatch(files, dir, progress).then(function (results) {
      // 本地立即显示（dataUrl 秒显），不等目录 API/构建；刷新列表遇 GitHub 缓存旧数据会把新图"弄丢"，故不立即刷新
      results.forEach(function (r) {
        allImages.unshift({ repoPath: IMG_DIR + '/' + dir + '/' + r.name, name: r.name, url: r.url, rawUrl: r.rawUrl, dataUrl: r.dataUrl });
      });
      renderImages();
      progress.textContent = '上传完成';
      input.value = '';
      toast('图片已上传到 ' + dir + '/');
      _datedSeq.prefix = '';
      setTimeout(function () { progress.hidden = true; }, 1500);
    }).catch(function (e) {
      progress.textContent = '';
      toast('上传失败: ' + (e && e.message ? e.message : '未知错误'), true);
    });
  }

  // =================================================================
  // 图片选择面板（编辑器内插入/说说添加）
  // =================================================================
  function openPicker() {
    if (!allImages.length) {
      loadAllImages().then(function () { showPicker(); });
    } else {
      showPicker();
    }
  }

  function showPicker() {
    var overlay = document.createElement('div');
    overlay.className = 'portal-picker-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:200;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div class="portal-picker" style="background:var(--p-card,#fff);border-radius:14px;padding:16px;width:min(640px,92vw);max-height:78vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.2);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<b>添加图片</b>' +
          '<button type="button" class="portal-picker-close" style="border:0;background:none;font-size:18px;cursor:pointer;">✕</button>' +
        '</div>' +
        '<div class="upload-row" style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">' +
          '<button type="button" class="portal-btn" id="picker-browse">上传图片</button>' +
          '<span style="font-size:13px;color:#6e6e73;" id="picker-file-name">选取文件：未选择文件</span>' +
          '<input type="file" id="picker-file" multiple accept="image/*" style="display:none">' +
        '</div>' +
        '<div id="picker-progress" style="font-size:13px;color:#6e6e73;margin-bottom:8px;" hidden></div>' +
        '<div style="font-size:13px;color:#6e6e73;margin-bottom:8px;">或选择已有图片：</div>' +
        '<div class="picker-grid" id="picker-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('.portal-picker-close').addEventListener('click', function () {
      overlay.remove();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    var grid = overlay.querySelector('#picker-grid');
    grid.innerHTML = '';
    allImages.slice(0, 40).forEach(function (img) {
      var item = document.createElement('div');
      item.className = 'picker-item';
      item.style.cssText = 'cursor:pointer;border:2px solid transparent;border-radius:8px;overflow:hidden;';
      item.innerHTML =
        '<img src="' + esc(img.url) + '" alt="" style="width:100%;height:80px;object-fit:cover;display:block;">' +
        '<div style="font-size:10px;color:#6e6e73;padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(img.name) + '</div>';
      fallbackToRaw(item.querySelector('img'), img.rawUrl);
      item.addEventListener('click', function () {
        useImage(img.url, img.rawUrl || img.url, img.name);
        overlay.remove();
      });
      grid.appendChild(item);
    });

    var browse = overlay.querySelector('#picker-browse');
    var fileInput = overlay.querySelector('#picker-file');
    browse.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var files = fileInput.files;
      if (!files || !files.length) return;
      overlay.querySelector('#picker-file-name').textContent = '选取文件：' + Array.from(files).map(function (f) { return f.name; }).join(', ');
      // 说说模式：只本地暂存（压缩 + dataUrl 预览 + 预留文件名），零网络等待，发表时统一上传
      if (editMode === 'memo') {
        overlay.querySelector('#picker-file-name').textContent = '暂存中…';
        stageImagesForMemo(files).then(function (entries) {
          renderMemoPhotos();
          overlay.querySelector('#picker-file-name').textContent = '已暂存 ' + entries.length + ' 张图片，发表时统一上传';
        });
        return;
      }
      var dir = safeSlug(editingSlug) || safeSlug(portalRoot.querySelector('#edit-slug').value) || 'gallery';
      var progress = overlay.querySelector('#picker-progress');
      progress.hidden = false;
      uploadImagesBatch(files, dir, progress)
        .then(function (results) {
          progress.textContent = '上传完成';
          results.forEach(function (r) {
            useImage(r.url, r.rawUrl || r.url, r.name, r.dataUrl);
            // 立即把新图加进 allImages，重开弹层即可见
            allImages.unshift({ repoPath: IMG_DIR + '/' + dir + '/' + r.name, name: r.name, url: r.url, rawUrl: r.rawUrl, dataUrl: r.dataUrl });
          });
          if (document.body.contains(overlay)) {
            // 重新渲染 picker 网格（新图出现在最前）
            var grid2 = overlay.querySelector('#picker-grid');
            if (grid2) {
              grid2.innerHTML = '';
              allImages.slice(0, 40).forEach(function (img) {
                var item = document.createElement('div');
                item.className = 'picker-item';
                item.style.cssText = 'cursor:pointer;border:2px solid transparent;border-radius:8px;overflow:hidden;';
                item.innerHTML = '<img src="' + esc(img.url) + '" alt="" style="width:100%;height:80px;object-fit:cover;display:block;">' +
                  '<div style="font-size:10px;color:#6e6e73;padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(img.name) + '</div>';
                fallbackToRaw(item.querySelector('img'), img.rawUrl);
                item.addEventListener('click', function () { useImage(img.url, img.rawUrl || img.url, img.name); overlay.remove(); });
                grid2.appendChild(item);
              });
            }
          }
          renderImages();
          _datedSeq.prefix = '';
          toast('已添加 ' + results.length + ' 张图片');
          setTimeout(function () { if (document.body.contains(overlay)) overlay.remove(); }, 600);
        }).catch(function (e) {
          progress.textContent = '';
          toast('上传失败: ' + (e && e.message ? e.message : '未知错误'), true);
        });
    });
  }

  function useImage(siteUrl, rawUrl, name, dataUrl) {
    if (editMode === 'post') {
      // Markdown 光标处插入图片语法；若当前在预览则切回编辑
      setEditorView('edit');
      var ta = portalRoot.querySelector('#edit-body');
      var mdText = '\n![' + (name || 'image') + '](' + siteUrl + ')\n';
      var start = typeof ta.selectionStart === 'number' ? ta.selectionStart : ta.value.length;
      var end = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : ta.value.length;
      ta.setRangeText(mdText, start, end, 'end');
      ta.focus();
    } else {
      // 说说模式：加入集中图集
      memoPhotos.push({ url: siteUrl, rawUrl: rawUrl || siteUrl, name: name, dataUrl: dataUrl || '' });
      renderMemoPhotos();
    }
  }

  function renderMemoPhotos() {
    var box = portalRoot.querySelector('#memo-photos');
    box.innerHTML = '';
    memoPhotos.forEach(function (p, idx) {
      var cell = document.createElement('div');
      cell.className = 'memo-photo';
      cell.innerHTML = '<img src="' + esc(p.dataUrl || p.url) + '" alt="">' +
        '<button class="memo-photo-rm" type="button">✕</button>';
      fallbackToRaw(cell.querySelector('img'), p.rawUrl || '');
      cell.querySelector('.memo-photo-rm').addEventListener('click', function () {
        memoPhotos.splice(idx, 1);
        renderMemoPhotos();
      });
      box.appendChild(cell);
    });
    // 微信式 "+" 格
    var add = document.createElement('div');
    add.className = 'memo-photo-add';
    add.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i>';
    box.appendChild(add);
  }

  // =================================================================
  // Status
  // =================================================================
  // 构建队列自愈：连续快速删除/发布时 GitHub 偶发把一次构建挂住（占住队列），
  // 自动取消多余的、只留最新一条；最新一条也卡住（>5 分钟）则取消并重新触发构建
  function checkStuckRuns() {
    if (!state.token) return;
    gh('/repos/' + state.repo + '/actions/runs?per_page=8').then(function (d) {
      var runs = (d.workflow_runs || []).filter(function (r) {
        return r.status === 'in_progress' || r.status === 'pending' || r.status === 'queued';
      });
      if (!runs.length) return; // runs 按创建时间倒序，最新在前
      var now = Date.now();
      var STUCK_MS = 5 * 60 * 1000;
      var cancelList = runs.slice(1); // 除最新外的活跃构建（新构建已取代它们，属漏网之鱼）
      var needRedispatch = false;
      var newestAge = now - Date.parse(runs[0].created_at);
      if (newestAge > STUCK_MS) { // 最新一条也卡住：取消并重新触发
        cancelList.push(runs[0]);
        needRedispatch = true;
      }
      if (!cancelList.length) return;
      return Promise.all(cancelList.map(function (r) {
        return gh('/repos/' + state.repo + '/actions/runs/' + r.id + '/cancel', { method: 'POST' })
          .catch(function () { /* 已自然结束等情况忽略 */ });
      })).then(function () {
        toast('检测到 ' + cancelList.length + ' 个卡住的构建，已自动解除');
        if (needRedispatch) {
          return gh('/repos/' + state.repo + '/actions/workflows/' + WORKFLOW + '/dispatches', {
            method: 'POST',
            body: { ref: 'main' },
          });
        }
      }).catch(function () { /* 静默 */ });
    }).catch(function () { /* 静默 */ });
  }

  function loadStatus() {
    gh('/repos/' + state.repo + '/commits?per_page=1').then(function (commits) {
      var c = commits && commits[0];
      portalRoot.querySelector('#status-commit').textContent = c
        ? (c.sha.slice(0, 7) + ' ' + (c.commit.message || '').split('\n')[0])
        : '-';
    }).catch(function () {
      portalRoot.querySelector('#status-commit').textContent = '获取失败';
    });
    gh('/repos/' + state.repo + '/actions/workflows/' + WORKFLOW + '/runs?per_page=3').then(function (data) {
      var runs = data.workflow_runs || [];
      if (!runs.length) {
        portalRoot.querySelector('#status-build').textContent = 'No runs yet';
        return;
      }
      var latest = runs[0];
      portalRoot.querySelector('#status-build').textContent =
        (latest.status === 'completed' ? (latest.conclusion || 'completed') : latest.status) +
        ' @ ' + latest.head_sha.slice(0, 7);
    }).catch(function () {
      portalRoot.querySelector('#status-build').textContent = '获取失败';
    });
  }

  function rebuildSite() {
    var btn = portalRoot.querySelector('#btn-rebuild');
    btn.disabled = true;
    gh('/repos/' + state.repo + '/actions/workflows/' + WORKFLOW + '/dispatches', {
      method: 'POST',
      body: { ref: 'main' },
    }).then(function () {
      toast('已触发重新构建');
      setTimeout(loadStatus, 1500);
    }).catch(function (e) {
      toast('触发失败: ' + e.message, true);
    }).finally(function () {
      btn.disabled = false;
    });
  }

  // =================================================================
  // Posts 列表事件（Edit/Delete）
  // =================================================================
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('#portal-root .post-item-actions button[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;
    var slug = btn.dataset.slug;
    if (act === 'edit') {
      if (!state.token) { toast('请先登录', true); return; }
      loadPostForEdit(slug);
    }
    if (act === 'delete') {
      if (!window.confirm('确定删除文章 ' + slug + ' 吗？')) return;
      // 先从本地移除并立即重渲染（目录 API 有缓存，删除后立刻拉列表可能仍含已删文件导致 404）
      var idx = -1, removed = null;
      allPosts.forEach(function (p, i) { if (p.slug === slug) idx = i; });
      if (idx >= 0) {
        removed = allPosts[idx];
        allPosts.splice(idx, 1);
        var q = (portalRoot.querySelector('#posts-search') || {}).value || '';
        renderPosts(allPosts, q.trim().toLowerCase());
      }
      getFile(POSTS_DIR + '/' + slug + '.md').then(function (fileData) {
        return deleteFile(POSTS_DIR + '/' + slug + '.md', 'Delete post: ' + slug, fileData.sha);
      }).then(function () {
        toast('已删除');
        loadPosts();
      }).catch(function (err) {
        if (removed) {
          allPosts.push(removed);
          allPosts.sort(function (a, b) { return (b.dateMs || 0) - (a.dateMs || 0); });
          var q2 = (portalRoot.querySelector('#posts-search') || {}).value || '';
          renderPosts(allPosts, q2.trim().toLowerCase());
        }
        toast('删除失败: ' + err.message, true);
      });
    }
  });


  // ---------- 初始化 ----------
  function init() {
    // 博客框架内页面（存在 #portal-root 挂载点，如 portal.html）：直接挂载；
    // 否则保留 hash 站内视图路由
    if (document.getElementById('portal-root')) {
      mountPortal();
    } else {
      window.addEventListener('hashchange', route);
      route();
    }
  }

  init();
})();
