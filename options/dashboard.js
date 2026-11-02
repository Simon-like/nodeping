// Options 统计复盘与存储设置视图。
import { buildStats } from '../shared/stats.js';
import { getSettings, saveSettings, getStorageInfo, cleanupArchived, storageErrorMessage } from '../shared/store.js';
import { escapeHtml } from '../shared/ui.js';

function text(id, value) { document.getElementById(id).textContent = value; }
function rate(value) { return value === null ? '—' : `${value}%`; }
function kb(bytes) { return `${(bytes / 1024).toFixed(1)} KB`; }

export async function renderDashboard(tasks) {
  const stats = buildStats(tasks);
  const { summary } = stats;
  text('reviewDone', summary.done30);
  text('metricHanging', summary.hanging);
  text('metricOverdue', summary.overdue);
  text('metricDue', summary.dueNext7);
  text('metricArchived', summary.archived);
  text('completionRate', rate(summary.completionRate30));
  text('onTimeRate', rate(summary.onTimeRate30));
  document.getElementById('completionBar').style.width = `${summary.completionRate30 || 0}%`;

  const max = Math.max(1, ...stats.weekly.map(w => w.done + w.cancelled));
  document.getElementById('weeklyChart').innerHTML = stats.weekly.map(week => `
    <div class="week-col" title="${week.start} 起：完成 ${week.done}，取消 ${week.cancelled}">
      <span class="week-value">${week.done + week.cancelled || ''}</span>
      <div class="bar-stack">
        <i class="cancelled" style="height:${week.cancelled / max * 100}%"></i>
        <i style="height:${week.done / max * 100}%"></i>
      </div>
      <span class="week-label">${week.label}</span>
    </div>`).join('');

  document.getElementById('insightList').innerHTML = stats.insights
    .map(insight => `<li>${escapeHtml(insight)}</li>`).join('');

  const projectMax = Math.max(1, ...stats.projects.map(p => p.hanging + p.done30));
  document.getElementById('projectList').innerHTML = stats.projects.length ? stats.projects.map(project => `
    <div class="project-item">
      <span class="project-name" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</span>
      <div class="project-track"><i style="width:${(project.hanging + project.done30) / projectMax * 100}%"></i></div>
      <span class="project-count">${project.hanging} 挂起 · ${project.done30} 完成</span>
    </div>`).join('') : '<div class="project-empty">有项目归属的节点会在这里形成排行</div>';

  const [info, settings] = await Promise.all([getStorageInfo(), getSettings()]);
  const usage = Math.max(0, info.usageRatio);
  const percent = Math.round(usage * 100);
  const level = usage >= .98 ? 'danger' : usage >= .85 ? 'warning' : '';
  text('storagePercent', `${percent}%`);
  text('storageBytes', `${kb(info.bytes)} / ${kb(info.quota)}`);
  text('storageMeta', `${info.taskCount} 条记录 · ${info.archivedCount} 条归档 · 分段同步，不再受单条 8 KB 限制`);
  text('storageState', level === 'danger' ? '空间不足' : level === 'warning' ? '接近上限' : '正常');
  document.getElementById('storageState').className = `storage-state ${level}`;
  document.getElementById('storageBar').style.width = `${Math.min(100, usage * 100)}%`;
  document.getElementById('storageBar').className = level;
  document.getElementById('autoCleanup').checked = settings.autoCleanup;
  document.getElementById('retentionDays').value = String(settings.archiveRetentionDays);
  document.getElementById('retentionDays').disabled = !settings.autoCleanup;
}

export function initDashboard({ onDataChanged, notify }) {
  async function run(action, button) {
    const oldLabel = button?.textContent;
    if (button) { button.disabled = true; button.textContent = '处理中…'; }
    try { await action(); }
    catch (error) { notify(storageErrorMessage(error), 'error'); }
    finally {
      if (button) { button.disabled = false; button.textContent = oldLabel; }
      await onDataChanged();
    }
  }

  document.getElementById('autoCleanup').onchange = event => run(async () => {
    await saveSettings({ autoCleanup: event.target.checked });
    notify(event.target.checked ? '已开启过期归档自动清理' : '已关闭自动清理，归档会一直保留', 'success');
  });

  document.getElementById('retentionDays').onchange = event => run(async () => {
    await saveSettings({ archiveRetentionDays: Number(event.target.value) });
    notify(`归档保留时长已调整为 ${event.target.value} 天`, 'success');
  });

  document.getElementById('cleanupExpiredBtn').onclick = event => run(async () => {
    const settings = await getSettings();
    const removed = await cleanupArchived({ retentionDays: settings.archiveRetentionDays });
    notify(removed ? `已清理 ${removed} 条过期归档` : '没有需要清理的过期归档', 'success');
  }, event.currentTarget);

  document.getElementById('cleanupAllBtn').onclick = event => {
    if (!confirm('确定清空全部已完成和已取消的归档？挂起节点不会受影响，此操作无法撤销。')) return;
    run(async () => {
      const removed = await cleanupArchived({ retentionDays: 0 });
      notify(removed ? `已清空 ${removed} 条归档` : '当前没有归档记录', 'success');
    }, event.currentTarget);
  };
}
