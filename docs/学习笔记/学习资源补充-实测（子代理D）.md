# 学习资源补充清单（逐条 curl 实测版）

> 实测时间：2026-10-13；环境：本机 Windows 直连（广州），`curl -L --max-time 30` + 真实浏览器 UA。
> 状态码 = 本次 curl 实测结果。B 站条目：先 curl 视频页得 200，再用 `api.bilibili.com/x/web-interface/view` 校验
> 「BV 号 ↔ 标题 ↔ UP 主 ↔ 播放量」一致（下表播放量为校验时的真实值）。
> 标记：**中文** / *EN英文* / 🚪=直连失败需代理。
> 本清单只补旧清单《学习清单-从零掌握本项目.md》薄弱或缺失的部分，重复的旧条目不再列。

---

## 1. Node.js 现代 ESM（`node:` 前缀、`import.meta.url`）

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| Node.js ESM 官方文档 | 文档 | 200 | https://nodejs.org/api/esm.html | *EN* 权威一手规范：`node:` 前缀、`import.meta.url`、`import.meta.dirname`、加载器 |
| Node.js `url` 模块（fileURLToPath） | 文档 | 200 | https://nodejs.org/api/url.html | *EN* `new URL(import.meta.url)` → 路径必查的一页 |
| Node.js `packages` 文档 | 文档 | 200 | https://nodejs.org/api/packages.html | *EN* `"type":"module"` / exports 字段，解释为什么项目能 `import` 无 npm |
| nodejs.cn 中文 API 镜像（当前 v26.11.1） | 文档 | 200 | https://nodejs.cn/api/esm.html | **中文** 官方 API 的中文对照，读英文吃力时的第二入口（随官方更新，非陈年翻译） |
| Node.js 中文学习区 · 入门 | 文档 | 200 | https://nodejs.org/zh-cn/learn/getting-started/introduction-to-nodejs | **中文** 官方入门，从 `node:` 内置模块讲起 |
| MDN · `import.meta` | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/import.meta | **中文** 只讲 `import.meta.url` 这一件事，最省时间 |
| MDN · JavaScript 模块指南 | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Modules | **中文** 浏览器 ESM 与 Node ESM 的异同 |
| 阮一峰 · ES6 入门（Module 章节） | 电子书 | 200 | https://es6.ruanyifeng.com/#docs/module | **中文** 经典，讲清 `export/import` 语法层 |
| 【渡一】CommonJs 和 ESM 的区别 | 视频 | 200 | https://www.bilibili.com/video/BV1FgcneDE76 | 9分52秒，播放 9104（UP：渡一前端教科频道），最短讲清 require/import 差别 |
| Node.js 快速上手基础-CJS 和 ESM 介绍 | 视频 | 200 | https://www.bilibili.com/video/BV1jM41117zQ | 26分27秒，播放 1523（UP：midwayjs 官方号），带 Node 侧配置细节 |

> ⚠️ B 站搜 "ESM" 噪音极大（会命中鼠标型号、反辐射导弹）。**必须按 BV 号直达**，别搜关键词。

---

## 2. GitHub Actions 与 CI/CD 入门

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| Workflow 语法完整参考（新地址） | 文档 | 200 | https://docs.github.com/zh/actions/reference/workflows-and-actions/workflow-syntax | **中文** 旧清单给的 `using-workflows/...` 已改名，这是当前有效地址，当字典查 |
| 触发工作流的事件（`on:` 全表） | 文档 | 200 | https://docs.github.com/zh/actions/how-tos/write-workflows/choose-when-workflows-run | **中文** `push` / `schedule` / `workflow_dispatch` / `workflow_run` 一节正好对应本项目两个 workflow |
| 在 Actions 里使用 Secrets | 文档 | 200 | https://docs.github.com/zh/actions/security-guides/using-secrets-in-github-actions | **中文** 解释「`if` 里不能直接引用 secrets」这类坑 |
| `actions/checkout`（仓库页） | GitHub | 200 | https://github.com/actions/checkout | *EN* 每个 workflow 第一步用的官方 action，README 即文档 |
| `actions/upload-pages-artifact` | GitHub | 200 | https://github.com/actions/upload-pages-artifact | *EN* Pages 部署第一步（本项目 deploy.yml 用到） |
| `actions/deploy-pages` | GitHub | 200 | https://github.com/actions/deploy-pages | *EN* Pages 部署第二步；注：它在 Marketplace 无独立页（404），只看仓库页 |
| `actions/setup-node` | GitHub | 200 | https://github.com/actions/setup-node | *EN* 指定 Node 版本 + 依赖缓存 |
| `actions/configure-pages` | GitHub | 200 | https://github.com/actions/configure-pages | *EN* 读 Pages 配置（`base_path` 等），排查子路径问题时有用的官方 action |
| Actions Marketplace | 网站 | 200 | https://github.com/marketplace?type=actions | *EN* 找现成 action（如 `EndBug/add-and-commit`） |
| GitHub Skills · Hello GitHub Actions（互动课） | 教程 | 200 | https://github.com/skills/hello-github-actions | *EN* 官方动手课，10 分钟第一次跑通 workflow |
| Github 王炸功能 Pages，免费免服务器上线网站 | 视频 | 200 | https://www.bilibili.com/video/BV12H4y1N7Q4 | 7分27秒，播放 102639（UP：技术爬爬虾），Actions→Pages 全流程最直观 |
| 「景水」基于 github actions 的自动化部署练习 | 视频 | 200 | https://www.bilibili.com/video/BV1RQ4y1o7pW | 48 分钟，播放 8952（UP：水哥澎湃），跟着做一遍 |
| 配置 GitHub Actions 定时采集 | 视频 | 200 | https://www.bilibili.com/video/BV1XEjg6ZEPY | 6分20秒，播放 123，小众但**恰好是 cron 定时任务**这个点（对应 fcircle-data.yml） |

---

## 3. GitHub Pages 静态托管机制

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| Pages 快速上手（官方） | 文档 | 200 | https://docs.github.com/zh/pages/quickstart | **中文** 最短路径跑通一次 Pages |
| 配置发布源（`build_type=workflow` vs 分支） | 文档 | 200 | https://docs.github.com/zh/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site | **中文** 本项目用的就是 Actions 部署 |
| 自定义域名（正确地址） | 文档 | 200 | https://docs.github.com/zh/pages/configuring-a-custom-domain-for-your-github-pages-site | **中文** 旧清单给的 URL 已 404，这是当前有效页 |
| 管理自定义域名（CNAME/HTTPS 勾选） | 文档 | 200 | https://docs.github.com/zh/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site | **中文** 讲清 Pages 会自己写 CNAME 文件 + 强制 HTTPS |
| 关于 GitHub Pages（用户站 vs 项目站） | 文档 | 200 | https://docs.github.com/zh/pages/getting-started-with-github-pages/about-github-pages | **中文** 「项目站必须挂在 /Blog 子路径」这一条就在这里 |
| GitHub Pages 官网 | 网站 | 200 | https://pages.github.com/ | *EN* 30 秒理解 Pages 是什么 |
| Github 王炸功能 Pages（同 T2） | 视频 | 200 | https://www.bilibili.com/video/BV12H4y1N7Q4 | 播放 102639，最推荐的 Pages 中文视频 |
| Hexo & Github 搭建自己的专属博客 | 视频 | 200 | https://www.bilibili.com/video/BV1Eg41157tL | 29 分钟，播放 25506（UP：DID迪），看 Pages 项目站的真实形态 |
| Gmeek：一个 Github 账号就能建博客 | 视频 | 200 | https://www.bilibili.com/video/BV1GM4m1m7ZD | 5分15秒，播放 71555（技术爬爬虾），理解「仓库即站点」 |
| Cloudflare Pages 全攻略（后备方案） | 视频 | 200 | https://www.bilibili.com/video/BV1wWfmBJEYX | 8分16秒，播放 10800（UP：软件工程师Tim），Vercel 之外的免备案备选 |

---

## 4. Vercel 入门与静态站部署（旧清单完全缺失）

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| Getting Started with Vercel | 文档 | 200 | https://vercel.com/docs/getting-started-with-vercel | *EN* 官方入门主线 |
| 导入 Git 仓库 | 文档 | 200 | https://vercel.com/docs/getting-started-with-vercel/import | *EN* Git 集成就是「绑仓库 + 自动部署」 |
| Vercel for GitHub（Git 集成细节） | 文档 | 200 | https://vercel.com/docs/git/vercel-for-github | *EN* push 即部署、PR 预览部署的机制 |
| Git 集成总览 | 文档 | 200 | https://vercel.com/docs/git | *EN* 其他 Git 平台对照 |
| 环境变量 | 文档 | 200 | https://vercel.com/docs/environment-variables | *EN* 本项目靠 `SITE_URL` / `SITE_BASE` 环境变量做根路径版，必读 |
| 项目配置（含 `outputDirectory`） | 文档 | 200 | https://vercel.com/docs/projects/project-configuration#outputdirectory | *EN* 「Output Directory」概念的官方解释 —— 静态站要指到 `dist` |
| 配置构建（Build Command / Output Directory） | 文档 | 200 | https://vercel.com/docs/builds/configure-a-build | *EN* 界面上那两栏到底改什么 |
| 添加自定义域名 | 文档 | 200 | https://vercel.com/docs/domains/working-with-domains/add-a-domain | *EN* 阿里云 DNS 加 A/CNAME 的对应关系 |
| 域名管理总览 | 文档 | 200 | https://vercel.com/docs/domains/working-with-domains | *EN* 域名状态、验证、重定向 |
| 部署方式与部署总览 | 文档 | 200 | https://vercel.com/docs/deployments/deployment-methods | *EN* Git / CLI / API 三种部署方式 |
| Vercel CLI | 文档 | 200 | https://vercel.com/docs/cli | *EN* 想在本地 `vercel --prod` 时用 |
| 限制与配额 | 文档 | 200 | https://vercel.com/docs/limits/overview | *EN* 免费额度边界（流量、构建时长），避免「突然被限」 |
| 两分钟使用 Vercel 免费部署静态网站 | 视频 | 200 | https://www.bilibili.com/video/BV1kX4y1v75w | 3分28秒，播放 20980（UP：拿大锤的坏叔叔），最短上手 |
| Github 配合 Vercel 实现一键部署 | 视频 | 200 | https://www.bilibili.com/video/BV1fp4y1V7V1 | 21分51秒，播放 11170（UP：ShunCode），完整讲 Git 集成 |
| Web 项目新手部署指南：GitHub+Vercel | 视频 | 200 | https://www.bilibili.com/video/BV1wiPazXE3x | 8分59秒，播放 11839（UP：PM刘搞定），面向新手 |
| 网站部署 Vercel 及域名解析演示 | 视频 | 200 | https://www.bilibili.com/video/BV12g94YbEMv | 8分02秒，播放 5185，**把 Vercel 与 DNS 解析连起来看** |
| Vercel 部署并绑定自定义域名 | 视频 | 200 | https://www.bilibili.com/video/BV1Ke4y1v7Qr | 13分50秒，播放 23453（UP：--Fomalhaut），域名绑定实操 |
| Vercel 免费部署 Next.js（含自定义域名+环境变量） | 视频 | 200 | https://www.bilibili.com/video/BV1xW8mzTETn | 4分10秒，播放 2763（UP：熊老板i），环境变量在界面哪一栏 |

> *EN* 说明：Vercel 官方文档**无中文版**（`vercel.com/docs` 全英文），中文只能看社区教程（B 站/掘金）。
> `vercelzh.com` 是非官方中文站，未验证质量，不建议当权威。

---

## 5. 阿里云云解析 DNS 使用（旧清单只有 2 条浅链接）

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| 云解析 DNS 文档总入口 | 文档 | 200 | https://help.aliyun.com/zh/dns/ | **中文** 本项目 DNS 全在阿里云 |
| 什么是 DNS（阿里云视角） | 文档 | 200 | https://help.aliyun.com/zh/dns/what-is-dns | **中文** 概念入门 |
| 添加解析记录（A/CNAME 实操） | 文档 | 200 | https://help.aliyun.com/zh/dns/user-guide/add-records | **中文** 「加 A 记录」「加 www CNAME」照着点 |
| 解析记录类型说明 | 文档 | 200 | https://help.aliyun.com/zh/dns/user-guide/record-types | **中文** A/AAAA/CNAME/NS/TXT/MX 一次认清 |
| 什么是 TTL | 文档 | 200 | https://help.aliyun.com/zh/dns/what-is-ttl | **中文** TTL 与「改完多久生效」直接相关 |
| TTL 常见问题 | 文档 | 200 | https://help.aliyun.com/zh/dns/support/faq-about-ttl | **中文** 变更生效时间的官方口径 |
| 修改 DNS 服务器（换 NS） | 文档 | 200 | https://help.aliyun.com/zh/dns/user-guide/change-dns-servers | **中文** 什么时候需要改 NS（本项目**不需要**） |
| 域名解析入门（域名侧文档） | 文档 | 200 | https://help.aliyun.com/zh/domain/user-guide/domain-name-resolution | **中文** 从「域名 → 解析」这条线讲 |
| 修改 DNS 服务器（域名侧文档） | 文档 | 200 | https://help.aliyun.com/zh/domain/user-guide/change-dns-servers | **中文** 与云解析那份互为补充 |
| 域名 FAQ（解析相关） | 文档 | 200 | https://help.aliyun.com/zh/domain/support/faq-about-dns | **中文** 遇到怪现象先查这 |
| 云解析最佳实践 | 文档 | 200 | https://help.aliyun.com/zh/dns/best-practices | **中文** A/CNAME 怎么摆、TTL 怎么给 |
| 云解析 DNS 控制台 | 控制台 | 200 | https://dns.console.aliyun.com/ | **中文** 真正动手的地方（需登录） |
| 域名控制台 | 控制台 | 200 | https://dc.console.aliyun.com/ | **中文** 实名、续费、改 NS 在这里 |
| 阿里云-域名解析 DNS01-简单介绍 | 视频 | 200 | https://www.bilibili.com/video/BV1NZ4y1a749 | 5分05秒，播放 8773（UP：ChrisJing46），系列第一课 |
| 阿里云域名解析详细教程 | 视频 | 200 | https://www.bilibili.com/video/BV1G34y1J7rA | 2分27秒，播放 27746，最短的控制台实操 |

---

## 6. 域名与 DNS 通用原理 / 查询工具

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| 阮一峰 · DNS 原理入门 | 教程 | 200 | https://www.ruanyifeng.com/blog/2016/06/dns.html | **中文** 递归/迭代查询讲得最清楚的一篇 |
| Cloudflare 学习中心 · 中文 DNS 总览 | 文档 | 200 | https://www.cloudflare.com/zh-cn/learning/dns/what-is-dns/ | **中文**（官方中文翻译）图解 DNS |
| Cloudflare 学习中心 · DNS 记录类型 | 文档 | 200 | https://www.cloudflare.com/zh-cn/learning/dns/dns-records/ | **中文** A/CNAME/AAAA 对比 |
| Cloudflare 学习中心 · CNAME 记录 | 文档 | 200 | https://www.cloudflare.com/zh-cn/learning/dns/dns-records/dns-cname-record/ | **中文** 为什么根域名不能直接挂 CNAME |
| CNAME 扁平化（CNAME Flattening） | 文档 | 200 | https://developers.cloudflare.com/dns/cname-flattening/ | *EN* 解释「根域名 CNAME 到底怎么办」——Vercel 案例就在这 |
| Cloudflare DNS 文档总入口 | 文档 | 200 | https://developers.cloudflare.com/dns/ | *EN* 记录创建/管理（含 `create-dns-records` 教程） |
| `dig` 手册页（Debian manpages） | 手册 | 200 | https://manpages.debian.org/bookworm/bind9-dnsutils/dig.1.en.html | *EN* `dig` 全参数参考（旧清单没有） |
| BIND 9 管理员手册 · 第 3 章（dig/nslookup/nsupdate） | 文档 | 200 | https://bind9.readthedocs.io/en/latest/chapter3.html | *EN* dig 的官方权威说明 |
| 什么是 DNS（阿里云） | 文档 | 200 | https://help.aliyun.com/zh/dns/what-is-dns | **中文** 迭代/递归、根/TLD/权威的国内表述 |
| DNS 检测 - 站长工具 | 工具 | 200 | https://tool.chinaz.com/dns/ | **中文** 全国多节点查解析结果，验证「生效了吗」 |
| DNS 查询 - 在线工具 | 工具 | 200 | https://tool.lu/dns/ | **中文** 支持选择公共 DNS 服务器对比 |
| 阿里云拨测 DNS 检测 | 工具 | 200 | https://boce.aliyun.com/detect/dns | **中文** 阿里官方多地域拨测，查生效区域 |
| 阿里公共 DNS（223.5.5.5 / DoH） | 官网 | 200 | https://www.alidns.com/knowledge | **中文** 国内 DoH/DoT 配置说明，替代被墙的 dns.google |
| 阿里公共 DNS 配置页 | 工具 | 200 | https://www.alidns.com/setup | **中文** Windows/路由器 DoH 一步步设 |
| nslookup.io | 工具 | 200 | https://www.nslookup.io/ | *EN* 网页版 nslookup/dig，可查 A/CNAME/NS/TXT |
| whatsmydns.net | 工具 | 200 | https://www.whatsmydns.net/ | *EN* 全球节点解析传播图 |
| 【硬核科普】详解 DNS 服务与污染 | 视频 | 200 | https://www.bilibili.com/video/BV1Rp4y1a7xQ | 7分28秒，播放 890121（UP：硬件茶谈），原理讲得最好 |
| 新手如何搞定域名解析？ | 视频 | 200 | https://www.bilibili.com/video/BV1pt42157cs | 6分14秒，播放 24230（UP：霂明坊），面向小白 |
| DNS 域名解析过程 | 视频 | 200 | https://www.bilibili.com/video/BV1uL4y1B7aE | 13 分钟，播放 303531（技术蛋老师） |
| 购买域名后如何解析到服务器 | 视频 | 200 | https://www.bilibili.com/video/BV1gP4y1p7j7 | 6分34秒，播放 114762，控制台实操视角 |

---

## 7. GitHub REST API + Personal Access Token（旧清单只有 PAT 一条）

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| REST API 中文总入口 | 文档 | 200 | https://docs.github.com/zh/rest | **中文** API 参考的官方中文目录 |
| REST API 快速上手 | 文档 | 200 | https://docs.github.com/zh/rest/quickstart | **中文** 第一次成功调一次 API |
| REST API 入门指南（curl 全流程） | 文档 | 200 | https://docs.github.com/zh/rest/guides/getting-started-with-the-rest-api | **中文** 认证头、状态码、分页一次讲清 |
| 如何认证到 REST API（Token 怎么带） | 文档 | 200 | https://docs.github.com/zh/rest/authentication/authenticating-to-the-rest-api | **中文** `Authorization: Bearer <token>` 与 header 写法 |
| contents API（读写仓库文件） | 文档 | 200 | https://docs.github.com/zh/rest/repos/contents | **中文** portal.html 直接对应这个 API（含 PUT 提交文件） |
| workflows API（含 workflow dispatch） | 文档 | 200 | https://docs.github.com/zh/rest/actions/workflows | **中文** 「手动触发 Actions」就是 `create-a-workflow-dispatch-event` |
| workflow runs API（查运行结果） | 文档 | 200 | https://docs.github.com/zh/rest/actions/workflow-runs | **中文** 部署成功没成功，用这个查 |
| fine-grained PAT 权限对照表 | 文档 | 200 | https://docs.github.com/zh/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens | **中文** 最小权限怎么勾（比 classic 的 `repo` 细得多） |
| 管理个人访问令牌（PAT 总页） | 文档 | 200 | https://docs.github.com/zh/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens | **中文** classic vs fine-grained、撤销、过期 |
| 速率限制 | 文档 | 200 | https://docs.github.com/zh/rest/using-the-rest-api/rate-limits-for-the-rest-api | **中文** 401/403 到底是不是被限流 |
| **CORS 与 JSONP（浏览器直调 API 的关键）** | 文档 | 200 | https://docs.github.com/zh/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests | **中文** 解释「portal.html 为什么能从前端放 PAT 调 API」、哪些头允许 |
| OIDC 加固（不用长期凭据的进阶路） | 文档 | 200 | https://docs.github.com/zh/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect | **中文** 以后想把 PAT 换掉时的官方方案 |
| Software Engineering 必备? Github API 简易教程 | 视频 | 200 | https://www.bilibili.com/video/BV1p4411S7iy | 12分11秒，播放 3473（UP：手艺人arc），中文 GitHub API 视频极少，这条能用 |

> ⚠️ GitHub 中文文档页面较大，本机 curl 偶发 25s 超时（返回 `200` 但读不完 body）；浏览器打开正常。
> PAT 安全实践：**别把 token 写进仓库/文档/聊天**，只放在浏览器 `localStorage`（本项目 portal.html 的做法），
> 并定期在 Settings → Developer settings 撤销重建；classic token 能勾就少勾，优先 fine-grained。

---

## 8. Service Worker / PWA / HTTP 缓存

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| MDN · Service Worker API | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/API/Service_Worker_API | **中文** API 总览 |
| MDN · 使用 Service Worker（生命周期） | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/API/Service_Worker_API/Using_Service_Workers | **中文** install/activate/fetch 全流程，先看这篇 |
| MDN · ServiceWorker 接口 | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/API/ServiceWorker | **中文** `skipWaiting` / `clients.claim` 出处 |
| MDN · Cache 接口（`addAll` 等） | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/API/Cache | **中文** 缓存策略要用的 API |
| MDN · CacheStorage | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/API/CacheStorage | **中文** `caches.open()` / `caches.keys()` |
| MDN · HTTP 缓存（必读） | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Guides/Caching | **中文** 强缓存/协商缓存、`immutable`、`no-cache` 的准确含义 |
| MDN · Cache-Control | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Cache-Control | **中文** 逐条指令解释（本项目 `sw.js` 为什么 `no-cache`） |
| MDN · ETag | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/ETag | **中文** 304 的另一半 |
| MDN · Last-Modified | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Last-Modified | **中文** 时间戳型校验 |
| MDN · 渐进式 Web 应用（PWA） | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/Progressive_web_apps | **中文** PWA 全景 |
| MDN · 让 PWA 可安装 | 文档 | 200 | https://developer.mozilla.org/zh-CN/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable | **中文** manifest + SW 的安装条件 |
| Chrome 官方 · Lighthouse 概览（**中国可访问镜像**） | 文档 | 200 | https://developer.chrome.google.cn/docs/lighthouse/overview?hl=zh-cn | **中文** 官方 Lighthouse 文档（`developer.chrome.com` 直连不通，用 `google.cn` 镜像） |
| Edge DevTools · PWA 面板（中文） | 文档 | 200 | https://learn.microsoft.com/zh-cn/microsoft-edge/devtools-guide-chromium/progressive-web-apps/ | **中文** Application 面板看 SW/manifest 的中文说明 |
| 【PWA 教程】Service Worker 应用 | 视频 | 200 | https://www.bilibili.com/video/BV1Bt411U7xj | 41分28秒，播放 6404（UP：掘金技术社区），系统讲 SW |
| 【PWA】什么是 PWA | 视频 | 200 | https://www.bilibili.com/video/BV19Y411C79s | 11分37秒，播放 12849（UP：全栈码叔），概念入门 |
| 【PWA 教程】将网站添加至桌面 | 视频 | 200 | https://www.bilibili.com/video/BV1Wt411U7d4 | 13分05秒，播放 6642（掘金技术社区），manifest 实操 |
| HTTP 缓存精讲 | 视频 | 200 | https://www.bilibili.com/video/BV1Jr4y1v7Nc | 57分40秒，播放 11707（UP：小打小闹Studio），只讲缓存，够深 |

> 🚪 **需代理**（直连失败，本次实测时代理曾短暂可用返回 200，复核时代理已断，故不作为首选）：
> `https://web.dev/articles/http-cache`、`https://web.dev/learn/pwa/service-workers`、`https://web.dev/learn/pwa/`。
> 其内容与上面 MDN 中文页高度重合，**用 MDN + Chrome 中文镜像替代即可，不必折腾代理**。

---

## 9. Markdown / YAML frontmatter / Obsidian 双链（旧清单之外的新增）

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| Obsidian 官方帮助 · 内部链接（双链语法） | 文档 | 200 | https://help.obsidian.md/links | *EN* `[[wiki 链接]]` / `![[嵌入]]` 的官方定义（旧清单只给了首页） |
| Obsidian 官方帮助 · 嵌入（图片/文件） | 文档 | 200 | https://help.obsidian.md/embeds | *EN* `![[图片.png]]` 为什么能当图片用 |
| Obsidian 官方帮助 · 语法总览 | 文档 | 200 | https://help.obsidian.md/syntax | *EN* Markdown + Obsidian 扩展语法一页 |
| Obsidian 中文帮助（社区翻译） | 文档 | 200 | https://publish.obsidian.md/help-zh/ | **中文** 官方帮助的中文版 |
| Jekyll · Front Matter（frontmatter 的源头规范） | 文档 | 200 | https://jekyllrb.com/docs/front-matter/ | *EN* YAML frontmatter 这个约定的原始出处，解释三横线 |
| Markdown 官方指南 · 速查表 | 文档 | 200 | https://www.markdownguide.org/cheat-sheet/ | *EN* 一页速查（配合旧清单的中文页） |
| YAML 1.2.2 规范 | 规范 | 200 | https://yaml.org/spec/1.2.2/ | *EN* 遇到「为什么这个 `tags: [a, b]` 能解析」时查 |
| 【第8课】10 分钟了解 Obsidian 双链 | 视频 | 200 | https://www.bilibili.com/video/BV1eWwBeZEPD | 10分37秒，播放 39757（UP：光头obsidian教程），**只讲双链**，最对口 |
| 【从零开始学 OB】双链与关系图谱 | 视频 | 200 | https://www.bilibili.com/video/BV1H84y1R7Xg | 10分11秒，播放 20733（UP：PKMer） |
| Obsidian 入门保姆级教程 | 视频 | 200 | https://www.bilibili.com/video/BV1Xi4y1h76C | 26分30秒，播放 723290（UP：Chris就是Chris），口碑最好的 OB 入门 |
| Markdown 文档基础语法（4K） | 视频 | 200 | https://www.bilibili.com/video/BV1eJ4m157kC | 97分50秒，播放 174143（UP：青空の霞光），一次学全 |
| 轻松掌握 YAML 语言、语法 | 视频 | 200 | https://www.bilibili.com/video/BV1yd4y1X75D | 40分37秒，播放 24617（UP：程序员老左），frontmatter 写错时看 |

---

## 10. Git 与 GitHub 新手向（旧清单之外的新增）

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| GitHub 官方 · Hello World（第一次走完全流程） | 教程 | 200 | https://docs.github.com/zh/get-started/quickstart/hello-world | **中文** 建仓库→建分支→提 PR→合并，最短闭环 |
| GitHub 官方 · 学习资源汇总 | 文档 | 200 | https://docs.github.com/zh/get-started/start-your-journey/git-and-github-learning-resources | **中文** 官方给出的自学路径 |
| 关于 Pull Request | 文档 | 200 | https://docs.github.com/zh/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests | **中文** PR 到底是什么 |
| Conventional Commits（中文版） | 规范 | 200 | https://www.conventionalcommits.org/zh-hans/v1.0.0/ | **中文** commit 信息规范（`feat:` / `fix:`），团队协作前提 |
| gitignore 官方模板集合 | GitHub | 200 | https://github.com/github/gitignore | *EN* `.gitignore` 别自己瞎写，直接抄模板 |
| GitHub Skills（官方互动课） | 教程 | 200 | https://skills.github.com/ | *EN* 官方动手课程总入口 |
| Git+Github 核心概念大串讲 | 视频 | 200 | https://www.bilibili.com/video/BV1ySLc6QEcB | 42分50秒，播放 1046158（UP：技术爬爬虾），2026 年口碑最新 |
| 一个视频学会 Git + GitHub | 视频 | 200 | https://www.bilibili.com/video/BV1LwHv6LEYz | 109分36秒，播放 110705（UP：马克的技术工作坊） |
| 【互联网入门指南】Github 入门 | 视频 | 200 | https://www.bilibili.com/video/BV1Bvem6WERT | 8分41秒，播放 2006946，面向纯小白 |

---

## 11. SEO 基础（sitemap / robots / canonical / OG）

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| Google 搜索中心（**中国可访问镜像**） | 文档 | 200 | https://developers.google.cn/search/docs?hl=zh-cn | **中文** `developers.google.com` 直连不通，这个 `google.cn` 镜像**直连 200**，是最省的替代 |
| Google · 站点地图概览（镜像） | 文档 | 200 | https://developers.google.cn/search/docs/crawling-indexing/sitemaps/overview?hl=zh-cn | **中文** build.mjs 生成 sitemap.xml 的规范依据 |
| Google · robots.txt 简介（镜像） | 文档 | 200 | https://developers.google.cn/search/docs/crawling-indexing/robots/intro?hl=zh-cn | **中文** robots.txt 写法与常见误用 |
| Google · 用 canonical 合并重复网址（镜像） | 文档 | 200 | https://developers.google.cn/search/docs/crawling-indexing/consolidate-duplicate-urls?hl=zh-cn | **中文** 双站构建最危险的一条：canonical 指向错域 |
| sitemaps.org 协议（中文） | 规范 | 200 | https://www.sitemaps.org/zh_CN/protocol.html | **中文** sitemap.xml 的协议原文（含 50k URL/50MB 限制） |
| robots.txt 规范站 | 文档 | 200 | https://www.robotstxt.org/robotstxt.html | *EN* 老牌参考；最新规范是 RFC 9309（见下） |
| RFC 9309（robots.txt 现行标准） | 规范 | 200 | https://www.rfc-editor.org/rfc/rfc9309.html | *EN* 现行国际标准，`robotstxt.org` 其实已过时 |
| Open Graph 协议官网 | 规范 | 200 | https://ogp.me/ | *EN* `og:title` / `og:url` 的官方定义 |
| 百度搜索资源平台 · 搜索学院 | 官网 | 200 | https://ziyuan.baidu.com/college | **中文** 国内站点收录/提交的唯一官方入口 |
| Bing Webmaster Tools | 官网 | 200 | https://www.bing.com/webmasters | *EN* 提交 sitemap 的第二渠道（国内可访问） |
| 从零开始搭建个人博客 · 五、让搜索引擎收录 | 视频 | 200 | https://www.bilibili.com/video/BV1724y1U779 | 8分20秒，播放 8598（UP：科技小飞哥），投稿 sitemap 实操 |
| robots.txt 是什么、如何生成 | 视频 | 200 | https://www.bilibili.com/video/BV18Z4y187Fd | 5分11秒，播放 4194（UP：哟派出海） |

> 🚪 **需代理**：`https://developers.google.com/search/docs?...`（000）与其中文页、`https://search.google.com/search-console/about`（000）。
> 前者用 `developers.google.cn` 镜像替代；Search Console 只能代理访问，但**提交 sitemap 不是必须的**，Bing/百度入口国内可直连。

---

## 12. ffmpeg 基础与 H.264 / H.265

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| ffmpeg 官方文档总入口 | 文档 | 200 | https://ffmpeg.org/documentation.html | *EN* 官方文档索引 |
| `ffmpeg` 命令行完整手册 | 文档 | 200 | https://ffmpeg.org/ffmpeg.html | *EN* 所有参数（查 `-crf` / `-movflags +faststart` 用） |
| H.264 编码指南（官方 wiki） | 文档 | 200 | https://trac.ffmpeg.org/wiki/Encode/H.264 | *EN* 本项目实况照片转 H.264 的对照文档 |
| H.265/HEVC 编码指南 | 文档 | 200 | https://trac.ffmpeg.org/wiki/Encode/H.265 | *EN* HEVC 参数与兼容性注意 |
| 阮一峰 · FFmpeg 视频处理入门教程 | 教程 | 200 | https://www.ruanyifeng.com/blog/2020/01/ffmpeg.html | **中文** 最好的中文 ffmpeg 入门（注意：旧清单给的 2017/02 那条已 404） |
| 【FFmpeg 分P教学】转码、压制、裁切、合并 | 视频 | 200 | https://www.bilibili.com/video/BV1Ft411s7Xa | 53分35秒，播放 217756（UP：CapsLuck），分P挑着看 |
| 保姆级：0 基础在 Windows 上安装 Ffmpeg | 视频 | 200 | https://www.bilibili.com/video/BV1qw4m1d7hx | 4分54秒，播放 169172（UP：猫十10），先装起来 |
| FFmpeg 压片教程 2023 重制版（x264/x265/码率控制） | 视频 | 200 | https://www.bilibili.com/video/BV1sL411x7ix | 12分22秒，播放 52420（UP：softshare官方频道），**H.264/H.265 最对口** |

---

## 13. Linux / SSH / nginx / HTTPS（通用入门，各 2–3 条）

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| Ubuntu Server 官方文档 | 文档 | 200 | https://documentation.ubuntu.com/server/ | *EN* 发行版官方，apt/systemd/网络全在这 |
| 阮一峰 · Bash 脚本教程 | 电子书 | 200 | https://wangdoc.com/bash/ | **中文** 写 `deploy/*.sh` 的基础 |
| 鸟哥的 Linux 私房菜（繁体中文） | 教程 | 200 | http://linux.vbird.org/ | **中文** 老牌系统教材，讲「为什么」而非只背命令 |
| SSH 隧道（Tunneling）讲解 | 教程 | 200 | https://www.ssh.com/academy/ssh/tunneling | *EN* `-L` 本地转发原理（对应「连接服务器桌面.bat」） |
| `sshd_config` 官方手册 | 手册 | 200 | https://man.openbsd.org/sshd_config | *EN* `PasswordAuthentication no` 等参数权威定义 |
| nginx 官方入门指南 | 文档 | 200 | https://nginx.org/en/docs/beginners_guide.html | *EN* `server` / `location` / `try_files` 从这里开始 |
| Let's Encrypt 中文文档 | 文档 | 200 | https://letsencrypt.org/zh-cn/docs/ | **中文** ACME 与证书链 |
| Certbot 官网（按环境生成命令） | 官网 | 200 | https://certbot.eff.org/ | *EN* 选 OS+nginx 直接给你 `certbot` 命令 |

> 这四块的视频旧清单已覆盖（黑马 Linux、GeekHour Linux、狂神 nginx、HTTPS 原理等），不重复列。

---

## 14. ICP 备案是什么（只需解释性资料）

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| 《互联网信息服务管理办法》原文（国务院公报） | 法规 | 200 | https://www.gov.cn/gongbao/content/2011/content_1860864.htm | **中文** 备案制度的法律根：**在境内提供服务的网站才需备案**，这就是「海外托管免备案」的依据 |
| 阿里云 · ICP 备案文档 | 文档 | 200 | https://help.aliyun.com/zh/icp-filing/ | **中文** 流程、材料、驳回原因（真要备案时看这份） |
| 阿里云 · ICP 备案基础服务 · 申请流程 | 文档 | 200 | https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview | **中文** 五步流程与时限的官方表述 |
| 阿里云备案首页（提交入口） | 官网 | 200 | https://beian.aliyun.com/ | **中文** 要提交时从这里进 |
| 工信部备案查询 | 官网 | 521 | https://beian.miit.gov.cn/ | **中文** 页脚备案号的查询目标。**命令行必被反爬拦成 521，不是站点坏了**；全国公安备案入口 `https://beian.mps.gov.cn/`（200）可直连 |

---

## 15. 浏览器 DevTools 与调试

| 资源 | 类型 | 状态 | 链接 | 推荐理由 |
|---|---|---|---|---|
| Chrome DevTools 官方文档（**中国镜像**） | 文档 | 200 | https://developer.chrome.google.cn/docs/devtools?hl=zh-cn | **中文** `developer.chrome.com` 直连 000，这个镜像直连 200，官方内容一致 |
| DevTools · 网络面板（中文镜像） | 文档 | 200 | https://developer.chrome.google.cn/docs/devtools/network?hl=zh-cn | **中文** Network 面板每一项的官方解释 |
| DevTools · Application 面板（中文镜像） | 文档 | 200 | https://developer.chrome.google.cn/docs/devtools/application?hl=zh-cn | **中文** Service Worker / Cache Storage / Manifest 就在这查 |
| DevTools · 查看和调试 PWA | 文档 | 200 | https://developer.chrome.google.cn/docs/devtools/progressive-web-apps?hl=zh-cn | **中文** SW 生命周期、离线状态怎么模拟 |
| Edge DevTools 中文文档总览 | 文档 | 200 | https://learn.microsoft.com/zh-cn/microsoft-edge/devtools-guide-chromium/overview | **中文** 微软维护的 Chromium DevTools 中文文档（质量高） |
| Edge DevTools · 网络参考 | 文档 | 200 | https://learn.microsoft.com/zh-cn/microsoft-edge/devtools-guide-chromium/network/reference | **中文** 各列含义、过滤语法 |
| 【浏览器调试工具精讲】Chrome Dev Tools | 视频 | 200 | https://www.bilibili.com/video/BV1KM4y1G7EF | 51分34秒，播放 135701（UP：我在B站玩编程），中文最系统 |
| Network 面板所有操作 · DevTools 技巧 | 视频 | 200 | https://www.bilibili.com/video/BV1WF41197oD | 30分46秒，播放 12629（UP：好朋友乐平） |

---

## 🚫 直连实测失败的链接（不要写进推荐表）

| 链接 | 实测 | 说明 |
|---|---|---|
| https://web.dev/articles/http-cache 等 web.dev 全站 | 000 | 需代理；本次实测时代理曾 200，复核时已 000 |
| https://developers.google.com/search/docs（及其中文页） | 000 | 需代理 → 用 `developers.google.cn` 镜像 |
| https://developer.chrome.com/docs/devtools | 000 | 需代理 → 用 `developer.chrome.google.cn` 镜像 |
| https://dns.google/ | 000 | 需代理 → 用 `www.alidns.com` / `tool.chinaz.com/dns` |
| https://one.one.one.one/ | 000 | 两种方式都不通 |
| https://toolbox.googleapps.com/apps/dig/ | 000 | 需代理 |
| https://dnschecker.org/ | `Could not resolve host` | 连域名都解析不了，代理也 000 → **不上榜** |
| https://zh.wikipedia.org/wiki/ICP备案 | 000 | 需代理 |
| https://search.google.com/search-console/about | 000 | 需代理 |
| https://www.digitalocean.com/... | 000 | 直连不通 |
| https://www.zhihu.com/…、zhuanlan.zhihu.com/… | 403 | 反爬（搜索能搜到，命令行抓不到） |
| https://beian.miit.gov.cn/ | 521 | 反爬，浏览器正常 |
| https://docs.github.com/zh/pages/getting-started-with-github-pages/using-custom-domains-with-github-pages | 404 | 旧地址失效（新地址见 T3） |
| https://github.com/marketplace/actions/upload-pages-artifact | 404 | 该 action 没有 Marketplace 页，只看仓库 |
| https://www.cloudflare.com/.../dns/glossary/cname-flattening/ | 404 | 文档已迁到 `developers.cloudflare.com` |
| https://man7.org/linux/man-pages/man1/dig.1.html | 404 | 正确入口见 T6 |
| https://www.ruanyifeng.com/blog/2017/02/ffmpeg.html | 404 | 正确地址是 2020/01 |

---

## ⚠️ 不建议作为入门首选的资源

| 资源 | 一句话说明 |
|---|---|
| 菜鸟教程 / W3School | 内容浅、示例与截图陈旧，且很多页无更新标识；当「速查」可以，当主线会学歪 |
| 廖雪峰 Git 教程 | 只覆盖基础命令，多年未更新；Git 优先 `Pro Git 中文版` + GitHub 官方中文文档 + Learn Git Branching |
| 知乎/CSDN 的「Vercel 部署全攻略 / 使用教程」 | 实测 403（登录墙+反爬），且多为 SEO 拼贴；Vercel 看官方英文文档 + B 站实操视频更可靠 |
| vercelzh.com（"Vercel 官网中文站"） | **非官方**中文站，内容像机器翻译/生成，无质量背书，别当权威 |
| B 站「SEO 优化全套教程 / WordPress SEO 插件」类 | 面向百度排名、外贸独立站、WordPress 插件，与静态博客的 `canonical / sitemap.xml / robots.txt` 几乎不相关 |
| `robotstxt.org`（当唯一标准看） | 页面老旧，现行标准是 RFC 9309；二者对照看 |
| 「一集几十小时」的 ffmpeg / 音视频 C++ 教程 | 面向音视频开发岗位（FFmpeg API、RTMP/SRS），与本项目「命令行转码」需求严重不匹配，别从这入门 |
| 用 `curl` 验证 `beian.miit.gov.cn` | 必然 521，会误判「站点挂了」；该项只适合浏览器验证 |
| B 站按关键词搜 "ESM 教程" | 噪音极大（命中鼠标型号、导弹型号），必须按 BV 号直达 |

---

## 📌 对旧清单的三处纠错

1. 旧清单声称「全部文档链接于 2026-10 实测返回 200」已不成立：其中 `developers.google.com/search/...`（canonical/sitemap）
   本次**直连 000**，需改用 `developers.google.cn` 镜像；`beian.miit.gov.cn` 为 521（属反爬，需注明）。
2. `https://www.ruanyifeng.com/blog/2017/02/ffmpeg.html`（旧清单模块 3 附近若引用）已 **404**，正确地址为 2020/01/ffmpeg.html。
3. GitHub Actions / Pages 的部分文档 URL 已改版（`using-workflows/...` → `actions/how-tos/...`、`actions/reference/...`；
   Pages 自定义域名页路径也变了），照旧清单的地址点会 404。