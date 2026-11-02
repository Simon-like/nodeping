import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStats } from '../shared/stats.js';

const NOW = new Date('2026-10-25T12:00:00');
const base = (id, extra = {}) => ({ id, title: id, createdAt: Date.parse('2026-10-01T09:00:00'), project: '', ...extra });

test('摘要区分完成、取消、逾期和未来七天', () => {
  const stats = buildStats([
    base('hanging', { status: 'hanging', dueDate: '2026-10-20' }),
    base('soon', { status: 'hanging', dueDate: '2026-10-30' }),
    base('done', { status: 'done', dueDate: '2026-10-20', completedAt: Date.parse('2026-10-20T10:00:00') }),
    base('cancelled', { status: 'cancelled', archivedAt: Date.parse('2026-10-21T10:00:00') }),
  ], NOW);
  assert.deepEqual(stats.summary, {
    hanging: 2, overdue: 1, dueNext7: 1, done30: 1,
    completionRate30: 50, onTimeRate30: 100, archived: 2,
  });
});

test('无日期和晚完成会正确影响按期完成率', () => {
  const stats = buildStats([
    base('no-date', { status: 'done', dueDate: null, completedAt: Date.parse('2026-10-20T10:00:00') }),
    base('late', { status: 'done', dueDate: '2026-10-19', completedAt: Date.parse('2026-10-20T10:00:00') }),
  ], NOW);
  assert.equal(stats.summary.done30, 2);
  assert.equal(stats.summary.onTimeRate30, 0);
  assert.equal(stats.summary.completionRate30, 100);
});

test('近八周趋势按周一起始且只统计当前快照中的归档', () => {
  const stats = buildStats([
    base('this-week', { status: 'done', completedAt: Date.parse('2026-10-19T09:00:00') }),
    base('last-week', { status: 'done', completedAt: Date.parse('2026-10-18T09:00:00') }),
    base('old', { status: 'done', completedAt: Date.parse('2026-08-01T09:00:00') }),
  ], NOW);
  assert.equal(stats.weekly.length, 8);
  assert.equal(stats.weekly[0].start, '2026-08-31');
  assert.equal(stats.weekly.at(-2).done, 1);
  assert.equal(stats.weekly.at(-1).done, 1);
  assert.equal(stats.weekly.reduce((sum, week) => sum + week.done, 0), 2);
});

test('项目排行合并未命名项目并限制五项，洞察不虚构数据', () => {
  const tasks = Array.from({ length: 6 }, (_, i) => base(`p${i}`, {
    status: 'hanging', project: `项目${i}`, dueDate: '2026-10-20',
  }));
  const stats = buildStats(tasks, NOW);
  assert.equal(stats.projects.length, 5);
  assert.ok(stats.insights.some(text => text.includes('6') && text.includes('逾期')));
  assert.equal(buildStats([], NOW).summary.hanging, 0);
  assert.ok(buildStats([], NOW).insights[0].includes('还没有'));
});
