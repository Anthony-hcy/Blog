# 我的博客（AtWill 风格静态站）

一个部署在 GitHub Pages 的纯静态个人博客。界面结构参考 AtWill 主题（由 AlanDecode / 熊猫小A 开源的 VOID 主题衍生的 MIT 项目），文章内容全部为站主原创。

## 特性

- 首页文章流（长文 + memo 短篇混排）、分页无限加载
- 亮/暗双主题（跟随系统自动切换）
- 文章页支持 KaTeX 公式、图片画廊（PhotoSwipe）
- 全站搜索（ExSearch，本地 JSON 索引）
- 归档、分类、标签、关于页、RSS
- 手机端管理面板 Blog Portal（Posts / Edit / Images / Status）

## 快速开始

```bash
npm install
npm run build     # 生成 dist/
npm run serve     # 本地预览 http://localhost:8080
```

## 目录结构

```
content/posts/*.md    # 文章（frontmatter: title/date/slug/type/category/tags/...）
content/pages/        # 关于页
scripts/build.mjs     # 构建脚本（Markdown → 静态页）
site-root/            # 站点根文件（favicon/logo/manifest/portal）
static/assets/        # 主题资源（CSS/JS/字体）
site.config.json      # 站点配置（站名/简介/社交链接）
```

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

## 致谢

- 主题结构与视觉：源自 [VOID](https://github.com/AlanDecode/Typecho-Theme-VOID)（MIT）及其衍生 AtWill 主题
- 搜索组件：[ExSearch](https://github.com/AlanDecode/Typecho-Plugin-ExSearch)（MIT）
- 图片画廊：[PhotoSwipe](https://photoswipe.com/)（MIT）
- 图标：[Font Awesome](https://fontawesome.com/)（Free 版，CC BY 4.0 / OFL）
- 数学渲染：[KaTeX](https://katex.org/)（MIT）
