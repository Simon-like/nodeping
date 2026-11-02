// NodePing 复盘统计：仅根据当前任务快照计算，不补造历史事件。
import { daysUntil, toDateStr } from './store.js';

const DAY = 864e5;

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function archiveTime(task) {
  if (task.status === 'done') return task.completedAt ?? task.archivedAt ?? task.createdAt;
  return task.archivedAt ?? task.completedAt ?? task.createdAt;
}

function percent(part, total) {
  return total ? Math.round(part / total * 100) : null;
}

export function buildStats(tasks, now = new Date()) {
  const hanging = tasks.filter(t => t.status === 'hanging');
  const archived = tasks.filter(t => t.status !== 'hanging');
  const cutoff30 = now.getTime() - 30 * DAY;
  const recentArchived = archived.filter(t => {
    const time = archiveTime(t);
    return typeof time === 'number' && time >= cutoff30 && time <= now.getTime();
  });
  const done30 = recentArchived.filter(t => t.status === 'done');
  const datedDone = done30.filter(t => t.dueDate);
  const onTime = datedDone.filter(t => toDateStr(new Date(archiveTime(t))) <= t.dueDate);

  const summary = {
    hanging: hanging.length,
    overdue: hanging.filter(t => daysUntil(t.dueDate, now) < 0).length,
    dueNext7: hanging.filter(t => {
      const days = daysUntil(t.dueDate, now);
      return days !== null && days >= 0 && days <= 7;
    }).length,
    done30: done30.length,
    completionRate30: percent(done30.length, recentArchived.length),
    onTimeRate30: percent(onTime.length, datedDone.length),
    archived: archived.length,
  };

  const currentMonday = mondayOf(now);
  const weekly = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(currentMonday);
    start.setDate(start.getDate() - (7 - index) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const inWeek = archived.filter(t => {
      const time = archiveTime(t);
      return time >= start.getTime() && time < end.getTime();
    });
    return {
      start: toDateStr(start),
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      done: inWeek.filter(t => t.status === 'done').length,
      cancelled: inWeek.filter(t => t.status === 'cancelled').length,
    };
  });

  const projectMap = new Map();
  for (const task of [...hanging, ...done30]) {
    const name = task.project?.trim() || '未命名项目';
    const item = projectMap.get(name) || { name, hanging: 0, done30: 0 };
    if (task.status === 'hanging') item.hanging++;
    else item.done30++;
    projectMap.set(name, item);
  }
  const projects = [...projectMap.values()]
    .sort((a, b) => (b.hanging + b.done30) - (a.hanging + a.done30) || b.hanging - a.hanging || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, 5);

  const insights = [];
  if (!tasks.length) {
    insights.push('还没有可复盘的数据。先挂起一个关键节点，完成后再回来看看。');
  } else {
    if (summary.overdue) insights.push(`${summary.overdue} 个节点已逾期，建议先改期或处理最旧的一项，避免提醒长期失效。`);
    if (summary.done30 && summary.onTimeRate30 !== null) {
      insights.push(`近 30 天完成 ${summary.done30} 个节点，其中 ${summary.onTimeRate30}% 按期完成。`);
    } else if (!summary.done30) {
      insights.push('近 30 天还没有完成记录，本周可以先收掉一个最小、最确定的节点。');
    }
    if (projects[0]) insights.push(`「${projects[0].name}」是当前最集中的项目，挂起 ${projects[0].hanging} 个、近 30 天完成 ${projects[0].done30} 个。`);
  }

  return { summary, weekly, projects, insights };
}
