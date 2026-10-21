// @ts-check
// ④ SCR-12 キャラクター管理：左の一覧・中央の3D表示・右のボーン一覧・［このモデルを制作に使う］（P2 設計 §2.4(b)(d)）。
// 表示は three-host（viewport/）、取得と解析は model-loader、正規化は normalize.fork.js（旧画面と同じ式）。
import { h, toast as uiToast, regionTag, showUnimplemented } from '../ui.js';
import { icon } from '../icons.js';
import { assets, createStore, project } from '../store.js';
import { stateBox } from '../state-box.js';
import { emit } from '../bus.js';
import { classifyBone } from '/camera_follow_config.js';
import { categoryOf, sourceLabel } from './assets-model.js';
import { ensureAssets, loadAssets, watchAssets } from './assets.js';
import { setWorkspaceAsset } from './project.js';
import { loadLibs, loadModel, collectBones, loadErrorText, disposeObject, MISSING_FILE_TEXT } from '../viewport/model-loader.js';
import { createViewport, WebGLError, WEBGL_ERROR_TEXT } from '../viewport/three-host.js';
import { normalizeModel } from '../viewport/normalize.fork.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */
/** @typedef {import('./assets-model.js').AssetItem} AssetItem */
/** @typedef {{name: string, role: string|null}} BoneRow */
/** @typedef {{name: string, format: string, clips: number, vertices: number, bones: BoneRow[], scale: number, offset: number[]}} ModelInfo */

/** SCR-12 の状態（このページを開いている間だけ。保存しない）。sel は URL の asset= にも反映する。 */
export const character = createStore({
  /** @type {string|null} */ sel: null,
  /** @type {'idle'|'loading'|'loaded'|'error'} */ status: 'idle',
  message: '',
  /** @type {ModelInfo|null} */ info: null,
  /** @type {AssetItem|null} */ item: null,
});

const ROLE_LABEL = /** @type {Record<string, string>} */ ({ head: '頭', neck: '首', chest: '胸', hips: '腰' });
const isScreen12 = () => /^\/workspace\/12\/?$/.test(location.pathname);

/** @param {string|null} id */
export function selectCharacter(id) {
  if (id === character.get().sel) return;
  character.set({ sel: id, status: id ? 'loading' : 'idle', message: '', info: null, item: null }, 'select');
  if (isScreen12()) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('asset', id); else url.searchParams.delete('asset');
    history.replaceState(history.state, '', url);
  }
}

/** @type {WeakSet<URLSearchParams>} */
const booted = new WeakSet();
/** 画面ごとの共通の初期化（1回の描画につき1回）：URL の asset=、素材一覧の読込。 @param {FeatureCtx} ctx */
function boot(ctx) {
  if (booted.has(ctx.params)) return;
  booted.add(ctx.params);
  const a = ctx.params.get('asset');
  if (a) selectCharacter(a);
  else if (character.get().sel && isScreen12()) { // 前に選んだものを URL にも出す
    const url = new URL(location.href);
    url.searchParams.set('asset', /** @type {string} */ (character.get().sel));
    history.replaceState(history.state, '', url);
  }
  ctx.onCleanup(watchAssets());
  ensureAssets();
}

/** @param {FeatureCtx} ctx @param {() => void} fn @param {...{subscribe: (f: () => void) => () => void}} stores */
function watch(ctx, fn, ...stores) {
  for (const s of stores) ctx.onCleanup(s.subscribe(fn));
  fn();
}

/* ------------------------------------------------------------------ 左：キャラクター一覧 */

/** @param {FeatureCtx} ctx */
export const characterList = (ctx) => {
  boot(ctx);
  let q = '';
  const search = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'search', placeholder: '名前で絞り込み', 'aria-label': 'キャラクターを絞り込み', dataset: { role: 'search' } }));
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
  const list = h('ul', { class: 'list char-list', role: 'listbox', 'aria-label': 'キャラクター', dataset: { role: 'char-list' } });
  const body = h('div');
  const root = h('div', { dataset: { feature: 'characterList' } }, h('div', { class: 'searchbar' }, search), body);
  function draw() {
    const st = assets.get();
    if (st.status === 'idle' || st.status === 'loading') { body.replaceChildren(stateBox({ kind: 'loading', title: '読込中…', message: '素材の一覧を読み込んでいます。' })); return; }
    if (st.status === 'error') {
      const off = !!st.error && (st.error.code === 'offline' || st.error.code === 'timeout');
      body.replaceChildren(stateBox({ kind: off ? 'offline' : 'error', title: off ? '未接続' : '読み込めません', message: st.error ? st.error.message : '', retry: () => { void loadAssets(); } }));
      return;
    }
    const all = st.items.filter((a) => categoryOf(a) === 'char');
    const rows = all.filter((a) => !q || String(a.name).toLowerCase().includes(q));
    if (!all.length) {
      body.replaceChildren(h('div', { class: 'empty', dataset: { role: 'char-empty' } }, '登録されたキャラクターはまだありません。',
        h('div', null, h('button', { class: 'btn', type: 'button', dataset: { act: 'nav' }, onclick: () => ctx.navigate('08', { query: { import: '1', cat: 'char' } }) }, '素材を取り込む…'))));
      return;
    }
    const sel = character.get().sel;
    list.replaceChildren(...(rows.length ? rows.map((a) => h('li', { role: 'option', tabindex: '0', 'aria-selected': String(a.id === sel), class: a.available ? '' : 'is-missing', title: sourceLabel(a),
      dataset: { assetId: a.id, available: String(a.available) },
      onclick: () => selectCharacter(a.id), onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCharacter(a.id); } } },
    icon('user', 16), h('span', { class: 'char-name' }, a.name), h('span', { class: 'meta' }, a.format, a.available ? '' : ' ・ファイルなし')))
      : [h('li', { class: 'empty', 'aria-disabled': 'true' }, '一致するキャラクターはありません')]));
    body.replaceChildren(list);
  }
  watch(ctx, draw, assets, character);
  return root;
};

/* ------------------------------------------------------------------ 中央：3D 表示 */

/** @param {FeatureCtx} ctx */
export const characterViewport = (ctx) => {
  boot(ctx);
  const stageEl = h('div', { class: 'viewport vp3d', role: 'img', 'aria-label': 'キャラクターの3Dプレビュー', dataset: { role: 'viewport' } });
  const hud = h('div', { class: 'vp-hud' });
  const msg = h('div', { class: 'vp3d-msg', dataset: { role: 'vp-message' } });
  /** 回転ツール（OrbitControls）は常に有効。「選択」はオブジェクトの選択が旧画面に無いので ◇。 */
  const tools = h('div', { class: 'vp-tools', role: 'toolbar', 'aria-label': 'ビューポートツール' },
    h('button', { class: 'icon-btn is-unimpl', type: 'button', title: '選択（◇ 未実装：オブジェクトの選択は旧画面に無い）', 'aria-label': '選択', dataset: { act: 'unimpl' },
      onclick: () => showUnimplemented({ name: '選択', why: 'ビューポート上でオブジェクトを選ぶ操作は旧画面にもありません（NF-014 の残り・未承認）。', ids: ['NF-014'], phase: '未承認の候補（P4）' }) }, icon('cursor', 16)),
    h('button', { class: 'icon-btn', type: 'button', title: '回転・ズーム（ドラッグで回転、ホイールでズーム）', 'aria-label': '回転', 'aria-pressed': 'true', dataset: { role: 'tool-rotate' } }, icon('rotate', 16)));
  stageEl.append(hud, tools, msg);
  const root = h('div', { class: 'vp3d-wrap', dataset: { feature: 'characterViewport' } },
    h('div', { class: 'pane-head' }, h('h2', null, '3Dプレビュー'), h('span', { class: 'spacer' }), regionTag('real')), stageEl);

  /** @type {import('../viewport/three-host.js').Viewport|null} */
  let host = null;
  let alive = true;
  let seq = 0;
  /** 今の host に載せている素材の id（同じものを二重に読み込まない） */
  let shown = '';
  ctx.onCleanup(() => { alive = false; seq++; if (host) { host.dispose(); host = null; } });

  /** @param {string} text @param {'info'|'error'} [kind] */
  const say = (text, kind = 'info') => { msg.textContent = text; msg.dataset.kind = kind; msg.hidden = !text; };
  const hudOf = (/** @type {ModelInfo|null} */ i) => {
    hud.replaceChildren(...(i ? [h('span', { dataset: { role: 'hud-name' } }, i.name), h('span', null, i.format), h('span', null, `クリップ ${i.clips} 件`), h('span', null, `頂点 ${i.vertices.toLocaleString('ja-JP')}`)] : []), h('span', { class: 'right' }, '3D表示'));
  };
  hudOf(null);

  async function ensureHost() {
    if (host) return host;
    const libs = await loadLibs();
    if (!alive) return null;
    host = createViewport(stageEl, libs);
    return host;
  }

  async function showSelected() {
    const my = ++seq;
    const id = character.get().sel;
    if (!id) { shown = ''; host?.clear(); host?.setState({ loaded: false, assetId: null, format: null, scale: null, offset: null }); hudOf(null); say('左の一覧からキャラクターを選んでください。'); character.set({ status: 'idle', info: null, item: null, message: '' }, 'loaded'); return; }
    const st = assets.get();
    if (st.status === 'idle' || st.status === 'loading') { say('素材の一覧を読み込んでいます…'); return; }
    if (st.status === 'error') { say('素材の一覧を読み込めません。', 'error'); return; }
    const item = st.items.find((a) => a.id === id);
    host?.clear();
    host?.setState({ loaded: false, assetId: null, format: null, scale: null, offset: null });
    hudOf(null);
    shown = id;
    if (!item) { fail(`選択した素材（${id}）は一覧に見つかりません。`); return; }
    if (!item.available) { fail(MISSING_FILE_TEXT, item); return; }
    character.set({ status: 'loading', message: '', info: null, item }, 'loading');
    say('読込中…');
    try {
      const libs = await loadLibs();
      if (!alive || my !== seq) return;
      const r = await loadModel(item, libs);
      if (!alive || my !== seq) { disposeObject(r.object); return; }
      const hostNow = await ensureHost();
      if (!hostNow || !alive || my !== seq) return;
      const norm = normalizeModel(r.object, r.format, libs.THREE);
      hostNow.setObject(r.object);
      hostNow.fit();
      hostNow.setState({ loaded: true, assetId: id, format: r.format, scale: norm.scale, offset: norm.offset });
      const bones = collectBones(r.object).map((b) => ({ name: String(b.name), role: classifyBone(b.name) }));
      /** @type {ModelInfo} */
      const info = { name: item.name, format: r.format, clips: r.animations.length, vertices: r.vertices, bones, scale: norm.scale, offset: norm.offset };
      say('');
      hudOf(info);
      character.set({ status: 'loaded', message: '', info, item }, 'loaded');
      emit('studio:model-loaded', { assetId: id, format: r.format, clips: info.clips, vertices: info.vertices });
    } catch (e) {
      if (!alive || my !== seq) return;
      fail(e instanceof WebGLError ? WEBGL_ERROR_TEXT : loadErrorText(e), item);
    }
  }
  /** @param {string} text @param {AssetItem} [item] */
  function fail(text, item) {
    say(text, 'error');
    character.set({ status: 'error', message: text, info: null, item: item || null }, 'error');
  }

  // 選択の変更・一覧の読込完了で読み込む。同じ選択のままの一覧の更新では読み込み直さない。
  let lastKey = '';
  const check = () => {
    const s = character.get();
    const a = assets.get();
    const key = `${s.sel}|${a.status === 'ready' ? 'r' : a.status}`;
    if (key === lastKey) return;
    lastKey = key;
    void showSelected();
  };
  ctx.onCleanup(character.subscribe(check));
  ctx.onCleanup(assets.subscribe(check));
  check();
  return root;
};

/* ------------------------------------------------------------------ 右：ボーン */

/** @param {FeatureCtx} ctx */
export const characterBones = (ctx) => {
  boot(ctx);
  let q = '';
  const search = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'search', placeholder: 'ボーン名で絞り込み', 'aria-label': 'ボーンを絞り込み', dataset: { role: 'bone-search' } }));
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
  const body = h('div');
  const root = h('div', { dataset: { feature: 'characterBones' } }, h('div', { class: 'searchbar' }, search), body);
  function draw() {
    const s = character.get();
    search.disabled = s.status !== 'loaded';
    if (s.status === 'idle') { body.replaceChildren(h('div', { class: 'empty', dataset: { role: 'bones-empty' } }, 'キャラクターを選択してください。')); return; }
    if (s.status === 'loading') { body.replaceChildren(h('div', { class: 'empty' }, '読込中…')); return; }
    if (s.status === 'error' || !s.info) { body.replaceChildren(h('div', { class: 'empty' }, s.message || '表示できません。')); return; }
    const bones = s.info.bones;
    if (!bones.length) { body.replaceChildren(h('div', { class: 'empty', dataset: { role: 'no-bones' } }, 'ボーンがありません（静的モデル）')); return; }
    const rows = bones.filter((b) => !q || b.name.toLowerCase().includes(q));
    body.replaceChildren(
      h('p', { class: 'section-note', dataset: { role: 'bone-count' } }, `${bones.length} 本${rows.length !== bones.length ? `（表示 ${rows.length} 本）` : ''}`),
      h('table', { class: 'table bone-table', dataset: { role: 'bones' } }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'ボーン'), h('th', { scope: 'col' }, '分類'))),
        h('tbody', null, rows.map((b) => h('tr', { dataset: { bone: b.name } }, h('td', { class: 'mono' }, b.name), h('td', null, b.role ? `${ROLE_LABEL[b.role] || b.role}（${b.role}）` : '—'))))));
  }
  watch(ctx, draw, character);
  return root;
};

/* ------------------------------------------------------------------ ツール：このモデルを制作に使う */

/** 押した後のトースト（［保存・復元（18）へ］の導線付き）。 @param {string} text @param {FeatureCtx} ctx */
function toastWithLink(text, ctx) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = h('div', { class: 'toast real', dataset: { role: 'use-toast' } }, text, ' ',
    h('button', { class: 'link-btn', type: 'button', dataset: { act: 'nav' }, onclick: () => { t.remove(); ctx.navigate('18'); } }, '保存・復元（18）へ ›'));
  host.append(t);
  setTimeout(() => t.remove(), 6000);
}

/** @param {FeatureCtx} ctx */
export const useModelButton = (ctx) => {
  const btn = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn primary', type: 'button', dataset: { act: 'real', role: 'use-model' } }, 'このモデルを制作に使う'));
  const note = h('span', { class: 'xs muted use-note', dataset: { role: 'combination-note' } }, '保存すると、空のコンビネーション（project_state.json）も一緒に作られます。');
  note.hidden = true;
  const root = h('span', { class: 'btn-row', dataset: { feature: 'useModelButton' } }, btn, note);
  const sync = () => {
    const s = character.get();
    const it = s.item;
    const ok = s.status === 'loaded' && !!it && it.source === 'integrated' && (it.format === 'GLB' || it.format === 'VRM') && !!it.filename;
    btn.disabled = !ok;
    btn.title = ok ? '作業中の素材（workspace.asset）をこのモデルにします。［保存］で保存されます'
      : s.status === 'loaded' && it ? '統合保存に記録できるのは GLB/VRM だけです（project_state_bundle.py の制限）' : '先に左の一覧からモデルを選んでください';
    note.hidden = !project.get().combinationMissing;
  };
  btn.addEventListener('click', () => {
    const it = character.get().item;
    if (!it || !it.filename) return;
    const ps = project.get();
    if (ps.status !== 'ready') { uiToast('制作状態を読み込み中です。少し待ってからもう一度押してください。', 'err'); return; }
    setWorkspaceAsset(it.filename);
    const ws = project.get().bundle && project.get().bundle.workspace;
    if (ws && ws.asset === it.filename) toastWithLink(`作業中の素材を ${it.name} にしました。［保存］で保存されます。`, ctx);
  });
  watch(ctx, sync, character, project);
  return root;
};
