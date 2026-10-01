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

  // 停止：先淡出（去掉 ready 类），280ms 后真正移除；按钮立即复位为 ▶ 播放
  function stop() {
    if (video) {
      video.classList.remove('ready');
      clearTimeout(videoRemoveTimer);
      const v = video;
      videoRemoveTimer = setTimeout(function () {
        if (video === v) removeVideo();
      }, 280);
    }
    setButtonPlay();
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

  // 播放失败兜底：停止 + 提示
  function failHandler() {
    stop();
    showHint('此视频当前设备无法播放');
  }

  // 按钮进入"加载中"状态（下载慢时给出反馈，避免看起来像卡死）
  function setButtonLoading() {
    if (playBtn) {
      playBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> 加载中';
      playBtn.classList.remove('playing');
    }
  }

  function setButtonPaused() {
    if (playBtn) {
      playBtn.innerHTML = '<i class="fa-solid fa-pause" aria-hidden="true"></i> 暂停';
      playBtn.classList.add('playing');
    }
  }

  function setButtonPlay() {
    if (playBtn) {
      playBtn.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i> 播放';
      playBtn.classList.remove('playing');
    }
  }

  // 后台预缓冲：灯箱一打开（或切到实况图）就准备好视频元素（优先用已下载到内存的 Blob），
  // 点 ▶ 时立即可播、平滑无卡顿
  function prepareBuffer(fig) {
    const holder = slideEl();
    const src = playbackSrc(fig);
    if (!holder || !src || buffered) return;
    const v = document.createElement('video');
    v.className = 'pswp-live-video'; // opacity 0，未 ready 不可见
    v.src = src;
    v.loop = false;
    v.setAttribute('playsinline', '');
    v.playsInline = true;
    v.preload = 'auto';
    v.volume = 1; // 播放自带声音（用户点按手势，浏览器允许有声自动播放）
    // 出画面才淡入：playing 后再等两帧，确保首帧已渲染，避免黑帧一闪
    v.addEventListener('playing', function () {
      setButtonPaused(); // 开始播放 → 按钮显示"暂停"
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (video === v) v.classList.add('ready');
        });
      });
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
    const src = playbackSrc(fig);
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
        setButtonPaused(); // 开始播放 → 按钮显示"暂停"
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (video === target) target.classList.add('ready');
          });
        });
      });
      target.addEventListener('ended', function () { stop(); });
      target.addEventListener('error', failHandler);
      target.src = src;
      holder.appendChild(target);
    }
    video = target;
    // 网络慢、数据还没下完时先显示"加载中"，不让人以为卡死
    setButtonLoading();
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
    // 拦截 pointer/touch 冒泡：防止 PhotoSwipe 把手势/轻点算到幻灯片上
    // （否则点播放会触发 UI 显隐切换，造成"屏幕一闪"）
    ['pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(function (evt) {
      playBtn.addEventListener(evt, function (e) {
        e.stopPropagation();
      }, { passive: true });
    });

    // 后台预缓冲，保证点击即播、平滑无卡顿
    prepareBuffer(fig);
  });

  lightbox.on('close', cleanup);
  lightbox.on('destroy', cleanup);
}

// 播放源：优先 H.264 兼容版（体积小、全浏览器可播），没有才用原 HEVC
function preferredSrc(fig) {
  if (!fig) return '';
  const avcSrc = fig.dataset.avcSrc || '';
  if (avcSrc) return avcSrc;
  const srcV = fig.querySelector('video');
  return (srcV && srcV.src) || '';
}

// 播放源优先级：本地 Blob（预热已下载到内存，播放零网络、绝不卡）→
// H.264 兼容版 → 原 HEVC
function playbackSrc(fig) {
  if (!fig) return '';
  const blob = fig.dataset.liveBlob || '';
  if (blob) return blob;
  return preferredSrc(fig);
}

// 页面级预热：实况图进入视口就把视频下载成 Blob 存进内存（播放时直接用，零网络、不卡），
// 同时走 Service Worker 缓存（重进页面秒取）。已预热过的图跳过。
export function warmLiveVideos(scope) {
  if (!scope || !scope.querySelectorAll || !('IntersectionObserver' in window)) return;
  const figs = Array.prototype.slice.call(scope.querySelectorAll('.live-photo'));
  if (!figs.length) return;
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      const fig = en.target;
      if (fig.dataset.liveWarmed) { io.unobserve(fig); return; }
      fig.dataset.liveWarmed = '1';
      io.unobserve(fig);
      const avcSrc = fig.dataset.avcSrc || '';
      const srcV = fig.querySelector('video');
      const url = avcSrc || (srcV && srcV.src) || '';
      if (url) {
        try {
          fetch(url).then(function (r) {
            if (r && r.ok) return r.blob();
            return null;
          }).then(function (b) {
            if (b) fig.dataset.liveBlob = URL.createObjectURL(b);
          }).catch(function () {});
        } catch (_) {}
      }
    });
  }, { rootMargin: '300px 0px' });
  figs.forEach(function (f) { io.observe(f); });
}

export function initPhotoSwipeInScope(scope) {
  collectGalleries(scope).forEach(bindPhotoSwipeGallery);
  warmLiveVideos(scope);
}

export function initPhotoSwipeInEntries(entries) {
  (entries || []).forEach(initPhotoSwipeInScope);
}
