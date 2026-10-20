// @ts-check
// ③ 取り込みダイアログ・キュー・送信（P2 設計 §2.3(d)）。
// 送り先の API は既存のまま（GLB/VRM・PMX ZIP・VMD・FBX）。ここは選択・事前検査・衝突の確認・順番の送信・結果の表示だけ。
import { getJson, uploadFile, messageFor } from '../api.js';
import { imports, assets } from '../store.js';
import { emit } from '../bus.js';
import { h, openModal, closeModal, toast } from '../ui.js';
import { fbxLabel } from './assets-model.js';
import { IMPORT_ACCEPT, classifyImport, conflictOf, batchErrorRows, fbxIdFor, sha256Hex } from './import-rules.js';
import { loadAssets, selectAsset, hasAsset } from './assets.js';

/** @typedef {import('./import-rules.js').ImportEntry} ImportEntry */
/** @typedef {import('./import-rules.js').Classified} Classified */
/** @typedef {'waiting'|'checking'|'sending'|'processing'|'done'|'failed'|'aborted'|'skipped'} RowStatus */
/** @typedef {{contentSha20?: string, fbxId?: string}} Hashes */
/**
 * ack：確認ダイアログで利用者が了承した衝突の文言（了承していなければ null）。送る直前に衝突を求め直し、了承した文言と違えば送らない。
 * @typedef {{id: number, batch: number, batchSize: number, file: File, name: string, route: import('./import-rules.js').Route, kind: string, label: string, size: number,
 *   status: RowStatus, progress: number|null, error: string, note: string, warnings: string[], assetId: string|null, ack: string|null, hashes: Hashes}} ImportRow
 */

/** 状態の表示（設計 §2.3(d) のインポートキュー）。 @param {ImportRow} r */
export function statusText(r) {
  switch (r.status) {
    case 'waiting': return '待機中';
    case 'checking': return '確認中';
    case 'sending': return `送信中 ${Math.round((r.progress || 0) * 100)}%`;
    case 'processing': return 'サーバーで処理中…';
    case 'done': return '完了';
    case 'failed': return `失敗：${r.error}`;
    case 'aborted': return '取り消し';
    case 'skipped': return 'スキップ（確認で除外）';
    default: return '';
  }
}

let rowSeq = 0;
let batchSeq = 0;
/** @type {Map<number, () => void>} 送信中の行の取り消し */
const aborts = new Map();

/** @param {number} id @param {Partial<ImportRow>} patch */
function patchRow(id, patch) {
  const rows = imports.get().rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
  imports.set({ rows }, 'row');
}
/** @param {number} id */
const rowOf = (id) => imports.get().rows.find((r) => r.id === id);

/* ------------------------------------------------------------------ 送信 */

/** @param {ImportRow} r */
function urlFor(r) {
  const n = encodeURIComponent(r.name);
  switch (r.route) {
    case 'integrated': return `/api/integrated-v02/upload?kind=${encodeURIComponent(r.kind)}&name=${n}`;
    case 'pmxZip': return `/api/pmx-zip-upload?slot=${encodeURIComponent(r.kind)}`;
    case 'vmd': return `/api/mmd-upload?slot=vmd&name=${n}`;
    default: return `/api/upload?kind=${encodeURIComponent(r.kind)}&name=${n}`;
  }
}

/** 登録した素材の /api/assets の id（設計 §2.3(d)-6）。 @param {ImportRow} r @param {any} data */
function assetIdOf(r, data) {
  if (r.route === 'integrated') return `integrated:${data.asset}`;
  if (r.route === 'pmxZip') return `mmd:${data.slot}:${data.model_path}`;
  if (r.route === 'vmd') return `mmd:vmd:${r.name}`;
  return `fbx:${data.id}`;
}

/** 送る前の検査。問題があれば日本語の理由を返す。 @param {ImportRow} r @returns {Promise<string|null>} */
async function precheck(r) {
  if (r.route === 'pmxZip') {
    const v = await getJson('/api/server-version');
    if (!v.ok) return 'サーバーのバージョンを確認できません。旧版のサーバーが起動している可能性があります。サーバーを止めて起動し直してください。';
    const features = v.data && Array.isArray(v.data.features) ? v.data.features : [];
    if (!features.includes('pmx_zip_upload')) return `サーバーが PMX ZIP 登録に対応していません（現在のバージョン：${v.data && v.data.version}）。`;
    return null;
  }
  if (r.route === 'fbx') {
    /** @type {any} */
    let mod;
    try {
      const spec = 'three/addons/loaders/FBXLoader.js';
      mod = await import(/* @vite-ignore */ spec);
    } catch { return 'FBX の確認に必要な 3D ライブラリを読み込めません。'; }
    try {
      const buf = await r.file.arrayBuffer();
      const obj = new mod.FBXLoader().parse(buf, '');
      if (r.kind === 'motions' && !(obj && obj.animations && obj.animations.length)) return `${r.name} にアニメーションがありません`;
    } catch (e) { return `FBX として読み込めません：${e instanceof Error ? e.message : String(e)}`; }
  }
  return null;
}

/**
 * 送る直前に、最新の一覧で衝突を求め直す（R8）。確認の後に状況が変わった場合（先に送った行・別の画面での登録・
 * 同じ回の中の同じ中身の GLB/VRM など）に、了承していない上書き・再分類を黙って行わないため。
 * @param {ImportRow} r @returns {Promise<string|null>} 送らない理由
 */
async function recheckConflict(r) {
  await loadAssets();
  if (assets.get().status !== 'ready') return '素材一覧を取得できないため、上書きの確認ができません。';
  const c = conflictOf({ name: r.name, route: r.route, kind: r.kind }, assets.get().items, r.hashes);
  if (c && c.message !== r.ack) return `確認の後に登録済みの素材が変わったため、送りませんでした：${c.message}（［もう一度］で確認できます）`;
  return null;
}

/** @param {ImportRow} r */
async function processRow(r) {
  patchRow(r.id, { status: 'checking', progress: null, error: '', note: '' });
  const changed = await recheckConflict(r);
  if (changed) { patchRow(r.id, { status: 'failed', error: changed }); return; }
  const bad = await precheck(r);
  if (bad) { patchRow(r.id, { status: 'failed', error: bad }); return; }
  patchRow(r.id, { status: 'sending', progress: 0 });
  const up = uploadFile(urlFor(r), r.file, {
    contentType: r.route === 'pmxZip' ? 'application/zip' : 'application/octet-stream',
    onProgress: ({ loaded, total }) => {
      const cur = rowOf(r.id);
      if (!cur || cur.status === 'processing' || cur.status === 'done') return;
      if (total > 0 && loaded >= total) patchRow(r.id, { status: 'processing', progress: null });
      else patchRow(r.id, { status: 'sending', progress: total > 0 ? loaded / total : 0 });
    },
  });
  aborts.set(r.id, up.abort);
  const res = await up.promise;
  aborts.delete(r.id);
  if (!res.ok) {
    if (res.code === 'aborted') patchRow(r.id, { status: 'aborted', progress: null });
    else patchRow(r.id, { status: 'failed', progress: null, error: res.message });
    return;
  }
  const id = assetIdOf(r, res.data);
  await loadAssets();
  const found = hasAsset(id);
  patchRow(r.id, { status: 'done', progress: 1, assetId: id, note: found ? '' : '登録しましたが一覧に見つかりません（再読込してください）' });
  if (found) selectAsset(id);
  emit('studio:asset-imported', { id });
  if (r.batchSize === 1) toast(r.route === 'pmxZip' ? `登録完了：${res.data.model_path}、素材${res.data.files}件` : `登録しました：${r.name}`, 'real');
}

let pumping = false;
/** 待機中の行を1件ずつ順番に処理する（同時に送るのは1件だけ。ダイアログを閉じても続ける）。 */
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const next = imports.get().rows.find((r) => r.status === 'waiting');
      if (!next) break;
      try { await processRow(next); } catch (e) {
        patchRow(next.id, { status: 'failed', progress: null, error: e instanceof Error ? e.message : String(e) });
      }
      summarizeIfDone(next.batch);
    }
  } finally { pumping = false; }
}

/** 複数件の取り込みが終わったら、最後に1回だけ件数をトーストで出す。 @param {number} batch */
function summarizeIfDone(batch) {
  const rows = imports.get().rows.filter((r) => r.batch === batch);
  if (!rows.length || rows[0].batchSize === 1) return;
  if (rows.some((r) => ['waiting', 'checking', 'sending', 'processing'].includes(r.status))) return;
  const ok = rows.filter((r) => r.status === 'done').length;
  const ng = rows.filter((r) => r.status === 'failed').length;
  toast(`${ok}件を登録しました（失敗 ${ng}件）`, ng ? 'err' : 'real');
}

/**
 * 行をキューに積んで処理を始める。
 * @param {{file: File, entry: ImportEntry, label: string, warnings: string[], ack: string|null, hashes: Hashes, skip?: boolean}[]} items
 */
function enqueue(items) {
  const batch = ++batchSeq;
  const rows = items.map((it) => /** @type {ImportRow} */ ({
    id: ++rowSeq, batch, batchSize: items.filter((x) => !x.skip).length || items.length, file: it.file, name: it.entry.name, route: it.entry.route, kind: it.entry.kind, label: it.label,
    size: it.file.size, status: it.skip ? 'skipped' : 'waiting', progress: null, error: '', note: '', warnings: it.warnings, assetId: null, ack: it.ack, hashes: it.hashes,
  }));
  imports.set({ rows: [...imports.get().rows, ...rows] }, 'enqueue');
  void pump();
}

/** 取り消し（待機中・送信中だけ）。 @param {number} id */
export function cancelRow(id) {
  const r = rowOf(id);
  if (!r) return;
  if (r.status === 'waiting') patchRow(id, { status: 'aborted' });
  else if (r.status === 'sending') { const a = aborts.get(id); if (a) a(); }
}
/** 画面の中だけから消す（サーバーのファイルは消えない）。 @param {number} id */
export function removeRow(id) {
  imports.set({ rows: imports.get().rows.filter((r) => r.id !== id) }, 'remove');
}

/* ------------------------------------------------------------------ 衝突の確認 */

/** 一覧が読めていることを保証する（読めなければ衝突を判定できないので送らない）。 */
async function ensureItems() {
  if (assets.get().status === 'idle' || assets.get().status === 'error') await loadAssets();
  return assets.get().status === 'ready';
}

/**
 * entries の衝突を求める（ファイルの解析〔FBXLoader〕より前。GLB/VRM は内容のハッシュを計算する）。
 * 1件ずつ順番に計算する（400MB 級の GLB/VRM を複数選んだとき、全部を同時にメモリへ読まないため）。
 * @param {{file: File, entry: ImportEntry}[]} list @returns {Promise<{conflict: ReturnType<typeof conflictOf>, hashes: Hashes}[]>}
 */
async function computeConflicts(list) {
  const items = assets.get().items;
  const out = [];
  for (const { file, entry } of list) {
    /** @type {Hashes} */
    const hashes = {};
    if (entry.route === 'integrated') hashes.contentSha20 = (await sha256Hex(await file.arrayBuffer())).slice(0, 20);
    if (entry.route === 'fbx') hashes.fbxId = await fbxIdFor(entry.kind, entry.name);
    out.push({ conflict: conflictOf(entry, items, hashes), hashes });
  }
  return out;
}

/**
 * 上書き・置き換え・再分類の確認ダイアログ（R8）。
 * @param {{name: string, message: string}[]} conflicts
 * @param {boolean} partial 該当しないファイルが他にあるか
 * @returns {Promise<'all'|'skip'|'cancel'>}
 */
function confirmConflicts(conflicts, partial) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (/** @type {'all'|'skip'|'cancel'} */ v) => { if (done) return; done = true; closeModal(); resolve(v); };
    openModal({
      title: '上書き・置き換えの確認',
      className: 'import-confirm',
      onClose: () => { if (!done) { done = true; resolve('cancel'); } },
      body: [
        h('p', null, '次のファイルは、登録済みの素材を上書き・置き換え・再分類します。元の内容は戻せません。'),
        h('ul', { class: 'imp-conflicts', dataset: { role: 'conflicts' } }, conflicts.map((c) => h('li', null, h('b', null, c.name), h('br'), c.message))),
      ],
      footer: [
        h('button', { class: 'btn ghost', type: 'button', dataset: { role: 'conflict-cancel' }, onclick: () => finish('cancel') }, 'キャンセル'),
        partial ? h('button', { class: 'btn', type: 'button', dataset: { role: 'conflict-skip' }, onclick: () => finish('skip') }, '該当ファイルを除いて続ける') : null,
        h('button', { class: 'btn primary', type: 'button', dataset: { role: 'conflict-all' }, onclick: () => finish('all') }, 'すべて続ける'),
      ],
    });
  });
}

/** 失敗した行をやり直す（同じファイルで、衝突の確認もやり直す）。 @param {number} id */
export async function retryRow(id) {
  const r = rowOf(id);
  if (!r) return;
  patchRow(id, { status: 'checking', error: '', note: '' });
  try {
    if (!(await ensureItems())) { patchRow(id, { status: 'failed', error: '素材一覧を取得できないため、上書きの確認ができません。' }); return; }
    const entry = { name: r.name, route: r.route, kind: r.kind };
    const [{ conflict: c, hashes }] = await computeConflicts([{ file: r.file, entry }]);
    if (c) {
      const v = await confirmConflicts([{ name: r.name, message: c.message }], false);
      if (v !== 'all') { patchRow(id, { status: 'failed', error: 'やり直しを取りやめました' }); return; }
    }
    patchRow(id, { status: 'waiting', batch: ++batchSeq, batchSize: 1, ack: c ? c.message : null, hashes });
    void pump();
  } catch (e) { patchRow(id, { status: 'failed', error: e instanceof Error ? e.message : String(e) }); }
}

/* ------------------------------------------------------------------ ダイアログ */

/**
 * 取り込みダイアログ（複数のファイルを選べる）。
 * @returns {void}
 */
export function openImportDialog() {
  /** @type {{file: File, cls: Classified, kind: string}[]} */
  let picks = [];
  let busy = false;
  let message = '';
  const input = /** @type {HTMLInputElement} */ (h('input', { type: 'file', multiple: true, accept: IMPORT_ACCEPT, class: 'input', 'aria-label': '取り込むファイル', dataset: { role: 'import-files' } }));
  const list = h('ul', { class: 'imp-rows', dataset: { role: 'import-rows' } });
  const msg = h('p', { class: 'small imp-message', role: 'alert', dataset: { role: 'import-message' } });
  const go = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn primary', type: 'button', dataset: { act: 'real', role: 'import-go' } }, '取り込む'));
  const cancel = h('button', { class: 'btn ghost', type: 'button', dataset: { role: 'import-cancel' }, onclick: closeModal }, 'キャンセル');

  const entriesOf = () => picks.filter((p) => p.cls.ok).map((p) => ({ file: p.file, entry: /** @type {ImportEntry} */ ({ name: p.file.name, route: /** @type {any} */ (p.cls).route, kind: p.kind }), cls: /** @type {any} */ (p.cls) }));

  const render = () => {
    const ok = entriesOf();
    const rowErr = batchErrorRows(ok.map((e) => e.entry));
    list.replaceChildren(...picks.map((p) => {
      const okIdx = ok.findIndex((e) => e.file === p.file);
      const berr = okIdx >= 0 ? rowErr[okIdx] : '';
      if (!p.cls.ok) {
        return h('li', { class: 'imp-row is-bad', dataset: { name: p.file.name, state: 'excluded' } },
          h('span', { class: 'imp-name' }, p.file.name), h('span', { class: 'imp-err', role: 'alert' }, `${p.cls.error}（この行は取り込みません）`));
      }
      const cls = p.cls;
      /** @type {any[]} */
      const kids = [h('span', { class: 'imp-name' }, p.file.name), h('span', { class: 'pill' }, cls.label)];
      if (cls.kinds.length > 1) {
        const sel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': `${p.file.name} の種類`, dataset: { role: 'kind' }, disabled: busy,
          onchange: () => { p.kind = sel.value; render(); } }, cls.kinds.map((k) => h('option', { value: k.value, selected: k.value === p.kind }, k.label))));
        kids.push(sel);
      } else if (cls.route === 'integrated') kids.push(h('span', { class: 'small muted' }, 'モデル（固定）'));
      if (cls.route === 'fbx') kids.push(h('span', { class: 'small muted imp-hint', dataset: { role: 'fbx-hint' } }, 'モデルA／Bは「置き換え」です：同じ枠の既存モデルの登録が外れ、元のファイルが削除されます。'));
      if (cls.route === 'pmxZip') kids.push(h('span', { class: 'small muted imp-hint' }, '登録先のスロットに、フォルダー構造を保って展開します。'));
      for (const w of cls.warnings) kids.push(h('span', { class: 'imp-warn', role: 'note' }, w));
      if (berr) kids.push(h('span', { class: 'imp-err', role: 'alert', dataset: { role: 'batch-error' } }, berr));
      if (busy) kids.push(h('span', { class: 'small', dataset: { role: 'row-status' } }, '確認中'));
      return h('li', { class: `imp-row${berr ? ' is-bad' : ''}`, dataset: { name: p.file.name, route: cls.route, state: berr ? 'conflict' : 'ready' } }, kids);
    }));
    msg.textContent = message;
    go.disabled = busy || !ok.length || rowErr.some(Boolean);
    input.disabled = busy;
  };

  input.addEventListener('change', () => {
    picks = [...(input.files || [])].map((file) => {
      const cls = classifyImport(file.name, file.size);
      return { file, cls, kind: cls.ok ? cls.defaultKind : '' };
    });
    message = '';
    render();
  });

  go.addEventListener('click', async () => {
    const ok = entriesOf();
    if (!ok.length) return;
    busy = true; message = ''; render();
    try {
      if (!(await ensureItems())) { message = '素材一覧を取得できないため、上書きの確認ができません。再読込してからやり直してください。'; busy = false; render(); return; }
      const conflicts = await computeConflicts(ok);
      const hit = ok.map((e, i) => ({ e, c: conflicts[i].conflict })).filter((x) => x.c);
      /** @type {Set<File>} */
      const skip = new Set();
      if (hit.length) {
        const v = await confirmConflicts(hit.map((x) => ({ name: x.e.file.name, message: /** @type {{message: string}} */ (x.c).message })), hit.length < ok.length);
        if (v === 'cancel') return;
        if (v === 'skip') for (const x of hit) skip.add(x.e.file);
      }
      const toSend = ok.filter((e) => !skip.has(e.file));
      closeModal();
      const extra = (/** @type {{file: File}} */ e) => { const i = ok.findIndex((x) => x.file === e.file); const c = conflicts[i].conflict; return { ack: c ? c.message : null, hashes: conflicts[i].hashes }; };
      enqueue([
        ...toSend.map((e) => ({ file: e.file, entry: e.entry, label: e.cls.label, warnings: e.cls.warnings, ...extra(e) })),
        ...ok.filter((e) => skip.has(e.file)).map((e) => ({ file: e.file, entry: e.entry, label: e.cls.label, warnings: e.cls.warnings, ...extra(e), skip: true })),
      ]);
    } catch (e) {
      busy = false; message = `確認に失敗しました：${e instanceof Error ? e.message : String(e)}`; render();
    }
  });

  openModal({
    title: '素材を取り込む',
    className: 'import-dialog',
    body: [
      h('p', { class: 'small muted' }, 'GLB・VRM・PMX を含む ZIP・VMD・FBX を選べます（複数可）。種類はファイルごとに選びます。'),
      h('label', { class: 'field stack' }, h('span', null, 'ファイル'), input),
      list, msg,
      h('p', { class: 'section-note' }, '一括のタグ付け・変換は未実装です（NF-004）。PMX は個別ファイルではなく、テクスチャを含む ZIP で登録します。'),
    ],
    footer: [cancel, go],
  });
  render();
}
