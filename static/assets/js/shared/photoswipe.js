const PHOTOSWIPE_STYLE_URL =
  'https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe.css';
const PHOTOSWIPE_LIGHTBOX_URL =
  'https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe-lightbox.esm.min.js';
const PHOTOSWIPE_CORE_URL =
  'https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe.esm.min.js';

let photoswipeModulesPromise = null;
let photoswipeStylesRequested = false;

function ensurePhotoSwipeStylesheet() {
  if (photoswipeStylesRequested) return;
  photoswipeStylesRequested = true;
  if (typeof document === 'undefined' || !document.head) return;

  if (document.querySelector('link[data-photoswipe-style="1"]')) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = PHOTOSWIPE_STYLE_URL;
  link.media = 'print';
  link.dataset.photoswipeStyle = '1';
  link.onload = function() {
    link.media = 'all';
  };
  document.head.appendChild(link);
}

function loadPhotoSwipeModules() {
  if (photoswipeModulesPromise) {
    return photoswipeModulesPromise;
  }

  photoswipeModulesPromise = Promise.all([
    import(PHOTOSWIPE_LIGHTBOX_URL),
    import(PHOTOSWIPE_CORE_URL),
  ])
    .then(function(modules) {
      return {
        PhotoSwipeLightbox: modules[0] && modules[0].default,
        PhotoSwipe: modules[1] && modules[1].default,
      };
    })
    .catch(function() {
      photoswipeModulesPromise = null;
      return null;
    });

  return photoswipeModulesPromise;
}

function collectGalleries(scope) {
  if (!scope) return [];

  const galleries = [];
  if (scope.matches && scope.matches('.pswp-gallery')) {
    galleries.push(scope);
  }
  if (scope.querySelectorAll) {
    galleries.push.apply(galleries, Array.from(scope.querySelectorAll('.pswp-gallery')));
  }

  return galleries;
}

function bindPhotoSwipeGallery(gallery) {
  if (!gallery || gallery.dataset.pswpBound === '1') return;

  const items = gallery.querySelectorAll('.pswp-item');
  if (!items.length) return;

  gallery.dataset.pswpBound = '1';

  ensurePhotoSwipeStylesheet();
  loadPhotoSwipeModules().then(function(modules) {
    if (!modules || !gallery.isConnected) return;

    const lightbox = new modules.PhotoSwipeLightbox({
      gallery: gallery,
      children: '.pswp-item',
      pswpModule: modules.PhotoSwipe,
      bgOpacity: 0.9,
      padding: { top: 20, bottom: 20, left: 20, right: 20 },
    });

    lightbox.addFilter('itemData', function(itemData) {
      const figure = itemData.element;
      if (!figure) return itemData;

      const img = figure.querySelector('img');
      if (!img) return itemData;

      itemData.src = img.src;
      itemData.w = parseInt(
        figure.dataset.pswpWidth || img.naturalWidth || img.width,
        10
      );
      itemData.h = parseInt(
        figure.dataset.pswpHeight || img.naturalHeight || img.height,
        10
      );

      const caption = figure.querySelector('figcaption');
      if (caption) {
        itemData.alt = caption.innerText;
      }
      return itemData;
    });

    setupLiveLightboxControls(lightbox);
    lightbox.init();
  });
}

// 灯箱实况控制：当前幻灯片是 live-photo 时，注入 ▶ 播放 + 🔊 声音按钮 + 视频覆盖层，
// 并支持手机在灯箱内长按播放（拦截浏览器 contextmenu）。
// 注意：PhotoSwipe 5 的 slide.container 是会被缩放/平移的 .pswp__zoom-wrap，
// 控制层必须挂到 holderElement（.pswp__item，固定视口层）上。
function setupLiveLightboxControls(lightbox) {
  let wrap = null;
  let video = null;
  let videoRemoveTimer = null;
  let playBtn = null;
  let soundBtn = null;
  let hintEl = null;

  // 手机灯箱内长按：450ms 播放 / 移动>12px 取消 / 长按后拦 click 与 contextmenu
  let holdTimer = null;
  let holdStart = null;
  let suppressClickUntil = 0;

  function slideEl() {
    const pswp = lightbox.pswp;
    if (!pswp || !pswp.currSlide) return null;
    return pswp.currSlide.holderElement || pswp.currSlide.container || null;
  }

  function clearHold() {
    clearTimeout(holdTimer);
    holdTimer = null;
    holdStart = null;
  }

  // 视频移除：清掉淡出定时器，直接从 DOM 移除
  function removeVideo() {
    clearTimeout(videoRemoveTimer);
    videoRemoveTimer = null;
    if (video) {
      try { video.pause(); } catch (_) {}
      if (video.parentNode) video.parentNode.removeChild(video);
      video = null;
    }
  }

  function cleanup() {
    removeVideo();
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    wrap = null;
    playBtn = null;
    soundBtn = null;
    hintEl = null;
    clearHold();
  }

  // 停止：先淡出（去掉 ready 类），280ms 后真正移除；按钮立即复位
  function stop() {
    if (video) {
      video.classList.remove('ready');
      clearTimeout(videoRemoveTimer);
      const v = video;
      videoRemoveTimer = setTimeout(function () {
        if (video === v) removeVideo();
      }, 280);
    }
    if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i>';
    if (soundBtn) soundBtn.hidden = true;
  }

  function showHint(text) {
    if (!wrap) return;
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.className = 'pswp-live-hint';
      wrap.appendChild(hintEl);
    }
    hintEl.textContent = text;
    hintEl.hidden = false;
    clearTimeout(hintEl._t);
    hintEl._t = setTimeout(function () { if (hintEl) hintEl.hidden = true; }, 2500);
  }

  function play() {
    const pswp = lightbox.pswp;
    if (!pswp) return;
    // 上一遍还在淡出时再播 → 直接移除重播
    if (video) removeVideo();
    const fig = pswp.currSlide && pswp.currSlide.data && pswp.currSlide.data.element;
    if (!fig) return;
    const srcV = fig.querySelector('video');
    if (!srcV || !srcV.src) { showHint('该实况图缺少视频文件'); return; }
    const holder = slideEl();
    if (!holder) return;
    video = document.createElement('video');
    video.className = 'pswp-live-video';
    video.src = srcV.src;
    video.muted = true;
    video.loop = false; // 实况只播一遍
    video.setAttribute('playsinline', '');
    video.playsInline = true;
    video.preload = 'auto';
    // 有画面才淡入，避免黑屏；播完一遍自动停；出错兜底回封面
    video.addEventListener('playing', function () {
      if (video) video.classList.add('ready');
    });
    video.addEventListener('ended', function () { stop(); });
    video.addEventListener('error', function () {
      stop();
      showHint('此视频当前设备无法播放（HEVC），请在手机上长按观看');
    });
    holder.appendChild(video);
    if (soundBtn) soundBtn.hidden = false;
    if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-pause" aria-hidden="true"></i>';
    const p = video.play();
    if (p && p.catch) {
      p.catch(function () {
        stop();
        showHint('此视频当前设备无法播放（HEVC），请在手机上长按观看');
      });
    }
  }

  function isLiveSlideNode(node) {
    return !!(node && node.closest && node.closest('.pswp-live-slide'));
  }

  // 灯箱内长按（手机）：捕获阶段先于 PhotoSwipe 的触摸处理，但不阻止其手势
  document.addEventListener('touchstart', function (e) {
    if (!isLiveSlideNode(e.target) || e.touches.length > 1) return;
    clearHold();
    holdStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    holdTimer = setTimeout(function () {
      if (!holdStart) return;
      suppressClickUntil = Date.now() + 700;
      play();
    }, 450);
  }, { passive: true, capture: true });

  document.addEventListener('touchmove', function (e) {
    if (!holdStart || !e.touches.length) return;
    const dx = e.touches[0].clientX - holdStart.x;
    const dy = e.touches[0].clientY - holdStart.y;
    if (dx * dx + dy * dy > 12 * 12) clearHold();
  }, { passive: true, capture: true });

  function endHold() { clearHold(); }
  document.addEventListener('touchend', endHold, { capture: true });
  document.addEventListener('touchcancel', endHold, { capture: true });

  // 灯箱实况图长按：拦浏览器菜单（Android/iOS）
  document.addEventListener('contextmenu', function (e) {
    if (isLiveSlideNode(e.target)) e.preventDefault();
  }, { capture: true });

  // 长按松手后的 click 拦下，避免 PhotoSwipe 误关灯箱/切换 UI
  document.addEventListener('click', function (e) {
    if (Date.now() < suppressClickUntil && isLiveSlideNode(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true });

  lightbox.on('change', function () {
    cleanup();
    const pswp = lightbox.pswp;
    if (!pswp || !pswp.currSlide) return;
    const fig = pswp.currSlide.data && pswp.currSlide.data.element;
    const holder = slideEl();
    if (!fig || !fig.classList || !fig.classList.contains('live-photo') || !holder) return;

    holder.classList.add('pswp-live-slide');
    wrap = document.createElement('div');
    wrap.className = 'pswp-live-controls';
    wrap.innerHTML =
      '<button type="button" class="pswp-live-play" aria-label="播放实况"><i class="fa-solid fa-play" aria-hidden="true"></i></button>' +
      '<button type="button" class="pswp-live-sound" aria-label="声音" hidden><i class="fa-solid fa-volume-xmark" aria-hidden="true"></i></button>';
    holder.appendChild(wrap);
    playBtn = wrap.querySelector('.pswp-live-play');
    soundBtn = wrap.querySelector('.pswp-live-sound');

    playBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation(); // 不触发 PhotoSwipe 的关闭/切页
      if (video) { stop(); } else { play(); }
    });
    soundBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!video) return;
      video.muted = !video.muted;
      soundBtn.innerHTML = video.muted
        ? '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>';
    });
  });

  lightbox.on('close', function () {
    const pswp = lightbox.pswp;
    const holder = slideEl();
    cleanup();
    if (holder) holder.classList.remove('pswp-live-slide');
  });
  lightbox.on('destroy', cleanup);
}

export function initPhotoSwipeInScope(scope) {
  collectGalleries(scope).forEach(bindPhotoSwipeGallery);
}

export function initPhotoSwipeInEntries(entries) {
  (entries || []).forEach(initPhotoSwipeInScope);
}
