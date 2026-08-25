// NodePing 共享 UI 工具：链接识别、linkify、favicon

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const URL_RE = /(https?:\/\/[^\s<>"'）)，。；]+)/g;

/** 把纯文本渲染为带可点击链接的 HTML（先做 XSS 转义，再包装 URL） */
export function renderTextWithLinks(text) {
  if (!text) return '';
  let out = '', last = 0;
  for (const m of String(text).matchAll(URL_RE)) {
    out += escapeHtml(text.slice(last, m.index));
    const url = m[0];
    out += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    last = m.index + url.length;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

/** 规范化用户输入的 URL；非法返回 null */
export function normalizeUrl(input) {
  let u = String(input || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

/** Chrome 内置 favicon 服务（需 manifest 声明 "favicon" 权限） */
export function faviconUrl(url, size = 32) {
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`;
}
