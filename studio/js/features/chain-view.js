// @ts-check
// ⑤ SCR-05：82パターンの一覧・お気に入り・コンビネーションの編集・速度（P2 設計 §2.5 WP-05c。3D は 05d）。
//  - patternList：左「モーション検索」。［パターン］（82パターン・分類・検索・👑）と［★ お気に入り］の切替。
//  - chainTimeline：下部「タイムライン」。トラック「体」にコンビネーションを並べ、並べ替え・削除・全消去・お気に入りへの保存。
//  - playbackSettings：右「レイヤー」タブの節「再生」。速度＝コンビネーションの playbackSpeed。
// コンビネーションを書く経路は project.js の editCombination（履歴に積み、②の自動保存で保存）だけ。
// 外部コマンド preview_motion（O-⑤-5）は SCR-05 が表示されているときだけ反応する（play_chain・stop_chain は 05d）。
import { h, openModal, closeModal, showUnimplemented, toast as uiToast, selectField, toggle } from '../ui.js';
import { createStore, project } from '../store.js';
import { on } from '../bus.js';
import { getJson } from '../api.js';
import { stateBox } from '../state-box.js';
import { PH } from '../screens.js';
import { ROWS, motionKeys, isAvailable } from '../motion/patterns.fork.js';
import { editCombination, setCombinationSelected, setCombinationSpeed } from './project.js';
import { favoritesClient, filterFavorites, parseTags } from './favorites.js';
import { currentChainControl } from '../motion/chain-runtime.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */
/** @typedef {import('./favorites.js').Favorite} Favorite */

const CROWN = '👑';
const SPEEDS = [0.5, 1, 1.5, 2];

/** SCR-05 の表示の状態（画面の中だけ。保存しない）。 */
export const chainUi = createStore({
  /** @type {'catalog'|'favorites'} */ tab: 'catalog',
  q: '',
  cat: '',
  favQ: '',
  /** 登録済みモーション（/api/manifest） @type {{status: 'idle'|'loading'|'ready'|'error', files: any[], mapping: Record<string, string>, error: any}} */
  manifest: { status: 'idle', files: [], mapping: {}, error: null },
  /** お気に入り（/api/favorites） @type {{status: 'idle'|'loading'|'ready'|'error', list: Favorite[], error: any}} */
  favs: { status: 'idle', list: [], error: null },
  /** 最後に読み込む／保存したお気に入り（旧 activeCombo。画面の中だけ） @type {Favorite|null} */
  active: null,
  /** 下部で選んでいる手順の番号（無ければ -1） */ stepSel: -1,
  /** 帯の案内（保存の結果など）。空ならコンビネーションの件数から決める */ notice: '',
});

const isScreen05 = () => /^\/workspace\/05\/?$/.test(location.pathname);

let manifestSeq = 0;
/** 登録済みモーションを読む。表示中の一覧は残したまま読み直す。 */
export async function loadManifest() {
  const my = ++manifestSeq;
  const cur = chainUi.get().manifest;
  chainUi.set({ manifest: { ...cur, status: cur.status === 'ready' ? 'ready' : 'loading', error: null } }, 'manifest');
  const r = await getJson('/api/manifest');
  if (my !== manifestSeq) return;
  if (!r.ok) { chainUi.set({ manifest: { ...chainUi.get().manifest, status: 'error', error: r } }, 'manifest'); return; }
  const d = /** @type {any} */ (r.data) || {};
  chainUi.set({ manifest: { status: 'ready', files: Array.isArray(d.files) ? d.files : [], mapping: d.mapping && typeof d.mapping === 'object' ? d.mapping : {}, error: null } }, 'manifest');
}

let favSeq = 0;
export async function loadFavorites() {
  const my = ++favSeq;
  const cur = chainUi.get().favs;
  chainUi.set({ favs: { ...cur, status: cur.status === 'ready' ? 'ready' : 'loading', error: null } }, 'favs');
  const r = await favoritesClient.load();
  if (my !== favSeq) return;
  if (!r.ok) { chainUi.set({ favs: { ...chainUi.get().favs, status: 'error', error: r } }, 'favs'); return; }
  chainUi.set({ favs: { status: 'ready', list: r.list, error: null } }, 'favs');
}

/* ---------------------------------------------------------------- 外部コマンド（O-⑤-5） */

/** SCR-05 が表示されている間だけある受け口。 @type {{ctx: FeatureCtx}|null} */
let cmdTarget = null;
/** @type {Set<string>} */
const seenCommands = new Set();

/** preview_motion：steps に name を含む／title===name の最初の行を選ぶ（index.html:441）。 @param {string} name */
function previewMotion(name) {
  const row = ROWS.find((r) => r.steps.includes(name) || r.title === name);
  if (!row) { uiToast(`外部からの指示：${name} に合うパターンがありません`, 'err'); return; }
  chainUi.set({ tab: 'catalog', q: '', cat: '' }, 'command');
  if (!setCombinationSelected(row.id)) {
    const c = project.get().bundle?.combination;
    if (!c || c.selected !== row.id) uiToast('制作状態を読み込んでいます。少し待ってからもう一度お試しください。', 'err');
  }
  queueMicrotask(() => document.querySelector(`[data-feature="patternList"] li[data-pattern-id="${row.id}"]`)?.scrollIntoView({ block: 'nearest' }));
}

on('studio:sync-command', (/** @type {any} */ cmd) => {
  if (!cmd || !['preview_motion', 'play_chain', 'stop_chain'].includes(cmd.action)) return;
  const key = `chain:${cmd.id}`;
  if (seenCommands.has(key)) return;
  seenCommands.add(key);
  if (seenCommands.size > 200) seenCommands.delete(/** @type {string} */ (seenCommands.values().next().value));
  if (cmdTarget && isScreen05()) {
    if (cmd.action === 'preview_motion') previewMotion(String(cmd.name || ''));
    else if (cmd.action === 'play_chain') void currentChainControl()?.play();
    else currentChainControl()?.stop();
    return;
  }
  uiToast(`外部から再生の指示（${cmd.action}）がありました。モーション（初期）の画面（05）を開いているときだけ反応します。`, 'real');
});

/** @type {WeakSet<URLSearchParams>} */
const booted = new WeakSet();
/** 画面を開くたびに1回だけ：登録状況とお気に入りを読み、受け口を置く。 @param {FeatureCtx} ctx */
function boot(ctx) {
  if (booted.has(ctx.params)) return;
  booted.add(ctx.params);
  void loadManifest();
  void loadFavorites();
  const me = { ctx };
  cmdTarget = me;
  ctx.onCleanup(() => { if (cmdTarget === me) cmdTarget = null; });
  ctx.onCleanup(on('studio:assets-refresh', () => { void loadManifest(); })); // FBX が登録・割当されたとき👑を更新する
}

/* ---------------------------------------------------------------- 共通 */

/** @param {ReturnType<typeof project.get>} s */
const comboOf = (s) => (s.status === 'ready' && s.bundle ? s.bundle.combination : null);
/** 今の手順の並び。 @returns {{name: string}[]} */
const currentTimeline = () => { const c = comboOf(project.get()); return c && Array.isArray(c.timeline) ? c.timeline : []; };

/**
 * ストアの変化のうち必要な部分が変わったときだけ描き直す。
 * @param {FeatureCtx} ctx @param {() => void} render @param {() => any} sig
 */
function watch(ctx, render, sig) {
  let last = '';
  const run = () => { const next = JSON.stringify(sig()); if (next === last) return; last = next; render(); };
  run();
  ctx.onCleanup(project.subscribe(run));
  ctx.onCleanup(chainUi.subscribe(run));
}

/** @param {ReturnType<typeof project.get>} s @returns {HTMLElement|null} */
function projectNotReady(s) {
  if (s.status === 'idle' || s.status === 'loading') return stateBox({ kind: 'loading', title: '読込中…', message: '制作状態を読み込んでいます。' });
  if (s.status === 'error') {
    const off = !!s.error && (s.error.code === 'offline' || s.error.code === 'timeout');
    return stateBox({ kind: off ? 'offline' : 'error', title: off ? '未接続' : '読み込めません', message: s.error ? s.error.message : '' });
  }
  return null;
}

/** @param {{title: string, body: string, ok: string}} o @returns {Promise<boolean>} */
function confirmDialog({ title, body, ok }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (/** @type {boolean} */ v) => { if (done) return; done = true; closeModal(); resolve(v); };
    openModal({
      title, body: [h('p', null, body)],
      footer: [
        h('button', { class: 'btn ghost', type: 'button', dataset: { role: 'confirm-cancel' }, onclick: () => finish(false) }, 'キャンセル'),
        h('button', { class: 'btn', type: 'button', dataset: { role: 'confirm-ok' }, onclick: () => finish(true) }, ok),
      ],
      onClose: () => { if (!done) { done = true; resolve(false); } },
    });
  });
}

/* ---------------------------------------------------------------- 左：モーション検索 */

/** @param {FeatureCtx} ctx */
export const patternList = (ctx) => {
  boot(ctx);

  const tabBtn = (/** @type {'catalog'|'favorites'} */ id, /** @type {string} */ label) => h('button', {
    class: 'btn', type: 'button', dataset: { role: 'pattern-tab', tab: id }, onclick: () => chainUi.set({ tab: id }, 'tab'),
  }, label);
  const tCatalog = tabBtn('catalog', 'パターン');
  const tFavs = tabBtn('favorites', '★ お気に入り');

  // パターン
  const search = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'search', placeholder: '番号・名前・Mixamo名で検索', 'aria-label': 'パターンを検索', dataset: { role: 'pattern-search' } }));
  search.addEventListener('input', () => chainUi.set({ q: search.value }, 'q'));
  const catSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '分類', dataset: { role: 'pattern-cat' } },
    h('option', { value: '' }, 'すべての分類'), ...[...new Set(ROWS.map((r) => r.category))].map((c) => h('option', { value: c }, c))));
  catSel.addEventListener('change', () => chainUi.set({ cat: catSel.value }, 'cat'));
  const addBtn = /** @type {HTMLButtonElement} */ (h('button', {
    class: 'btn primary', type: 'button', dataset: { act: 'real', role: 'chain-add' },
    title: '選んだパターンの手順を、コンビネーションの末尾へ足します', onclick: () => addSelected(),
  }, '＋ コンビネーションに追加'));
  const legend = h('div', { class: 'small muted', dataset: { role: 'pattern-legend' }, 'aria-live': 'polite' });
  const list = h('ul', { class: 'list char-list pattern-list', role: 'listbox', 'aria-label': '82パターン', dataset: { role: 'pattern-list' } });
  const catalogPane = h('div', { class: 'stack', dataset: { pane: 'catalog' } }, addBtn, h('div', { class: 'searchbar' }, search), catSel, legend, list);

  // お気に入り
  const favSearch = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'search', placeholder: '名前・タグ・手順で検索', 'aria-label': 'お気に入りを検索', dataset: { role: 'fav-search' } }));
  favSearch.addEventListener('input', () => chainUi.set({ favQ: favSearch.value }, 'favQ'));
  const favList = h('div', { class: 'stack', dataset: { role: 'fav-list' } });
  const favPane = h('div', { class: 'stack', dataset: { pane: 'favorites' } }, h('div', { class: 'searchbar' }, favSearch), favList);

  const root = h('div', { class: 'stack', dataset: { feature: 'patternList' } },
    h('div', { class: 'btn-row', role: 'group', 'aria-label': '表示' }, tCatalog, tFavs), catalogPane, favPane);

  function addSelected() {
    const s = project.get();
    const c = comboOf(s);
    if (!c) { uiToast('制作状態を読み込んでいます。少し待ってからもう一度お試しください。', 'err'); return; }
    const row = ROWS.find((r) => r.id === c.selected);
    if (!row) { uiToast('追加するパターンを選んでください。', 'err'); return; }
    const m = chainUi.get().manifest;
    if (m.status !== 'ready') { uiToast('FBX の登録状況を確認できていません。少し待ってからもう一度お試しください。', 'err'); return; }
    if (!isAvailable(row, motionKeys(m), m.mapping)) {
      uiToast('このモーションは実FBXが未登録です。FBXを登録・割当してから追加してください。', 'err'); // index.html:126 の文言
      chainUi.set({ notice: '追加できていません。FBX管理からモーションを登録し、対応付けを確認してください。' }, 'notice');
      return;
    }
    const next = [...currentTimeline(), ...row.steps.map((name) => ({ name }))];
    editCombination(next, { label: `追加：${String(row.id).padStart(2, '0')} ${row.title}` });
    chainUi.set({ active: null, notice: '' }, 'add');
  }

  /** @param {number} id */
  function selectRow(id) {
    if (!comboOf(project.get())) { uiToast('制作状態を読み込んでいます。少し待ってからもう一度お試しください。', 'err'); return; }
    setCombinationSelected(id);
  }

  function drawCatalog() {
    const ui = chainUi.get();
    const m = ui.manifest;
    const keys = motionKeys(m);
    const ready = m.status === 'ready';
    const avail = (/** @type {typeof ROWS[number]} */ r) => ready && isAvailable(r, keys, m.mapping);
    const count = ROWS.filter(avail).length;
    legend.textContent = ready ? `${CROWN} ${count}件：色付き＝全モーションを実FBXで再生可能`
      : m.status === 'error' ? `FBX の登録状況を読み込めません（${CROWN} を表示できません）：${m.error ? m.error.message : ''}` : 'FBX の登録状況を確認中…';
    if (m.status === 'error') legend.dataset.kind = 'error'; else delete legend.dataset.kind;
    const term = ui.q.toLowerCase().trim();
    const selected = comboOf(project.get())?.selected || 0;
    const rows = ROWS.filter((r) => (!ui.cat || r.category === ui.cat) && `${r.id} ${r.title} ${r.mixamo}`.toLowerCase().includes(term));
    const items = [];
    for (const r of rows) {
      const ok = avail(r);
      const isSel = r.id === selected;
      items.push(h('li', {
        role: 'option', tabindex: '0', 'aria-selected': String(isSel), class: ok ? 'available' : '',
        'aria-label': `${r.id} ${r.title}${ok ? ` ${CROWN} 実FBXで再生可能` : ''}`,
        title: ok ? 'この項目の全モーションが実FBXで再生可能' : '未取得または未割当のモーションを含みます',
        dataset: { patternId: String(r.id), playable: String(ok) },
        onclick: () => selectRow(r.id),
        onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRow(r.id); } },
      }, h('span', { class: 'mono muted' }, String(r.id).padStart(2, '0')), h('span', { class: 'char-name' }, `${r.title}${ok ? ` ${CROWN}` : ''}`), h('span', { class: 'meta' }, r.category)));
      if (isSel) {
        items.push(h('li', { class: 'pattern-detail', role: 'presentation', dataset: { role: 'pattern-steps' } },
          h('b', null, 'Mixamo検索名（実行順）'), h('ol', null, ...r.steps.map((x) => h('li', null, x)))));
      }
    }
    list.replaceChildren(...(items.length ? items : [h('li', { class: 'empty', 'aria-disabled': 'true' }, '一致するパターンはありません')]));
  }

  function drawFavorites() {
    const ui = chainUi.get();
    const f = ui.favs;
    if (f.status === 'idle' || (f.status === 'loading' && !f.list.length)) { favList.replaceChildren(stateBox({ kind: 'loading', title: '読込中…', message: 'お気に入りを読み込んでいます。' })); return; }
    if (f.status === 'error' && !f.list.length) {
      const off = !!f.error && (f.error.code === 'offline' || f.error.code === 'timeout');
      favList.replaceChildren(stateBox({ kind: off ? 'offline' : 'error', title: off ? '未接続' : '読み込めません', message: f.error ? f.error.message : '', retry: () => { void loadFavorites(); } }));
      return;
    }
    const shown = filterFavorites(f.list, ui.favQ);
    if (!f.list.length) { favList.replaceChildren(h('div', { class: 'empty', dataset: { role: 'fav-empty' } }, 'お気に入りはまだありません。コンビネーションを作り、下の［★ お気に入りに保存］で追加します。')); return; }
    if (!shown.length) { favList.replaceChildren(h('div', { class: 'empty' }, '一致するお気に入りはありません')); return; }
    favList.replaceChildren(...shown.map((fav) => h('div', { class: 'favorite-card imp-row', dataset: { favId: fav.id } },
      h('b', { class: 'imp-name' }, `${fav.name} (${fav.steps.length}動作)`),
      h('p', { class: 'small muted imp-hint' }, fav.tags.map((t) => `#${t}`).join(' ')),
      h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'fav-load' }, onclick: () => loadFavorite(fav) }, '読み込み'),
      h('button', { class: 'btn ghost', type: 'button', dataset: { act: 'real', role: 'fav-delete' }, onclick: () => { void deleteFavorite(fav); } }, '削除'))));
  }

  /** @param {Favorite} fav */
  function loadFavorite(fav) {
    if (!comboOf(project.get())) { uiToast('制作状態を読み込んでいます。少し待ってからもう一度お試しください。', 'err'); return; }
    editCombination(fav.steps.map((s) => ({ name: s.name })), { label: `お気に入り「${fav.name}」を読み込み` });
    chainUi.set({ active: fav, notice: '', stepSel: -1 }, 'load-favorite');
  }

  /** @param {Favorite} fav */
  async function deleteFavorite(fav) {
    const ok = await confirmDialog({ title: 'お気に入りの削除', body: 'このお気に入りを削除しますか？', ok: '削除する' });
    if (!ok) return;
    const r = await favoritesClient.remove(fav.id);
    if (!r.ok) { uiToast('削除の保存に失敗しました', 'err'); return; }
    const ui = chainUi.get();
    chainUi.set({ favs: { status: 'ready', list: r.list, error: null }, active: ui.active && ui.active.id === fav.id ? null : ui.active }, 'favs');
  }

  function drawTabs() {
    const t = chainUi.get().tab;
    for (const [btn, id] of /** @type {[HTMLElement, string][]} */ ([[tCatalog, 'catalog'], [tFavs, 'favorites']])) btn.setAttribute('aria-pressed', String(t === id));
    catalogPane.hidden = t !== 'catalog';
    favPane.hidden = t !== 'favorites';
  }

  watch(ctx, () => {
    drawTabs();
    // 入力欄はこちらで作り直さない（フォーカスを保つ）。値がストアと違うときだけ合わせる（コマンドで空に戻したとき）。
    const ui = chainUi.get();
    if (search.value !== ui.q) search.value = ui.q;
    if (catSel.value !== ui.cat) catSel.value = ui.cat;
    if (favSearch.value !== ui.favQ) favSearch.value = ui.favQ;
    drawCatalog();
    drawFavorites();
  }, () => {
    const ui = chainUi.get();
    return [ui.tab, ui.q, ui.cat, ui.favQ, ui.manifest, ui.favs, comboOf(project.get())?.selected ?? null, project.get().status];
  });
  return root;
};

/* ---------------------------------------------------------------- 下部：タイムライン（コンビネーション） */

/** @param {FeatureCtx} ctx */
export const chainTimeline = (ctx) => {
  boot(ctx);
  const root = h('div', { class: 'chain-timeline', dataset: { feature: 'chainTimeline' } });

  /** @param {number} i @param {number} dir */
  function move(i, dir) {
    const t = currentTimeline().map((x) => ({ name: x.name }));
    const j = i + dir;
    if (i < 0 || j < 0 || j >= t.length) return;
    [t[i], t[j]] = [t[j], t[i]];
    editCombination(t, { label: `並べ替え：${t[j].name}` });
    chainUi.set({ stepSel: j, notice: '' }, 'move');
  }
  /** @param {number} i */
  function del(i) {
    const t = currentTimeline().map((x) => ({ name: x.name }));
    if (i < 0 || i >= t.length) return;
    const [gone] = t.splice(i, 1);
    editCombination(t, { label: `削除：${gone.name}` });
    chainUi.set({ stepSel: Math.min(i, t.length - 1), notice: '' }, 'delete');
  }
  function clear() {
    editCombination([], { label: '全消去' });
    chainUi.set({ active: null, stepSel: -1, notice: '' }, 'clear');
  }

  function saveDialog() {
    const active = chainUi.get().active;
    const nameIn = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'text', value: active ? active.name : '新規コンビネーション', 'aria-label': 'お気に入り名', dataset: { role: 'fav-name' } }));
    const tagsIn = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'text', value: active ? active.tags.join(', ') : '格闘, コンボ', 'aria-label': '検索タグ（カンマ区切り）', dataset: { role: 'fav-tags' } }));
    const msg = h('p', { class: 'imp-message', role: 'alert', dataset: { role: 'fav-message' } });
    const saveBtn = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn primary', type: 'button', dataset: { role: 'fav-save-ok' } }, '保存'));
    saveBtn.addEventListener('click', async () => {
      const name = nameIn.value.trim();
      if (!name) { msg.textContent = '名前が必要です'; nameIn.focus(); return; }
      saveBtn.disabled = true;
      /** @type {Favorite} */
      const fav = { id: active ? active.id : `combo-${Date.now()}`, name, tags: parseTags(tagsIn.value), steps: currentTimeline().map((x) => ({ name: x.name })) };
      const r = await favoritesClient.upsert(fav);
      if (!r.ok) { saveBtn.disabled = false; msg.textContent = `保存失敗: ${r.message}`; return; }
      closeModal();
      chainUi.set({ favs: { status: 'ready', list: r.list, error: null }, active: fav, tab: 'favorites', notice: `「★ お気に入り」に「${fav.name}」を保存しました。左側に表示しています。` }, 'favs');
    });
    openModal({
      title: '★ お気に入りに保存',
      body: [
        h('div', { class: 'field stack' }, h('label', null, 'お気に入り名'), nameIn),
        h('div', { class: 'field stack' }, h('label', null, '検索タグ（カンマ区切り）'), tagsIn),
        msg,
      ],
      footer: [h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'キャンセル'), saveBtn],
    });
  }

  function draw() {
    const s = project.get();
    const wait = projectNotReady(s);
    if (wait) { root.replaceChildren(wait); return; }
    const t = currentTimeline();
    const ui = chainUi.get();
    const sel = ui.stepSel >= 0 && ui.stepSel < t.length ? ui.stepSel : -1;
    const n = t.length;
    const notice = ui.notice || (n ? `登録済み ${n}件。下の一覧で順番を変更できます。` : 'モーションを選択し「＋追加」を押してください。');
    const dis = (/** @type {boolean} */ b) => (b ? true : undefined);

    const bar = h('div', { class: 'btn-row chain-bar' },
      h('b', { dataset: { role: 'chain-count' } }, `${n}件`),
      h('button', { class: 'btn primary', type: 'button', disabled: dis(n === 0), dataset: { act: 'real', role: 'chain-play' }, onclick: () => { void currentChainControl()?.play(); } }, '▶ 連結再生'),
      h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'chain-stop' }, onclick: () => currentChainControl()?.stop() }, '■ 停止'),
      h('button', { class: 'btn', type: 'button', disabled: dis(sel <= 0), title: '選んだ手順を前へ', 'aria-label': '選んだ手順を前へ', dataset: { act: 'real', role: 'step-up' }, onclick: () => move(sel, -1) }, '↑'),
      h('button', { class: 'btn', type: 'button', disabled: dis(sel < 0 || sel >= n - 1), title: '選んだ手順を後ろへ', 'aria-label': '選んだ手順を後ろへ', dataset: { act: 'real', role: 'step-down' }, onclick: () => move(sel, 1) }, '↓'),
      h('button', { class: 'btn', type: 'button', disabled: dis(sel < 0), dataset: { act: 'real', role: 'step-delete' }, onclick: () => del(sel) }, '削除'),
      h('button', { class: 'btn', type: 'button', disabled: dis(n === 0), dataset: { act: 'real', role: 'chain-clear' }, onclick: clear }, '全消去'),
      h('button', { class: 'btn', type: 'button', title: '名前とタグを入力して保存すると、左側の「★ お気に入り」に表示されます。', dataset: { act: 'real', role: 'chain-save' }, onclick: saveDialog }, '★ お気に入りに保存'),
      h('span', { class: 'small muted', role: 'status', 'aria-live': 'polite', dataset: { role: 'chain-feedback' } }, notice));

    const blocks = t.map((step, i) => h('button', {
      class: 'tl-clip chain-step', type: 'button', 'aria-pressed': String(i === sel), dataset: { role: 'chain-step', index: String(i) },
      title: '並び順だけを表します（長さは再生時に決まります）', onclick: () => chainUi.set({ stepSel: i === sel ? -1 : i }, 'step'),
    }, `${i + 1}. ${step.name}`));
    const body = h('div', { class: 'chain-tracks' },
      h('div', { class: 'chain-track-row' }, h('span', { class: 'tl-label' }, '体（コンビネーション）'),
        h('div', { class: 'chain-track', dataset: { role: 'chain-track' } }, ...(blocks.length ? blocks : [h('span', { class: 'xs muted' }, '手順なし')]))),
      h('div', { class: 'chain-track-row', dataset: { dim: '1' } }, h('span', { class: 'tl-label' }, '表情'),
        h('button', { class: 'btn ghost is-unimpl', type: 'button', title: '◇ 未実装：表情キーの編集（LIP-009）', dataset: { act: 'unimpl', role: 'face-track' }, onclick: () => showUnimplemented({ name: '表情キー', why: '表情キーの編集は未実装です（表情レイヤー）。', ids: ['LIP-009'], phase: PH.LIP }) }, '◇ 表情キー（未実装）')));
    root.replaceChildren(bar, body);
  }

  watch(ctx, draw, () => {
    const s = project.get();
    const c = comboOf(s);
    const ui = chainUi.get();
    return [s.status, s.error && s.error.message, c && c.timeline, ui.stepSel, ui.notice];
  });
  return root;
};

/* ---------------------------------------------------------------- 右：再生（速度） */

/** @param {FeatureCtx} ctx */
export const playbackSettings = (ctx) => {
  const sel = selectField({
    label: '速度', options: SPEEDS.map((v) => [String(v), `${v}×`]), value: '1',
    onChange: (v) => { setCombinationSpeed(Number(v)); },
  });
  const select = /** @type {HTMLSelectElement} */ (sel.querySelector('select'));
  select.dataset.role = 'playback-speed';
  const loop = toggle({ label: 'ループ再生', checked: true, title: '旧画面と同じく常にループします' });
  const loopBox = /** @type {HTMLInputElement} */ (loop.querySelector('input'));
  loopBox.disabled = true;
  loopBox.dataset.role = 'loop';
  const root = h('div', { class: 'stack', dataset: { feature: 'playbackSettings' } }, sel, loop);
  const sync = () => {
    const c = comboOf(project.get());
    select.disabled = !c;
    select.value = String(c && SPEEDS.includes(c.playbackSpeed) ? c.playbackSpeed : 1);
  };
  sync();
  ctx.onCleanup(project.subscribe(sync));
  return root;
};
