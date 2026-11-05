#!/usr/bin/env node
/**
 * 生成 content/updated.json ——「文章文件 → 最后一次真正改动时间」快照。
 *
 * 为什么需要它：
 *   build.mjs 的「修改时间」优先读 frontmatter 的 updated，其次读 git 提交历史。
 *   但线上部署环境是浅克隆（历史只有 1 条），代码会主动跳过 git 这一步，
 *   结果全站文章都只显示创建时间。把时间算好落成一份 JSON 一起提交，
 *   没 git 历史的构建环境也能显示真实的最后修改时间。
 *
 * 判定规则与 build.mjs 的 gitUpdatedDates() 保持一致：
 *   - 只看 content/posts/ 下的提交
 *   - 纯重命名（numstat 里出现 " => "）、二进制、增删为 0 的提交不算改动
 *   - 一次改超过 20 个文件的批量提交不算改动（避免批量导入/搬家污染）
 *
 * 用法： node scripts/gen-updated.mjs [--dry]
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'content', 'updated.json');
const DRY = process.argv.includes('--dry');

function git(args) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 128 * 1024 * 1024 });
}

const top = git(['rev-parse', '--show-toplevel']);
if (top.status !== 0) {
  console.error('✗ 当前目录不是 git 仓库，无法生成更新时间快照');
  process.exit(1);
}
const shallow = git(['rev-parse', '--is-shallow-repository']);
if (shallow.status === 0 && shallow.stdout.trim() === 'true') {
  console.error('✗ 这是浅克隆，历史不完整，请先在完整仓库里运行（git fetch --unshallow）');
  process.exit(1);
}

const log = git(['log', '--format=@@%cI', '--numstat', '--', 'content/posts']);
if (log.status !== 0) {
  console.error('✗ 读取 git 历史失败：' + String(log.stderr || '').trim());
  process.exit(1);
}

const commits = [];
let cur = null;
for (const line of String(log.stdout).split('\n')) {
  const t = line.trim();
  if (t.startsWith('@@')) { cur = { date: t.slice(2), files: [] }; commits.push(cur); continue; }
  if (!t || !cur) continue;
  const parts = t.split('\t');
  if (parts.length < 3) continue;
  const added = parts[0], deleted = parts[1], file = parts[2];
  if (file.indexOf(' => ') !== -1) continue;
  if (added === '-' || deleted === '-') continue;
  if (!file.startsWith('content/posts/') || !file.endsWith('.md')) continue;
  if (Number(added) + Number(deleted) <= 0) continue;
  cur.files.push(file);
}

const map = {};
for (const commit of commits) {
  if (commit.files.length > 20) continue; // 批量提交，跳过
  for (const file of commit.files) {
    if (map[file]) continue; // git log 新→旧，第一次遇到的有效提交即最后改动时间
    map[file] = commit.date;
  }
}

const sorted = {};
for (const k of Object.keys(map).sort()) sorted[k] = map[k];

if (DRY) {
  console.log(JSON.stringify(sorted, null, 2));
  console.log('\n(共 ' + Object.keys(sorted).length + ' 篇，--dry 未写入)');
} else {
  if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
  console.log('✓ 写入 content/updated.json：' + Object.keys(sorted).length + ' 篇');
}
