// @ts-check
// Small DOM component kit for the studio shell. No framework, no build step.

/** @typedef {Record<string, any>} Attrs */
/** @typedef {Node | string | number | null | undefined | false | any[]} Child */

/**
 * @param {string} tag
 * @param {Attrs | null} [attrs]
 * @param {...(Child | Child[])} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

/** @param {HTMLElement} el @param {any[]} children */
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

let uid = 0;
/** @param {string} prefix */
export const nextId = (prefix) => `${prefix}-${++uid}`;

/** @typedef {'real'|'partial'|'mock'|'unimpl'} Status */
export const STATUS_LABEL = { real: '実機能', partial: '既存・部分', mock: 'サンプル表示', unimpl: '◇ 未実装' };
/** @param {Status} s @param {string} [title] */
export const badge = (s, title) => h('span', { class: `badge badge-${s}`, title: title || STATUS_TITLE[s] }, STATUS_LABEL[s]);
const STATUS_TITLE = {
  real: '既存のPython APIに接続しています（読み取り専用）。',
  partial: '既存画面に部分実装があります。この新UIへは未移植です。',
  mock: '画面内だけの仮データです。保存・外部処理は行いません。',
  unimpl: 'この機能はまだ実装されていません。押すと説明を表示します。',
};

/* ---------- toast ---------- */
/** @param {string} msg @param {'mock'|'real'|'err'|''} [kind] */
export function toast(msg, kind = 'mock') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = h('div', { class: `toast ${kind}` }, msg);
  host.append(t);
  setTimeout(() => t.remove(), 4200);
}

/* ---------- modal ---------- */
/** @type {HTMLElement | null} */
let lastFocus = null;
/**
 * @param {{title: string, body: Child | Child[], footer?: Child[], wide?: boolean, className?: string, onClose?: () => void, label?: string}} opts
 * @returns {{close: () => void, root: HTMLElement}}
 */
export function openModal(opts) {
  closeModal();
  lastFocus = /** @type {HTMLElement|null} */ (document.activeElement);
  const root = document.getElementById('modal-root');
  const titleId = nextId('mt');
  const close = () => { closeModal(); opts.onClose && opts.onClose(); };
  const dialog = h('div', { class: `modal ${opts.className || ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('header', null, h('h2', { id: titleId }, opts.title), h('span', { style: { flex: '1' } }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '閉じる', onclick: close }, '×')),
    h('div', { class: 'body' }, opts.body),
    opts.footer ? h('footer', null, opts.footer) : null);
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (/** @type {MouseEvent} */ e) => { if (e.target === backdrop) close(); } }, dialog);
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') trapTab(dialog, e);
  });
  root && root.append(backdrop);
  const first = /** @type {HTMLElement|null} */ (dialog.querySelector('[autofocus], input, select, textarea, .body button, footer button'));
  (first || dialog.querySelector('button'))?.focus();
  return { close, root: dialog };
}
export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root && root.firstChild) {
    root.textContent = '';
    lastFocus && lastFocus.isConnected && lastFocus.focus();
  }
}
/** @param {HTMLElement} box @param {KeyboardEvent} e */
function trapTab(box, e) {
  const items = /** @type {HTMLElement[]} */ ([...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]).filter((x) => !x.hasAttribute('disabled'));
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/**
 * Explain an unimplemented feature instead of pretending it worked.
 * @param {{name: string, why?: string, ids?: string[], phase?: string}} f
 */
export function showUnimplemented(f) {
  openModal({
    title: '◇ 未実装',
    body: [
      h('p', { class: 'unimpl-head' }, f.name),
      h('p', { class: 'muted' }, f.why || 'この操作に対応する処理はまだありません。押しても何も保存・実行されません。'),
      h('dl', { class: 'kv' },
        h('dt', null, '関連ID'), h('dd', null, (f.ids && f.ids.length) ? f.ids.join(', ') : '未割当'),
        h('dt', null, '予定'), h('dd', null, f.phase || '未承認の候補（P4）。所有者の承認後に計画へ登録します。')),
    ],
    footer: [h('button', { class: 'btn', type: 'button', onclick: closeModal }, '閉じる')],
  });
}

/* ---------- tabs ---------- */
/**
 * @param {{tabs: {id: string, label: string, render: () => Child | Child[]}[], selected?: string, onChange?: (id: string) => void, label: string}} o
 */
export function tabs(o) {
  const list = h('div', { class: 'tabs', role: 'tablist', 'aria-label': o.label });
  const panel = h('div', { role: 'tabpanel', class: 'pane-body', tabindex: '0' });
  /** @type {HTMLElement[]} */
  const btns = [];
  const select = (/** @type {string} */ id, /** @type {boolean} */ focus = false) => {
    const t = o.tabs.find((x) => x.id === id) || o.tabs[0];
    for (const b of btns) {
      const on = b.dataset.tab === t.id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
      if (on) panel.setAttribute('aria-labelledby', b.id);
    }
    panel.textContent = '';
    append(panel, [t.render()]);
    o.onChange && o.onChange(t.id);
  };
  for (const t of o.tabs) {
    const b = h('button', { role: 'tab', type: 'button', id: nextId('tab'), dataset: { tab: t.id }, onclick: () => select(t.id) }, t.label);
    btns.push(b);
    list.append(b);
  }
  list.addEventListener('keydown', (e) => {
    const i = btns.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
      select(/** @type {string} */ (btns[n].dataset.tab), true);
    }
  });
  select(o.selected || o.tabs[0].id);
  return { list, panel, select };
}

/* ---------- controls ---------- */
/**
 * Range + numeric input kept in sync; values live in the caller's state object.
 * @param {{label: string, min: number, max: number, step?: number, value: number, unit?: string, onInput?: (v: number) => void, hint?: string}} o
 */
export function slider(o) {
  const id = nextId('sl');
  const range = /** @type {HTMLInputElement} */ (h('input', { type: 'range', id, min: o.min, max: o.max, step: o.step || 1, value: o.value, 'aria-label': o.label }));
  const num = /** @type {HTMLInputElement} */ (h('input', { class: 'num', type: 'number', min: o.min, max: o.max, step: o.step || 1, value: o.value, 'aria-label': `${o.label}（数値）` }));
  const set = (/** @type {number} */ v, /** @type {HTMLInputElement} */ from) => {
    if (!Number.isFinite(v)) return;
    v = Math.min(o.max, Math.max(o.min, v));
    if (from !== range) range.value = String(v);
    if (from !== num) num.value = String(v);
    o.onInput && o.onInput(v);
  };
  range.addEventListener('input', () => set(Number(range.value), range));
  num.addEventListener('change', () => set(Number(num.value), num));
  return h('div', { class: 'field', title: o.hint || '' }, h('label', { for: id }, o.label), range, h('span', { style: { display: 'flex', gap: '3px', alignItems: 'center' } }, num, h('span', { class: 'unit' }, o.unit || '')));
}

/**
 * @param {{label: string, options: (string|[string,string])[], value?: string, onChange?: (v: string) => void}} o
 */
export function selectField(o) {
  const id = nextId('se');
  const sel = /** @type {HTMLSelectElement} */ (h('select', { id }, o.options.map((x) => {
    const [v, l] = Array.isArray(x) ? x : [x, x];
    return h('option', { value: v, selected: v === o.value }, l);
  })));
  sel.addEventListener('change', () => o.onChange && o.onChange(sel.value));
  return h('div', { class: 'field' }, h('label', { for: id }, o.label), sel, h('span'));
}

/** @param {{label: string, checked?: boolean, onChange?: (v: boolean) => void, title?: string}} o */
export function toggle(o) {
  const cb = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: !!o.checked }));
  cb.addEventListener('change', () => o.onChange && o.onChange(cb.checked));
  return h('label', { class: 'switch', title: o.title || '' }, cb, o.label);
}

/**
 * Single-choice chip group (segmented).
 * @param {{label: string, options: string[], value?: string, onChange?: (v: string) => void}} o
 */
export function chips(o) {
  const box = h('div', { class: 'chips', role: 'group', 'aria-label': o.label });
  for (const opt of o.options) {
    box.append(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(opt === o.value), onclick: (/** @type {Event} */ e) => {
      for (const c of box.children) c.setAttribute('aria-pressed', 'false');
      /** @type {HTMLElement} */ (e.currentTarget).setAttribute('aria-pressed', 'true');
      o.onChange && o.onChange(opt);
    } }, opt));
  }
  return box;
}

/**
 * Dropdown menu button.
 * @param {string} label
 * @param {{label: string, onSelect: () => void}[]} items
 * @param {string} [cls]
 */
export function dropdown(label, items, cls = 'btn') {
  const btn = h('button', { type: 'button', class: cls, 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, `${label} ▾`);
  const wrap = h('div', { class: 'dropdown' }, btn);
  /** @type {HTMLElement | null} */
  let menu = null;
  const close = () => { menu && menu.remove(); menu = null; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside, true); };
  const outside = (/** @type {Event} */ e) => { if (!wrap.contains(/** @type {Node} */ (e.target))) close(); };
  btn.addEventListener('click', () => {
    if (menu) return close();
    menu = h('div', { class: 'menu', role: 'menu' }, items.map((it) => h('button', { role: 'menuitem', type: 'button', onclick: () => { close(); it.onSelect(); } }, it.label)));
    menu.addEventListener('keydown', (e) => {
      const all = /** @type {HTMLElement[]} */ ([...(menu?.querySelectorAll('button') || [])]);
      const i = all.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      if (e.key === 'ArrowDown') { e.preventDefault(); all[(i + 1) % all.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); all[(i - 1 + all.length) % all.length].focus(); }
      if (e.key === 'Escape') { close(); btn.focus(); }
    });
    wrap.append(menu);
    btn.setAttribute('aria-expanded', 'true');
    /** @type {HTMLElement|null} */ (menu.querySelector('button'))?.focus();
    document.addEventListener('pointerdown', outside, true);
  });
  return wrap;
}

/**
 * Selectable list with optional search/filter.
 * @param {{items: {id: string, label: string, meta?: string, depth?: number, thumb?: boolean}[], selected?: string, onSelect?: (id: string) => void, search?: boolean, tree?: boolean, label: string}} o
 */
export function selectList(o) {
  let selected = o.selected;
  let query = '';
  const ul = h('ul', { class: `list ${o.tree ? 'tree' : ''}`, role: 'listbox', 'aria-label': o.label, tabindex: '0' });
  const render = () => {
    ul.textContent = '';
    const rows = o.items.filter((x) => !query || x.label.toLowerCase().includes(query) || (x.meta || '').toLowerCase().includes(query));
    if (!rows.length) { ul.append(h('li', { class: 'empty', role: 'option', 'aria-disabled': 'true' }, '一致する項目はありません')); return; }
    for (const it of rows) {
      ul.append(h('li', { role: 'option', 'aria-selected': String(it.id === selected), style: { '--depth': it.depth || 0 }, dataset: { id: it.id },
        onclick: () => { selected = it.id; render(); o.onSelect && o.onSelect(it.id); } },
        it.thumb ? (typeof it.thumb === 'string' ? h('img', { class: 'thumb', src: it.thumb, alt: '' }) : h('span', { class: 'thumb' })) : null, h('span', null, it.label), it.meta ? h('span', { class: 'meta' }, it.meta) : null));
    }
  };
  ul.addEventListener('keydown', (e) => {
    const rows = o.items.filter((x) => !query || x.label.toLowerCase().includes(query));
    const i = rows.findIndex((x) => x.id === selected);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = rows[Math.min(rows.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) { selected = n.id; render(); o.onSelect && o.onSelect(n.id); }
    }
  });
  render();
  if (!o.search) return ul;
  const input = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'search', placeholder: '絞り込み', 'aria-label': `${o.label}を絞り込み` }));
  input.addEventListener('input', () => { query = input.value.trim().toLowerCase(); render(); });
  return h('div', null, h('div', { class: 'searchbar' }, input), ul);
}

/** @param {string} title @param {Status | null} status @param {...Child} body */
export function section(title, status, ...body) {
  return h('section', { class: 'section' }, h('h3', { class: 'section-title' }, title, status ? badge(status) : null), ...body);
}

/** @param {number} frame @param {number} fps */
export function timecode(frame, fps) {
  const s = Math.floor(frame / fps), f = Math.floor(frame % fps);
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 60))}:${p(s % 60)}:${p(f)}`;
}
