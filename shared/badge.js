import { badgeInfo } from './store.js';

/** 同步工具栏徽标；弹框与后台共用，避免后台休眠后徽标残留或消失。 */
export async function syncActionBadge(tasks) {
  const { count, hasOverdue } = badgeInfo(tasks);
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({
    color: hasOverdue ? '#ef4444' : '#3b82f6',
  });
}
