// NodePing 管理页逻辑：月历总览 + 完整 CRUD + 归档恢复
import {
  getTasks, addTask, updateTask, setStatus, deleteTask,
  todayStr, toDateStr, daysUntil, urgencyOf, sortHanging,
} from '../shared/store.js';
import { escapeHtml, normalizeUrl, domainOf, faviconUrl } from '../shared/ui.js';

const $ = sel => document.querySelector(sel);
const DOW = ['一', '二', '三', '四', '五', '六', '日'];

const state = {
  cursor: new Date(),
  selectedDate: null,
  tasks: [],
  editingId: null,    // null = 新增模式
  pendingLinks: [],   // 弹层中待保存的链接
};

function linkChipHtml(l) {
  const label = l.title || domainOf(l.url);
  return `<a class="r-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(l.url)}"><img src="${faviconUrl(l.url, 16)}" onerror="this.style.display='none'" alt=""><span>${escapeHtml(label)}</span></a>`;
}

async function refresh() {
  state.tasks = await getTasks();
  renderMonth();
  renderLists();
}

/* ============ 月历 ============ */
function renderMonth() {
  const y = state.cursor.getFullYear(), m = state.cursor.getMonth();
  $('#monthTitle').textContent = `${y} 年 ${m + 1} 月`;
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = DOW.map(d => `<div class="mg-dow">${d}</div>`).join('');
  for (let i = lead; i > 0; i--) html += cell(new Date(y, m, 1 - i), true);
  for (let d = 1; d <= daysInMonth; d++) html += cell(new Date(y, m, d), false);
  $('#monthGrid').innerHTML = html;

  $('#monthGrid').querySelectorAll('[data-date]').forEach(el => {
    el.onclick = () => {
      const ds = el.dataset.date;
      state.selectedDate = state.selectedDate === ds ? null : ds;
      renderMonth();
      renderLists();
    };
  });
}

function cell(d, dim) {
  const ds = toDateStr(d);
  const marks = dim ? '' : state.tasks
    .filter(t => t.status === 'hanging' && t.dueDate === ds)
    .map(t => {
      const u = urgencyOf(t);
      const cls = u === 'overdue' || u === 'urgent' ? 'urgent' : u === 'warn' ? 'warn' : '';
      return `<div class="m ${cls}"></div>`;
    }).join('');
  const cls = ['mg-cell'];
  if (dim) cls.push('dim');
  if (ds === todayStr()) cls.push('today');
  if (state.selectedDate === ds) cls.push('selected');
  return `<button class="${cls.join(' ')}" data-date="${ds}">${d.getDate()}<div class="marks">${marks}</div></button>`;
}

/* ============ 任务列表 ============ */
function metaLine(t) {
  const parts = [];
  const d = daysUntil(t.dueDate);
  if (t.dueDate) parts.push(`截止 ${t.dueDate.slice(5).replace('-', '/')}`);
  else parts.push('无期限');
  if (t.status === 'hanging') {
    if (d !== null && d < 0) parts.push(`<span class="ov">逾期 ${-d} 天</span>`);
    else if (d === 0) parts.push('<span class="ov">今天截止</span>');
    else if (d !== null) parts.push(`${d} 天后`);
  } else if (t.status === 'done' && t.completedAt) {
    parts.push(`完成于 ${toDateStr(new Date(t.completedAt)).slice(5).replace('-', '/')}`);
  } else if (t.status === 'cancelled') {
    parts.push('已取消');
  }
  if (t.project) parts.push(`<span class="tag">${escapeHtml(t.project)}</span>`);
  return parts.join(' · ');
}

function hangRow(t) {
  const overdue = urgencyOf(t) === 'overdue';
  return `<div class="row ${overdue ? 'overdue' : ''}" data-id="${t.id}">
    <div class="r-main">
      <div class="r-title">${escapeHtml(t.title)}</div>
      <div class="r-meta">${metaLine(t)}</div>
      ${(t.links || []).length ? `<div class="r-links">${t.links.map(linkChipHtml).join('')}</div>` : ''}
    </div>
    <div class="r-act">
      <button class="ok" data-act="done">完成</button>
      <button data-act="edit">编辑</button>
      <button class="danger" data-act="cancel">取消</button>
    </div>
  </div>`;
}

function archRow(t) {
  return `<div class="row arch ${t.status === 'cancelled' ? 'cancelled' : ''}" data-id="${t.id}">
    <div class="r-main">
      <div class="r-title">${escapeHtml(t.title)}</div>
      <div class="r-meta">${metaLine(t)}</div>
      ${(t.links || []).length ? `<div class="r-links">${t.links.map(linkChipHtml).join('')}</div>` : ''}
    </div>
    <div class="r-act">
      <button class="ok" data-act="restore">恢复</button>
      <button class="danger" data-act="delete">删除</button>
    </div>
  </div>`;
}

function renderLists() {
  let hanging = sortHanging(state.tasks.filter(t => t.status === 'hanging'));
  if (state.selectedDate) {
    hanging = hanging.filter(t => t.dueDate === state.selectedDate || urgencyOf(t) === 'overdue');
  }
  const allHanging = state.tasks.filter(t => t.status === 'hanging');
  const archived = state.tasks
    .filter(t => t.status !== 'hanging')
    .sort((a, b) => (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt));

  $('#hangCount').textContent = allHanging.length;
  $('#archCount').textContent = archived.length;
  $('#hangList').innerHTML = hanging.map(hangRow).join('');
  $('#archList').innerHTML = archived.map(archRow).join('');
  $('#hangEmpty').classList.toggle('hidden', hanging.length > 0);
  $('#archEmpty').classList.toggle('hidden', archived.length > 0);

  $('#hangList').querySelectorAll('.row').forEach(row => bindRow(row));
  $('#archList').querySelectorAll('.row').forEach(row => bindRow(row));
}

function bindRow(row) {
  const id = row.dataset.id;
  row.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = async () => {
      const act = btn.dataset.act;
      if (act === 'done') await setStatus(id, 'done');
      else if (act === 'cancel') await setStatus(id, 'cancelled');
      else if (act === 'restore') await setStatus(id, 'hanging');
      else if (act === 'delete') {
        if (confirm('彻底删除这条节点记录？')) await deleteTask(id);
      }
      else if (act === 'edit') { openModal(id); return; }
      await refresh();
    };
  });
}

/* ============ 编辑 / 新增弹层 ============ */
function renderPendingLinks() {
  $('#fLinks').innerHTML = state.pendingLinks.map((l, i) =>
    `<span class="f-link-chip"><span>${escapeHtml(l.title || domainOf(l.url))}</span><button data-i="${i}" title="移除">×</button></span>`
  ).join('');
  $('#fLinks').querySelectorAll('button').forEach(btn => {
    btn.onclick = () => { state.pendingLinks.splice(Number(btn.dataset.i), 1); renderPendingLinks(); };
  });
}

/** 首次添加链接时申请跨域抓取权限（用于获取链接标题）；拒绝不阻塞添加 */
async function ensureHostPermission() {
  try {
    const origins = ['http://*/*', 'https://*/*'];
    if (await chrome.permissions.contains({ origins })) return true;
    return await chrome.permissions.request({ origins });
  } catch { return false; }
}

async function addPendingLink() {
  const url = normalizeUrl($('#fLinkInput').value);
  if (!url) { $('#fLinkInput').focus(); return; }
  if (state.pendingLinks.some(l => l.url === url)) { $('#fLinkInput').value = ''; return; }
  state.pendingLinks.push({ url, title: null, fetchedAt: null });
  $('#fLinkInput').value = '';
  renderPendingLinks();
  ensureHostPermission(); // 用户手势内触发权限申请，不 await
}

function openModal(id = null) {
  state.editingId = id;
  const t = id ? state.tasks.find(x => x.id === id) : null;
  state.pendingLinks = t ? (t.links || []).map(l => ({ ...l })) : [];
  renderPendingLinks();
  $('#modalTitle').textContent = t ? '编辑节点' : '新增节点';
  $('#fTitle').value = t ? t.title : '';
  $('#fDate').value = t && t.dueDate ? t.dueDate : '';
  $('#fProj').value = t ? t.project : '';
  $('#fDetail').value = t ? t.detail : '';
  $('#fLinkInput').value = '';
  $('#modalMask').classList.remove('hidden');
  setTimeout(() => $('#fTitle').focus(), 60);
}

function closeModal() {
  state.editingId = null;
  state.pendingLinks = [];
  $('#modalMask').classList.add('hidden');
}

async function saveModal() {
  const title = $('#fTitle').value.trim();
  if (!title) { $('#fTitle').focus(); return; }
  // 输入框里残留未确认的 URL 也一并收纳
  const leftover = normalizeUrl($('#fLinkInput').value);
  if (leftover && !state.pendingLinks.some(l => l.url === leftover)) {
    state.pendingLinks.push({ url: leftover, title: null, fetchedAt: null });
  }
  const patch = {
    title,
    detail: $('#fDetail').value.trim(),
    project: $('#fProj').value.trim(),
    dueDate: $('#fDate').value || null,
    links: state.pendingLinks,
  };
  if (state.editingId) await updateTask(state.editingId, patch);
  else await addTask(patch);
  closeModal();
  await refresh();
}

/* ============ 事件绑定 ============ */
$('#mPrev').onclick = () => { state.cursor.setMonth(state.cursor.getMonth() - 1); renderMonth(); };
$('#mNext').onclick = () => { state.cursor.setMonth(state.cursor.getMonth() + 1); renderMonth(); };
$('#mToday').onclick = () => { state.cursor = new Date(); state.selectedDate = todayStr(); renderMonth(); renderLists(); };

$('#newTaskBtn').onclick = () => openModal(null);
$('#fSave').onclick = saveModal;
$('#fCancel').onclick = closeModal;
$('#fClearDate').onclick = () => { $('#fDate').value = ''; };
$('#fLinkAdd').onclick = addPendingLink;
$('#fLinkInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addPendingLink(); }
});
$('#modalMask').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') refresh();
});

refresh();
