/**
 * build.mjs — 静态博客构建脚本（复刻 AtWill 风格站点结构）
 * 读取 content/posts/*.md（带 frontmatter），生成与原站同构的页面：
 * 首页 feed（分页）、文章页、归档、分类、标签、关于、搜索索引。
 * 无 API 后端：点赞/浏览量显示 0，评论相关 UI 不生成。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { marked } from '../vendor/marked.esm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'content');
const POSTS_DIR = join(CONTENT_DIR, 'posts');
const ASSETS_SRC = join(ROOT, 'static');
const DIST = join(ROOT, 'dist');
const PAGE_SIZE = 10;

// ---------- 配置 ----------
const site = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf-8')).site;
const SITE_URL = site.url.replace(/\/+$/, '');
const BASE = (site.base || '').replace(/\/+$/, '');
const withBase = (path) => {
  if (typeof path !== 'string' || !path.startsWith('/')) return path || '';
  // 已含 base 前缀则不再叠加（幂等），避免 /Blog/Blog/
  if (BASE && path.startsWith(BASE + '/')) return path;
  return BASE + path;
};
const EXSEARCH_HASH = 'search-index';
// 构建版本指纹：写入每个页面 meta 和 version.json，PWA 用它检测"有新部署"后自动刷新
const BUILD_VERSION = new Date().toISOString();

// ---------- 资源版本指纹（内容哈希） ----------
// 加在页面 JS/CSS 的 URL 后面（?v=...）。按"文件内容"计算哈希：
// 只有内容变了的文件 URL 才变化 → Service Worker 只失效真的变了的缓存，
// 未变动的资源部署后保持 URL 不变，访客无需重复下载（旧方案是每次部署全站失效）。
function hashContent(content) {
  return createHash('sha1').update(content).digest('hex').slice(0, 8);
}
function hashAssetFile(relPath) {
  // relPath 相对于 static/（如 assets/js/layout.js）；hash 源文件内容，与 dist 一致
  try {
    return 'v' + hashContent(readFileSync(join(ASSETS_SRC, relPath), 'utf-8'));
  } catch (_) {
    return 'v0';
  }
}
// 图片指纹：正文/相册里的图片 URL 带内容哈希（与 JS/CSS 的 ?v= 同一机制）。
// 图片被重新压缩/替换后哈希变化 → URL 变 → SW cache-first 缓存自动换新，旧缓存作废不误用。
// distPath 形如 /Blog/assets/img/gallery/x.jpg（withBase 之后），据此反推 static/ 源文件。
function imgFingerprint(distPath) {
  let rel = String(distPath || '');
  if (BASE && rel.startsWith(BASE + '/')) rel = rel.slice(BASE.length);
  rel = rel.replace(/^\/+/, '');
  const abs = join(ASSETS_SRC, rel);
  try {
    return '?v=' + hashContent(readFileSync(abs)); // 二进制 Buffer 直接哈希
  } catch (_) {
    return '';
  }
}

// 双链图片解析错误收集：全部页面写完后统一报错并中止构建（防止 ![[...]] 原样上线）
const buildErrors = [];

// ---------- 旧地址跳转（改 slug 后保持旧链接可用） ----------
// key = 旧 slug，value = 新 slug；构建会为旧地址生成一个自动跳转页
const REDIRECTS = {
  '2026-10-01 ——《当你沉睡时》': '2026.10.01 ——《当你沉睡时》',
};

// ---------- frontmatter 解析（极简 YAML 子集） ----------
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: md || '' };
  const data = {};
  let currentKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (/^[a-zA-Z_-]+:\s*/.test(line)) {
      const idx = line.indexOf(':');
      currentKey = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if (/^\[.*\]$/.test(val)) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else {
        val = val.replace(/^['"]|['"]$/g, '');
      }
      data[currentKey] = val;
    } else if (currentKey && Array.isArray(data[currentKey]) && line.trim().startsWith('- ')) {
      data[currentKey].push(line.trim().slice(2).trim());
    } else if (currentKey && typeof data[currentKey] === 'string') {
      const trimmed = line.trim();
      if (trimmed) data[currentKey] += ' ' + trimmed;
    }
  }
  const body = m[0] ? md.slice(m[0].length).replace(/^\r?\n/, '') : '';
  return { data, body };
}

// ---------- Markdown 渲染（图片 → pswp-item 结构，带真实尺寸） ----------
marked.setOptions({ gfm: true, breaks: true }); // 单换行也换行（说说/朋友圈式书写习惯）
const renderer = new marked.Renderer();
// marked v15 的 image 渲染器只接收一个 token 对象（含 href/title/text 字段）
renderer.image = (token) => {
  const href = (token && token.href) || '';
  const text = (token && token.text) || '';
  const dim = imageSize(href);
  const sizeAttrs = dim
    ? ` data-pswp-width="${dim.width}" data-pswp-height="${dim.height}"`
    : '';
  const flex = dim ? Math.round((dim.width / dim.height) * 10000) / 100 : 50;
  // 真实宽高比放在 <img> 上：width:100% + aspect-ratio → 图片高度确定（宽/比例），
  // photoset 并排时行高由图片比例撑开，横图完整显示、不被 cover 裁剪。
  // 不放 figure 上，避免 flex stretch 与百分比高度的循环解析（浏览器对 sizes=auto 图片的行高怪癖）。
  const imgRatioAttr = dim ? ` style="aspect-ratio: ${dim.width} / ${dim.height}"` : '';
  // 实况图：图片旁有同名视频 → 标记 live-photo 并内嵌 <video> 盖层（单次播放，不循环）
  const live = liveVideoFor(href);
  const liveClass = live ? ' live-photo' : '';
  const avc = liveVideoAvcFor(href); // 桌面端 H.264 兼容版
  const avcAttr = avc ? ` data-avc-src="${avc}"` : '';
  const videoTag = live
    ? `<video class="live-photo-video" src="${live}" playsinline preload="none" aria-hidden="true"></video>`
    : '';
  // 缩略图（480px）优先加载，原图作为大屏/放大时的候选；灯箱仍用 src（原图）
  const thumb = imageThumbFor(href);
  const fullSrc = withBase(href) + imgFingerprint(withBase(href));
  const srcsetAttr = thumb
    ? ` srcset="${withBase(thumb)} 480w, ${fullSrc} ${dim ? dim.width : 1024}w" sizes="auto"`
    : '';
  return `<figure class="pswp-item${liveClass}"${avcAttr} style="flex: ${flex}"${sizeAttrs}><img loading="lazy" decoding="async"${imgRatioAttr}${srcsetAttr} src="${fullSrc}" alt="${escapeHtml(text)}" />${videoTag}</figure>`;
};

function renderMarkdown(md) {
  let html = marked.parse(md, { renderer });
  // 音乐卡片：{{music <链接>}} → 官方外链播放器 iframe
  // 先处理独立成段（<p>{{music …}}</p>），再处理行内残余
  html = html.replace(/<p>\{\{\s*music\s+([^}]+?)\s*\}\}<\/p>/gi, (m, url) => musicCardHtml(url.trim()) || m);
  html = html.replace(/\{\{\s*music\s+([^}]+?)\s*\}\}/gi, (m, url) => musicCardHtml(url.trim()) || m);
  return html;
}

// ---------- 音乐卡片（{{music <链接>}} → 官方外链播放器 iframe） ----------
// 网易云：https://music.163.com/#/song?id=xxx 或 https://y.music.163.com/m/song?id=xxx
// QQ音乐：https://i.y.qq.com/v8/playsong.html?songid=xxx（QQ App 分享长链）
// 纯数字也可直接当 QQ songid 用。
function musicCardHtml(link) {
  link = String(link || '').trim();
  let src = '';
  if (/music\.163\.com/.test(link)) {
    const m = /[?&]id=(\d+)/.exec(link);
    if (m) src = `https://music.163.com/outchain/player?type=2&id=${m[1]}&auto=0&height=66`;
  } else if (/y\.qq\.com/.test(link)) {
    const m = /[?&]songid=(\d+)/.exec(link);
    if (m) src = `https://i.y.qq.com/n2/m/outchain/player/index.html?songid=${m[1]}&songtype=0`;
  } else if (/^\d+$/.test(link)) {
    src = `https://i.y.qq.com/n2/m/outchain/player/index.html?songid=${link}&songtype=0`;
  }
  if (!src) return '';
  return `<div class="music-player"><div class="music-player__embed"><iframe src="${escapeHtml(src)}" title="音乐播放器" loading="lazy" frameborder="0" allow="autoplay"></iframe></div></div>`;
}

function excerptFrom(text, len = 120) {
  const plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[#>*`~\-\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > len ? plain.slice(0, len) + '…' : plain;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- 图片尺寸读取（PNG/JPEG/GIF/WebP 头解析，用于 pswp flex 计算） ----------
function imageSize(relPath) {
  if (typeof relPath !== 'string' || !relPath) return null;
  let p = relPath.trim();
  if (/^(https?:|data:)/.test(p)) return null;
  if (BASE && p.startsWith(BASE + '/')) p = p.slice(BASE.length); // 去掉 /Blog 前缀
  p = p.replace(/^\/+/, '');
  const candidates = [
    join(ASSETS_SRC, p),                                    // assets/img/<slug>/<file>
    join(ASSETS_SRC, 'assets', 'img', p),                   // 裸文件名
    join(ASSETS_SRC, 'assets', 'img', p.replace(/^assets\/img\//, '')),
  ];
  let buf = null;
  for (const abs of candidates) {
    try { buf = readFileSync(abs); break; } catch (_) { /* 试下一条 */ }
  }
  if (!buf || buf.length < 24) return null;
  try {
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
      if (fmt === 'VP8X') {
        return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      }
      if (fmt === 'VP8 ' || fmt === 'VP8L') {
        const w = buf.readUInt16LE(26) & 0x3fff;
        const h = buf.readUInt16LE(28) & 0x3fff;
        return { width: w, height: h };
      }
      return null;
    }
  } catch (_) {
    return null;
  }
  return null;
}

// 实况图（Live Photo）：图片旁存在同名视频即视为实况图。
// 优先 .avc.mp4（H.264 兼容版，仓库只提交这一份；原 HEVC 原片不提交，avc 即播放源）
const LIVE_VIDEO_CANDIDATES = ['.avc.mp4', '.mp4', '.webm'];
function liveVideoFor(relPath) {
  if (typeof relPath !== 'string' || !relPath) return '';
  let p = relPath.trim();
  if (/^(https?:|data:)/.test(p)) return '';
  if (BASE && p.startsWith(BASE + '/')) p = p.slice(BASE.length); // 去掉 /Blog 前缀
  p = p.replace(/^\/+/, '');
  const base = p.replace(/\.[a-z0-9]+$/i, ''); // 去掉图片扩展名，留同名前缀
  for (const ext of LIVE_VIDEO_CANDIDATES) {
    const cand = base + ext;
    const abs = join(ASSETS_SRC, cand); // static/assets/img/<slug>/<name>.avc.mp4
    try {
      if (statSync(abs).isFile()) return withBase('/' + cand);
    } catch (_) { /* 无此文件，试下一个扩展名 */ }
  }
  return '';
}

// H.264 兼容版：桌面 Chrome/Firefox 播不了 HEVC，转码一份 .avc.mp4 供灯箱回退
function liveVideoAvcFor(relPath) {
  if (typeof relPath !== 'string' || !relPath) return '';
  let p = relPath.trim();
  if (/^(https?:|data:)/.test(p)) return '';
  if (BASE && p.startsWith(BASE + '/')) p = p.slice(BASE.length);
  p = p.replace(/^\/+/, '');
  const base = p.replace(/\.[a-z0-9]+$/i, '');
  const abs = join(ASSETS_SRC, base + '.avc.mp4');
  try {
    if (statSync(abs).isFile()) return withBase('/' + base + '.avc.mp4');
  } catch (_) {}
  return '';
}

// 缩略图：主页/文章列表里图片显示宽度通常只有几百 px，
// 直接用 4MB 原图会让手机解码卡顿 → 优先加载 480px 缩略图（灯箱仍用原图）
function imageThumbFor(relPath) {
  if (typeof relPath !== 'string' || !relPath) return '';
  let p = relPath.trim();
  if (/^(https?:|data:)/.test(p)) return '';
  if (BASE && p.startsWith(BASE + '/')) p = p.slice(BASE.length);
  p = p.replace(/^\/+/, '');
  const base = p.replace(/\.[a-z0-9]+$/i, '');
  const abs = join(ASSETS_SRC, base + '.thumb.jpg');
  try {
    if (statSync(abs).isFile()) return withBase('/' + base + '.thumb.jpg') + imgFingerprint(withBase('/' + base + '.thumb.jpg'));
  } catch (_) {}
  return '';
}

// 构建时自动转码 H.264 兼容版：对每个实况 .mp4，若缺少 .avc.mp4 且环境有 ffmpeg
// （GitHub Actions 的 Ubuntu 自带），生成一份。桌面 Chrome/Firefox 用它播放。
function tryTranscodeLiveVideos() {
  const galleryDir = join(ASSETS_SRC, 'assets', 'img', 'gallery');
  let files;
  try {
    files = readdirSync(galleryDir);
  } catch (_) {
    return;
  }
  // 只处理"存在非 avc 的 mp4"的情况（仓库现在只提交 avc 版，通常直接跳过）
  const pending = files.filter(f => /\.mp4$/i.test(f) && !/\.avc\.mp4$/i.test(f));
  if (!pending.length) return;
  const probe = spawnSync('ffmpeg', ['-version'], { timeout: 5000, stdio: 'ignore' });
  if (probe.error) {
    console.log('实况视频：未找到 ffmpeg，跳过 H.264 兼容版转码（本地预览不受影响）');
    return;
  }
  if (probe.status !== 0) return;
  let made = 0;
  for (const name of pending) {
    const base = name.replace(/\.mp4$/i, '');
    const out = join(galleryDir, base + '.avc.mp4');
    if (existsSync(out)) continue; // 已有兼容版
    const r = spawnSync('ffmpeg', [
      '-y', '-i', join(galleryDir, name),
      '-vf', "scale='min(1280,iw)':-2", // 压到 1280px 宽，体积更小、国内网络加载更快
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      out,
    ], { timeout: 180000, stdio: 'ignore' });
    if (r.status === 0) {
      made++;
      console.log(`  ↦ 实况 H.264 兼容版: ${base}.avc.mp4`);
    }
  }
  if (made) console.log(`实况视频：已转码 ${made} 个 H.264 兼容版（桌面端播放用）`);
}

// 构建时生成 480px 缩略图：主页/文章里的图片显示宽度只有几百 px，
// 直接加载 4MB 原图会让手机解码卡顿。生成 .thumb.jpg 供 srcset 优先加载。
function tryMakeThumbnails() {
  const galleryDir = join(ASSETS_SRC, 'assets', 'img', 'gallery');
  let files;
  try {
    files = readdirSync(galleryDir);
  } catch (_) {
    return;
  }
  // 缩略图已随仓库提交：只处理"有图片缺 .thumb.jpg"的情况（CI 兜底用）。
  // 注意：.thumb.jpg 自身必须排除，否则会把已生成的缩略图当成"缺缩略图的图片"再生成一层。
  const pending = files.filter(name => {
    if (/\.thumb\.jpg$/i.test(name)) return false;
    if (!/\.(jpe?g|png|webp)$/i.test(name)) return false;
    const base = name.replace(/\.[a-z0-9]+$/i, '');
    return !existsSync(join(galleryDir, base + '.thumb.jpg'));
  });
  if (!pending.length) return;
  const probe = spawnSync('ffmpeg', ['-version'], { timeout: 5000, stdio: 'ignore' });
  if (probe.error || probe.status !== 0) {
    console.log('缩略图：未找到 ffmpeg，跳过（不影响构建）');
    return;
  }
  let made = 0;
  for (const name of pending) {
    const base = name.replace(/\.[a-z0-9]+$/i, '');
    const out = join(galleryDir, base + '.thumb.jpg');
    if (existsSync(out)) continue; // 已有缩略图
    const r = spawnSync('ffmpeg', [
      '-y', '-i', join(galleryDir, name),
      '-vf', "scale='min(480,iw)':-2",
      '-q:v', '7', '-frames:v', '1',
      out,
    ], { timeout: 60000, stdio: 'ignore' });
    if (r.status === 0) {
      made++;
      console.log(`  ↦ 缩略图: ${base}.thumb.jpg`);
    }
  }
  if (made) console.log(`图片：已生成 ${made} 个缩略图（小屏加载更快、手机不卡）`);
}

// 每行最多 3 张（与原站 photoset 布局一致），flex 每行归一化到 100
function groupPhotos(figures) {
  const rows = [];
  for (let i = 0; i < figures.length; i += 3) {
    const row = figures.slice(i, i + 3);
    let total = 0;
    row.forEach(f => {
      const dim = imageSize(f.src || '');
      f.w = dim ? dim.width : null;
      f.h = dim ? dim.height : null;
      total += f.w && f.h ? (f.w / f.h) * 100 : 100;
    });
    row.forEach(f => {
      const raw = f.w && f.h ? (f.w / f.h) * 100 : 100;
      f.flex = Math.round((raw / total) * 10000) / 100;
    });
    rows.push(row);
  }
  return rows;
}

// ---------- 连续图片（同一段落内只有图片）→ 并排相框（原站 photoset 结构） ----------
function figuresFromHtml(html) {
  return Array.from(html.matchAll(/<figure class="pswp-item[^"]*"[\s\S]*?<\/figure>/g))
    .map(m => {
      const fig = m[0];
      const srcMatch = fig.match(/src="([^"]+)"/);
      return { html: fig, src: srcMatch ? srcMatch[1] : '' };
    });
}

function photosetHtml(figures) {
  return `<div class="photoset">${groupPhotos(figures).map(row =>
    `<div class="photos">${row.map(f => f.html.replace(/flex: [\d.]+/, `flex: ${f.flex}`)).join('')}</div>`
  ).join('')}</div>`;
}

// 只把「段落里仅有图片、且连着 2 张以上」包成并排相框；单张保持整幅，与原站一致
function wrapFigureRuns(html) {
  // 只合并同一段落内的连续 figure：figure 内容匹配加 (?:(?!</p>|<p>)[\s\S]) 禁止跨越段落边界，
  // 否则 [\s\S]*?</figure> 会回溯穿过文字段落，把前面单图段落整段吸进后面的相框（图位置错乱）。
  return html.replace(
    /<p>(?:\s|<br\s*\/?>)*(?:<figure class="pswp-item[^"]*"(?:(?!<\/p>|<p>)[\s\S])*?<\/figure>(?:\s|<br\s*\/?>)*){2,}<\/p>/g,
    (block) => photosetHtml(figuresFromHtml(block))
  );
}

// ---------- memo 随机头像池 ----------
// 把头像图放进 static/assets/img/avatars/（命名任意），每条 memo 按 slug 稳定分配一张
let _avatarPool = null;
function avatarPool() {
  if (_avatarPool) return _avatarPool;
  _avatarPool = [];
  const dir = join(ASSETS_SRC, 'assets', 'img', 'avatars');
  try {
    for (const f of readdirSync(dir)) {
      if (/\.(jpe?g|png|webp|gif)$/i.test(f)) _avatarPool.push(withBase(`/assets/img/avatars/${f}`));
    }
  } catch (_) { /* 目录不存在则无随机头像 */ }
  return _avatarPool;
}

// slug 稳定哈希：同一 memo 永远同一头像；头像池变化时会重新洗牌
function memoAvatar(post) {
  const pool = avatarPool();
  if (!pool.length) return withBase(`/logo.png`);
  let h = 0;
  for (const ch of post.slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

// ---------- Obsidian 双链图片：![[name.png]] → 站点图片链接 ----------
// 图片放在 static/assets/img/<slug>/ 下（文件名与双链一致，扩展名可省略）
const IMG_EXTS = ['', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'];
function resolveObsidianEmbeds(body, slug) {
  if (!body.includes('![[')) return body; // 没有双链直接返回（避免为无图文章误报目录缺失）
  // 优先在文章自己的目录 static/assets/img/<slug>/ 找；找不到再回退到 gallery
  // （Portal 上传目录：正文里 ![[名字]] 直接引用 gallery 图是常见用法，两种都支持）
  const slugDir = join(ASSETS_SRC, 'assets', 'img', slug);
  const galleryDir = join(ASSETS_SRC, 'assets', 'img', 'gallery');
  let slugFiles = null;
  let galleryFiles = null;
  try { slugFiles = new Set(readdirSync(slugDir)); } catch (_) { /* 目录不存在：走 gallery 回退 */ }
  try { galleryFiles = new Set(readdirSync(galleryDir)); } catch (_) { /* gallery 也没有 */ }
  if (!slugFiles && !galleryFiles) {
    buildErrors.push(`双链图片目录不存在：static/assets/img/${slug}/（文章 slug=${slug}，正文里的 ![[...]] 会原样显示成文本）`);
    return body;
  }
  return body.replace(/!\[\[([^\]]+)\]\]/g, function (whole, name) {
    const base = name.trim().split('|')[0]; // 兼容 ![[img|500]] 的尺寸写法（忽略尺寸）
    const stem = base.replace(/\.[a-z0-9]+$/i, ''); // 双链带扩展名但文件被转成其他格式时，尝试替换扩展名
    const candidates = [base];
    for (const ext of IMG_EXTS) {
      candidates.push(base + ext, stem + ext);
    }
    for (const cand of candidates) {
      if (slugFiles && slugFiles.has(cand)) {
        // 路径含空格，用尖括号包裹（Markdown 标准的含空格目标写法）
        // 不在这里拼 ?v= 指纹：renderer.image 会对所有图片统一加指纹并读取尺寸/缩略图/实况视频，
        // 提前拼上指纹会导致后三者读取失败（URL 带查询串找不到文件）
        const href = withBase('/assets/img/' + slug + '/') + cand;
        return `![](<${href}>)`;
      }
    }
    for (const cand of candidates) {
      if (galleryFiles && galleryFiles.has(cand)) {
        const href = withBase('/assets/img/gallery/') + cand;
        return `![](<${href}>)`;
      }
    }
    buildErrors.push(`双链图片未找到：static/assets/img/${slug}/${name}（gallery 目录里也没有）`);
    return whole;
  });
}

// ---------- 正文裸文件名图片：![](名字.webp) → 在 static/assets/img/<slug>/ 中查找并补全路径 ----------
// （Obsidian 里把封面等图直接 ![[名字]] 改写成 markdown 后的常见形态）
function resolveBareImages(body, slug) {
  let files = null;    // 惰性读取：只有真遇到裸文件名引用才读目录
  let dirMissing = false;
  return body.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (whole, alt, ref) {
    if (ref.indexOf('/') >= 0 || ref.indexOf('http') === 0 || ref.indexOf('data:') === 0) return whole; // 已是路径/外链
    if (files === null && !dirMissing) {
      try {
        files = new Set(readdirSync(join(ASSETS_SRC, 'assets', 'img', slug)));
      } catch (_) {
        dirMissing = true;
        buildErrors.push(`裸文件名图片目录不存在：static/assets/img/${slug}/（正文里的裸文件名图片无法补全路径）`);
      }
    }
    if (files === null) return whole; // 目录不可用，保持原样（错误已记录）
    const stem = ref.replace(/\.[a-z0-9]+$/i, ''); // 扩展名不匹配时尝试替换（文件可能转过格式）
    const candidates = [ref];
    for (const ext of IMG_EXTS) {
      candidates.push(ref + ext, stem + ext);
    }
    for (const cand of candidates) {
      if (files.has(cand)) {
        // 同 resolveObsidianEmbeds：不提前拼指纹，交给 renderer.image 统一处理
        const href = withBase('/assets/img/' + slug + '/') + cand;
        return `![${alt}](<${href}>)`;
      }
    }
    buildErrors.push(`裸文件名图片未找到：static/assets/img/${slug}/${ref}`);
    return whole; // 目录里没有就保持原样
  });
}

// ---------- 读取文章 ----------
function loadPosts() {
  const posts = [];
  // 删光所有文章后 GitHub 会把空的 content/posts/ 目录一并删除，此时按无文章构建
  if (!existsSync(POSTS_DIR)) return posts;
  for (const file of readdirSync(POSTS_DIR)) {
    if (!file.endsWith('.md')) continue;
    const md = readFileSync(join(POSTS_DIR, file), 'utf-8');
    const { data, body } = parseFrontmatter(md);
    const draft = String(data.draft ?? '').trim().toLowerCase();
    if (draft === 'true' || draft === '1' || draft === 'yes') continue;
    const slug = data.slug || file.replace(/\.md$/, '');
    const rawDate = String(data.date || '').trim();
    const date = new Date(rawDate.replace(' ', 'T'));
    const tags = Array.isArray(data.tags) ? data.tags : String(data.tags || '').split(',').filter(Boolean);
    const type = data.type === 'memo' ? 'memo' : 'post';
    const resolvedBody = resolveBareImages(resolveObsidianEmbeds(body, slug), slug);
    posts.push({
      slug,
      title: data.title || slug,
      date,
      // 显示用日期（按原文+08:00 截取，避免 toISOString 的 UTC 偏移）：文章到日，说说带时分
      dateText: rawDate ? rawDate.replace('T', ' ').slice(0, type === 'memo' ? 16 : 10) : '',
      type,
      avatar: data.avatar || '',
      location: data.location || '',
      category: data.category || '未分类',
      tags,
      excerpt: data.excerpt || excerptFrom(resolvedBody),
      banner: data.banner || '',
      body: resolvedBody,
    });
  }
  posts.sort((a, b) => b.date - a.date);
  return posts;
}

// ---------- 页面骨架 ----------
function headHtml(title, { bodyData = '', extraHead = '', pageType = '', pagePath = '', pageDescription = '', localOnly = false } = {}) {
  const keywords = site.keywords || `${site.name},${site.author}`;
  const absPath = pagePath || '/';
  const fullUrl = SITE_URL + absPath;
  const description = pageDescription || site.description;
  const ogType = pageType === 'post' ? 'article' : 'website';
  const remoteAssets = localOnly ? '' : `
  <link rel="preconnect" href="https://registry.npmmirror.com">
  <link rel="preconnect" href="https://registry.npmmirror.com" crossorigin>
  <!-- 字体 CSS 异步加载：不阻塞首屏渲染；preload 优先拉取，就绪后切换为 stylesheet -->
  <link rel="preload" as="style" href="https://registry.npmmirror.com/lxgw-wenkai-screen-webfont/1.7.0/files/lxgwwenkaiscreen.css" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://registry.npmmirror.com/lxgw-wenkai-screen-webfont/1.7.0/files/lxgwwenkaiscreen.css"></noscript>
  <script async src="https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"></script>`;
  return `<!DOCTYPE html>
<html lang="${site.lang}" data-exsearch-api="${withBase(`/${EXSEARCH_HASH}.json`)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000">
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6efe7">
  <meta name="keywords" content="${keywords}">
  ${remoteAssets}
  <link rel="stylesheet" href="${withBase(`/assets/main.css`)}">
  <link rel="stylesheet" href="${withBase(`/assets/custom.css?v=${hashAssetFile('assets/custom.css')}`)}">
  <link rel="stylesheet" href="${withBase(`/assets/fontawesome/all.min.css`)}">
  <script>
    window.ExSearchConfig = {
      root: '',
      api: (document.documentElement && document.documentElement.dataset
        ? document.documentElement.dataset.exsearchApi || ''
        : ''),
    };
  </script>
  <meta http-equiv="x-dns-prefetch-control" content="on">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <link rel="icon" type="image/jpeg" href="${withBase(`/favicon.jpg`)}?v=2" />
  <link rel="shortcut icon" href="${withBase(`/favicon.jpg`)}?v=2" />
  <link rel="apple-touch-icon" sizes="180x180" href="${withBase(`/apple-touch-icon.png`)}" />
  <meta name="apple-mobile-web-app-title" content="${site.name}" />
  <link rel="manifest" href="${withBase(`/site.webmanifest`)}" />
  <link rel="canonical" href="${fullUrl}">
  <meta name="application-name" content="${site.name}">
  <meta name="build-version" content="${BUILD_VERSION}">
  <meta name="apple-mobile-web-app-title" content="${site.name}">
  <meta name="theme-color" content="#000000">
  ${extraHead}
  <title>${title}</title>
  <meta name="author" content="${site.author}">
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:site_name" content="${site.name}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:url" content="${fullUrl}">
  <meta property="og:image" content="${SITE_URL}/logo.png">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:card" content="summary">
</head>
<body data-about-url="${withBase(`/about/`)}"${bodyData}>`;
}

function shellStart() {
  return `
<div class="app-shell js-app-shell">
  <div class="app-layout">
    <section class="app-main-column">
      <header class="mobile-header">
        <a class="mobile-brand" href="${SITE_URL}/" target="_self">
          <img class="avatar" src="${withBase(`/logo.png`)}" alt="${site.name}">
          <span class="mobile-brand-copy">
            <strong>${site.name}</strong>
            <em>${site.subtitle}</em>
          </span>
        </a>
        <div class="mobile-header-actions">
          <button class="site-nav-link mobile-back-to-top js-back-to-top is-hidden" type="button" aria-label="Back to top" title="Back to top" aria-hidden="true" tabindex="-1">
            <i class="fa-solid fa-arrow-up-long" aria-hidden="true"></i>
            <span class="sr-only">back to top</span>
          </button>
          <a href="#" target="_self" class="site-nav-link search-form-input ga-highlight" aria-label="search" title="search">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <span class="sr-only">search</span>
          </a>
          <button class="mobile-menu-toggle js-menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu-panel" aria-label="Open side menu">
            <i class="fa-solid fa-bars" aria-hidden="true"></i>
            <span class="sr-only">menu</span>
          </button>
        </div>
      </header>
      <div class="container">
        <main class="layout-main">`;
}

function sideInSite() {
  return `<section class="side-panel side-in-site">
    <h2><i class="fa-solid fa-compass panel-icon" aria-hidden="true"></i>In Site</h2>
    <nav class="in-site-links" aria-label="In site navigation">
      <a class="in-site-link js-route-nav-link" data-nav-kind="index" href="${SITE_URL}/" target="_self"><i class="fa-solid fa-house in-site-link-icon" aria-hidden="true"></i><span>Home</span></a>
      <a class="in-site-link js-route-nav-link" data-nav-kind="archives" href="${withBase(`/archives/`)}" target="_self"><i class="fa-solid fa-box-archive in-site-link-icon" aria-hidden="true"></i><span>Archives</span></a>
      <a class="in-site-link js-route-nav-link" data-nav-kind="about" href="${withBase(`/about/`)}" target="_self"><i class="fa-solid fa-circle-info in-site-link-icon" aria-hidden="true"></i><span>About</span></a>
      <a class="in-site-link js-route-nav-link" data-nav-kind="fcircle" href="${withBase(`/fcircle/`)}" target="_self"><svg class="in-site-link-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8"><circle cx="15.1" cy="8.9" r="6.1"/><circle cx="8.9" cy="15.1" r="6.1"/></svg><span>FCIRCLE</span></a>
      <a href="${withBase(`/portal.html`)}" target="_self" class="in-site-link js-route-nav-link js-portal-nav-link" data-nav-kind="portal" aria-hidden="true" style="display:none"><i class="fa-solid fa-pen-to-square in-site-link-icon" aria-hidden="true"></i><span>Portal</span></a>
    </nav>
  </section>`;
}

function sideCategories() {
  const cats = categoriesWithCount();
  const items = cats.map(c => `
      <a href="${withBase(`/category/${encodeURIComponent(c.name)}/`)}" target="_self">
        ${escapeHtml(c.name)}<sup class="taxonomy-count">${c.count}</sup>
      </a>`).join('');
  return `<section class="side-panel">
    <h2><i class="fa-solid fa-folder-open panel-icon" aria-hidden="true"></i>Categories</h2>
    <div class="taxonomy-list">${items}</div>
  </section>`;
}

function sideTags() {
  const tags = tagsWithCount();
  const items = tags.map(t => `
      <a href="${withBase(`/tag/${encodeURIComponent(t.name)}/`)}" target="_self">
        #${escapeHtml(t.name)}<sup class="taxonomy-count">${t.count}</sup>
      </a>`).join('');
  return `<section class="side-panel">
    <h2><i class="fa-solid fa-hashtag panel-icon" aria-hidden="true"></i>Tags</h2>
    <div class="taxonomy-list">${items}</div>
  </section>`;
}

function shellEnd(extraScripts = '', includeSearch = true) {
  // 搜索（jQuery + ExSearch）改为按需懒加载：首次点击搜索按钮/按 / 时才注入，
  // 见 layout.js 的 initSearchLazyLoad —— 不再在每个页面预载 87KB 的 jQuery。
  return `</main>
        <footer class="site-footer">
          <span><a href="https://creativecommons.org/licenses/by-nc-nd/4.0/" target="_blank">CC BY-NC-ND 4.0</a></span>
        </footer>
        </div>
    </section>

    <div class="app-side-column">
      <aside class="mobile-menu-panel js-menu-panel" id="mobile-menu-panel" aria-hidden="true">
        <div class="mobile-menu-head">
          <span>Menu</span>
          <button class="mobile-menu-close js-menu-close" type="button" aria-label="Close side menu">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            <span class="sr-only">close</span>
          </button>
        </div>
        <div class="mobile-menu-body">
          ${sideInSite()}
          ${sideCategories()}
          ${sideTags()}
        </div>
      </aside>
    </div>
  </div>
  <div class="mobile-menu-scrim js-menu-scrim" aria-hidden="true"></div>
</div>

${extraScripts}
<script type="module" src="${withBase(`/assets/js/layout.js?v=${hashAssetFile('assets/js/layout.js')}`)}"></script>
</body>
</html>`;
}

// ---------- feed 条目 ----------
function entryArticle(post) {
  const banner = post.banner
    ? `<a class="article-banner" href="${withBase(`/archives/${post.slug}/`)}">
      <img src="${withBase(post.banner)}" alt="${post.title}" loading="lazy" decoding="async">
      <span class="article-banner-shade" aria-hidden="true"></span>
      <h2 class="article-title article-title-overlay">${post.title}</h2>
    </a>`
    : `<h2 class="article-title"><a href="${withBase(`/archives/${post.slug}/`)}">${post.title}</a></h2>`;
  return `<div class="entry-article">
    <div class="article-tag">
      <a href="${withBase(`/category/${post.category}/`)}">${escapeHtml(post.category)}</a>
    </div>
    ${banner}
    <p class="article-excerpt">${post.excerpt}</p>
    <div class="article-meta">
      <span>${post.dateText}</span>
      <span class="article-meta-spacer"></span>
    </div>
  </div>`;
}

function entryMemo(post) {
  const rendered = renderMarkdown(post.body);
  const figures = figuresFromHtml(rendered);
  const contentHtml = rendered
    .replace(/<figure class="pswp-item[^"]*"[\s\S]*?<\/figure>/g, '')
    // 图片剥离后会留下空 <p>（内部只剩换行），造成文字与图片间随图片数增长的巨大间距
    .replace(/<p>(?:\s|<br\s*\/?>)*<\/p>/gi, '')
    .trim();
  const photosHtml = figures.length ? photosetHtml(figures) : '';
  return `<div class="entry-memo pswp-gallery">
    <div class="memo-head">
      <img class="memo-avatar" src="${post.avatar ? withBase(post.avatar) : memoAvatar(post)}" alt="${escapeHtml(site.author)}">
      <div class="memo-author">
        <strong>${escapeHtml(site.author)}</strong>
        <span>${post.dateText}</span>
      </div>
    </div>
    <div class="memo-content">${contentHtml}</div>
    ${post.location ? `<div class="memo-location"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(post.location)}</div>` : ''}
    ${photosHtml}
  </div>`;
}

// ---------- 分类/标签统计 ----------
let _posts = [];
let _categories = null;
let _tags = null;

function categoriesWithCount() {
  if (_categories) return _categories;
  const map = {};
  _posts.forEach(p => { map[p.category] = (map[p.category] || 0) + 1; });
  _categories = Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return _categories;
}

function tagsWithCount() {
  if (_tags) return _tags;
  const map = {};
  _posts.forEach(p => p.tags.forEach(t => { map[t] = (map[t] || 0) + 1; }));
  _tags = Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return _tags;
}

// ---------- 页面生成 ----------
function buildIndexPage(posts, pageIndex, totalPages) {
  const entries = posts.map(p => p.type === 'memo' ? entryMemo(p) : entryArticle(p)).join('');
  const statusText = pageIndex >= totalPages ? 'That is all' : 'Scroll down for older';
  // 原站所有分页页的 index-root 都是 '/'（index.js 按 '/page/N/' 拼接），保持 '/'
  const html = headHtml(`${site.name} - ${site.subtitle}`, {
    pagePath: pageIndex === 1 ? '/' : `/page/${pageIndex}/`,
  }) + shellStart() + `
<main class="feed" data-index-root="${withBase(`/`)}" data-total-pages="${totalPages}">
  ${entries}
</main>
<div class="stream-status stream-status-bottom" id="stream-status-bottom" data-state="${pageIndex >= totalPages ? 'end' : 'idle'}" aria-live="polite">${statusText}</div>
` + shellEnd(`<script type="module" src="${withBase(`/assets/js/index.js?v=${hashAssetFile('assets/js/index.js')}`)}"></script>`);
  return html;
}

function katexHead() {
  return `<link rel="preload" as="style" href="${withBase(`/assets/katex/katex.min.css`)}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="${withBase(`/assets/katex/katex.min.css`)}"></noscript>
<link rel="stylesheet" href="${withBase(`/assets/katex/katex.min.css`)}">`;
}

function navTitle(post) {
  // memo 与原站一致：显示「作者: 摘要」而非标题
  if (post.type === 'memo') {
    return `${site.author}: ${excerptFrom(post.body.replace(/!\[[^\]]*\]\([^)]*\)/g, ''), 60)}`;
  }
  return post.title;
}

function postNav(prev, next) {
  const prevHtml = prev
    ? `<a class="nav-item" href="${withBase(`/archives/${prev.slug}/`)}">
    <div class="nav-label">prev</div>
    <div class="nav-title">${escapeHtml(navTitle(prev))}</div>
  </a>`
    : `<span class="nav-item"></span>`;
  const nextHtml = next
    ? `<a class="nav-item" href="${withBase(`/archives/${next.slug}/`)}">
    <div class="nav-label">next</div>
    <div class="nav-title">${escapeHtml(navTitle(next))}</div>
  </a>`
    : `<span class="nav-item"></span>`;
  return `<nav class="post-nav">
  ${prevHtml}
  ${nextHtml}
</nav>`;
}

function buildPostPage(post, prev, next) {
  const categoryTag = post.category
    ? `<div class="tag"><a href="${withBase(`/category/${post.category}/`)}">${escapeHtml(post.category)}</a></div>`
    : '';
  // 同一段落里连着的多张图片 → 并排相框（Obsidian 里 ![[a]]![[b]]![[c]] 的语义）
  const bodyHtml = wrapFigureRuns(renderMarkdown(post.body));
  const scripts = `<script defer src="${withBase(`/assets/katex/katex.min.js`)}"></script>
<script defer src="${withBase(`/assets/katex/auto-render.min.js`)}"></script>
<script type="module" src="${withBase(`/assets/js/post.js?v=${hashAssetFile('assets/js/post.js')}`)}"></script>`;
  const html = headHtml(`${post.title} - ${site.name}`, {
    pageType: 'post',
    pagePath: `/archives/${post.slug}/`,
    pageDescription: post.excerpt,
    extraHead: katexHead() + (post.date ? `<meta property="article:published_time" content="${post.date.toISOString()}">` : ''),
  }) + shellStart() + `
<header class="article-header">
  ${categoryTag}
  <h1>${escapeHtml(post.title)}</h1>
  <div class="meta">
    <span>${post.dateText}</span>
    <span class="author">${escapeHtml(site.author)}</span>
    <span class="article-meta-spacer"></span>
    <span class="index-metric-btn index-metric-static pageview" aria-label="View count"><i class="fa-regular fa-eye" aria-hidden="true"></i><span id="busuanzi_value_page_pv">…</span></span>
    <a class="index-metric-btn js-auth-edit" href="${withBase(`/portal.html?tab=edit&slug=${post.slug}`)}" target="_self" style="display:none"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i></a>
  </div>
</header>
<article class="article-body pswp-gallery">
${bodyHtml}
</article>
${postNav(prev, next)}
` + shellEnd(scripts);
  return html;
}

function buildMemoPage(post, prev, next) {
  const rendered = renderMarkdown(post.body);
  const figures = figuresFromHtml(rendered);
  const contentHtml = rendered
    .replace(/<figure class="pswp-item[^"]*"[\s\S]*?<\/figure>/g, '')
    // 图片剥离后会留下空 <p>（内部只剩换行），造成文字与图片间随图片数增长的巨大间距
    .replace(/<p>(?:\s|<br\s*\/?>)*<\/p>/gi, '')
    .trim();
  const photosHtml = figures.length ? photosetHtml(figures) : '';
  const scripts = `<script type="module" src="${withBase(`/assets/js/post.js?v=${hashAssetFile('assets/js/post.js')}`)}"></script>`;
  const html = headHtml(`${post.title} - ${site.name}`, {
    pageType: 'post',
    pagePath: `/archives/${post.slug}/`,
    pageDescription: post.excerpt,
    extraHead: katexHead() + (post.date ? `<meta property="article:published_time" content="${post.date.toISOString()}">` : ''),
  }) + shellStart() + `
<div class="memo-page pswp-gallery">
  <div class="memo-content">${contentHtml}</div>
  ${post.location ? `<div class="memo-location"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(post.location)}</div>` : ''}
  ${photosHtml}
  <div class="memo-meta">
    <span>${post.dateText}</span>
    <span class="memo-meta-spacer"></span>
    <span class="index-metric-btn index-metric-static pageview" aria-label="View count"><i class="fa-regular fa-eye" aria-hidden="true"></i><span id="busuanzi_value_page_pv">…</span></span>
    <a class="index-metric-btn js-auth-edit" href="${withBase(`/portal.html?tab=edit&slug=${post.slug}`)}" target="_self" style="display:none"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i></a>
  </div>
</div>
${postNav(prev, next)}
` + shellEnd(scripts);
  return html;
}

function buildArchivesPage() {
  const items = _posts.map(p => {
    const title = p.type === 'memo'
      ? `${site.author}: ${excerptFrom(p.body.replace(/!\[[^\]]*\]\([^)]*\)/g, ''), 60)}`
      : p.title;
    return `
  <a href="${withBase(`/archives/${p.slug}/`)}" class="archive-item">
    <span class="post-title">${escapeHtml(title)}</span>
    <span class="time">${p.dateText}</span>
  </a>`;
  }).join('');
  const html = headHtml(`Archives - ${site.name}`, { pagePath: '/archives/' }) + shellStart() + `
<div class="archive-title">Archives</div>
<div class="archives-container">${items}
</div>
` + shellEnd();
  return html;
}

function buildTaxonomyPage(kind, name, posts) {
  const items = posts.map(p => `
  <a href="${withBase(`/archives/${p.slug}/`)}" class="archive-item">
    <span class="post-title">${escapeHtml(p.type === 'memo' ? `${site.author}: ${excerptFrom(p.body, 60)}` : p.title)}</span>
    <span class="time">${p.dateText}</span>
  </a>`).join('');
  const label = kind === 'category' ? `Category: ${name}` : `Tag: ${name}`;
  const path = kind === 'category'
    ? `/category/${encodeURIComponent(name)}/`
    : `/tag/${encodeURIComponent(name)}/`;
  const html = headHtml(`${label} - ${site.name}`, { pagePath: path }) + shellStart() + `
<div class="archive-title">${escapeHtml(label)}</div>
<div class="archives-container">${items}
</div>
` + shellEnd();
  return html;
}

// ---------- 关于页「编年史」时间线 ----------
// 数据见 content/chronicle.json：date 可留空（留空则该条不显示时间），tag 可选。
const CHRONICLE_CSS = `<style>
    /* 导语与 About Me 正文同字号同缩进（.article-body / .about-intro 的 16px） */
    .about-chronicle-intro {
      margin: 0; padding: 18px 16px 0;
      color: var(--text-2); font-size: 1rem; line-height: 1.8;
    }
    .about-timeline { list-style: none; margin: 0; padding: 10px 16px 18px; }
    .about-timeline-item { display: flex; align-items: flex-start; }
    /* 时间列宽度取 ISO 日期的 10 字符（ch 随字体自适应），右对齐让日期紧贴左内边距；
       留空的日期仍占位，保证竖线与圆点对齐 */
    .about-timeline-time {
      flex: 0 0 10ch; width: 10ch; margin-right: 8px; padding-top: 3px;
      font-family: var(--mono); font-size: 12.5px; line-height: 1.6;
      color: var(--text-3); text-align: right; white-space: nowrap;
    }
    /* align-self: stretch 必须保留：flex 行默认 flex-start 会让这个空 span 高度塌成 0，
       ::before 的 top:0/bottom:0 竖线就整条消失（grid 布局时是默认拉伸的） */
    .about-timeline-mark {
      flex: 0 0 18px; width: 18px; align-self: stretch; margin-right: 10px; position: relative;
    }
    .about-timeline-mark::before {
      content: ''; position: absolute; left: 50%; top: 0; bottom: 0;
      width: 2px; margin-left: -1px; background: var(--rule);
    }
    .about-timeline-mark::after {
      content: ''; position: absolute; left: 50%; top: 6px;
      width: 9px; height: 9px; margin-left: -4.5px; border-radius: 50%;
      background: var(--accent); box-shadow: 0 0 0 3px var(--bg);
    }
    .about-timeline-item:first-child .about-timeline-mark::before { top: 12px; }
    .about-timeline-item:last-child .about-timeline-mark::before { bottom: auto; height: 11px; }
    .about-timeline-body { flex: 1 1 auto; min-width: 0; padding-bottom: 22px; }
    .about-timeline-item:last-child .about-timeline-body { padding-bottom: 0; }
    .about-timeline-head { margin: 0 0 4px; display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; }
    .about-timeline-title { font-weight: 600; color: var(--text); }
    .about-timeline-tag {
      padding: 1px 7px; border: 1px solid var(--rule); border-radius: 999px;
      font-size: 11.5px; line-height: 1.6; color: var(--text-3); white-space: nowrap;
    }
    .about-timeline-tag.is-fix { border-color: rgba(217,119,87,.5); color: #d97757; }
    .about-timeline-desc { margin: 0; color: var(--text-2); font-size: 1rem; line-height: 1.8; }
    @media (max-width: 640px) {
      .about-timeline-item {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        grid-template-areas: "mark time" "mark body";
        column-gap: 10px; row-gap: 2px;
      }
      .about-timeline-mark { grid-area: mark; margin-right: 0; }
      .about-timeline-time {
        grid-area: time; flex: none; width: auto; margin: 0;
        text-align: left; padding-top: 0;
      }
      .about-timeline-body { grid-area: body; }
    }
  </style>`;

function renderChronicleItems(entries) {
  return entries.map((entry) => {
    const date = String(entry.date || '').trim();
    const tag = String(entry.tag || '').trim();
    const title = escapeHtml(String(entry.title || '').trim());
    const desc = String(entry.desc || '').trim();
    const timeHtml = `<span class="about-timeline-time">${date ? escapeHtml(date) : ''}</span>`;
    const tagHtml = tag
      ? `<span class="about-timeline-tag${tag === '修复' ? ' is-fix' : ''}">${escapeHtml(tag)}</span>`
      : '';
    const descHtml = desc ? `        <p class="about-timeline-desc">${escapeHtml(desc)}</p>\n` : '';
    return `    <li class="about-timeline-item">
      ${timeHtml}
      <span class="about-timeline-mark" aria-hidden="true"></span>
      <div class="about-timeline-body">
        <p class="about-timeline-head">${tagHtml}<span class="about-timeline-title">${title}</span></p>
${descHtml}      </div>
    </li>`;
  }).join('\n');
}

function buildChronicleSection() {
  const dataPath = join(CONTENT_DIR, 'chronicle.json');
  if (!existsSync(dataPath)) return '';
  let data;
  try {
    data = JSON.parse(readFileSync(dataPath, 'utf-8'));
  } catch (error) {
    console.warn(`[chronicle] content/chronicle.json 解析失败，已跳过编年史：${error.message}`);
    return '';
  }
  const entries = (Array.isArray(data.entries) ? data.entries : []).filter(e => e && (e.title || e.desc));
  if (!entries.length) return '';
  // 默认最新在上（desc）：数据文件按时间正序追加即可，渲染时倒序；order 填 "asc" 可改回旧在上。
  const order = String(data.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const ordered = order === 'asc' ? entries : entries.slice().reverse();
  const intro = String(data.intro || '').trim();
  const introHtml = intro ? `  <p class="about-chronicle-intro">${escapeHtml(intro)}</p>\n` : '';
  return `<section class="about-section about-chronicle">
  <div class="about-section-head">
    <h2>${escapeHtml(String(data.title || 'Chronicle'))}</h2>
  </div>
${introHtml}  <ol class="about-timeline">
${renderChronicleItems(ordered)}
  </ol>
</section>
`;
}

function buildAboutPage() {
  const mdPath = join(CONTENT_DIR, 'pages', 'about.md');
  const md = existsSync(mdPath) ? readFileSync(mdPath, 'utf-8') : '# About\n\n（还没有写关于页。）';
  const { body } = parseFrontmatter(md);
  const bodyHtml = renderMarkdown(body);
  const trackedUrls = _posts.map(p => `/archives/${p.slug}/`);
  const chronicleSection = buildChronicleSection();
  const scripts = `<script defer src="${withBase(`/assets/katex/katex.min.js`)}"></script>
<script defer src="${withBase(`/assets/katex/auto-render.min.js`)}"></script>
<script type="module" src="${withBase(`/assets/js/about.js?v=${hashAssetFile('assets/js/about.js')}`)}"></script>`;
  const html = headHtml(`About - ${site.name}`, { pagePath: '/about/', extraHead: katexHead() + (chronicleSection ? CHRONICLE_CSS : '') }) + shellStart() + `
<section class="about-section">
  <div class="about-section-head">
    <h2>About Me</h2>
  </div>
  <article class="about-intro article-body pswp-gallery">
    ${bodyHtml}
  </article>
</section>
<section class="about-section js-about-stats" data-running-since="${site.since}" data-tracked-urls='${JSON.stringify(trackedUrls)}'>
  <div class="about-section-head">
    <h2>Site Stats</h2>
  </div>
  <div class="about-stats-grid">
    <article class="about-stat-card">
      <p class="about-stat-label">Running Time</p>
      <p class="about-stat-value"><span class="js-about-runtime-value">--</span><small>days</small></p>
      <p class="about-stat-meta js-about-runtime-meta">--</p>
    </article>
    <article class="about-stat-card">
      <p class="about-stat-label">Posts</p>
      <p class="about-stat-value">${_posts.filter(p => p.type === 'post').length}</p>
      <p class="about-stat-meta">Long-form writings</p>
    </article>
    <article class="about-stat-card">
      <p class="about-stat-label">Memos</p>
      <p class="about-stat-value">${_posts.filter(p => p.type === 'memo').length}</p>
      <p class="about-stat-meta">Short updates</p>
    </article>
    <article class="about-stat-card">
      <p class="about-stat-label">Views</p>
      <p class="about-stat-value js-about-views" id="busuanzi_value_site_pv">--</p>
      <p class="about-stat-meta">Tracked pageviews</p>
    </article>
  </div>
</section>
${chronicleSection}` + shellEnd(scripts);
  return html;
}

// 朋友圈页：memo 风格渲染友链聚合数据（data 由 fcircle-data.yml 采集生成，见 site-root/fcircle-data.json）
function buildFcirclePage() {
  const extraHead = `<style>
    .fcircle-section { max-width: 720px; }
    .fcircle-head h2 { margin-bottom: 8px; }
    .fcircle-stats { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 8px 0 20px; font-size: 13px; color: var(--meta); }
    .fcircle-stat b { color: var(--text); font-weight: 600; }
    .fcircle-errors {
      margin: 0 0 20px; padding: 10px 14px;
      border: 1px solid var(--rule); border-left: 3px solid #d97757;
      background: rgba(217,119,87,.08); border-radius: 6px;
      font-size: 13px; color: var(--text-2); line-height: 1.7;
    }
    .fcircle-errors b { color: var(--text); font-weight: 600; }
    .fcircle-errors a { color: var(--text-2); text-decoration: underline; text-underline-offset: 2px; }
    .fcircle-errors a:hover { color: var(--accent); }
    .fcircle-empty { color: var(--meta); padding: 40px 0; text-align: center; }
    .fcircle-block { margin-bottom: 30px; }
    .fcircle-block-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .fcircle-block-avatar {
      width: 40px; height: 40px; border-radius: 4px; object-fit: cover;
      flex-shrink: 0; border: 1px solid var(--rule);
    }
    .fcircle-block-author strong { font-size: 1.05rem; font-weight: 600; color: var(--text); }
    .fcircle-block-items {
      border-left: 3px solid var(--rule-light);
      padding-left: 14px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .fcircle-item { display: flex; align-items: baseline; gap: 12px; line-height: 1.55; }
    .fcircle-item-date {
      font-size: 0.85rem; font-family: var(--mono); color: var(--text-3);
      flex-shrink: 0; min-width: 74px;
    }
    .fcircle-item-title { color: var(--text); }
    .fcircle-item-title:hover { color: var(--accent); }
    .fcircle-more {
      display: block; margin: 28px auto 0; padding: 8px 28px;
      border: 1px solid var(--rule); border-radius: 999px;
      background: transparent; color: var(--meta);
      font-family: inherit; font-size: 13px; letter-spacing: 0.18em; cursor: pointer;
      transition: all .18s ease;
    }
    .fcircle-more:hover { border-color: var(--accent); color: var(--accent); }
    .fcircle-end {
      margin-top: 28px; text-align: center;
      color: var(--text-3); font-size: 13px; letter-spacing: 0.18em;
    }
    .memo-avatar-letter {
      display: flex; align-items: center; justify-content: center;
      font-size: 17px; font-weight: 600;
      color: var(--accent-contrast, #fff); background: var(--accent);
    }
  </style>`;
  const scripts = `<script type="module" src="${withBase(`/assets/js/fcircle.js?v=${hashAssetFile('assets/js/fcircle.js')}`)}"></script>`;
  const html = headHtml(`Fcircle - ${site.name}`, { pagePath: '/fcircle/', extraHead }) + shellStart() + `
<section class="fcircle-section">
  <div class="fcircle-head">
    <h2>Fcircle</h2>
  </div>
  <div class="fcircle-stats" id="fcircle-stats"></div>
  <div class="fcircle-errors" id="fcircle-errors" hidden></div>
  <div class="fcircle-list" id="fcircle-root"></div>
</section>
` + shellEnd(scripts);
  return html;
}

// ---------- ExSearch 索引（对齐原站格式：顶层仅 posts/pages，tags/categories 为对象数组） ----------
function buildSearchIndex() {
  const posts = _posts.map(p => ({
    // memo 与归档页/分类页/上下篇导航保持一致：显示「作者: 正文摘录」，post 用标题
    title: p.type === 'memo'
      ? `${site.author}: ${excerptFrom(p.body.replace(/!\[[^\]]*\]\([^)]*\)/g, ''), 60)}`
      : p.title,
    date: p.type === 'memo' ? p.dateText + ':00+08:00' : p.dateText + ' 10:00:00+08:00',
    path: withBase(`/archives/${p.slug}/`),
    text: excerptFrom(p.body, 4000),
    tags: p.tags.map(t => ({ name: t, slug: t, permalink: withBase(`/tag/${encodeURIComponent(t)}/`) })),
    categories: p.category ? [{ name: p.category, slug: p.category, permalink: withBase(`/category/${encodeURIComponent(p.category)}/`) }] : [],
  }));
  let aboutText = '';
  const aboutPath = join(CONTENT_DIR, 'pages', 'about.md');
  if (existsSync(aboutPath)) {
    const { body } = parseFrontmatter(readFileSync(aboutPath, 'utf-8'));
    aboutText = excerptFrom(body, 400);
  }
  const pages = [{ title: 'About', date: site.since + ' 10:00:00+08:00', path: withBase(`/about/`), text: aboutText, tags: [], categories: [] }];
  return JSON.stringify({ posts, pages });
}

// ---------- sitemap.xml / robots.txt ----------
function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSitemap() {
  const urls = new Set();
  urls.add(SITE_URL + '/');
  for (let page = 2; page <= totalPages; page++) urls.add(SITE_URL + `/page/${page}/`);
  urls.add(SITE_URL + '/archives/');
  urls.add(SITE_URL + '/about/');
  _posts.forEach(p => urls.add(SITE_URL + `/archives/${p.slug}/`));
  categoriesWithCount().forEach(c => urls.add(SITE_URL + `/category/${encodeURIComponent(c.name)}/`));
  tagsWithCount().forEach(t => urls.add(SITE_URL + `/tag/${encodeURIComponent(t.name)}/`));
  const now = new Date().toISOString();
  const items = [...urls].map(u =>
    `  <url><loc>${escapeXml(u)}</loc><lastmod>${now}</lastmod></url>`
  ).join('\n');
  return `<?xml version='1.0' encoding='UTF-8'?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

function buildRobots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

// ---------- 404 ----------
function build404() {
  const html = headHtml(`404 - ${site.name}`) + shellStart() + `
<div class="archive-title">404</div>
<div class="archives-container">
  <p>页面不存在。<a href="${SITE_URL}/">回到首页</a></p>
</div>
` + shellEnd();
  return html;
}

// ---------- 旧地址跳转页（无脚本，靠页面刷新指令 + 可见链接兜底） ----------
function buildRedirectPage(from, to) {
  const target = withBase(`/archives/${to}/`);
  return `<!DOCTYPE html>
<html lang="${site.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=${target}">
  <link rel="canonical" href="${SITE_URL}${target}">
  <title>正在跳转 - ${site.name}</title>
  <style>body{font-family:system-ui,-apple-system,sans-serif;margin:3rem auto;max-width:560px;padding:0 1rem;line-height:1.8;color:#333}code{background:#f2f2f2;padding:2px 6px;border-radius:4px}</style>
</head>
<body>
  <p>这篇文章的地址已更新，正在为你跳转到新地址…</p>
  <p>原地址：<code>/archives/${from}/</code></p>
  <p><a href="${target}">如果页面没有自动跳转，点这里继续</a></p>
</body>
</html>`;
}

// Portal 管理页：与 about/archives 相同的博客框架（头部/侧边栏/页脚），主内容区挂载管理界面
function buildPortalPage() {
  // Portal 页被内容自动刷新排除（防止丢草稿），因此它的 css/js 必须带内容哈希指纹，
  // 否则部署后首次打开会命中 SW stale-while-revalidate 的旧缓存，一直跑旧代码。
  const v = '?v=' + hashAssetFile('assets/js/portal-view.js');
  const vcss = '?v=' + hashAssetFile('assets/portal.css');
  const extraHead = `<link rel="stylesheet" href="${withBase(`/assets/portal.css${vcss}`)}">
<meta name="theme-color" content="#f5f5f7">`;
  const scripts = `<script type="module" src="${withBase(`/assets/js/portal-view.js${v}`)}"></script>`;
  const html = headHtml(`Blog Portal - ${site.name}`, {
    pagePath: '/portal.html',
    bodyData: ' class="page-portal"',
    extraHead: extraHead,
    localOnly: true,
  }) + shellStart() + `
<div id="portal-root"></div>
` + shellEnd(scripts, false);
  return html;
}

// ---------- 写文件 ----------
function writePage(relPath, content) {
  const abs = join(DIST, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
}

function copyDir(src, dest) {
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      mkdirSync(dirname(d), { recursive: true });
      copyFileSync(s, d);
    }
  }
}

// 给 dist 里所有 JS 的相对模块导入（./xxx.js）加 ?v=<该文件内容哈希>：
// 被导入文件内容变了 → 导入方 URL 变化 → SW 缓存失效拿到新代码；没变 → URL 不变不重下
function versionAssetImports(dir) {
  for (const name of readdirSync(dir)) {
    const s = join(dir, name);
    if (statSync(s).isDirectory()) { versionAssetImports(s); continue; }
    if (!name.endsWith('.js')) continue;
    let src = readFileSync(s, 'utf-8');
    const out = src.replace(/(from\s+['"])(\.[^'"]+\.js)(['"])/g, (m, p1, p2, p3) => {
      if (p2.includes('?')) return m;
      // 导入路径相对 dist/assets/js/ 下的当前文件，映射回 static/assets/js/ 源文件算哈希
      const srcRel = 'assets/js/' + normalize(join(dirname(name), p2)).replace(/\\/g, '/');
      return `${p1}${p2}?v=${hashAssetFile(srcRel)}${p3}`;
    });
    if (out !== src) writeFileSync(s, out, 'utf-8');
  }
}

// ---------- 主流程 ----------
// 实况视频 H.264 兼容版（桌面端播放）：在页面渲染前转码，页面据此输出 data-avc-src
tryTranscodeLiveVideos();
// 480px 缩略图（手机小屏加载不卡）：渲染前生成，页面据此输出 srcset
tryMakeThumbnails();

_posts = loadPosts();
const totalPages = Math.max(1, Math.ceil(_posts.length / PAGE_SIZE));

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// 首页 + 分页
for (let page = 1; page <= totalPages; page++) {
  const slice = _posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const html = buildIndexPage(slice, page, totalPages);
  if (page === 1) writePage('index.html', html);
  else writePage(`page/${page}/index.html`, html);
}

// 文章页（memo 用 memo-page 结构，含上一篇/下一篇导航）
for (let i = 0; i < _posts.length; i++) {
  const post = _posts[i];
  const prev = i + 1 < _posts.length ? _posts[i + 1] : null;
  const next = i - 1 >= 0 ? _posts[i - 1] : null;
  const html = post.type === 'memo'
    ? buildMemoPage(post, prev, next)
    : buildPostPage(post, prev, next);
  writePage(`archives/${post.slug}/index.html`, html);
}

// 旧地址跳转页（改 slug 后保持旧链接可用）
for (const [from, to] of Object.entries(REDIRECTS)) {
  writePage(`archives/${from}/index.html`, buildRedirectPage(from, to));
}

// 归档
writePage('archives/index.html', buildArchivesPage());

// 分类页
for (const cat of categoriesWithCount()) {
  const posts = _posts.filter(p => p.category === cat.name);
  writePage(`category/${cat.name}/index.html`, buildTaxonomyPage('category', cat.name, posts));
}

// 标签页
for (const tag of tagsWithCount()) {
  const posts = _posts.filter(p => p.tags.includes(tag.name));
  writePage(`tag/${tag.name}/index.html`, buildTaxonomyPage('tag', tag.name, posts));
}

// 关于页
writePage('about/index.html', buildAboutPage());

// 朋友圈页
writePage('fcircle/index.html', buildFcirclePage());

// 其他
writePage('404.html', build404());
writePage('portal.html', buildPortalPage());
writePage(`${EXSEARCH_HASH}.json`, buildSearchIndex());
writePage('version.json', JSON.stringify({ v: BUILD_VERSION }));
writePage('sitemap.xml', buildSitemap());
writePage('robots.txt', buildRobots());

// 静态资源（static/assets 内容 → dist/assets，site-root 内容 → dist/）
copyDir(join(ASSETS_SRC, 'assets'), join(DIST, 'assets'));
versionAssetImports(join(DIST, 'assets/js'));
copyDir(join(ROOT, 'site-root'), DIST);

// 双链图片解析错误：全部页面写完后统一报错并中止（防止 ![[...]] 原样上线）
if (buildErrors.length) {
  console.error('\n构建中止：正文引用的双链/裸文件名图片无法解析，会把 ![[...]] 原样输出到页面。');
  buildErrors.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
}

console.log(`Build complete: ${_posts.length} posts, ${totalPages} pages -> dist/`);
