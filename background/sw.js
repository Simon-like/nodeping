// NodePing Service Worker：角标维护 + 每日刷新 + 链接标题抓取
import { getTasks, saveTasks, badgeInfo, runStorageMaintenance } from '../shared/store.js';

const DAILY_ALARM = 'nodeping-daily-refresh';

/* ============ 角标 ============ */
async function updateBadge() {
  try {
    const tasks = await getTasks();
    const { count, hasOverdue } = badgeInfo(tasks);
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    await chrome.action.setBadgeBackgroundColor({
      color: hasOverdue ? '#ef4444' : '#3b82f6',
    });
  } catch (e) {
    // 存储读取失败时静默，避免 SW 崩溃
  }
}

async function ensureDailyAlarm() {
  const existing = await chrome.alarms.get(DAILY_ALARM);
  if (!existing) {
    chrome.alarms.create(DAILY_ALARM, { periodInMinutes: 60 });
  }
}

/* ============ 链接标题抓取（飞书式预览的核心） ============
   普通网页受 CORS 限制无法抓第三方页面，但扩展声明 host 权限后
   可在 SW 里跨域 fetch，自行解析 <title> / Open Graph 元标签。
   抓取结果写回任务 links[].title，fetchedAt 非空即不再重试。 */

let scanning = false;
let scanTimer = null;

function scheduleLinkScan() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(scanLinkTitles, 600); // 防抖：连续编辑合并为一次扫描
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/** 从 HTML 中提取标题：优先 og:title，回退 <title>。SW 无 DOMParser，用正则。 */
function extractTitle(html) {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  if (og && og[1].trim()) return decodeEntities(og[1]);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t && t[1].trim()) return decodeEntities(t[1]);
  return null;
}

async function fetchTitle(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      credentials: 'include', // 内网系统常靠 cookie 鉴权，带上提高命中率
      redirect: 'follow',
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('text/html')) return null;
    const html = await res.text();
    return extractTitle(html.slice(0, 200_000)); // 元标签都在头部，截断防爆内存
  } catch {
    return null; // 网络失败/非 HTML/超时 → 调用方兜底为域名
  } finally {
    clearTimeout(timer);
  }
}

async function scanLinkTitles() {
  if (scanning) return;
  scanning = true;
  try {
    const tasks = await getTasks();
    const pending = [];
    for (const task of tasks) {
      for (const link of task.links || []) {
        if (link.fetchedAt == null) pending.push({ task, link });
      }
    }
    if (!pending.length) return;

    // 并发上限 3，逐批抓取
    for (let i = 0; i < pending.length; i += 3) {
      await Promise.all(pending.slice(i, i + 3).map(async ({ link }) => {
        link.title = await fetchTitle(link.url);
        link.fetchedAt = Date.now(); // 无论成败都标记，失败时 title 为 null → 前端兜底显示域名
      }));
    }
    await saveTasks(tasks);
  } catch (e) {
    // 静默失败，下轮 onChanged/alarm 再试
  } finally {
    scanning = false;
  }
}

/* ============ 事件 ============ */
function maintainStorage() {
  runStorageMaintenance().catch(() => { /* 下轮启动或定时任务重试 */ });
}

chrome.runtime.onInstalled.addListener(() => { ensureDailyAlarm(); maintainStorage(); updateBadge(); scheduleLinkScan(); });
chrome.runtime.onStartup.addListener(() => { ensureDailyAlarm(); maintainStorage(); updateBadge(); scheduleLinkScan(); });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === DAILY_ALARM) { maintainStorage(); updateBadge(); }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  updateBadge();
  scheduleLinkScan();
});
