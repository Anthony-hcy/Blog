import { json, sameSite, bad, doubanJson, coverProxy } from './_now.js';

// GET /api/now-detail?kind=book|movie&id=1234567
// 补全评分 / 评价人数 / 作者·页数 或 导演·集数（列表接口没有这些字段）。
export default async function handler(req, res) {
  if (!sameSite(req)) return bad(res, 'forbidden', 403);
  const url = new URL(req.url, 'http://localhost');
  const kind = (url.searchParams.get('kind') || '').toLowerCase();
  const id = (url.searchParams.get('id') || '').trim();
  const hintYear = (url.searchParams.get('y') || '').trim().slice(0, 4); // 列表页给的年份兜底（rexxar 详情里 year 常为空）
  if ((kind !== 'book' && kind !== 'movie') || !/^\d{3,12}$/.test(id)) return bad(res, 'bad params');

  const isBook = kind === 'book';
  const api = isBook ? 'https://m.douban.com/rexxar/api/v2/book/' : 'https://m.douban.com/rexxar/api/v2/movie/';
  const referer = isBook ? 'https://book.douban.com/' : 'https://movie.douban.com/';
  let j = null;
  try { j = await doubanJson(api + id, referer); } catch (_) { j = null; }

  const pic = j && j.pic ? j.pic.large || j.pic.normal : '';
  const rating = j && j.rating && typeof j.rating.value === 'number' ? j.rating.value : 0;
  const votes = j && j.rating && typeof j.rating.count === 'number' ? j.rating.count : 0;
  const year = String((j && j.year) || hintYear || '');
  let sub = '';
  if (j) {
    if (isBook) {
      const author = (j.author && j.author[0]) || '';
      const pages = j.pages ? j.pages + ' 页' : '';
      sub = [author, year, pages].filter(Boolean).join(' · ');
    } else {
      const director = (j.directors && j.directors[0] && j.directors[0].name) || '';
      const ep = j.episodes_count ? j.episodes_count + ' 集' : (j.durations && j.durations[0]) || '';
      sub = [director, year, ep].filter(Boolean).join(' · ');
    }
  }
  return json(res, 200, {
    kind,
    id,
    title: (j && j.title) || '',
    sub,
    year,
    rating,
    votes,
    cover: coverProxy(pic),
    coverRemote: pic,
    url: (isBook ? 'https://book.douban.com/subject/' : 'https://movie.douban.com/subject/') + id + '/',
    label: isBook ? '在读' : '在看',
    source: isBook ? '豆瓣读书' : '豆瓣电影',
  }, 3600);
}
