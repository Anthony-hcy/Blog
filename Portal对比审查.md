# Blog Portal 与原站后台对比审查报告

- **审查日期**：2026-09-04
- **原站后台**（参考）：https://blog.imalan.cn/archives/memo-20260420-1806/ 文章中的截图（IMG_1571~1574）
- **当前实现**：https://anthony-hcy.github.io/Blog/portal.html
- **结论**：**当前实现是"暗色仿站"风格，原站后台是"浅色 iOS 风格"——整体配色、卡片、Tab、按钮、文案全维度不一致，需要整体重做 UI（功能逻辑基本可用）。**

---

## 🔴 严重（一眼就"丑"的差异）

### 1. 整体配色完全相反
| | 原站 | 当前 |
|---|---|---|
| 页面背景 | **白色**（浅色主题） | **纯黑**（#000） |
| 卡片背景 | 白色卡片 + 浅灰边距 + 圆角 + 轻微阴影 | 深灰卡片（#15130f）+ 黑底 |
| 文字 | 深色（近黑） | 浅色（#e0dcd6） |
| 强调色 | 蓝色（文字链接/按钮边框） | 橙色（#e07850 主题色） |

当前 Portal 复用了博客站点的暗色主题变量，但原站后台是独立浅色皮肤——这是"很丑"的根源。

### 2. 顶部布局
- 原站：左侧 **Blog Portal** 标题（大号粗体深色字），右侧 **Sign Out 蓝色文字链接**（非按钮）
- 当前：标题尚在，但 Sign Out 是暗色按钮；整体贴黑边距感重

### 3. Tab 栏样式
- 原站：浅色栏，5 个 tab 文字（Current 项用**黑色粗下划线**指示，如 Posts 下划线；文字灰色，选中变黑）
- 当前：深色胶囊块，选中项为橙色背景高亮
- 注意：原站有 **Comments** tab（评论区管理），当前按需求**刻意不做评论系统**，无此 tab——属预期差异，但视觉上少一项

### 4. Posts 文章卡片
- 原站：白色卡片，结构为：
  - 第一行：**标题**（粗体）
  - 第二行小字：`memo  2026-04-19 22:44:18  publish`（类型 + 日期时间 + 状态，浅灰）
  - 第三行：三个**浅灰圆角小胶囊按钮**横排：Images / Edit / Delete
- 当前：深色卡片，元信息行是 `slug · 日期`（无类型、无 publish 状态），按钮小而小灰样式

### 5. Images 图片页
- 原站：
  - 顶部一个**输入框**（slug）+ 深色 **Browse** 按钮
  - 下面一行：`选取文件：未选择文件` 文案 + **Upload** 按钮
  - 图片网格 **2 列**，每张图下方：**文件名**（普通字）+ **Copy MD（蓝色文字链接）/ Delete（红色文字链接）**
- 当前：文件选择控件样式原始，无 Browse 按钮、无"选取文件"文案；按钮风格为橙色/灰色实心

### 6. Status 状态页
- 原站：三张白色卡片：
  - **Build**：`Status: idle` + **Rebuild Site**（蓝色边框按钮）
  - **Site Content**：`Latest commit: afc464a8 — [blog] Optimize portal functions` + `2026/4/20 16:03:01` + `No uncommitted changes` + **Push to remote / Commit Changes**（蓝框按钮）
  - **Babel DB**：同结构
- 当前：卡片存在但样式为暗色，按钮为橙色/灰实心，无"蓝框按钮"视觉

---

## 🟡 中等（功能/细节偏差）

### 7. 页面文案
- 原站：英文文案（Sign Out / Posts / Edit / Images / Status / Build / Site Content / Latest commit / No uncommitted changes / Push to remote / Commit Changes / Browse / Upload / Copy MD / Delete）
- 当前：登录页与部分文案为中文（"使用 GitHub Personal Access Token 登录…"），登录后功能页为英文——文案风格混杂，建议统一为英文（1:1 复刻）

### 8. 登录方式差异（预期内）
- 原站：与自家后端 session 登录，无需 token 输入
- 当前：GitHub PAT 登录（纯静态站无后端的必要方案）——UI 可以做得与原站一致用"登录页"形态，但登录框本身必须有，属合理差异

### 9. 状态页数据
- 原站有 Babel DB （评论数据库）卡片，当前无评论系统，不提供——预期差异

---

## ✅ 功能验证（本轮已确认可用）

- Portal 页可正常打开、显示登录表单（Owner/Repo + Token + 署名）
- 四个 tab 按钮存在（Posts/Edit/Images/Status）
- 需要确认（本轮未测）：登录后 Posts 列表加载、写文章提交、传图、Rebuild——理论上 GitHub API 逻辑已实现，需登录实测

---

## 🔧 修复方向（供后续修改参考，本轮未改任何代码）

1. **重写 portal.css**：整体切换为浅色主题——白底 `#fff`、浅灰卡片 `#f5f5f7`、深色文字 `#1c1c1e`、蓝色强调 `#0a84ff`（iOS 蓝）、红色 Delete `#ff3b30`、memo/post 类型灰字；页面布局居中限制宽度 ~560px
2. **Tab 栏**：改为文字 + 当前项黑色下划线（border-bottom 3px，`aria-selected` 语义），去掉橙色高亮
3. **Posts 卡片**：结构调整为 标题 / `memo|post 日期 时间 publish` / 三胶囊按钮（浅灰底、圆角、Delete 灰色即可，或保留浅灰一致性）
4. **Images 页**：按原站补 Browse 按钮 + "选取文件" 文案 + 2 列网格 + Copy MD（蓝色链接）/ Delete（红色链接）
5. **Status 页**：卡片补蓝色边框按钮（Rebuild Site / Push to remote / Commit Changes），文案改英文
6. **Sign Out**：改为顶部右侧蓝色文字链接
7. **统一英文文案**（登录页可保留中文说明，功能页 1:1 英文）
