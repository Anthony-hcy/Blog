/**
 * media-prep.mjs — 媒体素材本地处理工具（新增实况图/图片时用）
 *
 * 用法（需要 ffmpeg 在 PATH 中，Windows 可装 gyan.dev 静态包）：
 *   node scripts/media-prep.mjs               # 只处理缺的东西：转码 avc + 生成缩略图
 *   node scripts/media-prep.mjs --recompress  # 额外把 >1MB 的 jpg 压缩到 1800px q85
 *   node scripts/media-prep.mjs --backup DIR  # 处理前把原文件备份到 DIR（推荐！）
 *
 * 原则：仓库只提交"线上真正要用的"文件——
 *   - 实况视频只提交 .avc.mp4（H.264 兼容版，全浏览器可播）；HEVC 原片自己备份，不进仓库
 *   - 图片提交压缩版；原图自己备份
 *   - 缩略图 .thumb.jpg 随仓库提交（CI 不再每次装 ffmpeg 现生成）
 * 处理完记得确认备份目录里的原片/原图齐全，再 git add 提交。
 */
import { readdirSync, statSync, existsSync, copyFileSync, mkdirSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GALLERY = join(ROOT, 'static', 'assets', 'img', 'gallery');
const args = new Set(process.argv.slice(2));
const RE = args.has('--recompress');
const BACKUP = args.has('--backup') ? (process.argv[process.argv.indexOf('--backup') + 1] || '') : '';

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { timeout: 5000, stdio: 'ignore' });
  return !r.error && r.status === 0;
}

function run(cmd, argsList, timeoutMs) {
  return spawnSync(cmd, argsList, { timeout: timeoutMs, stdio: 'ignore' });
}

function backup(name) {
  if (!BACKUP) return;
  const src = join(GALLERY, name);
  if (!existsSync(src)) return;
  mkdirSync(BACKUP, { recursive: true });
  const dest = join(BACKUP, name);
  if (!existsSync(dest)) copyFileSync(src, dest);
}

const ffmpegOk = hasFfmpeg();
if (!ffmpegOk) {
  console.log('未找到 ffmpeg：只检查现状，不做任何转换。装好 ffmpeg 后重跑即可。');
}

let files;
try {
  files = readdirSync(GALLERY);
} catch (_) {
  console.error('gallery 目录不存在：' + GALLERY);
  process.exit(1);
}

let madeAvc = 0;
let madeThumb = 0;
let recompressed = 0;

for (const name of files) {
  // 1) 实况视频：非 avc 的 mp4 → 转码 .avc.mp4（原片自己备份）
  if (/\.mp4$/i.test(name) && !/\.avc\.mp4$/i.test(name)) {
    if (!ffmpegOk) continue;
    const base = name.replace(/\.mp4$/i, '');
    const out = join(GALLERY, base + '.avc.mp4');
    if (existsSync(out)) continue;
    backup(name);
    const r = run('ffmpeg', [
      '-y', '-i', join(GALLERY, name),
      '-vf', "scale='min(1280,iw)':-2",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      out,
    ], 180000);
    if (r.status === 0) {
      madeAvc++;
      console.log(`  ↦ avc: ${base}.avc.mp4`);
    }
    continue; // 原片不提交，转码后不再做缩略图/压缩
  }
  // 2) 图片
  if (!/\.(jpe?g|png|webp)$/i.test(name)) continue;
  if (/\.thumb\.jpg$/i.test(name)) continue;

  // 2a) 压缩大图（>1MB）
  if (RE && /\.jpe?g$/i.test(name)) {
    const size = statSync(join(GALLERY, name)).size;
    if (size > 1048576) {
      if (!ffmpegOk) continue;
      backup(name);
      const tmp = join(GALLERY, name + '.tmp.jpg');
      const r = run('ffmpeg', [
        '-y', '-i', join(GALLERY, name),
        '-vf', "scale='min(1800,iw)':-2",
        '-q:v', '4', '-frames:v', '1',
        tmp,
      ], 120000);
      if (r.status === 0) {
        // ffmpeg 不允许直接覆盖输入文件，这里 tmp + rename 原子替换
        renameSync(tmp, join(GALLERY, name));
        recompressed++;
        console.log(`  ↦ 压缩: ${name}`);
      }
    }
  }
  // 2b) 缺缩略图 → 生成
  const base = name.replace(/\.[a-z0-9]+$/i, '');
  const thumb = join(GALLERY, base + '.thumb.jpg');
  if (!existsSync(thumb) && ffmpegOk) {
    const r = run('ffmpeg', [
      '-y', '-i', join(GALLERY, name),
      '-vf', "scale='min(480,iw)':-2",
      '-q:v', '7', '-frames:v', '1',
      thumb,
    ], 60000);
    if (r.status === 0) {
      madeThumb++;
      console.log(`  ↦ thumb: ${base}.thumb.jpg`);
    }
  }
}

console.log(`media-prep done: avc=${madeAvc} thumbs=${madeThumb} recompressed=${recompressed}`);
if (BACKUP) console.log('原文件已备份到：' + BACKUP + '（提交前请确认备份完整）');
