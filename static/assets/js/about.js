import { buildApiRoots } from './shared/site-core.js';
import { initPhotoSwipeInScope } from './shared/photoswipe.js';
import { renderKatexWhenReady } from './shared/katex-render.js';

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return new Intl.NumberFormat().format(n);
}

function setText(el, value) {
  if (!el) return;
  el.textContent = value;
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  parsed = new Date(raw.replace(' ', 'T'));
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

function sumObjectValues(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  return Object.keys(payload).reduce(function(total, key) {
    const n = Number(payload[key] || 0);
    return Number.isFinite(n) ? total + n : total;
  }, 0);
}

function chunk(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function fetchTotalCount(api, endpoint, urls) {
  if (!api || !urls.length) return Promise.resolve(null);

  const groups = chunk(urls, 40);
  return Promise.all(
    groups.map(function(group) {
      const params = new URLSearchParams();
      group.forEach(function(url) {
        params.append('url', url);
      });

      return fetch(api + '/' + endpoint + '?' + params.toString())
        .then(function(res) {
          return res.json();
        })
        .then(function(res) {
          if (res.code !== 200) return 0;
          return sumObjectValues(res.data);
        })
        .catch(function() {
          return 0;
        });
    })
  ).then(function(chunks) {
    return chunks.reduce(function(total, value) {
      return total + Number(value || 0);
    }, 0);
  });
}

function parseTrackedUrls(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function initAboutStats() {
  const section = document.querySelector('.js-about-stats');
  if (!section) return;

  const api = buildApiRoots('').babelApi;
  const trackedUrls = parseTrackedUrls(section.dataset.trackedUrls || '[]');

  const runtimeValueEl = section.querySelector('.js-about-runtime-value');
  const runtimeMetaEl = section.querySelector('.js-about-runtime-meta');
  const commentsEl = section.querySelector('.js-about-comments');
  const likesEl = section.querySelector('.js-about-likes');
  // Views 卡片已改由不蒜子（#busuanzi_value_site_pv）填充，这里不再接管

  const runningDate = parseDate(section.dataset.runningSince || '');
  if (runningDate) {
    const elapsed = Date.now() - runningDate.getTime();
    const days = Math.max(1, Math.floor(elapsed / 86400000));
    setText(runtimeValueEl, formatNumber(days));
    setText(runtimeMetaEl, 'Since ' + runningDate.toISOString().slice(0, 10));
  } else {
    setText(runtimeValueEl, '--');
    setText(runtimeMetaEl, 'Set about_running_since in frontmatter');
  }

  if (!api) {
    setText(commentsEl, '--');
    setText(likesEl, '--');
    return;
  }

  fetch(api + '/comments/recent?page=1&page_size=1')
    .then(function(res) {
      return res.json();
    })
    .then(function(res) {
      if (res.code !== 200) return;
      setText(commentsEl, formatNumber(Number(res.total || 0)));
    })
    .catch(function() {
      setText(commentsEl, '--');
    });

  fetchTotalCount(api, 'likes', trackedUrls)
    .then(function(total) {
      if (total === null) return;
      setText(likesEl, formatNumber(total));
    })
    .catch(function() {
      setText(likesEl, '--');
    });
}

function initAboutPage() {
  initPhotoSwipeInScope(document);
  initAboutStats();
  renderKatexWhenReady();
}

initAboutPage();
