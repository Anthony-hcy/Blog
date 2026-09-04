# Portal New post / Edit 页面拥挤问题诊断报告

- **诊断日期**：2026-09-04
- **页面**：http://127.0.0.1:8128/Blog/portal.html 的 **Edit（New post）** 页签
- **现象**：用户反馈 New post / Edit 页面**太挤**（表单项挤压、工具栏拥挤、预览与表单抢空间）
- **诊断方式**：浏览器截图 + CSS 布局数值核对（`site-root/assets/portal.css`）

---

## 🔴 根因

### 1. 编辑器双栏布局在窄容器里被挤到各剩 270px
- `.portal-shell { max-width: 560px }`（portal.css:28）——整个 Portal 只允许 560px 宽
- `.editor-split { grid-template-columns: 1fr 1fr; gap: 14px }`（portal.css:180）——编辑器强行分左右两栏，每栏约 **(560 - 16×2 - 14) ÷ 2 ≈ 257px**
- 断点是 `@media (max-width: 900px)` 才变成 1 栏（portal.css:183）——但**视口再宽，容器也才 560px**，所以 900px 断点形同虚设，桌面（1280px）上编辑器依旧是"两张 257px 的窄条"

**后果**：
- 左栏表单：Title/Slug、Date/Type、Category/Tags 每组又是 `.portal-grid { 1fr 1fr }`（portal.css:83）双列 → 每个输入框只剩 **~120px 宽**，Placeholder 直接被截断
- 右栏预览：文本折行频繁，代码块/图片挤压变形
- 整体像"两根吸管并排"，非常局促

### 2. 工具栏一行塞 4 个控件
- `.editor-toolbar`（portal.css:172）是单行 flex，没有 `flex-wrap`
- 内容：`插入图片` 按钮 + `editor-status` 文本 + 撑开空隙 + `Cancel` + `Save & Publish` → 在 560px 容器里挤成一团（截图可见按钮贴边）

### 3. 表单卡片间距小
- `.portal-field { margin-bottom: 14px }`，`.portal-card { padding: 18px 16px }`——两列表单 + 窄栏叠加后视觉密度过高，行与行几乎无喘息空间

---

## 🟡 次要观察

### 4. 图片选择弹层（img-picker）相对编辑器很突兀
- `.img-picker { width: min(640px, 92vw) }`（portal.css:230）比编辑器容器还宽，弹出时视觉反差大；与 257px 的编辑栏并排显得很不协调

### 5. 编辑页 sticky 预览
- `.editor-right { position: sticky; top: 12px }`——页面滚动时预览固定，但在双栏窄布局下楼中楼效果更挤

---

## 🔧 修复建议（供处理模型参考，本轮未改代码）

### 方案 A（推荐）：编辑页单栏 + 预览上下切换
- `portal-shell` 在编辑页放宽到 `max-width: 960px`（给正文页签专属容器类，如 `.portal-shell.wide`，仅 Edit 页签使用）
- `.editor-split` 改为 `grid-template-columns: 1fr`（或保留桌面 `1fr 1fr` 但**仅在容器 ≥ 900px 时生效**），工具栏允许换行 `flex-wrap: wrap; gap: 8px`
- `.portal-grid` 窄屏（<420px）即降单列（已有），建议阈值提到 560px

### 方案 B（最小改动）：只在桌面放宽容器
- 将 `.portal-shell` 的 `max-width: 560px` 提升到 `680px`
- `.editor-split` 的双栏断点从 900px 提高到 1100px 由容器判断（Media Query 无法依据容器，建议改用容器查询 `@container`，或在 JS 里对 Edit 页签给 body 加 class 切换布局）

### 具体参数建议
| 元素 | 现值 | 建议 |
|---|---|---|
| portal-shell max-width | 560px | 编辑页 760~960px |
| editor-split | 1fr 1fr @≥900px | 单栏为主（或容器≥900px 才双栏） |
| editor-toolbar | 单行 flex | `flex-wrap: wrap` |
| portal-grid 阈值 | 420px | 560px（窄栏内自动单列） |
| img-picker width | min(640px, 92vw) | 与 shell 一致 |
| portal-field margin-bottom | 14px | 16px（略带呼吸感） |

---

## ✅ 参考对比（原站后台截图）

原站 IMG_1572（Posts 列表）/IMG_1573（Images）本来就以**单栏卡片 + 大间距**呈现，无"双栏表单"设计——原站编辑页（IMG 未含）大概率也是单栏。因此**方案 A（编辑页走单栏、放宽容器）最贴近原站形态**。
