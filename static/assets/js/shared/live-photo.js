// 实况照片播放交互（shared/live-photo.js）
// 手机：长按约 450ms 播放（静音循环），松手停止回到封面；轻点仍由 PhotoSwipe 打开大图。
// 电脑（hover 设备）：点开大图后，灯箱里有 ▶ 播放/暂停 与 🔊 声音开关（shared/photoswipe.js 注入）。
// 页面缩略图只保留 LIVE 角标与 🔊（手机长按播放时调声音用）。
// 事件全部委托在 document 上，页面没有实况图时零开销。

const HOLD_MS = 450;
const MOVE_TOLERANCE = 12; // 手指移动超过该距离视为滚动/滑动，取消长按
const CLICK_SUPPRESS_MS = 700; // 长按播放后，这段时间内的点击不触发 PhotoSwipe

let suppressClickUntil = 0;
let pressTimer = null;
let pressStart = null;

function videoOf(el) {
  return el.querySelector('.live-photo-video');
}

function showHint(el, text) {
  let tip = el.querySelector('.live-photo-hint');
  if (!tip) {
    tip = document.createElement('span');
    tip.className = 'live-photo-hint';
    tip.setAttribute('role', 'status');
    el.appendChild(tip);
  }
  tip.textContent = text;
  tip.hidden = false;
  clearTimeout(tip._liveHintTimer);
  tip._liveHintTimer = setTimeout(function () {
    tip.hidden = true;
  }, 2200);
}

function startLive(el) {
  const v = videoOf(el);
  if (!v) return;
  el.classList.add('playing');
  v.loop = false; // 实况只播一遍
  // 首次触发时才加载
  if (v.readyState < 2) v.load();
  v.currentTime = 0;

  // 有画面（真的在播）才把视频层淡入，避免黑屏/跳变
  if (!el.dataset.liveRenderedBound) {
    el.dataset.liveRenderedBound = '1';
    v.addEventListener('playing', function () {
      if (el.classList.contains('playing')) el.classList.add('rendered');
    });
    v.addEventListener('ended', function () {
      stopLive(el); // 播完一遍回到封面
    });
  }

  const p = v.play();
  if (p && p.catch) {
    p.catch(function () {
      // 播放失败（编码不支持，如桌面 Chrome/Firefox 播 HEVC）→ 回到静态封面并提示
      el.classList.remove('playing', 'rendered');
      showHint(el, '此视频当前设备无法播放，请在手机上长按观看');
    });
  }
  const sg = el.querySelector('.live-photo-sound');
  if (sg) sg.hidden = false;
}

function stopLive(el) {
  if (!el) return;
  el.classList.remove('playing', 'rendered');
  const v = videoOf(el);
  if (v) v.pause();
  const sg = el.querySelector('.live-photo-sound');
  if (sg) sg.hidden = true;
}

function syncSoundIcon(el) {
  const v = videoOf(el);
  const sg = el.querySelector('.live-photo-sound');
  if (!v || !sg) return;
  sg.innerHTML = v.muted
    ? '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>'
    : '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>';
}

// ▶ 播放按钮与 🔊 声音按钮：页面缩略图只留 🔊（长按播放时调声音用），
// 播放按钮在灯箱（PhotoSwipe）里，由 shared/photoswipe.js 负责注入。
function ensureControls(el) {
  if (el.querySelector('.live-photo-sound')) return;

  const sound = document.createElement('button');
  sound.type = 'button';
  sound.className = 'live-photo-sound';
  sound.hidden = true;
  sound.setAttribute('aria-label', '声音开关');
  sound.innerHTML = '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>';
  sound.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const v = videoOf(el);
    if (!v) return;
    v.muted = !v.muted;
    syncSoundIcon(el);
  });

  el.appendChild(sound);
}

function scanLivePhotos() {
  const list = Array.from(document.querySelectorAll('.live-photo:not([data-live-bound="1"])'));
  list.forEach(function (el) {
    el.dataset.liveBound = '1';
    ensureControls(el);
  });
}

function clearPress() {
  clearTimeout(pressTimer);
  pressTimer = null;
  pressStart = null;
}

export function initLivePhotos() {
  scanLivePhotos();

  // 动态加载的内容（首页无限加载等）补挂按钮
  const mo = new MutationObserver(scanLivePhotos);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // ---- 手机长按 ----
  document.addEventListener('touchstart', function (e) {
    const target = e.target;
    const el = target && target.closest ? target.closest('.live-photo') : null;
    if (!el || e.touches.length > 1) return; // 只认单指
    clearPress();
    pressStart = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      el: el,
    };
    pressTimer = setTimeout(function () {
      if (!pressStart || pressStart.el !== el) return;
      suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
      startLive(el);
    }, HOLD_MS);
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!pressStart || !e.touches.length) return;
    const dx = e.touches[0].clientX - pressStart.x;
    const dy = e.touches[0].clientY - pressStart.y;
    if (dx * dx + dy * dy > MOVE_TOLERANCE * MOVE_TOLERANCE) clearPress();
  }, { passive: true });

  function endPress() {
    // 松手不立即停：让当前这遍实况播完再停（ended 事件里 stopLive）
    clearPress();
  }
  document.addEventListener('touchend', endPress);
  document.addEventListener('touchcancel', endPress);

  // 长按播放后拦截随后的 click，避免误弹 PhotoSwipe 大图（捕获阶段先于灯箱处理）
  document.addEventListener(
    'click',
    function (e) {
      if (Date.now() >= suppressClickUntil) return;
      const target = e.target;
      const el = target && target.closest ? target.closest('.live-photo') : null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  // 抑制手机长按弹出的浏览器菜单（Android 的 contextmenu + iOS 的 callout）：
  // 捕获阶段拦截，实况图上的长按只用于播放，不弹"保存图片"菜单。
  document.addEventListener(
    'contextmenu',
    function (e) {
      const target = e.target;
      const el = target && target.closest ? target.closest('.live-photo') : null;
      if (!el) return;
      e.preventDefault();
    },
    true
  );
}
