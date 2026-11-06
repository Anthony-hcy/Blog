import { writeFileSync, readFileSync } from 'node:fs';
const SRC = 'https://anthony-hcy.github.io/Workspace/data/theatre.json';
const OUT = 'content/theatre.json';
const CAT = { movie: '电影', anime: '动画', series: '剧集' };
function trim(it) {
  return {
    id: String(it.id || ''),
    title: String(it.title || '').trim(),
    category: CAT[it.category] || String(it.category || ''),
    score: Number(it.score) || 0,
    year: Number(it.year) || 0,
    date: String(it.currentDate || '').slice(0, 10),
    image: String(it.image || ''),
    url: String(it.doubanUrl || ''),
    director: (Array.isArray(it.director) ? it.director : []).slice(0, 2).map(String),
    tags: (Array.isArray(it.tags) ? it.tags : []).slice(0, 3).map(String),
    runtime: String(it.runtime || ''),
    episodes: String(it.episodes || ''),
  };
}
const raw = JSON.parse(readFileSync('_tmp/theatre.json', 'utf-8'));
const items = raw.map(trim).filter(x => x.title && x.date);
items.sort((a, b) => b.date.localeCompare(a.date));
writeFileSync(OUT, JSON.stringify({ source: 'https://anthony-hcy.github.io/Workspace/', updated: '2026-11-06', count: items.length, items }, null, 0) + '\n');
console.log('wrote', items.length);