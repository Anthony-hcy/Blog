import { sameSite, bad, doubanImage, isDoubanImage } from './_now.js';

// GET /api/now-cover?u=<豆瓣图片地址>
// 豆瓣图床不给外链（无 Referer 418、站内 Referer 403），这里带上 Referer 取回来再原样吐出。
export default async function handler(req, res) {
  if (!sameSite(req)) return bad(res, 'forbidden', 403);
  const url = new URL(req.url, 'http://localhost');
  const target = url.searchParams.get('u') || '';
  if (!isDoubanImage(target)) return bad(res, 'bad url');

  const got = await doubanImage(target);
  if (!got) return bad(res, 'upstream error', 502);
  res.statusCode = 200;
  res.setHeader('Content-Type', got.type);
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(got.buffer);
}
