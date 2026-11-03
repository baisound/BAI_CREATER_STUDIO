// @ts-check
// 手動 IK ポーズ補助の状態と通信（P2 §2.8 WP-08a。O-⑧-2〜4）。DOM を使わない。
// solve・save・load は呼び出し側が渡す（api.js の ApiResult を返す関数）。テストは偽物を渡す。
import { TEMPLATE, clampFrame } from './pose-ik.fork.js';

/** @typedef {{schema: 1, frame: number, limbs: Record<string, {base: number[], target: number[], upper: number, lower: number, bend: number}>}} PoseInput */
/** @typedef {{ok: true, data: any}|{ok: false, message: string, serverMessage?: string|null}} Res */
/** @typedef {{loaded: boolean, data: PoseInput, result: any, active: string, busy: boolean, queued: boolean, status: string, statusKind: 'ok'|'warn'|'error', synced: string|null, conflict: boolean, saving: boolean}} PoseIkState */

export const STATUS_OK = 'IK計算済み（元モーション未変更）';
export const STATUS_CLAMPED = '目標が届かないため、到達可能な位置に補正しました';
export const STATUS_SAVED = '補正設定を保存しました。元素材は変更していません。';
export const STATUS_CONFLICT = '外部（旧画面・MCP）でIK設定が変わっています。どちらかを選んでください。';

/** キーを並べ替えた JSON 文字列（内容の比べに使う。O-⑧-4）。 @param {any} p @returns {string} */
export function canonicalPose(p) {
  const sort = (/** @type {any} */ v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    return v;
  };
  return JSON.stringify(sort(p));
}

/** GET /api/pose/last の応答から画面の初期値を作る（pose_ik_ui.js:21）。 @param {any} last @returns {PoseInput} */
export function initialPose(last) {
  const limbs = last && typeof last === 'object' ? last.limbs : null;
  if (limbs && typeof limbs === 'object' && !Array.isArray(limbs) && Object.keys(limbs).length) return structuredClone(last);
  return structuredClone(TEMPLATE);
}

const msgOf = (/** @type {any} */ r) => r.serverMessage || r.message;
const errText = (/** @type {any} */ e) => (e instanceof Error ? e.message : String(e));

/**
 * @param {{solve: (d: PoseInput) => Promise<Res>, save: (d: PoseInput) => Promise<Res>, load: () => Promise<Res>, onChange?: (s: PoseIkState) => void, kept?: {data: PoseInput, synced: string|null, active: string}|null}} o
 */
export function createPoseIkModel({ solve, save, load, onChange, kept = null }) {
  /** @type {PoseIkState} */
  const state = {
    loaded: false, data: structuredClone(TEMPLATE), result: null, active: 'rightArm', busy: false, queued: false,
    status: 'IK準備中…', statusKind: 'ok', synced: null, conflict: false, saving: false,
  };
  let disposed = false;
  /** @type {Promise<void>|null} */
  let running = null;
  const emit = () => { if (!disposed) onChange?.(state); };
  const say = (/** @type {string} */ text, /** @type {'ok'|'warn'|'error'} */ kind = 'ok') => { state.status = text; state.statusKind = kind; };

  /** 計算中に来た要求は捨てず、最後の1つだけを終わった直後に送る（O-⑧-3）。 */
  function solveNow() {
    if (disposed) return Promise.resolve();
    if (running) { state.queued = true; emit(); return running; }
    running = (async () => {
      state.busy = true;
      try {
        do {
          state.queued = false;
          emit();
          try {
            const r = await solve(structuredClone(state.data));
            if (disposed) return;
            if (!r.ok) { say(`IK計算失敗：${msgOf(r)}`, 'error'); continue; }
            state.result = r.data;
            if (state.queued) continue; // 次の計算で上書きされる
            const reachable = !!r.data?.limbs?.[state.active]?.reachable;
            say(reachable ? STATUS_OK : STATUS_CLAMPED, reachable ? 'ok' : 'warn');
          } catch (e) {
            if (disposed) return;
            say(`IK計算失敗：${errText(e)}`, 'error');
          }
        } while (state.queued && !disposed);
      } finally {
        state.busy = false;
        state.queued = false;
        running = null;
        emit();
      }
    })();
    return running;
  }

  async function writeNow() {
    const body = structuredClone(state.data);
    const r = await save(body);
    if (disposed) return;
    if (!r.ok) { say(`保存失敗：${msgOf(r)}`, 'error'); return; }
    state.synced = canonicalPose(body);
    state.conflict = false;
    say(STATUS_SAVED, 'ok');
  }

  return {
    getState: () => state,
    async init() {
      if (kept) {
        state.data = structuredClone(kept.data);
        state.synced = kept.synced;
        state.active = kept.active;
      } else {
        try {
          const r = await load();
          if (r.ok) { state.synced = canonicalPose(r.data); state.data = initialPose(r.data); }
        } catch { /* 旧と同じく TEMPLATE で続ける（pose_ik_ui.js:21 の catch） */ }
        if (disposed) return;
      }
      await solveNow();
      if (disposed) return;
      state.loaded = true;
      emit();
    },
    /** @param {string} name */
    setActive(name) { state.active = name; emit(); },
    /** @param {any} v */
    setFrame(v) { state.data.frame = clampFrame(v); emit(); },
    /** @param {string} name @param {number[]} xy */
    setTarget(name, xy) {
      if (!state.data.limbs[name]) return Promise.resolve();
      state.data.limbs[name].target = [xy[0], xy[1]];
      state.active = name;
      return solveNow();
    },
    reset() { state.data = structuredClone(TEMPLATE); return solveNow(); },
    /** 08c：AI の提案などを未保存のまま読み込む。 @param {PoseInput} pose @param {string} [message] */
    async setData(pose, message) {
      state.data = structuredClone(pose);
      await solveNow();
      if (disposed) return;
      if (message && state.statusKind !== 'error') say(message, 'ok');
      emit();
    },
    async save() {
      if (state.saving) return;
      state.saving = true; emit();
      try {
        if (state.synced !== null) {
          const latest = await load();
          if (disposed) return;
          if (!latest.ok) { say(`保存失敗：${msgOf(latest)}`, 'error'); return; }
          if (canonicalPose(latest.data) !== state.synced) { state.conflict = true; say(STATUS_CONFLICT, 'warn'); return; }
        }
        await writeNow();
      } catch (e) {
        if (!disposed) say(`保存失敗：${errText(e)}`, 'error');
      } finally { state.saving = false; emit(); }
    },
    async reloadDiscard() {
      try {
        const r = await load();
        if (disposed) return;
        if (!r.ok) { say(`再読込失敗：${msgOf(r)}`, 'error'); emit(); return; }
        state.synced = canonicalPose(r.data);
        state.data = initialPose(r.data);
        state.conflict = false;
      } catch (e) { if (!disposed) { say(`再読込失敗：${errText(e)}`, 'error'); emit(); } return; }
      await solveNow();
    },
    async overwrite() {
      if (state.saving) return;
      state.saving = true; emit();
      try { await writeNow(); } catch (e) { if (!disposed) say(`保存失敗：${errText(e)}`, 'error'); } finally { state.saving = false; emit(); }
    },
    dispose() { disposed = true; },
  };
}
