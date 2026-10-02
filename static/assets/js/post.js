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

function initPostPage() {
  initPhotoSwipeInScope(document);
  showAuthEditLinksWhenAuthorized();
  renderKatexWhenReady();
}

initPostPage();
