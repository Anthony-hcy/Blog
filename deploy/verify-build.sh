#!/usr/bin/env bash
# 双版本构建校验（国内直连迁移用）
#   /Blog 版   → GitHub Pages，必须保持与迁移前一致
#   根路径版   → haelcy.cn，不得残留 /Blog 前缀，且所有站内资源必须真实存在
# 用法：bash deploy/verify-build.sh
set -u
cd "$(dirname "$0")/.."

fail=0
chk() { # chk 描述 期望 实际
  if [ "$2" = "$3" ]; then echo "  ✅ $1（$3）"; else echo "  ❌ $1：期望 $2，实际 $3"; fail=1; fi
}
count() { grep -roh "$1" dist 2>/dev/null | wc -l | tr -d ' '; }

# 站内资源完整性：交给 Node 实现（自动识别部署前缀，正确处理 URL 编码与 srcset）
asset_integrity() { node deploy/check-assets.mjs; }

echo "── 1/2  GitHub Pages 版（base=/Blog，地址前缀保持 /Blog）"
node scripts/build.mjs >/dev/null || { echo "  构建失败"; exit 1; }
chk "属性里无 /Blog/Blog 双前缀" 0 "$(count '\(src\|href\)="/Blog/Blog')"
chk "canonical 无双前缀" 0 "$(count 'canonical" href="[^"]*Blog/Blog')"
chk "站内资源缺失数" 0 "$(asset_integrity)"
echo "  · 文件总数：$(find dist -type f | wc -l | tr -d ' ')"
echo "  · 首页 CSS：$(grep -o 'href="[^"]*main.css"' dist/index.html | head -1)"
echo "  · og:url ：$(grep -o 'property="og:url" content="[^"]*"' dist/index.html | head -1)"

echo
echo "── 2/2  自有域名版（根路径，haelcy.cn）"
SITE_URL=https://haelcy.cn SITE_BASE=__root__ node scripts/build.mjs >/dev/null || { echo "  构建失败"; exit 1; }
chk "属性里无 /Blog/ 前缀" 0 "$(count '\(src\|href\)="/Blog/')"
chk "渲染页里无 /Blog/assets 残留" 0 "$(grep -rho '/Blog/assets' dist --include='*.html' | wc -l | tr -d ' ')"
chk "站内资源缺失数" 0 "$(asset_integrity)"
chk "sitemap 无旧域名" 0 "$(grep -c 'anthony-hcy.github.io' dist/sitemap.xml)"
echo "  · 文件总数：$(find dist -type f | wc -l | tr -d ' ')"
echo "  · 首页 CSS：$(grep -o 'href="[^"]*main.css"' dist/index.html | head -1)"
echo "  · 首页 canonical：$(grep -o 'rel="canonical" href="[^"]*"' dist/index.html)"
echo "  · 历史 /Blog/ 引用图：$(grep -rho 'src="/assets/img/gallery/2026.09.05-01.webp[^"]*"' dist | head -1)"
echo "  · 搜索索引条目：$(grep -o '"path":"[^"]*"' dist/search-index.json | head -1)"

echo
if [ "$fail" = 0 ]; then echo "全部通过 ✅"; else echo "存在失败项 ❌"; fi
exit $fail
