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

  function setActive(el) {
    links.forEach(function (link) {
      link.classList.toggle('is-active', link === toTarget[el.id]);
    });
  }

  function update() {
    ticking = false;
    var offset = 80;
    var current = targets[0];
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].getBoundingClientRect().top - offset <= 0) current = targets[i];
      else break;
    }
    // 滚到底部时，最后一段可能永远顶不到 offset 以上
    if (scroller && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
      current = targets[targets.length - 1];
    }
    setActive(current);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }

  (scroller || window).addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  links.forEach(function (link) {
    link.addEventListener('click', function (event) {
      var id = link.getAttribute('data-toc-target');
      var el = id ? document.getElementById(id) : null;
      if (!el) return;
      event.preventDefault();
      // 自己算滚动位置，比 scrollIntoView 稳：偏移固定 16px，不会因为 scroll-margin 失效而顶到边缘
      var gap = 16;
      if (scroller && scroller !== document.scrollingElement && scroller.scrollHeight > scroller.clientHeight) {
        var delta = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - gap;
        scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'smooth' });
      } else {
        var top = el.getBoundingClientRect().top + window.scrollY - gap;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
      setActive(el);
      // 手机上目录在抽屉里，跳转后顺手把抽屉收起来，否则会挡着正文
      var drawerClose = document.querySelector('.js-menu-close');
      if (drawerClose && window.matchMedia('(max-width: 819px)').matches) drawerClose.click();
      // 平滑滚动结束后再校准一次，避免高亮停在上一节
      var settle = function () {
        setActive(el);
        window.removeEventListener('scrollend', settle);
      };
      window.addEventListener('scrollend', settle, { once: true });
      window.setTimeout(settle, 900);
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
