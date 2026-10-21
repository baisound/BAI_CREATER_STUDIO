// @ts-check
// ② プロジェクトの読込・自動保存・統合保存・履歴・外部変更の検知（P2 設計 §2.2(d)）。
// ロジックは Python 側にある。ここは既存 API（/api/project・/api/project/bundle・/api/sync）を呼び、
// 結果をストア（store.js の project）へ入れるだけ。DOM を使わない部分は createProjectController に依存を渡す形にして、
// 偽の時計と偽の fetch で単体テストできる（tests/studio-p2-project-logic.test.mjs）。
import { getJson, postJson, messageFor, LIMITS } from '../api.js';
import { project as defaultStore, hasUnsavedOf, initialProjectState } from '../store.js';
import { emit as busEmit } from '../bus.js';
import { h, toast as uiToast, openModal, closeModal } from '../ui.js';
import { loadLegacyScript } from '../legacy.js';

/** @typedef {import('../api.js').ApiErr} ApiErr */
/** @typedef {ReturnType<typeof import('../store.js').createStore>} _S */

export const DEFAULT_COMBINATION = Object.freeze({ schema: 1, title: '無題のプロジェクト', timeline: [], history: [], cursor: -1, selected: 0, playbackSpeed: 1, updatedAt: '' });
const DEFAULT_WORKSPACE = Object.freeze({ frame: 0, asset: '', clip: null });

/** 自動保存の待ち（旧画面と同じ。index.html の autosave）。 */
export const AUTOSAVE_MS = 450;
/** 外部変更の確認間隔（旧画面と同じ）。 */
export const SYNC_MS = 1200;

export const CAMERA_INVALID_CODE = 'camera_project_invalid';

/** キーの順番に依存しない JSON 文字列。 @param {any} v @returns {string} */
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return v === undefined ? 'null' : JSON.stringify(v);
}
/** @param {any} a @param {any} b */
export const same = (a, b) => canon(a) === canon(b);
/** @template T @param {T} v @returns {T} */
const clone = (v) => (v === undefined ? v : structuredClone(v));

/** @param {ApiErr|null|undefined} e */
const isOffline = (e) => !!e && (e.code === 'offline' || e.code === 'timeout');
/** @param {any} r */
const isCameraInvalid = (r) => !!r && r.ok === false && r.status === 422 && r.serverCode === CAMERA_INVALID_CODE;

/** 表示用の純関数（設計 §2.2(d)-10）。 @param {any} bundle */
export function summarize(bundle) {
  const c = bundle && bundle.combination;
  const cam = bundle && bundle.camera;
  const ws = bundle && bundle.workspace;
  const fmtDate = (/** @type {string} */ s) => {
    if (!s) return '—';
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ja-JP');
  };
  const missing = !!(bundle && bundle.combinationMissing === true);
  return {
    title: c ? `${c.title || '無題のプロジェクト'}${missing ? '（未保存）' : ''}` : '—',
    updatedAt: c ? fmtDate(c.updatedAt) : '—',
    combination: c ? `${c.timeline.length}件・履歴${c.history.length}件（${c.history.length ? `${c.cursor + 1}番目` : '履歴なし'}）` : '—',
    camera: cam ? `${cam.keys.length}キー・${cam.duration}F・${cam.fps}fps` : '—（読めません）',
    workspace: ws ? `${ws.asset || 'なし'}・${ws.clip === null || ws.clip === undefined ? 'クリップなし' : `クリップ${ws.clip}`}・F ${ws.frame}` : 'なし・クリップなし・F 0',
    integrated: bundle && bundle.complete ? '保存済み' : 'コンビネーション未保存（保存すると作成されます）',
    revision: bundle && bundle.revision ? String(bundle.revision).slice(0, 12) : '—',
    revisionFull: bundle && bundle.revision ? String(bundle.revision) : '',
  };
}

/**
 * 状態行の文言（設計 §2.2(b)）。画面に出す優先順位をここで1か所に決める。
 * @param {ReturnType<typeof initialProjectState>} s
 * @returns {{key: string, text: string, detail: string|null, tone: 'ok'|'busy'|'warn'|'error'}}
 */
export function describeStatus(s) {
  if (s.status === 'idle') return { key: 'idle', text: '未読込', detail: null, tone: 'busy' };
  if (s.status === 'loading') return { key: 'loading', text: '読込中…', detail: null, tone: 'busy' };
  if (s.status === 'error') {
    if (isOffline(s.error)) return { key: 'offline', text: '未接続', detail: s.error ? s.error.message : null, tone: 'error' };
    return { key: 'error', text: '読み込めません', detail: s.error ? s.error.message : null, tone: 'error' };
  }
  if (s.cameraRecovered) return { key: 'camera-recovered', text: 'カメラ保存データが読めるようになりました。［再読込して変更を破棄］で読み込めます。', detail: null, tone: 'warn' };
  if (s.cameraInvalid) return { key: 'camera-invalid', text: 'カメラ保存データを読めません', detail: s.cameraInvalid.message || null, tone: 'error' };
  if (s.bundleCoreError) return { key: 'bundle-core-error', text: '保存の部品を読み込めませんでした。再読込してください。', detail: s.bundleCoreError, tone: 'error' };
  if (s.externalChange) return { key: 'external', text: 'サーバー側が更新されました。保存されていない変更があるため、自動では読み込みません。［再読込して変更を破棄］', detail: null, tone: 'warn' };
  if (s.saving) return { key: 'saving', text: '保存中…', detail: null, tone: 'busy' };
  if (s.autosavePending) return { key: 'autosave-pending', text: '自動保存待ち…', detail: null, tone: 'busy' };
  if (s.dirty.combination || s.dirty.workspace || s.dirty.camera) return { key: 'dirty', text: '未保存の変更があります（［保存］で保存）', detail: null, tone: 'warn' };
  if (s.syncError) {
    if (isOffline(s.syncError)) return { key: 'offline', text: '未接続', detail: s.syncError.message, tone: 'error' };
    return { key: 'sync-error', text: s.syncError.message, detail: null, tone: 'error' };
  }
  if (s.combinationMissing) return { key: 'saved', text: 'コンビネーション未保存', detail: null, tone: 'ok' };
  return { key: 'saved', text: '保存済み', detail: null, tone: 'ok' };
}

/** ［保存］を使えるか（設計 §2.2(d)-10）。 @param {ReturnType<typeof initialProjectState>} s */
export function canSave(s) {
  return s.status === 'ready' && !s.saving && !s.cameraInvalid && !s.bundleCoreError && hasUnsavedOf(s);
}

/**
 * @typedef {{
 *   toast: (msg: string, kind?: string) => void,
 *   confirm: (o: {title: string, body: string, ok: string, cancel?: string, danger?: boolean}) => Promise<boolean>,
 *   conflict: (onReload: () => void) => void,
 *   emit: (name: string, detail?: any) => void,
 * }} ProjectUi
 * @typedef {{
 *   api?: {getJson: typeof getJson, postJson: typeof postJson},
 *   store?: {get: () => ReturnType<typeof initialProjectState>, set: (patch: Partial<ReturnType<typeof initialProjectState>>, reason?: string) => void, subscribe: (fn: (s: any, reason: string) => void) => () => void},
 *   now?: () => number,
 *   setTimeout?: (fn: () => void, ms: number) => any,
 *   clearTimeout?: (id: any) => void,
 *   setInterval?: (fn: () => void, ms: number) => any,
 *   ui?: Partial<ProjectUi>,
 *   beforeBundleSave?: () => void,
 *   cameraSnapshot?: () => any,
 *   cameraDirty?: () => boolean,
 *   afterBundleSave?: (camera: any) => Promise<void>,
 *   loadBundleCore?: () => Promise<any>,
 * }} ControllerDeps
 */

/**
 * @param {ControllerDeps} [deps]
 */
export function createProjectController(deps = {}) {
  const api = deps.api || { getJson, postJson };
  const store = deps.store || defaultStore;
  const now = deps.now || (() => Date.now());
  const st = deps.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const ct = deps.clearTimeout || ((id) => clearTimeout(id));
  const si = deps.setInterval || ((fn, ms) => setInterval(fn, ms));
  /** @type {ProjectUi} */
  const ui = {
    toast: () => {}, confirm: async () => true, conflict: () => {}, emit: () => {},
    ...(deps.ui || {}),
  };
  const beforeBundleSave = deps.beforeBundleSave || (() => {});
  const cameraSnapshot = deps.cameraSnapshot || (() => null);
  const cameraDirty = deps.cameraDirty || (() => false);
  const afterBundleSave = deps.afterBundleSave || (async () => {});
  const loadBundleCore = deps.loadBundleCore || (async () => {
    if (typeof window !== 'undefined') await loadLegacyScript('/camera_bundle_core.js');
    const core = /** @type {any} */ (globalThis).BAICameraBundleCore;
    if (!core?.buildBundleBody || !core?.mergeWorkspace || !core?.validateRestore) throw Error('共通部品がありません');
    return core;
  });

  /** @type {any} */ let timer = null;
  /** @type {Promise<void>|null} */ let syncInFlight = null;
  /** 自動保存を通信の失敗の後で再開してよいか（409・400 のときは利用者の操作を待つ） */
  let retryAutosave = false;
  let combVersion = 0;
  let wsVersion = 0;
  /** @type {Promise<boolean>|null} */ let cameraOnlySyncInFlight = null;

  const get = () => store.get();
  const stale = (/** @type {number} */ my) => get().saveSeq !== my;
  const bump = () => { const my = get().saveSeq + 1; store.set({ saveSeq: my }, 'seq'); return my; };

  function clearTimer() {
    if (timer !== null) { ct(timer); timer = null; }
  }

  /** 自動保存の予約（コンビネーションが変わるたびに引き直す）。 */
  function scheduleAutosave() {
    const s = get();
    if (s.status !== 'ready') return;
    clearTimer();
    store.set({ autosavePending: true }, 'autosave-scheduled');
    timer = st(() => { timer = null; void autosave(); }, AUTOSAVE_MS);
  }

  /** @param {ApiErr} err */
  function setCameraInvalid(err) {
    store.set({
      cameraInvalid: { backup: (err.body && typeof err.body.backup === 'string') ? err.body.backup : null, message: err.serverMessage || err.message },
      cameraRecovered: false,
    }, 'camera-invalid');
  }

  /** 保存データ（コンビネーション）が無いときだけ使う、ストアの中だけの既定値。 @param {any} project */
  const isEmptyProject = (project) => !project || typeof project !== 'object' || Object.keys(project).length === 0;

  /**
   * 読込（設計 §2.2(d)-2）。未保存があって discardLocal=false なら、何もせずに false を返す。
   * @param {{discardLocal?: boolean}} [o]
   * @returns {Promise<boolean>} 読み込めたら true
   */
  async function loadProject({ discardLocal = false } = {}) {
    if (!discardLocal) refreshCameraDirty();
    if (!discardLocal && hasUnsavedOf(get())) return false;
    clearTimer();
    const my = bump();
    retryAutosave = false;
    store.set({ status: 'loading', saving: false, autosavePending: false, error: null }, 'load-start');
    for (let attempt = 0; ; attempt++) {
      const [b, e] = await Promise.all([api.getJson('/api/project/bundle'), api.getJson('/api/project?envelope=1')]);
      if (stale(my)) return false;
      const invalid = isCameraInvalid(b);
      if (!e.ok || (!b.ok && !invalid)) {
        const err = /** @type {ApiErr} */ (!b.ok && !invalid ? b : e);
        store.set({ status: 'error', error: err }, 'load-error');
        return false;
      }
      const env = /** @type {any} */ (e.data);
      if (invalid) {
        // コンビネーションは封筒から読み込んで使えるようにする（3-M4(b)）。
        const missing = isEmptyProject(env.project);
        const combination = missing ? clone(DEFAULT_COMBINATION) : env.project;
        store.set({
          status: 'ready', error: null, syncError: null,
          bundle: { schema: 1, combination, camera: null, workspace: null, complete: !missing, revision: null },
          base: { combination: missing ? null : clone(env.project), camera: null, workspace: null },
          revision: null, projectRevision: env.revision, combinationMissing: missing,
          dirty: { combination: false, workspace: false, camera: false }, autosavePending: false, saving: false,
          externalChange: false, cameraRecovered: false, loadedAt: now(),
        }, 'loaded');
        setCameraInvalid(/** @type {ApiErr} */ (b));
        ui.emit('studio:project-loaded', { revision: null });
        return true;
      }
      const data = /** @type {any} */ (/** @type {any} */ (b).data);
      if (!same(env.project, data.combination ?? {})) {
        if (attempt < 1) continue; // 読込中に変更があった。1回だけ取り直す。
        store.set({
          status: 'error',
          error: { ok: false, status: 0, code: 'client', message: '保存データを一貫した状態で読めませんでした。再読込してください。', serverMessage: null, serverCode: null, body: null },
        }, 'load-inconsistent');
        return false;
      }
      const missing = data.combination === null || data.combination === undefined;
      const combination = missing ? clone(DEFAULT_COMBINATION) : data.combination;
      store.set({
        status: 'ready', error: null, syncError: null, cameraInvalid: null, cameraRecovered: false,
        bundle: { ...data, combination },
        base: clone({ combination: data.combination, camera: data.camera, workspace: data.workspace }),
        revision: data.revision, projectRevision: env.revision, combinationMissing: missing,
        dirty: { combination: false, workspace: false, camera: false }, autosavePending: false, saving: false,
        externalChange: false, loadedAt: now(),
      }, 'loaded');
      ui.emit('studio:project-loaded', { revision: data.revision });
      return true;
    }
  }

  /**
   * 履歴の復元（設計 §2.2(d)-3）。旧 restore と同じく selected と history 配列は変えない。
   * @param {number} index
   */
  function restoreHistory(index) {
    const s = get();
    const c = s.bundle && s.bundle.combination;
    if (s.status !== 'ready' || !c || !Number.isInteger(index) || index < 0 || index >= c.history.length) return;
    const entry = c.history[index];
    combVersion++;
    store.set({
      bundle: { ...s.bundle, combination: { ...c, timeline: clone(entry.timeline), cursor: index, playbackSpeed: entry.playbackSpeed || 1 } },
      dirty: { ...s.dirty, combination: true },
    }, 'restore-history');
    scheduleAutosave();
  }
  const undo = () => { const c = get().bundle?.combination; if (c) restoreHistory(c.cursor - 1); };
  const redo = () => { const c = get().bundle?.combination; if (c) restoreHistory(c.cursor + 1); };

  /**
   * コンビネーションの編集（設計 §2.5 WP-05c の 4。旧 index.html:374 の `record` と同じ規則）。
   * 履歴に積み、②の自動保存で保存する。⑤の画面はコンビネーションをこの関数でだけ書く。
   * @param {{name: string}[]} timeline 新しい手順の並び（name だけを使う）
   * @param {{label?: string}} [o]
   * @returns {boolean} 受け付けたら true（変化なし・読込前は false）
   */
  function editCombination(timeline, { label = 'コンビネーション変更' } = {}) {
    const s = get();
    const c = s.bundle && s.bundle.combination;
    if (s.status !== 'ready' || !c || !Array.isArray(timeline)) return false;
    const next = timeline.filter((x) => x && typeof x.name === 'string').map((x) => ({ name: x.name }));
    const selected = c.selected || 1;
    const playbackSpeed = c.playbackSpeed || 1;
    const curTimeline = Array.isArray(c.timeline) ? c.timeline : [];
    /** @type {any[]} */
    let history = Array.isArray(c.history) ? c.history : [];
    let cursor = Number.isInteger(c.cursor) ? c.cursor : -1;
    if (!history.length) {
      if (same(curTimeline, next)) return false; // 何も変わらないなら「初期状態」も作らない
      history = [{ label: '初期状態', at: new Date(now()).toISOString(), timeline: clone(curTimeline), selected, playbackSpeed }]; // 旧 :383
      cursor = 0;
    }
    const last = history[cursor];
    /** @type {any} */ let patch;
    if (last && same(last.timeline, next)) {
      // 履歴の最新と同じ内容。履歴は増やさず、表示中の並びが違うときだけ並びを直す。
      if (same(curTimeline, next)) return false;
      patch = { ...c, timeline: next };
    } else {
      history = history.slice(0, cursor + 1);
      history.push({ label, at: new Date(now()).toISOString(), timeline: clone(next), selected, playbackSpeed });
      if (history.length > 100) history.shift();
      patch = { ...c, timeline: next, history, cursor: history.length - 1 };
    }
    combVersion++;
    store.set({ bundle: { ...s.bundle, combination: patch }, dirty: { ...s.dirty, combination: true } }, 'edit-combination');
    scheduleAutosave();
    return true;
  }

  /** 再生速度（0.5・1・1.5・2 だけ）。履歴には積まない（旧 :382）。 @param {number} v */
  function setCombinationSpeed(v) {
    const s = get();
    const c = s.bundle && s.bundle.combination;
    if (s.status !== 'ready' || !c || ![0.5, 1, 1.5, 2].includes(v) || c.playbackSpeed === v) return false;
    combVersion++;
    store.set({ bundle: { ...s.bundle, combination: { ...c, playbackSpeed: v } }, dirty: { ...s.dirty, combination: true } }, 'combination-speed');
    scheduleAutosave();
    return true;
  }

  /** SCR-05 で選んだパターンの番号。選んだだけでは保存しない（dirty にしない。旧画面も同じ）。 @param {number} id */
  function setCombinationSelected(id) {
    const s = get();
    const c = s.bundle && s.bundle.combination;
    if (s.status !== 'ready' || !c || !Number.isInteger(id) || id < 1 || c.selected === id) return false;
    store.set({ bundle: { ...s.bundle, combination: { ...c, selected: id } } }, 'combination-selected');
    return true;
  }

  /**
   * workspace を書く唯一の経路（設計 §2.2(d)-9）。frame だけの変化は dirty にしない。
   * @param {{asset?: string, clip?: number|null, frame?: number, stage?: any, lights?: any, character?: any}} fields
   * @param {{source?: 'store'|'host'}} [_o]
   */
  function setWorkspaceFields(fields, _o = {}) {
    const s = get();
    if (s.status !== 'ready' || !s.bundle) return;
    if (s.cameraInvalid) {
      ui.toast('カメラ保存データを読めないため、作業中の素材は変えられません', 'err');
      return;
    }
    const cur = s.bundle.workspace ?? DEFAULT_WORKSPACE;
    /** @type {Record<string, any>} */
    const next = { ...cur, ...fields };
    if ('asset' in fields && fields.asset !== cur.asset && !('clip' in fields)) next.clip = null;
    if (same(next, cur) && s.bundle.workspace) return;
    const meaningful = ['asset', 'clip', 'stage', 'lights', 'character'].some((k) => !same(next[k], cur[k]));
    if (meaningful) wsVersion++;
    store.set({
      bundle: { ...s.bundle, workspace: next },
      dirty: meaningful ? { ...s.dirty, workspace: true } : s.dirty,
    }, _o.source === 'host' ? 'workspace-host' : 'workspace');
  }
  const setWorkspaceAsset = (/** @type {string} */ filename) => setWorkspaceFields({ asset: filename });

  /** カメラの編集状態を保存ボタンと離脱警告へ反映する。 */
  function refreshCameraDirty() {
    const s = get();
    if (s.status !== 'ready' || !s.bundle || s.cameraInvalid) return;
    const dirty = cameraDirty();
    if (s.dirty.camera !== dirty) store.set({ dirty: { ...s.dirty, camera: dirty } }, 'camera-dirty');
  }

  /** カメラ単独保存が更新した bundle revision を取り直す。 */
  function cameraOnlySaved() {
    if (cameraOnlySyncInFlight) return cameraOnlySyncInFlight;
    cameraOnlySyncInFlight = (async () => {
      const seq = get().saveSeq;
      const r = await api.getJson('/api/project/bundle');
      if (get().saveSeq !== seq) return false;
      if (!r.ok) {
        if (isCameraInvalid(r)) setCameraInvalid(r);
        else store.set({ syncError: r }, 'camera-save-sync-error');
        return false;
      }
      const data = /** @type {any} */ (r.data);
      const s = get();
      if (!s.bundle || !s.base || !same(data.combination, s.base.combination) || !same(data.workspace, s.base.workspace)) {
        onExternalDetected();
        return false;
      }
      const localCamera = cameraSnapshot()?.camera;
      const cameraHasNewEdits = cameraDirty() || (localCamera && !same(localCamera, data.camera));
      store.set({
        revision: data.revision,
        bundle: { ...s.bundle, camera: cameraHasNewEdits ? localCamera : data.camera },
        base: { ...s.base, camera: clone(data.camera) },
        dirty: { ...s.dirty, camera: !!cameraHasNewEdits },
        syncError: null,
      }, 'camera-only-saved');
      return true;
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      store.set({ syncError: { ok: false, status: 0, code: 'client', message: `カメラ保存後の版を取得できません：${message}`, serverMessage: null, serverCode: null, body: null } }, 'camera-save-sync-error');
      return false;
    }).finally(() => { cameraOnlySyncInFlight = null; });
    return cameraOnlySyncInFlight;
  }

  /** 保存の後の GET で、自分の保存以外の変更が見つかったときの処理（設計 §2.2(d)-7 と同じ）。 */
  function onExternalDetected() {
    clearTimer();
    store.set({ autosavePending: false, externalChange: true }, 'external-after-save');
  }

  /** 自動保存（設計 §2.2(d)-4）。 */
  async function autosave() {
    const first = get();
    if (first.status !== 'ready' || !first.bundle) { store.set({ autosavePending: false }, 'autosave-skip'); return; }
    if (first.saving) { // 保存中なら、終わってからもう一度予約する（旧と同じ）
      clearTimer();
      timer = st(() => { timer = null; void autosave(); }, AUTOSAVE_MS);
      return;
    }
    // 送る前に、動いている tick があれば、その終わりを待つ（3-M3）。待っている間に別の読込・保存が始まったら送らない。
    // 世代番号は待った後で取る（先に進めると、待っている tick の結果が捨てられてしまう）。
    const seq0 = first.saveSeq;
    if (syncInFlight) { try { await syncInFlight; } catch { /* tick は例外を出さない */ } }
    if (get().saveSeq !== seq0) return;
    const s = get();
    // tick が外部変更を見つけて予約を止めていたら（autosavePending=false）、送らない（送れば 409 になるだけ）。
    // 統合保存が予約を引き取ったときも同じ（saving=true）。送らないときは世代番号を進めない
    // （進めると、同じ tick を待っている統合保存が自分の結果を捨て、saving:true のまま止まる）。
    if (s.status !== 'ready' || !s.bundle || !s.dirty.combination || !s.autosavePending || s.saving) {
      if (!s.saving) store.set({ autosavePending: false }, 'autosave-nothing');
      else if (s.autosavePending && timer === null) timer = st(() => { timer = null; void autosave(); }, AUTOSAVE_MS); // 保存中なら終わってから
      return;
    }
    const my = bump();
    const sentVersion = combVersion;
    const body = { ...s.bundle.combination, updatedAt: new Date(now()).toISOString() };
    store.set({ saving: true }, 'autosave-start');
    try {
      const r = await api.postJson('/api/project', body, { ifMatch: s.projectRevision || undefined, limitLabel: LIMITS.project });
      if (stale(my)) return;
      if (!r.ok) {
        store.set({ autosavePending: false }, 'autosave-failed');
        if (r.code === 'conflict') { retryAutosave = false; ui.conflict(() => { void loadProject({ discardLocal: true }); }); }
        else if (isOffline(r)) { retryAutosave = true; ui.toast('未接続：自動保存できませんでした。変更はこの画面に残っています。', 'err'); }
        else if (r.code === 'bad_request') { retryAutosave = false; ui.toast(`自動保存できませんでした：${r.serverMessage || '入力を確認してください'}`, 'err'); }
        else { retryAutosave = false; ui.toast(`自動保存できませんでした：${r.message}`, 'err'); }
        return;
      }
      const newer = combVersion !== sentVersion; // 保存の通信中に、さらに編集があった
      const cur = get();
      store.set({
        projectRevision: /** @type {any} */ (r.data).revision,
        bundle: newer ? { ...cur.bundle, complete: true } : { ...cur.bundle, combination: body, complete: true },
        base: { ...(cur.base || {}), combination: clone(body) },
        combinationMissing: false,
        dirty: { ...cur.dirty, combination: newer },
        autosavePending: newer,
        syncError: null,
      }, 'autosaved');
      if (get().cameraInvalid) { // この GET は必ず 422 になるので送らない（v5 C5）。
        ui.emit('studio:project-saved', { revision: get().revision, kind: 'autosave' });
      } else {
        const g = await api.getJson('/api/project/bundle');
        if (stale(my)) return;
        if (isCameraInvalid(g)) setCameraInvalid(/** @type {ApiErr} */ (g));
        else if (g.ok) {
          const d = /** @type {any} */ (g.data);
          const b = get().base || {};
          if (same(d.combination, body) && same(d.camera, b.camera) && same(d.workspace, b.workspace)) store.set({ revision: d.revision }, 'revision');
          else onExternalDetected();
        }
        ui.emit('studio:project-saved', { revision: get().revision, kind: 'autosave' });
      }
      if (combVersion !== sentVersion) scheduleAutosave();
    } finally {
      if (!stale(my)) store.set({ saving: false }, 'autosave-end');
    }
  }

  /**
   * 統合保存（設計 §2.2(d)-5）。
   * @returns {Promise<boolean>} 保存できたら true
   */
  async function saveProject() {
    if (cameraOnlySyncInFlight && !(await cameraOnlySyncInFlight)) {
      ui.toast('カメラ保存後の版を取得できません。再読込してから保存してください。', 'err');
      return false;
    }
    try { beforeBundleSave(); } catch (error) {
      ui.toast(`カメラ状態を確認できませんでした：${error instanceof Error ? error.message : String(error)}`, 'err');
      return false;
    }
    let s = get();
    if (s.status !== 'ready' || !s.bundle || s.cameraInvalid || s.bundleCoreError) return false;
    if (!hasUnsavedOf(s)) { ui.toast('変更はありません', 'real'); return false; }
    if (s.saving) return false;
    if (s.combinationMissing) {
      const ok = await ui.confirm({
        title: 'コンビネーションを作成します',
        body: 'コンビネーション（project_state.json）はまだ作られていません。保存すると空のコンビネーションも一緒に作られます。',
        ok: '続ける', cancel: 'キャンセル',
      });
      if (!ok) return false;
      s = get();
      if (s.status !== 'ready' || !s.bundle || s.saving) return false;
    }
    /** @type {any} */ let core;
    try { core = await loadBundleCore(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.set({ bundleCoreError: message }, 'bundle-core-error');
      ui.toast('保存の部品を読み込めませんでした。再読込してください。', 'err');
      return false;
    }
    clearTimer();
    const seq0 = get().saveSeq;
    const sentComb = combVersion;
    const sentWs = wsVersion;
    /** @type {number|null} */ let my = null;
    store.set({ autosavePending: false, saving: true }, 'save-start');
    try {
      if (syncInFlight) { try { await syncInFlight; } catch { /* 例外は出ない */ } }
      if (get().saveSeq !== seq0) return false;
      my = bump();
      const cur = get();
      if (!cur.bundle) return false;
      const combination = { ...cur.bundle.combination, updatedAt: new Date(now()).toISOString() };
      const snapshot = cameraSnapshot();
      const camera = snapshot?.camera || cur.bundle.camera;
      const workspace = core.mergeWorkspace(cur.bundle.workspace, snapshot?.workspace || null);
      const body = core.buildBundleBody({ combination, camera, workspace });
      const r = await api.postJson('/api/project/bundle', body, { ifMatch: cur.revision || undefined, limitLabel: LIMITS.bundle });
      if (stale(my)) return false;
      if (!r.ok) {
        if (r.code === 'conflict') ui.conflict(() => { void loadProject({ discardLocal: true }); });
        else if (isCameraInvalid(r)) setCameraInvalid(r);
        else if (r.code === 'bad_request') ui.toast(`保存できませんでした：${r.serverMessage || '入力を確認してください'}`, 'err');
        else if (isOffline(r)) ui.toast('未接続：保存できませんでした。変更はこの画面に残っています。', 'err');
        else ui.toast(r.message, 'err');
        return false;
      }
      try { await afterBundleSave(camera); }
      catch (error) { ui.toast(`保存しましたが、カメラ画面との同期に失敗しました：${error instanceof Error ? error.message : String(error)}`, 'err'); }
      const newerComb = combVersion !== sentComb;
      const newerWs = wsVersion !== sentWs;
      const after = get();
      const newerCamera = cameraDirty();
      store.set({
        revision: /** @type {any} */ (r.data).revision,
        bundle: { ...after.bundle, combination: newerComb ? after.bundle.combination : combination,
          camera: newerCamera ? (cameraSnapshot()?.camera || camera) : camera, complete: true },
        base: clone({ combination, camera, workspace }),
        combinationMissing: false,
        dirty: { combination: newerComb, workspace: newerWs, camera: newerCamera },
        syncError: null,
      }, 'saved');
      const g = await api.getJson('/api/project?envelope=1');
      if (stale(my)) return true;
      if (g.ok) {
        const d = /** @type {any} */ (g.data);
        if (same(d.project, combination)) store.set({ projectRevision: d.revision }, 'project-revision');
        else onExternalDetected();
      }
      ui.toast('保存しました（コンビネーション・カメラ・作業中の素材参照）。', 'real');
      ui.emit('studio:project-saved', { revision: get().revision, kind: 'bundle' });
      if (combVersion !== sentComb) scheduleAutosave();
      return true;
    } catch (error) {
      ui.toast(`保存できませんでした：${error instanceof Error ? error.message : String(error)}`, 'err');
      return false;
    } finally {
      if (my !== null && !stale(my)) store.set({ saving: false }, 'save-end');
    }
  }

  /**
   * ［再読込］と復元後の確認（設計 §2.2(d)-6）。
   * @returns {Promise<boolean>}
   */
  async function reloadWithConfirm() {
    refreshCameraDirty();
    if (hasUnsavedOf(get())) {
      const ok = await ui.confirm({
        title: '再読込',
        body: '保存していない変更を破棄して、サーバーの保存済み状態を読み込みますか？',
        ok: '破棄して読み込む', cancel: 'キャンセル', danger: true,
      });
      if (!ok) return false;
    }
    return loadProject({ discardLocal: true });
  }

  /** 外部変更の確認（設計 §2.2(d)-7）。 @param {{fromVisibility?: boolean}} [o] */
  function tick({ fromVisibility = false } = {}) {
    refreshCameraDirty();
    if (syncInFlight) return syncInFlight;
    const s0 = get();
    if (!(s0.status === 'ready' && !s0.saving && !s0.autosavePending)) return Promise.resolve();
    const seq0 = s0.saveSeq;
    const run = (async () => {
      /** @type {boolean} */ let needBundle = true;
      /** @type {{syncRevision: any, lastCommandId: any}|null} */ let pendingSync = null;
      // 比べ終わるまで syncRevision は進めない（途中で失敗したとき、次の tick で同じ変更をもう一度確かめるため）。
      const commit = () => { if (pendingSync) { store.set(pendingSync, 'sync'); pendingSync = null; } };
      if (!fromVisibility) {
        const r = await api.getJson('/api/sync');
        if (get().saveSeq !== seq0) return;
        if (!r.ok) { store.set({ syncError: r }, 'sync-error'); return; }
        const sync = /** @type {any} */ (r.data);
        const cur = get();
        const first = cur.syncRevision === null;
        needBundle = first || sync.revision !== cur.syncRevision;
        const cmdId = sync.commandId ?? sync.command?.id ?? null;
        if (!first && cmdId !== cur.lastCommandId && sync.command) {
          const c = sync.command;
          if (c.action === 'refresh_assets') ui.emit('studio:assets-refresh', {});
          else ui.emit('studio:sync-command', { id: cmdId, action: c.action, name: c.name, slot: c.slot, target: c.target }); // 同じ id は1回だけ（上の条件）。反応するのは SCR-13/05 の表示中だけ（O-⑤-5）
        }
        pendingSync = { syncRevision: sync.revision, lastCommandId: cmdId };
      }
      if (!needBundle) {
        commit();
        if (get().syncError) store.set({ syncError: null }, 'sync-ok');
        resumeAutosave();
        return;
      }
      const b = await api.getJson('/api/project/bundle');
      if (get().saveSeq !== seq0) return;
      if (isCameraInvalid(b)) {
        commit();
        if (!get().cameraInvalid) setCameraInvalid(/** @type {ApiErr} */ (b));
        if (get().syncError) store.set({ syncError: null }, 'sync-ok');
        return;
      }
      if (!b.ok) { store.set({ syncError: b }, 'sync-error'); return; }
      commit();
      if (get().syncError) store.set({ syncError: null }, 'sync-ok');
      const data = /** @type {any} */ (b.data);
      const cur = get();
      if (cur.cameraInvalid) { // 外部でカメラのファイルが直された（v5 C5）
        if (!hasUnsavedOf(cur)) { await loadProject({ discardLocal: true }); }
        else { clearTimer(); store.set({ cameraRecovered: true, autosavePending: false }, 'camera-recovered'); }
        return;
      }
      if (data.revision === cur.revision) { resumeAutosave(); return; }
      if (!hasUnsavedOf(get())) {
        const ok = await loadProject({ discardLocal: true });
        if (ok) ui.toast('外部の変更を読み込みました', 'real');
      } else {
        clearTimer();
        store.set({ externalChange: true, autosavePending: false }, 'external-change');
      }
    })().catch((e) => { console.error(e); }).finally(() => { syncInFlight = null; });
    syncInFlight = run;
    return run;
  }

  /** 通信が回復したら、止めていた自動保存をもう一度予約する。 */
  function resumeAutosave() {
    const s = get();
    if (retryAutosave && s.dirty.combination && !s.externalChange && !s.autosavePending && !s.saving && s.status === 'ready') {
      retryAutosave = false;
      scheduleAutosave();
    }
  }

  /** @type {any} */ let interval = null;
  /** 1回だけ呼ぶ。 */
  function startExternalSync() {
    if (interval !== null) return;
    interval = si(() => { void tick(); }, SYNC_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void tick({ fromVisibility: true }); });
    }
  }

  return {
    loadProject, restoreHistory, undo, redo, editCombination, setCombinationSpeed, setCombinationSelected, setWorkspaceFields, setWorkspaceAsset, refreshCameraDirty, cameraOnlySaved, saveProject, reloadWithConfirm,
    startExternalSync, tick, autosave, scheduleAutosave, hasUnsaved: () => hasUnsavedOf(get()),
    store,
  };
}

/* ---------------- 画面につなぐ実体（ブラウザー用） ---------------- */

/** @param {{title: string, body: string, ok: string, cancel?: string, danger?: boolean}} o @returns {Promise<boolean>} */
function confirmDialog({ title, body, ok, cancel = 'キャンセル', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (/** @type {boolean} */ v) => { if (done) return; done = true; closeModal(); resolve(v); };
    openModal({
      title, body: [h('p', null, body)],
      footer: [
        h('button', { class: 'btn ghost', type: 'button', dataset: { role: 'confirm-cancel' }, onclick: () => finish(false) }, cancel),
        h('button', { class: `btn ${danger ? '' : 'primary'}`, type: 'button', dataset: { role: 'confirm-ok' }, onclick: () => finish(true) }, ok),
      ],
      onClose: () => { if (!done) { done = true; resolve(false); } },
    });
  });
}

/** @param {() => void} onReload */
function conflictDialog(onReload) {
  openModal({
    title: 'サーバー側が更新されています',
    body: [h('p', { dataset: { role: 'conflict-body' } }, '他の画面（現行の制作画面・カメラ画面）や MCP が先に保存しました。この画面の変更はまだ残っています。')],
    footer: [
      h('button', { class: 'btn ghost', type: 'button', dataset: { role: 'conflict-close' }, onclick: closeModal }, '閉じる'),
      h('button', { class: 'btn primary', type: 'button', dataset: { role: 'conflict-reload' }, onclick: () => { closeModal(); onReload(); } }, '再読込して変更を破棄'),
    ],
  });
}

const studioCameraHandle = () => window.BAICameraPage?.handle()?.host === 'studio' ? window.BAICameraPage.handle() : null;
const controller = createProjectController({
  ui: { toast: (m, k) => uiToast(m, /** @type {any} */ (k)), confirm: confirmDialog, conflict: conflictDialog, emit: busEmit },
  beforeBundleSave: () => {
    if (!studioCameraHandle()) return;
    const event = new CustomEvent('bai-studio-camera-before-save', { detail: { error: null } });
    window.dispatchEvent(event);
    if (event.detail.error) throw event.detail.error;
  },
  cameraDirty: () => !!studioCameraHandle()?.isDirty(),
  cameraSnapshot: () => {
    if (!studioCameraHandle()) return null;
    /** @type {any} */ let camera = null;
    /** @type {any} */ let workspace = null;
    window.dispatchEvent(new CustomEvent('bai-camera-bundle-snapshot', { detail: { resolve: (/** @type {any} */ value) => { camera = value; } } }));
    window.dispatchEvent(new CustomEvent('bai-camera-workspace-snapshot', { detail: { resolve: (/** @type {any} */ value) => { workspace = value; } } }));
    if (!camera || !workspace) throw Error('カメラと素材の状態を取得できません');
    return { camera, workspace };
  },
  afterBundleSave: async (camera) => {
    if (!studioCameraHandle()) return;
    await new Promise((resolve, reject) => window.dispatchEvent(new CustomEvent('bai-camera-bundle-saved', { detail: { camera, resolve, reject } })));
  },
});

export const loadProject = controller.loadProject;
export const restoreHistory = controller.restoreHistory;
export const undo = controller.undo;
export const redo = controller.redo;
export const editCombination = controller.editCombination;
export const setCombinationSpeed = controller.setCombinationSpeed;
export const setCombinationSelected = controller.setCombinationSelected;
export const setWorkspaceFields = controller.setWorkspaceFields;
export const setWorkspaceAsset = controller.setWorkspaceAsset;
export const refreshCameraDirty = controller.refreshCameraDirty;
export const cameraOnlySaved = controller.cameraOnlySaved;
export const saveProject = controller.saveProject;
export const reloadWithConfirm = controller.reloadWithConfirm;
export const startExternalSync = controller.startExternalSync;
export const hasUnsaved = controller.hasUnsaved;

/** 離脱の警告（設計 §2.2(d)-8）。画面内の移動（SPA）では警告しない。 */
export function installUnloadGuard() {
  window.addEventListener('beforeunload', (e) => { controller.refreshCameraDirty(); if (controller.hasUnsaved()) { e.preventDefault(); e.returnValue = ''; } });
}

/** カメラ保存データを初期状態に戻す（設計 §2.2(d)-2、B-3 の 2b）。確認の後に呼ぶ。 */
export async function resetCameraProject() {
  const ok = await confirmDialog({
    title: '初期状態から始める',
    body: `カメラの保存データを初期状態に戻します。今のファイルは退避コピー（${controller.store.get().cameraInvalid?.backup || 'なし'}）として残ります。よろしいですか？`,
    ok: '初期状態に戻す', cancel: 'キャンセル', danger: true,
  });
  if (!ok) return false;
  const r = await postJson('/api/camera/project/reset', { confirm: 'reset-camera-project' });
  if (!r.ok) { uiToast(r.message, 'err'); return false; }
  uiToast('カメラ保存データを初期状態に戻しました。', 'real');
  return controller.loadProject({ discardLocal: false });
}

export { messageFor };
