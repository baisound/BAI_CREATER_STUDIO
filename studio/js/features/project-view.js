// @ts-check
// ② の画面部品（SCR-18・SCR-01。P2 設計 §2.2(b)(d)）。FEATURES に登録され、screens.js の { t:'feature', key } から呼ばれる。
import { h, showUnimplemented } from '../ui.js';
import { icon } from '../icons.js';
import { project } from '../store.js';
import { stateBox } from '../state-box.js';
import { canSave, canon, describeStatus, loadProject, reloadWithConfirm, resetCameraProject, restoreHistory, saveProject, summarize, undo, redo } from './project.js';

/**
 * ストアの変化を、必要な部分が変わったときだけ描き直す（クリック中の要素を無駄に作り直さない）。
 * 購読の解除は画面の後始末（ctx.onCleanup）に登録する。
 * @param {import('./index.js').FeatureCtx} ctx
 * @param {(s: ReturnType<typeof project.get>) => void} render
 * @param {(s: ReturnType<typeof project.get>) => any} pick
 */
function bind(ctx, render, pick) {
  /** @type {string|null} */
  let sig = null;
  const run = () => {
    const s = project.get();
    const next = canon(pick(s));
    if (next === sig) return;
    sig = next;
    render(s);
  };
  run();
  ctx.onCleanup(project.subscribe(run));
}

/** 状態行に関係する値だけを取り出す。 @param {ReturnType<typeof project.get>} s */
const statusSlice = (s) => ({
  st: s.status, e: s.error && s.error.code, em: s.error && s.error.message, ci: s.cameraInvalid, cr: s.cameraRecovered, ex: s.externalChange,
  sv: s.saving, ap: s.autosavePending, d: s.dirty, se: s.syncError && [s.syncError.code, s.syncError.message], cm: s.combinationMissing,
});

/** 状態行（role=status）。compact なら1行の文言だけ（SCR-01 のカード用）。 */
export const projectStatus = (/** @type {import('./index.js').FeatureCtx} */ ctx, /** @type {any} */ c) => {
  const compact = !!(c && c.compact);
  const root = h('div', { class: `proj-status${compact ? ' compact' : ''}`, dataset: { feature: 'projectStatus' }, role: compact ? undefined : 'status', 'aria-live': compact ? undefined : 'polite' });
  bind(ctx, (s) => {
    const d = describeStatus(s);
    root.dataset.state = d.key;
    root.dataset.tone = d.tone;
    /** @type {any[]} */
    const kids = [h('span', { class: 'proj-status-text', dataset: { role: 'status-text' } }, d.text)];
    if (!compact) {
      if (d.detail) kids.push(h('p', { class: 'small proj-status-detail', dataset: { role: 'status-detail' } }, d.detail));
      if (s.status === 'ready' && s.cameraInvalid) {
        kids.push(h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'camera-reset' }, onclick: () => { void resetCameraProject(); } }, '初期状態から始める…'),
          h('button', { class: 'btn is-unimpl', type: 'button', dataset: { act: 'unimpl' }, title: '◇ 未実装：Phase E WP-02a で入ります',
            onclick: () => showUnimplemented({ name: '退避ファイルのダウンロード・中身の確認', why: '壊れたカメラ保存データの退避コピーのダウンロードと中身の確認は、Phase E の WP-02a で入ります。退避コピーは data/ に残っています。', ids: ['CAM-G06'], phase: 'Phase E WP-02a' }) }, '退避ファイルを確認…')));
      }
      if (s.status === 'ready' && (s.externalChange || s.cameraRecovered)) {
        kids.push(h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'discard-reload' }, onclick: () => { void loadProject({ discardLocal: true }); } }, '再読込して変更を破棄')));
      }
    }
    root.replaceChildren(...kids);
  }, statusSlice);
  return root;
};

/** ツール：［保存］［再読込］（SCR-18 の画面上部）。 */
export const projectToolbar = (/** @type {import('./index.js').FeatureCtx} */ ctx) => {
  const save = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn primary', type: 'button', dataset: { act: 'real', role: 'project-save' }, onclick: () => { void saveProject(); } }, '保存'));
  const reload = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'project-reload' }, title: 'サーバーの保存済み状態を読み込み直します', onclick: () => { void reloadWithConfirm(); } }, '再読込'));
  const root = h('span', { class: 'btn-row', dataset: { feature: 'projectToolbar' } }, save, reload);
  bind(ctx, (s) => {
    const can = canSave(s);
    save.disabled = !can;
    save.title = can ? 'コンビネーション・カメラ・作業中の素材参照をまとめて保存します'
      : s.cameraInvalid ? 'カメラ保存データを読めないため保存できません' : s.status !== 'ready' ? '読み込み後に使えます' : s.saving ? '保存中です' : '保存していない変更はありません';
    reload.disabled = s.status === 'loading';
  }, (s) => ({ ok: canSave(s), st: s.status, ci: !!s.cameraInvalid, sv: s.saving }));
  return root;
};

/** 読込中・失敗・未接続の表示。ready なら null。 @param {ReturnType<typeof project.get>} s @returns {HTMLElement|null} */
function notReady(s) {
  if (s.status === 'idle' || s.status === 'loading') return stateBox({ kind: 'loading', title: '読込中…', message: '制作状態を読み込んでいます。' });
  if (s.status === 'error') {
    const off = !!s.error && (s.error.code === 'offline' || s.error.code === 'timeout');
    return stateBox({ kind: off ? 'offline' : 'error', title: off ? '未接続' : '読み込めません', message: s.error ? s.error.message : '', retry: () => { void loadProject({ discardLocal: true }); } });
  }
  return null;
}

/** 現在の制作状態（設計 §2.2(d)-10 の表）。 */
export const projectSummary = (/** @type {import('./index.js').FeatureCtx} */ ctx) => {
  const root = h('div', { dataset: { feature: 'projectSummary' } });
  bind(ctx, (s) => {
    const nr = notReady(s);
    if (nr) { root.replaceChildren(nr); return; }
    const m = summarize({ ...s.bundle, combinationMissing: s.combinationMissing });
    root.replaceChildren(h('dl', { class: 'kv' },
      h('dt', null, 'タイトル'), h('dd', { dataset: { key: 'title' } }, m.title),
      h('dt', null, '最終更新'), h('dd', { dataset: { key: 'updatedAt' } }, m.updatedAt),
      h('dt', null, 'コンビネーション'), h('dd', { dataset: { key: 'combination' } }, m.combination),
      h('dt', null, 'カメラ'), h('dd', { dataset: { key: 'camera' } }, m.camera),
      h('dt', null, '作業中の素材'), h('dd', { dataset: { key: 'workspace' } }, m.workspace),
      h('dt', null, '統合保存'), h('dd', { dataset: { key: 'integrated' } }, m.integrated),
      h('dt', null, '版'), h('dd', { dataset: { key: 'revision' }, title: m.revisionFull }, m.revision)));
  }, (s) => ({ st: s.status, e: s.error && s.error.message, b: s.bundle, cm: s.combinationMissing, ci: !!s.cameraInvalid }));
  return root;
};

/** 版の短縮表示と編集履歴（戻す・やり直す・選んで復元）。 */
export const projectHistory = (/** @type {import('./index.js').FeatureCtx} */ ctx) => {
  const root = h('div', { dataset: { feature: 'projectHistory' } });
  let selected = -1;
  let lastCursor = -2;
  /** @param {ReturnType<typeof project.get>} s */
  const draw = (s) => {
    const nr = notReady(s);
    if (nr) { root.replaceChildren(nr); return; }
    const c = s.bundle && s.bundle.combination;
    const hist = c ? c.history : [];
    const cursor = c ? c.cursor : -1;
    const ready = s.status === 'ready';
    if (selected < 0 || selected >= hist.length || cursor !== lastCursor) selected = Math.max(0, cursor);
    lastCursor = cursor;
    const m = summarize({ ...s.bundle, combinationMissing: s.combinationMissing });
    const list = h('ul', { class: 'list proj-hist', role: 'listbox', 'aria-label': '編集履歴' });
    hist.forEach((/** @type {any} */ e, /** @type {number} */ i) => {
      const at = e.at ? new Date(e.at).toLocaleString('ja-JP') : '—';
      list.append(h('li', { role: 'option', 'aria-selected': String(i === selected), dataset: { index: String(i), current: String(i === cursor) },
        onclick: () => { selected = i; draw(project.get()); } },
      h('span', null, `${i + 1}. ${at} ${e.label || ''}`), i === cursor ? h('span', { class: 'pill', dataset: { role: 'current' } }, '現在') : null));
    });
    root.replaceChildren(
      h('p', { class: 'small' }, '版：', h('span', { class: 'mono', dataset: { role: 'revision' }, title: m.revisionFull }, m.revision)),
      hist.length ? list : h('div', { class: 'empty' }, '履歴はまだありません。コンビネーションを編集すると記録されます（現行の制作画面、または ⑤ の移植後）。'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'undo' }, disabled: !ready || cursor <= 0, onclick: () => undo() }, '戻す'),
        h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'redo' }, disabled: !ready || cursor >= hist.length - 1, onclick: () => redo() }, 'やり直す'),
        h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'restore-selected' }, disabled: !ready || !hist.length || selected === cursor, onclick: () => restoreHistory(selected) }, 'この時点に戻す')),
      h('p', { class: 'section-note' }, '編集履歴はコンビネーションのみです。任意の版との差分比較は未実装です。'));
  };
  bind(ctx, draw, (s) => ({ st: s.status, e: s.error && s.error.message, c: s.bundle && s.bundle.combination && { h: s.bundle.combination.history, c: s.bundle.combination.cursor }, rev: s.revision, ci: !!s.cameraInvalid }));
  return root;
};

/** 左パネル：プロジェクト一覧（単一の制作状態を1件）。 */
export const projectList = (/** @type {import('./index.js').FeatureCtx} */ ctx) => {
  const root = h('div', { dataset: { feature: 'projectList' } });
  bind(ctx, (s) => {
    const m = summarize({ ...s.bundle, combinationMissing: s.combinationMissing });
    const meta = s.status === 'ready' ? m.updatedAt : s.status === 'error' ? '未接続' : '読込中…';
    root.replaceChildren(
      h('ul', { class: 'list', role: 'listbox', 'aria-label': 'プロジェクト' },
        h('li', { role: 'option', 'aria-selected': 'true', dataset: { id: 'cur' } }, h('span', null, '現在の制作状態'), h('span', { class: 'meta' }, meta))),
      h('p', { class: 'section-note' }, '単一の制作状態です。複数プロジェクトの一覧・切替は未実装です。'));
  }, (s) => ({ st: s.status, u: s.bundle && s.bundle.combination && s.bundle.combination.updatedAt }));
  return root;
};

/** SCR-01 の「最近のプロジェクト」：実データの1枚。押すと SCR-18 へ移る。 */
export const projectCard = (/** @type {import('./index.js').FeatureCtx} */ ctx) => {
  const status = projectStatus(ctx, { compact: true });
  const title = h('b', null, '現在の制作状態');
  const updated = h('span', { class: 'xs muted' }, '');
  bind(ctx, (s) => {
    const m = summarize({ ...s.bundle, combinationMissing: s.combinationMissing });
    title.textContent = s.status === 'ready' ? m.title : '現在の制作状態';
    updated.textContent = s.status === 'ready' ? `更新 ${m.updatedAt}` : '';
  }, (s) => ({ st: s.status, b: s.bundle && s.bundle.combination && [s.bundle.combination.title, s.bundle.combination.updatedAt], cm: s.combinationMissing }));
  return h('button', { type: 'button', class: 'media-card project-card', dataset: { feature: 'projectCard', act: 'nav' }, title: 'プロジェクト保存・復元（18）を開く', onclick: () => ctx.navigate('18') },
    h('div', { class: 'media tile-plain' }, icon('folder', 40)),
    h('div', { class: 'media-body' }, title, updated, status));
};
