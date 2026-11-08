// NodePing Popup 逻辑
import {
  getTasks, addTask, updateTask, setStatus,
  todayStr, toDateStr, daysUntil, urgencyOf, sortHanging,
  getStorageInfo, storageErrorMessage,
} from '../shared/store.js';
import { escapeHtml, renderTextWithLinks, normalizeUrl, domainOf, faviconUrl } from '../shared/ui.js';
import { createDatePicker } from '../shared/date-picker.js';

const $ = sel => document.querySelector(sel);
const datePicker = createDatePicker($('#edDatePicker'), { compact: true, inline: true });

function showEditorError(message = '') {
  $('#edError').textContent = message;
  $('#edError').classList.toggle('hidden', !message);
}

const state = {
  view: 'week',          // day | week | month
  cursor: new Date(),    // 日历游标（日=当天，周=本周，月=当月）
  filterDate: null,      // 点击日历某天后的筛选
  tasks: [],
  editingId: null,       // 编辑器处于编辑态时为任务 id，新增态为 null
  pendingLinks: [],      // 编辑器中待保存的链接 [{url,title,fetchedAt}]
};

/* ============ 渲染入口 ============ */
async function refresh() {
  try {
    state.tasks = await getTasks();
    renderCalendar();
    renderList();
    const info = await getStorageInfo();
    const warning = info.usageRatio >= .85;
    $('#storageNotice').classList.toggle('hidden', !warning);
    if (warning) $('#storageNotice').textContent = `同步存储已使用 ${Math.round(info.usageRatio * 100)}%，点击前往管理页清理旧归档。`;
  } catch (error) {
    $('#storageNotice').textContent = storageErrorMessage(error);
    $('#storageNotice').classList.remove('hidden');
  }
}

/* ============ 日历三视图 ============ */
const DOW = ['一', '二', '三', '四', '五', '六', '日'];

function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 周一=0
  x.setDate(x.getDate() - dow);
  return x;
}

function marksFor(dateStr) {
  return state.tasks
    .filter(t => t.status === 'hanging' && t.dueDate === dateStr)
    .map(t => {
      const u = urgencyOf(t);
      const cls = u === 'overdue' || u === 'urgent' ? 'urgent' : u === 'warn' ? 'warn' : '';
      return `<div class="m ${cls}"></div>`;
    }).join('');
}

function dayCell(d, opts = {}) {
  const ds = toDateStr(d);
  const today = ds === todayStr();
  const selected = state.filterDate === ds;
  const cls = ['day-cell'];
  if (today) cls.push('today');
  if (selected) cls.push('selected');
  if (opts.dim) cls.push('dim');
  return `<button class="${cls.join(' ')}" data-date="${ds}">
    <div class="dow">${DOW[(d.getDay() + 6) % 7]}</div>
    <div class="num">${d.getDate()}</div>
    <div class="marks">${marksFor(ds)}</div>
  </button>`;
}

function renderCalendar() {
  const area = $('#calArea');
  if (state.view === 'week') {
    const mon = mondayOf(state.cursor);
    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      cells += dayCell(d);
    }
    area.innerHTML = `<div class="week-row">${cells}</div>`;
  } else if (state.view === 'day') {
    const d = state.cursor;
    const ds = toDateStr(d);
    const n = state.tasks.filter(t => t.status === 'hanging' && t.dueDate === ds).length;
    const label = ds === todayStr() ? '今天' : `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
    area.innerHTML = `<div class="day-view">
      <div class="dv-nav">
        <button class="dv-btn" id="dvPrev">‹</button>
        <div class="dv-date">${label}</div>
        <button class="dv-btn" id="dvNext">›</button>
      </div>
      <div class="dv-sub">周${DOW[(d.getDay() + 6) % 7]} · 当日 ${n} 个节点到期</div>
    </div>`;
    $('#dvPrev').onclick = () => { state.cursor.setDate(state.cursor.getDate() - 1); renderCalendar(); };
    $('#dvNext').onclick = () => { state.cursor.setDate(state.cursor.getDate() + 1); renderCalendar(); };
    // 日视图默认筛选到游标日
    state.filterDate = ds;
    renderFilterChip();
    renderList();
  } else {
    const y = state.cursor.getFullYear(), m = state.cursor.getMonth();
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let grid = DOW.map(d => `<div class="mm-dow">${d}</div>`).join('');
    for (let i = lead; i > 0; i--) {
      const d = new Date(y, m, 1 - i);
      grid += miniCell(d, true);
    }
    for (let d = 1; d <= daysInMonth; d++) grid += miniCell(new Date(y, m, d), false);
    area.innerHTML = `<div class="month-mini">
      <div class="mm-head">
        <div class="mm-title">${y} 年 ${m + 1} 月</div>
        <div class="mm-nav"><button id="mmPrev">‹</button><button id="mmNext">›</button></div>
      </div>
      <div class="mm-grid">${grid}</div>
    </div>`;
    $('#mmPrev').onclick = () => { state.cursor.setMonth(state.cursor.getMonth() - 1); renderCalendar(); };
    $('#mmNext').onclick = () => { state.cursor.setMonth(state.cursor.getMonth() + 1); renderCalendar(); };
  }

  area.querySelectorAll('[data-date]').forEach(el => {
    el.onclick = () => {
      const ds = el.dataset.date;
      state.filterDate = state.filterDate === ds ? null : ds;
      renderCalendar();
      renderFilterChip();
      renderList();
    };
  });
}

function miniCell(d, dim) {
  const ds = toDateStr(d);
  const cls = ['mm-cell'];
  if (dim) cls.push('dim');
  if (ds === todayStr()) cls.push('today');
  if (state.filterDate === ds) cls.push('selected');
  return `<button class="${cls.join(' ')}" data-date="${ds}">${d.getDate()}<div class="marks">${dim ? '' : marksFor(ds)}</div></button>`;
}

function renderFilterChip() {
  const chip = $('#filterChip');
  if (state.filterDate) {
    chip.classList.remove('hidden');
    $('#filterText').textContent = `只看 ${state.filterDate.slice(5).replace('-', '/')} 到期`;
  } else {
    chip.classList.add('hidden');
  }
}

/* ============ 挂起列表 ============ */
function countdownHtml(task) {
  const d = daysUntil(task.dueDate);
  const u = urgencyOf(task);
  if (d === null) return `<div class="countdown cd-none"><div class="cd-num">∞</div><div class="cd-label">无期限</div></div>`;
  if (d < 0) return `<div class="countdown cd-over"><div class="cd-num">逾期 ${-d} 天</div><div class="cd-label">${task.dueDate.slice(5).replace('-', '/')} 截止</div></div>`;
  if (d === 0) return `<div class="countdown cd-urgent"><div class="cd-num">今天</div><div class="cd-label">截止</div></div>`;
  const cls = u === 'urgent' ? 'cd-urgent' : u === 'warn' ? 'cd-warn' : 'cd-calm';
  return `<div class="countdown ${cls}"><div class="cd-num">${d}</div><div class="cd-label">天后</div></div>`;
}

function linkChip(l) {
  const label = l.title || domainOf(l.url);
  return `<a class="t-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(l.url)}"><img src="${faviconUrl(l.url, 16)}" onerror="this.style.display='none'" alt=""><span>${escapeHtml(label)}</span></a>`;
}

function taskCard(task) {
  const overdue = urgencyOf(task) === 'overdue';
  return `<div class="task ${overdue ? 'overdue' : ''}" data-id="${task.id}">
    <button class="check" title="完成"></button>
    <div class="t-body" title="点击编辑">
      <div class="t-title">${escapeHtml(task.title)}</div>
      ${task.detail ? `<div class="t-desc">${renderTextWithLinks(task.detail)}</div>` : ''}
      ${task.project ? `<span class="t-proj">${escapeHtml(task.project)}</span>` : ''}
      ${(task.links || []).length ? `<div class="t-links">${task.links.map(linkChip).join('')}</div>` : ''}
    </div>
    ${countdownHtml(task)}
  </div>`;
}

function renderList() {
  let hanging = sortHanging(state.tasks.filter(t => t.status === 'hanging'));
  if (state.filterDate) {
    hanging = hanging.filter(t => t.dueDate === state.filterDate || (daysUntil(t.dueDate) !== null && daysUntil(t.dueDate) < 0));
    // 筛选视图下仍保留逾期钉顶——逾期任务永远可见
  }
  const all = state.tasks.filter(t => t.status === 'hanging');
  $('#hangCount').textContent = all.length;
  const list = $('#taskList');
  list.innerHTML = hanging.map(taskCard).join('');
  $('#emptyState').classList.toggle('hidden', hanging.length > 0);
  updateScrollHint();

  list.querySelectorAll('.task').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.check').onclick = async () => {
      const btn = card.querySelector('.check');
      btn.classList.add('on');
      card.classList.add('poof');
      try {
        await setStatus(id, 'done');
        setTimeout(refresh, 380);
      } catch (error) {
        btn.classList.remove('on');
        card.classList.remove('poof');
        $('#storageNotice').textContent = storageErrorMessage(error);
        $('#storageNotice').classList.remove('hidden');
      }
    };
    // 点击卡片主体 → 进入编辑态；卡片内的链接点击不下发编辑
    card.querySelector('.t-body').onclick = () => {
      const task = state.tasks.find(t => t.id === id);
      if (task) openEditorFor(task);
    };
    card.querySelectorAll('.t-body a').forEach(a => {
      a.onclick = e => e.stopPropagation();
    });
  });
}

/* 滚动提示：内容超出时给容器加 .scrollable（底部渐隐 + “还有 N 条”胶囊），滚到底部时消失 */
function updateScrollHint() {
  const list = $('#taskList');
  const wrap = $('#listWrap');
  const scrollable = list.scrollHeight > list.clientHeight + 1;
  wrap.classList.toggle('scrollable', scrollable);
  const atBottom = !scrollable || list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
  wrap.classList.toggle('at-bottom', atBottom);
  if (scrollable && !atBottom) {
    const bottomEdge = list.scrollTop + list.clientHeight;
    let remaining = 0;
    list.querySelectorAll('.task').forEach(c => {
      if (c.offsetTop + c.offsetHeight > bottomEdge + 2) remaining++;
    });
    $('#moreCount').textContent = remaining;
  }
}
$('#taskList').addEventListener('scroll', updateScrollHint);
$('#moreHint').addEventListener('click', () => {
  const list = $('#taskList');
  list.scrollBy({ top: list.clientHeight * 0.8, behavior: 'smooth' });
});

/* ============ 编辑器 ============ */
const editor = $('#editor');

function openEditor() {
  resetEditor();
  editor.classList.add('open');
  $('.popup').classList.add('editor-open');
  setTimeout(() => $('#edTitle').focus(), 200);
}

/** 编辑态：预填任务数据 */
function openEditorFor(task) {
  state.editingId = task.id;
  state.pendingLinks = (task.links || []).map(l => ({ ...l }));
  renderPendingLinks();
  $('#edTitle').value = task.title;
  $('#edDetail').value = task.detail || '';
  $('#edProj').value = task.project || '';
  datePicker.setValue(task.dueDate || null);
  $('#edLinkInput').value = '';
  showEditorError();
  $('#edSave').textContent = '保存';
  editor.classList.add('open');
  $('.popup').classList.add('editor-open');
  setTimeout(() => $('#edTitle').focus(), 200);
}
function closeEditor() {
  datePicker.close();
  editor.classList.remove('open');
  $('.popup').classList.remove('editor-open');
}
function resetEditor() {
  state.editingId = null;
  state.pendingLinks = [];
  renderPendingLinks();
  $('#edSave').textContent = '挂起它';
  $('#edTitle').value = ''; $('#edDetail').value = '';
  $('#edProj').value = ''; $('#edLinkInput').value = '';
  datePicker.setValue(null);
  showEditorError();
}

/* ---- 链接管理 ---- */
function renderPendingLinks() {
  $('#edLinks').innerHTML = state.pendingLinks.map((l, i) =>
    `<span class="ed-link-chip"><span>${escapeHtml(l.title || domainOf(l.url))}</span><button data-i="${i}" title="移除">×</button></span>`
  ).join('');
  $('#edLinks').querySelectorAll('button').forEach(btn => {
    btn.onclick = () => { state.pendingLinks.splice(Number(btn.dataset.i), 1); renderPendingLinks(); };
  });
}

/** 首次添加链接时申请跨域抓取权限（用于获取链接标题）；拒绝不阻塞添加，标题兜底为域名 */
async function ensureHostPermission() {
  try {
    const origins = ['http://*/*', 'https://*/*'];
    if (await chrome.permissions.contains({ origins })) return true;
    return await chrome.permissions.request({ origins });
  } catch { return false; }
}

async function addPendingLink() {
  const url = normalizeUrl($('#edLinkInput').value);
  if (!url) { $('#edLinkInput').focus(); return; }
  if (state.pendingLinks.some(l => l.url === url)) { $('#edLinkInput').value = ''; return; }
  state.pendingLinks.push({ url, title: null, fetchedAt: null });
  $('#edLinkInput').value = '';
  renderPendingLinks();
  ensureHostPermission(); // 用户手势内触发权限申请，不 await
}

async function saveFromEditor() {
  const title = $('#edTitle').value.trim();
  if (!title) { $('#edTitle').focus(); return; }
  const leftover = normalizeUrl($('#edLinkInput').value);
  if (leftover && !state.pendingLinks.some(l => l.url === leftover)) {
    state.pendingLinks.push({ url: leftover, title: null, fetchedAt: null });
  }
  const payload = {
    title,
    detail: $('#edDetail').value,
    project: $('#edProj').value,
    dueDate: datePicker.getValue(),
    links: state.pendingLinks,
  };
  const saveButton = $('#edSave');
  saveButton.disabled = true;
  saveButton.textContent = '保存中…';
  showEditorError();
  try {
    if (state.editingId) await updateTask(state.editingId, payload);
    else await addTask(payload);
    resetEditor();
    closeEditor();
    await refresh();
  } catch (error) {
    showEditorError(storageErrorMessage(error));
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = state.editingId ? '保存' : '挂起它';
  }
}

/* ============ 事件绑定 ============ */
$('#openEditor').onclick = openEditor;
$('#edCancel').onclick = () => { resetEditor(); closeEditor(); };
$('#edSave').onclick = saveFromEditor;
$('#edTitle').addEventListener('keydown', e => { if (e.key === 'Enter') saveFromEditor(); });
$('#edLinkAdd').onclick = addPendingLink;
$('#edLinkInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addPendingLink(); }
});

const openOptions = () => chrome.runtime.openOptionsPage();
$('#openOptions').onclick = openOptions;
$('#gotoOptions').onclick = openOptions;
$('#storageNotice').onclick = openOptions;

$('#viewTabs').querySelectorAll('button').forEach(btn => {
  btn.onclick = () => {
    state.view = btn.dataset.view;
    if (state.view !== 'day') state.filterDate = null;
    $('#viewTabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    renderCalendar();
    renderFilterChip();
    renderList();
  };
});

$('#filterClear').onclick = () => {
  state.filterDate = null;
  renderCalendar();
  renderFilterChip();
  renderList();
};

// 其他页面（管理页）改动后，popup 打开状态下实时同步
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') refresh();
});

refresh();
