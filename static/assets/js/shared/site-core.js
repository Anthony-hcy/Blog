// 站点公共小工具（只保留当前各页面模块实际用到的函数）

export function readStorage(key) {
  try {
    if (!window.localStorage) return '';
    return String(localStorage.getItem(key) || '');
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
