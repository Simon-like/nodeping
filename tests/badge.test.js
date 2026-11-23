import test from 'node:test';
import assert from 'node:assert/strict';
import { syncActionBadge } from '../shared/badge.js';

function installActionMock() {
  const calls = [];
  globalThis.chrome = {
    action: {
      async setBadgeText(details) { calls.push(['text', details]); },
      async setBadgeBackgroundColor(details) { calls.push(['color', details]); },
    },
  };
  return calls;
}

const task = (id, status = 'hanging', dueDate = null) => ({
  id, status, dueDate, createdAt: 1,
});

test('徽标显示全部挂起任务数量，逾期任务使用红色', async () => {
  const calls = installActionMock();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dueDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  await syncActionBadge([task('a'), task('b', 'hanging', dueDate), task('c', 'done')]);

  assert.deepEqual(calls, [
    ['text', { text: '2' }],
    ['color', { color: '#ef4444' }],
  ]);
});

test('没有挂起任务时清空徽标', async () => {
  const calls = installActionMock();
  await syncActionBadge([task('done', 'done')]);

  assert.deepEqual(calls, [
    ['text', { text: '' }],
    ['color', { color: '#3b82f6' }],
  ]);
});
