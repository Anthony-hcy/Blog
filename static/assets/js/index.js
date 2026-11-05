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
  // 首页的滚动容器是 .container（不是 window），补位与还原都要对它操作
  const container = document.querySelector('.container');

  function directEntries() {
    return Array.from(feed.children).filter(function(node) {
      return node.matches && node.matches(ENTRY_SELECTOR);
    });
  }

  function initEntries(entries) {
    if (!entries.length) return;
    initPhotoSwipeInEntries(entries);
    entries.forEach(function(entry) {
      normalizeExternalLinks(entry);
    });
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
    bottomError: false,
  };

  function refreshBoundaryStatus() {
    if (stream.loadingBottom) {
      setStatus(bottomStatus, 'loading', 'Loading...');
    } else if (stream.bottomError) {
      // 原来 catch 里刚写完错误就被 finally 的这次刷新覆盖，读者永远看不到失败提示
      setStatus(bottomStatus, 'error', 'Loading failed');
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
      initEntries(entries);

      const fragment = document.createDocumentFragment();
      entries.forEach(function(entry) {
        fragment.appendChild(entry);
      });
      feed.insertBefore(fragment, topSentinel.nextSibling);
      animateInsertedEntries(entries);

      if (anchor) {
        const afterTop = anchor.getBoundingClientRect().top;
        // 原来写的是 window.scrollBy：本站滚动的是 .container，window 不滚，等于没补位，
        // 加载「更新的一页」时正文会整体往下窜一段。这里改成对真实滚动容器补位。
        const delta = afterTop - beforeTop;
        if (container) {
          container.scrollBy(0, delta);
        } else {
          window.scrollBy(0, delta);
        }
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
      initEntries(entries);

      const fragment = document.createDocumentFragment();
      entries.forEach(function(entry) {
        fragment.appendChild(entry);
      });
      feed.insertBefore(fragment, bottomSentinel);
      animateInsertedEntries(entries);

      stream.loadedPages.add(targetPage);
      stream.maxLoadedPage = Math.max(stream.maxLoadedPage, targetPage);
      stream.bottomError = false;
    } catch (_) {
      stream.bottomError = true;
    } finally {
      stream.loadingBottom = false;
      refreshBoundaryStatus();
    }
  }

  const initialEntries = directEntries();
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

  // --- 从文章返回列表时恢复阅读位置 ---
  // 浏览器自带的返回还原在「内容是异步追加」的首页上会失效（回来时只渲染了第 1 页，
  // 目标位置超出文档高度就被夹到最底部），所以自己记一份，回来时边加载边滚到目标位置。
  const scrollKey = 'feedScroll:' + window.location.pathname;

  function saveScrollPosition() {
    if (!container) return;
    try {
      // 用户主动点站名 / Home 回首页时不记位置（那是「重新开始浏览」，不是「返回」）
      if (window.sessionStorage.getItem('feedScrollReset') === '1') return;
      window.sessionStorage.setItem(scrollKey, String(Math.round(container.scrollTop)));
    } catch (_) {}
  }

  if (container) {
    // 捕获阶段先存位置：点开任意文章链接前，把当前滚动位置记下来
    feed.addEventListener('click', function(event) {
      const link = event.target.closest ? event.target.closest('a[href]') : null;
      if (!link) return;
      if (link.hasAttribute('data-home-link')) return; // 回首页=回到顶部，不记忆位置
      saveScrollPosition();
    }, true);
    window.addEventListener('pagehide', saveScrollPosition);
  }

  function restoreScrollPosition() {
    if (!container) return;
    // 上一次是「点站名 / Home」回首页的：清掉标记，这次从顶部开始，不恢复位置
    try {
      if (window.sessionStorage.getItem('feedScrollReset') === '1') {
        window.sessionStorage.removeItem('feedScrollReset');
        return;
      }
    } catch (_) {}
    let saved = 0;
    try {
      saved = parseInt(window.sessionStorage.getItem(scrollKey) || '0', 10) || 0;
    } catch (_) { saved = 0; }
    if (saved < 200) return;

    // 只在「从文章页返回」时还原，正常从导航进首页不该跳位置
    const ref = document.referrer || '';
    const sameOrigin = ref.indexOf(window.location.origin) === 0;
    if (!sameOrigin || ref.indexOf('/archives/') < 0) return;

    let tries = 0;
    const timer = window.setInterval(function() {
      tries += 1;
      container.scrollTop = saved;
      const maxScroll = container.scrollHeight - container.clientHeight;
      // 目标位置已可达（或明显不可能再长、或超时）就停
      if (Math.abs(container.scrollTop - saved) <= 2 || maxScroll >= saved || tries > 20) {
        window.clearInterval(timer);
      }
    }, 200);
  }

  restoreScrollPosition();
}


// --- memo 折叠（首页 feed） ---
// 服务端已把超长 memo 渲染成 .memo-fold.is-collapsed + 按钮，这里只做点击切换。
// 用事件委托，无限滚动后注入的旧分页 memo 同样能展开/收起。
function initMemoFolds() {
  document.addEventListener('click', function (event) {
    var toggle = event.target.closest ? event.target.closest('[data-memo-fold-toggle]') : null;
    if (!toggle) return;
    var fold = toggle.closest('[data-memo-fold]');
    if (!fold) return;
    var collapsed = fold.classList.toggle('is-collapsed');
    fold.classList.toggle('is-expanded', !collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    var label = toggle.querySelector('.memo-fold-label');
    if (label) label.textContent = collapsed ? '展开' : '收起';
  });
}

initMemoFolds();
initIndexStream();
