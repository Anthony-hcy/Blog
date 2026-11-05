// 豆瓣搜索代理：Portal 的「Now」面板用。
// 浏览器直连豆瓣会被 CORS 挡住（豆瓣响应里没有 Access-Control-Allow-Origin），
// 所以在 Vercel 上放三个同源函数：搜索 / 详情 / 封面。同源请求没有 CORS 问题，速度是即时的。

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const ALLOWED_HOSTS = /(^|\.)(doubanio\.com|douban\.com)$/i;

export function json(res, status, body, cacheSeconds) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheSeconds ? 'public, max-age=' + cacheSeconds + ', s-maxage=' + cacheSeconds : 'no-store');
  res.end(JSON.stringify(body));
}

// 只允许本站页面调用（防止被别人当成免费代理刷豆瓣，把 Vercel 的出口 IP 打黑）
export function sameSite(req) {
  const ref = String(req.headers.referer || req.headers.origin || '');
  if (!ref) return false;
  return /^https?:\/\/([\w-]+\.)*(haelcy\.cn|vercel\.app|localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(ref);
}

export function bad(res, message, status) {
  json(res, status || 400, { error: message });
}

export async function doubanJson(url, referer) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: referer || 'https://www.douban.com/',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Accept: 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error('douban ' + res.status);
  return res.json();
}

export async function doubanImage(url) {
  const referers = ['https://book.douban.com/', 'https://movie.douban.com/'];
  for (const referer of referers) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Referer: referer, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const type = (res.headers.get('content-type') || '').split(';')[0];
        if (!/^image\//.test(type)) continue;
        return { type, buffer: Buffer.from(await res.arrayBuffer()) };
      }
    } catch (_) { /* 换下一个 Referer 再试 */ }
  }
  return null;
}

export function isDoubanImage(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.test(u.hostname);
  } catch (_) {
    return false;
  }
}

export function coverProxy(url) {
  return url ? '/api/now-cover?u=' + encodeURIComponent(url) : '';
}

// 前端用它显示：本地预览时前缀不是 /，按请求路径自动判断
export function withQuery(req, path) {
  return path;
}
