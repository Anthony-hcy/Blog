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

// 灯箱实况控制：当前幻灯片是 live-photo 时，左下角注入 ▶ 播放按钮（手机/电脑一致，点击即播）。
// 视频播放一遍自动停（loop=false），自带声音（不再默认静音）。
// 桌面 Chrome/Firefox 播不了 HEVC：优先用 data-avc-src 的 H.264 兼容版。
// 注意：PhotoSwipe 5 的 slide.container 是会被缩放/平移的 .pswp__zoom-wrap，
// 控制层必须挂到 holderElement（.pswp__item，固定视口层）上。
function setupLiveLightboxControls(lightbox) {
  let wrap = null;
  let video = null;
  let videoRemoveTimer = null;
  let playBtn = null;
  let hintEl = null;

  function slideEl() {
    const pswp = lightbox.pswp;
    if (!pswp || !pswp.currSlide) return null;
    return pswp.currSlide.holderElement || pswp.currSlide.container || null;
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
    hintEl = null;
  }

  // 停止：先淡出（去掉 ready 类），280ms 后真正移除；按钮立即复位为 ▶
  function stop() {
    if (video) {
      video.classList.remove('ready');
      clearTimeout(videoRemoveTimer);
      const v = video;
      videoRemoveTimer = setTimeout(function () {
        if (video === v) removeVideo();
      }, 280);
    }
    if (playBtn) {
      playBtn.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i>';
      playBtn.classList.remove('playing');
    }
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
    hintEl._t = setTimeout(function () { if (hintEl) hintEl.hidden = true; }, 3000);
  }

  function currentFigure() {
    const pswp = lightbox.pswp;
    if (!pswp || !pswp.currSlide) return null;
    return pswp.currSlide.data && pswp.currSlide.data.element || null;
  }

  // 尝试用指定 src 播放；onFail 在 play() 拒绝或 error 时调用
  function tryPlay(src, onFail) {
    const holder = slideEl();
    if (!holder) return;
    video = document.createElement('video');
    video.className = 'pswp-live-video';
    video.src = src;
    video.loop = false; // 实况只播一遍
    video.setAttribute('playsinline', '');
    video.playsInline = true;
    video.preload = 'auto';
    video.volume = 1; // 播放自带声音（用户点按手势，浏览器允许有声自动播放）
    // 有画面才淡入，避免黑屏；播完一遍自动停；出错走回退
    video.addEventListener('playing', function () {
      if (video) video.classList.add('ready');
    });
    video.addEventListener('ended', function () { stop(); });
    video.addEventListener('error', onFail);
    holder.appendChild(video);
    if (playBtn) {
      playBtn.innerHTML = '<i class="fa-solid fa-pause" aria-hidden="true"></i>';
      playBtn.classList.add('playing');
    }
    const p = video.play();
    if (p && p.catch) p.catch(onFail);
  }

  function play() {
    const pswp = lightbox.pswp;
    if (!pswp) return;
    if (video) { removeVideo(); stop(); return; } // 播放中点一下 = 停止
    const fig = currentFigure();
    if (!fig) return;
    const srcV = fig.querySelector('video');
    if (!srcV || !srcV.src) { showHint('该实况图缺少视频文件'); return; }
    const hevcSrc = srcV.src;
    const avcSrc = fig.dataset.avcSrc || '';

    // 桌面 Chrome/Firefox 不支持 HEVC → 用 H.264 兼容版；能播 HEVC 的（手机/Edge）用原视频
    const probe = document.createElement('video');
    let hevcOk = false;
    try {
      hevcOk = !!(probe.canPlayType && probe.canPlayType('video/mp4; codecs="hvc1"'));
    } catch (_) {}
    const firstSrc = hevcOk ? hevcSrc : (avcSrc || hevcSrc);

    let avcTried = false;
    function onFail() {
      if (!avcTried && avcSrc && firstSrc !== avcSrc) {
        avcTried = true;
        removeVideo();
        tryPlay(avcSrc, function () {
          stop();
          showHint('此视频当前设备无法播放（编码不支持）');
        });
        return;
      }
      stop();
      showHint(avcSrc ? '此视频当前设备无法播放' : '此视频当前设备无法播放，请在手机上长按观看');
    }
    tryPlay(firstSrc, onFail);
  }

  lightbox.on('change', function () {
    cleanup();
    const fig = currentFigure();
    const holder = slideEl();
    if (!fig || !fig.classList || !fig.classList.contains('live-photo') || !holder) return;

    wrap = document.createElement('div');
    wrap.className = 'pswp-live-controls';
    wrap.innerHTML =
      '<button type="button" class="pswp-live-play" aria-label="播放实况"><i class="fa-solid fa-play" aria-hidden="true"></i></button>';
    holder.appendChild(wrap);
    playBtn = wrap.querySelector('.pswp-live-play');

    playBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation(); // 不触发 PhotoSwipe 的关闭/切页
      play();
    });
  });

  lightbox.on('close', cleanup);
  lightbox.on('destroy', cleanup);
}

export function initPhotoSwipeInScope(scope) {
  collectGalleries(scope).forEach(bindPhotoSwipeGallery);
}

export function initPhotoSwipeInEntries(entries) {
  (entries || []).forEach(initPhotoSwipeInScope);
}
