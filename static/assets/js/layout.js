import {
  normalizeExternalLinks,
  readStorage,
} from './shared/site-core.js';

function initPortalNavVisibility() {
  const portalLinks = Array.from(document.querySelectorAll('.js-portal-nav-link'));
  if (!portalLinks.length) return;

  function setPortalLinksVisible(visible) {
    portalLinks.forEach(function(link) {
      link.style.display = visible ? '' : 'none';
      link.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  }

  function readPortalToken() {
    return (readStorage('portal_auth_token') || '').trim();
  }

  function syncPortalLinks() {
    setPortalLinksVisible(!!readPortalToken());
  }

  syncPortalLinks();
  window.addEventListener('pageshow', syncPortalLinks);
  window.addEventListener('storage', function(event) {
    if (!event.key || event.key === 'portal_auth_token' || event.key === 'portal_auth_email') {
      syncPortalLinks();
    }
  });
}

function initRouteNavActiveState() {
  const links = Array.from(document.querySelectorAll('.js-route-nav-link'));
  if (!links.length) return;

  const contextPath = document.body ? String(document.body.dataset.contextPath || '').trim() : '';

  function normalizePath(pathname) {
    const normalized = String(pathname || '').replace(/\/+$/, '');
    return normalized || '/';
  }

  function isIndexRoute(currentPath, navPath) {
    if (currentPath === navPath) return true;
    if (navPath === '/') return /^\/page\/\d+$/.test(currentPath);
    return currentPath.indexOf(navPath + '/page/') === 0;
  }

  function setActiveLink() {
    const currentPath = normalizePath(window.location.pathname);
    let bestLength = -1;
    const matchedLinks = [];

    links.forEach(function(link) {
      const navKind = String(link.dataset.navKind || '').trim();
      let hrefPath;
      try {
        hrefPath = normalizePath(
          new URL(link.getAttribute('href') || '', window.location.origin).pathname
        );
      } catch (_) {
        return;
      }

      const samePath = currentPath === hrefPath;
      const nestedPath = hrefPath !== '/' && currentPath.indexOf(hrefPath + '/') === 0;
      const isFeedPage = isIndexRoute(currentPath, hrefPath);
      const isContextRoute = contextPath && hrefPath === normalizePath(contextPath) && samePath;

      let isMatched = false;
      if (navKind === 'index') isMatched = isFeedPage;
      else if (navKind === 'context') isMatched = isContextRoute;
      else isMatched = samePath || nestedPath;
      if (!isMatched) return;

      matchedLinks.push({
        link: link,
        hrefPath: hrefPath,
      });

      if (hrefPath.length > bestLength) {
        bestLength = hrefPath.length;
      }
    });

    const activePaths = new Set(
      matchedLinks
        .filter(function(item) {
          return item.hrefPath.length === bestLength;
        })
        .map(function(item) {
          return item.hrefPath;
        })
    );

    links.forEach(function(link) {
      let hrefPath = '';
      try {
        hrefPath = normalizePath(
          new URL(link.getAttribute('href') || '', window.location.origin).pathname
        );
      } catch (_) {
        hrefPath = '';
      }

      const active = activePaths.has(hrefPath);
      link.classList.toggle('is-active', active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  setActiveLink();
  window.addEventListener('resize', setActiveLink);
  window.addEventListener('popstate', setActiveLink);
}

function initInContainerScrollNavigation() {
  const container = document.querySelector('.container');
  if (!container) return;

  const backToTopButton = document.querySelector('.js-back-to-top');
  const backToTopOffset = 160;
  let backToTopVisible = false;

  function setBackToTopVisible(visible) {
    if (!backToTopButton || backToTopVisible === visible) return;
    backToTopVisible = visible;
    backToTopButton.classList.toggle('is-hidden', !visible);
    backToTopButton.setAttribute('aria-hidden', visible ? 'false' : 'true');
    backToTopButton.tabIndex = visible ? 0 : -1;
  }

  var backToTopTicking = false;
  var backToTopIdleTimer = 0;
  var backToTopHovering = false;
  var BACK_TO_TOP_IDLE_MS = 2600;

  // 闲置几秒就自动淡出，鼠标靠近/键盘聚焦时保持可见
  function scheduleBackToTopIdle() {
    if (!backToTopButton) return;
    if (backToTopIdleTimer) window.clearTimeout(backToTopIdleTimer);
    backToTopIdleTimer = window.setTimeout(function () {
      if (backToTopHovering || document.activeElement === backToTopButton) return;
      if (container.scrollTop > backToTopOffset) setBackToTopVisible(false);
    }, BACK_TO_TOP_IDLE_MS);
  }

  function syncBackToTopButton() {
    if (!backToTopButton) return;
    setBackToTopVisible(container.scrollTop > backToTopOffset);
    scheduleBackToTopIdle();
  }

  // 滚动事件合并到一帧里做，避免长文滚动时每来一个 scroll 就改一次 class
  function onScrollSyncBackToTop() {
    if (backToTopTicking) return;
    backToTopTicking = true;
    window.requestAnimationFrame(function () {
      backToTopTicking = false;
      syncBackToTopButton();
    });
  }

  // 瞬时回顶：不做缓动、不逐帧写 scrollTop，点完立刻到位。
  function scrollToTopNow() {
    container.scrollTop = 0;
    if (container.scrollTop !== 0) container.scrollTo(0, 0);
  }

  function decodeScrollTarget(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  }

  function scrollTargetIntoContainer(target, behavior) {
    if (!target || !container.contains(target)) return false;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = Math.max(
      0,
      container.scrollTop + (targetRect.top - containerRect.top) - 10
    );
    container.scrollTo({ top: top, behavior: behavior || 'auto' });
    return true;
  }

  function readScrollTargetFromUrl() {
    const url = new URL(window.location.href);
    return decodeScrollTarget(url.searchParams.get('scroll') || '');
  }

  function syncScrollTarget(behavior) {
    const id = readScrollTargetFromUrl();
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    scrollTargetIntoContainer(target, behavior);
  }

  function setScrollTargetInUrl(targetId) {
    const id = decodeScrollTarget(targetId);
    if (!id) return;
    const url = new URL(window.location.href);
    url.searchParams.set('scroll', id);
    history.pushState(null, '', url.pathname + url.search);
  }

  function stripHashFromUrl() {
    if (!window.location.hash) return;
    const url = new URL(window.location.href);
    url.hash = '';
    history.replaceState(null, '', url.pathname + url.search);
  }

  function upgradeLegacyHashUrl() {
    const rawHash = String(window.location.hash || '').trim();
    if (!rawHash || rawHash === '#') return;
    const legacyId = decodeScrollTarget(rawHash.slice(1));
    if (!legacyId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('scroll', legacyId);
    url.hash = '';
    history.replaceState(null, '', url.pathname + url.search);
  }

  // 回顶按钮已从头部挪到正文栏右下角：固定定位，left/top 按正文列右缘实时算
  // （桌面贴住内容列右侧，移动端内容列铺满，自然贴到屏幕右下）
  function positionBackToTopButton() {
    if (!backToTopButton) return;
    const rect = container.getBoundingClientRect();
    const size = backToTopButton.offsetWidth || 42;
    const left = Math.min(rect.right, window.innerWidth) - size - 18;
    const top = window.innerHeight - size - 26;
    backToTopButton.style.left = Math.round(Math.max(12, left)) + 'px';
    backToTopButton.style.top = Math.round(Math.max(12, top)) + 'px';
    backToTopButton.style.right = 'auto';
    backToTopButton.style.bottom = 'auto';
  }

  if (backToTopButton) {
    backToTopButton.addEventListener('pointerenter', function() {
      backToTopHovering = true;
      if (backToTopIdleTimer) window.clearTimeout(backToTopIdleTimer);
      setBackToTopVisible(true);
    });
    backToTopButton.addEventListener('pointerleave', function() {
      backToTopHovering = false;
      scheduleBackToTopIdle();
    });
    backToTopButton.addEventListener('focus', function() {
      setBackToTopVisible(true);
    });
    backToTopButton.addEventListener('blur', scheduleBackToTopIdle);

    backToTopButton.addEventListener('click', function() {
      setBackToTopVisible(false);
      scrollToTopNow();
    });

    container.addEventListener('scroll', onScrollSyncBackToTop, { passive: true });
    window.addEventListener('resize', positionBackToTopButton, { passive: true });
    // 侧边菜单展开/收起会改变正文列宽度，跟着重算位置
    if ('ResizeObserver' in window) {
      new ResizeObserver(positionBackToTopButton).observe(container);
    }
    positionBackToTopButton();
    syncBackToTopButton();
  }

  document.addEventListener('click', function(event) {
    const link = event.target.closest('a[data-scroll-target]');
    if (!link) return;

    const id = decodeScrollTarget(link.dataset.scrollTarget || '');
    if (!id) return;

    const target = document.getElementById(id);
    if (!target || !container.contains(target)) return;

    event.preventDefault();
    setScrollTargetInUrl(id);
    syncScrollTarget('smooth');
  });

  window.addEventListener('popstate', function() {
    syncScrollTarget('auto');
    stripHashFromUrl();
  });

  upgradeLegacyHashUrl();

  if (readScrollTargetFromUrl()) {
    window.requestAnimationFrame(function() {
      syncScrollTarget('auto');
      syncBackToTopButton();
    });
  }

  stripHashFromUrl();
}

// 头部「随便看看」：从搜索索引里随机抽一篇（索引按内容哈希命名并缓存，
// 失败时退回归档页，保证任何情况下都有去处）
function initRandomPost() {
  const btn = document.querySelector('.js-random-post');
  if (!btn) return;
  let cache = null;

  function load() {
    if (cache) return Promise.resolve(cache);
    const api = document.documentElement.getAttribute('data-exsearch-api');
    if (!api) return Promise.reject(new Error('no-api'));
    return fetch(api, { credentials: 'same-origin' }).then(function(res) {
      if (!res.ok) throw new Error('bad-index');
      return res.json();
    }).then(function(data) {
      cache = (data && data.posts) || [];
      return cache;
    });
  }

  btn.addEventListener('click', function() {
    if (btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';
    const fallback = btn.getAttribute('data-archives-url') || '/archives/';
    load().then(function(posts) {
      const here = window.location.pathname;
      const pool = posts.filter(function(post) {
        return post && post.path && post.path !== here;
      });
      if (!pool.length) throw new Error('empty');
      const pick = pool[Math.floor(Math.random() * pool.length)];
      window.location.href = pick.path;
    }).catch(function() {
      window.location.href = fallback;
    }).then(function() {
      btn.dataset.busy = '';
    });
  });
}

// 归档页年份折叠：默认只展开今年，其余年份收起；手动切换过就记住
function initArchiveYearCollapse() {
  const sections = document.querySelectorAll('.archive-year');
  if (!sections.length) return;
  const KEY = 'archiveCollapsedYears';
  let stored = {};
  try { stored = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch (_) { stored = {}; }
  const currentYear = String(new Date().getFullYear());

  function apply(section, toggle, collapsed) {
    section.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
  }

  Array.prototype.forEach.call(sections, function(section) {
    const toggle = section.querySelector('.archive-year-toggle');
    const nameEl = section.querySelector('.archive-year-name');
    if (!toggle || !nameEl) return;
    const year = nameEl.textContent.trim();
    const collapsed = Object.prototype.hasOwnProperty.call(stored, year) ? !!stored[year] : (year !== currentYear);
    apply(section, toggle, collapsed);
    toggle.addEventListener('click', function() {
      // 瞬时开合：不加高度动画、不做滚动补偿，点完立刻到位，页面不会抖
      apply(section, toggle, !section.classList.contains('is-collapsed'));
      stored[year] = section.classList.contains('is-collapsed');
      try { window.localStorage.setItem(KEY, JSON.stringify(stored)); } catch (_) {}
    });
  });
}

function initMobileMenu() {
  const toggle = document.querySelector('.js-menu-toggle');
  const closeButton = document.querySelector('.js-menu-close');
  const panel = document.querySelector('.js-menu-panel');
  const scrim = document.querySelector('.js-menu-scrim');
  const shell = document.querySelector('.js-app-shell') || document.body;
  if (!toggle || !panel || !scrim) return;

  function setMenuOpen(open) {
    shell.classList.toggle('is-menu-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    scrim.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  toggle.addEventListener('click', function() {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    setMenuOpen(!isOpen);
  });

  if (closeButton) {
    closeButton.addEventListener('click', function() {
      setMenuOpen(false);
    });
  }

  scrim.addEventListener('click', function() {
    setMenuOpen(false);
  });

  panel.addEventListener('click', function(event) {
    if (event.target.closest('a')) {
      setMenuOpen(false);
    }
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      setMenuOpen(false);
    }
  });

  setMenuOpen(false);
}

// 搜索懒加载：jQuery（87KB）+ ExSearch 只在首次点搜索按钮 / 按 / 时才注入，
// 不预载到每个页面（部署体积与解析成本都更小）。注入完成后聚焦搜索框即打开（ExSearch 绑定在 .search-form-input 上）。
function initSearchLazyLoad() {
  var trigger = document.querySelector('.search-form-input');
  if (!trigger) return;

  var loaded = false;
  var cssInjected = false;

  function assetBase() {
    var css = document.querySelector('link[rel="stylesheet"][href*="custom.css"]');
    var href = css ? (css.getAttribute('href') || '') : '';
    var m = href.match(/^(.*\/)assets\/custom\.css/);
    return m ? m[1] : '';
  }

  function injectScript(src, done) {
    var s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = done;
    s.onerror = done; // 出错也继续，避免搜索按钮卡死
    document.body.appendChild(s);
  }

  function loadSearch() {
    if (loaded) return;
    loaded = true;
    var base = assetBase();

    if (!cssInjected) {
      cssInjected = true;
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = base + 'assets/ExSearch/ExSearch.css';
      document.head.appendChild(css);
    }

    injectScript(base + 'assets/ExSearch/jquery.min.js', function() {
      injectScript(base + 'assets/ExSearch/ExSearch.js', function() {
        initSearchEmptyState();
        var input = document.querySelector('.search-form-input');
        if (input) input.focus(); // ExSearch 监听 .search-form-input 的 focus → 打开搜索遮罩
      });
    });
  }

  trigger.addEventListener('click', function(event) {
    event.preventDefault();
    loadSearch();
  });
  trigger.addEventListener('focus', function() {
    loadSearch();
  });

  // 键盘 / 快捷打开（输入框/文本区聚焦时忽略）
  document.addEventListener('keydown', function(event) {
    var tag = (document.activeElement || {}).tagName || '';
    if (event.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' &&
        !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      loadSearch();
    }
  });
}

// ---------- 主题切换（auto → light → dark 循环，localStorage 持久化） ----------
// 首帧由 <head> 内联脚本解析，这里只负责交互与跨标签页/系统偏好变化时的同步。
// 「液体浇灌」揭示：点按钮且 data-theme 真的翻转时，用 View Transitions 的新主题快照
// 套一条逐帧生成的液体 clip-path（液柱 → 触底飞溅 → 波浪上涨），每帧只写 --pour-clip。
// 关闭：URL 加 ?nomotion=1，或 <html data-theme-motion="off">，或系统「减少动态效果」。
function initThemeToggle() {
  var root = document.documentElement;
  var btn = document.querySelector('.js-theme-toggle');
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var ORDER = ['auto', 'light', 'dark'];
  var LABEL = { auto: '跟随系统', light: '亮色', dark: '暗色' };
  var THEME_COLOR = { dark: '#000000', light: '#f7f7f9' };
  // 液体动效时序（ms）：下落 → 触底飞溅 → 上涨铺满
  var POUR = { fall: 180, rise: 1010, total: 1350 };

  var pouring = false;
  var activeVT = null;
  var rafId = 0;
  var splash = null;
  var historyPatched = false;

  function currentPref() {
    var p = root.getAttribute('data-theme-pref');
    return ORDER.indexOf(p) >= 0 ? p : 'auto';
  }

  function effectiveOf(pref) {
    return pref === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : pref;
  }

  function apply(pref, persist) {
    var effective = effectiveOf(pref);
    root.setAttribute('data-theme-pref', pref);
    root.setAttribute('data-theme', effective);
    if (persist) {
      try { localStorage.setItem('theme', pref); } catch (e) { /* 隐私模式下忽略 */ }
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[effective] || THEME_COLOR.dark);
    if (btn) {
      var text = '主题：' + LABEL[pref] + '（点击切换）';
      btn.setAttribute('aria-label', text);
      btn.setAttribute('title', text);
    }
  }

  // ---- 液体揭示：开关与降级（不支持 View Transitions 就瞬时切换，不做圆形扩散） ----
  function motionDisabled() {
    if (root.getAttribute('data-theme-motion') === 'off') return true;
    if (/[?&]nomotion(?:=1)?(?:&|$)/.test(window.location.search)) return true;
    // 验收/录屏专用：?pourforce=1 只对这一次打开忽略系统「减少动态效果」，不改系统设置
    if (/[?&]pourforce=1(?:&|$)/.test(window.location.search)) return false;
    if (mqReduce && mqReduce.matches) return true;
    return false;
  }

  function canPour() {
    return !motionDisabled() && typeof document.startViewTransition === 'function';
  }

  // 排查用：主题切换被降级成瞬切时，把原因打到控制台
  function motionReason() {
    if (root.getAttribute('data-theme-motion') === 'off') return 'html 上设了 data-theme-motion="off"';
    if (/[?&]nomotion(?:=1)?(?:&|$)/.test(window.location.search)) return '地址带了 ?nomotion=1';
    if (typeof document.startViewTransition !== 'function') return '这个浏览器不支持 View Transitions';
    if (mqReduce && mqReduce.matches) return '系统「减少动态效果」开着（prefers-reduced-motion: reduce）';
    return '未知原因';
  }

  // 调试/演示用：?pourslow=8 把同一段动效放慢 8 倍看细节（默认 1，不影响正常体验）
  function pourSpeed() {
    var m = /[?&]pourslow=([\d.]+)/.exec(window.location.search);
    var v = m ? parseFloat(m[1]) : 1;
    return isFinite(v) && v > 1 ? Math.min(v, 20) : 1;
  }

  // ---- 几何：全部实时测量，移动端/窗口变化都不写死坐标 ----
  function px(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  function readFrame() {
    var shell = document.querySelector('.app-shell');
    if (!shell) return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, radius: 0 };
    var r = shell.getBoundingClientRect();
    var cs = window.getComputedStyle(shell);
    var radius = Math.min(px(cs.borderTopLeftRadius, 16), r.width / 2, r.height / 2);
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, radius: radius };
  }

  function num(n) {
    var v = Math.round(n * 10) / 10;
    return v === 0 ? 0 : v;
  }

  // 液柱：s = 0 在按钮底边中点，s = 1 在液柱末端
  function halfWidth(t, s) {
    return Math.max(2.2, 3.4 + 1.15 * Math.sin(t * 0.021) + 1.0 * Math.sin(s * 4.7 + t * 0.017));
  }

  function sway(t, s, amp) {
    return amp * Math.sin(Math.PI * s) * Math.sin(t * 0.0086 - s * 2.2);
  }

  function waveY(x, level, amp, phase) {
    var k = x * 0.021;
    return level + amp * (0.62 * Math.sin(k + phase) + 0.38 * Math.sin(k * 1.87 - phase * 1.35));
  }

  // 圆：绕向必须和主体一致（同为负面积），否则与非零填充规则下的主体重叠处会挖成洞
  function circle(cx, cy, r) {
    var k = r * 0.5523;
    return 'M' + num(cx - r) + ' ' + num(cy) +
      'C' + num(cx - r) + ' ' + num(cy + k) + ' ' + num(cx - k) + ' ' + num(cy + r) + ' ' + num(cx) + ' ' + num(cy + r) +
      'C' + num(cx + k) + ' ' + num(cy + r) + ' ' + num(cx + r) + ' ' + num(cy + k) + ' ' + num(cx + r) + ' ' + num(cy) +
      'C' + num(cx + r) + ' ' + num(cy - k) + ' ' + num(cx + k) + ' ' + num(cy - r) + ' ' + num(cx) + ' ' + num(cy - r) +
      'C' + num(cx - k) + ' ' + num(cy - r) + ' ' + num(cx - r) + ' ' + num(cy - k) + ' ' + num(cx - r) + ' ' + num(cy) + 'Z';
  }

  function makeSplash(x, y) {
    var items = [];
    for (var i = 0; i < 7; i++) {
      var dir = i / 3 - 1;                      // -1 … 1，向两侧散开
      var ang = -Math.PI / 2 + dir * 0.8;
      var sp = 0.9 + 0.5 * Math.abs(Math.sin(i * 2.3));
      items.push({
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        r: 1.8 + 1.7 * Math.abs(Math.sin(i * 1.7)),
        life: 340 + 120 * Math.abs(Math.cos(i * 1.3)),
        delay: i * 7
      });
    }
    splash = { x: x, y: y, t0: POUR.fall, items: items };
  }

  // 一帧一条 path：液体轮廓（液面以下的主体 + 液柱 + 液滴）全部塞进同一条 clip-path
  function clipAt(t, geo, o) {
    var L = geo.left, R = geo.right, T = geo.top, B = geo.bottom;
    var x0 = o.x, y0 = o.y;
    var fallP = Math.min(1, t / POUR.fall);
    // 触底后先留 120ms 让飞溅飞起来，再开始涨液面（否则液面比液滴涨得快，飞溅会被埋掉）
    var roseT = Math.max(0, t - POUR.fall - 120);
    var riseP = Math.min(1, roseT / (POUR.rise - 120));
    var fallEnd = y0 + (B - y0) * fallP * fallP;      // 下落加速
    var poolOn = t >= POUR.fall;
    var streamOn = t < POUR.total - 80;

    // 最后 14% 让液体溢出圆角框，把框外那圈页面底色一起翻掉，避免收尾帧突变
    var spill = Math.max(0, (riseP - 0.86) / 0.14);
    var gapMax = Math.max(L, window.innerWidth - R, T, window.innerHeight - B) + 2;
    var inset = spill * gapMax;
    var Lp = L - inset, Rp = R + inset, Tp = T - inset, Bp = B + inset;
    var rp = Math.max(0, geo.radius - inset);

    // 起步缓、中段匀、收尾稳（smoothstep 与线性各一半），液面不会一触底就猛跳
    var riseEase = 0.5 * riseP + 0.5 * (riseP * riseP * (3 - 2 * riseP));
    var level = (B - 9) + ((Tp - 4) - (B - 9)) * riseEase;
    var amp = 9 * Math.pow(1 - riseP, 0.9) + 1.2;
    var phase = t * 0.0125;
    var swayAmp = Math.min(9, 3 + (B - y0) * 0.012);

    function surface(x) {
      var y = waveY(x, level, amp, phase);
      if (splash) {
        var age = t - splash.t0;
        if (age >= 0 && age < 340) {
          var dx = x - splash.x;
          var env = Math.exp(-(dx * dx) / 7200) * (1 - age / 340);
          y += 3.4 * env * Math.sin(dx * 0.13 - age * 0.045);
        }
      }
      return Math.min(y, Bp - 1);
    }

    var d = [];

    if (poolOn) {
      var hwB = halfWidth(t, 1);
      var bandR = x0 + hwB, bandL = x0 - hwB;
      // 液面涨过按钮时液柱被吞没，此时不再挖出凸起（否则轮廓会自交）
      var useStream = streamOn && surface(x0) > y0 + 4 && bandR < Rp - 2 && bandL > Lp + 2;
      var steps = 42;
      var i, x, s, hw, sw;

      d.push('M' + num(Lp + rp) + ' ' + num(Bp));
      d.push('L' + num(Rp - rp) + ' ' + num(Bp));
      d.push('A' + num(rp) + ' ' + num(rp) + ' 0 0 0 ' + num(Rp) + ' ' + num(Bp - rp));
      d.push('L' + num(Rp) + ' ' + num(surface(Rp)));

      var entered = false;
      for (i = 1; i <= steps; i++) {
        x = Rp + (Lp - Rp) * (i / steps);
        if (useStream) {
          if (!entered && x <= bandR) {
            entered = true;
            var yR = surface(bandR), yL = surface(bandL);
            for (s = 1; s >= 0; s -= 0.125) {          // 液面 → 按钮底（右边缘）
              hw = halfWidth(t, s); sw = sway(t, s, swayAmp);
              d.push('L' + num(x0 + hw + sw) + ' ' + num(y0 + (yR - y0) * s));
            }
            d.push('Q' + num(x0) + ' ' + num(y0 + 3) + ' ' + num(x0 - halfWidth(t, 0)) + ' ' + num(y0));
            for (s = 0.125; s <= 1.0001; s += 0.125) {  // 按钮底 → 液面（左边缘）
              hw = halfWidth(t, s); sw = sway(t, s, swayAmp);
              d.push('L' + num(x0 - hw + sw) + ' ' + num(y0 + (yL - y0) * s));
            }
            continue;
          }
          if (entered && x > bandL) continue;
        }
        d.push('L' + num(x) + ' ' + num(surface(x)));
      }

      d.push('L' + num(Lp) + ' ' + num(Bp - rp));
      d.push('A' + num(rp) + ' ' + num(rp) + ' 0 0 0 ' + num(Lp + rp) + ' ' + num(Bp));
      d.push('Z');
    } else if (streamOn) {
      // 下落段：只有一根带摆动的液柱 + 末端分离的 1~2 颗液滴
      var bottom = fallEnd;
      var s2;
      d.push('M' + num(x0 - halfWidth(t, 0)) + ' ' + num(y0));
      for (s2 = 0.125; s2 <= 1.0001; s2 += 0.125) {
        d.push('L' + num(x0 + halfWidth(t, s2) + sway(t, s2, swayAmp)) + ' ' + num(y0 + (bottom - y0) * s2));
      }
      var hwE = halfWidth(t, 1);
      d.push('Q' + num(x0) + ' ' + num(bottom + hwE * 1.9) + ' ' + num(x0 - hwE) + ' ' + num(bottom));
      for (s2 = 1; s2 >= -0.0001; s2 -= 0.125) {
        d.push('L' + num(x0 - halfWidth(t, s2) + sway(t, s2, swayAmp)) + ' ' + num(y0 + (bottom - y0) * s2));
      }
      d.push('Z');

      if (t > 70) {
        var gap = 13 + 6 * (0.5 + 0.5 * Math.sin(t * 0.028));
        d.push(circle(x0 + Math.sin(t * 0.02) * 2.2, fallEnd + gap, 2.1 + 0.6 * Math.sin(t * 0.04)));
        if (fallEnd - y0 > 46) d.push(circle(x0 - 1.6, fallEnd + gap + 11, 1.6));
      }
    }

    // 触底飞溅：几颗小液滴（落回液面就不再画，避免和液面重叠）
    if (t >= POUR.fall && !splash) makeSplash(x0, level);
    if (splash) {
      var age2 = t - splash.t0;
      for (var j = 0; j < splash.items.length; j++) {
        var it = splash.items[j];
        var a = age2 - it.delay;
        if (a <= 0 || a > it.life) continue;
        var dx2 = splash.x + it.vx * a;
        var dy2 = splash.y + it.vy * a + 0.004 * a * a;
        if (dy2 > surface(dx2) - 1.5) continue;
        d.push(circle(dx2, dy2, it.r * (1 - a / it.life * 0.5)));
      }
    }

    // clip-path 需要 path("…") 包一层，裸路径会被当成非法值丢弃
    return d.length ? 'path("' + d.join('') + '")' : 'path("M0 0Z")';
  }

  function cleanupPour() {
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    root.removeAttribute('data-pour');
    root.style.removeProperty('--pour-clip');
    root.style.removeProperty('--pour-dur');
    splash = null;
    activeVT = null;
    pouring = false;
  }

  function abortPour() {
    if (!pouring) return;
    var vt = activeVT;
    cleanupPour();
    if (vt && vt.skipTransition) {
      try { vt.skipTransition(); } catch (e) { /* 已经结束 */ }
    }
  }

  function startPour(nextPref, anchor) {
    var geo = readFrame();
    var o = {
      x: Math.min(Math.max(anchor.x, geo.left + 6), geo.right - 6),
      y: Math.min(Math.max(anchor.y, geo.top + 2), geo.bottom - 8)
    };

    var k = pourSpeed();

    pouring = true;
    splash = null;
    root.setAttribute('data-pour', 'on');
    root.style.setProperty('--pour-dur', (POUR.total * k + 120) + 'ms');
    root.style.setProperty('--pour-clip', clipAt(0, geo, o));

    var vt;
    try {
      vt = document.startViewTransition(function () { apply(nextPref, true); });
    } catch (e) {
      cleanupPour();
      apply(nextPref, true);
      return;
    }
    activeVT = vt;

    var t0 = 0;
    function frame(now) {
      if (!pouring) return;
      if (!t0) t0 = now;
      var t = (now - t0) / k;
      if (t >= POUR.total) {
        root.style.setProperty('--pour-clip', clipAt(POUR.total, geo, o));
        rafId = 0;
        return;
      }
      root.style.setProperty('--pour-clip', clipAt(t, geo, o));
      rafId = window.requestAnimationFrame(frame);
    }

    function begin() {
      if (!pouring) return;
      t0 = 0;
      rafId = window.requestAnimationFrame(frame);
    }

    if (vt.ready && vt.ready.then) vt.ready.then(begin, function () { /* 被跳过 */ });
    else begin();

    if (vt.finished && vt.finished.then) {
      vt.finished.then(cleanupPour, cleanupPour);
    } else {
      window.setTimeout(cleanupPour, POUR.total * k + 200);
    }
  }

  // 动画中点站内链接 / 锚点跳转：立刻收掉动效，不带着遮罩跳走
  function hookAbort() {
    if (historyPatched) return;
    historyPatched = true;
    ['pushState', 'replaceState'].forEach(function (key) {
      var orig = history[key];
      if (typeof orig !== 'function') return;
      history[key] = function () {
        if (pouring) abortPour();
        return orig.apply(history, arguments);
      };
    });
    document.addEventListener('click', function (event) {
      if (!pouring) return;
      var el = event.target;
      if (el && el.closest && el.closest('a[href]')) abortPour();
    }, true);
    window.addEventListener('popstate', function () { if (pouring) abortPour(); });
  }

  // 首屏把 <head> 里算出的结果再同步一次（补上 theme-color 与按钮文案）
  apply(currentPref(), false);
  hookAbort();

  if (btn) {
    btn.addEventListener('click', function () {
      if (pouring) return;                       // 动画中再点：忽略，绝不叠加
      var next = ORDER[(ORDER.indexOf(currentPref()) + 1) % ORDER.length];
      var nextEff = effectiveOf(next);
      var curEff = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      // 只有 data-theme 真的翻转才播动画（如系统暗色下 dark → auto 仍是暗色，直接切）
      if (nextEff === curEff) {
        apply(next, true);                       // 主题没真翻转：按规则不播
        return;
      }
      if (!canPour()) {
        console.info('[theme-pour] 跳过液体动效：' + motionReason() + '（想临时看效果可在地址后加 ?pourforce=1）');
        apply(next, true);
        return;
      }
      var rect = btn.getBoundingClientRect();    // 原点实时测，不写死
      startPour(next, { x: rect.left + rect.width / 2, y: rect.bottom });
    });
  }

  // 跟随系统时，系统亮暗变化要实时生效（不播动画）
  if (mq) {
    var onChange = function () { if (currentPref() === 'auto') apply('auto', false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  // 其它标签页改了主题，这里同步（不播动画）
  window.addEventListener('storage', function (event) {
    if (event.key !== 'theme') return;
    var pref = event.newValue;
    apply(ORDER.indexOf(pref) >= 0 ? pref : 'auto', false);
  });
}

// ---------- 阅读进度条（只在文章页，由 body[data-reading-progress] 控制） ----------
function initReadingProgress() {
  if (!document.body.hasAttribute('data-reading-progress')) return;
  var bar = document.querySelector('.js-reading-progress > span');
  if (!bar) return;
  var scroller = document.querySelector('.container');
  var doc = document.scrollingElement || document.documentElement;
  var ticking = false;

  function measure() {
    ticking = false;
    var top, height, view;
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) {
      top = scroller.scrollTop; height = scroller.scrollHeight; view = scroller.clientHeight;
    } else {
      top = window.pageYOffset || doc.scrollTop; height = doc.scrollHeight; view = window.innerHeight;
    }
    var max = height - view;
    var ratio = max > 0 ? top / max : 0;
    ratio = Math.min(1, Math.max(0, ratio));
    bar.style.width = (ratio * 100).toFixed(2) + '%';
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(measure);
  }

  (scroller || window).addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  measure();
}

// ---------- 搜索无结果提示（ExSearch 自己什么都不显示，遮罩里会一片空白） ----------
function initSearchEmptyState() {
  var overlay = document.querySelector('.ins-search');
  if (!overlay) return;
  var input = overlay.querySelector('.ins-search-input');
  var container = overlay.querySelector('.ins-section-container');
  var host = overlay.querySelector('.ins-search-container');
  if (!input || !container || !host) return;
  if (host.querySelector('.ins-search-empty')) return;

  var empty = document.createElement('div');
  empty.className = 'ins-search-empty';
  empty.innerHTML = '<p>没有找到相关内容</p><p><strong>换个关键词试试</strong>，或按 Esc 关闭</p>';
  host.appendChild(empty);

  // 结果区对读屏软件可播报
  container.setAttribute('aria-live', 'polite');
  input.setAttribute('aria-label', '站内搜索');

  function update() {
    var q = (input.value || '').trim();
    var hasResult = !!container.querySelector('.ins-selectable');
    empty.classList.toggle('show', !!q && !hasResult);
  }

  input.addEventListener('input', update);
  if (window.MutationObserver) {
    new MutationObserver(update).observe(container, { childList: true });
  }
  update();
}

// 图片渐显：慢网时先看到占位底色，加载完再淡入，避免「黑块突然跳出一张图」
function initImageFade() {
  var imgs = document.querySelectorAll('.pswp-item img, .article-body img, .memo-content img');
  if (!imgs.length) return;
  Array.prototype.forEach.call(imgs, function (img) {
    if (img.complete && img.naturalWidth) return; // 秒开（缓存命中）就别加过渡，省一次重绘
    img.classList.add('img-fade');
    function done() {
      img.classList.add('is-loaded');
      img.removeEventListener('load', done);
      img.removeEventListener('error', done);
    }
    img.addEventListener('load', done);
    img.addEventListener('error', done);
    window.setTimeout(done, 4000); // 兜底：事件丢了也不能让图一直是透明的
  });
}

// 点左上角站名 / 侧栏 Home 回首页 = 回默认首页（从顶部开始），不恢复上次阅读位置；
// 只有浏览器「后退」才恢复。两者优先级：主动点首页 > 记忆位置。
function initHomeLinkReset() {
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[data-home-link]');
    if (!link) return;
    try {
      var drop = [];
      for (var i = 0; i < window.sessionStorage.length; i++) {
        var k = window.sessionStorage.key(i);
        if (k && k.indexOf('feedScroll:') === 0) drop.push(k);
      }
      drop.forEach(function (k) { window.sessionStorage.removeItem(k); });
      window.sessionStorage.setItem('feedScrollReset', '1');
    } catch (_) {}
  }, true);
}

// 不蒜子把数字直接塞进 span，这里统一转成 1.2k / 3.4w 这种缩写
// 注意：满一万用 w 而不是「万」，与 About 页 Words 卡片的 1.75w 保持一致。
function formatMetricCount(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function initMetricFormat() {
  var ids = ['busuanzi_value_page_pv', 'busuanzi_value_site_pv', 'busuanzi_value_site_uv'];
  function format(el) {
    if (!el || el.dataset.fmtDone === '1') return;
    var raw = (el.textContent || '').trim();
    if (!/^\d+$/.test(raw)) return;
    var n = parseInt(raw, 10);
    var text = formatMetricCount(n);
    // About 页 Views 和 Words 卡片同款：数字用大号，w/亿 用 <small> 小号单位
    if (el.classList.contains('js-about-views')) {
      var m = /^([\d.]+)([kw亿])$/.exec(text);
      if (m) {
        el.innerHTML = m[1] + '<small>' + m[2] + '</small>';
        el.title = raw;
        el.dataset.fmtDone = '1';
        return;
      }
    }
    if (text !== raw) { el.textContent = text; el.title = raw; }
    el.dataset.fmtDone = '1';
  }
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    format(el);
    var observer = new MutationObserver(function () { format(el); });
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    var tries = 0;
    var timer = setInterval(function () {
      format(el);
      if (++tries > 24) clearInterval(timer);
    }, 500);
  });
}

function initLayout() {
  normalizeExternalLinks(document);
  initPortalNavVisibility();
  initThemeToggle();
  initReadingProgress();
  initSearchLazyLoad();
  initInContainerScrollNavigation();
  initRouteNavActiveState();
  initMobileMenu();
  initRandomPost();
  initArchiveYearCollapse();
  initImageFade();
  initHomeLinkReset();
  initMetricFormat();
}

initLayout();

// 站点子路径（/Blog/ 或 /）
// 以本脚本自身的 src 反推站点根：/Blog/assets/js/layout.js → /Blog/；/assets/js/layout.js → /。
// 旧实现取 location.pathname 的第一段，在根路径部署下会把 /archives/xxx/ 误判成 /archives/，
// 导致 SW 注册与 version.json 探测打到 /archives/sw.js、/archives/version.json（404）。
function pathBase() {
  var fromScript = siteBaseFromScript();
  if (fromScript) return fromScript;
  var m = location.pathname.match(/^(\/[^/]+)?\//);
  return (m && m[1] ? m[1] : '') + '/';
}
function siteBaseFromScript() {
  try {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute('src') || '';
      if (src.indexOf('/assets/js/') < 0) continue;
      var path = new URL(src, location.href).pathname;
      var k = path.indexOf('/assets/js/');
      if (k >= 0) return path.slice(0, k + 1);
    }
  } catch (e) { /* 取不到就退回下面的兜底 */ }
  return '';
}

// PWA：注册 Service Worker（/Blog/ 子路径与根路径部署均兼容）
// 注意：不要在 window.load 里注册——全站图片 loading="lazy" 会把 load 事件推迟
// 很长时间（实测可达 120 秒），首访用户在此期间完全不受 SW 控制；
// 改在 DOMContentLoaded（或模块已执行时 DOM 通常已可交互）尽早注册。
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  function register() {
    navigator.serviceWorker.register(pathBase() + 'sw.js').catch(function() {
      /* 注册失败不影响页面 */
    });
  }
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    register();
  } else {
    document.addEventListener('DOMContentLoaded', register);
  }
}

// PWA 内容自动更新：App 回到前台/页面恢复时，比对构建版本指纹，
// 有新部署就自动刷新——解决独立窗口里"没有刷新按钮、主页一直旧内容"的问题。
// Portal 页排除在外（防止自动刷新弄丢正在编辑的草稿）。
function initContentRefresher() {
  if (document.getElementById('portal-root') || /portal\.html$/.test(location.pathname)) return;
  var pageVersion = (document.querySelector('meta[name="build-version"]') || {}).content || '';
  var lastCheck = 0;

  function check() {
    var now = Date.now();
    if (now - lastCheck < 15000) return;
    lastCheck = now;
    fetch(pathBase() + 'version.json?t=' + now, { cache: 'reload' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.v || !pageVersion || data.v === pageVersion) return;
        // 60 秒内最多自动刷新一次，防异常时循环刷新
        var lastReload = Number(sessionStorage.getItem('contentReloadAt') || 0);
        if (Date.now() - lastReload < 60000) return;
        try { sessionStorage.setItem('contentReloadAt', String(Date.now())); } catch (_) {}
        location.reload();
      })
      .catch(function () { /* 断网静默 */ });
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) check();
  });
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) check();
  });
  check();
}

initServiceWorker();
initContentRefresher();

// 不蒜子是第三方免费服务，移动网络下经常连不上；8 秒没响应把占位符换成 –，不再显示误导性的 0
function initBusuanziWatchdog() {
  window.setTimeout(function () {
    ['busuanzi_value_page_pv', 'busuanzi_value_site_pv'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var t = (el.textContent || '').trim();
      if (t === '…' || t === '--' || t === '') el.textContent = '–';
    });
  }, 8000);
}

initBusuanziWatchdog();
