import { createBabelMetricsClient } from './shared/babel-metrics.js';
import { initPhotoSwipeInScope } from './shared/photoswipe.js';
import { renderKatexWhenReady } from './shared/katex-render.js';

function showAuthEditLinksWhenAuthorized() {
  let hasPortalAuthToken = false;
  try {
    hasPortalAuthToken = !!(
      window.localStorage && localStorage.getItem('portal_auth_token')
    );
  } catch (_) {
    hasPortalAuthToken = false;
  }

  if (!hasPortalAuthToken) return;
  document.querySelectorAll('.js-auth-edit').forEach(function(el) {
    el.style.display = 'inline-flex';
  });
}

// 文章页有两处浏览量展示（meta 行 + 底部点赞行）；
// 不蒜子只填充 #busuanzi_value_page_pv，这里把值镜像到底部的 .js-pv-mirror
function mirrorBusuanziPageview() {
  const src = document.getElementById('busuanzi_value_page_pv');
  const targets = document.querySelectorAll('.js-pv-mirror');
  if (!src || !targets.length) return;

  let tries = 0;
  const timer = setInterval(function() {
    tries += 1;
    const value = (src.textContent || '').trim();
    if (value && value !== '0') {
      targets.forEach(function(el) { el.textContent = value; });
      clearInterval(timer);
    } else if (tries >= 40) {
      clearInterval(timer);
    }
  }, 250);
}

function initPostPage() {
  initPhotoSwipeInScope(document);
  const metrics = createBabelMetricsClient({});
  metrics.registerEntries([document]);
  showAuthEditLinksWhenAuthorized();
  mirrorBusuanziPageview();
  renderKatexWhenReady();
}

initPostPage();
