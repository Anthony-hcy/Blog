import { createBabelMetricsClient } from './shared/babel-metrics.js';
import { initPhotoSwipeInEntries } from './shared/photoswipe.js';
import { normalizeExternalLinks, parsePositiveInt } from './shared/site-core.js';

const ENTRY_SELECTOR = '.entry-article, .entry-memo';

function toPagePath(indexRoot, pageIndex) {
  if (pageIndex <= 1) return indexRoot;
  return indexRoot + 'page/' + pageIndex + '/';
}

function detectCurrentPage() {
  const matched = window.location.pathname.match(/\/page\/(\d+)\/?$/);
  return matched ? Number(matched[1]) : 1;
}

function setStatus(el, state, text) {
  el.dataset.state = state;
  el.textContent = text;
}

function initIndexStream() {
  const feed = document.querySelector('.feed');
  const bottomStatus = document.getElementById('stream-status-bottom');
  if (!feed || !bottomStatus) return;

  const indexRoot = feed.dataset.indexRoot || '/';
  const totalPages = parsePositiveInt(feed.dataset.totalPages || '1', 1);
  const metrics = createBabelMetricsClient({});

  function directEntries() {
    return Array.from(feed.children).filter(function(node) {
      return node.matches && node.matches(ENTRY_SELECTOR);
    });
  }

  function extractPostUrl(node) {
    const likeNode = node.querySelector(
      '.js-like-count[data-like-url], .js-like-btn[data-like-url]'
    );
    if (likeNode && likeNode.dataset.likeUrl) {
      return likeNode.dataset.likeUrl;
    }
    const viewNode = node.querySelector('.js-pageview-count[data-pageview-url]');
    if (viewNode && viewNode.dataset.pageviewUrl) {
      return viewNode.dataset.pageviewUrl;
    }
    const archiveLink = node.querySelector('a[href*="/archives/"]');
    return archiveLink ? archiveLink.getAttribute('href') || '' : '';
  }

  function decorateEntries(entries, pageIndex) {
    entries.forEach(function(entry) {
      entry.dataset.pageIndex = String(pageIndex);
      const postUrl = extractPostUrl(entry);
      if (postUrl) {
        entry.dataset.postUrl = postUrl;
      }
    });
  }

  function initEntries(entries) {
    if (!entries.length) return;
    initPhotoSwipeInEntries(entries);
    entries.forEach(function(entry) {
      normalizeExternalLinks(entry);
    });
    metrics.registerEntries(entries);
  }

  function animateInsertedEntries(entries) {
    entries.forEach(function(entry) {
      entry.classList.add('entry-stream-enter');
      window.setTimeout(function() {
        entry.classList.remove('entry-stream-enter');
      }, 480);
    });
  }

  const currentPage = detectCurrentPage();
  const stream = {
    minLoadedPage: currentPage,
    maxLoadedPage: currentPage,
    loadedPages: new Set([currentPage]),
    loadingTop: false,
    loadingBottom: false,
  };

  function refreshBoundaryStatus() {
    if (stream.loadingBottom) {
      setStatus(bottomStatus, 'loading', 'Loading...');
    } else if (stream.maxLoadedPage >= totalPages) {
      setStatus(bottomStatus, 'end', 'That is all');
    } else {
      setStatus(bottomStatus, 'idle', 'Scroll down for older');
    }
  }

  function getEntriesFromDocument(doc) {
    const remoteFeed = doc.querySelector('.feed');
    if (!remoteFeed) return [];
    return Array.from(remoteFeed.children).filter(function(node) {
      return node.matches && node.matches(ENTRY_SELECTOR);
    });
  }

  async function fetchPageEntries(pageIndex) {
    const targetPath = toPagePath(indexRoot, pageIndex);
    const response = await fetch(targetPath, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error('Failed to load page ' + pageIndex);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return getEntriesFromDocument(doc);
  }

  const topSentinel = document.createElement('div');
  topSentinel.className = 'stream-sentinel stream-sentinel-top';
  topSentinel.setAttribute('aria-hidden', 'true');

  const bottomSentinel = document.createElement('div');
  bottomSentinel.className = 'stream-sentinel stream-sentinel-bottom';
  bottomSentinel.setAttribute('aria-hidden', 'true');

  async function loadNewerPage() {
    const targetPage = stream.minLoadedPage - 1;
    if (stream.loadingTop || targetPage < 1 || stream.loadedPages.has(targetPage)) {
      return;
    }

    stream.loadingTop = true;
    refreshBoundaryStatus();

    try {
      const anchor = directEntries()[0] || null;
      const beforeTop = anchor ? anchor.getBoundingClientRect().top : 0;

      const entries = await fetchPageEntries(targetPage);
      decorateEntries(entries, targetPage);
      initEntries(entries);

      const fragment = document.createDocumentFragment();
      entries.forEach(function(entry) {
        fragment.appendChild(entry);
      });
      feed.insertBefore(fragment, topSentinel.nextSibling);
      animateInsertedEntries(entries);

      if (anchor) {
        const afterTop = anchor.getBoundingClientRect().top;
        window.scrollBy(0, afterTop - beforeTop);
      }

      stream.loadedPages.add(targetPage);
      stream.minLoadedPage = Math.min(stream.minLoadedPage, targetPage);
    } catch (error) {
      window.console.error(error);
    } finally {
      stream.loadingTop = false;
      refreshBoundaryStatus();
    }
  }

  async function loadOlderPage() {
    const targetPage = stream.maxLoadedPage + 1;
    if (
      stream.loadingBottom ||
      targetPage > totalPages ||
      stream.loadedPages.has(targetPage)
    ) {
      return;
    }

    stream.loadingBottom = true;
    refreshBoundaryStatus();

    try {
      const entries = await fetchPageEntries(targetPage);
      decorateEntries(entries, targetPage);
      initEntries(entries);

      const fragment = document.createDocumentFragment();
      entries.forEach(function(entry) {
        fragment.appendChild(entry);
      });
      feed.insertBefore(fragment, bottomSentinel);
      animateInsertedEntries(entries);

      stream.loadedPages.add(targetPage);
      stream.maxLoadedPage = Math.max(stream.maxLoadedPage, targetPage);
    } catch (_) {
      setStatus(bottomStatus, 'error', 'Loading failed');
    } finally {
      stream.loadingBottom = false;
      refreshBoundaryStatus();
    }
  }

  const initialEntries = directEntries();
  decorateEntries(initialEntries, currentPage);
  initEntries(initialEntries);

  feed.insertBefore(topSentinel, feed.firstChild);
  feed.appendChild(bottomSentinel);
  refreshBoundaryStatus();

  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(
    function(items) {
      items.forEach(function(item) {
        if (!item.isIntersecting) return;
        if (item.target === topSentinel) {
          loadNewerPage();
        }
        if (item.target === bottomSentinel) {
          loadOlderPage();
        }
      });
    },
    {
      root: null,
      rootMargin: '600px 0px 600px 0px',
      threshold: 0,
    }
  );

  observer.observe(topSentinel);
  observer.observe(bottomSentinel);
}

initIndexStream();
