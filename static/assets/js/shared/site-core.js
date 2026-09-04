export function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function isLoopbackHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function shouldIgnoreApiBase(apiBase) {
  if (!apiBase || typeof window === 'undefined' || !window.location) return false;
  try {
    const parsedApi = new URL(apiBase, window.location.origin);
    const currentHost = window.location.hostname || '';
    return isLoopbackHostname(parsedApi.hostname) && !isLoopbackHostname(currentHost);
  } catch (_) {
    return false;
  }
}

export function buildApiRoots(rawApiBase) {
  const fallbackApiBase = document.body ? document.body.dataset.apiBase || '' : '';
  let apiBase = trimTrailingSlash(rawApiBase || fallbackApiBase);
  if (shouldIgnoreApiBase(apiBase)) {
    apiBase = '';
  }
  return {
    apiBase: apiBase,
    babelApi: apiBase ? apiBase + '/babel' : '',
    portalApi: apiBase ? apiBase + '/portal' : '',
    gravatarApi: apiBase ? apiBase + '/gravatar' : '',
  };
}

export function readStorage(key) {
  try {
    if (!window.localStorage) return '';
    return String(localStorage.getItem(key) || '');
  } catch (_) {
    return '';
  }
}

export function readTrackingIdentity() {
  const username = (readStorage('babel_username') || readStorage('username')).trim();
  const email = (
    readStorage('babel_email') ||
    readStorage('portal_auth_email') ||
    readStorage('email')
  ).trim();
  return { username, email };
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeHttpUrl(raw, baseOrigin) {
  const source = String(raw || '').trim();
  if (!source) return '';

  const base = baseOrigin || window.location.origin;
  try {
    const parsed = new URL(source, base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.href;
  } catch (_) {
    return '';
  }
}

export function parsePositiveInt(raw, fallback) {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function formatDateYmd(dateText) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return '';
  const pad = function(n) {
    return n < 10 ? '0' + n : String(n);
  };
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

export function normalizeExternalLinks(root) {
  const host = document.domain;
  const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
  const links = Array.from(scope.querySelectorAll('a[href]'));

  links.forEach(function(link) {
    const target = link.getAttribute('target');
    if (!(typeof target === 'undefined' || (target !== '' && target !== '_self'))) {
      return;
    }
    if (link.hostname && link.hostname !== host) {
      link.setAttribute('target', '_blank');
    }
  });
}
