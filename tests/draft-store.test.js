import test from 'node:test';
import assert from 'node:assert/strict';
import { getDraft, saveDraft, clearDraft, getDraftStorageInfo, draftErrorMessage } from '../shared/draft-store.js';

let data;
function installLocalMock(initial = {}, fail = false) {
  data = structuredClone(initial);
  globalThis.chrome = { storage: { local: {
    QUOTA_BYTES: 10 * 1024 * 1024,
    async get(key) { return key in data ? { [key]: structuredClone(data[key]) } : {}; },
    async set(value) { if (fail) throw new Error('QUOTA_BYTES quota exceeded'); Object.assign(data, structuredClone(value)); },
    async remove(key) { delete data[key]; },
    async getBytesInUse(key) { return data[key] ? new TextEncoder().encode(JSON.stringify(data[key])).length : 0; },
  } } };
}

test('默认返回空草稿，文本原样往返并记录更新时间', async () => {
  installLocalMock();
  assert.deepEqual(await getDraft(), { text: '', updatedAt: null });
  const saved = await saveDraft('# 标题\n\n**中文** & HTML');
  assert.equal(saved.text, '# 标题\n\n**中文** & HTML');
  assert.equal(typeof saved.updatedAt, 'number');
  assert.deepEqual((await getDraft()).text, saved.text);
});

test('清空只删除草稿，容量信息使用本机配额', async () => {
  installLocalMock();
  await saveDraft('abc');
  const info = await getDraftStorageInfo();
  assert.ok(info.bytes > 0);
  assert.equal(info.quota, 10 * 1024 * 1024);
  assert.ok(info.usageRatio > 0);
  await clearDraft();
  assert.deepEqual(await getDraft(), { text: '', updatedAt: null });
});

test('写入异常提供明确提示且不伪造成功', async () => {
  installLocalMock({}, true);
  await assert.rejects(saveDraft('内容'), error => error.code === 'DRAFT_WRITE_FAILED');
  assert.match(draftErrorMessage({ code: 'DRAFT_WRITE_FAILED' }), /自动保存失败|保存失败/);
});
