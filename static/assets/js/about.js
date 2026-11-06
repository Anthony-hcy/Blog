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


// Chronicle 的两个视图：建站历史 / 观影记录
function initChronicleTabs() {
  const tabs = Array.from(document.querySelectorAll('.chronicle-tab'));
  if (!tabs.length) return;
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls') || ''));
  const activate = (index) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      if (panels[i]) panels[i].hidden = !on;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activate(i));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const next = (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      activate(next);
    });
  });
  activate(0);
}

function initAboutPage() {
  initPhotoSwipeInScope(document);
  initAboutStats();
  initChronicleTabs();
  renderKatexWhenReady();
}

initAboutPage();
