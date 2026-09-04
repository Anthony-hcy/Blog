/**
 * build.mjs — 静态博客构建脚本（复刻 AtWill 风格站点结构）
 * 读取 content/posts/*.md（带 frontmatter），生成与原站同构的页面：
 * 首页 feed（分页）、文章页、归档、分类、标签、关于、RSS、搜索索引。
 * 无 API 后端：点赞/浏览量显示 0，评论相关 UI 不生成。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const withBase = (path) => (typeof path === 'string' && path.startsWith('/') ? BASE + path : path || '');
const EXSEARCH_HASH = 'search-index';

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
marked.setOptions({ gfm: true, breaks: false });
const renderer = new marked.Renderer();
renderer.image = (href, title, text) => {
  const dim = imageSize(href || '');
  const sizeAttrs = dim
    ? ` data-pswp-width="${dim.width}" data-pswp-height="${dim.height}"`
    : '';
  const flex = dim ? Math.round((dim.width / dim.height) * 10000) / 100 : 50;
  return `<figure class="pswp-item" style="flex: ${flex}"${sizeAttrs}><img loading="lazy" src="${withBase(href)}" alt="${escapeHtml(text || '')}" /></figure>`;
};

function renderMarkdown(md) {
  return marked.parse(md, { renderer });
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

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\]\]>/g, ']]&gt;');
}

// ---------- 图片尺寸读取（PNG/JPEG/GIF/WebP 头解析，用于 pswp flex 计算） ----------
function imageSize(relPath) {
  let buf;
  try {
    const abs = relPath.startsWith('/assets/')
      ? join(ROOT, 'static', relPath.replace(/^\/assets\//, ''))
      : join(ROOT, 'static', 'assets', 'img', relPath.replace(/^\/?/, ''));
    buf = readFileSync(abs);
  } catch (_) {
    return null;
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

// ---------- 读取文章 ----------
function loadPosts() {
  const posts = [];
  for (const file of readdirSync(POSTS_DIR)) {
    if (!file.endsWith('.md')) continue;
    const md = readFileSync(join(POSTS_DIR, file), 'utf-8');
    const { data, body } = parseFrontmatter(md);
    const draft = String(data.draft ?? '').trim().toLowerCase();
    if (draft === 'true' || draft === '1' || draft === 'yes') continue;
    const slug = data.slug || file.replace(/\.md$/, '');
    const date = new Date(String(data.date || '').replace(' ', 'T'));
    const tags = Array.isArray(data.tags) ? data.tags : String(data.tags || '').split(',').filter(Boolean);
    posts.push({
      slug,
      title: data.title || slug,
      date,
      dateText: Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10),
      type: data.type === 'memo' ? 'memo' : 'post',
      category: data.category || '未分类',
      tags,
      excerpt: data.excerpt || excerptFrom(body),
      banner: data.banner || '',
      body,
    });
  }
  posts.sort((a, b) => b.date - a.date);
  return posts;
}

// ---------- 页面骨架 ----------
function headHtml(title, { bodyData = '', extraHead = '', pageType = '', pagePath = '', pageDescription = '' } = {}) {
  const keywords = site.keywords || `${site.name},${site.author}`;
  const absPath = pagePath || '/';
  const fullUrl = SITE_URL + absPath;
  const description = pageDescription || site.description;
  const ogType = pageType === 'post' ? 'article' : 'website';
  return `<!DOCTYPE html>
<html lang="${site.lang}" data-exsearch-api="${withBase(`/${EXSEARCH_HASH}.json`)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000">
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6efe7">
  <meta name="keywords" content="${keywords}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chiron+GoRound+TC:wght@400;600&display=swap">
  <link rel="preload" as="style" href="${withBase(`/assets/ExSearch/ExSearch.css`)}" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="${withBase(`/assets/ExSearch/ExSearch.css`)}"></noscript>
  <link rel="stylesheet" href="${withBase(`/assets/main.css`)}">
  <link rel="stylesheet" href="${withBase(`/assets/custom.css`)}">
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
  <link rel="icon" type="image/png" href="${withBase(`/favicon-96x96.png`)}" sizes="96x96" />
  <link rel="icon" type="image/svg+xml" href="${withBase(`/favicon.svg`)}" />
  <link rel="shortcut icon" href="${withBase(`/favicon.ico`)}" />
  <link rel="apple-touch-icon" sizes="180x180" href="${withBase(`/apple-touch-icon.png`)}" />
  <meta name="apple-mobile-web-app-title" content="${site.name}" />
  <link rel="manifest" href="${withBase(`/site.webmanifest`)}" />
  <meta name="application-name" content="${site.name}">
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

function topNav() {
  return `<nav class="top-nav" aria-label="Site navigation">
  <a class="top-nav-link js-route-nav-link" data-nav-kind="index" href="${SITE_URL}/" target="_self">Home</a>
  <a class="top-nav-link js-route-nav-link" data-nav-kind="archives" href="${withBase(`/archives/`)}" target="_self">Archives</a>
  <a class="top-nav-link js-route-nav-link" data-nav-kind="about" href="${withBase(`/about/`)}" target="_self">About</a>
  <a class="top-nav-link js-route-nav-link js-portal-nav-link" data-nav-kind="portal" href="${withBase(`/portal.html`)}" target="_self" aria-hidden="true" style="display:none">Portal</a>
</nav>`;
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
        </div>
      </header>
      ${topNav()}
      <div class="container">
        <main class="layout-main">`;
}

function shellEnd(extraScripts = '') {
  return `</main>
      </div>
    </section>
  </div>
</div>

${extraScripts}
<script type="module" src="${withBase(`/assets/js/layout.js`)}"></script>
<script defer src="${withBase(`/assets/ExSearch/jquery.min.js`)}"></script>
<script defer src="${withBase(`/assets/ExSearch/ExSearch.js`)}"></script>
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
      <button class="index-metric-btn js-like-btn" data-like-url="${withBase(`/archives/${post.slug}/`)}" type="button" aria-label="Like this post"><i class="fa-regular fa-heart" aria-hidden="true"></i><span class="js-like-count" data-like-url="${withBase(`/archives/${post.slug}/`)}">0</span></button>
      <a class="index-metric-btn pageview" href="${withBase(`/archives/${post.slug}/`)}" aria-label="View this post"><i class="fa-regular fa-eye" aria-hidden="true"></i><span class="js-pageview-count" data-pageview-url="${withBase(`/archives/${post.slug}/`)}">0</span></a>
    </div>
  </div>`;
}

function entryMemo(post) {
  const rendered = renderMarkdown(post.body);
  const figures = Array.from(rendered.matchAll(/<figure class="pswp-item"[\s\S]*?<\/figure>/g))
    .map(m => {
      const fig = m[0];
      const srcMatch = fig.match(/src="([^"]+)"/);
      return { html: fig, src: srcMatch ? srcMatch[1] : '' };
    });
  const contentHtml = rendered.replace(/<figure class="pswp-item"[\s\S]*?<\/figure>/g, '');
  const photosHtml = figures.length
    ? `<div class="photoset">${groupPhotos(figures).map(row =>
        `<div class="photos">${row.map(f => f.html.replace(/style="flex: [\d.]+"/, `style="flex: ${f.flex}"`)).join('')}</div>`
      ).join('')}</div>`
    : '';
  return `<div class="entry-memo pswp-gallery">
    <div class="memo-head">
      <img class="memo-avatar" src="${withBase(`/logo.png`)}" alt="${escapeHtml(site.author)}">
      <div class="memo-author">
        <strong>${escapeHtml(site.author)}</strong>
        <span>${post.dateText}</span>
      </div>
    </div>
    <div class="memo-content">${contentHtml}</div>
    ${photosHtml}
    <div class="memo-meta">
      <button class="index-metric-btn js-like-btn" data-like-url="${withBase(`/archives/${post.slug}/`)}" type="button" aria-label="Like this memo"><i class="fa-regular fa-heart" aria-hidden="true"></i><span class="js-like-count" data-like-url="${withBase(`/archives/${post.slug}/`)}">0</span></button>
    </div>
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
` + shellEnd(`<script type="module" src="${withBase(`/assets/js/index.js`)}"></script>`);
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
  const bodyHtml = renderMarkdown(post.body);
  const scripts = `<script defer src="${withBase(`/assets/katex/katex.min.js`)}"></script>
<script defer src="${withBase(`/assets/katex/auto-render.min.js`)}"></script>
<script type="module" src="${withBase(`/assets/js/post.js`)}"></script>`;
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
    <button class="index-metric-btn js-like-btn" data-like-url="${withBase(`/archives/${post.slug}/`)}" type="button" aria-label="Like this article"><i class="fa-regular fa-heart" aria-hidden="true"></i><span class="js-like-count" data-like-url="${withBase(`/archives/${post.slug}/`)}">0</span></button>
    <span class="index-metric-btn index-metric-static pageview" aria-label="View count"><i class="fa-regular fa-eye" aria-hidden="true"></i><span class="js-pageview-count" data-pageview-url="${withBase(`/archives/${post.slug}/`)}">0</span></span>
    <a class="index-metric-btn js-auth-edit" href="${withBase(`/portal.html?tab=publish&slug=${post.slug}`)}" target="_self" style="display:none"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i></a>
  </div>
</header>
<article class="article-body pswp-gallery">
${bodyHtml}
</article>
<div class="article-like-row article-like-row-end article-like-row-surface">
  <div class="article-like-row-caption">Enjoyed this one?</div>
  <button class="index-metric-btn js-like-btn" data-like-url="${withBase(`/archives/${post.slug}/`)}" type="button" aria-label="Like this article"><i class="fa-regular fa-heart" aria-hidden="true"></i><span class="js-like-count" data-like-url="${withBase(`/archives/${post.slug}/`)}">0</span></button>
  <span class="index-metric-btn index-metric-static pageview" aria-label="View count"><i class="fa-regular fa-eye" aria-hidden="true"></i><span class="js-pageview-count" data-pageview-url="${withBase(`/archives/${post.slug}/`)}">0</span></span>
</div>
${postNav(prev, next)}
` + shellEnd(scripts);
  return html;
}

function buildMemoPage(post, prev, next) {
  const rendered = renderMarkdown(post.body);
  const figures = Array.from(rendered.matchAll(/<figure class="pswp-item"[\s\S]*?<\/figure>/g))
    .map(m => {
      const fig = m[0];
      const srcMatch = fig.match(/src="([^"]+)"/);
      return { html: fig, src: srcMatch ? srcMatch[1] : '' };
    });
  const contentHtml = rendered.replace(/<figure class="pswp-item"[\s\S]*?<\/figure>/g, '');
  const photosHtml = figures.length
    ? `<div class="photoset">${groupPhotos(figures).map(row =>
        `<div class="photos">${row.map(f => f.html.replace(/style="flex: [\d.]+"/, `style="flex: ${f.flex}"`)).join('')}</div>`
      ).join('')}</div>`
    : '';
  const scripts = `<script type="module" src="${withBase(`/assets/js/post.js`)}"></script>`;
  const html = headHtml(`${post.title} - ${site.name}`, {
    pageType: 'post',
    pagePath: `/archives/${post.slug}/`,
    pageDescription: post.excerpt,
    extraHead: katexHead() + (post.date ? `<meta property="article:published_time" content="${post.date.toISOString()}">` : ''),
  }) + shellStart() + `
<div class="memo-page pswp-gallery">
  <div class="memo-content">${contentHtml}</div>
  ${photosHtml}
  <div class="memo-meta">
    <span>${post.dateText}</span>
    <span class="memo-meta-spacer"></span>
    <button class="index-metric-btn js-like-btn" data-like-url="${withBase(`/archives/${post.slug}/`)}" type="button" aria-label="Like this memo"><i class="fa-regular fa-heart" aria-hidden="true"></i><span class="js-like-count" data-like-url="${withBase(`/archives/${post.slug}/`)}">0</span></button>
    <span class="index-metric-btn index-metric-static pageview" aria-label="View count"><i class="fa-regular fa-eye" aria-hidden="true"></i><span class="js-pageview-count" data-pageview-url="${withBase(`/archives/${post.slug}/`)}">0</span></span>
    <a class="index-metric-btn js-auth-edit" href="${withBase(`/portal.html?tab=publish&slug=${post.slug}`)}" target="_self" style="display:none"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i></a>
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

function buildAboutPage() {
  const mdPath = join(CONTENT_DIR, 'pages', 'about.md');
  const md = existsSync(mdPath) ? readFileSync(mdPath, 'utf-8') : '# About\n\n（还没有写关于页。）';
  const { body } = parseFrontmatter(md);
  const bodyHtml = renderMarkdown(body);
  const trackedUrls = _posts.map(p => `/archives/${p.slug}/`);
  const scripts = `<script defer src="${withBase(`/assets/katex/katex.min.js`)}"></script>
<script defer src="${withBase(`/assets/katex/auto-render.min.js`)}"></script>
<script type="module" src="${withBase(`/assets/js/about.js`)}"></script>`;
  const html = headHtml(`About - ${site.name}`, { pagePath: '/about/', extraHead: katexHead() }) + shellStart() + `
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
      <p class="about-stat-value js-about-views">--</p>
      <p class="about-stat-meta">Tracked pageviews</p>
    </article>
    <article class="about-stat-card">
      <p class="about-stat-label">Likes</p>
      <p class="about-stat-value js-about-likes">--</p>
      <p class="about-stat-meta">Received likes</p>
    </article>
  </div>
</section>
` + shellEnd(scripts);
  return html;
}

// ---------- RSS ----------
function buildFeed() {
  const items = _posts.slice(0, 20).map(p => {
    const bodyHtml = renderMarkdown(p.body).replace(/<figure class="pswp-item"[\s\S]*?<\/figure>/g, '');
    return `<item>
  <title>${escapeXml(p.title)}</title>
  <link>${SITE_URL}/archives/${p.slug}/</link>
  <guid isPermaLink="true">${SITE_URL}/archives/${p.slug}/</guid>
  <pubDate>${p.date.toUTCString()}</pubDate>
  <author>${escapeXml(site.author)}</author>
  <description><![CDATA[${escapeXml(bodyHtml)}]]></description>
</item>`;
  }).join('');
  return `<?xml version='1.0' encoding='UTF-8'?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0"><channel><title>${escapeXml(site.name)}</title><link>${SITE_URL}/</link><description>${escapeXml(site.description)}</description><docs>http://www.rssboard.org/rss-specification</docs><generator>blog-replica</generator><image><url>${SITE_URL}/logo.png</url><title>${escapeXml(site.name)}</title><link>${SITE_URL}/</link></image><language>${site.lang}</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate><pubDate>${new Date().toUTCString()}</pubDate>${items}</channel></rss>`;
}

function buildAtom() {
  const items = _posts.slice(0, 20).map(p => `<entry>
  <title>${escapeXml(p.title)}</title>
  <link href="${SITE_URL}/archives/${p.slug}/"/>
  <id>${SITE_URL}/archives/${p.slug}/</id>
  <updated>${p.date.toISOString()}</updated>
  <summary>${escapeXml(p.excerpt)}</summary>
  <author><name>${escapeXml(site.author)}</name></author>
</entry>`).join('');
  return `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>${site.name}</title><link href="${SITE_URL}/" rel="alternate"/><id>${SITE_URL}/</id><updated>${new Date().toISOString()}</updated>${items}</feed>`;
}

// ---------- ExSearch 索引（对齐原站格式：顶层仅 posts/pages，tags/categories 为对象数组） ----------
function buildSearchIndex() {
  const posts = _posts.map(p => ({
    title: p.title,
    date: p.dateText + ' 10:00:00+08:00',
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

// ---------- 88x31 ----------
function buildBadgesIndex() {
  const badges = Array.from({ length: 4 }, (_, i) => ({
    name: 'badge-' + (i + 1),
    file: 'badge-' + (i + 1) + '.png',
  }));
  return JSON.stringify({ url_prefix: withBase('/assets/img/88x31/'), badges });
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

// ---------- 主流程 ----------
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

// 其他
writePage('404.html', build404());
writePage(`${EXSEARCH_HASH}.json`, buildSearchIndex());
writePage('88x31/index.json', buildBadgesIndex());

// 静态资源（static/assets 内容 → dist/assets，site-root 内容 → dist/）
copyDir(join(ASSETS_SRC, 'assets'), join(DIST, 'assets'));
copyDir(join(ROOT, 'site-root'), DIST);

console.log(`Build complete: ${_posts.length} posts, ${totalPages} pages -> dist/`);
