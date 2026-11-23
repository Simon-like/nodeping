// Popup Markdown 草稿控制器：延迟自动保存，显式操作立即落盘。
import { renderMarkdown, toggleBold, continueList } from '../shared/markdown.js';
import { getDraft, saveDraft, clearDraft, getDraftStorageInfo, draftErrorMessage } from '../shared/draft-store.js';

const $ = selector => document.querySelector(selector);
const AUTOSAVE_DELAY = 600;
let loaded = false;
let dirty = false;
let saveTimer = null;
let saveVersion = 0;

function timeLabel(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function status(text, type = '') {
  const el = $('#draftSaveStatus');
  el.textContent = text;
  el.className = `draft-save-status ${type}`;
}

function updateMeta() {
  $('#draftCount').textContent = `${$('#draftEditor').value.length} 字`;
}

async function updateStorageMeta() {
  try {
    const info = await getDraftStorageInfo();
    const kb = info.bytes / 1024;
    $('#draftStorage').textContent = `本机 ${kb < 1 ? Math.max(1, Math.round(info.bytes)) + ' B' : kb.toFixed(1) + ' KB'} · 不占同步空间`;
  } catch {
    $('#draftStorage').textContent = '本机存储 · 不占同步空间';
  }
}

function showError(message = '') {
  $('#draftError').textContent = message;
  $('#draftError').classList.toggle('hidden', !message);
}

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty || !loaded) return true;
  const version = ++saveVersion;
  const text = $('#draftEditor').value;
  status('保存中…', 'saving');
  showError();
  try {
    const saved = await saveDraft(text);
    if (version === saveVersion) {
      dirty = false;
      status(`已保存 ${timeLabel(saved.updatedAt)}`);
    } else {
      status('有未保存修改');
    }
    updateStorageMeta();
    return true;
  } catch (error) {
    status('保存失败', 'error');
    showError(draftErrorMessage(error));
    return false;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, AUTOSAVE_DELAY);
}

function applyChange(change) {
  const editor = $('#draftEditor');
  editor.value = change.text;
  editor.setSelectionRange(change.start, change.end);
  editor.focus();
  onInput();
}

function onInput() {
  dirty = true;
  updateMeta();
  status('编辑中…');
  scheduleSave();
}

function renderPreview() {
  $('#draftPreview').innerHTML = renderMarkdown($('#draftEditor').value);
}

async function setMode(mode) {
  if (mode === 'preview') {
    await saveNow();
    renderPreview();
  }
  $('#draftEditor').classList.toggle('hidden', mode !== 'edit');
  $('#draftPreview').classList.toggle('hidden', mode !== 'preview');
  $('#draftMode').querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  if (mode === 'edit') $('#draftEditor').focus();
}

export async function openDraft() {
  if (loaded) { updateMeta(); updateStorageMeta(); return; }
  status('读取中…');
  try {
    const draft = await getDraft();
    $('#draftEditor').value = draft.text;
    loaded = true;
    dirty = false;
    updateMeta();
    status(draft.updatedAt ? `已保存 ${timeLabel(draft.updatedAt)}` : '本机自动保存');
    updateStorageMeta();
  } catch (error) {
    status('读取失败', 'error');
    showError(draftErrorMessage(error));
  }
}

export function initDraft() {
  const editor = $('#draftEditor');
  editor.addEventListener('input', onInput);
  editor.addEventListener('blur', saveNow);
  editor.addEventListener('keydown', event => {
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      applyChange(toggleBold(editor.value, editor.selectionStart, editor.selectionEnd));
      return;
    }
    if (command && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveNow();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      const change = continueList(editor.value, editor.selectionStart);
      if (change.handled) { event.preventDefault(); applyChange(change); }
    }
  });

  $('#draftMode').querySelectorAll('button').forEach(button => { button.onclick = () => setMode(button.dataset.mode); });
  $('#draftSave').onclick = saveNow;
  $('#draftClear').onclick = async () => {
    if (!editor.value || !confirm('清空整篇草稿？此操作无法撤销。')) return;
    clearTimeout(saveTimer);
    try {
      await clearDraft();
      editor.value = '';
      dirty = false;
      loaded = true;
      updateMeta();
      renderPreview();
      updateStorageMeta();
      status('已清空');
      showError();
      editor.focus();
    } catch (error) { showError(draftErrorMessage(error)); }
  };
  window.addEventListener('pagehide', () => { if (dirty && loaded) saveDraft(editor.value); });
}
