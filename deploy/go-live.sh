#!/usr/bin/env bash
# 备案通过后的「一键切正式站」。
#
# 用法：
#   bash deploy/go-live.sh <备案号> [证书通知邮箱]
# 例：
#   bash deploy/go-live.sh 粤ICP备2026123456号-1 me@example.com
#
# 它会依次做：
#   0. 检查 DNS 是否已把 haelcy.cn / www.haelcy.cn 解析到本机（不对就直接退出，什么都不改）
#   1. 上传并启用生产 nginx 配置，重载，用 Host 头在本机自测
#   2. certbot 签发 Let's Encrypt 证书并开启 http→https 跳转
#   3. 从公网验证 https 与跳转
#   4. 关掉 8080 验证站（并提示你去控制台删掉那条防火墙规则）
#   5. 把备案号写进 site.config.json 的页脚字段
#
# 生产配置已经预先验证过（在 8081 上带 Host: haelcy.cn 跑通过），
# 所以这个脚本正常情况下只需要 DNS 正确，剩下的都是一次成功。
set -euo pipefail
cd "$(dirname "$0")"

DOMAIN=haelcy.cn
IP=120.24.234.170
ICP="${1:-}"
EMAIL="${2:-}"

if [ -z "$ICP" ]; then
  echo "用法：bash deploy/go-live.sh <备案号> [证书通知邮箱]"
  echo "例：  bash deploy/go-live.sh 粤ICP备2026123456号-1 me@example.com"
  exit 1
fi

KEY=../keys/haelcy_deploy
SSH_OPTS=(-i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
R="root@$IP"

echo "══ 0/5 检查 DNS 解析 ══"
ok=1
for h in "$DOMAIN" "www.$DOMAIN"; do
  got=$(python -c "import socket,sys
try: print(socket.gethostbyname(sys.argv[1]))
except Exception: print('')" "$h" 2>/dev/null)
  if [ "$got" = "$IP" ]; then
    echo "  ✅ $h → $got"
  else
    echo "  ❌ $h → ${got:-解析失败}（应为 $IP）"
    ok=0
  fi
done
if [ "$ok" != 1 ]; then
  echo
  echo "DNS 还没生效，脚本未做任何改动。"
  echo "请到阿里云控制台 → 域名 → 解析设置，加两条 A 记录："
  echo "  @    → $IP"
  echo "  www  → $IP"
  echo "解析通常几分钟生效，之后再跑这个脚本。"
  exit 1
fi

echo
echo "══ 1/5 启用生产 nginx 配置 ══"
scp "${SSH_OPTS[@]}" nginx-blog.conf "$R:/tmp/nginx-blog.conf"
ssh "${SSH_OPTS[@]}" "$R" 'bash -s' <<'REMOTE'
set -e
cp /tmp/nginx-blog.conf /etc/nginx/conf.d/haelcy-blog.conf
nginx -t 2>&1 | tail -1
systemctl reload nginx
sleep 1
for p in / /fcircle/ /archives/ /assets/main.css; do
  printf "  %-18s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: haelcy.cn' http://127.0.0.1:80$p)"
done
REMOTE

echo
echo "══ 2/5 签发 HTTPS 证书 ══"
if [ -n "$EMAIL" ]; then
  EMAIL_ARG=(-m "$EMAIL")
else
  EMAIL_ARG=(--register-unsafely-without-email)
fi
ssh "${SSH_OPTS[@]}" "$R" "certbot --nginx -d $DOMAIN -d www.$DOMAIN --redirect --agree-tos --non-interactive ${EMAIL_ARG[*]} 2>&1 | tail -12"

echo
echo "══ 3/5 从公网验证 ══"
for u in "https://$DOMAIN/" "https://www.$DOMAIN/"; do
  printf "  %-28s %s\n" "$u" "$(curl -s -o /dev/null -m 25 -w '%{http_code}' "$u")"
done
printf "  %-28s %s（期望 301）\n" "http://$DOMAIN/ → https" "$(curl -s -o /dev/null -m 25 -w '%{http_code}' "http://$DOMAIN/")"
echo "  证书："
echo | timeout 25 openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -dates 2>/dev/null | sed 's/^/    /' || echo "    （openssl 不可用，跳过）"

echo
echo "══ 4/5 关掉 8080 验证站 ══"
ssh "${SSH_OPTS[@]}" "$R" 'rm -f /etc/nginx/conf.d/haelcy-8080.conf && nginx -t 2>&1 | tail -1 && systemctl reload nginx && echo "  ✅ 8080 配置已移除"'
echo "  ⚠️ 还有一步要你去控制台：防火墙里把 8080 的规则删掉（现在用不上了）"

echo
echo "══ 5/5 写入备案号到页脚 ══"
python - "$ICP" <<'PY'
import json, sys, pathlib
p = pathlib.Path('../site.config.json')
cfg = json.loads(p.read_text(encoding='utf-8'))
cfg['icp'] = sys.argv[1]
p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f"  ✅ site.config.json 已写入 icp = {sys.argv[1]}")
PY
echo "  页脚会自动渲染成指向 beian.miit.gov.cn 的链接（build.mjs 已支持）。"
echo
echo "最后一步：把备案号这次改动提交推送 —— 推完 CI 会把两个站一起更新。"
echo "  git add site.config.json && git commit -m 'chore: 页脚挂备案号' && git push"
echo
echo "🎉 完成。现在 https://$DOMAIN/ 就是国内直连的正式站了。"
