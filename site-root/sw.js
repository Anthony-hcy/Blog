/* Haelcy Blog Service Worker（PWA）
   - 页面导航：network-first（内容永远最新），断网回退缓存
   - 图片/字体/图标：cache-first（文件名不变内容不变，二次打开秒开）
   - 其他同源静态资源（css/js/json）：stale-while-revalidate（先用缓存、后台更新）
   - 视频（mp4/webm）：cache-first 完整文件——第一次加载时缓存整份视频，
     之后每次打开直接读缓存秒播，不重复下载（此前卡第一帧是缓存了"分段响应"，
     现在缓存完整文件即正确）
   跨域请求（npmmirror 字体、不蒜子、GitHub API）不拦截，交给浏览器 */
// v5：资源 URL 全部改为内容哈希指纹（build.mjs），本次部署后缓存版本号不再需要频繁升级，
// 内容没变的资源 URL 不变、缓存直达；内容变了的资源 URL 变化、自动换新缓存。
var CACHE = 'haelcy-v5';

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 版本指纹永远直连（页面用它判断是否有新部署，走缓存会失效）
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(req));
    return;
  }

  // 视频（mp4/webm）：cache-first 完整文件
  // 第一次：绕过 Range 请求，拉取整份文件缓存（避免缓存 206 分段导致卡第一帧）；
  // 之后任何 Range 请求都直接命中缓存的完整文件，浏览器自行切片播放 → 秒开、不重复下载
  if (/\.(mp4|webm)$/i.test(url.pathname)) {
    event.respondWith(videoCacheFirst(req));
    return;
  }

  if (req.mode === 'navigate') {
    // 缓存秒开 + 后台更新（有新部署时页面里的版本检查会自动刷新）
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (/\.(png|jpe?g|gif|webp|svg|avif|ico|woff2?|ttf)$/i.test(url.pathname) ||
      url.pathname.indexOf('/assets/img/') >= 0) {
    event.respondWith(cacheFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  });
}

// 视频专用缓存：命中 → 直接返回缓存的完整视频；
// 未命中 → 发一个不带 Range 的请求拿整份文件缓存，再返回给播放器
function videoCacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    var fullReq = new Request(req.url, { method: 'GET', headers: {} });
    return fetch(fullReq).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      // 完整请求异常时退回原请求直连（兼容个别服务端）
      return fetch(req);
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.match(req).then(function (hit) {
    var fetching = fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return hit; });
    return hit || fetching;
  });
}
