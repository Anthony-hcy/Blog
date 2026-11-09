#!/usr/bin/env node
// QUOKECOLA 没有 RSS，只有 SPA + article_list.json。这里直接读它的文章清单，
// 生成快照并并入 fcircle-data.json，作为普通博客源展示。
// 用法：node scripts/fetch-quokecola.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST_URL = 'https://www.quokecola.com/apps/article_browser/markdown_directory/article_list.json';
const SITE = 'https://www.quokecola.com/';
const AUTHOR = 'QUOKECOLA';
const AVATAR = 'https://www.quokecola.com/favicon/favicon-96x96.png';
const OUT = join(ROOT, 'content', 'quokecola-articles.json');

const beijingStamp = d => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
}).format(d || new Date());

const toDate = t => {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+\d{1,2}:\d{2})?$/.exec(String(t || '').trim());
  if (!m) return '';
  return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
};

const res = await fetch(LIST_URL, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; haelcy-blog build)' } });
if (!res.ok) throw new Error('fetch failed: ' + res.status);
const list = await res.json();

const items = [];
const seen = new Set();
for (const it of Array.isArray(list) ? list : []) {
  const date = toDate(it.time);
  const file = String(it.src || '').split('/').pop();
  if (!date || !it.title || !file || seen.has(file)) continue;
  seen.add(file);
  // 站点是 hash 路由：点击文章后地址变成 #BLOG#<文件名>.md。
  const url = SITE + '#BLOG#' + encodeURIComponent(file);
  items.push({
    date,
    title: String(it.title).trim(),
    url,
    summary: String(it.abstract || '').trim(),
  });
}
items.sort((a, b) => b.date.localeCompare(a.date));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  source: SITE,
  updated: beijingStamp().slice(0, 10),
  items,
}, null, 2) + '\n');
console.log('wrote', OUT, items.length, 'articles');

const FC = join(ROOT, 'site-root', 'fcircle-data.json');
if (existsSync(FC)) {
  const data = JSON.parse(readFileSync(FC, 'utf-8'));
  const articles = Array.isArray(data.article_data) ? data.article_data : [];
  const seenLinks = new Set(articles.map(x => String(x.link || '')));
  const hadAuthor = articles.some(x => x.author === AUTHOR);
  let added = 0;
  for (const it of items) {
    if (seenLinks.has(it.url)) continue;
    articles.push({
      floor: 0,
      title: it.title,
      created: it.date,
      updated: it.date,
      link: it.url,
      author: AUTHOR,
      avatar: AVATAR,
    });
    seenLinks.add(it.url);
    added++;
  }
  if (added) data.article_data = articles;
  if (data.statistical_data) {
    if (added) {
      data.statistical_data.article_num = Number(data.statistical_data.article_num || 0) + added;
      if (!hadAuthor) {
        data.statistical_data.friends_num = Number(data.statistical_data.friends_num || 0) + 1;
        data.statistical_data.active_num = Number(data.statistical_data.active_num || 0) + 1;
      }
    }
    data.statistical_data.last_updated_time = beijingStamp();
  }
  writeFileSync(FC, JSON.stringify(data, null, 0) + '\n');
  console.log('merged', added, 'QUOKECOLA items into', FC);
}
