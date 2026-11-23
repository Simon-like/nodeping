import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, toggleBold, continueList } from '../shared/markdown.js';

test('标题、列表、粗体和引用解析为安全 HTML', () => {
  const html = renderMarkdown('# 思考\n\n1. 第一项\n2. **第二项**\n\n- 补充\n\n> 留一个问题');
  assert.match(html, /<h1>思考<\/h1>/);
  assert.match(html, /<ol><li>第一项<\/li><li><strong>第二项<\/strong><\/li><\/ol>/);
  assert.match(html, /<ul><li>补充<\/li><\/ul>/);
  assert.match(html, /<blockquote>留一个问题<\/blockquote>/);
});

test('行内代码、代码块、链接和换行可用', () => {
  const html = renderMarkdown('使用 `**code**` 和 [文档](https://example.com)\n下一行\n\n```js\nconst a = 1;\n```');
  assert.match(html, /<code>\*\*code\*\*<\/code>/);
  assert.match(html, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">文档<\/a>/);
  assert.match(html, /下一行/);
  assert.match(html, /<pre><code>const a = 1;\n<\/code><\/pre>/);
});

test('原始 HTML 和危险链接不会成为可执行标记', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> [危险](javascript:alert(1))');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('&lt;img'));
});

test('Cmd/Ctrl+B 对选区加粗、空选区插入占位并再次取消', () => {
  const wrapped = toggleBold(' hello ', 1, 6);
  assert.deepEqual(wrapped, { text: ' **hello** ', start: 3, end: 8 });
  const empty = toggleBold('', 0, 0);
  assert.deepEqual(empty, { text: '**粗体**', start: 2, end: 4 });
  const unwrapped = toggleBold('**hello**', 2, 7);
  assert.deepEqual(unwrapped, { text: 'hello', start: 0, end: 5 });
  const surrounding = toggleBold('**hello**', 0, 9);
  assert.deepEqual(surrounding, { text: 'hello', start: 0, end: 5 });
});

test('有序列表 Enter 自动编号，空项退出列表', () => {
  const next = continueList('1. 第一项\n2. 第二项', '1. 第一项\n2. 第二项'.length);
  assert.deepEqual(next, { text: '1. 第一项\n2. 第二项\n3. ', start: 17, end: 17, handled: true });
  const empty = continueList('1. ', 3);
  assert.deepEqual(empty, { text: '', start: 0, end: 0, handled: true });
  const plain = continueList('普通文本', 4);
  assert.equal(plain.handled, false);
});
