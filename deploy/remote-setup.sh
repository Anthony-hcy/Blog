#!/usr/bin/env bash
# 服务器一次性初始化（在服务器上以 root 运行）
#
#   用法（本机执行，会把配置一起传上去）：
#     scp -i ../keys/haelcy_deploy deploy/remote-setup.sh deploy/nginx-8080.conf \
#         root@120.24.234.170:/tmp/
#     ssh -i ../keys/haelcy_deploy root@120.24.234.170 'bash /tmp/remote-setup.sh'
#
#   备案通过后切到正式站：
#     scp -i ../keys/haelcy_deploy deploy/nginx-blog.conf root@120.24.234.170:/tmp/
#     ssh -i ../keys/haelcy_deploy root@120.24.234.170 'bash /tmp/remote-setup.sh --prod'
#
# 做四件事：装 nginx、建站点目录、放配置、重启并设为开机自启。可重复执行。
set -euo pipefail

MODE="${1:-}"
export DEBIAN_FRONTEND=noninteractive

echo "── 1/4 安装 nginx（已装则跳过）"
apt-get update -qq
apt-get install -y -qq nginx rsync

echo "── 2/4 准备站点目录"
mkdir -p /var/www/blog

echo "── 3/4 放置 nginx 配置"
if [ "$MODE" = "--prod" ]; then
  cp /tmp/nginx-blog.conf /etc/nginx/conf.d/haelcy.conf
  rm -f /etc/nginx/conf.d/haelcy-8080.conf
  echo "  已启用正式站配置（80/443，域名 haelcy.cn + www.haelcy.cn）"
else
  cp /tmp/nginx-8080.conf /etc/nginx/conf.d/haelcy-8080.conf
  echo "  已启用 8080 验证站配置"
fi
# Ubuntu 自带的默认站点会占用 80 端口，去掉以免混淆
rm -f /etc/nginx/sites-enabled/default

echo "── 4/4 语法检查并重启"
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx

echo
echo "✅ 初始化完成"
echo "   站点目录：/var/www/blog/dist（用 deploy.sh 上传）"
echo "   提醒：轻量应用服务器控制台的「防火墙」要放行 22、80、443，验证阶段再加 8080"
