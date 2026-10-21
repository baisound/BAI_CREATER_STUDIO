// @ts-check
// WP05e：版を持たない既存APIの内容を保存直前に比べる。GET→POST間の隙は設計K12。
import { getJson, postJson } from '../api.js';

/** @param {any[]} items */
const copy = (items) => JSON.parse(JSON.stringify(items));
/** @param {any[]} a @param {any[]} b */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * タイムライン（550ms）と補正レイヤー（500ms）に共通の内容比較保存。
 * ネットワークと時計を差し替えられるので、競合・失敗・再予約を単体検証できる。
 * @param {{path:string, field:'clips'|'layers', delayMs:number, normalize:(v:any)=>any,
 *   get?:(path:string)=>Promise<any>, post?:(path:string,body:any)=>Promise<any>,
 *   schedule?:(fn:()=>void,ms:number)=>any, cancel?:(timer:any)=>void,
 *   clock?:()=>Date}} options
 */
export function createTimelineSync(options) {
  const { path, field, delayMs, normalize } = options;
  const get = options.get || getJson, post = options.post || postJson;
  const schedule = options.schedule || setTimeout, cancel = options.cancel || clearTimeout;
  const clock = options.clock || (() => new Date());
  /** @type {any[]} */ let items = [], base = [];
  let loaded = false, dirty = false, conflict = false, saving = false;
  let status = '保存データを読み込み中…';
  /** @type {any} */ let timer = null;
  /** @type {Promise<any>|null} */ let inFlight = null;
  /** @type {Set<()=>void>} */ const listeners = new Set();
  const normalizeItems = (/** @type {any} */ v) => Array.isArray(v) ? v.map(normalize) : [];
  const emit = () => { for (const fn of listeners) fn(); };
  const state = () => ({ items: copy(items), loaded, dirty, conflict, saving, status });
  function clearQueue() { if (timer !== null) { cancel(timer); timer = null; } }
  function queue() {
    clearQueue();
    if (!loaded || !dirty || conflict) return;
    timer = schedule(() => { timer = null; void save(); }, delayMs);
  }
  /** @param {any} r */
  const failure = (r) => r?.message || `HTTP ${r?.status || 0}`;

  /** @param {{discard?:boolean}} [opts] */
  async function load(opts = {}) {
    clearQueue();
    if (inFlight) await inFlight;
    if (dirty && !opts.discard) return { ok: false, message: '未保存の変更があります' };
    const r = await get(path);
    if (!r.ok) { status = `読み込み失敗：${failure(r)}`; emit(); return r; }
    items = normalizeItems(r.data?.[field]);
    base = copy(items);
    loaded = true; dirty = false; conflict = false;
    status = `${items.length}件を読み込みました`;
    emit();
    return { ok: true, items: copy(items) };
  }

  /** @param {any[]} next */
  function edit(next) {
    if (!loaded) return false;
    items = normalizeItems(next);
    dirty = !same(items, base);
    if (!conflict) status = dirty ? '未保存の変更があります' : '保存済み';
    queue(); emit();
    return true;
  }

  /** @param {{force?:boolean}} [opts] */
  async function save(opts = {}) {
    clearQueue();
    if (inFlight) {
      await inFlight;
      if (!dirty && !opts.force) return { ok: true, unchanged: true };
      return save(opts);
    }
    if (!loaded) return { ok: false, message: '読込前です' };
    if (conflict && !opts.force) return { ok: false, conflict: true };
    if (!dirty && !opts.force) return { ok: true, unchanged: true };
    const local = copy(items);
    const run = (async () => {
      saving = true; emit();
      try {
        if (!opts.force) {
          const r = await get(path);
          if (!r.ok) { status = `保存失敗：${failure(r)}`; emit(); return r; }
          if (!same(normalizeItems(r.data?.[field]), base)) {
            conflict = true;
            status = field === 'clips'
              ? 'サーバー側のタイムラインが更新されています（他の画面・MCP）。この画面の変更はまだ保存していません。'
              : 'サーバー側の補正レイヤーが更新されています（他の画面・MCP）。この画面の変更はまだ保存していません。';
            emit();
            return { ok: false, conflict: true };
          }
        }
        const r = await post(path, { schema: 1, [field]: local });
        if (!r.ok) { status = `保存失敗：${failure(r)}`; emit(); return r; }
        base = local; dirty = !same(items, base); conflict = false;
        status = dirty ? '未保存の変更があります' : `保存済み：${clock().toLocaleTimeString('ja-JP')}`;
        emit();
        if (dirty) queue(); // 保存中に増えた編集を次に送る
        return { ok: true };
      } finally { saving = false; emit(); }
    })();
    inFlight = run;
    try { return await run; } finally { if (inFlight === run) inFlight = null; }
  }

  /** 離れるとき、予約されていた保存を直ちに実行する。競合中は上書きしない。 */
  async function flushOnLeave() {
    const queued = timer !== null;
    clearQueue();
    if (inFlight) await inFlight;
    if (queued && dirty && !conflict) return save();
    return { ok: !dirty };
  }

  return {
    state, load, edit, save, overwrite: () => save({ force: true }), flushOnLeave,
    subscribe(fn) { listeners.add(fn); fn(); return () => listeners.delete(fn); },
    dispose() { clearQueue(); listeners.clear(); },
  };
}
