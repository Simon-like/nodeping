# NodePing 存储、日期与复盘体验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本会话不使用子代理，按任务顺序直接执行并验证。

**Goal:** 消除同步存储写满后无提示的问题，提供安全的归档保留策略、统一日期选择器和基于现有任务数据的统计复盘页。

**Architecture:** 保留 Manifest V3、原生 ES Modules 与 `chrome.storage.sync`。数据层由单存储项透明迁移为索引加分段，统计采用纯函数读取当前任务快照，Options 页通过视图切换承载日程与复盘，不引入框架、服务器或事件溯源重构。

**Tech Stack:** Chrome Extension MV3、原生 HTML/CSS/JavaScript、Node.js 内置测试运行器、Playwright 页面回归。

## Global Constraints

- 挂起与逾期任务永不自动清理，只有 `done` / `cancelled` 归档受保留策略影响。
- 默认自动清理 90 天前的归档；可配置 30 / 90 / 180 / 365 天，也可关闭自动清理。
- 保留 Chrome Sync 多端同步，不改用本地存储替代。
- 存储失败必须保留编辑内容并显示可操作的错误，不得先关闭编辑器。
- 项目保持零运行时依赖，统计只声称当前快照能支持的结论。
- 不自动提交 Git，不改动用户无关文件。

---

### Task 1: 分段存储、迁移与容量反馈

**Files:**
- Modify: `shared/store.js`
- Modify: `background/sw.js`
- Modify: `popup/popup.js`, `popup/popup.html`, `popup/popup.css`
- Modify: `options/options.js`, `options/options.html`, `options/options.css`
- Create: `tests/store.test.js`, `package.json`

**Interfaces:**
- Produces: `getStorageInfo(): Promise<{bytes,quota,usageRatio,taskCount,archivedCount}>`
- Produces: `cleanupArchived({retentionDays?,now?}): Promise<number>`
- Produces: `getSettings()` / `saveSettings(patch)`，设置包含 `autoCleanup` 与 `archiveRetentionDays`
- Produces: `storageErrorMessage(error): string`

- [ ] **Step 1: 写失败测试，覆盖旧数据迁移、分段读写、归档清理和容量错误**

```js
test('legacy tasks survive a round trip and large collections are sharded', async () => {
  installChromeMock({ 'nodeping.tasks.v1': [{ id: 'old', title: '旧节点', status: 'hanging' }] });
  assert.equal((await getTasks())[0].id, 'old');
  await saveTasks(Array.from({ length: 120 }, (_, i) => ({ id: `t${i}`, title: '节点'.repeat(20), status: 'hanging' })));
  assert.equal((await getTasks()).length, 120);
  assert.ok(Object.keys(mockData()).some(key => key.startsWith('nodeping.tasks.chunk.')));
});

test('cleanup removes only expired archived records', async () => {
  const now = new Date('2026-10-25T12:00:00');
  const tasks = [
    { id: 'h', status: 'hanging', createdAt: 0 },
    { id: 'd', status: 'done', completedAt: new Date('2026-07-01').getTime() },
    { id: 'r', status: 'done', completedAt: now.getTime() },
  ];
  await saveTasks(tasks);
  assert.equal(await cleanupArchived({ retentionDays: 90, now }), 1);
  assert.deepEqual((await getTasks()).map(t => t.id), ['h', 'r']);
});
```

- [ ] **Step 2: 运行 `node --test tests/store.test.js`，确认在旧实现上失败。**
- [ ] **Step 3: 实现 6.5KB 目标分段、索引最后提交、旧键读取与保存后迁移；同步写入异常包装为带 `code` 的错误。**
- [ ] **Step 4: 用 `chrome.storage.sync.getBytesInUse(null)` 展示实际字节数与配额比例；达到 85% 预警，保存失败保留编辑状态并提示前往复盘页清理。**
- [ ] **Step 5: Service Worker 在启动和周期闹钟中执行归档维护；运行存储测试并检查 popup / options 所有保存入口均有异常反馈。**

### Task 2: 统一日期选择器

**Files:**
- Create: `shared/date-picker.js`, `shared/date-picker.css`
- Modify: `popup/popup.html`, `popup/popup.js`, `popup/popup.css`
- Modify: `options/options.html`, `options/options.js`, `options/options.css`
- Create: `tests/date-picker.test.js`（浏览器回归脚本）

**Interfaces:**
- Produces: `createDatePicker(host, { value, onChange, compact })`
- Returned controller: `{ getValue(), setValue(value), open(), close() }`
- 值为 `YYYY-MM-DD` 或 `null`；快捷操作为今天、明天、下周、无日期。

- [ ] **Step 1: 在浏览器回归脚本中断言编辑器存在“今天”快捷按钮，点击后值为 `todayStr()`，切换月份后能选日，无日期能清空。**
- [ ] **Step 2: 运行脚本，确认旧原生输入无法满足自定义面板与快捷操作断言。**
- [ ] **Step 3: 实现共享按钮式日期控件：触发器显示已选日期，弹层含月份网格、前后月、今天及快捷芯片；支持 Escape、点击外部关闭与基础 ARIA。**
- [ ] **Step 4: Popup 和 Options 均替换原生 `input[type=date]`，编辑时准确预填，保存仍使用原有 `dueDate` 字段。**
- [ ] **Step 5: 运行浏览器回归，检查 385px Popup 无横向溢出、管理页弹层不遮挡保存操作。**

### Task 3: 统计复盘与存储管理视图

**Files:**
- Create: `shared/stats.js`, `options/dashboard.js`
- Modify: `options/options.html`, `options/options.js`, `options/options.css`
- Create: `tests/stats.test.js`

**Interfaces:**
- Produces: `buildStats(tasks, now = new Date())`，返回 `summary`、`weekly`、`projects`、`insights`。
- `summary`: 挂起、逾期、未来 7 天到期、近 30 天完成、近 30 天完成率、按期完成率。
- `weekly`: 最近 8 个自然周的完成与取消数量。
- `projects`: 当前挂起与近 30 天完成按项目聚合的前 5 项。

- [ ] **Step 1: 写固定日期测试，明确周起点、30 天窗口、无截止日期不计入按期率分母、取消不计入完成数。**

```js
const stats = buildStats([
  { id: '1', status: 'done', dueDate: '2026-10-20', completedAt: Date.parse('2026-10-20T10:00:00'), createdAt: Date.parse('2026-10-01T10:00:00') },
  { id: '2', status: 'cancelled', completedAt: null, archivedAt: Date.parse('2026-10-21T10:00:00'), createdAt: Date.parse('2026-10-01T10:00:00') },
], new Date('2026-10-25T12:00:00'));
assert.equal(stats.summary.done30, 1);
assert.equal(stats.summary.completionRate30, 50);
assert.equal(stats.summary.onTimeRate30, 100);
```

- [ ] **Step 2: 运行 `node --test tests/stats.test.js`，确认统计模块不存在时失败。**
- [ ] **Step 3: 实现纯统计函数与最近 8 周 CSS 柱状图、项目排行、摘要指标；复盘文案只由计算结果生成，空数据展示引导而非伪造结论。**
- [ ] **Step 4: Options 顶栏加入“日程管理 / 统计复盘”视图切换；复盘页同时提供存储用量、自动清理开关、保留时长和立即清理按钮。**
- [ ] **Step 5: 完成或取消时写入 `archivedAt`，恢复时清空；旧记录以 `completedAt || createdAt` 兜底。**
- [ ] **Step 6: 运行统计测试与页面回归，验证设置保存、清理后数量和图表同步刷新。**

### Task 4: 全量回归与交付检查

**Files:**
- Modify: `README.md`
- Modify: `manifest.json`（仅提升版本号）

- [ ] **Step 1: 运行 `npm test`，覆盖存储、迁移、清理和统计。**
- [ ] **Step 2: 运行 Playwright 回归并查看 Popup、日程页、复盘页截图，检查控制台错误、溢出和交互。**
- [ ] **Step 3: 使用大量模拟任务验证分段后仍可读取，模拟 `QUOTA_EXCEEDED` 验证错误提示和表单保留。**
- [ ] **Step 4: 更新 README 的存储、复盘和保留策略说明，复核 `git diff` 只包含本需求。**
