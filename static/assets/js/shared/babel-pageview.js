import { buildApiRoots, readTrackingIdentity } from './site-core.js';

function dispatchTrackedEvent() {
  try {
    window.dispatchEvent(new Event('babel:pageview-tracked'));
  } catch (_) {
    if (typeof document.createEvent === 'function') {
      const event = document.createEvent('Event');
      event.initEvent('babel:pageview-tracked', true, true);
      window.dispatchEvent(event);
    }
  }
}

export function waitForPageviewTracked(timeoutMs) {
  if (window.__babelPageviewReady) return window.__babelPageviewReady;

  return new Promise(function(resolve) {
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      resolve();
    }

    window.addEventListener('babel:pageview-tracked', finish, { once: true });
    window.setTimeout(finish, timeoutMs || 1200);
  });
}

export function ensurePageviewTracked(config) {
  if (window.__babelPageviewReady) return window.__babelPageviewReady;

  const apiRoots = buildApiRoots(config && config.apiBase ? config.apiBase : '');
  const path = String((config && config.url) || window.location.pathname || '/');
  const normalizedPath = path.endsWith('/') ? path : path + '/';

  const payload = { url: normalizedPath };
  const identity = readTrackingIdentity();
  if (identity.username) payload.username = identity.username;
  if (identity.email) payload.email = identity.email;

  let request = Promise.resolve();
  if (apiRoots.babelApi) {
    window.__babelPageviewTracked = true;
    request = fetch(apiRoots.babelApi + '/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(function() {});
  }

  window.__babelPageviewReady = request.then(function() {
    window.__babelPageviewDone = true;
    dispatchTrackedEvent();
  });

  return window.__babelPageviewReady;
}
