// 朋友圈：memo 风格渲染 FriendCircle 聚合数据（site-root/fcircle-data.json）
// 数据由 .github/workflows/fcircle-data.yml 每天 4 次采集更新
(function () {
  'use strict';

  // 站点子路径（/Blog/ 或 /），与 layout.js 的 pathBase 一致
  function pathBase() {
    var m = location.pathname.match(/^(\/[^/]+)?\//);
    return (m && m[1] ? m[1] : '') + '/';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var rootEl = document.getElementById('fcircle-root');
  var statsEl = document.getElementById('fcircle-stats');
  if (!rootEl) return;

  var articles = [];
  var sortRule = 'created'; // created | updated

  function render() {
    var sorted = articles.slice().sort(function (a, b) {
      return String(b[sortRule] || '').localeCompare(String(a[sortRule] || ''));
    });
    rootEl.innerHTML = sorted.map(function (a) {
      return '<div class="entry-memo">' +
        '<div class="memo-head">' +
          '<img class="memo-avatar" src="' + esc(a.avatar) + '" alt="' + esc(a.author) + '" loading="lazy" decoding="async" onerror="this.style.visibility=\'hidden\'">' +
          '<div class="memo-author">' +
            '<strong>' + esc(a.author) + '</strong>' +
            '<span>' + esc(a[sortRule] || '') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="memo-content"><a href="' + esc(a.link) + '" target="_blank" rel="noopener nofollow">' + esc(a.title) + '</a></div>' +
      '</div>';
    }).join('') || '<div class="fcircle-empty">暂无数据——首次采集完成后可见。</div>';
  }

  function renderStats(s) {
    if (!statsEl) return;
    statsEl.innerHTML =
      '<span class="fcircle-stat"><b>' + s.friends_num + '</b> 订阅</span>' +
      '<span class="fcircle-stat"><b>' + s.active_num + '</b> 活跃</span>' +
      '<span class="fcircle-stat"><b>' + s.article_num + '</b> 文章</span>' +
      '<span class="fcircle-stat">更新于 ' + esc(s.last_updated_time) + '</span>';
  }

  // 排序切换
  Array.prototype.forEach.call(document.querySelectorAll('.js-fcircle-sort'), function (btn) {
    btn.addEventListener('click', function () {
      sortRule = btn.getAttribute('data-rule');
      Array.prototype.forEach.call(document.querySelectorAll('.js-fcircle-sort'), function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      render();
    });
  });

  // 加 ?t= 避免浏览器命中旧缓存（部署后 SW 可能还留着旧 data.json）
  fetch(pathBase() + 'fcircle-data.json?t=' + Date.now())
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (d) {
      articles = (d && d.article_data) || [];
      renderStats((d && d.statistical_data) || {});
      render();
    })
    .catch(function (err) {
      rootEl.innerHTML = '<div class="fcircle-empty">朋友圈数据加载失败：' + esc(err.message) + '</div>';
    });
})();
