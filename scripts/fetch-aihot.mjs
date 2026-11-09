#!/usr/bin/env node
// 抓取 AIHOT 日报 RSS，写入 content/aihot-daily.json（构建时只读本地 JSON，离线也能构建）
// 用法：node scripts/fetch-aihot.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEED = 'https://aihot.news/feed/daily.xml?aihot_actor=04d1338d-fbb3-4861-b05e-fddb28fee2ea';
const OUT = join(ROOT, 'content', 'aihot-daily.json');
const MAX_ISSUES = 7;
const MAX_LINKS = 4;

const strip = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const res = await fetch(FEED, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; haelcy-blog build)' } });
if (!res.ok) throw new Error('fetch failed: ' + res.status);
const xml = await res.text();

const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]).slice(0, MAX_ISSUES).map(block => {
  const titleRaw = strip((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
  const url = strip((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
  const pub = strip((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
  const desc = (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
  // 标题形如「AIHOT 日报 · 2026-11-05 — 主标题」，取破折号后的主标题
  const headline = titleRaw.split(/\s+—\s+/).pop() || titleRaw;
  const dateMatch = titleRaw.match(/(\d{4}-\d{2}-\d{2})/);
  const lead = strip((desc.match(/<p>([\s\S]*?)<\/p>/) || [])[1]);
  const links = [...desc.matchAll(/<li><a href="([^"]+)">([\s\S]*?)<\/a><\/li>/g)]
    .slice(0, MAX_LINKS)
    .map(m => ({ title: strip(m[2]), url: m[1] }));
  return {
    date: dateMatch ? dateMatch[1] : (pub ? new Date(pub).toISOString().slice(0, 10) : ''),
    title: headline,
    url,
    lead,
    links,
  };
}).filter(it => it.url && it.title);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  source: 'https://aihot.news/daily',
  updated: new Date().toISOString().slice(0, 10),
  items,
}, null, 2) + '\n');
console.log('wrote', OUT, items.length, 'issues');

// AIHOT 本来就是一份博客 RSS：直接把条目并入朋友圈数据，和友链博客同等对待。
// 这样 fcircle-data.yml 一次采集就同时产出友链文章和 AIHOT 日报，不再单独跑 workflow。
const FC = join(ROOT, 'site-root', 'fcircle-data.json');
if (existsSync(FC)) {
  const data = JSON.parse(readFileSync(FC, 'utf-8'));
  const articles = Array.isArray(data.article_data) ? data.article_data : [];
  const seen = new Set(articles.map(x => String(x.link || '')));
  const hadAuthor = articles.some(x => x.author === 'AIHOT 日报');
  let added = 0;
  for (const it of items) {
    if (seen.has(it.url)) continue;
    articles.push({
      floor: 0,
      title: it.title,
      created: it.date,
      updated: it.date,
      link: it.url,
      author: 'AIHOT 日报',
      avatar: '/assets/images/aihot.png',
    });
    seen.add(it.url);
    added++;
  }
  if (added) {
    data.article_data = articles;
    if (data.statistical_data) {
      data.statistical_data.article_num = Number(data.statistical_data.article_num || 0) + added;
      // 同一个「博客源」只计一次订阅，之后每天新增的文章不再把订阅数加一。
      if (!hadAuthor) {
        data.statistical_data.friends_num = Number(data.statistical_data.friends_num || 0) + 1;
        data.statistical_data.active_num = Number(data.statistical_data.active_num || 0) + 1;
      }
    }
    writeFileSync(FC, JSON.stringify(data, null, 0) + '\n');
  }
  console.log('merged', added, 'AIHOT items into', FC);
}
