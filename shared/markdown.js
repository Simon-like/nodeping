// 草稿 Markdown：安全的常用语法解析 + 编辑器文本变换。
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function inline(source) {
  const codes = [];
  let text = escapeHtml(source).replace(/`([^`]+)`/g, (_, code) => {
    const token = `\u0000${codes.length}\u0000`;
    codes.push(code);
    return token;
  });
  text = text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
}

function isBlockStart(line) {
  return /^(?:```|#{1,3}\s+|>\s?|(?:---|\*\*\*)\s*$|\s*\d+\.\s+|\s*[-*]\s+)/.test(line);
}

export function renderMarkdown(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const code = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(`<pre><code>${escapeHtml(code.join('\n') + (code.length ? '\n' : ''))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^(?:---|\*\*\*)\s*$/.test(line)) { blocks.push('<hr>'); i++; continue; }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
      continue;
    }

    const ordered = /^\s*\d+\.\s+/.test(line);
    const unordered = /^\s*[-*]\s+/.test(line);
    if (ordered || unordered) {
      const type = ordered ? 'ol' : 'ul';
      const items = [];
      const pattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*]\s+(.+)$/;
      while (i < lines.length) {
        const match = lines[i].match(pattern);
        if (!match) break;
        items.push(`<li>${inline(match[1])}</li>`);
        i++;
      }
      blocks.push(`<${type}>${items.join('')}</${type}>`);
      continue;
    }

    const paragraph = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++]);
    blocks.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
  }
  return blocks.join('');
}

export function toggleBold(source, start, end) {
  const selected = source.slice(start, end);
  if (selected.length >= 4 && selected.startsWith('**') && selected.endsWith('**')) {
    const inner = selected.slice(2, -2);
    return { text: source.slice(0, start) + inner + source.slice(end), start, end: start + inner.length };
  }
  if (source.slice(start - 2, start) === '**' && source.slice(end, end + 2) === '**') {
    return {
      text: source.slice(0, start - 2) + selected + source.slice(end + 2),
      start: start - 2,
      end: end - 2,
    };
  }
  const content = selected || '粗体';
  return {
    text: source.slice(0, start) + `**${content}**` + source.slice(end),
    start: start + 2,
    end: start + 2 + content.length,
  };
}

export function continueList(source, start) {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = source.indexOf('\n', start);
  const lineEnd = nextBreak === -1 ? source.length : nextBreak;
  const beforeCursor = source.slice(lineStart, start);
  const fullLine = source.slice(lineStart, lineEnd);
  const ordered = beforeCursor.match(/^(\s*)(\d+)\.\s+(.*)$/);
  const unordered = beforeCursor.match(/^(\s*)([-*])\s+(.*)$/);
  const emptyItem = /^(?:\s*\d+\.|\s*[-*])\s*$/.test(fullLine);

  if (emptyItem) {
    const text = source.slice(0, lineStart) + source.slice(lineEnd);
    return { text, start: lineStart, end: lineStart, handled: true };
  }
  if (!ordered && !unordered) return { text: source, start, end: start, handled: false };

  const marker = ordered ? `${Number(ordered[2]) + 1}. ` : `${unordered[2]} `;
  const insertion = `\n${ordered?.[1] || unordered?.[1] || ''}${marker}`;
  const text = source.slice(0, start) + insertion + source.slice(start);
  const cursor = start + insertion.length;
  return { text, start: cursor, end: cursor, handled: true };
}
