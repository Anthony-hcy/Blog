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

// 侧栏「本页目录」：滚动时高亮当前小节，点目录平滑跳到对应标题。
// 正文标题的 id 由构建脚本生成，目录元素是 .side-toc .toc-link[data-toc-target]。
function initTocSpy() {
  var links = Array.prototype.slice.call(document.querySelectorAll('.side-toc .toc-link'));
  if (!links.length) return;

  var toTarget = {};
  var targets = [];
  links.forEach(function (link) {
    var id = link.getAttribute('data-toc-target');
    var el = id ? document.getElementById(id) : null;
    if (!el) return;
    toTarget[id] = link;
    targets.push(el);
  });
  if (!targets.length) return;

  var scroller = document.querySelector('.app-shell .container') || document.scrollingElement;
  var ticking = false;
  // 点目录跳转后，滚动过程里的中间位置会把高亮拉回上一节，看起来像「慢半拍」。
  // 跳转期间锁定目标章节，滚动停下（scrollend / 700ms 兜底）再解锁重新校准。
  var lockedId = '';
  var lockUntil = 0;
  var lockTargetTop = 0;

  function setActiveId(id) {
    links.forEach(function (link) {
      link.classList.toggle('is-active', link === toTarget[id]);
    });
  }

  // 侧栏目录顶部：当前章节名 + 阅读进度百分比
  var percentEl = document.getElementById('toc-percent');
  var barEl = document.getElementById('toc-progress-bar');
  var progressWrap = document.getElementById('toc-progress');
  var currentEl = document.getElementById('toc-current');
  var lastPercent = -1;
  var lastCurrent = '';

  function updateTocProgress(id) {
    var activeEl = toTarget[id] ? document.getElementById(id) : null;
    var title = activeEl ? String(activeEl.textContent || '').trim() : '';
    if (currentEl && title && title !== lastCurrent) {
      currentEl.textContent = title;
      currentEl.setAttribute('title', '当前章节：' + title);
      lastCurrent = title;
    }
    var max = 0;
    var top = 0;
    if (scroller && scroller !== document.scrollingElement) {
      max = scroller.scrollHeight - scroller.clientHeight;
      top = scroller.scrollTop;
    } else {
      max = document.documentElement.scrollHeight - window.innerHeight;
      top = window.scrollY;
    }
    var percent = max > 24 ? Math.min(100, Math.max(0, Math.round((top / max) * 100))) : 100;
    if (percent === lastPercent) return;
    lastPercent = percent;
    if (percentEl) percentEl.textContent = percent + '%';
    if (barEl) barEl.style.width = percent + '%';
    if (progressWrap) progressWrap.setAttribute('aria-valuenow', String(percent));
  }

  function currentId() {
    // 偏移量按「容器顶部」算：点目录跳转后标题就停在容器顶下方 16px，
    // 之前按视口算会把刚跳到的这一节判成「还没到」，高亮就停在上一节。
    var offset = 80;
    var base = scroller && scroller !== document.scrollingElement
      ? scroller.getBoundingClientRect().top
      : 0;
    var current = targets[0];
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].getBoundingClientRect().top - base - offset <= 0) current = targets[i];
      else break;
    }
    // 滚到底部时，最后一段可能永远顶不到 offset 以上
    if (scroller && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
      current = targets[targets.length - 1];
    }
    return current.id;
  }

  function update() {
    ticking = false;
    var id = '';
    if (lockedId) {
      // 平滑滚动还没结束时保持锁定的那一节；滚到目标位置后继续锁定，
      // 只有用户自己滚开（偏离超过 48px）才放开
      var near = Math.abs((scroller ? scroller.scrollTop : window.scrollY) - lockTargetTop) <= 48;
      if (near || performance.now() < lockUntil) id = lockedId;
      else lockedId = '';
    }
    if (!id) id = currentId();
    setActiveId(id);
    updateTocProgress(id);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }

  function releaseLock() {
    if (!lockedId) return;
    lockedId = '';
    update();
  }

  function lockTo(id, targetTop) {
    lockedId = id;
    lockTargetTop = targetTop;
    lockUntil = performance.now() + 900;
  }

  (scroller || window).addEventListener('scroll', onScroll, { passive: true });
  if (scroller && scroller.addEventListener) scroller.addEventListener('scrollend', releaseLock);
  window.addEventListener('resize', onScroll);
  // 用户自己滚轮/触摸时立刻解锁，不要跟用户抢高亮
  if (scroller && scroller.addEventListener) {
    scroller.addEventListener('wheel', releaseLock, { passive: true });
    scroller.addEventListener('touchstart', releaseLock, { passive: true });
  }
  update();

  links.forEach(function (link) {
    link.addEventListener('click', function (event) {
      var id = link.getAttribute('data-toc-target');
      var el = id ? document.getElementById(id) : null;
      if (!el) return;
      event.preventDefault();
      // 自己算滚动位置，比 scrollIntoView 稳：偏移固定 16px，不会因为 scroll-margin 失效而顶到边缘
      var gap = 16;
      var useContainer = scroller && scroller !== document.scrollingElement
        && scroller.scrollHeight > scroller.clientHeight;
      var targetTop = useContainer
        ? scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - gap
        : el.getBoundingClientRect().top + window.scrollY - gap;
      targetTop = Math.max(0, targetTop);
      // 先锁定并立刻高亮，滚动全程保持这一节，避免中途被中间位置覆盖
      lockTo(id, targetTop);
      setActiveId(id);
      updateTocProgress(id);
      if (useContainer) scroller.scrollTo({ top: targetTop, behavior: 'smooth' });
      else window.scrollTo({ top: targetTop, behavior: 'smooth' });
      // 手机上目录在抽屉里，跳转后顺手把抽屉收起来，否则会挡着正文
      var drawerClose = document.querySelector('.js-menu-close');
      if (drawerClose && window.matchMedia('(max-width: 819px)').matches) drawerClose.click();
      if (window.history && history.replaceState) history.replaceState(null, '', '#' + id);
    });
  });
}
function initPostPage() {
  initPhotoSwipeInScope(document);
  showAuthEditLinksWhenAuthorized();
  renderKatexWhenReady();
  initTocSpy();
}

initPostPage();
