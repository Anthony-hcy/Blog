import { initPhotoSwipeInScope } from './shared/photoswipe.js';
import { renderKatexWhenReady } from './shared/katex-render.js';

// Views 卡片由不蒜子（#busuanzi_value_site_pv）填充；
// 点赞/评论统计已随可写后端一并移除，这里只剩建站天数。

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

function initAboutStats() {
  const section = document.querySelector('.js-about-stats');
  if (!section) return;

  const runtimeValueEl = section.querySelector('.js-about-runtime-value');
  const runtimeMetaEl = section.querySelector('.js-about-runtime-meta');

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
}

function initAboutPage() {
  initPhotoSwipeInScope(document);
  initAboutStats();
  renderKatexWhenReady();
}

initAboutPage();
