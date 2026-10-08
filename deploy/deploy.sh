#!/usr/bin/env bash
# haelcy.cn 一键部署
#   构建根路径版 → 自检 → 打包 → scp 上传 → 远端解包并原子切换 → reload nginx
#
# 用法：
#   bash deploy/deploy.sh --test   # 备案前：部署到 8080 验证站，页面内链接指向 http://IP:8080
#   bash deploy/deploy.sh          # 备案后：部署到正式站，页面内链接指向 https://haelcy.cn
#
# 可覆盖的环境变量：
#   HAELCY_HOST        服务器公网 IP（默认 120.24.234.170）
#   HAELCY_USER        SSH 用户（默认 root）
#   HAELCY_KEY         SSH 私钥路径，相对仓库根目录（默认 ../keys/haelcy_deploy）
#   HAELCY_REMOTE_DIR  远端站点目录（默认 /var/www/blog）
#
# 前置：私钥对应的公钥已装进服务器 ~/.ssh/authorized_keys；服务器已跑过 remote-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"
HOST="${HAELCY_HOST:-120.24.234.170}"
USER="${HAELCY_USER:-root}"
KEY="${HAELCY_KEY:-../keys/haelcy_deploy}"
REMOTE_DIR="${HAELCY_REMOTE_DIR:-/var/www/blog}"
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

if [ "$MODE" = "--test" ]; then
  SITE_URL="http://${HOST}:8080"
  LABEL="8080 验证站"
else
  SITE_URL="https://haelcy.cn"
  LABEL="正式站"
fi

echo "── 1/4 构建根路径版（页面内链接指向 ${SITE_URL}）"
SITE_URL="$SITE_URL" SITE_BASE=__root__ node scripts/build.mjs

echo "── 2/4 产物自检（站内资源完整性）"
missing=$(node deploy/check-assets.mjs)
if [ "$missing" != "0" ]; then
  echo "✗ 有 ${missing} 条站内资源缺失，已中止部署"
  exit 1
fi
echo "  ✅ 站内资源全部存在"

echo "── 3/4 打包并上传"
TARBALL="$(mktemp -t haelcy-dist-XXXXXX.tgz)"
tar -czf "$TARBALL" dist
scp "${SSH_OPTS[@]}" "$TARBALL" "${USER}@${HOST}:/tmp/haelcy-dist.tgz"
rm -f "$TARBALL"

echo "── 4/4 远端原子切换并 reload nginx"
ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" bash -s <<REMOTE
set -e
mkdir -p '${REMOTE_DIR}'
rm -rf '${REMOTE_DIR}/dist.new'
mkdir -p '${REMOTE_DIR}/dist.new'
tar -xzf /tmp/haelcy-dist.tgz -C '${REMOTE_DIR}/dist.new' --strip-components=1
rm -rf '${REMOTE_DIR}/dist.old'
if [ -d '${REMOTE_DIR}/dist' ]; then mv '${REMOTE_DIR}/dist' '${REMOTE_DIR}/dist.old'; fi
mv '${REMOTE_DIR}/dist.new' '${REMOTE_DIR}/dist'
nginx -t
systemctl reload nginx
echo "  远端就绪：\$(find '${REMOTE_DIR}/dist' -type f | wc -l) 个文件"
REMOTE

echo
echo "✅ 已部署到 ${LABEL}"
if [ "$MODE" = "--test" ]; then
  echo "   验证地址：http://${HOST}:8080/（备案通过前只能这样访问）"
else
  echo "   验证地址：https://haelcy.cn/"
fi
