// @ts-check
// 小さな状態ストア（P2 設計 §1.4）。制作データはブラウザーに保存しない（ページの寿命と同じ）。

/**
 * @template T
 * @param {T} initial
 * @returns {{get: () => T, set: (patch: Partial<T>, reason?: string) => void, subscribe: (fn: (state: T, reason: string) => void) => () => void}}
 */
export function createStore(initial) {
  let state = initial;
  /** @type {Set<(state: T, reason: string) => void>} */
  const subs = new Set();
  return {
    get: () => state,
    /** 浅いマージ。dirty などの入れ子は丸ごと渡す。 */
    set(patch, reason = 'set') {
      state = { ...state, ...patch };
      for (const fn of [...subs]) { try { fn(state, reason); } catch (e) { console.error(e); } }
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

/** @typedef {import('./api.js').ApiErr} ApiErr */

export const project = createStore({
  /** @type {'idle'|'loading'|'ready'|'error'} */ status: 'idle',
  /** GET /api/project/bundle の data（combination は欠けていれば既定値で補う） @type {any} */ bundle: null,
  /** 読込時の { combination, camera, workspace } の複製（外部変更の判定に使う） @type {any} */ base: null,
  /** 統合バンドルの版（bundle_revision） @type {string|null} */ revision: null,
  /** コンビネーション単体の版（GET /api/project?envelope=1 の revision） @type {string|null} */ projectRevision: null,
  /** project_state.json が無い */ combinationMissing: false,
  dirty: { combination: false, workspace: false, camera: false },
  autosavePending: false,
  saving: false,
  /** 読込の失敗だけ（status は 'error'） @type {ApiErr|null} */ error: null,
  /** 同期 tick の失敗（status は 'ready' のまま） @type {ApiErr|null} */ syncError: null,
  /** 世代番号。読込・自動保存・統合保存を始めるたびに +1。await の後で値が変わっていたら結果を捨てる */ saveSeq: 0,
  /** B-3 の 422 を受けたとき。status は 'ready' のまま @type {{backup: string|null}|null} */ cameraInvalid: null,
  externalChange: false,
  /** @type {string|null} */ syncRevision: null,
  /** @type {string|null} */ lastCommandId: null,
  /** @type {number|null} */ loadedAt: null,
});

/** 「未保存がある」の判定（設計 §1.4）。 */
export function hasUnsaved() {
  const s = project.get();
  return !!(s.dirty.combination || s.dirty.workspace || s.dirty.camera || s.autosavePending || s.saving);
}

export const assets = createStore({
  /** @type {'idle'|'loading'|'ready'|'error'} */ status: 'idle',
  /** @type {any[]} */ items: [],
  /** @type {ApiErr|null} */ error: null,
  /** @type {number|null} */ loadedAt: null,
});

/** このページを開いている間だけ（保存しない）。 */
export const imports = createStore({ /** @type {any[]} */ rows: [] });
