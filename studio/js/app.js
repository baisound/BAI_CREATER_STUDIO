// @ts-check
// Studio shell: router (/workspace/NN), navigation, layout and generic renderers.
import { h, badge, toast, openModal, closeModal, showUnimplemented, setActionRunner, region, regionTag, tabs, slider, selectField, toggle, chips, dropdown, selectList, section, timecode, STATUS_LABEL } from './ui.js';
import { SCREENS, GROUPS, FORMS, PH, newProjectUnimpl } from './screens.js';
import { FEATURES } from './features/index.js';
import { stateBox } from './state-box.js';
import { project, assets } from './store.js';
import { LIVE, summarize } from './live.js';
import { icon, SCREEN_ICON } from './icons.js';
import { img, RENDERS } from './samples.js';
import { currentViewport } from './viewport/three-host.js';
import { currentMotion } from './features/motion-view.js';
import { currentTimeline } from './features/motion-timeline.js';
import { currentChainControl } from './motion/chain-runtime.js';
import { loadProject, startExternalSync, installUnloadGuard, describeStatus } from './features/project.js';

/** @typedef {import('./screens.js').Screen} Screen */
/** @typedef {import('./screens.js').Control} Control */

/* ---------- preferences (per-viewer convenience only) ---------- */
const PREF_KEY = 'bai.studio.prefs.v1';
/** @type {{theme: string, density: string, bottomCollapsed: boolean}} */
const prefs = { theme: 'night', density: 'compact', bottomCollapsed: false };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch { /* storage unavailable */ }
function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  applyPrefs();
}
function applyPrefs() {
  document.documentElement.dataset.theme = ['paper', 'graphite'].includes(prefs.theme) ? prefs.theme : 'night';
  document.documentElement.dataset.density = prefs.density;
}
applyPrefs();

/* ---------- routing ---------- */
const BASE = '/workspace/';
/** @param {string} id */
const routeOf = (id) => `${BASE}${id}`;
/** @returns {{id: string, tab: string | null, params: URLSearchParams}} */
function parseLocation() {
  const m = location.pathname.match(/^\/workspace\/?(\d{2})?\/?$/);
  const q = new URLSearchParams(location.search);
  if (m) return { id: m[1] || '01', tab: q.get('tab'), params: q };
  // Opened as /studio/index.html (e.g. static preview) → hash fallback #/workspace/NN
  const hm = location.hash.match(/^#\/workspace\/(\d{2})/);
  return { id: hm ? hm[1] : '01', tab: q.get('tab'), params: q };
}
/** @param {string} id @param {{replace?: boolean, tab?: string|null, query?: Record<string,string>}} [o] */
export function navigate(id, o = {}) {
  const qs = new URLSearchParams();
  if (o.tab) qs.set('tab', o.tab);
  for (const [k, v] of Object.entries(o.query || {})) qs.set(k, v);
  const url = routeOf(id) + (qs.toString() ? `?${qs}` : '');
  if (location.pathname.startsWith('/workspace')) {
    if (o.replace) history.replaceState({ id }, '', url); else history.pushState({ id }, '', url);
  } else {
    location.hash = `#/workspace/${id}`;
    return;
  }
  render();
}
window.addEventListener('popstate', () => render());
window.addEventListener('hashchange', () => { if (!location.pathname.startsWith('/workspace')) render(); });

/* ---------- sidebar ---------- */
const navEl = /** @type {HTMLElement} */ (document.getElementById('nav'));
/** @param {Screen} s */
function screenDot(s) {
  const st = s.panels.map((p) => p.status);
  if (st.includes('real') || st.includes('partial')) return st.includes('partial') ? 'partial' : 'real';
  return 'unimpl';
}
function buildNav() {
  navEl.textContent = '';
  for (const g of GROUPS) {
    const list = SCREENS.filter((s) => s.group === g);
    if (!list.length) continue;
    navEl.append(h('div', { class: 'nav-group' }, h('h2', null, g),
      list.map((s) => h('a', { class: 'nav-item', href: routeOf(s.id), dataset: { route: s.id }, title: s.summary },
        icon(SCREEN_ICON[s.id] || 'more'), h('span', { class: 'nav-label' }, s.nav), h('i', { class: `nav-dot ${screenDot(s)}`, 'aria-hidden': 'true' })))));
  }
}
document.addEventListener('click', (e) => {
  const a = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('a[data-route]'));
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  closeSidebar();
  navigate(/** @type {string} */ (a.dataset.route));
});

const sidebar = /** @type {HTMLElement} */ (document.getElementById('sidebar'));
const navToggle = /** @type {HTMLElement} */ (document.getElementById('nav-toggle'));
navToggle.addEventListener('click', () => {
  const open = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', String(open));
});
function closeSidebar() { sidebar.classList.remove('open'); navToggle.setAttribute('aria-expanded', 'false'); }

/** @type {HTMLButtonElement} */ (document.getElementById('nav-back')).addEventListener('click', () => history.back());
/** @type {HTMLButtonElement} */ (document.getElementById('nav-forward')).addEventListener('click', () => history.forward());

/* ---------- command palette ---------- */
function openPalette() {
  const input = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'search', placeholder: '画面名・番号・機能IDで検索', 'aria-label': '画面を検索', autofocus: true }));
  const ul = h('ul', { class: 'list', role: 'listbox', 'aria-label': '検索結果' });
  let idx = 0;
  /** @type {Screen[]} */
  let hits = [];
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    hits = SCREENS.filter((s) => !q || [s.id, s.title, s.nav, s.group, ...s.ids, ...s.panels.map((p) => p.name)].join(' ').toLowerCase().includes(q));
    idx = Math.min(idx, Math.max(0, hits.length - 1));
    ul.textContent = '';
    if (!hits.length) ul.append(h('li', { class: 'empty' }, '該当する画面はありません'));
    hits.forEach((s, i) => ul.append(h('li', { role: 'option', 'aria-selected': String(i === idx), onclick: () => { closeModal(); navigate(s.id); } },
      h('span', { class: 'nav-num' }, s.id), h('span', null, s.title), h('span', { class: 'meta' }, s.group))));
  };
  input.addEventListener('input', () => { idx = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(hits.length - 1, idx + 1); draw(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); draw(); }
    if (e.key === 'Enter' && hits[idx]) { closeModal(); navigate(hits[idx].id); }
  });
  openModal({ title: '画面を検索して移動', className: 'palette', body: [input, h('div', { style: { marginTop: '8px', maxHeight: '50vh', overflow: 'auto' } }, ul)] });
  draw();
  input.focus();
}
/** @type {HTMLElement} */ (document.getElementById('palette-open')).addEventListener('click', openPalette);
document.addEventListener('keydown', (e) => {
  const t = /** @type {HTMLElement} */ (e.target);
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); history.back(); }
  else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); history.forward(); }
  else if (e.altKey && !typing && /^[1-9]$/.test(e.key)) {
    const links = [...navEl.querySelectorAll('a[data-route]')];
    const a = /** @type {HTMLElement|undefined} */ (links[Number(e.key) - 1]);
    if (a) { e.preventDefault(); navigate(/** @type {string} */ (a.dataset.route)); }
  }
});

/* ---------- actions ---------- */
/**
 * Every button routes through here so nothing is inert and nothing fakes success.
 * @param {Control} c
 */
function runAction(c) {
  const act = String(c.act || '');
  if (act === 'unimpl') return showUnimplemented({ name: c.label, why: c.why, ids: c.ids, phase: c.phase, next: c.next });
  if (act.startsWith('nav:')) {
    // `nav:08?import=1&cat=motion` → 画面ID と query（設計 §1.6-6）
    const [sid, qstr] = act.slice(4).split('?');
    return navigate(sid, qstr ? { query: Object.fromEntries(new URLSearchParams(qstr)) } : {});
  }
  if (act.startsWith('href:')) return goHref(act.slice(5));
  if (act === 'real') return; // 実データのボタンは feature 部品が自分で処理する（runAction には渡さない）
  if (act.startsWith('form:')) return openForm(act.slice(5));
  if (act.startsWith('mock:')) return toast(`サンプル表示：${act.slice(5)}`, 'mock');
  toast(`サンプル表示：「${c.label}」は画面内の仮動作です。`, 'mock');
}

/** 現行（旧）画面。新UIから離れるときは確認を出す（導線点検 §5-2）。 */
const LEGACY_PAGES = ['/', '/camera.html', '/index.html'];
/** @param {string} url */
function isLegacyUrl(url) {
  try { const u = new URL(url, location.href); return u.origin === location.origin && LEGACY_PAGES.includes(u.pathname); } catch { return false; }
}
/** @param {string} url */
function goHref(url) {
  if (!isLegacyUrl(url)) { location.href = url; return; }
  const name = new URL(url, location.href).pathname === '/camera.html' ? '現行のカメラ画面' : '現行の制作画面';
  openModal({
    title: '新UIから離れます',
    body: [
      h('p', null, `${name}を開きます。新UIから離れます。`),
      h('p', { class: 'muted small' }, '戻るには、ブラウザーの戻る（Alt+←）か、現行の制作画面の上にある「新UI（操作モック）」リンクを使ってください。'),
    ],
    footer: [
      h('button', { class: 'btn ghost', type: 'button', dataset: { role: 'leave-cancel' }, onclick: closeModal }, 'キャンセル'),
      h('button', { class: 'btn primary', type: 'button', dataset: { role: 'leave-go' }, onclick: () => { closeModal(); location.href = url; } }, '移動する'),
    ],
  });
}
setActionRunner((c) => runAction(c));
// 本文中の現行画面へのリンク（<a>）も同じ確認を通す。診断ZIPなど API のリンクは対象外。
document.addEventListener('click', (e) => {
  const a = /** @type {HTMLAnchorElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('#main a[href]'));
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  if (!isLegacyUrl(a.getAttribute('href') || '')) return;
  e.preventDefault();
  goHref(/** @type {string} */ (a.getAttribute('href')));
});

/** @param {string} id */
function openForm(id) {
  const f = /** @type {any} */ (FORMS)[id];
  if (!f) return;
  /** @type {Record<string, HTMLInputElement|HTMLSelectElement>} */
  const inputs = {};
  /** @type {Record<string, HTMLElement>} */
  const errs = {};
  const body = [
    f.intro ? h('p', { class: 'muted' }, f.intro) : null,
    ...f.fields.map((/** @type {any} */ fd) => {
      const fid = `f-${id}-${fd.id}`;
      const input = fd.type === 'select'
        ? /** @type {HTMLSelectElement} */ (h('select', { id: fid, class: 'input' }, fd.options.map((/** @type {string} */ o) => h('option', { value: o }, o))))
        : /** @type {HTMLInputElement} */ (h('input', { id: fid, class: 'input', type: 'text', required: !!fd.required, autocomplete: 'off', 'aria-describedby': `${fid}-err` }));
      inputs[fd.id] = input;
      errs[fd.id] = h('div', { class: 'err', id: `${fid}-err`, role: 'alert' });
      return h('div', { class: 'field stack' }, h('label', { for: fid }, fd.label, fd.required ? ' *' : ''), input, errs[fd.id]);
    }),
    h('p', { class: 'xs muted' }, badge('mock'), ' 入力は検証されますが、サーバーへは保存されません。'),
  ];
  const submit = () => {
    let ok = true;
    for (const fd of f.fields) {
      const v = inputs[fd.id].value.trim();
      const bad = (fd.required && !v) || (fd.pattern && v && !new RegExp(fd.pattern).test(v)) || (fd.pattern && fd.required && !new RegExp(fd.pattern).test(v));
      inputs[fd.id].setAttribute('aria-invalid', String(!!bad));
      errs[fd.id].textContent = bad ? (fd.error || '入力してください。') : '';
      if (bad && ok) { inputs[fd.id].focus(); ok = false; }
    }
    if (!ok) return;
    if (id === 'newProject') mockProjects.unshift(inputs.name.value.trim());
    closeModal();
    toast(f.done, 'mock');
    if (id === 'newProject') render();
  };
  const m = openModal({ title: f.title, body, footer: [
    h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'キャンセル'),
    h('button', { class: `btn ${f.danger ? '' : 'primary'}`, type: 'button', onclick: submit }, f.submit),
  ] });
  m.root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && /** @type {HTMLElement} */ (e.target).tagName === 'INPUT') { e.preventDefault(); submit(); } });
}
/** @type {string[]} */
const mockProjects = [];

/* ---------- controls ---------- */
/** @param {Control} c @returns {HTMLElement | HTMLElement[] | null} */
function control(c) {
  switch (c.t) {
    case 'slider': return slider({ label: c.label, min: c.min, max: c.max, step: c.step, value: c.value, unit: c.unit });
    case 'select': return selectField({ label: c.label, options: c.options, value: c.value, onChange: (v) => toast(`サンプル表示：${c.label}＝${v}`, 'mock') });
    case 'toggle': return toggle({ label: c.label, checked: c.checked });
    case 'chips': return h('div', { class: 'field' }, h('span', null, c.label), chips({ label: c.label, options: c.options, value: c.value }), h('span'));
    case 'btn': return actionButton(c);
    case 'btns': return h('div', { class: 'btn-row' }, c.items.map(actionButton));
    case 'note': return h('p', { class: 'section-note' }, c.text);
    case 'textarea': return h('div', { class: 'field stack' }, h('label', null, c.label), h('textarea', { class: 'input', rows: c.rows || 7, placeholder: c.placeholder || '', disabled: true, 'aria-label': c.label, title: '◇ 未実装：入力と保存はまだできません' }), h('span', { class: 'section-note' }, '◇ 未実装：入力と保存はまだできません。'));
    case 'link': return h('p', { class: 'small', style: { margin: '4px 0' } }, h('a', { href: c.href }, `${c.label} ↗`));
    case 'code': return h('pre', { class: 'log' }, c.text);
    case 'kv': return h('dl', { class: 'kv' }, c.rows.map((/** @type {string[]} */ [k, v]) => [h('dt', null, k), h('dd', null, v)]));
    case 'empty': return h('div', { class: 'empty' }, c.text);
    case 'conceptPreview': return h('figure', { class: `concept-preview ${c.kind || ''}`, 'aria-label': `${c.alt}。生成したコンセプト画像であり、実際の描画結果ではありません` },
      h('img', { src: c.src, alt: c.alt }),
      c.lyric ? h('div', { class: 'concept-lyric' }, c.lyric) : null,
      h('figcaption', null, '生成コンセプト画像 · 実際の描画は未実装'));
    case 'text': {
      const input = /** @type {HTMLInputElement} */ (h('input', { class: 'input', placeholder: c.placeholder || '' }));
      const add = () => { if (input.value.trim()) { toast(`サンプル表示：「${input.value.trim()}」を追加（保存されません）`, 'mock'); input.value = ''; } };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      return h('div', { class: 'field stack' }, h('label', null, c.label), h('div', { class: 'searchbar' }, input, h('button', { class: 'btn', type: 'button', onclick: add }, '追加')));
    }
    case 'list': return selectList({ items: c.items, search: c.search, label: c.label || '一覧' });
    case 'table': return sortableTable(c.cols, c.rows);
    case 'progress': return h('div', null, c.rows.map((/** @type {[string, number, string]} */ [l, p, t]) => h('div', { class: 'status-row' }, h('span', null, l), h('div', { class: 'progress', role: 'img', 'aria-label': `${l} ${t}` }, h('i', { style: { width: `${p}%` } })), h('span', { class: 'mono xs muted' }, t))));
    case 'checks': return h('div', null, c.rows.map((/** @type {string[]} */ [st, l, m]) => h('div', { class: 'check-row' }, h('i', { class: `dot ${st}` }), h('span', null, l), h('span', { class: 'xs muted' }, m))));
    case 'live': return liveBlock(c.key);
    case 'feature': return featureBlock(c);
    case 'curve': return curve();
    case 'tiles': return tiles(c);
    case 'browserInfo': return h('dl', { class: 'kv' }, h('dt', null, 'UA'), h('dd', null, navigator.userAgent), h('dt', null, '画面'), h('dd', null, `${innerWidth}×${innerHeight} @${devicePixelRatio}x`), h('dt', null, '言語'), h('dd', null, navigator.language));
    case 'prefToggle': return toggle({ label: c.label, checked: /** @type {any} */ (prefs)[c.key], onChange: (v) => { /** @type {any} */ (prefs)[c.key] = v; savePrefs(); toast('表示設定を保存しました（このブラウザのみ）。', 'real'); } });
    case 'prefDensity': return selectField({ label: '表示密度', options: [['compact', '標準（高密度）'], ['comfortable', 'ゆったり']], value: prefs.density, onChange: (v) => { prefs.density = v; savePrefs(); } });
    default: return null;
  }
}
/**
 * 実データの部品（P2 設計 §1.6-1）。FEATURES[key] を呼ぶ。登録が無いキーは「未接続」と正直に表示する。
 * @param {Control} c
 */
function featureBlock(c) {
  const fn = FEATURES[c.key];
  if (!fn) return stateBox({ kind: 'offline', title: '未接続', message: `この部品（${c.key}）はまだ結線されていません。` });
  try { return fn(makeCtx(), /** @type {any} */ (c)) || h('div'); } catch (e) {
    console.error(e);
    return stateBox({ kind: 'error', title: '表示できません', message: e instanceof Error ? e.message : String(e) });
  }
}
/** @param {Control} c */
function actionButton(c) {
  const un = c.act === 'unimpl';
  return h('button', { type: 'button', dataset: { act: String(c.act).split(':')[0] }, class: `btn ${c.primary ? 'primary' : ''} ${un ? 'is-unimpl' : ''}`, title: un ? `◇ 未実装：${c.why || ''}` : (c.title || ''), onclick: () => runAction(c) }, c.label);
}
/** Picture tiles (presets / templates). Selection is local only. @param {Control} c */
function tiles(c) {
  let sel = 0;
  const box = h('div', { class: `tiles cols-${c.cols || 3}`, role: 'listbox', 'aria-label': c.label });
  const draw = () => {
    box.textContent = '';
    c.items.forEach((/** @type {string[]} */ [im, l], /** @type {number} */ i) => box.append(h('button', { type: 'button', class: 'tile', role: 'option', 'aria-selected': String(i === sel), onclick: () => { sel = i; draw(); toast(`サンプル表示：${c.label}「${l}」を選択（反映・保存はされません）`, 'mock'); } },
      h('img', { src: img(im), alt: '', loading: 'lazy' }), h('span', null, l))));
  };
  draw();
  return h('div', { class: 'field stack' }, h('label', null, c.label), box);
}
/** @param {string[]} cols @param {string[][]} rows */
function sortableTable(cols, rows) {
  let sortCol = -1, dir = 1, selected = -1;
  const tbody = h('tbody');
  const draw = () => {
    const data = rows.map((r, i) => ({ r, i }));
    if (sortCol >= 0) data.sort((a, b) => a.r[sortCol].localeCompare(b.r[sortCol], 'ja') * dir);
    tbody.textContent = '';
    for (const { r, i } of data) tbody.append(h('tr', { 'aria-selected': String(i === selected), onclick: () => { selected = i; draw(); } }, r.map((v) => h('td', null, v))));
  };
  const head = h('tr', null, cols.map((c, i) => h('th', { scope: 'col', tabindex: '0', title: 'クリックで並び替え', onclick: () => { dir = sortCol === i ? -dir : 1; sortCol = i; draw(); } }, c)));
  draw();
  return h('div', { style: { overflow: 'auto' } }, h('table', { class: 'table' }, h('thead', null, head), tbody));
}
/** @param {string} key */
function liveBlock(key) {
  const def = /** @type {any} */ (LIVE)[key];
  const box = h('div', { class: 'live', 'data-live': key }, h('p', { class: 'xs muted' }, `${def.path} を読み取り中…`));
  // 画面の再描画で外されたあとに結果が届いても、外れた要素へは書かない（後始末。設計 §1.6-3）。
  let alive = true;
  cleanups.push(() => { alive = false; });
  const load = async () => {
    const r = await def.run();
    if (!alive) return;
    box.textContent = '';
    if (!r.ok) {
      box.append(h('p', { class: 'small', style: { color: 'var(--danger)' } }, `未接続：${def.label}を取得できませんでした（${r.error}）。`), h('p', { class: 'xs muted' }, 'Python サーバー（npm start / npm run dev）経由で開いているか確認してください。'));
    } else if (key === 'diagnostics') {
      const entries = (r.data.entries || []).slice(-12).reverse();
      box.append(entries.length ? h('pre', { class: 'log' }, entries.map((/** @type {any} */ e) => { const d = e.data || {}; return [String(e.timestamp || '').slice(11, 19), e.level, e.event, d.method, d.route, d.status].filter((x) => x !== undefined && x !== '').join(' '); }).join('\n')) : h('div', { class: 'empty' }, '診断ログはまだありません。'));
    } else {
      box.append(h('dl', { class: 'kv' }, summarize(r.data).map(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
    }
    box.append(h('div', { class: 'btn-row', style: { marginTop: '6px' } }, h('button', { class: 'btn ghost', type: 'button', onclick: load }, '↻ 再読込'), h('span', { class: 'xs muted mono' }, `GET ${def.path}`)));
  };
  load();
  return box;
}
function curve() {
  return h('div', { style: { border: '1px solid var(--border)', borderRadius: '3px', background: 'var(--bg)', height: '70px', margin: '4px 0' }, 'aria-label': '補間曲線（サンプル表示）', role: 'img' },
    svg('svg', { viewBox: '0 0 200 70', preserveAspectRatio: 'none', width: '100%', height: '100%' },
      svg('path', { d: 'M4 64 C 70 64, 130 6, 196 6', fill: 'none', stroke: 'var(--accent)', 'stroke-width': '1.5', 'vector-effect': 'non-scaling-stroke' })));
}
/** @param {string} tag @param {Record<string,string>} attrs @param {...SVGElement} kids */
function svg(tag, attrs, ...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

/** @param {import('./screens.js').Section[]} sections */
const renderSections = (sections) => sections.map((s) => section(s.title, s.status || null, s.note ? h('p', { class: 'section-note' }, s.note) : null, ...s.controls.map(control).flat()));

/* ---------- panes ---------- */
/**
 * タブの中身を描き直すとき、前のタブで登録した後始末を先に実行する（タブを切り替えても cleanups が増え続けない。設計 §1.6-8）。
 * @template {{render: () => any}} T
 * @param {T[]} defs @returns {T[]}
 */
function scopedTabs(defs) {
  /** @type {(() => void)[]} */
  let mine = [];
  return defs.map((d) => ({ ...d, render: () => {
    for (const f of mine.splice(0)) { const i = cleanups.indexOf(f); if (i >= 0) cleanups.splice(i, 1); try { f(); } catch (e) { console.error(e); } }
    const before = cleanups.length;
    const out = d.render();
    mine = cleanups.slice(before);
    return out;
  } }));
}

/** @param {Screen} s */
function statusTab(s) {
  return {
    id: 'status', label: '実装状態',
    render: () => [
      section('この画面の機能', null, h('div', null, s.panels.map((p) => h('div', { class: 'check-row', title: p.note || '' },
        h('span', null, ''), h('span', null, p.name, p.note ? h('div', { class: 'xs muted' }, p.note) : null), badge(p.status))))),
      s.existing && s.existing.length ? section('現行画面（既存機能）', 'partial', ...s.existing.map((e) => h('p', { class: 'small', style: { margin: '3px 0' } }, h('a', { href: e.href }, `${e.label} ↗`)))) : null,
      section('関連機能ID', null, h('p', { class: 'small mono' }, s.ids.join(', ') || '—'), h('p', { class: 'section-note' }, `画面台帳の分類：${s.classification === 'candidate_late' ? '後方候補（新規要素を含む）' : '既存・部分実装を監査'}`)),
    ],
  };
}

/** @param {Screen} s @param {string|null} tab */
function rightPane(s, tab) {
  const modeTabs = s.id === '27' && s.right ? s.right.tabs.filter((t) => lyricMode(tab) === 'detail' ? t.id !== 'quick' : t.id === 'quick') : s.right?.tabs;
  const defs = scopedTabs([...(modeTabs ? modeTabs.map((t) => ({ id: t.id, label: t.label, render: () => { const key = /** @type {any} */ (t).custom; return key && FEATURES[key] ? FEATURES[key](makeCtx(), { t: 'feature', key }) : renderSections(t.sections); } })) : []), statusTab(s)]);
  const t = tabs({ tabs: defs, selected: tab || undefined, label: `${s.title}のインスペクター`, onChange: (id) => {
    const url = new URL(location.href);
    if (url.searchParams.get('tab') !== id && location.pathname.startsWith('/workspace')) {
      url.searchParams.set('tab', id);
      if (s.id === '27') url.searchParams.set('mode', lyricMode(tab));
      history.replaceState(history.state, '', url);
    }
  } });
  return h('aside', { class: 'pane pane-right', 'aria-label': 'インスペクター' }, t.list, t.panel);
}

/** @param {Screen} s */
function leftPane(s) {
  const L = /** @type {NonNullable<Screen['left']>} */ (s.left);
  const customKey = /** @type {any} */ (L).custom;
  if (customKey && FEATURES[customKey]) {
    // 実データの左パネル（P2 設計 §1.6-1）。custom の値は FEATURES のキーにそろえる。
    return region(h('section', { class: 'pane pane-left', 'aria-label': L.title },
      h('div', { class: 'pane-head' }, h('h2', null, L.title), h('span', { class: 'spacer' }), regionTag(L.status)),
      h('div', { class: 'pane-body' }, FEATURES[customKey](makeCtx(), { t: 'feature', key: customKey }))), L.status);
  }
  return region(h('section', { class: 'pane pane-left', 'aria-label': L.title },
    h('div', { class: 'pane-head' }, h('h2', null, L.title), h('span', { class: 'spacer' }), regionTag(L.status)),
    h('div', { class: 'pane-body' }, L.list && L.list.length ? selectList({ items: L.list, search: L.search, tree: L.tree, label: L.title, selected: L.list[0] && L.list[0].id, onSelect: (id) => toast(`サンプル表示：「${(L.list || []).find((x) => x.id === id)?.label}」を選択`, 'mock') }) : null, L.controls?.map(control))), L.status);
}

/** @param {Screen} s */
function centerPane(s) {
  const c = s.center;
  const pane = h('section', { class: 'pane pane-center', 'aria-label': 'メインビュー' });
  switch (c.type) {
    case 'viewport': pane.append(viewport(c)); break;
    case 'home': pane.append(homeView(c)); break;
    case 'feature': pane.append(...[featureBlock(/** @type {any} */ (c))].flat()); region(pane, c.status || 'real'); break;
    case 'quad': {
      let sel = 0;
      const grid = h('div', { class: 'quad' });
      const draw = () => { grid.textContent = ''; c.labels.forEach((/** @type {string} */ l, /** @type {number} */ i) => grid.append(h('div', { class: 'viewport', role: 'button', tabindex: '0', 'aria-selected': String(i === sel), 'aria-label': `${l}ビューを選択`, onclick: () => { sel = i; draw(); }, onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel = i; draw(); } } }, c.imgs ? h('img', { class: 'vp-img', src: img(c.imgs[i]), alt: '' }) : h('div', { class: 'vp-subject' }), h('div', { class: 'vp-hud' }, h('span', null, l)), h('div', { class: 'vp-note' }, i === sel ? h('span', { class: 'vp-active' }, 'アクティブ') : '')))); };
      draw();
      pane.append(h('div', { class: 'pane-head' }, h('h2', null, 'マルチビュー'), h('span', { class: 'spacer' }), regionTag(c.status || 'mock'), h('span', { class: 'xs muted' }, c.imgs ? 'サンプル画像・3D描画は未接続' : '3D描画は未接続')), grid);
      region(pane, c.status || 'mock');
      break;
    }
    case 'thumbs': {
      let sel = '';
      const grid = h('div', { class: 'thumbs', role: 'listbox', 'aria-label': '一覧' });
      const draw = () => { grid.textContent = ''; for (const it of c.items) grid.append(h('button', { type: 'button', class: 'thumb-card', role: 'option', 'aria-selected': String(it.id === sel), onclick: () => { sel = it.id; draw(); toast(`サンプル表示：「${it.label}」を選択`, 'mock'); } }, h('div', { class: 'img' }, it.img ? h('img', { src: img(it.img), alt: '', loading: 'lazy' }) : null, h('span', { class: 'fmt' }, it.meta)), h('div', { class: 'cap' }, h('b', null, it.label), 'サンプル'))); };
      draw();
      const filter = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'search', placeholder: '名前で絞り込み', 'aria-label': '名前で絞り込み', style: { maxWidth: '220px' } }));
      filter.addEventListener('input', () => { const q = filter.value.trim().toLowerCase(); for (const el of grid.children) /** @type {HTMLElement} */ (el).hidden = !!q && !el.textContent?.toLowerCase().includes(q); });
      pane.append(h('div', { class: 'pane-head' }, filter, h('span', { class: 'spacer' }), regionTag('mock')), h('div', { class: 'pane-body flush' }, grid));
      region(pane, 'mock');
      break;
    }
    case 'graph': pane.append(h('div', { class: 'pane-head' }, h('h2', null, 'ノードグラフ'), h('span', { class: 'spacer' }), regionTag('mock')), nodeGraph(c)); region(pane, 'mock'); break;
    case 'cards': pane.append(h('div', { class: 'dash' }, c.cards.map((/** @type {any} */ card) => region(h('section', { class: `card span-${card.span}` },
      h('div', { class: 'pane-head' }, h('h2', null, card.title), h('span', { class: 'spacer' }), regionTag(card.status)),
      h('div', { class: 'pane-body' }, card.title === '最近のプロジェクト' && mockProjects.length ? h('p', { class: 'small' }, `画面内で追加：${mockProjects.join('、')}（未保存）`) : null, card.controls.map(control))), card.status)))); break;
    case 'tabsCenter': {
      const t = tabs({ tabs: scopedTabs(c.tabs.map((/** @type {any} */ x) => ({ id: x.id, label: x.label, render: () => renderSections(x.sections) }))), label: s.title });
      pane.append(t.list, t.panel);
      break;
    }
    case 'themeStudy': pane.append(themeStudy()); break;
    case 'help': pane.append(helpPage()); break;
  }
  return pane;
}

/** @type {Record<string, string>} */
const TOOL_ICON = { 選択: 'cursor', 移動: 'move', 回転: 'rotate', 拡大縮小: 'scale', ドリー: 'dolly', オービット: 'orbit', 焦点面: 'focus' };
/** @param {any} c */
function viewport(c) {
  const toolsEl = c.tools ? h('div', { class: 'vp-tools', role: 'toolbar', 'aria-label': 'ビューポートツール' }) : null;
  if (toolsEl) c.tools.forEach((/** @type {string} */ t, /** @type {number} */ i) => toolsEl.append(h('button', { class: 'icon-btn', type: 'button', title: `${t}（サンプル表示）`, 'aria-label': t, 'aria-pressed': String(i === 0), onclick: (/** @type {Event} */ e) => {
    for (const b of toolsEl.children) b.setAttribute('aria-pressed', 'false');
    /** @type {HTMLElement} */ (e.currentTarget).setAttribute('aria-pressed', 'true');
  } }, icon(TOOL_ICON[t] || 'cursor', 16))));
  const vst = c.status || 'unimpl';
  return region(h('div', { class: `viewport ${c.img ? 'has-img' : ''}`, role: 'img', 'aria-label': `${(c.hud || [])[0] || 'ビュー'}（${c.img ? 'サンプル画像。' : ''}3D描画は未接続）` },
    c.img ? h('img', { class: 'vp-img', src: img(c.img), alt: '' }) : null,
    c.plain ? null : h('div', { class: 'vp-frame' }), c.plain || c.img ? null : h('div', { class: 'vp-subject' }),
    c.focusPlane ? h('div', { class: 'vp-focus-plane', style: { top: '46%' } }) : null,
    h('div', { class: 'vp-hud' }, (c.hud || []).map((/** @type {string} */ x) => h('span', null, x)), h('span', { class: 'right' }, c.img ? 'サンプル画像' : 'サンプル表示')),
    toolsEl,
    c.pip ? h('figure', { class: 'vp-pip' }, h('img', { src: img(c.pip), alt: '' }), h('figcaption', null, 'カメラプレビュー（サンプル）')) : null,
    h('div', { class: 'vp-note' }, regionTag(vst, '新UIでの3D描画は未接続です。'), h('span', null, c.foot || '3D描画は未接続です。'))), vst);
}

/** @param {any} c */
function nodeGraph(c) {
  let sel = '';
  const box = h('div', { class: 'graph' });
  const draw = () => {
    box.textContent = '';
    const pos = Object.fromEntries(c.nodes.map((/** @type {any} */ n) => [n.id, n]));
    box.append(svg('svg', { 'aria-hidden': 'true' }, ...c.edges.map((/** @type {string[]} */ [a, b]) => {
      const A = pos[a], B = pos[b];
      const x1 = A.x + 150, y1 = A.y + 22, x2 = B.x, y2 = B.y + 22;
      return svg('path', { d: `M${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}` });
    })));
    for (const n of c.nodes) box.append(h('div', { class: 'node', role: 'button', tabindex: '0', 'aria-selected': String(n.id === sel), style: { left: `${n.x}px`, top: `${n.y}px` }, onclick: () => { sel = n.id; draw(); } }, h('b', null, n.title), n.lines.map((/** @type {string} */ l) => h('span', null, l))));
  };
  draw();
  return box;
}

/**
 * 実データの下部（P2 設計 §2.5 (b)）。同じ外枠（折りたたみ・見出し）の中に FEATURES[key] を置く。
 * @param {Screen} s
 */
function featureBottom(s) {
  const b = /** @type {{type: 'feature', key: string, status: import('./ui.js').Status}} */ (s.bottom);
  const pane = h('section', { class: `pane pane-bottom ${prefs.bottomCollapsed ? 'collapsed' : ''}`, 'aria-label': 'タイムライン' });
  const collapse = h('button', { class: 'icon-btn', type: 'button', 'aria-expanded': String(!prefs.bottomCollapsed), title: 'タイムラインを折りたたむ / 展開', 'aria-label': 'タイムラインを折りたたむ' }, prefs.bottomCollapsed ? '▴' : '▾');
  collapse.addEventListener('click', () => { prefs.bottomCollapsed = !prefs.bottomCollapsed; savePrefs(); pane.classList.toggle('collapsed', prefs.bottomCollapsed); collapse.textContent = prefs.bottomCollapsed ? '▴' : '▾'; collapse.setAttribute('aria-expanded', String(!prefs.bottomCollapsed)); });
  pane.append(
    h('div', { class: 'pane-head' }, collapse, h('h2', null, 'タイムライン'), h('span', { class: 'spacer' }), regionTag(b.status)),
    h('div', { class: 'pane-body' }, ...[featureBlock(/** @type {any} */ ({ t: 'feature', key: b.key }))].flat()));
  return region(pane, b.status);
}

/** @param {Screen} s */
function bottomPane(s) {
  if (s.bottom && s.bottom.type === 'feature') return featureBottom(s);
  const b = /** @type {Extract<NonNullable<Screen['bottom']>, {type: 'timeline'}>} */ (s.bottom);
  const demoEditable = !!b.demoEditable;
  // SCR-26/27 の仮データだけを画面ローカルに複製する。制作状態へ保存しない。
  const tracks = demoEditable ? b.tracks.map((tr) => ({ ...tr, clips: tr.clips?.map((clip) => [...clip]), keys: tr.keys ? [...tr.keys] : undefined })) : b.tracks;
  const pane = h('section', { class: `pane pane-bottom ${prefs.bottomCollapsed ? 'collapsed' : ''}`, 'aria-label': 'タイムライン' });
  let frame = 0, playing = false, timer = 0;
  /** @type {Set<string>} */
  const hidden = new Set();
  const tc = h('span', { class: 'timecode', 'aria-live': 'off' }, timecode(0, b.fps));
  const scrub = /** @type {HTMLInputElement} */ (h('input', { class: 'scrub', type: 'range', min: 0, max: b.frames, value: 0, 'aria-label': '再生位置（フレーム）' }));
  const frameNum = h('span', { class: 'xs muted mono' }, 'F 0');
  const playBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': '再生', title: '再生 / 一時停止（サンプル表示）' }, '▶');
  const grid = h('div', { class: 'timeline' });
  const pct = (/** @type {number} */ f) => `${(f / b.frames) * 100}%`;
  const setFrame = (/** @type {number} */ f) => {
    frame = Math.max(0, Math.min(b.frames, Math.round(f)));
    scrub.value = String(frame); tc.textContent = timecode(frame, b.fps); frameNum.textContent = `F ${frame}`;
    for (const el of grid.querySelectorAll('.tl-head')) /** @type {HTMLElement} */ (el).style.left = pct(frame);
  };
  const stop = () => { playing = false; clearInterval(timer); playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', '再生'); };
  playBtn.addEventListener('click', () => {
    if (playing) return stop();
    playing = true; playBtn.textContent = '❚❚'; playBtn.setAttribute('aria-label', '一時停止');
    timer = window.setInterval(() => { if (!pane.isConnected) return stop(); setFrame(frame + 2 >= b.frames ? 0 : frame + 2); }, 1000 / 30);
  });
  scrub.addEventListener('input', () => setFrame(Number(scrub.value)));
  const draw = () => {
    grid.textContent = '';
    const ticks = 6;
    grid.append(h('div', { class: 'tl-label' }, 'トラック'), h('div', { class: 'tl-ruler' }, Array.from({ length: ticks + 1 }, (_, i) => h('span', { style: { left: `${(i / ticks) * 100}%`, transform: i === 0 ? 'none' : i === ticks ? 'translateX(-100%)' : '' } }, timecode((b.frames * i) / ticks, b.fps).slice(0, 5))), h('i', { class: 'tl-head', style: { left: pct(frame) } })));
    for (const [ti, tr] of tracks.entries()) {
      const off = hidden.has(tr.label);
      const cb = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: !off, 'aria-label': `${tr.label}を表示` }));
      cb.addEventListener('change', () => { if (cb.checked) hidden.delete(tr.label); else hidden.add(tr.label); draw(); });
      const lane = h('div', { class: `tl-track ${off ? 'tl-off' : ''} ${tr.thumbs ? 'tl-tall' : ''}` });
      if (tr.wave) lane.append(h('i', { class: 'tl-wave' }));
      for (const [ci, [a, z, l]] of (tr.clips || []).entries()) {
        const clipEl = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: `tl-clip ${tr.thumbs ? 'has-thumb' : ''} ${demoEditable ? 'tl-demo-clip' : ''}`, style: { left: pct(a), width: `calc(${pct(z - a)} - 2px)`, backgroundImage: tr.thumbs && tr.thumbs[ci] ? `linear-gradient(90deg, rgba(14,16,20,.85) 0 38%, rgba(14,16,20,.15)), url(${img(tr.thumbs[ci])})` : undefined }, title: `${l}（${a}〜${z}f）${demoEditable ? '。本体で移動、端でトリム。保存されません' : ''}`, 'aria-label': `${tr.label} ${l} ${a}〜${z}フレーム`, onclick: () => { if (!demoEditable) setFrame(a); } }, demoEditable ? h('span', { class: 'tl-resize-start', 'aria-hidden': 'true' }) : null, l, demoEditable ? h('span', { class: 'tl-resize-end', 'aria-hidden': 'true' }) : null));
        if (demoEditable) {
          clipEl.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const mode = /** @type {HTMLElement} */ (e.target).classList.contains('tl-resize-start') ? 'start' : /** @type {HTMLElement} */ (e.target).classList.contains('tl-resize-end') ? 'end' : 'move';
            const original = [...tr.clips[ci]];
            const x0 = e.clientX;
            clipEl.setPointerCapture(e.pointerId);
            const move = (/** @type {PointerEvent} */ ev) => {
              const df = Math.round(((ev.clientX - x0) / lane.getBoundingClientRect().width) * b.frames);
              let start = original[0], end = original[1];
              if (mode === 'move') { start = Math.max(0, Math.min(b.frames - (end - start), start + df)); end = start + (original[1] - original[0]); }
              if (mode === 'start') start = Math.max(0, Math.min(end - 1, start + df));
              if (mode === 'end') end = Math.max(start + 1, Math.min(b.frames, end + df));
              tr.clips[ci][0] = start; tr.clips[ci][1] = end;
              clipEl.style.left = pct(start); clipEl.style.width = `calc(${pct(end - start)} - 2px)`;
              clipEl.setAttribute('aria-label', `${tr.label} ${l} ${start}〜${end}フレーム`);
            };
            const done = (/** @type {PointerEvent} */ ev) => { clipEl.removeEventListener('pointermove', move); clipEl.removeEventListener('pointerup', done); clipEl.removeEventListener('pointercancel', done); if (ev.type === 'pointercancel') tr.clips[ci] = original; draw(); setFrame(tr.clips[ci][0]); };
            clipEl.addEventListener('pointermove', move); clipEl.addEventListener('pointerup', done); clipEl.addEventListener('pointercancel', done);
          });
          clipEl.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const d = e.key === 'ArrowRight' ? 1 : -1;
            const c = tr.clips[ci];
            if (e.shiftKey) c[0] = Math.max(0, Math.min(c[1] - 1, c[0] + d));
            else if (e.altKey) c[1] = Math.max(c[0] + 1, Math.min(b.frames, c[1] + d));
            else if (c[0] + d >= 0 && c[1] + d <= b.frames) { c[0] += d; c[1] += d; }
            draw(); setFrame(c[0]);
            /** @type {HTMLElement | undefined} */ (grid.querySelectorAll('.tl-track')[ti]?.querySelectorAll('.tl-clip')[ci])?.focus();
          });
        }
        lane.append(clipEl);
      }
      for (const [ki, k] of (tr.keys || []).entries()) {
        const keyEl = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'tl-key', style: { left: pct(k) }, title: `${tr.label} キー ${k}f${demoEditable ? '。ドラッグで仮移動・保存なし' : ''}`, 'aria-label': `${tr.label} キー ${k}フレーム`, onclick: () => { if (!demoEditable) setFrame(k); } }));
        if (demoEditable) {
          keyEl.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const x0 = e.clientX, original = tr.keys[ki];
            keyEl.setPointerCapture(e.pointerId);
            const move = (/** @type {PointerEvent} */ ev) => { tr.keys[ki] = Math.max(0, Math.min(b.frames, original + Math.round(((ev.clientX - x0) / lane.getBoundingClientRect().width) * b.frames))); keyEl.style.left = pct(tr.keys[ki]); };
            const done = (/** @type {PointerEvent} */ ev) => { keyEl.removeEventListener('pointermove', move); keyEl.removeEventListener('pointerup', done); keyEl.removeEventListener('pointercancel', done); if (ev.type === 'pointercancel') tr.keys[ki] = original; draw(); setFrame(tr.keys[ki]); };
            keyEl.addEventListener('pointermove', move); keyEl.addEventListener('pointerup', done); keyEl.addEventListener('pointercancel', done);
          });
          keyEl.addEventListener('keydown', (e) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); tr.keys[ki] = Math.max(0, Math.min(b.frames, tr.keys[ki] + (e.key === 'ArrowRight' ? 1 : -1))); draw(); setFrame(tr.keys[ki]); /** @type {HTMLElement | undefined} */ (grid.querySelectorAll('.tl-track')[ti]?.querySelectorAll('.tl-key')[ki])?.focus(); });
        }
        lane.append(keyEl);
      }
      if (tr.keys && !tr.keys.length) lane.append(h('span', { class: 'xs muted', style: { position: 'absolute', left: '8px', top: '4px' } }, 'キーなし'));
      lane.append(h('i', { class: 'tl-head', style: { left: pct(frame) } }));
      lane.addEventListener('dblclick', (e) => { const r = lane.getBoundingClientRect(); setFrame(((e.clientX - r.left) / r.width) * b.frames); });
      grid.append(h('div', { class: `tl-label ${tr.thumbs ? 'tl-tall' : ''}` }, cb, tr.label), lane);
    }
  };
  draw();
  const collapse = h('button', { class: 'icon-btn', type: 'button', 'aria-expanded': String(!prefs.bottomCollapsed), title: 'タイムラインを折りたたむ / 展開', 'aria-label': 'タイムラインを折りたたむ' }, prefs.bottomCollapsed ? '▴' : '▾');
  collapse.addEventListener('click', () => { prefs.bottomCollapsed = !prefs.bottomCollapsed; savePrefs(); pane.classList.toggle('collapsed', prefs.bottomCollapsed); collapse.textContent = prefs.bottomCollapsed ? '▴' : '▾'; collapse.setAttribute('aria-expanded', String(!prefs.bottomCollapsed)); });
  pane.append(
    h('div', { class: 'pane-head' }, collapse, h('h2', null, 'タイムライン'), h('div', { class: 'transport' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '先頭へ', onclick: () => setFrame(0) }, '⏮'), playBtn,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '末尾へ', onclick: () => setFrame(b.frames) }, '⏭'), tc, frameNum), scrub,
      h('span', { class: 'xs muted mono' }, `${b.fps}fps`), regionTag(b.status),
      demoEditable ? h('span', { class: 'xs muted' }, '仮データ・未保存') : h('button', { class: 'btn is-unimpl', type: 'button', onclick: () => showUnimplemented({ name: 'キーフレームを追加', why: '新UIのタイムラインは表示とシーク操作のみです。キー編集は現行のカメラ画面・制作画面で行います（共通タイムラインは DATA-001）。', ids: ['DATA-001', 'CAM-003'], phase: PH.P2 }) }, 'キー追加')),
    h('div', { class: 'pane-body flush' }, demoEditable ? h('p', { class: 'timeline-demo-note' }, 'サンプル操作：区間の本体を動かすと長さを維持、端を動かすと開始／終了だけを調整。キーも移動できます。変更は保存されず、再読込で戻ります。') : null, grid));
  return region(pane, b.status);
}

/* ---------- home (SCR-01) ---------- */
/** @param {string} title @param {import('./ui.js').Status} st @param {Node | null} more @param {...any} body */
const block = (title, st, more, ...body) => region(h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', null, title), regionTag(st), h('span', { class: 'spacer' }), more), ...body), st);
/** @param {string} label @param {string} id */
const navLink = (label, id) => h('button', { type: 'button', class: 'link-btn', dataset: { act: 'nav' }, onclick: () => navigate(id) }, label, ' ›');

/** @param {any} c */
function homeView(c) {
  const hero = h('section', { class: 'hero' },
    h('img', { class: 'hero-img', src: img('hero'), alt: '' }),
    h('div', { class: 'hero-copy' },
      h('p', { class: 'eyebrow' }, 'BAI CREATOR STUDIO'),
      h('h2', null, '創る、撮る、繋ぐ。', h('br'), 'すべてをひとつのスタジオで。'),
      h('p', { class: 'lead' }, '3D・カメラ・アニメーション・VMD・AI をひとつにまとめた制作環境'),
      h('div', { class: 'btn-row' },
        actionButton(newProjectUnimpl('新規プロジェクト', { primary: true })),
        actionButton({ t: 'btn', label: '紹介ムービーを再生', act: 'unimpl', why: '紹介ムービー・動画チュートリアルはまだありません。', ids: ['NF-015'], phase: PH.P4 }))),
    h('ul', { class: 'hero-steps', 'aria-label': 'できること' }, ['キャラクターを動かす', 'シーンで魅せる', 'カメラで語る', 'エフェクトで彩る', 'AIで広げる'].map((x) => h('li', null, x))),
    h('span', { class: 'sample-tag' }, 'サンプル画像'));

  const projects = block('最近のプロジェクト', 'real', navLink('保存・復元へ', '18'),
    h('div', { class: 'card-row cols-4' }, FEATURES.projectCard(makeCtx(), { t: 'feature', key: 'projectCard' })),
    h('p', { class: 'section-note', dataset: { role: 'project-note' } }, '複数のプロジェクト管理は未実装です（新規作成は ◇）。今のサーバーの制作状態は1つです。'));

  /** @type {[string, string, string, string][]} */
  const qa = [['plus', '新規プロジェクト', '作品制作を開始', 'unimpl:newProject'], ['stage', 'シーンを作成', 'ステージ・背景を配置', 'nav:06'], ['user', 'キャラクターを追加', 'モデルを読み込み', 'nav:12'], ['motion', 'モーションを読み込み', 'VMD・モーション', 'nav:13'], ['camera', 'カメラを設定', 'カメラワーク・プリセット', 'nav:02'],
    ['sparkle', 'マテリアル・効果', '質感・演出', 'nav:09'], ['render', 'レンダリング', '書き出し・バッチ', 'nav:17'], ['folder', '素材を管理', 'モデル・ステージ・音楽', 'nav:08'], ['focus', 'ピントを診断', 'フォーカス・DOF', 'nav:03'], ['plug', 'MCP連携', 'AI・外部ツール', 'nav:19']];
  const quick = block('クイックアクション', 'partial', null, h('div', { class: 'qa-grid' }, qa.map(([ic, t, sub, act]) => h('button', { type: 'button', class: 'qa', dataset: { act: act.split(':')[0] }, onclick: () => runAction(act === 'unimpl:newProject' ? newProjectUnimpl(t) : { t: 'btn', label: t, act }) },
    h('span', { class: 'qa-ico' }, icon(ic, 22)), h('span', null, h('b', null, t), h('span', { class: 'xs muted' }, sub))))));

  const renders = block('最近のレンダリング', 'mock', navLink('すべて見る', '17'), h('div', { class: 'card-row cols-4 compact' }, RENDERS.map((r) => h('button', { type: 'button', class: 'media-card', onclick: () => toast(`サンプル表示：「${r.name}」は仮の書き出し結果です。`, 'mock') },
    h('div', { class: 'media' }, h('img', { src: img(r.img), alt: '', loading: 'lazy' }), h('span', { class: 'dur mono' }, r.dur)),
    h('div', { class: 'media-body' }, h('b', { class: 'small' }, r.name), h('span', { class: 'xs muted' }, `${r.spec}・サンプル`))))));

  const recentBlock = block('最近の素材', 'real', navLink('素材管理へ', '08'), FEATURES.recentImports(makeCtx(), { t: 'feature', key: 'recentImports' }));

  const rest = (c.cards || []).filter((/** @type {any} */ card) => !['最近のプロジェクト', 'クイックアクション'].includes(card.title));
  return h('div', { class: 'home' }, hero, projects, quick, h('div', { class: 'home-split' }, renders, recentBlock),
    h('div', { class: 'dash flush' }, rest.map((/** @type {any} */ card) => region(h('section', { class: `card span-${card.span}` },
      h('div', { class: 'pane-head' }, h('h2', null, card.title), h('span', { class: 'spacer' }), regionTag(card.status)),
      h('div', { class: 'pane-body' }, card.title === '新規作成' && mockProjects.length ? h('p', { class: 'small' }, `画面内で追加：${mockProjects.join('、')}（未保存）`) : null, card.controls.map(control))), card.status))));
}

/* ---------- special pages ---------- */
function themeStudy() {
  /** @param {string} id @param {string} name @param {string} desc @param {string[]} colors */
  const card = (id, name, desc, colors) => h('button', { type: 'button', class: 'swatch-card', 'aria-pressed': String(prefs.theme === id), onclick: () => { prefs.theme = id; savePrefs(); render(); toast(`テーマ「${name}」に切り替えました（このブラウザに保存）。`, 'real'); }, style: { textAlign: 'left', cursor: 'pointer' } },
    h('b', null, name, id === 'night' ? '（既定）' : '（切替可）'), h('div', { class: 'swatches' }, colors.map((c) => h('i', { style: { background: c } }))), h('p', { class: 'small muted', style: { margin: 0 } }, desc));
  return h('div', { class: 'doc' },
    h('h2', null, 'デザイン比較'), h('p', null, '参考画像の画面構成・画像の多さはそのまま活かし、AIっぽい青紫ネオンだけを外しました。既定は深いスレート＋琥珀色のナイトです。色は選択中・主操作・状態表示にだけ使います。'),
    h('div', { class: 'compare' },
      card('night', 'N: ナイト', '深いスレート（青みの黒）＋琥珀色アクセント。参考画像の暗く引き締まった雰囲気を保ちつつ、紫・ネオン発光を使わない。映像・画像が主役になる配色。', ['#0c0f13', '#151a20', '#252c36', '#e9ecf0', '#e2a54c']),
      card('graphite', 'A: グラファイト', '温かみのあるチャコール＋真鍮色アクセント。3Dビュー・映像の色を邪魔しない暗色。DaVinci Resolve や Blender の作業密度を参考に、グラデーション・発光なし。', ['#1d1c1a', '#232220', '#34322f', '#e6e2da', '#c79b55']),
      card('paper', 'B: ペーパー', 'オフホワイト＋深緑アクセント。文書・設定・素材整理の多い作業向けの明色。ビューポートだけは暗色を維持。', ['#efede8', '#f7f6f2', '#d6d2c9', '#22211e', '#2f6b53'])),
    h('h3', null, '採用理由'),
    h('ul', null, h('li', null, '映像制作では素材の色判断が重要なため、UIは低彩度の暗色を既定にする（N）。'), h('li', null, 'アクセントは1色に限定し、選択・現在位置・主操作だけに使う。'), h('li', null, '状態（実機能・既存部分・サンプル・未実装）は色だけでなく文字と枠線の種類でも区別する。')),
    h('p', { class: 'small muted' }, '詳細：docs/ui/STUDIO_DESIGN_SYSTEM_JA.md'));
}

function helpPage() {
  /** @type {boolean[]} */
  const done = [false, false, false, false];
  const steps = h('ol', { class: 'steps' });
  const drawSteps = () => {
    steps.textContent = '';
    ['Python サーバーを起動（npm start または 起動.bat）', 'ブラウザで http://127.0.0.1:8765/workspace/01 を開く', '現行画面（/）で素材を登録する', 'カメラ画面（/camera.html）で撮影を確認する'].forEach((t, i) => steps.append(h('li', { 'data-done': String(done[i]) }, h('label', { class: 'switch', style: { margin: 0 } }, h('input', { type: 'checkbox', checked: done[i], onchange: () => { done[i] = !done[i]; drawSteps(); } }), t))));
  };
  drawSteps();
  const guides = [['ダンスMVのカメラを作る', '02'], ['ピントの外れを調べる', '03'], ['VMDを確認・リターゲットする', '13'], ['カメラVMDを読み書きする', '15'], ['制作状態を確認する', '18'], ['不具合を報告する（診断ZIP）', '24']];
  const faq = [
    ['この新UIで保存できますか？', '「プロジェクト保存・復元（18）」でコンビネーション・カメラ・作業中の素材参照を保存・復元できます。それ以外の保存・変換はまだ「現行画面」から行います。「実機能」表示の箇所だけが既存APIにつながっています。'],
    ['「◇ 未実装」は何ですか？', 'まだ実装していない機能です。押すと説明と、ロードマップ上の予定（承認済みフェーズ／未承認候補）を表示します。'],
    ['「サンプル表示」の数値は本物ですか？', 'いいえ。画面内だけの仮データで、保存も計算もしていません。'],
    ['現行の画面はなくなりますか？', 'なくなりません。既存機能は段階的に新UIへ移植し、移植が終わるまで現行画面を残します。'],
  ];
  const glossary = [['VMD', 'MMD のモーション／カメラデータ形式'], ['PMX', 'MMD のモデル形式'], ['DOF', '被写界深度（ピントの合う奥行き範囲）'], ['リターゲット', '別の骨格へモーションを移し替えること'], ['WebMCP / 標準MCP', 'AI からアプリを操作するための接続方式（手動UIと同じAPIを使う）']];
  const t = tabs({ label: 'ヘルプ', tabs: [
    { id: 'welcome', label: 'ウェルカム', render: () => h('div', { class: 'doc' }, h('h2', null, 'BAI Creator Studio 新UI（操作モック）'), h('p', null, '27画面の導線を確認するための新しい画面です。左のメニュー、上部の戻る・進む、Ctrl+K の画面検索で移動できます。'), h('p', { dataset: { legend: '1' } }, '凡例：', badge('real'), ' ', badge('partial'), ' ', badge('mock'), ' ', badge('unimpl'))) },
    { id: 'setup', label: '初回セットアップ', render: () => region(h('div', { class: 'doc' }, h('h2', null, '初回セットアップ', regionTag('mock')), h('p', { class: 'small muted' }, 'チェックは画面内だけで、保存されません。'), steps), 'mock') },
    { id: 'guides', label: '目的別ガイド', render: () => h('div', { class: 'doc' }, h('h2', null, '目的別ガイド'), h('ul', { class: 'list' }, guides.map(([l, id]) => h('li', { onclick: () => navigate(id) }, h('span', { class: 'nav-num' }, id), l, h('span', { class: 'meta' }, '開く →'))))) },
    { id: 'video', label: '動画', render: () => h('div', { class: 'doc' }, h('h2', null, '動画チュートリアル'), h('div', { class: 'empty' }, '◇ 未実装：動画チュートリアルはまだありません。')) },
    { id: 'manual', label: 'マニュアル', render: () => region(h('div', { class: 'doc' }, h('h2', null, 'マニュアル', regionTag('partial')), h('p', null, 'リポジトリ内の日本語文書：AI不要_通常利用ガイド.md、DEVELOPER_GUIDE_JA.md、MCP_SETUP_JA.md、docs/roadmap/README_JA.md。')), 'partial') },
    { id: 'faq', label: 'FAQ', render: () => h('div', { class: 'doc' }, h('h2', null, 'よくある質問'), faq.map(([q, a]) => h('details', { class: 'faq' }, h('summary', null, q), h('p', null, a)))) },
    { id: 'glossary', label: '用語集', render: () => h('div', { class: 'doc' }, h('h2', null, '用語集'), h('dl', { class: 'kv' }, glossary.map(([k, v]) => [h('dt', null, k), h('dd', { style: { fontFamily: 'var(--font)' } }, v)]))) },
  ] });
  return h('div', { style: { display: 'flex', flexDirection: 'column', minHeight: '0', flex: '1' } }, t.list, t.panel);
}

/* ---------- screen ---------- */
/** 画面の再描画のたびに実行する後始末（購読の解除・タイマーの停止・three.js の破棄）。設計 §1.6-3。 */
/** @type {(() => void)[]} */
let cleanups = [];
/** @type {URLSearchParams} */
let currentParams = new URLSearchParams();
let currentScreenId = '';
/** @returns {import('./features/index.js').FeatureCtx} */
function makeCtx() {
  return { screenId: currentScreenId, params: currentParams, navigate, onCleanup: (fn) => { cleanups.push(fn); } };
}
function runCleanups() {
  for (const f of cleanups.splice(0)) { try { f(); } catch (e) { console.error(e); } }
}

const main = /** @type {HTMLElement} */ (document.getElementById('main'));
const crumb = /** @type {HTMLElement} */ (document.getElementById('breadcrumb'));
let lastId = '';
/** 模擬の再生・位置スライダー・シーンツリーのある画面（導線点検 §5-4）。 */
const SAMPLE_PLAYBACK_SCREENS = ['02', '05', '06', '13'];

function render() {
  const { id, tab, params } = parseLocation();
  const s = SCREENS.find((x) => x.id === id);
  runCleanups(); // 同じ画面の再描画（タブ切替・テーマ変更など）でも毎回行う
  currentParams = params;
  currentScreenId = id;
  for (const a of document.querySelectorAll('a[data-route]')) {
    if (/** @type {HTMLElement} */ (a).dataset.route === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  main.textContent = '';
  if (!s) {
    document.title = '画面が見つかりません — BAI Creator Studio';
    crumb.textContent = '画面が見つかりません';
    main.append(h('div', { class: 'doc' }, h('h2', null, `画面 ${id} はありません`), h('p', null, '01〜27 の画面を開けます。'), h('button', { class: 'btn primary', type: 'button', onclick: () => navigate('01') }, 'ホームへ')));
    return;
  }
  document.title = `${s.id} ${s.title} — BAI Creator Studio`;
  crumb.textContent = '';
  crumb.append('Studio › ', s.group, ' › ', h('b', null, `${s.id} ${s.title}`));
  main.dataset.screen = s.id;

  const cameraFull = s.id === '02' && s.center.type === 'feature' && s.center.key === 'cameraHost';

  const head = h('div', { class: 'screen-head' }, h('span', { class: 'screen-id' }, `SCR-${s.id}`), h('h1', null, s.title),
    s.modes ? modeSwitch(s.modes, s, tab) : null,
    h('div', { class: 'tools', role: 'toolbar', 'aria-label': '画面の操作' },
      s.left && !cameraFull ? h('button', { class: 'btn ghost only-mid', type: 'button', title: '左パネルの表示切替', onclick: () => ws.classList.toggle('show-left') }, '☰ ' + s.left.title) : null,
      (s.tools || []).map((c) => { const el = control(c); return el; }),
      h('span', { class: 'sep' }),
      dropdown('表示', [
        { label: 'タイムラインを折りたたむ / 展開', onSelect: () => { prefs.bottomCollapsed = !prefs.bottomCollapsed; savePrefs(); render(); } },
        { label: `テーマ：${prefs.theme === 'paper' ? 'ナイトに切替' : 'ペーパーに切替'}`, onSelect: () => { prefs.theme = prefs.theme === 'paper' ? 'night' : 'paper'; savePrefs(); } },
        { label: '実装状態タブを開く', onSelect: () => navigate(s.id, { replace: true, tab: 'status', query: s.id === '27' ? { mode: lyricMode(tab) } : undefined }) },
      ], 'btn ghost')));
  const ws = h('div', { class: `ws ${cameraFull ? 'camera-full' : s.left ? '' : 'no-left'}` });
  if (s.left && !cameraFull) ws.append(leftPane(s));
  ws.append(centerPane(s));
  if (!cameraFull) ws.append(rightPane(s, tab));
  if (s.bottom && !cameraFull) ws.append(bottomPane(s));
  // 模擬の再生・位置スライダー・シーンツリーが実機能に見えないよう常時表示する（導線点検 §5-4）。
  // 条件は「その画面の 3D ビューの区画の status が real でない」こと。WP-04・05・06 で real にしたら自動で消える。
  const c3 = s.center;
  const viewStatus = c3.status || (c3.type === 'viewport' ? 'unimpl' : 'mock');
  const banner = SAMPLE_PLAYBACK_SCREENS.includes(s.id) && viewStatus !== 'real'
    ? h('div', { class: 'sample-banner', role: 'status', dataset: { role: 'sample-playback' } }, h('b', null, 'サンプル再生（3D未接続）'), '　この画面の再生・位置・ツリーの操作は画面内の仮動作で、3D表示は動きません。')
    : null;
  main.append(head);
  if (banner) main.append(banner);
  main.append(ws);
  if (lastId && lastId !== s.id) main.focus({ preventScroll: true });
  lastId = s.id;
}

/** @param {string|null} tab */
function lyricMode(tab) {
  const value = new URLSearchParams(location.search).get('mode');
  if (value === 'quick' || value === 'detail') return value;
  return tab && tab !== 'quick' && tab !== 'status' ? 'detail' : 'quick';
}

/** @param {string[]} modes @param {Screen} s @param {string|null} tab */
function modeSwitch(modes, s, tab) {
  const box = h('div', { class: 'mode-switch', role: 'group', 'aria-label': 'モード' });
  const editMode13 = new URLSearchParams(location.search).get('mode') === 'edit';
  modes.forEach((m, i) => box.append(h('button', { type: 'button', dataset: s.id === '13' ? { mode: i === 0 ? 'compare' : 'edit' } : undefined, 'aria-pressed': String(s.id === '27' ? (lyricMode(tab) === 'detail' ? i === 1 : i === 0) : s.id === '13' ? (i === 1) === editMode13 : i === 0), onclick: (/** @type {Event} */ e) => {
    if (s.id === '27') { navigate('27', { replace: true, tab: i === 0 ? 'quick' : 'cues', query: { mode: i === 0 ? 'quick' : 'detail' } }); return; }
    if (s.id === '13') { // ⑤ WP-05a：［比較］［編集］を URL の ?mode= に結線する（他の画面はトーストのまま）
      const query = Object.fromEntries(new URLSearchParams(location.search));
      delete query.tab;
      navigate('13', { replace: true, tab, query: { ...query, mode: i === 0 ? 'compare' : 'edit' } });
      return;
    }
    for (const b of box.children) b.setAttribute('aria-pressed', 'false');
    /** @type {HTMLElement} */ (e.currentTarget).setAttribute('aria-pressed', 'true');
    toast(`サンプル表示：${m}モード（表示の切替のみ）`, 'mock');
  } }, m)));
  return box;
}

buildNav();
// 制作状態の読込・外部変更の検知は、どの画面から開いても1回だけ始める（P2 設計 §2.2(d)-1）。
void loadProject();
startExternalSync();
installUnloadGuard();
// 保存・復元（18）以外の画面では、制作状態に注意が要る状態へ変わったときにトーストで知らせる（設計 §2.2(b)。トップバーの印は作らない）。
{
  let lastKey = '';
  const ATTENTION = new Set(['offline', 'error', 'sync-error', 'camera-invalid', 'camera-recovered', 'external']);
  project.subscribe((st) => {
    const d = describeStatus(st);
    if (d.key === lastKey) return;
    lastKey = d.key;
    if (currentScreenId !== '18' && ATTENTION.has(d.key)) toast(`プロジェクト：${d.text}（保存・復元（18）で確認できます）`, 'err');
  });
}
if (location.pathname === '/workspace' || location.pathname === '/workspace/') navigate('01', { replace: true });
else render();

// Exposed for browser tests and future WebMCP adapters (read-only view of the mock).
/** @type {any} */ (window).baiStudio = { screens: SCREENS.map((s) => ({ id: s.id, title: s.title, panels: s.panels.map((p) => ({ name: p.name, status: p.status })) })), navigate, statusLabels: STATUS_LABEL,
  // 読み取り専用（テスト用）。書き込みの関数は公開しない。
  project: { getState: () => project.get() }, assets: { getState: () => assets.get() }, cleanupCount: () => cleanups.length,
  // 今ある再生ビューの状態（⑤。読み取り専用。SCR-13［編集］でなければ null）
  motion: { getState: () => { const m = currentMotion(); return m ? m.getState() : null; }, probe: (/** @type {any} */ q) => { const m = currentMotion(); return m ? m.probe(q) : null; } },
  chain: { getState: () => currentChainControl()?.getState() || null, probe: (/** @type {any} */ q) => currentChainControl()?.probe(q) || null },
  timeline: { getState: () => currentTimeline()?.getState() || null },
  // 今ある3Dビューポートの状態（④。読み取り専用。3D 画面でなければ loaded:false）
  viewport: {
    getState: () => { const v = currentViewport(); return v ? v.getState() : { loaded: false, assetId: null, format: null, scale: null, offset: null, renderer: 'unknown', stage: null, character: null }; },
    countNonBackground: () => { const v = currentViewport(); return v ? v.countNonBackground() : 0; },
  } };
