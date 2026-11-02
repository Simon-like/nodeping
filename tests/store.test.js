import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTasks, saveTasks, addTask, setStatus, cleanupArchived,
  getSettings, saveSettings, getStorageInfo, storageErrorMessage,
} from '../shared/store.js';

let data;
let writes;

function installChromeMock(initial = {}, { failWrites = false } = {}) {
  data = structuredClone(initial);
  writes = 0;
  const sync = {
    QUOTA_BYTES: 102400,
    async get(keys) {
      if (keys == null) return structuredClone(data);
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter(key => key in data).map(key => [key, structuredClone(data[key])]));
    },
    async set(values) {
      writes++;
      if (failWrites) throw new Error('QUOTA_BYTES quota exceeded');
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
    async getBytesInUse() {
      return Buffer.byteLength(JSON.stringify(data));
    },
  };
  globalThis.chrome = { storage: { sync } };
}

const task = (id, extra = {}) => ({
  id, title: `任务 ${id}`, detail: '', project: '', dueDate: null, links: [],
  createdAt: Date.now(), status: 'hanging', completedAt: null, ...extra,
});

test('旧单键数据可读取，保存后透明迁移为分段且内容完整', async () => {
  installChromeMock({ 'nodeping.tasks.v1': [task('old')] });
  assert.equal((await getTasks())[0].id, 'old');
  const many = Array.from({ length: 120 }, (_, i) => task(`t${i}`, { title: '关键节点'.repeat(30) }));
  await saveTasks(many);
  assert.equal((await getTasks()).length, 120);
  assert.ok(Object.keys(data).some(key => key.startsWith('nodeping.tasks.chunk.')));
  assert.equal(data['nodeping.tasks.v1'], undefined);
});

test('分段保存会移除多余旧分段', async () => {
  installChromeMock();
  await saveTasks(Array.from({ length: 100 }, (_, i) => task(`t${i}`, { title: '长标题'.repeat(50) })));
  await saveTasks([task('only')]);
  assert.deepEqual((await getTasks()).map(t => t.id), ['only']);
  assert.equal(Object.keys(data).filter(key => key.startsWith('nodeping.tasks.chunk.')).length, 1);
});

test('归档清理只删除超期归档，挂起任务永久保留', async () => {
  installChromeMock();
  const now = new Date('2026-10-25T12:00:00');
  await saveTasks([
    task('hanging', { createdAt: 0 }),
    task('expired', { status: 'done', completedAt: Date.parse('2026-07-01T12:00:00') }),
    task('recent', { status: 'done', completedAt: now.getTime() }),
    task('cancelled', { status: 'cancelled', archivedAt: Date.parse('2026-07-01T12:00:00') }),
  ]);
  assert.equal(await cleanupArchived({ retentionDays: 90, now }), 2);
  assert.deepEqual((await getTasks()).map(t => t.id), ['hanging', 'recent']);
});

test('retentionDays 为 0 时仅用于手动全部清理', async () => {
  installChromeMock();
  await saveTasks([task('h'), task('d', { status: 'done', completedAt: 1 })]);
  assert.equal(await cleanupArchived({ retentionDays: 0 }), 1);
  assert.deepEqual((await getTasks()).map(t => t.id), ['h']);
});

test('设置有安全默认值且可局部更新', async () => {
  installChromeMock();
  assert.deepEqual(await getSettings(), { autoCleanup: true, archiveRetentionDays: 90 });
  await saveSettings({ archiveRetentionDays: 30 });
  assert.deepEqual(await getSettings(), { autoCleanup: true, archiveRetentionDays: 30 });
});

test('完成和取消都记录归档时间，恢复会清空', async () => {
  installChromeMock();
  const created = await addTask({ title: '  测试节点  ' });
  const done = await setStatus(created.id, 'done');
  assert.equal(typeof done.archivedAt, 'number');
  const restored = await setStatus(created.id, 'hanging');
  assert.equal(restored.archivedAt, null);
});

test('容量信息返回实际用量与归档数', async () => {
  installChromeMock();
  await saveTasks([task('h'), task('d', { status: 'done', completedAt: 1 })]);
  const info = await getStorageInfo();
  assert.ok(info.bytes > 0);
  assert.equal(info.quota, 102400);
  assert.equal(info.taskCount, 2);
  assert.equal(info.archivedCount, 1);
  assert.ok(info.usageRatio > 0 && info.usageRatio < 1);
});

test('存储异常被翻译成可操作提示，新增失败不返回假成功', async () => {
  installChromeMock({}, { failWrites: true });
  await assert.rejects(addTask({ title: '无法保存' }), error => error.code === 'QUOTA_EXCEEDED');
  assert.match(storageErrorMessage({ code: 'QUOTA_EXCEEDED' }), /清理|空间/);
  assert.ok(writes > 0);
});
