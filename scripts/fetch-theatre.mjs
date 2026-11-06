import { readFileSync, writeFileSync } from 'node:fs';

const SRC = process.env.THEATRE_SRC || 'https://anthony-hcy.github.io/Workspace/data/theatre.json';
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

async function loadRaw() {
  // 本地调试可用 THEATRE_FILE 指向已下载的 JSON，避免重复请求外网。
  if (process.env.THEATRE_FILE) {
    return JSON.parse(readFileSync(process.env.THEATRE_FILE, 'utf-8'));
  }
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SRC, {
        headers: { 'user-agent': 'haelcy-blog-theatre-fetch/1.0 (+https://haelcy.cn)' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`fetch ${SRC} -> HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.warn(`fetch attempt ${attempt}/3 failed: ${e.message}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 3_000));
    }
  }
  throw lastErr;
}

const raw = await loadRaw();
const arr = Array.isArray(raw) ? raw : (raw.items || []);
const items = arr.map(trim).filter(x => x.title && x.date);
items.sort((a, b) => b.date.localeCompare(a.date));

// 上游偶发返回空数组时绝不覆盖现有快照。
if (items.length < 10) {
  throw new Error(`only ${items.length} valid theatre items; refusing to overwrite content/theatre.json`);
}

const parts = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(p => [p.type, p.value])
);
const updated = `${parts.year}-${parts.month}-${parts.day}`;

writeFileSync(OUT, JSON.stringify({
  source: 'https://anthony-hcy.github.io/Workspace/',
  updated,
  count: items.length,
  items,
}, null, 0) + '\n');
console.log(`wrote ${items.length} theatre items (updated ${updated})`);
