// 本地渲染调试：用 Playwright + chrome API 桩加载 popup.html，量测滚动行为并截图
const { createRequire } = require('module');
const skillRequire = createRequire('/Users/yingdonglin.1/Library/Application Support/kimi-desktop/daimon-share/daimon/skills/smart-web-scraper/package.json');
const { chromium } = skillRequire('playwright');
const path = require('path');

const EXT = path.resolve(__dirname, '..');

const today = new Date();
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plus = n => fmt(new Date(today.getTime() + n * 864e5));

const mockTasks = [
  { id: 't1', title: '模板bug修复上线-金营', detail: '', project: '金营', dueDate: plus(0), createdAt: 1, status: 'hanging', completedAt: null },
  { id: 't2', title: '新增交易子类型-运营平台', detail: '', project: '跨境运营平台', dueDate: plus(1), createdAt: 2, status: 'hanging', completedAt: null },
  { id: 't3', title: '收款体验优化-跨境欧洲', detail: '后端开发进度未定，后续接上联调即可', project: '跨境欧洲', dueDate: plus(3), createdAt: 3, status: 'hanging', completedAt: null },
  { id: 't4', title: '保险业务嵌入-跨境香港', detail: '需要一同上线埋点bug修复', project: '跨境香港', dueDate: plus(3), createdAt: 4, status: 'hanging', completedAt: null },
  { id: 't5', title: '模板二期开发-金营', detail: '前端定制数据结构', project: '金营', dueDate: plus(3), createdAt: 5, status: 'hanging', completedAt: null },
  { id: 't6', title: '额外任务六号', detail: '用于撑出滚动', project: '测试', dueDate: plus(6), createdAt: 6, status: 'hanging', completedAt: null },
  { id: 't7', title: '额外任务七号', detail: '用于撑出滚动', project: '测试', dueDate: plus(8), createdAt: 7, status: 'hanging', completedAt: null },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 385, height: 640 } });
  await ctx.addInitScript(tasks => {
    const data = { 'nodeping.tasks.v1': tasks };
    window.chrome = {
      storage: {
        sync: {
          get: async key => (typeof key === 'string' ? { [key]: data[key] } : data),
          set: async obj => { Object.assign(data, obj); },
        },
        onChanged: { addListener() {} },
      },
      runtime: { openOptionsPage() {} },
      action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
      alarms: { get: async () => null, create() {}, onAlarm: { addListener() {} } },
    };
  }, mockTasks);

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(process.env.POPUP_URL || ('file://' + path.join(EXT, 'popup/popup.html')));
  await page.waitForTimeout(800);

  const m = await page.evaluate(() => {
    const list = document.querySelector('#taskList');
    const wrap = document.querySelector('#listWrap');
    const cs = getComputedStyle(list);
    return {
      maxHeight: cs.maxHeight,
      overflowY: cs.overflowY,
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
      cardCount: list.querySelectorAll('.task').length,
      wrapClasses: wrap.className,
      bodyScrollH: document.body.scrollHeight,
      bodyClientH: document.body.clientHeight,
    };
  });
  console.log(JSON.stringify({ metrics: m, errors }, null, 2));

  await page.screenshot({ path: path.join(EXT, 'tools/debug-popup.png') });
  await browser.close();
})();
