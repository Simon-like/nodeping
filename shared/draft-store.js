// 草稿使用本机存储：长文不占任务 Chrome Sync 配额，自动保存不受同步频率限制。
const DRAFT_KEY = 'nodeping.draft.v1';
const EMPTY_DRAFT = Object.freeze({ text: '', updatedAt: null });

function wrapError(error) {
  const wrapped = new Error(error?.message || '草稿写入失败');
  wrapped.code = 'DRAFT_WRITE_FAILED';
  wrapped.cause = error;
  return wrapped;
}

export function draftErrorMessage(error) {
  if (error?.code === 'DRAFT_WRITE_FAILED') return '草稿保存失败，文本仍保留在编辑器中。请检查本机可用空间后重试。';
  return '草稿暂时不可用，请稍后重试。';
}

export async function getDraft() {
  const result = await chrome.storage.local.get(DRAFT_KEY);
  const draft = result[DRAFT_KEY];
  if (!draft || typeof draft.text !== 'string') return { ...EMPTY_DRAFT };
  return { text: draft.text, updatedAt: typeof draft.updatedAt === 'number' ? draft.updatedAt : null };
}

export async function saveDraft(text) {
  const draft = { text: String(text ?? ''), updatedAt: Date.now() };
  try {
    await chrome.storage.local.set({ [DRAFT_KEY]: draft });
  } catch (error) {
    throw wrapError(error);
  }
  return draft;
}

export async function clearDraft() {
  try {
    await chrome.storage.local.remove(DRAFT_KEY);
  } catch (error) {
    throw wrapError(error);
  }
}

export async function getDraftStorageInfo() {
  const bytes = await chrome.storage.local.getBytesInUse(DRAFT_KEY);
  const quota = chrome.storage.local.QUOTA_BYTES || 10 * 1024 * 1024;
  return { bytes, quota, usageRatio: quota ? bytes / quota : 0 };
}
