/* Blog Portal — 纯前端管理面板，通过 GitHub REST API 操作仓库中的文章与图片 */
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

  var state = { token: '', repo: '', author: '' };
  var currentPostSlug = null; // 编辑中的文章 slug
  var currentImgSlug = ''; // 当前浏览图片目录

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
    btnNewPost: $('btn-new-post'),
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
    btnCancelEdit: $('btn-cancel-edit'),
    btnSavePost: $('btn-save-post'),
    imgSlug: $('img-slug'),
    imgFile: $('img-file'),
    btnUpload: $('btn-upload'),
    imgProgress: $('img-progress'),
    imgDirLabel: $('img-dir-label'),
    imagesGrid: $('images-grid'),
    statusBuild: $('status-build'),
    statusCommit: $('status-commit'),
    btnRebuild: $('btn-rebuild'),
    btnCommit: $('btn-commit'),
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
      // 204 No Content（如 workflow_dispatch）没有响应体
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
      body: {
        message: message,
        content: btoa(unescape(encodeURIComponent(content))),
      },
    });
  }

  function updateFile(path, content, message, sha) {
    return gh('/repos/' + state.repo + '/contents/' + path, {
      method: 'PUT',
      body: {
        message: message,
        content: btoa(unescape(encodeURIComponent(content))),
        sha: sha,
      },
    });
  }

  function deleteFile(path, message, sha) {
    return gh('/repos/' + state.repo + '/contents/' + path, {
      method: 'DELETE',
      body: { message: message, sha: sha },
    });
  }

  // ---------- frontmatter 序列化（与 build.mjs 解析器兼容） ----------
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

  // ---------- 页面渲染 ----------
  function renderPosts(posts) {
    el.postsCount.textContent = posts.length + ' posts';
    el.postsList.innerHTML = '';
    posts.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'post-item';
      var typeBadge = p.type === 'memo'
        ? '<span class="post-item-type">memo</span>'
        : '';
      item.innerHTML =
        '<div class="post-item-main">' +
          '<div class="post-item-title">' + esc(p.title) + '</div>' +
          '<div class="post-item-meta">' + typeBadge + esc(p.slug) + ' · ' + esc(p.dateText) + '</div>' +
        '</div>' +
        '<div class="post-item-actions">' +
          '<button class="portal-btn" data-act="images" data-slug="' + esc(p.slug) + '" type="button">Images</button>' +
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
          var fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          var data = {};
          if (fm) {
            fm[1].split(/\r?\n/).forEach(function (line) {
              var idx = line.indexOf(':');
              if (idx < 0) return;
              data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
            });
          }
          return {
            slug: f.name.replace(/\.md$/, ''),
            title: data.title || f.name,
            type: data.type === 'memo' ? 'memo' : 'post',
            dateText: (data.date || '').slice(0, 10),
            sha: fileData.sha,
          };
        });
      }));
    }).then(function (posts) {
      posts.sort(function (a, b) { return b.dateText.localeCompare(a.dateText); });
      renderPosts(posts);
    }).catch(function (e) {
      toast('加载文章失败: ' + e.message, true);
      renderPosts([]);
    });
  }

  function fillEditForm(post) {
    currentPostSlug = post ? post.slug : '';
    el.edit.title.value = post ? post.title : '';
    el.edit.slug.value = post ? post.slug : '';
    el.edit.type.value = post && post.type === 'memo' ? 'memo' : 'post';
    el.edit.category.value = post ? (post.category || '') : '';
    el.edit.tags.value = post && post.tags ? post.tags.join(', ') : '';
    el.edit.excerpt.value = post ? (post.excerpt || '') : '';
    el.edit.banner.value = post ? (post.banner || '') : '';
    el.edit.body.value = post ? post.body : '';
    var d = post && post.date ? new Date(post.date.replace(' ', 'T')) : new Date();
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    el.edit.date.value = isNaN(d.getTime())
      ? ''
      : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function loadPostForEdit(slug) {
    getFile(POSTS_DIR + '/' + slug + '.md').then(function (fileData) {
      var raw = '';
      try { raw = decodeURIComponent(escape(atob(fileData.content))); } catch (_) {}
      var fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
      var data = {};
      var body = raw;
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
      fillEditForm({
        slug: slug,
        title: data.title || '',
        date: data.date || '',
        type: data.type || 'post',
        category: data.category || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        excerpt: data.excerpt || '',
        banner: data.banner || '',
        body: body.replace(/^\r?\n/, ''),
      });
      showView('edit');
      window.scrollTo(0, 0);
    }).catch(function (e) {
      toast('读取文章失败: ' + e.message, true);
    });
  }

  function safeSlug(s) {
    return String(s || '').trim().replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
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
    var msg = 'Post: ' + slug;

    el.btnSavePost.disabled = true;
    // 若已存在则先取 sha
    getFile(path).then(function (fileData) {
      return updateFile(path, md, msg, fileData.sha);
    }).catch(function (e) {
      if (e.message.indexOf('404') >= 0) {
        return putFile(path, md, msg);
      }
      throw e;
    }).then(function () {
      toast('已保存并提交，等待自动构建…');
      el.btnSavePost.disabled = false;
      loadPosts();
      showView('posts');
    }).catch(function (e) {
      el.btnSavePost.disabled = false;
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

  // ---------- Images ----------
  function renderImages(files) {
    el.imagesGrid.innerHTML = '';
    var safeSlugEnc = encodeURIComponent(safeSlug(currentImgSlug));
    (files || []).forEach(function (f) {
      var cell = document.createElement('div');
      cell.className = 'img-cell';
      var ext = f.name.toLowerCase();
      var isImg = /\.(png|jpe?g|gif|webp|svg|avif)$/.test(ext);
      var src = isImg ? ('/assets/img/' + safeSlugEnc + '/' + encodeURIComponent(f.name)) : '';
      cell.innerHTML =
        (isImg ? '<img src="' + src + '" alt="" loading="lazy">' : '<div class="img-cell-name">' + esc(f.name) + '</div>') +
        '<div class="img-cell-name">' + esc(f.name) + '</div>' +
        '<div class="img-cell-actions">' +
          '<button class="portal-btn" data-act="copymd" data-name="' + esc(f.name) + '" type="button">Copy MD</button>' +
          '<button class="portal-btn" data-act="delimg" data-name="' + esc(f.name) + '" data-sha="' + esc(f.sha) + '" type="button">Delete</button>' +
        '</div>';
      el.imagesGrid.appendChild(cell);
    });
  }

  function loadImages(slug) {
    currentImgSlug = slug;
    el.imgSlug.value = slug;
    el.imgDirLabel.textContent = 'static/assets/img/' + slug + '/';
    listDir(IMG_DIR + '/' + slug).then(function (files) {
      renderImages(files || []);
    }).catch(function (e) {
      if (e.message.indexOf('404') >= 0) {
        renderImages([]);
      } else {
        toast('加载图片失败: ' + e.message, true);
      }
    });
  }

  function uploadImages() {
    var slug = el.imgSlug.value.trim();
    if (!slug) { toast('请填写 post slug', true); return; }
    var files = el.imgFile.files;
    if (!files || !files.length) { toast('请选择图片', true); return; }

    var tasks = [];
    for (var i = 0; i < files.length; i++) {
      (function (file) {
        tasks.push(new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            var base64 = String(reader.result).split(',')[1] || '';
            var safeName = file.name.replace(/[^\w.\-]/g, '_');
            var path = IMG_DIR + '/' + slug + '/' + safeName;
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

    el.btnUpload.disabled = true;
    el.imgProgress.hidden = false;
    el.imgProgress.textContent = '上传中 0/' + tasks.length + ' …';
    var done = 0;
    tasks.forEach(function (task) {
      task.then(function () {
        done++;
        el.imgProgress.textContent = '上传中 ' + done + '/' + tasks.length + ' …';
        if (done === tasks.length) {
          el.imgProgress.textContent = '上传完成';
          el.btnUpload.disabled = false;
          el.imgFile.value = '';
          toast('图片已上传');
          loadImages(slug);
        }
      }, function (e) {
        el.btnUpload.disabled = false;
        el.imgProgress.textContent = '';
        toast('上传失败: ' + e.message, true);
      });
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
      var status = latest.status === 'completed'
        ? latest.conclusion || 'completed'
        : latest.status;
      el.statusBuild.textContent = status + ' @ ' + latest.head_sha.slice(0, 7);
    }).catch(function (e) {
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
      if (name === 'posts') loadPosts();
      if (name === 'images') loadImages(currentImgSlug || '');
      if (name === 'status') loadStatus();
      if (name === 'edit' && !currentPostSlug) fillEditForm(null);
    });
  });

  el.signin.addEventListener('click', signIn);
  el.signout.addEventListener('click', signOut);
  el.btnNewPost.addEventListener('click', function () {
    currentPostSlug = '';
    fillEditForm(null);
    showView('edit');
  });
  el.btnCancelEdit.addEventListener('click', function () {
    showView('posts');
  });
  el.btnSavePost.addEventListener('click', savePost);

  el.postsList.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;
    var slug = btn.dataset.slug;
    if (act === 'edit') loadPostForEdit(slug);
    if (act === 'images') { showView('images'); loadImages(slug); }
    if (act === 'delete') deletePost(slug);
  });

  el.btnUpload.addEventListener('click', uploadImages);

  el.imagesGrid.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;
    var name = btn.dataset.name;
    if (act === 'copymd') {
      var md = '![' + name.replace(/\.[^.]+$/, '') + '](/assets/img/' + currentImgSlug + '/' + name + ')';
      (navigator.clipboard ? navigator.clipboard.writeText(md) : Promise.reject())
        .then(function () { toast('已复制 Markdown 引用'); })
        .catch(function () { toast('复制失败，请手动复制'); });
    }
    if (act === 'delimg') {
      if (!window.confirm('确定删除图片 ' + name + ' 吗？')) return;
      deleteFile(IMG_DIR + '/' + currentImgSlug + '/' + name, 'Delete image: ' + name, btn.dataset.sha)
        .then(function () { toast('已删除'); loadImages(currentImgSlug); })
        .catch(function (err) { toast('删除失败: ' + err.message, true); });
    }
  });

  el.btnRebuild.addEventListener('click', rebuildSite);
  el.btnCommit.addEventListener('click', function () {
    toast('文章/图片保存时已自动提交（Commit 由 GitHub API 完成）');
  });

  // ---------- 初始化 ----------
  applyAuth();
})();
