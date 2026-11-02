// 回归验证：链接渲染 + 卡片点击编辑态
const { createRequire } = require('module');
const skillRequire = createRequire('/Users/yingdonglin.1/Library/Application Support/kimi-desktop/daimon-share/daimon/skills/smart-web-scraper/package.json');
const { chromium } = skillRequire('playwright');
const path = require('path');
const EXT = path.resolve(__dirname, '..');

const today = new Date();
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plus = n => fmt(new Date(today.getTime() + n * 864e5));

const mockTasks = [
  { id: 't1', title: '模板bug修复上线-金营', detail: '验收标准见 https://example.com/spec 和埋点文档', project: '金营', dueDate: plus(0), createdAt: 1, status: 'hanging', completedAt: null,
    links: [{ url: 'https://example.com/spec', title: '金营模板修复验收标准', fetchedAt: 1 }, { url: 'https://github.com/yingdonglin/nodeping', title: null, fetchedAt: Date.now() }] },
  { id: 't2', title: '新增交易子类型-运营平台', detail: '', project: '跨境运营平台', dueDate: plus(1), createdAt: 2, status: 'hanging', completedAt: null, links: [] },
  { id: 't3', title: '收款体验优化-跨境欧洲', detail: '后端开发进度未定，后续接上联调即可', project: '跨境欧洲', dueDate: plus(3), createdAt: 3, status: 'hanging', completedAt: null,
    links: [{ url: 'https://wiki.internal.com/pay', title: null, fetchedAt: null }] },
  { id: 't4', title: '保险业务嵌入-跨境香港', detail: '需要一同上线埋点bug修复', project: '跨境香港', dueDate: plus(3), createdAt: 4, status: 'hanging', completedAt: null, links: [] },
  { id: 't5', title: '模板二期开发-金营', detail: '前端定制数据结构', project: '金营', dueDate: plus(3), createdAt: 5, status: 'hanging', completedAt: null, links: [] },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 385, height: 640 } });
  await ctx.addInitScript(tasks => {
    const data = { 'nodeping.tasks.v1': tasks };
    window.chrome = {
      runtime: { id: 'nodeping-debug', openOptionsPage() {} },
      storage: {
        sync: { get: async k => (typeof k === 'string' ? { [k]: data[k] } : data), set: async o => Object.assign(data, o) },
        onChanged: { addListener() {} },
      },
      permissions: { contains: async () => true, request: async () => true },
      action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
      alarms: { get: async () => null, create() {}, onAlarm: { addListener() {} } },
    };
  }, mockTasks);

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:8123/popup/popup.html');
  await page.waitForTimeout(700);

  const m1 = await page.evaluate(() => ({
    linkChips: document.querySelectorAll('.t-link').length,
    descLinks: document.querySelectorAll('.t-desc a').length,
    firstChipLabel: document.querySelector('.t-link span')?.textContent,
    fallbackChipLabel: document.querySelectorAll('.t-link span')[1]?.textContent,
  }));
  console.log('渲染检查:', JSON.stringify(m1));
  await page.screenshot({ path: path.join(EXT, 'tools/debug-links.png') });

  // 点击第一张卡片主体 → 应进入编辑态并预填
  await page.click('.task[data-id="t1"] .t-body');
  await page.waitForTimeout(500);
  const m2 = await page.evaluate(() => ({
    editorOpen: document.querySelector('#editor').classList.contains('open'),
    titleVal: document.querySelector('#edTitle').value,
    dateLabel: document.querySelector('#edDatePicker .dp-value').textContent,
    saveBtn: document.querySelector('#edSave').textContent,
    pendingChips: document.querySelectorAll('.ed-link-chip').length,
  }));
  console.log('编辑态检查:', JSON.stringify(m2));
  await page.screenshot({ path: path.join(EXT, 'tools/debug-editor.png') });

  // 编辑器里添加一条链接
  await page.fill('#edLinkInput', 'juejin.cn/post/123');
  await page.press('#edLinkInput', 'Enter');
  await page.waitForTimeout(200);
  const m3 = await page.evaluate(() => ({
    pendingChips: document.querySelectorAll('.ed-link-chip').length,
    lastChip: document.querySelector('.ed-link-chip:last-child span')?.textContent,
  }));
  console.log('链接添加检查:', JSON.stringify(m3));

  console.log('JS 错误:', errors.length ? errors : '无');
  await browser.close();
})();
