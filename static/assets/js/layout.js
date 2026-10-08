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

  function syncBackToTopButton() {
    if (!backToTopButton) return;
    setBackToTopVisible(container.scrollTop > backToTopOffset);
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

  if (backToTopButton) {
    backToTopButton.addEventListener('click', function() {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    });

    container.addEventListener('scroll', syncBackToTopButton, { passive: true });
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

function initLayout() {
  normalizeExternalLinks(document);
  initPortalNavVisibility();
  initSearchLazyLoad();
  initInContainerScrollNavigation();
  initRouteNavActiveState();
  initMobileMenu();
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
