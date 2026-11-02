// NodePing 数据层 —— 挂起模型（Pin Model）
// 挂起与逾期任务永不自动清理；归档按保留策略清理。

const LEGACY_STORE_KEY = 'nodeping.tasks.v1';
const INDEX_KEY = 'nodeping.tasks.index.v2';
const CHUNK_PREFIX = 'nodeping.tasks.chunk.';
const SETTINGS_KEY = 'nodeping.settings.v1';
const CHUNK_TARGET_BYTES = 6500;
const DEFAULT_SETTINGS = Object.freeze({ autoCleanup: true, archiveRetentionDays: 90 });
const RETENTION_OPTIONS = new Set([30, 90, 180, 365]);

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
export function daysUntil(dueDate, now = new Date()) {
  if (!dueDate) return null;
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

/* ---------- 同步存储：索引 + 分段，规避单存储项 8KB 限制 ---------- */
function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function wrapStorageError(error) {
  const wrapped = new Error(error?.message || '存储操作失败');
  wrapped.cause = error;
  wrapped.code = /quota|bytes|items/i.test(error?.message || '')
    ? 'QUOTA_EXCEEDED'
    : 'STORAGE_WRITE_FAILED';
  return wrapped;
}

export function storageErrorMessage(error) {
  if (error?.code === 'QUOTA_EXCEEDED') {
    return '同步存储空间不足。请前往管理页的「统计复盘」清理旧归档后重试，当前编辑内容已保留。';
  }
  return '保存失败，当前编辑内容已保留。请检查浏览器同步状态后重试。';
}

function chunkTasks(tasks) {
  const chunks = [];
  let current = [];
  let currentBytes = 2;
  for (const task of tasks) {
    const size = byteLength(task) + (current.length ? 1 : 0);
    if (current.length && currentBytes + size > CHUNK_TARGET_BYTES) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(task);
    currentBytes += byteLength(task) + (current.length > 1 ? 1 : 0);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export async function getTasks() {
  const root = await chrome.storage.sync.get([INDEX_KEY, LEGACY_STORE_KEY]);
  const index = root[INDEX_KEY];
  if (!index || index.version !== 2 || !Array.isArray(index.chunks)) {
    return Array.isArray(root[LEGACY_STORE_KEY]) ? root[LEGACY_STORE_KEY] : [];
  }
  if (!index.chunks.length) return [];
  const keys = index.chunks.map(key => CHUNK_PREFIX + key);
  const stored = await chrome.storage.sync.get(keys);
  return index.chunks.flatMap(key => {
    const chunk = stored[CHUNK_PREFIX + key];
    return Array.isArray(chunk) ? chunk : [];
  });
}

export async function saveTasks(tasks) {
  const chunks = chunkTasks(tasks);
  const names = chunks.map((_, i) => String(i));
  const previous = await chrome.storage.sync.get(INDEX_KEY);
  const oldNames = previous[INDEX_KEY]?.chunks || [];
  const payload = { [INDEX_KEY]: { version: 2, chunks: names, updatedAt: Date.now() } };
  chunks.forEach((chunk, i) => { payload[CHUNK_PREFIX + i] = chunk; });
  try {
    await chrome.storage.sync.set(payload);
  } catch (error) {
    throw wrapStorageError(error);
  }
  // 数据已经提交；旧键清理失败不影响本次保存结果，残留键不会参与读取。
  const stale = oldNames.filter(key => !names.includes(key)).map(key => CHUNK_PREFIX + key);
  try { await chrome.storage.sync.remove([LEGACY_STORE_KEY, ...stale]); } catch { /* 下次保存再清理 */ }
}

export async function getStorageInfo() {
  const tasks = await getTasks();
  let bytes;
  if (typeof chrome.storage.sync.getBytesInUse === 'function') {
    bytes = await chrome.storage.sync.getBytesInUse(null);
  } else {
    bytes = byteLength(await chrome.storage.sync.get(null));
  }
  const quota = chrome.storage.sync.QUOTA_BYTES || 102400;
  return {
    bytes,
    quota,
    usageRatio: quota ? bytes / quota : 0,
    taskCount: tasks.length,
    archivedCount: tasks.filter(t => t.status !== 'hanging').length,
  };
}

/* ---------- 归档保留策略 ---------- */
function validSettings(value = {}) {
  const days = Number(value.archiveRetentionDays);
  return {
    autoCleanup: value.autoCleanup !== false,
    archiveRetentionDays: RETENTION_OPTIONS.has(days) ? days : DEFAULT_SETTINGS.archiveRetentionDays,
  };
}

export async function getSettings() {
  const res = await chrome.storage.sync.get(SETTINGS_KEY);
  return validSettings(res[SETTINGS_KEY]);
}

export async function saveSettings(patch) {
  const settings = validSettings({ ...await getSettings(), ...patch });
  try {
    await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
  } catch (error) {
    throw wrapStorageError(error);
  }
  return settings;
}

function archivedTime(task) {
  return task.archivedAt ?? task.completedAt ?? task.createdAt ?? 0;
}

/** retentionDays=0 表示立即清理全部归档；调用方决定是否执行自动策略。 */
export async function cleanupArchived({ retentionDays, now = new Date() } = {}) {
  const days = retentionDays ?? (await getSettings()).archiveRetentionDays;
  const tasks = await getTasks();
  const cutoff = now.getTime() - Number(days) * 864e5;
  const kept = tasks.filter(task => {
    if (task.status === 'hanging') return true;
    return Number(days) > 0 && archivedTime(task) > cutoff;
  });
  const removed = tasks.length - kept.length;
  if (removed) await saveTasks(kept);
  return removed;
}

export async function runStorageMaintenance() {
  const settings = await getSettings();
  if (!settings.autoCleanup) return 0;
  return cleanupArchived({ retentionDays: settings.archiveRetentionDays });
}

/* ---------- 任务 CRUD ---------- */
export async function addTask({ title, detail = '', project = '', dueDate = null, links = [] }) {
  const tasks = await getTasks();
  const task = {
    id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    title: title.trim(),
    detail: detail.trim(),
    project: project.trim(),
    dueDate,
    links: links.map(l => ({ url: l.url, title: l.title ?? null, fetchedAt: l.fetchedAt ?? null })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'hanging',
    completedAt: null,
    archivedAt: null,
  };
  tasks.push(task);
  await saveTasks(tasks);
  return task;
}

export async function updateTask(id, patch) {
  const tasks = await getTasks();
  const i = tasks.findIndex(t => t.id === id);
  if (i === -1) return null;
  tasks[i] = { ...tasks[i], ...patch, updatedAt: Date.now() };
  await saveTasks(tasks);
  return tasks[i];
}

/** status: 'hanging' | 'done' | 'cancelled' */
export async function setStatus(id, status) {
  const now = Date.now();
  return updateTask(id, {
    status,
    completedAt: status === 'done' ? now : null,
    archivedAt: status === 'hanging' ? null : now,
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
