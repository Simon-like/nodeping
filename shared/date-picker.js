// 轻量日期选择器：快捷日期 + 自绘月历，Popup 与 Options 共用。
import { todayStr, toDateStr, parseDate } from './store.js';

const DOW = ['一', '二', '三', '四', '五', '六', '日'];

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function labelFor(value) {
  if (!value) return '选择日期';
  if (value === todayStr()) return '今天';
  if (value === offsetDate(1)) return '明天';
  const d = parseDate(value);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${DOW[(d.getDay() + 6) % 7]}`;
}

export function createDatePicker(host, { value = null, onChange = () => {}, compact = false } = {}) {
  let selected = value || null;
  let cursor = selected ? parseDate(selected) : new Date();
  let isOpen = false;

  host.classList.add('dp-host');
  host.classList.toggle('dp-compact', compact);
  host.innerHTML = `
    <button type="button" class="dp-trigger" aria-haspopup="dialog" aria-expanded="false">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2.5v3M15 2.5v3M3 7.5h14M4.5 4h11A1.5 1.5 0 0 1 17 5.5v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-10A1.5 1.5 0 0 1 4.5 4Z"/></svg>
      <span class="dp-value"></span><span class="dp-chevron">⌄</span>
    </button>
    <div class="dp-panel hidden" role="dialog" aria-label="选择截止日期">
      <div class="dp-quick">
        <button type="button" data-offset="0">今天</button>
        <button type="button" data-offset="1">明天</button>
        <button type="button" data-offset="7">下周</button>
        <button type="button" data-clear>无日期</button>
      </div>
      <div class="dp-month-head">
        <button type="button" class="dp-prev" aria-label="上个月">‹</button>
        <strong class="dp-month-title"></strong>
        <button type="button" class="dp-next" aria-label="下个月">›</button>
      </div>
      <div class="dp-dows">${DOW.map(d => `<span>${d}</span>`).join('')}</div>
      <div class="dp-grid"></div>
    </div>`;

  const trigger = host.querySelector('.dp-trigger');
  const panel = host.querySelector('.dp-panel');
  const grid = host.querySelector('.dp-grid');

  function emit() { onChange(selected); }

  function close() {
    isOpen = false;
    panel.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
  }

  function open() {
    isOpen = true;
    cursor = selected ? parseDate(selected) : new Date();
    render();
    panel.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function choose(next) {
    selected = next || null;
    render();
    emit();
    close();
  }

  function render() {
    host.querySelector('.dp-value').textContent = labelFor(selected);
    host.classList.toggle('dp-empty', !selected);
    host.querySelectorAll('[data-offset]').forEach(btn => {
      btn.classList.toggle('on', selected === offsetDate(Number(btn.dataset.offset)));
    });
    host.querySelector('[data-clear]').classList.toggle('on', !selected);

    const y = cursor.getFullYear(), m = cursor.getMonth();
    host.querySelector('.dp-month-title').textContent = `${y} 年 ${m + 1} 月`;
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    let html = '';
    for (let i = lead; i > 0; i--) html += dayCell(new Date(y, m, 1 - i), true);
    for (let d = 1; d <= days; d++) html += dayCell(new Date(y, m, d), false);
    const trailing = (7 - (lead + days) % 7) % 7;
    for (let d = 1; d <= trailing; d++) html += dayCell(new Date(y, m + 1, d), true);
    grid.innerHTML = html;
    grid.querySelectorAll('[data-date]').forEach(btn => { btn.onclick = () => choose(btn.dataset.date); });
  }

  function dayCell(date, dim) {
    const ds = toDateStr(date);
    const classes = ['dp-day'];
    if (dim) classes.push('dim');
    if (ds === todayStr()) classes.push('today');
    if (ds === selected) classes.push('selected');
    const label = `${ds}${ds === todayStr() ? '，今天' : ''}`;
    return `<button type="button" class="${classes.join(' ')}" data-date="${ds}" aria-label="${label}" ${ds === selected ? 'aria-current="date"' : ''}>${date.getDate()}</button>`;
  }

  trigger.onclick = () => isOpen ? close() : open();
  host.querySelector('.dp-prev').onclick = () => { cursor.setMonth(cursor.getMonth() - 1); render(); };
  host.querySelector('.dp-next').onclick = () => { cursor.setMonth(cursor.getMonth() + 1); render(); };
  host.querySelectorAll('[data-offset]').forEach(btn => { btn.onclick = () => choose(offsetDate(Number(btn.dataset.offset))); });
  host.querySelector('[data-clear]').onclick = () => choose(null);

  const onPointerDown = event => { if (!host.contains(event.target)) close(); };
  const onKeyDown = event => { if (event.key === 'Escape' && isOpen) { close(); trigger.focus(); } };
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);

  render();
  return {
    getValue: () => selected,
    setValue(next) { selected = next || null; if (selected) cursor = parseDate(selected); render(); },
    open,
    close,
    destroy() { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); host.innerHTML = ''; },
  };
}
