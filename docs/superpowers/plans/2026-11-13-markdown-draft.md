# NodePing Markdown 草稿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本会话直接按任务执行，不使用子代理。

**Goal:** 在 385px Popup 中提供可靠的 Markdown 草稿场景，支持自动/手动保存、编辑预览、列表快捷输入和快捷键加粗。

**Architecture:** 草稿与任务数据分离，使用 `chrome.storage.local` 保存 `{text, updatedAt}`，避免长文挤占同步配额。独立 Markdown 模块负责安全解析和编辑变换，独立草稿控制器负责 UI 与防抖保存，Popup 主逻辑仅负责场景切换。

**Tech Stack:** Manifest V3、原生 HTML/CSS/ES Modules、Node.js 内置测试、Playwright。

## Global Constraints

- 保持零运行时依赖，不引入第三方 Markdown 脚本或外部网络资源。
- 所有 Markdown 内容先转义，禁止原始 HTML 注入；链接仅允许 HTTP/HTTPS。
- 输入防抖 600ms 自动保存，`Cmd/Ctrl+S` 和保存按钮立即保存。
- 存储失败保留文本并显示错误，不清空编辑器。
- 草稿只保存到本机，界面明确标注；不占任务 Chrome Sync 空间。

---

### Task 1: Markdown 解析与编辑变换

**Files:** Create `shared/markdown.js`, `tests/markdown.test.js`

**Interfaces:** `renderMarkdown(source): string`、`toggleBold(source,start,end): {text,start,end}`、`continueList(source,start): {text,start,end,handled}`。

- [ ] 编写失败测试：有序/无序列表、标题、粗体、代码、链接、HTML 转义、空选区加粗、取消加粗、Enter 自动编号和空列表项退出。
- [ ] 运行 `node --test tests/markdown.test.js`，确认模块不存在时失败。
- [ ] 实现行级块解析与安全行内解析，列表连续分组，空行落段。
- [ ] 实现选区加粗/取消加粗和列表 Enter 变换，返回精确选区。
- [ ] 重跑测试，确保 XSS 样例只输出转义文本。

### Task 2: 本机草稿存储

**Files:** Create `shared/draft-store.js`, `tests/draft-store.test.js`

**Interfaces:** `getDraft()`、`saveDraft(text)`、`clearDraft()`、`getDraftStorageInfo()`、`draftErrorMessage(error)`。

- [ ] 编写失败测试：默认空稿、特殊字符往返、更新时间、清空、字节用量和写入异常。
- [ ] 运行测试确认旧代码没有草稿存储能力。
- [ ] 使用 `nodeping.draft.v1` 保存到 `chrome.storage.local`，读取损坏数据时回退为空稿。
- [ ] 使用 `getBytesInUse` 返回本机用量与配额，写入异常转成可操作提示。
- [ ] 重跑全部存储测试。

### Task 3: Popup 草稿场景

**Files:** Create `popup/draft.js`, `popup/draft.css`; Modify `popup/popup.html`, `popup/popup.js`, `popup/popup.css`

**Interfaces:** `initDraft()` 绑定编辑、保存、预览和清空；`openDraft()` 加载草稿；Popup 顶层场景为 `tasks | draft`。

- [ ] 在浏览器回归中增加：进入草稿、输入 Markdown、Cmd/Ctrl+B、列表回车、自动保存、预览渲染、重新加载恢复。
- [ ] 顶栏下加入“节点 / 草稿”场景切换，节点原有日历和列表包入独立容器。
- [ ] 草稿页提供编辑/预览切换、保存状态、 textarea、预览区、字数、本机容量、保存与清空按钮。
- [ ] 输入 600ms 防抖保存；`1. ` 由 Markdown 解析为列表，Enter 自动递增编号；`Cmd/Ctrl+B` 加粗，`Cmd/Ctrl+S` 立即保存。
- [ ] 清空需确认；保存失败保留输入；预览链接使用安全新窗口。
- [ ] 检查 385×600 下顶栏、编辑器、底部操作均可见，长文只在编辑区滚动。

### Task 4: 回归与版本

**Files:** Modify `tools/test_ui.js`, `README.md`, `manifest.json`, `package.json`

- [ ] 扩展 Chrome API mock，加入独立 `storage.local` 和持久化断言。
- [ ] 运行 `npm test && npm run test:ui && git diff --check`。
- [ ] 截图检查草稿编辑与预览，确认无横向溢出、原节点功能无回归。
- [ ] 版本更新为 0.4.0，README 记录 Markdown 能力、快捷键、本机存储语义和测试命令。
