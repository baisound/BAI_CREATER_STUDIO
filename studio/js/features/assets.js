// @ts-check
// ③ 素材一覧の読込と、表示の状態（選択・分類・検索・並び替え）。P2 設計 §2.3(d)・§1.9・§1.11。
// 素材の一覧は /api/assets（読み取りだけ）。表示の設定は bai.studio.lib.v1 に保存する（制作データは保存しない）。
import { getJson } from '../api.js';
import { assets, createStore } from '../store.js';
import { on } from '../bus.js';

const LIB_KEY = 'bai.studio.lib.v1';
const SORTS = ['api', 'name', 'format'];

/** 表示の設定（保存する）。 */
function loadPrefs() {
  const d = { view: 'grid', size: 2, sort: 'api', fmt: 'all' };
  try {
    const o = JSON.parse(localStorage.getItem(LIB_KEY) || '{}');
    if (o.view === 'grid' || o.view === 'list') d.view = o.view;
    if ([1, 2, 3].includes(o.size)) d.size = o.size;
    if (SORTS.includes(o.sort)) d.sort = o.sort;
    if (typeof o.fmt === 'string') d.fmt = o.fmt;
  } catch { /* storage unavailable */ }
  return d;
}

/** 素材管理の表示状態。sel・cat は URL（asset=・cat=）に反映する。q とキュー表示は画面内だけ。 */
export const lib = createStore({
  ...loadPrefs(),
  /** @type {string} */ cat: 'all',
  /** @type {string} */ q: '',
  /** @type {string|null} */ sel: null,
  /** @type {'queue'|'sync'|'deps'|'dl'} */ queueTab: 'queue',
});

function savePrefs() {
  const s = lib.get();
  try { localStorage.setItem(LIB_KEY, JSON.stringify({ view: s.view, size: s.size, sort: s.sort, fmt: s.fmt })); } catch { /* ignore */ }
}
lib.subscribe((_s, reason) => { if (reason === 'pref') savePrefs(); });

/** @param {Partial<ReturnType<typeof lib.get>>} patch @param {'pref'|'view'} [reason] */
export function setLib(patch, reason = 'view') { lib.set(patch, reason); }

const isAssetsScreen = () => /^\/workspace\/08\/?$/.test(location.pathname);
/** 選択・分類を URL に反映する（replaceState。再描画はしない）。 @param {Record<string, string|null>} changes */
export function replaceQuery(changes) {
  if (!isAssetsScreen()) return;
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(changes)) { if (v === null || v === '') url.searchParams.delete(k); else url.searchParams.set(k, v); }
  history.replaceState(history.state, '', url);
}

/** @param {string|null} id */
export function selectAsset(id) {
  lib.set({ sel: id }, 'view');
  replaceQuery({ asset: id });
}
/** @param {string} cat */
export function selectCategory(cat) {
  lib.set({ cat }, 'view');
  replaceQuery({ cat: cat === 'all' ? null : cat });
}

/** @type {WeakSet<URLSearchParams>} */
const applied = new WeakSet();
/** 画面を開いたときの URL（asset=・cat=）を表示状態へ反映する（1回の描画につき1回）。 @param {URLSearchParams} params */
export function applyParams(params) {
  if (applied.has(params)) return;
  applied.add(params);
  const patch = /** @type {Record<string, any>} */ ({});
  const a = params.get('asset');
  if (a) patch.sel = a;
  const c = params.get('cat');
  if (c) patch.cat = c;
  if (Object.keys(patch).length) lib.set(patch, 'view');
}

let seq = 0;
/** @type {Promise<void>} 一番新しい読込（古い読込の呼び出し元は、これが終わるまで待つ） */
let latest = Promise.resolve();
/**
 * 一覧を読み込む。表示中の一覧は残したまま読み直す（ちらつき防止）。失敗したら status:'error'。
 * @returns {Promise<void>}
 */
export function loadAssets() {
  const mine = ++seq;
  const s = assets.get();
  if (!s.loadedAt) assets.set({ status: 'loading', error: null }, 'loading');
  const p = (async () => {
    const r = await getJson('/api/assets');
    if (mine !== seq) { await latest; return; } // 後から始めた読込の結果を優先する（呼び出し元は新しい結果が入るまで待つ）
    if (!r.ok) { assets.set({ status: 'error', error: r, items: assets.get().loadedAt ? assets.get().items : [] }, 'error'); return; }
    const items = Array.isArray(r.data && r.data.items) ? r.data.items : [];
    assets.set({ status: 'ready', items, error: null, loadedAt: Date.now() }, 'loaded');
  })();
  latest = p;
  return p;
}

/** 画面を開いたとき、まだ読んでいなければ読む。 */
export function ensureAssets() {
  if (assets.get().status === 'idle') void loadAssets();
}

/** 取り込み・外部同期の通知で読み直す。購読の解除関数を返す（画面の後始末に登録する）。 */
export function watchAssets() {
  const offs = [on('studio:asset-imported', () => { void loadAssets(); }), on('studio:assets-refresh', () => { void loadAssets(); })];
  return () => { for (const f of offs) f(); };
}

/** 取り込んだ id が一覧にあるか。 @param {string} id */
export const hasAsset = (id) => assets.get().items.some((i) => i.id === id);
