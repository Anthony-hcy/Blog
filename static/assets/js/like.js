// 点赞按钮（思路借自 iine.to「いいね」，自己实现）
// 复用 iine 的公开 Supabase RPC（get_hits / increment_hits），不加载第三方脚本、不依赖 CDN。
// 三点设计：
// 1) 数字由构建快照（content/likes.json）直接写进 HTML，打开页面就有数，不用等海外接口；
// 2) 首页是无限滚动，新插入的卡片用 MutationObserver + 事件委托接管，所以首页也能直接点赞；
// 3) 防重复与离线兜底：localStorage 记「已点赞 + 自己看到的数字」。
(function () {
  'use strict';
  var API = 'https://vhiweeypifbwacashxjz.supabase.co/rest/v1/rpc/';
  var KEY = 'sb_publishable_EoB7MFJhCmb6PiAk-GPJ4w_PGhQ44Ru';

  function headers() {
    return { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY };
  }
  function countEl(btn) { return btn.querySelector('.like-count'); }
  function currentCount(btn) {
    var el = countEl(btn);
    return (el && parseInt(el.textContent, 10)) || 0;
  }
  // 安全写数字：只接受有限、非负、量级合理的值，避免把接口返回的脏数据（如超长数字串）显示出来
  function safeCount(n) {
    var v = Number(n);
    if (!isFinite(v) || v < 0 || v > 100000000) return 0;
    return Math.floor(v);
  }
  function setCount(btn, n) {
    var el = countEl(btn);
    if (!el) return;
    el.textContent = String(safeCount(n));
    el.hidden = false;
  }
  function readLocal(slug) {
    try {
      var raw = localStorage.getItem('like:' + slug);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') return { liked: !!o.liked, n: typeof o.n === 'number' ? o.n : 0 };
      }
      if (localStorage.getItem('liked:' + slug)) return { liked: true, n: 0 };
    } catch (e) {}
    return null;
  }
  function writeLocal(slug, liked, n) {
    try {
      localStorage.setItem('like:' + slug, JSON.stringify({ liked: !!liked, n: safeCount(n) }));
      if (liked) localStorage.setItem('liked:' + slug, '1');
    } catch (e) {}
  }
  function markLiked(btn) {
    btn.classList.add('is-liked');
    btn.setAttribute('aria-pressed', 'true');
  }

  // 服务端真实数字校正：只有更大时才覆盖，避免接口丢写把数字改小
  function fetchCounts(btns) {
    var slugs = btns.map(function (b) { return b.dataset.slug; }).filter(Boolean);
    if (!slugs.length) return;
    fetch(API + 'get_hits', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ page_slugs: slugs })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data || typeof data !== 'object') return;
      btns.forEach(function (btn) {
        var n = data[btn.dataset.slug];
        if (typeof n !== 'number' || !isFinite(n) || n < 0 || n > 100000000) return;
        var local = readLocal(btn.dataset.slug) || { liked: false, n: 0 };
        if (n > Math.max(local.n, currentCount(btn))) {
          setCount(btn, n);
          writeLocal(btn.dataset.slug, local.liked, n);
        }
      });
    }).catch(function () { /* 接口不通就保持快照数字，按钮仍可用 */ });
  }

  // 初始化（含无限滚动后来插入的卡片）
  function hydrate(scope) {
    var list = (scope || document).querySelectorAll('.js-like:not([data-like-init])');
    if (!list.length) return;
    var fresh = [];
    Array.prototype.forEach.call(list, function (btn) {
      btn.setAttribute('data-like-init', '1');
      var local = readLocal(btn.dataset.slug);
      if (local && local.liked) {
        markLiked(btn);
        if (local.n > currentCount(btn)) setCount(btn, local.n);
      }
      fresh.push(btn);
    });
    fetchCounts(fresh);
  }

  // 事件委托：首页的卡片、文章页的按钮、后续加载出来的卡片都走同一套逻辑
  document.addEventListener('click', function (e) {
    var target = e.target;
    var btn = target && target.closest ? target.closest('.js-like') : null;
    if (!btn) return;
    if (btn.classList.contains('is-liked')) return;
    markLiked(btn);
    btn.classList.add('is-pop');
    var next = Math.max(1, currentCount(btn) + 1);
    setCount(btn, next);
    writeLocal(btn.dataset.slug, true, next);
    setTimeout(function () { btn.classList.remove('is-pop'); }, 420);
    fetch(API + 'increment_hits', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ page_slug: btn.dataset.slug })
    }).then(function (r) {
      // 该接口只回一句文字（"… liked! ♥"），不能当数字解析；成功后回查一次权威计数
      if (!r || !r.ok) return null;
      return fetch(API + 'get_hits', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ page_slugs: [btn.dataset.slug] })
      }).then(function (r2) { return r2.ok ? r2.json() : null; }).then(function (data) {
        var n = data && data[btn.dataset.slug];
        if (typeof n === 'number' && isFinite(n) && n > next && n < 100000000) {
          setCount(btn, n);
          writeLocal(btn.dataset.slug, true, n);
        }
      }).catch(function () {});
    }).catch(function () {});
  });

  // 无限滚动新增的卡片
  var pending = false;
  var mo = new MutationObserver(function () {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; hydrate(document); }, 250);
  });
  mo.observe(document.body, { childList: true, subtree: true });

  hydrate(document);
})();