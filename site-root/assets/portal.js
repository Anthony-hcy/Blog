/* Blog Portal — 纯前端管理面板（GitHub REST API）
   重构版：双栏实时预览编辑器 + 图片自动插入 + 全部图片库 */
import { marked } from './marked.esm.js';

(function () {
  'use strict';

  var LS = {
    token: 'portal_auth_token',
    email: 'portal_auth_email',
    repo: 'portal_repo',
    author: 'portal_author',
  };

  var API = 'https://api.github.com';
  var POSTS_DIR = 'content/posts';
  var IMG_DIR = 'static/assets/img';
  var WORKFLOW = 'deploy.yml';
  var IMG_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
  // 站点基础路径（/Blog/portal.html → /Blog/）
  var BASE = location.pathname.replace(/portal\.html.*$/, '');
  var ASSET_PREFIX = BASE + 'assets/img/';

  var state = { token: '', repo: '', author: '' };
  var currentPostSlug = null;   // 编辑中的文章 slug（null = 新建）
  var allPosts = [];            // 全部文章缓存
  var allImages = [];           // 全部图片缓存（Tree API）
  var searchQuery = '';

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }
  var el = {
    tabs: $('portal-tabs'),
    account: $('portal-account'),
    signout: $('portal-signout'),
    views: {
      login: $('view-login'),
      posts: $('view-posts'),
      edit: $('view-edit'),
      images: $('view-images'),
      status: $('view-status'),
    },
    repo: $('portal-repo'),
    token: $('portal-token'),
    author: $('portal-author'),
    signin: $('portal-signin'),
    postsList: $('posts-list'),
    postsCount: $('posts-count'),
    postsSearch: $('posts-search'),
    btnNewPost: $('btn-new-post'),
    editorStatus: $('editor-status'),
    edit: {
      title: $('edit-title'),
      slug: $('edit-slug'),
      date: $('edit-date'),
      type: $('edit-type'),
      category: $('edit-category'),
      tags: $('edit-tags'),
      excerpt: $('edit-excerpt'),
      banner: $('edit-banner'),
      body: $('edit-body'),
    },
    editPreview: $('edit-preview'),
    btnInsertImage: $('btn-insert-image'),
    btnCancelEdit: $('btn-cancel-edit'),
    btnSavePost: $('btn-save-post'),
    imgSlug: $('img-slug'),
    imgFile: $('img-file'),
    btnBrowse: $('btn-browse'),
    imgFileName: $('img-file-name'),
    btnUpload: $('btn-upload'),
    imgProgress: $('img-progress'),
    imgTotal: $('img-total'),
    imagesGrid: $('images-grid'),
    statusBuild: $('status-build'),
    statusCommit: $('status-commit'),
    statusChanges: $('status-changes'),
    btnRebuild: $('btn-rebuild'),
    btnCommit: $('btn-commit'),
    picker: $('img-picker'),
    pickerScrim: $('img-picker-scrim'),
    pickerClose: $('img-picker-close'),
    pickerBrowse: $('picker-browse'),
    pickerFile: $('picker-file'),
    pickerFileName: $('picker-file-name'),
    pickerProgress: $('picker-progress'),
    pickerGrid: $('picker-grid'),
    toast: $('portal-toast'),
  };

  // ---------- 工具 ----------
  function toast(msg, isError) {
    el.toast.textContent = msg;
    el.toast.classList.toggle('is-error', !!isError);
    el.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.hidden = true; }, 3200);
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

  function formatDate(d) {
    if (!d) return '';
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function showView(name) {
    Object.keys(el.views).forEach(function (k) {
      el.views[k].hidden = k !== name;
    });
    document.querySelectorAll('.portal-tab').forEach(function (tab) {
      tab.classList.toggle('is-active', tab.dataset.tab === name);
    });
    // 编辑页放宽容器（.portal-shell.is-editing → max-width 960px）
    var shell = document.querySelector('.portal-shell');
    if (shell) shell.classList.toggle('is-editing', name === 'edit');
  }

  // 图片仓库路径 → 站点访问 URL
  function imgUrl(repoPath) {
    return ASSET_PREFIX + repoPath.replace(IMG_DIR + '/', '');
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
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function listDir(path) {
    return gh('/repos/' + state.repo + '/contents/' + path);
  }

  function getFile(path) {
    return gh('/repos/' + state.repo + '/contents/' + path);
  }

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

  // ---------- Posts ----------
  function renderPosts(posts) {
    var list = posts.filter(function (p) {
      if (!searchQuery) return true;
      return p.title.toLowerCase().indexOf(searchQuery) >= 0;
    });
    el.postsCount.textContent = list.length + ' / ' + posts.length + ' posts';
    el.postsList.innerHTML = '';
    list.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'post-item';
      item.innerHTML =
        '<div class="post-item-main">' +
          '<div class="post-item-title">' + esc(p.title) + '</div>' +
          '<div class="post-item-meta">' +
            '<span class="post-item-type">' + (p.type === 'memo' ? 'memo' : 'post') + '</span>' +
            '&nbsp;&nbsp;' + esc(p.dateFull || p.dateText) +
            (p.category ? '&nbsp;&nbsp;' + esc(p.category) : '') +
            '&nbsp;&nbsp;<span class="post-item-status">publish</span>' +
          '</div>' +
        '</div>' +
        '<div class="post-item-actions">' +
          '<button class="portal-btn" data-act="edit" data-slug="' + esc(p.slug) + '" type="button">Edit</button>' +
          '<button class="portal-btn" data-act="delete" data-slug="' + esc(p.slug) + '" type="button">Delete</button>' +
        '</div>';
      el.postsList.appendChild(item);
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
            category: d.category || '',
            tags: Array.isArray(d.tags) ? d.tags : [],
            excerpt: d.excerpt || '',
            banner: d.banner || '',
            body: parsed.body,
            sha: fileData.sha,
          };
        });
      }));
    }).then(function (posts) {
      allPosts = posts.sort(function (a, b) { return b.dateText.localeCompare(a.dateText); });
      renderPosts(allPosts);
    }).catch(function (e) {
      toast('加载文章失败: ' + e.message, true);
      renderPosts([]);
    });
  }

  function loadPostForEdit(slug) {
    getFile(POSTS_DIR + '/' + slug + '.md').then(function (fileData) {
      var raw = '';
      try { raw = decodeURIComponent(escape(atob(fileData.content))); } catch (_) {}
      var parsed = parseFrontmatter(raw);
      var d = parsed.data;
      currentPostSlug = slug;
      el.edit.title.value = d.title || '';
      el.edit.slug.value = slug;
      el.edit.type.value = d.type === 'memo' ? 'memo' : 'post';
      el.edit.category.value = d.category || '';
      el.edit.tags.value = Array.isArray(d.tags) ? d.tags.join(', ') : String(d.tags || '');
      el.edit.excerpt.value = d.excerpt || '';
      el.edit.banner.value = d.banner || '';
      el.edit.body.value = parsed.body;
      var dt = d.date ? new Date(String(d.date).replace(' ', 'T')) : new Date();
      var pad = function (n) { return n < 10 ? '0' + n : String(n); };
      el.edit.date.value = isNaN(dt.getTime())
        ? ''
        : dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + 'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
      el.editorStatus.textContent = 'Editing: ' + slug;
      updatePreview();
      showView('edit');
      window.scrollTo(0, 0);
    }).catch(function (e) {
      toast('读取文章失败: ' + e.message, true);
    });
  }

  function fillNewPostForm() {
    currentPostSlug = null;
    el.edit.title.value = '';
    el.edit.slug.value = '';
    el.edit.type.value = 'post';
    el.edit.category.value = '';
    el.edit.tags.value = '';
    el.edit.excerpt.value = '';
    el.edit.banner.value = '';
    el.edit.body.value = '';
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    el.edit.date.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    el.editorStatus.textContent = 'New post';
    updatePreview();
    showView('edit');
    window.scrollTo(0, 0);
  }

  function savePost() {
    var slug = safeSlug(el.edit.slug.value);
    if (!slug) { toast('请填写合法的 slug（仅限字母/数字/短横线）', true); return; }
    if (!el.edit.title.value.trim()) { toast('请填写标题', true); return; }

    var md = buildPostMarkdown({
      title: el.edit.title.value.trim(),
      date: el.edit.date.value ? el.edit.date.value.replace('T', ' ') + ':00+08:00' : formatDate(new Date()) + ' 10:00:00+08:00',
      slug: slug,
      type: el.edit.type.value,
      category: el.edit.category.value.trim(),
      tags: el.edit.tags.value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
      excerpt: el.edit.excerpt.value.trim(),
      banner: el.edit.banner.value.trim(),
      body: el.edit.body.value,
    });
    var path = POSTS_DIR + '/' + slug + '.md';
    var msg = (currentPostSlug ? 'Update post: ' : 'New post: ') + slug;

    el.btnSavePost.disabled = true;
    el.editorStatus.textContent = 'Saving…';
    getFile(path).then(function (fileData) {
      return updateFile(path, md, msg, fileData.sha);
    }).catch(function (e) {
      if (e.message.indexOf('404') >= 0) {
        return putFile(path, md, msg);
      }
      throw e;
    }).then(function () {
      el.btnSavePost.disabled = false;
      el.editorStatus.textContent = 'Saved ✓';
      toast('已保存并提交，等待自动构建…');
      loadPosts();
      currentPostSlug = slug;
      setTimeout(function () { el.editorStatus.textContent = 'Editing: ' + slug; }, 2500);
    }).catch(function (e) {
      el.btnSavePost.disabled = false;
      el.editorStatus.textContent = 'Save failed';
      toast('保存失败: ' + e.message, true);
    });
  }

  function deletePost(slug) {
    if (!window.confirm('确定删除文章 ' + slug + ' 吗？')) return;
    getFile(POSTS_DIR + '/' + slug + '.md').then(function (fileData) {
      return deleteFile(POSTS_DIR + '/' + slug + '.md', 'Delete post: ' + slug, fileData.sha);
    }).then(function () {
      toast('已删除');
      loadPosts();
    }).catch(function (e) {
      toast('删除失败: ' + e.message, true);
    });
  }

  // ---------- 编辑器预览 ----------
  var previewTimer = null;
  function updatePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      try {
        el.editPreview.innerHTML = marked.parse(el.edit.body.value || '');
      } catch (e) {
        el.editPreview.innerHTML = '<p style="color:var(--p-danger)">预览渲染失败</p>';
      }
    }, 200);
  }

  function insertMarkdownAtCursor(mdText) {
    var ta = el.edit.body;
    var start = typeof ta.selectionStart === 'number' ? ta.selectionStart : ta.value.length;
    var end = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : ta.value.length;
    ta.setRangeText(mdText, start, end, 'end');
    ta.focus();
    updatePreview();
  }

  // ---------- Images（全部图片库） ----------
  function loadAllImages() {
    return gh('/repos/' + state.repo + '/git/trees/main?recursive=1').then(function (tree) {
      var items = (tree.tree || []).filter(function (n) {
        return n.type === 'blob' &&
          n.path.indexOf(IMG_DIR + '/') === 0 &&
          IMG_EXT.test(n.path);
      });
      allImages = items.map(function (n) {
        return {
          repoPath: n.path,
          name: n.path.split('/').pop(),
          dir: n.path.replace(IMG_DIR + '/', '').replace(/\/[^/]+$/, ''),
          url: imgUrl(n.path),
        };
      }).sort(function (a, b) { return a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name); });
      return allImages;
    });
  }

  function renderImagesGrid(images) {
    el.imagesGrid.innerHTML = '';
    (images || []).forEach(function (img) {
      var cell = document.createElement('div');
      cell.className = 'img-cell';
      cell.innerHTML =
        '<img src="' + esc(img.url) + '" alt="" loading="lazy">' +
        '<div class="img-cell-name">' + esc(img.dir + '/' + img.name) + '</div>' +
        '<div class="img-cell-actions">' +
          '<button class="portal-btn" data-act="copymd" data-url="' + esc(img.url) + '" type="button">Copy MD</button>' +
          '<button class="portal-btn" data-act="toeditor" data-url="' + esc(img.url) + '" data-name="' + esc(img.name) + '" type="button">插入正文</button>' +
          '<button class="portal-btn" data-act="delimg" data-name="' + esc(img.name) + '" data-repopath="' + esc(img.repoPath) + '" type="button">Delete</button>' +
        '</div>';
      el.imagesGrid.appendChild(cell);
    });
  }

  function refreshImages() {
    loadAllImages().then(function (images) {
      el.imgTotal.textContent = '(' + images.length + ')';
      renderImagesGrid(images);
    }).catch(function (e) {
      toast('加载图片失败: ' + e.message, true);
    });
  }

  function uploadFiles(files, dir, progressEl) {
    if (!files || !files.length) { toast('请选择图片', true); return Promise.reject(); }
    var tasks = [];
    for (var i = 0; i < files.length; i++) {
      (function (file) {
        tasks.push(new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            var base64 = String(reader.result).split(',')[1] || '';
            var safeName = file.name.replace(/[^\w.\-]/g, '_');
            var path = IMG_DIR + '/' + dir + '/' + safeName;
            gh('/repos/' + state.repo + '/contents/' + path, {
              method: 'PUT',
              body: { message: 'Upload image: ' + safeName, content: base64 },
            }).then(resolve, reject);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }));
      })(files[i]);
    }
    var done = 0;
    if (progressEl) { progressEl.hidden = false; progressEl.textContent = '上传中 0/' + tasks.length + ' …'; }
    return Promise.all(tasks.map(function (task) {
      return task.then(function () {
        done++;
        if (progressEl) progressEl.textContent = '上传中 ' + done + '/' + tasks.length + ' …';
      });
    })).then(function () {
      if (progressEl) progressEl.textContent = '上传完成';
      return tasks.length;
    });
  }

  function uploadImagesMain() {
    var slug = safeSlug(el.imgSlug.value);
    var dir = slug || 'gallery';
    el.btnUpload.disabled = true;
    uploadFiles(el.imgFile.files, dir, el.imgProgress).then(function () {
      el.btnUpload.disabled = false;
      el.imgFile.value = '';
      el.imgFileName.textContent = '选取文件：未选择文件';
      toast('图片已上传到 ' + dir + '/');
      refreshImages();
    }).catch(function (e) {
      el.btnUpload.disabled = false;
      if (e && e.message) toast('上传失败: ' + e.message, true);
    });
  }

  // ---------- 图片选择面板（编辑器内插入） ----------
  function openPicker() {
    el.picker.hidden = false;
    el.pickerScrim.hidden = false;
    renderPickerGrid();
    // 若尚未加载过图片（首次打开），自动拉取
    if (!allImages.length) {
      loadAllImages().then(function () { renderPickerGrid(); }).catch(function () {});
    }
  }

  function closePicker() {
    el.picker.hidden = true;
    el.pickerScrim.hidden = true;
    el.pickerFile.value = '';
    el.pickerFileName.textContent = '选取文件：未选择文件';
    el.pickerProgress.hidden = true;
  }

  function renderPickerGrid() {
    el.pickerGrid.innerHTML = '';
    allImages.slice().reverse().slice(0, 24).forEach(function (img) {
      var item = document.createElement('div');
      item.className = 'picker-item';
      item.title = img.dir + '/' + img.name;
      item.innerHTML =
        '<img src="' + esc(img.url) + '" alt="" loading="lazy">' +
        '<div class="picker-item-name">' + esc(img.name) + '</div>';
      item.addEventListener('click', function () {
        var md = '![](' + img.url + ')';
        insertMarkdownAtCursor(md);
        closePicker();
      });
      el.pickerGrid.appendChild(item);
    });
  }

  function uploadFromPicker() {
    // 优先用当前编辑文章 slug（含新建时已填写的），否则 gallery
    var dir = safeSlug(currentPostSlug) || safeSlug(el.edit.slug.value) || 'gallery';
    el.pickerBrowse.disabled = true;
    uploadFiles(el.pickerFile.files, dir, el.pickerProgress).then(function (count) {
      el.pickerBrowse.disabled = false;
      el.pickerFile.value = '';
      el.pickerFileName.textContent = '选取文件：未选择文件';
      // 把刚上传的第一张插入光标处
      var uploadedName = '';
      // 从 Tree API 重新拉取后插入最新一张
      return loadAllImages().then(function () {
        renderPickerGrid();
        var last = allImages[allImages.length - 1];
        if (last && last.dir === dir) {
          insertMarkdownAtCursor('![](' + last.url + ')');
        }
      });
    }).catch(function (e) {
      el.pickerBrowse.disabled = false;
      if (e && e.message) toast('上传失败: ' + e.message, true);
    });
  }

  // ---------- Status ----------
  function loadStatus() {
    gh('/repos/' + state.repo + '/commits?per_page=1').then(function (commits) {
      var c = commits && commits[0];
      el.statusCommit.textContent = c
        ? (c.sha.slice(0, 7) + ' ' + (c.commit.message || '').split('\n')[0])
        : '-';
    }).catch(function () {
      el.statusCommit.textContent = '获取失败';
    });
    gh('/repos/' + state.repo + '/actions/workflows/' + WORKFLOW + '/runs?per_page=3').then(function (data) {
      var runs = data.workflow_runs || [];
      if (!runs.length) {
        el.statusBuild.textContent = 'No runs yet';
        return;
      }
      var latest = runs[0];
      el.statusBuild.textContent = (latest.status === 'completed' ? (latest.conclusion || 'completed') : latest.status) +
        ' @ ' + latest.head_sha.slice(0, 7);
    }).catch(function () {
      el.statusBuild.textContent = '获取失败';
    });
  }

  function rebuildSite() {
    el.btnRebuild.disabled = true;
    gh('/repos/' + state.repo + '/actions/workflows/' + WORKFLOW + '/dispatches', {
      method: 'POST',
      body: { ref: 'main' },
    }).then(function () {
      toast('已触发重新构建');
      setTimeout(loadStatus, 1500);
    }).catch(function (e) {
      toast('触发失败: ' + e.message, true);
    }).finally(function () {
      el.btnRebuild.disabled = false;
    });
  }

  // ---------- 登录/登出 ----------
  function applyAuth() {
    state.token = readLS(LS.token);
    state.repo = readLS(LS.repo);
    state.author = readLS(LS.author);
    var authed = !!(state.token && state.repo);
    el.tabs.hidden = !authed;
    el.signout.hidden = !authed;
    el.account.hidden = !authed;
    if (authed) {
      el.account.textContent = state.repo;
      showView('posts');
      loadPosts();
      refreshImages();
      loadStatus();
    } else {
      showView('login');
    }
  }

  function signIn() {
    var repo = el.repo.value.trim();
    var token = el.token.value.trim();
    var author = el.author.value.trim();
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

  // ---------- 事件绑定 ----------
  document.querySelectorAll('.portal-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var name = tab.dataset.tab;
      showView(name);
      if (name === 'posts') renderPosts(allPosts);
      if (name === 'edit') { if (!currentPostSlug && !el.edit.title.value) fillNewPostForm(); else updatePreview(); }
      if (name === 'images') refreshImages();
      if (name === 'status') loadStatus();
    });
  });

  el.signin.addEventListener('click', signIn);
  el.signout.addEventListener('click', signOut);
  el.btnNewPost.addEventListener('click', fillNewPostForm);
  el.btnCancelEdit.addEventListener('click', function () { showView('posts'); });
  el.btnSavePost.addEventListener('click', savePost);
  el.postsSearch.addEventListener('input', function () {
    searchQuery = el.postsSearch.value.trim().toLowerCase();
    renderPosts(allPosts);
  });

  // 编辑器正文输入 → 实时预览
  ['title', 'slug', 'type', 'category', 'tags', 'excerpt', 'banner', 'body'].forEach(function (field) {
    var node = el.edit[field];
    if (node && field === 'body') {
      node.addEventListener('input', updatePreview);
    }
  });

  el.postsList.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;
    var slug = btn.dataset.slug;
    if (act === 'edit') loadPostForEdit(slug);
    if (act === 'delete') deletePost(slug);
  });

  // Images 页操作
  el.btnBrowse.addEventListener('click', function () { el.imgFile.click(); });
  el.imgFile.addEventListener('change', function () {
    var files = el.imgFile.files;
    el.imgFileName.textContent = files && files.length
      ? '选取文件：' + Array.from(files).map(function (f) { return f.name; }).join(', ')
      : '选取文件：未选择文件';
  });
  el.btnUpload.addEventListener('click', uploadImagesMain);

  el.imagesGrid.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;
    if (act === 'copymd') {
      var md = '![](' + btn.dataset.url + ')';
      (navigator.clipboard ? navigator.clipboard.writeText(md) : Promise.reject())
        .then(function () { toast('已复制 Markdown 引用'); })
        .catch(function () { toast('复制失败，请手动复制'); });
    }
    if (act === 'toeditor') {
      var md2 = '![](' + btn.dataset.url + ')';
      insertMarkdownAtCursor(md2);
      showView('edit');
      toast('已插入到正文');
    }
    if (act === 'delimg') {
      if (!window.confirm('确定删除图片 ' + btn.dataset.name + ' 吗？')) return;
      var repoPath = btn.dataset.repopath;
      var dirPart = repoPath.replace(IMG_DIR + '/', '');
      var fileName = dirPart.split('/').pop();
      var dir = dirPart.replace('/' + fileName, '');
      getFile(repoPath).then(function (fd) {
        return deleteFile(repoPath, 'Delete image: ' + fileName, fd.sha);
      }).then(function () {
        toast('已删除');
        refreshImages();
      }).catch(function (err) { toast('删除失败: ' + err.message, true); });
    }
  });

  // 图片选择面板
  el.btnInsertImage.addEventListener('click', openPicker);
  el.pickerClose.addEventListener('click', closePicker);
  el.pickerScrim.addEventListener('click', closePicker);
  el.pickerBrowse.addEventListener('click', function () { el.pickerFile.click(); });
  el.pickerFile.addEventListener('change', function () {
    var files = el.pickerFile.files;
    el.pickerFileName.textContent = files && files.length
      ? '选取文件：' + Array.from(files).map(function (f) { return f.name; }).join(', ')
      : '选取文件：未选择文件';
    if (files && files.length) uploadFromPicker();
  });

  // Status
  el.btnRebuild.addEventListener('click', rebuildSite);
  el.btnCommit.addEventListener('click', function () {
    toast('文章/图片保存时已自动提交（Commit 由 GitHub API 完成）');
  });

  // ---------- 初始化 ----------
  applyAuth();
})();
