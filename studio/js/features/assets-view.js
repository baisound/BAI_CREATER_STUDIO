// @ts-check
// ③ 素材管理の画面部品（SCR-08 の左・中央・右、ツール、SCR-01 の「最近の素材」。P2 設計 §2.3(b)(d)）。
// FEATURES に登録され、screens.js の { t:'feature', key } / custom から呼ばれる。サンプルの素材は使わない（R3）。
import { h, showUnimplemented, section, region, regionTag } from '../ui.js';
import { icon } from '../icons.js';
import { assets, imports } from '../store.js';
import { stateBox } from '../state-box.js';
import { PH } from '../screens.js';
import { ASSET_CATS, categoryOf, sourceLabel, filterAssets, countByCategory, formatsOf, kindLabel, fbxLabel } from './assets-model.js';
import { lib, setLib, selectAsset, selectCategory, applyParams, ensureAssets, loadAssets, watchAssets } from './assets.js';
import { openImportDialog, statusText, cancelRow, removeRow, retryRow } from './import.js';
import { mountMotionPreview, motionThumbnail, previewModels } from './asset-motion-preview.js';
import { libraryFileUrl, libraryThumbnail, mountLibraryPreview } from './asset-library-preview.js';
import { characterThumbnail, backfillCharacterThumbs } from './asset-character-thumbnail.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */
/** @typedef {import('./assets-model.js').AssetItem} AssetItem */

/** 画面ごとの共通の初期化：URL の反映、一覧の読込、通知での再読込。1回の描画につき1回。 @type {WeakSet<URLSearchParams>} */
const booted = new WeakSet();
/** @param {FeatureCtx} ctx */
function boot(ctx) {
  if (booted.has(ctx.params)) return;
  booted.add(ctx.params);
  applyParams(ctx.params);
  ctx.onCleanup(watchAssets());
  ensureAssets();
}

/** ◇ 未実装のボタン（data-act="unimpl"。押すと説明。何も保存しない）。 @param {string} label @param {string} why @param {string[]} ids @param {string} phase @param {string} [cls] */
function unimplBtn(label, why, ids, phase, cls = '') {
  return h('button', { class: `btn is-unimpl ${cls}`.trim(), type: 'button', dataset: { act: 'unimpl' }, title: `◇ 未実装：${why}`,
    onclick: () => showUnimplemented({ name: label, why, ids, phase }) }, label);
}

/** 他の保存先が無い画面（一覧）で、購読を画面の後始末へ登録する。 @param {FeatureCtx} ctx @param {() => void} fn @param {...{subscribe: (f: () => void) => () => void}} stores */
function watch(ctx, fn, ...stores) {
  for (const s of stores) ctx.onCleanup(s.subscribe(fn));
  fn();
}

/** 画面内で作った見本だけ記憶する。元ファイルや制作状態には保存しない。 @type {Map<string, Promise<string|null>>} */
const motionImages = new Map();
let imageQueue = Promise.resolve();
/** @param {AssetItem} a @param {AssetItem[]} items */
function imageFor(a, items) {
  const model = previewModels(a, items)[0] || null;
  const key = `${a.id}|${model?.id || ''}`;
  let pending = motionImages.get(key);
  if (!pending) {
    pending = imageQueue.then(() => motionThumbnail(a, model)).catch(() => null);
    imageQueue = pending.then(() => undefined);
    motionImages.set(key, pending);
  }
  return pending;
}

/** 形式タイル。モーションは見えているカードから3姿勢の見本へ置き換える。 @param {AssetItem} a */
function tile(a) {
  const cat = categoryOf(a);
  const pictogram = ({ char: 'user', motion: 'motion', stage: 'stage', prop: 'template', mat: 'sphere', fx: 'sparkle', audio: 'music', video: 'render', image: 'image' })[cat] || 'image';
  const library = a.source === 'library';
  const src = cat === 'char' && a.available ? a.thumbnailUrl || ''
    : library && a.available ? (a.thumbnailUrl || (['image', 'material'].includes(a.kind) || (a.kind === 'fx' && a.format !== 'GLB') ? libraryFileUrl(a) : '')) : '';
  return h('div', { class: `asset-img asset-tile${src ? ' has-image' : ''}`, dataset: { cat, ...((cat === 'motion' || cat === 'char' || library) && a.available && !src ? { thumbId: a.id } : {}) } },
    src ? h('img', { src, alt: cat === 'char' ? `${a.name}の正面` : `${a.name}の見本`, loading: 'lazy' }) : [icon(pictogram, 28), h('span', { class: 'tile-fmt' }, a.format)]);
}

/* ------------------------------------------------------------------ ツール */

/** ［素材を取り込む…］（SCR-08 のツール）。 */
export const importButton = () =>
  h('button', { class: 'btn primary', type: 'button', dataset: { act: 'real', role: 'open-import' }, onclick: () => openImportDialog() }, '素材を取り込む…');

/* ------------------------------------------------------------------ 左：分類 */

/** @param {FeatureCtx} ctx */
export const assetCategories = (ctx) => {
  boot(ctx);
  const root = h('div', { class: 'lib-cats', dataset: { feature: 'assetCategories' } });
  watch(ctx, () => {
    const st = assets.get();
    const l = lib.get();
    const counts = countByCategory(st.items);
    const num = (/** @type {string} */ id) => (st.status === 'ready' ? String(/** @type {any} */ (counts)[id]) : '—');
    /** @param {string} id @param {string} label @param {string} ic */
    const row = (id, label, ic) => h('li', { role: 'option', tabindex: '0', 'aria-selected': String(l.cat === id), dataset: { cat: id },
      onclick: () => selectCategory(id), onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCategory(id); } } },
    icon(ic, 16), h('span', null, label), h('span', { class: 'meta', dataset: { role: 'count' } }, num(id)));
    /** ◇ の行（選んでも分類は変わらない）。 @param {string} label @param {string} ic @param {string} why @param {string[]} ids */
    const unimplRow = (label, ic, why, ids) => h('li', { role: 'option', tabindex: '0', 'aria-selected': 'false', dataset: { act: 'unimpl' }, title: `◇ 未実装：${why}`,
      onclick: () => showUnimplemented({ name: label, why, ids, phase: PH.P4 }), onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showUnimplemented({ name: label, why, ids, phase: PH.P4 }); } } },
    icon(ic, 16), h('span', null, label), h('span', { class: 'meta' }, '—'));
    const collections = ['和風セット', '桜コレクション', '夜景', 'オリジナル'];
    root.replaceChildren(
      h('ul', { class: 'list cat-list', role: 'listbox', 'aria-label': 'カテゴリ' }, row('all', 'すべての素材', 'grid'), ASSET_CATS.map((c) => row(c.id, c.label, c.icon))),
      region(h('div', { class: 'lib-unimpl', dataset: { role: 'fav-collections' } },
        h('div', { class: 'section-title' }, 'お気に入り・コレクション', regionTag('unimpl')),
        h('ul', { class: 'list cat-list sep-top', role: 'listbox', 'aria-label': 'お気に入り' }, unimplRow('お気に入り', 'heart', '素材のお気に入りは未実装です（旧画面のお気に入りはコンビネーションだけです）。', ['NF-004'])),
        h('div', { class: 'cat-head' }, h('span', null, 'コレクション'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'コレクションを追加', dataset: { act: 'unimpl' },
          onclick: () => showUnimplemented({ name: 'コレクションを追加', why: 'コレクション（素材のまとまり）の作成・保存は未実装です。', ids: ['NF-004'], phase: PH.P4 }) }, icon('plus', 16))),
        h('ul', { class: 'list cat-list', role: 'listbox', 'aria-label': 'コレクション' }, collections.map((n) => unimplRow(n, 'folder', 'コレクション（素材のまとまり）は未実装です。', ['NF-004'])))), 'unimpl'),
      h('p', { class: 'section-note' }, '件数は /api/assets の実数です。お気に入り・コレクションは未実装（◇）です。'));
  }, assets, lib);
  return root;
};

/* ------------------------------------------------------------------ 中央：一覧とキュー */

/** @param {FeatureCtx} ctx */
export const assetLibrary = (ctx) => {
  boot(ctx);
  const root = h('div', { class: 'lib', dataset: { feature: 'assetLibrary' } });
  const thumbnailObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = /** @type {HTMLElement} */ (entry.target);
      thumbnailObserver.unobserve(el);
      const item = assets.get().items.find((a) => a.id === el.dataset.thumbId);
      if (!item || !item.available) continue;
      const image = categoryOf(item) === 'char' ? characterThumbnail(item)
        : item.source === 'library' ? libraryThumbnail(item) : imageFor(item, assets.get().items);
      void image.then((url) => {
        if (!el.isConnected) return;
        if (!url) { el.title = item.format === 'VMD' ? '見本にはPMXモデルが必要です' : 'この素材の見本画像を作れませんでした'; return; }
        el.replaceChildren(h('img', { src: url, alt: categoryOf(item) === 'char' ? `${item.name}の正面` : item.source === 'library' ? `${item.name}の見本` : `${item.name}の開始・中間・終了の姿勢`, loading: 'lazy' }));
        el.classList.add('has-image');
      });
    }
  }, { rootMargin: '80px' });
  ctx.onCleanup(() => thumbnailObserver.disconnect());

  /* 場所タブ：選べるのは「ライブラリ」だけ（設計 §2.3(d) 中央） */
  /** @type {[string, string, string[]][]} */
  const sources = [['lib', 'ライブラリ', []], ['local', 'ローカル', ['NF-004']], ['proj', 'プロジェクト内', ['NF-004']], ['cloud', 'クラウド', ['NF-013']], ['recent', '最近追加', ['NF-004']], ['used', '使用中', ['NF-004']]];
  const srcBar = h('div', { class: 'seg', role: 'group', 'aria-label': '素材の場所' }, sources.map(([id, label, ids]) =>
    h('button', { type: 'button', 'aria-pressed': String(id === 'lib'), dataset: { source: id, ...(id === 'lib' ? {} : { act: 'unimpl' }) },
      onclick: () => { if (id === 'lib') return; showUnimplemented({ name: `場所：${label}`, why: id === 'cloud' ? 'クラウド連携は未実装です。' : `「${label}」の一覧は未実装です。素材はライブラリ（/api/assets 全体）に表示されます。`, ids, phase: PH.P4 }); } }, label)));
  const bulk = h('div', { class: 'btn-row' },
    unimplBtn('一括タグ付け', '複数素材へのタグ一括付与は未実装です（複数ファイルの取り込みは［素材を取り込む…］でできます）。', ['NF-004'], PH.P4),
    unimplBtn('一括変換', '形式の一括変換（例：PMX→VRM）は未実装です。', ['NF-004'], PH.P4),
    unimplBtn('参照関係を確認', '素材の参照追跡（どのシーンで使っているか）は未実装です。', ['REVIEW-010'], PH.P2));

  /* 検索・形式・並び替え・表示 */
  const l0 = lib.get();
  const search = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'search', placeholder: '素材を検索…（名前）', 'aria-label': '素材を検索', value: l0.q, dataset: { role: 'search' } }));
  search.addEventListener('input', () => setLib({ q: search.value }));
  const fmtSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '形式で絞り込み', dataset: { role: 'format' }, onchange: () => setLib({ fmt: fmtSel.value }, 'pref') }));
  const sortSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '並び替え', dataset: { role: 'sort' }, onchange: () => setLib({ sort: /** @type {any} */ (sortSel.value) }, 'pref') },
    [['api', '登録順'], ['name', '名前順'], ['format', '形式順']].map(([v, t]) => h('option', { value: v, selected: v === l0.sort }, t))));
  const gridBtn = h('button', { type: 'button', 'aria-label': 'グリッド表示', dataset: { role: 'view-grid' }, onclick: () => setLib({ view: 'grid' }, 'pref') }, icon('grid', 16));
  const listBtn = h('button', { type: 'button', 'aria-label': 'リスト表示', dataset: { role: 'view-list' }, onclick: () => setLib({ view: 'list' }, 'pref') }, icon('list', 16));
  const viewBtns = h('div', { class: 'seg icon-seg', role: 'group', 'aria-label': '表示形式' }, gridBtn, listBtn);
  const size = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: 1, max: 3, step: 1, value: l0.size, class: 'size-range', 'aria-label': 'サムネイルの大きさ', dataset: { role: 'size' } }));
  size.addEventListener('input', () => setLib({ size: Number(size.value) }, 'pref'));
  const reload = h('button', { class: 'btn ghost', type: 'button', dataset: { act: 'real', role: 'reload-assets' }, title: '素材一覧を読み直します（GET /api/assets）', onclick: () => { void loadAssets(); } }, '↻');

  const crumb = h('div', { class: 'lib-crumb' });
  const body = h('div', { class: 'lib-body' });
  const queue = h('section', { class: 'lib-queue', dataset: { feature: 'importQueue' } });

  const drawControls = () => {
    const l = lib.get();
    const fmts = formatsOf(assets.get().items);
    const fmt = fmts.includes(l.fmt) ? l.fmt : 'all';
    fmtSel.replaceChildren(...['all', ...fmts].map((f) => h('option', { value: f, selected: f === fmt }, f === 'all' ? 'すべての形式' : f)));
    fmtSel.value = fmt;
    sortSel.value = l.sort;
    gridBtn.setAttribute('aria-pressed', String(l.view === 'grid'));
    listBtn.setAttribute('aria-pressed', String(l.view === 'list'));
    size.value = String(l.size);
    if (search.value !== l.q) search.value = l.q;
  };

  const catLabel = (/** @type {string} */ c) => c === 'all' ? 'すべての素材' : (ASSET_CATS.find((x) => x.id === c) || { label: c }).label;

  const drawBody = () => {
    const st = assets.get();
    const l = lib.get();
    const fmt = formatsOf(st.items).includes(l.fmt) ? l.fmt : 'all';
    const list = filterAssets(st.items, { cat: l.cat, q: l.q, fmt, sort: l.sort });
    crumb.replaceChildren(icon('home', 14), ' ライブラリ › ', h('b', null, catLabel(l.cat)),
      h('span', { class: 'xs muted', dataset: { role: 'count' } }, st.status === 'ready' ? `　${list.length}件` : ''), h('span', { class: 'spacer' }), reload);
    if (st.status === 'idle' || st.status === 'loading') { body.replaceChildren(stateBox({ kind: 'loading', title: '読込中…', message: '素材の一覧を読み込んでいます。' })); return; }
    if (st.status === 'error') {
      const off = !!st.error && (st.error.code === 'offline' || st.error.code === 'timeout');
      body.replaceChildren(stateBox({ kind: off ? 'offline' : 'error', title: off ? '未接続' : '読み込めません', message: st.error ? st.error.message : '', retry: () => { void loadAssets(); } }));
      return;
    }
    if (!st.items.length) {
      body.replaceChildren(h('div', { class: 'empty', dataset: { role: 'empty-all' } }, 'まだ素材がありません。', h('div', null, h('button', { class: 'btn primary', type: 'button', dataset: { act: 'real' }, onclick: () => openImportDialog() }, '素材を取り込む…'))));
      return;
    }
    if (!list.length) {
      const filtered = !!l.q.trim() || fmt !== 'all';
      body.replaceChildren(filtered
        ? h('div', { class: 'empty' }, '条件に一致する素材はありません。')
        : h('div', { class: 'empty', dataset: { role: 'empty-cat' } }, 'この種類の素材はまだありません。', h('div', null, h('button', { class: 'btn primary', type: 'button', dataset: { role: 'import-empty', act: 'real' }, onclick: () => openImportDialog() }, '素材を取り込む…'))));
      return;
    }
    /** @param {AssetItem} a */
    const heart = (a) => h('button', { type: 'button', class: 'fav', dataset: { act: 'unimpl' }, 'aria-label': `${a.name}をお気に入り（未実装）`, title: '◇ 未実装：素材のお気に入り',
      onclick: (/** @type {Event} */ e) => { e.stopPropagation(); showUnimplemented({ name: 'お気に入り', why: '素材のお気に入りは未実装です（旧画面のお気に入りはコンビネーションだけです）。', ids: ['NF-004'], phase: PH.P4 }); } }, icon('heart', 16));
    /** @param {AssetItem} a */
    const pill = (a) => (a.available ? null : h('span', { class: 'pill warn', dataset: { role: 'missing' } }, 'ファイルなし'));
    /** @param {AssetItem} a */
    const pick = (a) => selectAsset(a.id);
    if (l.view === 'grid') {
      body.replaceChildren(h('div', { class: 'asset-grid', role: 'listbox', 'aria-label': '素材一覧', dataset: { size: String(l.size) } }, list.map((a) =>
        h('div', { class: `asset${a.available ? '' : ' is-missing'}`, role: 'option', tabindex: '0', 'aria-selected': String(l.sel === a.id), dataset: { assetId: a.id, available: String(a.available) },
          onclick: () => pick(a), onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(a); } } },
        h('div', { class: 'asset-tile-wrap' }, tile(a), l.sel === a.id ? h('span', { class: 'check' }, icon('check', 14)) : null),
        h('div', { class: 'asset-cap' }, h('span', null, h('b', { title: a.name }, a.name), h('span', { class: 'xs muted' }, a.format, ' ', pill(a))), heart(a))))));
    } else {
      body.replaceChildren(h('table', { class: 'table asset-table' }, h('thead', null, h('tr', null, ['名前', '分類', '形式', '登録元', 'ファイル', ''].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, list.map((a) => h('tr', { class: a.available ? '' : 'is-missing', 'aria-selected': String(l.sel === a.id), dataset: { assetId: a.id, available: String(a.available) }, onclick: () => pick(a) },
          h('td', null, h('span', { class: 'asset-list-name' }, tile(a), a.name)), h('td', null, catLabel(categoryOf(a))), h('td', { class: 'mono' }, a.format), h('td', null, sourceLabel(a)), h('td', null, a.available ? 'あり' : pill(a)), h('td', null, heart(a)))))));
    }
    thumbnailObserver.disconnect();
    body.querySelectorAll('[data-thumb-id]').forEach((el) => thumbnailObserver.observe(el));
  };

  const drawQueue = () => {
    const l = lib.get();
    const rows = imports.get().rows;
    /** @type {[string, string][]} */
    const qtabs = [['queue', `インポートキュー（${rows.length}）`], ['sync', '同期ステータス'], ['deps', '依存関係の確認'], ['dl', '最近のダウンロード']];
    /** @type {any[]} */
    const kids = [h('div', { class: 'seg', role: 'group', 'aria-label': 'キュー表示' }, qtabs.map(([id, t]) => h('button', { type: 'button', 'aria-pressed': String(l.queueTab === id), dataset: { queueTab: id }, onclick: () => setLib({ queueTab: /** @type {any} */ (id) }) }, t)))];
    if (l.queueTab !== 'queue') {
      kids.push(h('div', { class: 'empty' }, '◇ 未実装：この一覧はまだありません。'));
    } else if (!rows.length) {
      kids.push(h('div', { class: 'empty', dataset: { role: 'queue-empty' } }, 'まだ取り込みはありません。［素材を取り込む…］から選べます。'));
    } else {
      kids.push(h('table', { class: 'table imp-table', dataset: { role: 'queue' } }, h('thead', null, h('tr', null, ['ファイル名', '種類', '進み具合', '状態', ''].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, rows.map((r) => {
          const pct = r.progress === null || r.progress === undefined ? 0 : Math.round(r.progress * 100);
          const indet = r.status === 'processing' || r.status === 'checking';
          return h('tr', { dataset: { rowId: String(r.id), status: r.status, name: r.name } },
            h('td', null, icon('folder', 14), ' ', r.name, r.warnings.map((w) => h('div', { class: 'imp-warn xs' }, w))),
            h('td', null, rowKindText(r)),
            h('td', null, h('div', { class: 'progress wide', role: 'progressbar', 'aria-label': `${r.name} の進み具合`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': indet ? undefined : pct, ...(indet ? { 'data-indeterminate': '1' } : {}) },
              h('i', { style: { width: indet ? '40%' : `${r.status === 'done' ? 100 : pct}%` } }))),
            h('td', { class: 'xs', dataset: { role: 'status' } }, statusText(r), r.note ? h('div', { class: 'imp-warn' }, r.note) : null),
            h('td', null, h('div', { class: 'btn-row' },
              r.status === 'failed' ? h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'row-retry' }, onclick: () => { void retryRow(r.id); } }, 'もう一度') : null,
              r.status === 'waiting' || r.status === 'sending' ? h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'row-cancel' }, onclick: () => cancelRow(r.id) }, '取り消し') : null,
              ['done', 'failed', 'aborted', 'skipped'].includes(r.status) ? h('button', { class: 'btn ghost', type: 'button', dataset: { act: 'real', role: 'row-remove' }, title: '一覧から消します（画面の中だけ。サーバーに登録したファイルは消えません）', onclick: () => removeRow(r.id) }, '一覧から消す') : null)));
        }))));
      kids.push(h('p', { class: 'section-note' }, 'このページを開いている間の記録です（保存されません）。'));
    }
    queue.replaceChildren(...kids);
  };
  /** @param {{route: string, kind: string, label: string}} r */
  const rowKindText = (r) => {
    if (r.route === 'fbx') return `FBX（${fbxLabel(r.kind)}）`;
    if (r.route === 'pmxZip') return `PMX ZIP（モデル${r.kind}）`;
    if (r.route === 'integrated') return `${r.label.startsWith('VRM') ? 'VRM' : 'GLB'}（${r.kind === 'model' ? 'モデル' : 'モーション'}）`;
    return r.label;
  };

  // 変化した部分だけ描き直す（検索欄の入力中の欄は作り直さない）
  watch(ctx, () => { drawControls(); drawBody(); if (assets.get().status === 'ready') backfillCharacterThumbs(assets.get().items); }, assets, lib);
  watch(ctx, drawQueue, imports, lib);
  root.append(
    h('div', { class: 'lib-bar' }, srcBar, h('span', { class: 'spacer' }), bulk),
    h('div', { class: 'lib-bar' }, h('div', { class: 'search-wrap' }, icon('search', 16), search), fmtSel, sortSel, h('span', { class: 'spacer' }), viewBtns, size),
    crumb, body, queue);

  // SCR-23・SCR-01 から ?import=1 で来たらダイアログを開き、URL から消す（戻る・再読込で再び開かないように）
  if (ctx.params.get('import') === '1' && !opened.has(ctx.params)) {
    opened.add(ctx.params);
    const url = new URL(location.href);
    url.searchParams.delete('import');
    history.replaceState(history.state, '', url);
    setTimeout(() => openImportDialog(), 0);
  }
  return root;
};
/** @type {WeakSet<URLSearchParams>} */
const opened = new WeakSet();

/* ------------------------------------------------------------------ 右：詳細 */

/** @param {FeatureCtx} ctx */
export const assetDetail = (ctx) => {
  boot(ctx);
  const root = h('div', { class: 'asset-detail', dataset: { feature: 'assetDetail' } });
  /** @type {{dispose: () => void}|null} */ let currentPreview = null;
  ctx.onCleanup(() => currentPreview?.dispose());
  watch(ctx, () => {
    currentPreview?.dispose(); currentPreview = null;
    const st = assets.get();
    const l = lib.get();
    if (st.status !== 'ready') {
      root.replaceChildren(stateBox({ kind: st.status === 'error' ? 'error' : 'loading', title: st.status === 'error' ? '読み込めません' : '読込中…', message: st.error ? st.error.message : '', retry: st.status === 'error' ? () => { void loadAssets(); } : undefined }));
      return;
    }
    const a = l.sel ? st.items.find((x) => x.id === l.sel) : null;
    if (!a) {
      root.replaceChildren(h('div', { class: 'empty', dataset: { role: 'no-selection' } }, l.sel ? `選択した素材（${l.sel}）は一覧に見つかりません。` : '素材を選択してください。'));
      return;
    }
    const cat = categoryOf(a);
    const catName = (ASSET_CATS.find((c) => c.id === cat) || { label: cat }).label;
    const fileTxt = a.available ? 'あり' : 'なし（再登録してください）';
    const danceParam = a.available && a.format === 'PMX' && a.source === 'mmd' ? 'model'
      : a.available && a.format === 'GLB' && a.kind === 'motion' ? 'motion'
        : a.available && a.source === 'library' && a.kind === 'audio' ? 'audio' : '';
    const canPreview = cat === 'motion' && a.available;
    const stage = h('div', { class: 'asset-motion-stage viewport vp3d', 'aria-label': `${a.name}の動きの見本`, dataset: { role: 'motion-preview' } });
    const play = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', disabled: true, dataset: { role: 'preview-play' } }, '▶ 再生'));
    const pause = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', disabled: true, dataset: { role: 'preview-pause' } }, '❚❚ 一時停止'));
    const fit = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', disabled: true, dataset: { role: 'preview-fit' } }, '全身表示'));
    const seek = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0', disabled: true, 'aria-label': '見本の再生位置', dataset: { role: 'preview-seek' } }));
    const time = h('span', { class: 'mono xs', dataset: { role: 'preview-time' } }, '0.0 / 0.0 秒');
    const status = h('p', { class: 'section-note', role: 'status', dataset: { role: 'preview-status' } }, '動きの見本を読み込み中…');
    const clip = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '再生する動き', dataset: { role: 'preview-clip' }, hidden: true }));
    const model = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': 'VMDを再生するPMXモデル', dataset: { role: 'preview-model' }, hidden: true }));
    const libraryPreview = a.source === 'library' && a.available;
    const previewNode = libraryPreview ? h('div', { class: 'asset-library-preview detail-preview', dataset: { role: 'library-preview' } }) : canPreview ? h('div', { class: 'asset-motion-preview' }, stage,
      h('div', { class: 'asset-motion-controls' }, play, pause, fit, seek, time),
      clip, model, status) : h('div', { class: 'detail-preview tile-large', dataset: { cat } },
        cat === 'char' && a.thumbnailUrl ? h('img', { src: a.thumbnailUrl, alt: `${a.name}の正面`, dataset: { role: 'character-front' } })
          : icon(cat === 'char' ? 'user' : 'motion', 48),
        !a.thumbnailUrl ? h('span', { class: 'tile-fmt' }, a.format) : null);
    root.replaceChildren(
      previewNode,
      h('div', { class: 'detail-title' }, h('h2', { dataset: { role: 'name' } }, a.name), h('span', { class: 'spacer' }), h('span', { class: 'pill' }, kindLabel(a))),
      section('情報', 'real', h('dl', { class: 'kv', dataset: { role: 'facts' } },
        h('dt', null, '名前'), h('dd', { dataset: { key: 'name' } }, a.name),
        h('dt', null, '形式'), h('dd', { class: 'mono', dataset: { key: 'format' } }, a.format),
        h('dt', null, '分類'), h('dd', { dataset: { key: 'category' } }, catName),
        h('dt', null, '登録元'), h('dd', { dataset: { key: 'source' } }, sourceLabel(a)),
        h('dt', null, 'ID'), h('dd', { class: 'mono selectable', dataset: { key: 'id' } }, a.id),
        h('dt', null, 'ファイル'), h('dd', { dataset: { key: 'file' } }, fileTxt),
        a.originalName ? [h('dt', null, '元ファイル名'), h('dd', { dataset: { key: 'originalName' } }, a.originalName)] : null,
        a.titleSource ? [h('dt', null, '表示名の出典'), h('dd', { dataset: { key: 'titleSource' } }, a.titleSource === 'metadata' ? 'ファイル内のメタデータ' : 'ファイル名')] : null,
        Number.isFinite(a.bytes) ? [h('dt', null, '容量'), h('dd', { dataset: { key: 'bytes' } }, `${(Number(a.bytes) / 1024).toFixed(1)} KB`)] : null,
        a.width && a.height ? [h('dt', null, '大きさ'), h('dd', { dataset: { key: 'dimensions' } }, `${a.width} × ${a.height}`)] : null,
        Number.isFinite(a.duration) ? [h('dt', null, '長さ'), h('dd', { dataset: { key: 'duration' } }, `${Number(a.duration).toFixed(1)} 秒`)] : null,
        a.mime ? [h('dt', null, 'メディア形式'), h('dd', { dataset: { key: 'mime' } }, a.mime)] : null,
        a.sha256 ? [h('dt', null, 'SHA-256'), h('dd', { class: 'mono selectable', dataset: { key: 'sha256' } }, a.sha256)] : null,
        a.source === 'integrated' && a.filename ? [h('dt', null, '保存名'), h('dd', { class: 'mono', title: 'SHA-256 先頭20桁＋拡張子', dataset: { key: 'stored' } }, a.filename)] : null,
        h('dt', null, '作成者'), h('dd', { dataset: { key: 'author' } }, '未記録'),
        h('dt', null, 'ライセンス'), h('dd', { dataset: { key: 'license' } }, '未記録')),
      h('p', { class: 'section-note' }, '登録済みファイルの情報です。作者・ライセンスはサンプル出典記録以外は未記録です（REVIEW-010 は未実装）。')),
      section('タグ・説明', 'unimpl', h('p', { class: 'section-note' }, 'タグ・説明は未実装です（NF-004）。'),
        unimplBtn('タグを追加', 'タグの保存は未実装です。', ['NF-004'], PH.P4)),
      section('依存素材', 'unimpl', h('p', { class: 'section-note' }, '依存関係の追跡は未実装です（REVIEW-010）。')),
      h('div', { class: 'detail-actions' },
        h('button', { class: 'btn primary', type: 'button', disabled: cat !== 'char' && !(libraryPreview && a.format === 'GLB'), dataset: { act: 'real', role: 'show-3d' },
          title: cat === 'char' ? 'キャラクター管理（12）で3D表示します' : libraryPreview && a.format === 'GLB' ? '上の3D見本を操作します' : '見本は上で確認できます',
          onclick: () => { if (libraryPreview) { previewNode.scrollIntoView({ block: 'nearest' }); previewNode.querySelector('canvas')?.focus(); } else ctx.navigate('12', { query: { asset: a.id } }); } }, '3D で表示'),
        danceParam ? h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'use-in-dance' },
          onclick: () => ctx.navigate('10', { query: { [danceParam]: a.id } }) }, '音楽とダンスで使う') : null,
        unimplBtn('シーンで使う', '新UIから素材をシーンへ配置する機能は未接続です。現行の制作画面で素材を選んで使えます。', ['NF-014'], PH.P2),
        h('div', { class: 'btn-row' },
          unimplBtn('置換', 'シーン内の素材差し替えは未実装です。', ['REVIEW-010'], PH.P2),
          unimplBtn('エクスポート', '素材単体の書き出しは外部連携（23）の範囲です。', ['NF-010'], PH.P4))));
    if (canPreview) currentPreview = mountMotionPreview(stage, a, st.items, { play, pause, fit, seek, time, status, clip, model });
    else if (libraryPreview) currentPreview = mountLibraryPreview(previewNode, a);
  }, assets, lib);
  return root;
};

/* ------------------------------------------------------------------ SCR-01：最近の素材 */

/** このページで取り込んだ素材（完了した行を新しい順に最大4件）。登録日時が API に無いので、全素材から「最近」を求めない。 @param {FeatureCtx} ctx */
export const recentImports = (ctx) => {
  const root = h('div', { dataset: { feature: 'recentImports' } });
  watch(ctx, () => {
    const done = imports.get().rows.filter((r) => r.status === 'done' && r.assetId);
    /** @type {typeof done} */
    const uniq = [];
    for (const r of [...done].reverse()) if (!uniq.some((u) => u.assetId === r.assetId)) uniq.push(r);
    const top = uniq.slice(0, 4);
    if (!top.length) {
      root.replaceChildren(h('div', { class: 'empty', dataset: { role: 'recent-empty' } }, 'このページではまだ素材を取り込んでいません。',
        h('div', null, h('button', { class: 'btn', type: 'button', dataset: { act: 'nav' }, onclick: () => ctx.navigate('08') }, '素材管理へ'))));
      return;
    }
    const items = assets.get().items;
    root.replaceChildren(h('div', { class: 'card-row cols-4 compact' }, top.map((r) => {
      const a = items.find((i) => i.id === r.assetId);
      const name = a ? a.name : r.name;
      return h('button', { type: 'button', class: 'media-card', dataset: { assetId: String(r.assetId), act: 'nav' }, title: `素材管理（08）で開く：${name}`,
        onclick: () => { selectAsset(String(r.assetId)); ctx.navigate('08', { query: { asset: String(r.assetId) } }); } },
      h('div', { class: 'media tile-plain' }, icon(a && categoryOf(a) === 'char' ? 'user' : 'motion', 32), a ? h('span', { class: 'dur mono' }, a.format) : null),
      h('div', { class: 'media-body' }, h('b', { class: 'small' }, name), h('span', { class: 'xs muted' }, a ? sourceLabel(a) : r.label)));
    })));
  }, imports, assets);
  return root;
};
