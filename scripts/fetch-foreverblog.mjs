#!/usr/bin/env node
// 抓取「十年之约 · 今天读什么」RSS，每天只取该日的第一篇，作为一个博客源并入朋友圈数据。
// 用法：node scripts/fetch-foreverblog.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEED = 'https://www.foreverblog.cn/daily.xml';
const OUT = join(ROOT, 'content', 'foreverblog-daily.json');
const AUTHOR = '十年之约 · 今天读什么';
const AVATAR = 'https://www.foreverblog.cn/favicon.ico';

const strip = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const beijingDate = pub => {
  if (!pub) return '';
  const d = new Date(pub);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
};

const res = await fetch(FEED, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; haelcy-blog build)' } });
if (!res.ok) throw new Error('fetch failed: ' + res.status);
const xml = await res.text();

// 每天有 2–4 篇精选，只保留每个日期的第一篇（RSS 内按日期倒序排列）。
const seenDates = new Set();
const items = [];
const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
for (const block of blocks) {
  const title = strip((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
  const link = strip((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
  const guid = strip((block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/) || [])[1]);
  const pub = strip((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
  const date = beijingDate(pub);
  if (!date || !title || !link) continue;
  if (seenDates.has(date)) continue;
  seenDates.add(date);
  items.push({
    date,
    title,
    // guid 是原文地址；link 是 foreverblog 的中转地址，优先用 guid。
    url: guid || link,
  });
}

items.sort((a, b) => b.date.localeCompare(a.date));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  source: 'https://www.foreverblog.cn/daily.html',
  updated: new Date().toISOString().slice(0, 10),
  items,
}, null, 2) + '\n');
console.log('wrote', OUT, items.length, 'days');

// 和 AIHOT 一样，直接并入 fcircle-data.json，作为一个博客源。
const FC = join(ROOT, 'site-root', 'fcircle-data.json');
if (existsSync(FC)) {
  const data = JSON.parse(readFileSync(FC, 'utf-8'));
  const articles = Array.isArray(data.article_data) ? data.article_data : [];
  const seen = new Set(articles.map(x => String(x.link || '')));
  let added = 0;
  for (const it of items) {
    if (seen.has(it.url)) continue;
    articles.push({
      floor: 0,
      title: it.title,
      created: it.date,
      updated: it.date,
      link: it.url,
      author: AUTHOR,
      avatar: AVATAR,
    });
    seen.add(it.url);
    added++;
  }
  if (added) {
    data.article_data = articles;
    if (data.statistical_data) {
      data.statistical_data.article_num = Number(data.statistical_data.article_num || 0) + added;
      data.statistical_data.friends_num = Number(data.statistical_data.friends_num || 0) + 1;
      data.statistical_data.active_num = Number(data.statistical_data.active_num || 0) + 1;
    }
    writeFileSync(FC, JSON.stringify(data, null, 0) + '\n');
  }
  console.log('merged', added, 'ForeverBlog items into', FC);
}
