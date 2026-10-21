# 我的博客（AtWill 风格静态站）

一个部署在 GitHub Pages 的纯静态个人博客。界面结构参考 AtWill 主题（由 AlanDecode / 熊猫小A 开源的 VOID 主题衍生的 MIT 项目），文章内容全部为站主原创。

## 特性

- 首页文章流（长文 + memo 短篇混排）、分页无限加载
- 首页超长 memo 自动折叠：正文 >150 字默认收起 6 行 + 「展开」（图片、链接地址不计字数；见 [docs/使用指南.md](docs/使用指南.md) 第十三节）
- 说说头像自动分配：不与前两条重复，历史头像不因新发而改变（可用 frontmatter `avatar:` 手填；见 [docs/使用指南.md](docs/使用指南.md) 第十四节）
- 亮/暗双主题（跟随系统自动切换）
- 文章页支持 KaTeX 公式、图片画廊（PhotoSwipe）
- 文章页右侧「本页目录」：自动列出 `##` / `###` 标题，点击跳转、滚动时高亮当前小节
- 正文行内小字注释：`((补充说明))` → 灰色小字（语法迁自 Eyu.at，post / memo 通用；见 [docs/使用指南.md](docs/使用指南.md) 第十二节）
- 正文行内高亮：`==重点==` → 黄色底，可与加粗/斜体叠用（语法同 Obsidian；见 docs 第十二节 12.1）
- 支持 Obsidian 提示块 `> [!note]`（可折叠、分类型配色；见 [docs/使用指南.md](docs/使用指南.md) 第十五节）
- 全站搜索（ExSearch，本地 JSON 索引）
- 归档、分类、标签、关于页
- 手机端管理面板 Blog Portal（Posts / Edit / Images / Status）

## 快速开始

```bash
node scripts/build.mjs   # 生成 dist/（无需安装依赖，marked 已 vendor）
python -m http.server 8080 --directory dist   # 本地预览 http://localhost:8080
```

## 目录结构

```
content/                 # 内容（构建的唯一输入源头之一）
  posts/*.md             #   文章（frontmatter: title/date/slug/type/category/tags/…）
  pages/about.md         #   关于页
  chronicle.json         #   关于页「编年史」时间线
static/assets/           # 站点资源（CSS/JS/字体/图片），整目录拷进 dist
site-root/               # 站点根文件（favicon/logo/manifest/portal.css/sw.js/好友圈数据）
scripts/build.mjs        # 唯一的构建脚本：Markdown → dist/
scripts/*.mjs|*.py       # 素材处理、好友圈采集等辅助工具（构建不调用）
deploy/                  # 部署到自有服务器 / 构建产物自检
docs/                    # 说明文档：使用指南、问题记录、项目结构、学习笔记/
vendor/marked.esm.js     # Markdown 渲染库（随仓库内置，无需 npm install）
site.config.json         # 站点配置：站名 / 简介 / 社交链接 / 友链
dist/                    # 构建产物（git 忽略，可随时重新生成）
_tmp/                    # 本地临时与取证（git 忽略，可随时删）
```

更细的职责划分与「改了会出问题」的红线见 [docs/项目结构.md](docs/项目结构.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/使用指南.md](docs/使用指南.md) | 新手教程：发文、传图、改站名、本地预览、双站部署 |
| [docs/项目结构.md](docs/项目结构.md) | 目录职责、数据流、不能动的地方、常用命令 |
| [docs/问题记录.md](docs/问题记录.md) | 踩过的坑与修法（遇到怪问题先翻这里） |
| [docs/学习笔记/](docs/学习笔记/) | 从零掌握本项目的三份学习清单（大量 `文件:行号` 证据） |

## 写文章

在 `content/posts/` 下新建 `.md` 文件：

```markdown
---
title: 我的第一篇文章
date: 2026-09-04 10:00:00+08:00
slug: my-first-post
type: post            # post 长文 | memo 短篇
category: 日常
tags: [生活, 记录]
excerpt: 可选摘要
banner: /assets/img/post/cover.png   # 可选封面
draft: false
---

正文（Markdown）…
```

`draft: true` 的文章不会被构建。推送到 `main` 分支后 GitHub Actions 会自动构建并部署。

## Blog Portal（手机后台）

访问 `/portal.html`，用 GitHub Personal Access Token（需 `repo` 读写权限）登录后可以：

- **Posts**：列出/新建/编辑/删除文章
- **Edit**：在线写 Markdown，保存即提交到仓库并触发重新构建
- **Images**：按文章上传图片、复制 Markdown 引用、删除
- **Status**：查看构建状态、手动触发 Rebuild

> RSS/Atom 暂未提供（如需启用见 `docs/使用指南.md` 的「RSS/Atom（暂未启用）」一节）。

## 致谢

- 主题结构与视觉：源自 [VOID](https://github.com/AlanDecode/Typecho-Theme-VOID)（MIT）及其衍生 AtWill 主题
- 搜索组件：[ExSearch](https://github.com/AlanDecode/Typecho-Plugin-ExSearch)（MIT）
- 图片画廊：[PhotoSwipe](https://photoswipe.com/)（MIT）
- 图标：[Font Awesome](https://fontawesome.com/)（Free 版，CC BY 4.0 / OFL）
- 数学渲染：[KaTeX](https://katex.org/)（MIT）
