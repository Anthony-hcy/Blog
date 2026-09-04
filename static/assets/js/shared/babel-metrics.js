import { buildApiRoots, readTrackingIdentity } from './site-core.js';
import { waitForPageviewTracked } from './babel-pageview.js';

function addToMap(map, key, el) {
  if (!key) return;
  if (!map[key]) map[key] = [];
  map[key].push(el);
}

function collectEntryElements(entries) {
  const scopedEntries = Array.from(entries || []);
  return {
    viewCounters: scopedEntries
      .map(function(entry) {
        return Array.from(entry.querySelectorAll('.js-pageview-count[data-pageview-url]'));
      })
      .flat(),
    likeCounters: scopedEntries
      .map(function(entry) {
        return Array.from(entry.querySelectorAll('.js-like-count[data-like-url]'));
      })
      .flat(),
    likeButtons: scopedEntries
      .map(function(entry) {
        return Array.from(entry.querySelectorAll('.js-like-btn[data-like-url]'));
      })
      .flat(),
    commentCounters: scopedEntries
      .map(function(entry) {
        return Array.from(entry.querySelectorAll('.js-comment-count[data-comment-post-id]'));
      })
      .flat(),
  };
}

export function createBabelMetricsClient(options) {
  const opts = options || {};
  const roots = buildApiRoots(opts.apiBase || '');
  const api = roots.babelApi;

  const viewByUrl = {};
  const likeByUrl = {};
  const commentsByPostId = {};

  const loadedViewUrls = new Set();
  const loadedLikeUrls = new Set();
  const loadedCommentIds = new Set();

  function updateViewCounts(counts) {
    if (!counts || typeof counts !== 'object') return;
    Object.keys(counts).forEach(function(url) {
      if (!viewByUrl[url]) return;
      const count = Number(counts[url] || 0);
      viewByUrl[url].forEach(function(el) {
        el.textContent = String(count);
      });
    });
  }

  function updateLikeCounts(counts) {
    if (!counts || typeof counts !== 'object') return;
    Object.keys(counts).forEach(function(url) {
      if (!likeByUrl[url]) return;
      const count = Number(counts[url] || 0);
      likeByUrl[url].forEach(function(el) {
        el.textContent = String(count);
      });
    });
  }

  function updateCommentCount(postId, count) {
    (commentsByPostId[postId] || []).forEach(function(el) {
      el.textContent = String(count);
    });
  }

  function fetchMetricsBatch(urls, postIds) {
    if (!api || (!urls.length && !postIds.length)) return Promise.resolve();
    const params = new URLSearchParams();
    urls.forEach(function(url) {
      params.append('url', url);
    });
    postIds.forEach(function(postId) {
      params.append('post_id', postId);
    });

    return waitForPageviewTracked(1200)
      .then(function() {
        return fetch(api + '/metrics?' + params.toString());
      })
      .then(function(res) {
        return res.json();
      })
      .then(function(res) {
        const payload = res && res.data;
        if (res.code !== 200 || !payload || typeof payload !== 'object') {
          throw new Error('Bad metrics response');
        }

        updateViewCounts(payload.pageviews || {});
        updateLikeCounts(payload.likes || {});
        postIds.forEach(function(postId) {
          updateCommentCount(postId, Number((payload.comments || {})[postId] || 0));
        });
      })
      .catch(function() {
        urls.forEach(function(url) {
          (viewByUrl[url] || []).forEach(function(el) {
            el.textContent = '0';
          });
          (likeByUrl[url] || []).forEach(function(el) {
            el.textContent = '0';
          });
        });
        postIds.forEach(function(postId) {
          updateCommentCount(postId, 0);
        });
      });
  }

  function bindLikeButtons(buttons) {
    if (!api) return;
    buttons.forEach(function(btn) {
      if (btn.dataset.likeBound === '1') return;
      btn.dataset.likeBound = '1';

      btn.addEventListener('click', function() {
        if (btn.disabled) return;
        const url = btn.dataset.likeUrl;
        if (!url) return;

        btn.disabled = true;
        const payload = { url: url };
        const identity = readTrackingIdentity();
        if (identity.username) payload.username = identity.username;
        if (identity.email) payload.email = identity.email;

        fetch(api + '/like', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function(res) {
            return res.json();
          })
          .then(function(res) {
            if ((res.code === 201 || res.code === 200) && res.data) {
              const count = Number(res.data.count || 0);
              (likeByUrl[url] || []).forEach(function(el) {
                el.textContent = String(count);
              });
            }
          })
          .catch(function() {})
          .finally(function() {
            setTimeout(function() {
              btn.disabled = false;
            }, 300);
          });
      });
    });
  }

  function registerElements(payload) {
    const parts = payload || {};
    const viewCounters = parts.viewCounters || [];
    const likeCounters = parts.likeCounters || [];
    const likeButtons = parts.likeButtons || [];
    const commentCounters = parts.commentCounters || [];

    viewCounters.forEach(function(el) {
      addToMap(viewByUrl, el.dataset.pageviewUrl, el);
    });
    likeCounters.forEach(function(el) {
      addToMap(likeByUrl, el.dataset.likeUrl, el);
    });
    commentCounters.forEach(function(el) {
      addToMap(commentsByPostId, el.dataset.commentPostId, el);
    });

    const newViewUrls = [];
    Object.keys(viewByUrl).forEach(function(url) {
      if (loadedViewUrls.has(url)) return;
      loadedViewUrls.add(url);
      newViewUrls.push(url);
    });

    const newLikeUrls = [];
    Object.keys(likeByUrl).forEach(function(url) {
      if (loadedLikeUrls.has(url)) return;
      loadedLikeUrls.add(url);
      newLikeUrls.push(url);
    });

    const newCommentIds = [];
    Object.keys(commentsByPostId).forEach(function(postId) {
      if (loadedCommentIds.has(postId)) return;
      loadedCommentIds.add(postId);
      newCommentIds.push(postId);
    });

    const mergedUrls = [];
    const seenUrls = new Set();
    newViewUrls.concat(newLikeUrls).forEach(function(url) {
      if (seenUrls.has(url)) return;
      seenUrls.add(url);
      mergedUrls.push(url);
    });

    fetchMetricsBatch(mergedUrls, newCommentIds).catch(function() {});

    bindLikeButtons(likeButtons);
  }

  function registerEntries(entries) {
    registerElements(collectEntryElements(entries));
  }

  return {
    hasApi: !!api,
    api: api,
    registerEntries: registerEntries,
    registerElements: registerElements,
  };
}
