/**
 * gen-placeholders.mjs — 生成站点占位图（纯 Node，无依赖）
 * 输出：logo、favicon-96、apple-touch-icon、封面示例图（均为简单纯色 PNG）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITE_ROOT = join(ROOT, 'site-root');

// ---------- 极简 PNG 编码（RGB, 无 alpha） ----------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(width, height, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 3;
      raw[p] = rgb[0];
      raw[p + 1] = rgb[1];
      raw[p + 2] = rgb[2];
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 输出文件 ----------
const files = {
  'logo.png': [180, 180, [34, 32, 25]],
  'favicon-96x96.png': [96, 96, [34, 32, 25]],
  'apple-touch-icon.png': [180, 180, [34, 32, 25]],
};

for (const [name, [w, h, rgb]] of Object.entries(files)) {
  const out = join(SITE_ROOT, name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, makePng(w, h, rgb));
  console.log('generated', name);
}

// 示例封面图（不同色调便于区分）
const covers = {
  'hello-world': [224, 120, 64],
  'weekend-log': [100, 130, 150],
};
for (const [slug, rgb] of Object.entries(covers)) {
  const out = join(ROOT, 'static', 'assets', 'img', slug, 'cover.png');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, makePng(960, 480, rgb));
  console.log('generated cover', slug);
}

console.log('Placeholders done.');

// ---------- 88x31 占位徽章（简单双色） ----------
function makePngTwo(w, h, top, bottom) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 3);
    raw[row] = 0;
    const c = y < h / 2 ? top : bottom;
    for (let x = 0; x < w; x++) {
      const ppos = row + 1 + x * 3;
      raw[ppos] = c[0]; raw[ppos + 1] = c[1]; raw[ppos + 2] = c[2];
    }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const badgeDir = join(ROOT, 'static', 'assets', 'img', '88x31');
mkdirSync(badgeDir, { recursive: true });
const badgeStyles = [
  [[224, 120, 64], [34, 32, 25]],
  [[100, 130, 150], [34, 32, 25]],
  [[90, 140, 110], [34, 32, 25]],
  [[180, 100, 130], [34, 32, 25]],
];
badgeStyles.forEach(([top, bottom], i) => {
  const out = join(badgeDir, 'badge-' + (i + 1) + '.png');
  writeFileSync(out, makePngTwo(88, 31, top, bottom));
  console.log('generated badge', 'badge-' + (i + 1) + '.png');
});
