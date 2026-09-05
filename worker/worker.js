/**
 * blog-stats Worker — 点赞 + 浏览量统计接口（Cloudflare Workers + KV）
 *
 * GET  /api/stats?keys=a,b,c   批量查询 { likes: {a:n}, views: {a:n} }（首页用，一次请求）
 * GET  /api/likes/total        全站点赞总数 { total: n }（About 页用，60s 边缘缓存）
 * POST /api/like  {key}        点赞 +1（同一 IP 每 5 分钟限 8 次）
 * POST /api/view  {key}        浏览 +1（同一 IP 同一篇 1 小时内只计一次）
 *
 * KV 键：like:<key> / view:<key> / rl:<ipHash>:<5分钟桶> / seen:<key哈希>:<1小时桶>
 * key 约定：文章路径，如 /Blog/archives/<slug>/
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function validKey(k) {
  return typeof k === 'string' && k.length > 0 && k.length <= 200 && /^[A-Za-z0-9_\-\/%.]+$/.test(k);
}

function intOr(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return preflight();
    const url = new URL(request.url);
    const ipHash = await sha256hex(request.headers.get('cf-connecting-ip') || 'unknown');

    try {
      // ---------- 批量查询 ----------
      if (request.method === 'GET' && url.pathname === '/api/stats') {
        const raw = url.searchParams.get('keys') || '';
        const keys = [...new Set(raw.split(',').filter(validKey))].slice(0, 60);
        if (!keys.length) return json({ error: 'missing keys' }, 400);
        const likes = {};
        const views = {};
        await Promise.all(keys.map(async k => {
          likes[k] = intOr(await env.STATS.get('like:' + k), 0);
          views[k] = intOr(await env.STATS.get('view:' + k), 0);
        }));
        return json({ likes, views });
      }

      // ---------- 全站点赞总数（60s 边缘缓存，省 KV list 额度） ----------
      if (request.method === 'GET' && url.pathname === '/api/likes/total') {
        const cache = caches.default;
        const cacheKey = new Request(url.origin + '/__cache/likes-total');
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
        const listed = await env.STATS.list({ prefix: 'like:' });
        const reads = await Promise.all(listed.keys.map(k => env.STATS.get(k.name)));
        const total = reads.reduce((s, v) => s + intOr(v, 0), 0);
        const res = json({ total });
        await cache.put(cacheKey, res.clone());
        return res;
      }

      // ---------- 点赞 ----------
      if (request.method === 'POST' && url.pathname === '/api/like') {
        let body = {};
        try { body = await request.json(); } catch (_) { /* ignore */ }
        const key = body && body.key;
        if (!validKey(key)) return json({ error: 'bad key' }, 400);

        // 限频：每 IP 每 5 分钟桶最多 8 次
        const bucket = Math.floor(Date.now() / 300000);
        const rlKey = 'rl:' + ipHash + ':' + bucket;
        const recent = intOr(await env.STATS.get(rlKey), 0);
        if (recent >= 8) return json({ error: 'rate limited' }, 429);
        await env.STATS.put(rlKey, String(recent + 1), { expirationTtl: 300 });

        const ck = 'like:' + key;
        const next = intOr(await env.STATS.get(ck), 0) + 1;
        try {
          await env.STATS.put(ck, String(next));
        } catch (_) {
          // 写入额度耗尽等异常：返回当前值，前端静默
          return json({ ok: true, key, count: intOr(await env.STATS.get(ck), 0) });
        }
        return json({ ok: true, key, count: next });
      }

      // ---------- 浏览上报 ----------
      if (request.method === 'POST' && url.pathname === '/api/view') {
        let body = {};
        try { body = await request.json(); } catch (_) { /* ignore */ }
        const key = body && body.key;
        if (!validKey(key)) return json({ error: 'bad key' }, 400);

        // 去重：同一 IP 同一篇 1 小时内只计一次
        const hourBucket = Math.floor(Date.now() / 3600000);
        const seenKey = 'seen:' + (await sha256hex(ipHash + '|' + key)).slice(0, 32) + ':' + hourBucket;
        const seen = await env.STATS.get(seenKey);
        const vk = 'view:' + key;
        const current = intOr(await env.STATS.get(vk), 0);
        if (seen) return json({ ok: true, key, views: current });
        try {
          await env.STATS.put(seenKey, '1', { expirationTtl: 3600 });
          await env.STATS.put(vk, String(current + 1));
          return json({ ok: true, key, views: current + 1 });
        } catch (_) {
          // 写入额度耗尽等异常：返回当前值
          return json({ ok: true, key, views: current });
        }
      }

      return json({ error: 'not found' }, 404);
    } catch (_) {
      return json({ error: 'internal' }, 500);
    }
  },
};
