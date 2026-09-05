/* Haelcy Blog Service Worker（PWA）
   - 页面导航：network-first（内容永远最新），断网回退缓存
   - 图片/字体/图标：cache-first（文件名不变内容不变，二次打开秒开）
   - 其他同源静态资源（css/js/json）：stale-while-revalidate（先用缓存、后台更新）
   跨域请求（npmmirror 字体、不蒜子、GitHub API）不拦截，交给浏览器 */
var CACHE = 'haelcy-v1';

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

  if (req.mode === 'navigate') {
    // no-cache = 带条件回源校验：有新部署立刻拿到新页面，没有则 304 快速返回
    event.respondWith(networkFirst(req, { cache: 'no-cache' }));
    return;
  }
  if (/\.(png|jpe?g|gif|webp|svg|avif|ico|woff2?|ttf)$/i.test(url.pathname) ||
      url.pathname.indexOf('/assets/img/') >= 0) {
    event.respondWith(cacheFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

function networkFirst(req, init) {
  return fetch(req, init).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req);
  });
}

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
