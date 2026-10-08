#!/usr/bin/env node
/**
 * 站内资源完整性检查（构建产物自检）
 *
 * 扫描 dist 下所有 html/json/xml/webmanifest，抽出站内的 src / href / srcset /
 * data-exsearch-api 引用，去掉查询串、锚点、URL 编码之后，确认目标文件
 * （或目录下的 index.html）真实存在。
 *
 * 部署前缀（Pages 版是 /Blog，域名版是空）自动识别：分别按两种前缀试算，
 * 取缺失更少的那种，并在 stderr 说明识别结果。这样不依赖 shell 传参
 * （Git Bash 会把 "/Blog" 这类参数改写成 Windows 路径）。
 *
 * 用法：node deploy/check-assets.mjs
 * 输出：stdout 打印缺失条数（0 表示通过）；缺失清单与识别结果走 stderr。
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const CANDIDATE_BASES = ['', '/Blog'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    // 注意：只收 html/xml/webmanifest/txt，不收普通 .json ——
    // fcircle-data.json 里的 "/images/x.jpg" 是别人站点的相对路径，不是本站资源
    else if (/\.(html|xml|webmanifest|txt)$/i.test(name)) out.push(p);
  }
  return out;
}

// 外部链接、协议链接、纯锚点不检查；相对路径也不检查（站点全部使用绝对路径）
const SKIP = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

const refs = new Set();
const ATTR = /(?:src|href|data-exsearch-api)="([^"]+)"/g;
const SRCSET = /srcset="([^"]+)"/g;
const JSONVAL = /"(?:src|start_url|scope|url|path)"\s*:\s*"([^"]+)"/g; // manifest 这类 JSON 里的引用

function add(u) {
  if (!u || SKIP.test(u) || !u.startsWith('/')) return;
  refs.add(u.split('#')[0].split('?')[0]);
}

for (const file of walk(DIST)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(ATTR)) add(m[1]);
  for (const m of text.matchAll(SRCSET)) {
    for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0]);
  }
  if (file.endsWith('.webmanifest')) {
    for (const m of text.matchAll(JSONVAL)) add(m[1]);
  }
}

function resolveTo(p) {
  if (!p.startsWith('/')) return null;
  try { return decodeURIComponent(p); } catch (_) { return p; } // 含裸 % 的文件名保持原样
}

function missingFor(base) {
  const missing = [];
  for (const raw of refs) {
    let p = resolveTo(raw);
    if (p === null) continue;
    if (base && p.startsWith(base + '/')) p = p.slice(base.length);
    else if (base && p === base) p = '/';
    const target = join(DIST, p);
    if (existsSync(target) && statSync(target).isFile()) continue;
    if (existsSync(join(target, 'index.html'))) continue;
    missing.push(raw);
  }
  return missing.sort();
}

const byBase = CANDIDATE_BASES.map(base => ({ base, missing: missingFor(base) }));
byBase.sort((a, b) => a.missing.length - b.missing.length);
const best = byBase[0];

if (byBase.length > 1 && byBase[0].missing.length === byBase[1].missing.length && byBase[0].missing.length > 0) {
  console.error('   ⚠ 两种部署前缀下缺失数相同，无法判断前缀；按根路径处理');
}
console.error(`   · 部署前缀识别为「${best.base || '/'}」，站内引用 ${refs.size} 条`);
for (const u of best.missing) console.error('     ✗ 缺失：' + u);
console.log(best.missing.length);
