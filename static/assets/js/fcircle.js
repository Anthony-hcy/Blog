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

  // 友链来源站：FriendCircle 采集友链页时不做 URL 拼接（官方 TODO），
  // 相对路径头像（如 ../images/x.png）需按来源站补全。换数据源时更新这一处。
  var FC_AVATAR_BASE = 'https://regenm.github.io';

  function resolveAvatar(src) {
    src = String(src == null ? '' : src).trim();
    if (!src) return '';
    if (/^https?:\/\//i.test(src)) return src;
    var rel = src.replace(/^\.\.?\//, '').replace(/^\/+/, '');
    return FC_AVATAR_BASE + '/' + rel;
  }

  var rootEl = document.getElementById('fcircle-root');
  var statsEl = document.getElementById('fcircle-stats');
  if (!rootEl) return;

  // 失联提示框：展示每次定时获取未成功的友链（数据由 workflow 的 extract_errors.py 生成）
  var errorsEl = document.getElementById('fcircle-errors');
  if (errorsEl) {
    fetch(pathBase() + 'fcircle-errors.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.errors || !d.errors.length) return;
        var names = d.errors.map(function (e) {
          return e.link ? '<a href="' + esc(e.link) + '" target="_blank" rel="noopener">' + esc(e.name) + '</a>' : esc(e.name);
        }).join('、');
        errorsEl.innerHTML = '<b>本次定时获取未成功（' + d.errors.length + ' 站）</b>：' + names;
        errorsEl.hidden = false;
      })
      .catch(function () {});
  }

  var articles = [];
  // 分页：初始展示 PAGE_SIZE 条，点击「且看下文」每次再加载 PAGE_SIZE 条，到底显示「春和景明，终有尽时」
  var PAGE_SIZE = 20;
  var visibleCount = PAGE_SIZE;

  // 头像 HTML：真实图片加载失败时降级为作者首字母占位（cls 复用 memo-avatar-letter 样式）
  function avatarHtml(a, cls) {
    var avatar = resolveAvatar(a.avatar);
    if (avatar) {
      return '<img class="' + cls + '" src="' + esc(avatar) + '" alt="' + esc(a.author) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'' + cls + ' memo-avatar-letter\',textContent:(this.alt||\'?\').charAt(0).toUpperCase()}))">';
    }
    return '<span class="' + cls + ' memo-avatar-letter">' + esc((a.author || '?').charAt(0).toUpperCase()) + '</span>';
  }

  function render() {
    // 统一按「最近发布」（created）倒序；连续同一作者的文章合并成一个块（块头一个头像+名字，块内日期仍区分）
    var sorted = articles.slice().sort(function (a, b) {
      return String(b.created || '').localeCompare(String(a.created || ''));
    });
    // 每次重新切片+分组：加载更多后此前被页边界切开的块会自动合并
    var page = sorted.slice(0, visibleCount);
    var blocks = [];
    page.forEach(function (a) {
      var last = blocks[blocks.length - 1];
      if (last && last.author === a.author) {
        last.items.push(a);
      } else {
        blocks.push({ author: a.author, items: [a] });
      }
    });
    var hasMore = visibleCount < sorted.length;
    var html = blocks.map(function (b) {
      var first = b.items[0];
      return '<div class="fcircle-block">' +
        '<div class="fcircle-block-head">' +
          avatarHtml(first, 'fcircle-block-avatar') +
          '<div class="fcircle-block-author"><strong>' + esc(b.author) + '</strong></div>' +
        '</div>' +
        '<div class="fcircle-block-items">' +
          b.items.map(function (a) {
            return '<div class="fcircle-item">' +
              '<time class="fcircle-item-date">' + esc(a.created || '') + '</time>' +
              '<a class="fcircle-item-title" href="' + esc(a.link) + '" target="_blank" rel="noopener nofollow">' + esc(a.title) + '</a>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');
    if (sorted.length === 0) {
      html = '<div class="fcircle-empty">暂无数据——首次采集完成后可见。</div>';
    } else if (hasMore) {
      html += '<button type="button" class="fcircle-more" id="fcircle-more">且看下文</button>';
    } else {
      html += '<div class="fcircle-end">春和景明，终有尽时</div>';
    }
    rootEl.innerHTML = html;
    var moreBtn = document.getElementById('fcircle-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        visibleCount += PAGE_SIZE;
        render();
      });
    }
  }

  function renderStats(s) {
    if (!statsEl) return;
    statsEl.innerHTML =
      '<span class="fcircle-stat"><b>' + s.friends_num + '</b> 订阅</span>' +
      '<span class="fcircle-stat"><b>' + s.active_num + '</b> 活跃</span>' +
      '<span class="fcircle-stat"><b>' + s.article_num + '</b> 文章</span>' +
      '<span class="fcircle-stat">更新于 ' + esc(s.last_updated_time) + '</span>';
  }

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
