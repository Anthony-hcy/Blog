import {
  buildApiRoots,
  escapeHtml,
  formatDateYmd,
  normalizeExternalLinks,
  parsePositiveInt,
  readStorage,
} from './shared/site-core.js';
import { ensurePageviewTracked } from './shared/babel-pageview.js';
import { initBabelComments } from './shared/babel-comments.js';

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

function initRandomBadgeGrids() {
  const grids = Array.from(document.querySelectorAll('.js-random-badges'));
  if (!grids.length) return;

  function parseLimit(el) {
    return parsePositiveInt(el.dataset.badgeLimit || '6', 6);
  }

  function pickRandom(items, count) {
    const shuffled = items.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    return shuffled.slice(0, count);
  }

  function joinBadgeUrl(prefix, file) {
    const base = String(prefix || '').trim();
    const name = String(file || '').trim();
    if (!base || !name) return '';
    return base.replace(/\/?$/, '/') + encodeURIComponent(name);
  }

  function normalizeBadge(item, payload) {
    if (typeof item === 'string') {
      const name = item.trim();
      const url = joinBadgeUrl(payload.url_prefix || payload.base_url, name);
      return name && url ? { name, url } : null;
    }

    if (!item || typeof item !== 'object') return null;

    const name = String(item.name || item.file || '').trim();
    const url =
      String(item.url || '').trim() ||
      joinBadgeUrl(payload.url_prefix || payload.base_url, item.file);

    if (!name || !url) return null;
    return { name, url };
  }

  function resolveBadgePartUrl(indexUrl, part) {
    const file =
      typeof part === 'string'
        ? part.trim()
        : String((part && (part.file || part.url)) || '').trim();
    if (!file) return '';

    try {
      return new URL(file, new URL(indexUrl, window.location.href)).toString();
    } catch (_) {
      return '';
    }
  }

  function loadBadgePayload(payload) {
    const parts = Array.isArray(payload.parts) ? payload.parts : [];
    if (!parts.length) {
      return Promise.resolve(payload);
    }

    const partUrl = resolveBadgePartUrl(source, pickRandom(parts, 1)[0]);
    if (!partUrl) {
      throw new Error('Badges part URL is unavailable');
    }

    return fetch(partUrl, { credentials: 'same-origin' })
      .then(function(res) {
        if (!res.ok) throw new Error('Badges part fetch failed');
        return res.json();
      })
      .then(function(partPayload) {
        const merged = Object.assign({}, payload || {}, partPayload || {});
        merged.url_prefix =
          (partPayload && (partPayload.url_prefix || partPayload.base_url)) ||
          payload.url_prefix ||
          payload.base_url ||
          '';
        merged.base_url = merged.url_prefix;
        return merged;
      });
  }

  function renderMessage(text) {
    grids.forEach(function(grid) {
      grid.innerHTML = '';
      const message = document.createElement('span');
      message.className = 'badge-88x31-loading';
      message.textContent = text;
      grid.appendChild(message);
    });
  }

  const source = grids[0].dataset.badgeSource || '';
  if (!source) {
    renderMessage('88x31 unavailable.');
    return;
  }

  const maxLimit = grids.reduce(function(acc, grid) {
    return Math.max(acc, parseLimit(grid));
  }, 6);

  fetch(source, { credentials: 'same-origin' })
    .then(function(res) {
      if (!res.ok) throw new Error('Badges index fetch failed');
      return res.json();
    })
    .then(loadBadgePayload)
    .then(function(payload) {
      let badges = Array.isArray(payload.badges) ? payload.badges : [];
      badges = badges
        .map(function(item) {
          return normalizeBadge(item, payload || {});
        })
        .filter(function(item) {
          return item && item.url;
        });

      if (!badges.length) {
        throw new Error('Empty badges list');
      }

      const selected = pickRandom(badges, Math.min(maxLimit, badges.length));
      grids.forEach(function(grid) {
        const limit = parseLimit(grid);
        const subset = selected.slice(0, limit);
        grid.innerHTML = '';

        subset.forEach(function(badge) {
          const badgeLink = document.createElement('a');
          badgeLink.href = badge.url;
          badgeLink.className = 'badge-88x31';
          badgeLink.title = badge.name;

          const image = document.createElement('img');
          image.src = badge.url;
          image.alt = badge.name;
          image.width = 88;
          image.height = 31;
          image.loading = 'lazy';
          image.decoding = 'async';

          badgeLink.appendChild(image);
          grid.appendChild(badgeLink);
        });
      });
    })
    .catch(function() {
      renderMessage('88x31 unavailable.');
    });
}

function initLatestInteractions(apiBase) {
  const lists = Array.from(document.querySelectorAll('.js-latest-interactions'));
  if (!lists.length) return;

  const api = buildApiRoots(apiBase).babelApi;
  const aboutUrl = document.body ? document.body.dataset.aboutUrl || '/about/' : '/about/';

  function withScrollParam(urlLike, targetId) {
    try {
      const url = new URL(urlLike, window.location.origin);
      url.searchParams.set('scroll', targetId);
      return url.pathname + url.search;
    } catch (_) {
      return String(urlLike || '');
    }
  }

  function renderMessage(message) {
    lists.forEach(function(list) {
      list.innerHTML =
        '<li class="interaction-empty">' + escapeHtml(message) + '</li>';
    });
  }

  function renderComments(comments) {
    lists.forEach(function(list) {
      const limit = parsePositiveInt(list.dataset.limit || '6', 6);
      let archivesRoot = String(list.dataset.archivesRoot || '/archives/');
      if (!archivesRoot.endsWith('/')) {
        archivesRoot += '/';
      }

      const subset = comments.slice(0, limit);
      if (!subset.length) {
        list.innerHTML =
          '<li class="interaction-empty">No recent comments yet.</li>';
        return;
      }

      const html = subset
        .map(function(item) {
          const postId = String(item.post_id || '').trim();
          const username =
            escapeHtml(String(item.username || 'Guest').trim()) || 'Guest';

          let raw = String(item.content || '').replace(/\s+/g, ' ').trim();
          if (raw.length > 58) {
            raw = raw.slice(0, 58) + '...';
          }

          const content = escapeHtml(raw || '(No text)');
          const timeText = formatDateYmd(item.create_time);
          let href = '#';
          if (postId) {
            href =
              postId === 'about'
                ? withScrollParam(aboutUrl, 'comments')
                : withScrollParam(archivesRoot + encodeURIComponent(postId) + '/', 'comments');
          }

          const meta = timeText ? username + ' · ' + timeText : username;
          return (
            '<li>' +
            '<a class="interaction-link" href="' +
            href +
            '">' +
            '<span class="interaction-meta">' +
            meta +
            '</span>' +
            '<span class="interaction-text">' +
            content +
            '</span>' +
            '</a>' +
            '</li>'
          );
        })
        .join('');

      list.innerHTML = html;
    });
  }

  if (!api) {
    renderMessage('No interaction feed available.');
    return;
  }

  const maxLimit = lists.reduce(function(acc, list) {
    return Math.max(acc, parsePositiveInt(list.dataset.limit || '6', 6));
  }, 6);

  fetch(api + '/comments/recent?page=1&page_size=' + Math.max(maxLimit, 1))
    .then(function(res) {
      return res.json();
    })
    .then(function(res) {
      if (res.code !== 200 || !Array.isArray(res.data)) {
        throw new Error('Bad interactions response');
      }
      renderComments(res.data.filter(Boolean));
    })
    .catch(function() {
      renderMessage('Unable to load interactions.');
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

function initLayout() {
  const apiBase = document.body ? document.body.dataset.apiBase || '' : '';
  ensurePageviewTracked({ apiBase: apiBase });
  normalizeExternalLinks(document);
  initPortalNavVisibility();
  initRandomBadgeGrids();
  initLatestInteractions(apiBase);
  initBabelComments({ apiBase: apiBase });
  initInContainerScrollNavigation();
  initRouteNavActiveState();
  initMobileMenu();
}

initLayout();

// PWA：注册 Service Worker（/Blog/ 子路径与根路径部署均兼容）
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  var m = location.pathname.match(/^(\/[^/]+)?\//);
  var base = (m && m[1] ? m[1] : '') + '/';
  window.addEventListener('load', function() {
    navigator.serviceWorker.register(base + 'sw.js').catch(function() {
      /* 注册失败不影响页面 */
    });
  });
}

initServiceWorker();
