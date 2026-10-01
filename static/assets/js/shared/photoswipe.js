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
  let buffered = null; // 后台预缓冲的视频（未播、opacity 0）
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

  function removeBuffered() {
    if (buffered) {
      try { buffered.pause(); } catch (_) {}
      if (buffered.parentNode) buffered.parentNode.removeChild(buffered);
      buffered = null;
    }
  }

  function cleanup() {
    removeVideo();
    removeBuffered();
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
      playBtn.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i> 播放';
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

  // 播放源：优先 H.264 兼容版（587KB 秒加载、全浏览器可播），没有才用原 HEVC
  function preferredSrc(fig) {
    if (!fig) return '';
    const avcSrc = fig.dataset.avcSrc || '';
    if (avcSrc) return avcSrc;
    const srcV = fig.querySelector('video');
    return (srcV && srcV.src) || '';
  }

  // 播放失败兜底：停止 + 提示
  function failHandler() {
    stop();
    showHint('此视频当前设备无法播放');
  }

  // 后台预缓冲：灯箱一打开（或切到实况图）就开始下载，点 ▶ 时已就绪、立即平滑播放
  function prepareBuffer(fig) {
    const holder = slideEl();
    const src = preferredSrc(fig);
    if (!holder || !src || buffered) return;
    const v = document.createElement('video');
    v.className = 'pswp-live-video'; // opacity 0，未 ready 不可见
    v.src = src;
    v.loop = false;
    v.setAttribute('playsinline', '');
    v.playsInline = true;
    v.preload = 'auto';
    v.volume = 1; // 播放自带声音（用户点按手势，浏览器允许有声自动播放）
    v.addEventListener('playing', function () {
      if (video === v) v.classList.add('ready'); // 出画面才淡入
    });
    v.addEventListener('ended', function () { stop(); });
    v.addEventListener('error', failHandler);
    holder.appendChild(v);
    buffered = v;
  }

  function play() {
    const pswp = lightbox.pswp;
    if (!pswp) return;
    if (video) { removeVideo(); stop(); return; } // 播放中点一下 = 停止
    const fig = currentFigure();
    if (!fig) return;
    const src = preferredSrc(fig);
    if (!src) { showHint('该实况图缺少视频文件'); return; }

    // 优先用已预缓冲的元素（点 ▶ 时立即可播，无卡顿）
    let target = buffered;
    buffered = null;
    if (!target) {
      // 极端情况：没来得及预缓冲，现建现播
      const holder = slideEl();
      if (!holder) return;
      target = document.createElement('video');
      target.className = 'pswp-live-video';
      target.loop = false;
      target.setAttribute('playsinline', '');
      target.playsInline = true;
      target.preload = 'auto';
      target.volume = 1;
      target.addEventListener('playing', function () {
        if (video === target) target.classList.add('ready');
      });
      target.addEventListener('ended', function () { stop(); });
      target.addEventListener('error', failHandler);
      target.src = src;
      holder.appendChild(target);
    }
    video = target;
    if (playBtn) {
      playBtn.innerHTML = '<i class="fa-solid fa-pause" aria-hidden="true"></i> 暂停';
      playBtn.classList.add('playing');
    }
    const p = video.play();
    if (p && p.catch) p.catch(failHandler);
  }

  lightbox.on('change', function () {
    cleanup();
    const fig = currentFigure();
    const holder = slideEl();
    if (!fig || !fig.classList || !fig.classList.contains('live-photo') || !holder) return;

    wrap = document.createElement('div');
    wrap.className = 'pswp-live-controls';
    wrap.innerHTML =
      '<button type="button" class="pswp-live-play" aria-label="播放实况"><i class="fa-solid fa-play" aria-hidden="true"></i> 播放</button>';
    holder.appendChild(wrap);
    playBtn = wrap.querySelector('.pswp-live-play');

    playBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation(); // 不触发 PhotoSwipe 的关闭/切页
      play();
    });

    // 后台预缓冲，保证点击即播、平滑无卡顿
    prepareBuffer(fig);
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
