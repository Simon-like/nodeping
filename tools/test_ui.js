// 浏览器回归：日期选择、复盘渲染、保留策略和存储失败反馈。
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const skillRequire = createRequire('/Users/yingdonglin.1/Library/Application Support/kimi-desktop/daimon-share/daimon/skills/smart-web-scraper/package.json');
const { chromium } = skillRequire('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT)) throw new Error('invalid path');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
const DAY = 864e5;
const now = Date.now();
const date = offset => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const task = (id, extra = {}) => ({
  id, title: `节点 ${id}`, detail: '复盘测试记录', project: '金营', dueDate: date(1), links: [],
  createdAt: now - 10 * DAY, updatedAt: now, status: 'hanging', completedAt: null, archivedAt: null, ...extra,
});
const mockTasks = [
  task('overdue', { title: '支付对账上线', dueDate: date(-2) }),
  task('soon', { title: '模板二期评审', dueDate: date(3), project: '运营平台' }),
  task('third', { title: '第三个挂起节点', dueDate: date(4) }),
  task('fourth', { title: '第四个挂起节点', dueDate: date(5) }),
  task('fifth', { title: '第五个挂起节点', dueDate: date(6) }),
  task('done', { title: '已完成节点', status: 'done', dueDate: date(-1), completedAt: now - DAY, archivedAt: now - DAY }),
  task('expired', { title: '过期归档', status: 'done', completedAt: now - 120 * DAY, archivedAt: now - 120 * DAY }),
];

async function createPage(browser, file) {
  const viewport = file.startsWith('popup/') ? { width: 385, height: 600 } : { width: 1280, height: 900 };
  const context = await browser.newContext({ viewport });
  await context.addInitScript(tasks => {
    const data = {
      'nodeping.tasks.v1': structuredClone(tasks),
      'nodeping.settings.v1': { autoCleanup: false, archiveRetentionDays: 90 },
    };
    window.__mockData = data;
    window.__failWrites = false;
    window.chrome = {
      runtime: { id: 'nodeping-test', openOptionsPage() {} },
      action: {
        async setBadgeText({ text }) { window.__badgeText = text; },
        async setBadgeBackgroundColor({ color }) { window.__badgeColor = color; },
      },
      storage: {
        sync: {
          QUOTA_BYTES: 102400,
          async get(keys) {
            if (keys == null) return structuredClone(data);
            const list = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(list.filter(k => k in data).map(k => [k, structuredClone(data[k])]));
          },
          async set(values) {
            if (window.__failWrites) throw new Error('QUOTA_BYTES quota exceeded');
            Object.assign(data, structuredClone(values));
          },
          async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; },
          async getBytesInUse() { return new TextEncoder().encode(JSON.stringify(data)).length; },
        },
        onChanged: { addListener() {} },
      },
      permissions: { contains: async () => true, request: async () => true },
    };
  }, mockTasks);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${BASE}/${file}`);
  await page.waitForTimeout(400);
  return { context, page, errors };
}

const browser = await chromium.launch({ headless: true });
try {
  const popup = await createPage(browser, 'popup/popup.html');
  const popupLayout = await popup.page.evaluate(() => {
    const root = document.documentElement;
    const list = document.querySelector('#taskList');
    const footer = document.querySelector('.pop-foot').getBoundingClientRect();
    return {
      rootScrollable: root.scrollHeight > root.clientHeight + 1,
      listScrollable: list.scrollHeight > list.clientHeight + 1,
      footerBottom: footer.bottom,
      badgeText: window.__badgeText,
      badgeColor: window.__badgeColor,
    };
  });
  assert.equal(popupLayout.rootScrollable, false, '根页面不得出现外层纵向滚动条');
  assert.equal(popupLayout.listScrollable, true, '长列表应仅在任务容器内滚动');
  assert.ok(popupLayout.footerBottom <= 600, '底部操作按钮不得被弹框裁切');
  assert.equal(popupLayout.badgeText, '5', '打开弹框应恢复挂起任务徽标');
  assert.equal(popupLayout.badgeColor, '#ef4444', '存在逾期任务时徽标应为红色');
  await popup.page.screenshot({ path: path.join(ROOT, 'tools/debug-popup.png') });
  await popup.page.click('#openEditor');
  await popup.page.click('#edDatePicker .dp-trigger');
  await popup.page.waitForTimeout(500);
  const headerBounds = await popup.page.locator('.pop-head').boundingBox();
  const triggerBounds = await popup.page.locator('#edDatePicker .dp-trigger').boundingBox();
  const panelBounds = await popup.page.locator('#edDatePicker .dp-panel').boundingBox();
  assert.ok(panelBounds.y >= triggerBounds.y + triggerBounds.height, '月历必须从日期栏下方向下展开');
  assert.ok(panelBounds.y >= headerBounds.y + headerBounds.height, '月历不得遮挡顶栏');
  const lastDayBounds = await popup.page.locator('#edDatePicker .dp-day').last().boundingBox();
  assert.ok(lastDayBounds.y >= 0 && lastDayBounds.y + lastDayBounds.height <= 600, '月历最后一天必须完整可见');
  await popup.page.screenshot({ path: path.join(ROOT, 'tools/debug-date.png') });
  await popup.page.click('#edDatePicker [data-offset="0"]');
  assert.equal(await popup.page.locator('#edDatePicker .dp-value').textContent(), '今天');
  await popup.page.fill('#edTitle', '今天新增的测试节点');
  await popup.page.click('#edSave');
  await popup.page.waitForTimeout(200);
  assert.equal(await popup.page.locator('#editor.open').count(), 0);
  assert.ok(await popup.page.locator('#taskList').getByText('今天新增的测试节点').count());
  assert.equal(await popup.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);

  await popup.page.click('#openEditor');
  await popup.page.fill('#edTitle', '写满时不能丢的内容');
  await popup.page.evaluate(() => { window.__failWrites = true; });
  await popup.page.click('#edSave');
  assert.equal(await popup.page.locator('#editor.open').count(), 1);
  assert.match(await popup.page.locator('#edError').textContent(), /空间不足/);
  assert.equal(await popup.page.inputValue('#edTitle'), '写满时不能丢的内容');
  await popup.page.screenshot({ path: path.join(ROOT, 'tools/debug-popup-new.png') });
  assert.deepEqual(popup.errors, []);
  await popup.context.close();

  const options = await createPage(browser, 'options/options.html');
  await options.page.click('#newTaskBtn');
  await options.page.click('#fDatePicker .dp-trigger');
  await options.page.click('#fDatePicker [data-offset="0"]');
  assert.equal(await options.page.locator('#fDatePicker .dp-value').textContent(), '今天');
  await options.page.click('#fDatePicker .dp-trigger');
  await options.page.click('#fDatePicker .dp-next');
  await options.page.locator('#fDatePicker .dp-day:not(.dim)').first().click();
  assert.notEqual(await options.page.locator('#fDatePicker .dp-value').textContent(), '选择日期');
  await options.page.fill('#fTitle', '管理页日期回归');
  await options.page.click('#fSave');
  await options.page.waitForTimeout(200);
  assert.equal(await options.page.locator('#modalMask:not(.hidden)').count(), 0);

  await options.page.click('[data-view="review"]');
  assert.equal(await options.page.locator('#reviewView:not(.hidden)').count(), 1);
  assert.equal(await options.page.locator('#weeklyChart .week-col').count(), 8);
  assert.equal(await options.page.locator('#metricArchived').textContent(), '2');
  await options.page.click('#autoCleanup');
  await options.page.locator('#retentionDays:not([disabled])').waitFor();
  await options.page.selectOption('#retentionDays', '30');
  await options.page.click('#cleanupExpiredBtn');
  await options.page.waitForTimeout(250);
  assert.equal(await options.page.locator('#metricArchived').textContent(), '1');
  assert.match(await options.page.locator('#storageMeta').textContent(), /分段同步/);
  await options.page.screenshot({ path: path.join(ROOT, 'tools/debug-review.png'), fullPage: true });
  assert.deepEqual(options.errors, []);
  await options.context.close();

  console.log('UI 回归通过：Popup 今日日期与失败保留、Options 月历选期、8 周图表、归档清理、存储信息均正常。');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
