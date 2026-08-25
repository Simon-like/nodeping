// NodePing 数据层 —— 挂起模型（Pin Model）
// 任务从创建起常驻「挂起中」，只有完成/取消才会退出；逾期不消失。

const STORE_KEY = 'nodeping.tasks.v1';

/* ---------- 日期工具 ---------- */
export function todayStr() {
  return toDateStr(new Date());
}

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 距今天数：负数 = 已逾期 */
export function daysUntil(dueDate) {
  if (!dueDate) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseDate(dueDate) - today) / 864e5);
}

/** 紧急度：overdue | urgent(<3天) | warn(3-7天) | calm(>7天) | none(无日期) */
export function urgencyOf(task) {
  const d = daysUntil(task.dueDate);
  if (d === null) return 'none';
  if (d < 0) return 'overdue';
  if (d < 3) return 'urgent';
  if (d <= 7) return 'warn';
  return 'calm';
}

const URGENCY_RANK = { overdue: 0, urgent: 1, warn: 2, calm: 3, none: 4 };

/** 挂起列表排序：逾期钉顶（最逾期在前）→ 紧急度 → 截止日升序 → 创建早的在前 */
export function sortHanging(tasks) {
  return tasks.slice().sort((a, b) => {
    const ra = URGENCY_RANK[urgencyOf(a)], rb = URGENCY_RANK[urgencyOf(b)];
    if (ra !== rb) return ra - rb;
    const da = daysUntil(a.dueDate), db = daysUntil(b.dueDate);
    if (da !== null && db !== null && da !== db) return da - db;
    return a.createdAt - b.createdAt;
  });
}

/* ---------- 存储 ---------- */
export async function getTasks() {
  const res = await chrome.storage.sync.get(STORE_KEY);
  return res[STORE_KEY] || [];
}

export async function saveTasks(tasks) {
  await chrome.storage.sync.set({ [STORE_KEY]: tasks });
}

export async function addTask({ title, detail = '', project = '', dueDate = null, links = [] }) {
  const tasks = await getTasks();
  const task = {
    id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    title: title.trim(),
    detail: detail.trim(),
    project: project.trim(),
    dueDate,
    // links: [{ url, title: string|null, fetchedAt: number|null }]
    // fetchedAt 为 null 表示尚未尝试抓取标题，由 Service Worker 补抓
    links: links.map(l => ({ url: l.url, title: l.title ?? null, fetchedAt: l.fetchedAt ?? null })),
    createdAt: Date.now(),
    status: 'hanging',
    completedAt: null,
  };
  tasks.push(task);
  await saveTasks(tasks);
  return task;
}

export async function updateTask(id, patch) {
  const tasks = await getTasks();
  const i = tasks.findIndex(t => t.id === id);
  if (i === -1) return null;
  tasks[i] = { ...tasks[i], ...patch };
  await saveTasks(tasks);
  return tasks[i];
}

/** status: 'hanging' | 'done' | 'cancelled' */
export async function setStatus(id, status) {
  return updateTask(id, {
    status,
    completedAt: status === 'done' ? Date.now() : null,
  });
}

export async function deleteTask(id) {
  const tasks = await getTasks();
  await saveTasks(tasks.filter(t => t.id !== id));
}

/** 角标语义：挂起总数；存在逾期 → 红色 */
export function badgeInfo(tasks) {
  const hanging = tasks.filter(t => t.status === 'hanging');
  return {
    count: hanging.length,
    hasOverdue: hanging.some(t => urgencyOf(t) === 'overdue'),
  };
}
