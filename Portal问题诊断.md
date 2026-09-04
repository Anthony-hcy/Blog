# Portal 页面问题诊断报告

- **诊断日期**：2026-09-04
- **页面**：http://127.0.0.1:8128/Blog/portal.html（重构版）
- **现象**：页面打开后布局异常/错乱（用户反馈"页面有问题"）
- **诊断方式**：DOM 快照 + CSS 规则静态分析（浏览器自动化工具在本会话间歇性不可用，未能截取实际渲染图）

---

## 🔴 根因（确认）：CSS 缺少 `[hidden]` 防覆盖规则，弹层与 Tab 栏无端显示

**问题**：`site-root/portal.css` 中**没有任何 `[hidden] { display: none }` 规则**，但有多个设置了 `display: flex` 的类同时使用了 HTML `hidden` 属性。

**机制**：HTML `hidden` 属性依赖浏览器默认样式 `[hidden] { display: none }`（user-agent 层级）。但 CSS 中**作者样式** `.portal-tabs { display: flex; }`、`.img-picker { display: flex; ... }` 等优先级高于 UA 默认——作者设置 `display: flex` 的元素，即使带 `hidden` 属性**也会被强制显示**。

### 受影响元素（带 `hidden` 但被 CSS display 覆盖）

| 元素 | hidden 意图 | CSS 覆盖 | 后果 |
|---|---|---|---|
| `#img-picker`（插入图片弹层） | 默认隐藏 | `.img-picker { display: flex }` | **打开页面即显示弹层 + scrim 遮罩盖住页面**（最严重的可见 bug） |
| `#img-picker-scrim`（弹层遮罩） | 默认隐藏 | `.img-picker-scrim { position: fixed; inset: 0 }` | 同上，黑色遮罩覆盖全屏 |
| `#portal-tabs`（页面 Tab 栏） | 登录后才显示 | `.portal-tabs { display: flex }` | **未登录时 Tab 栏就已经显示** |
| `#view-posts/#view-edit/#view-images/#view-status` | 切页显隐 | `.portal-view`（无 display 规则，用 `hidden` 属性切换） | 部分正常（无 display 覆盖时 hidden 生效），但登录视图也依赖 hidden |
| `#portal-toast` | 提示后自动隐藏 | `.portal-toast { position: fixed }` | 无 display 覆盖，正常 |
| `#portal-signout`/`#portal-account` | 登录后显示 | 无 display 覆盖，正常 | 正常 |

**结论**：页面一打开就被"插入图片"面板（`.img-picker`，`display:flex` + `position:fixed` 居中）和它的全屏遮罩（`.img-picker-scrim`）盖住；Tab 栏在登录界面就显示出来，登录后各视图切换也可能错乱（依赖 `hidden` 属性的显隐全部受影响）。这就是"页面有问题"的根因。

---

## 🟡 次要问题（一并记录）

### 1. `editor-status` 文案未刷新（已发生）
编辑时保存成功会将 `currentPostSlug` 设为 slug，但**切到 Edit 页签再点 Cancel 后再新建**时，`editor-status` 可能残留 "Saved ✓" 或旧 slug——逻辑上 `fillNewPostForm` 会重置为 "New post"，影响较小，待实测确认。

### 2. `img-picker` 打开时 `renderPickerGrid` 依赖 `allImages`
若尚未加载过全部图片（首次打开编辑器就点"插入图片"），`allImages` 为空数组 → 面板只显示"上传图片"按钮，无已有图片可点。建议在 `openPicker()` 时若 `allImages` 为空自动调 `loadAllImages()`。

### 3. 图片选择面板上传后插入的图片目录
`uploadFromPicker` 中 `var dir = safeSlug(currentPostSlug) || 'gallery';`——新建文章（slug 为空）时上传图片会存到 `gallery/`，插入正文的 URL 路径与 slug 无关（用 url），功能上没问题，但图片会落在 `gallery/` 而非文章目录。

### 4. `marked.esm.js` 加载（已验证正常）
`portal.js` 是 `type="module"`，`import { marked } from './marked.esm.js'`——两个文件都在 `dist/assets/` 下，HTTP 200，模块加载正常（Node 侧 import 验证通过；浏览器端 `location` 未定义报错仅存在于 Node 环境，浏览器正常）。

---

## ✅ 已经验证正常的

- HTML 标签配对完整（section/div/nav/button/label 等全部闭合）
- portal.js 引用的 52 个 id 全部存在于 HTML，无缺失
- portal.js 中 marked import 路径正确
- marked 渲染输出正确（Markdown → HTML 验证通过）
- Tree API 返回全部 6 张图片

---

## 🔧 修复方案（供处理模型参考）

### 核心修复（一行）
在 `site-root/assets/portal.css` 顶部（或 :root 之后）加：

```css
[hidden] { display: none !important; }
```

`!important` 可确保覆盖所有作者 display 规则（UA 默认不够，因为 `.img-picker` 等作者样式优先级更高）。

### 可选加固
1. `openPicker()` 内加 `if (!allImages.length) loadAllImages().then(renderPickerGrid);`
2. 打开页面后先确认登录视图正常（无 Tab 栏、无弹层、无遮罩）
3. 保存流程实测一遍：新建 → 传图自动插入 → 预览 → Save & Publish → Posts 列表刷新
4. JS 改动后注意 `portal.js` 是 module 脚本，修改后需重建 dist 再刷新
