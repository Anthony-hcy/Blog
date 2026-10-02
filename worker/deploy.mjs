/**
 * deploy.mjs — 一键部署 blog-stats Worker
 * 用法（Token 不进仓库，通过环境变量传入）：
 *   CF_API_TOKEN=xxx CF_ACCOUNT_ID=xxx node worker/deploy.mjs
 * 步骤：建 KV 命名空间（无则建）→ 上传 Worker → 开启 workers.dev 子域 → 打印接口地址
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';
const SCRIPT_NAME = 'blog-stats';
const KV_TITLE = 'blog-stats-kv';

const token = process.env.CF_API_TOKEN;
const accountId = process.env.CF_ACCOUNT_ID;
if (!token || !accountId) {
  console.error('请先设置环境变量 CF_API_TOKEN 和 CF_ACCOUNT_ID');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerCode = readFileSync(join(__dirname, 'worker.js'), 'utf-8');

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    throw new Error(path + ' -> ' + JSON.stringify(data.errors || data));
  }
  return data.result;
}

// 1. KV 命名空间（无则建）
const namespaces = await api('/accounts/' + accountId + '/storage/kv/namespaces');
let kv = (namespaces || []).find(n => n.title === KV_TITLE);
if (!kv) {
  kv = await api('/accounts/' + accountId + '/storage/kv/namespaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: KV_TITLE }),
  });
  console.log('KV created:', kv.id);
} else {
  console.log('KV exists:', kv.id);
}

// 2. 上传 Worker（模块格式 + KV 绑定）
const metadata = {
  main_module: 'worker.js',
  compatibility_date: '2025-01-01',
  bindings: [{ type: 'kv_namespace', name: 'STATS', namespace_id: kv.id }],
};
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
form.append('worker.js', new Blob([workerCode], { type: 'application/javascript+module' }), 'worker.js');
await api('/accounts/' + accountId + '/workers/scripts/' + SCRIPT_NAME, {
  method: 'PUT',
  body: form,
});
console.log('Worker uploaded:', SCRIPT_NAME);

// 3. workers.dev 子域（新账号没有则注册一个）并开启访问
let sub;
try {
  sub = await api('/accounts/' + accountId + '/workers/subdomain');
} catch (_) {
  sub = await api('/accounts/' + accountId + '/workers/subdomain', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subdomain: 'haelcy-stats' }),
  });
  console.log('Subdomain registered:', sub.subdomain);
}
await api('/accounts/' + accountId + '/workers/scripts/' + SCRIPT_NAME + '/subdomain', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ enabled: true, previews_enabled: false }),
});
const url = 'https://' + SCRIPT_NAME + '.' + sub.subdomain + '.workers.dev';
console.log('LIVE:', url);
console.log('试试: curl "' + url + '/api/stats?keys=/test/"');

// 4. 上传 AMAP_REST_KEY secret（高德地理代理用；不设置时 geo 接口返回 503）
//    注意：key 只进 Worker 环境，绝不写入仓库或下发到浏览器
const amapKey = process.env.AMAP_REST_KEY;
if (amapKey) {
  await api('/accounts/' + accountId + '/workers/scripts/' + SCRIPT_NAME + '/secrets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'AMAP_REST_KEY', type: 'secret_text', text: amapKey }),
  });
  console.log('Secret AMAP_REST_KEY uploaded');
} else {
  console.log('SKIP: 未设置环境变量 AMAP_REST_KEY，geo 代理将返回 503（拿到 key 后重跑本脚本即可）');
}
console.log('geo 代理测试: curl "' + url + '/api/geo/ip"');
