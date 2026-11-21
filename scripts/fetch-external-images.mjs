#!/usr/bin/env node
// 把文章里的「站外图片」下载进仓库并改写成站内路径。
//
// 为什么需要：豆瓣（doubanio.com）按 Referer 防盗链——不带 Referer 返回 418、
// 带本站 Referer 有的图返回 403；知乎（zhimg.com）还会看 User-Agent。光靠
// referrerpolicy 治不了，只能把图存到自己仓库（和 Portal 的 Images 页一个去处）。
//
// 用法：
//   node scripts/fetch-external-images.mjs <slug|all> [--dry]
//
// 做三件事：
//   1. 找 frontmatter 的 banner 与正文 ![alt](http…) 里的站外图片
//   2. 按站点选 Referer / UA 下载到 static/assets/img/<slug>/，并校验是真图
//      （状态 200、image/*、>1.5KB、短边 >200px；微信的 140×140 占位图会被挡掉）
//   3. 把 Markdown 里的地址改成 /assets/img/<slug>/<文件名>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const POSTS = join(ROOT, 'content', 'posts');
const ASSETS = join(ROOT, 'static', 'assets', 'img');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const target = process.argv[2];
const dry = process.argv.includes('--dry');
if (!target) {
  console.error('用法：node scripts/fetch-external-images.mjs <slug|all> [--dry]');
  process.exit(1);
}

// 每个图站允许的 Referer（按顺序试）
function referersFor(url) {
  const host = new URL(url).host;
  if (/mmbiz\.qpic\.cn$/.test(host)) return [''];                       // 微信：不能带 Referer
  if (/doubanio\.com$/.test(host)) return ['https://movie.douban.com/']; // 豆瓣：必须带豆瓣自己的
  if (/zhimg\.com$/.test(host)) return ['', 'https://www.zhihu.com/'];   // 知乎：看 UA，Referer 无所谓
  return ['', 'https://' + host + '/'];
}

function imageSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      if (marker === 0xd8 || marker === 0xd9) { off += 2; continue; }
      const len = buf.readUInt16BE(off + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) };
      }
      off += 2 + len;
    }
    return null;
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (fmt === 'VP8 ' || fmt === 'VP8L') {
      const w = buf.readUInt16LE(26) & 0x3fff;
      const h = buf.readUInt16LE(28) & 0x3fff;
      return { width: w, height: h };
    }
  }
  return null;
}

async function download(url) {
  const errors = [];
  for (const ref of referersFor(url)) {
    try {
      const headers = { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8' };
      if (ref) headers.Referer = ref;
      const res = await fetch(url, { headers, redirect: 'follow' });
      if (!res.ok) { errors.push(`HTTP ${res.status} (referer=${ref || '无'})`); continue; }
      const type = res.headers.get('content-type') || '';
      const buf = Buffer.from(await res.arrayBuffer());
      if (!/^image\//.test(type)) { errors.push(`不是图片：${type} (referer=${ref || '无'})`); continue; }
      if (buf.length < 1500) { errors.push(`文件太小 ${buf.length}B（可能是占位图）(referer=${ref || '无'})`); continue; }
      const size = imageSize(buf);
      if (size && (size.width < 200 || size.height < 200)) {
        errors.push(`尺寸太小 ${size.width}×${size.height}（占位图）(referer=${ref || '无'})`);
        continue;
      }
      return { buf, type, size };
    } catch (e) {
      errors.push(`${e.message} (referer=${ref || '无'})`);
    }
  }
  throw new Error(errors.join('；'));
}

function fileNameFor(url, type) {
  const clean = url.split('#')[0].split('?')[0];
  let base = clean.split('/').filter(Boolean).pop() || 'img';
  base = base.replace(/[^\w.\-]+/g, '_').slice(-60);
  if (!/\.[a-z0-9]{2,5}$/i.test(base)) {
    const ext = /webp/.test(type) ? '.webp' : /png/.test(type) ? '.png' : /gif/.test(type) ? '.gif' : '.jpg';
    base += ext;
  }
  return base;
}

function postsToProcess() {
  const files = readdirSync(POSTS).filter(f => f.endsWith('.md'));
  if (target === 'all') return files;
  const hit = files.filter(f => f.includes(target));
  if (!hit.length) { console.error('没找到文章：' + target); process.exit(1); }
  return hit;
}

const EXTERNAL = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;

let totalDownloaded = 0;
for (const file of postsToProcess()) {
  const path = join(POSTS, file);
  let md = readFileSync(path, 'utf8');
  const fmEnd = md.indexOf('\n---', 4);
  const head = fmEnd > 0 ? md.slice(0, fmEnd) : '';
  const slugMatch = /^slug:\s*(.+)$/m.exec(head);
  const slug = slugMatch ? slugMatch[1].trim() : file.replace(/\.md$/, '');

  const urls = new Set();
  const bannerMatch = /^banner:\s*(https?:\/\/\S+)\s*$/m.exec(head);
  if (bannerMatch) urls.add(bannerMatch[1].trim());
  for (const m of md.matchAll(EXTERNAL)) urls.add(m[1]);
  if (!urls.size) continue;

  const dir = join(ASSETS, slug);
  const mapping = new Map();
  console.log(`\n== ${file}（${urls.size} 张站外图）`);
  for (const url of urls) {
    let name = fileNameFor(url, '');
    if (existsSync(join(dir, name))) {
      let i = 2;
      const stem = name.replace(/\.[a-z0-9]+$/i, '');
      const ext = name.slice(stem.length);
      while (existsSync(join(dir, stem + '-' + i + ext))) i++;
      name = stem + '-' + i + ext;
    }
    try {
      const { buf, type, size } = await download(url);
      if (!dry) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, name), buf);
      }
      mapping.set(url, '/assets/img/' + slug + '/' + name);
      totalDownloaded++;
      console.log(`   ✓ ${name}  ${(buf.length / 1024).toFixed(0)}KB  ${size ? size.width + '×' + size.height : '尺寸未知'}  ← ${url.slice(0, 70)}`);
    } catch (e) {
      console.error(`   ✗ 下载失败：${url.slice(0, 70)}\n     ${e.message}`);
    }
  }

  if (!mapping.size) continue;
  let out = md;
  for (const [from, to] of mapping) out = out.split(from).join(to);
  if (!dry && out !== md) {
    writeFileSync(path, out);
    console.log(`   → 已改写 ${file}`);
  }
}
console.log(`\n完成：${totalDownloaded} 张图${dry ? '（--dry 只试不改）' : ''}`);
