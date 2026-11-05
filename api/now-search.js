import { json, sameSite, bad, doubanJson, coverProxy } from './_now.js';

// GET /api/now-search?q=关键词&kind=all|book|movie
// 返回豆瓣「搜索建议」接口的即时结果（标题 / 年份 / 作者或副标题 / 封面 / 链接）。
export default async function handler(req, res) {
  if (!sameSite(req)) return bad(res, 'forbidden', 403);
  const url = new URL(req.url, 'http://localhost');
  const q = (url.searchParams.get('q') || '').trim();
  const kind = (url.searchParams.get('kind') || 'all').toLowerCase();
  if (!q) return json(res, 200, { q, items: [] });
  if (q.length > 60) return bad(res, 'query too long');

  const wantBook = kind !== 'movie';
  const wantMovie = kind !== 'book';
  const tasks = [];
  if (wantBook) tasks.push(doubanJson('https://book.douban.com/j/subject_suggest?q=' + encodeURIComponent(q), 'https://book.douban.com/').then((list) => ({ kind: 'book', list })).catch(() => ({ kind: 'book', list: [] })));
  if (wantMovie) tasks.push(doubanJson('https://movie.douban.com/j/subject_suggest?q=' + encodeURIComponent(q), 'https://movie.douban.com/').then((list) => ({ kind: 'movie', list })).catch(() => ({ kind: 'movie', list: [] })));

  const results = await Promise.all(tasks);
  const items = [];
  for (const group of results) {
    const list = Array.isArray(group.list) ? group.list : [];
    for (const it of list.slice(0, 6)) {
      if (!it || !it.id) continue;
      const isBook = group.kind === 'book';
      const pic = isBook ? it.pic : it.img;
      const sub = isBook
        ? [it.author_name, it.year].filter(Boolean).join(' · ')
        : [it.sub_title, it.year].filter(Boolean).join(' · ');
      items.push({
        kind: group.kind,
        id: String(it.id),
        title: String(it.title || ''),
        year: String(it.year || ''),
        sub,
        cover: coverProxy(pic),
        coverRemote: pic || '',
        url: isBook ? 'https://book.douban.com/subject/' + it.id + '/' : 'https://movie.douban.com/subject/' + it.id + '/',
      });
    }
  }
  return json(res, 200, { q, items }, 600);
}
