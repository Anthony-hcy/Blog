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

// 灯箱实况控制：当前幻灯片是 live-photo 时，注入 ▶ 播放 + 🔊 声音按钮，
// 播放时用视频覆盖幻灯片（克隆页面缩略图里的 <video>，默认静音）。
function setupLiveLightboxControls(lightbox) {
  let wrap = null;
  let video = null;
  let playBtn = null;
  let soundBtn = null;
  let hintEl = null;

  function cleanup() {
    if (video) {
      try { video.pause(); } catch (_) {}
      video.removeAttribute('src');
      video.load();
      video = null;
    }
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    wrap = null;
    playBtn = null;
    soundBtn = null;
    hintEl = null;
  }

  function stop() {
    if (video) { video.pause(); video.remove(); video = null; }
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
    if (!pswp || video) return;
    const fig = pswp.currSlide && pswp.currSlide.data.element;
    if (!fig) return;
    const srcV = fig.querySelector('video');
    if (!srcV || !srcV.src) { showHint('该实况图缺少视频文件'); return; }
    video = document.createElement('video');
    video.className = 'pswp-live-video';
    video.src = srcV.src;
    video.muted = true;
    video.loop = true;
    video.setAttribute('playsinline', '');
    video.playsInline = true;
    video.preload = 'auto';
    pswp.currSlide.container.appendChild(video);
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

  lightbox.on('change', function () {
    cleanup();
    const pswp = lightbox.pswp;
    if (!pswp || !pswp.currSlide) return;
    const fig = pswp.currSlide.data && pswp.currSlide.data.element;
    if (!fig || !fig.classList || !fig.classList.contains('live-photo')) return;

    wrap = document.createElement('div');
    wrap.className = 'pswp-live-controls';
    wrap.innerHTML =
      '<button type="button" class="pswp-live-play" aria-label="播放实况"><i class="fa-solid fa-play" aria-hidden="true"></i></button>' +
      '<button type="button" class="pswp-live-sound" aria-label="声音" hidden><i class="fa-solid fa-volume-xmark" aria-hidden="true"></i></button>';
    pswp.currSlide.container.appendChild(wrap);
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

  lightbox.on('close', cleanup);
  lightbox.on('destroy', cleanup);
}

export function initPhotoSwipeInScope(scope) {
  collectGalleries(scope).forEach(bindPhotoSwipeGallery);
}

export function initPhotoSwipeInEntries(entries) {
  (entries || []).forEach(initPhotoSwipeInScope);
}
