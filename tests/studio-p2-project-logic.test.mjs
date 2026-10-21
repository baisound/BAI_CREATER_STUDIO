// ② プロジェクトの読込・保存の制御（studio/js/features/project.js）の単体テスト（P2 設計 §2.2(g)、WP-01）。
// ブラウザー不要。偽の時計と偽のサーバーを createProjectController に渡し、世代番号・競合・順序の保証を確かめる（3-M3・3-M4・v5 C5）。
import test from 'node:test';
import '../camera_bundle_core.js';
import assert from 'node:assert/strict';
import { createStore } from '../studio/js/store.js';
import { initialProjectState } from '../studio/js/store.js';
import { makeError } from '../studio/js/api.js';
import { createProjectController, canon, describeStatus, canSave, summarize, AUTOSAVE_MS, DEFAULT_COMBINATION } from '../studio/js/features/project.js';

const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

/** 手で進める時計。setTimeout だけ使う。 */
function makeClock() {
  let t = 1_000_000;
  let seq = 0;
  /** @type {{id: number, at: number, fn: () => void}[]} */
  let timers = [];
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const id = ++seq; timers.push({ id, at: t + ms, fn }); return id; },
    clearTimeout: (id) => { timers = timers.filter((x) => x.id !== id); },
    pending: () => timers.length,
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        t = next.at;
        next.fn();
        await settle(3);
      }
      t = end;
      await settle(3);
    },
  };
}

const CAMERA = { schema: 1, fps: 30, duration: 300, keys: [{ frame: 0 }, { frame: 100 }] };
const camKeys = (n) => ({ ...CAMERA, keys: Array.from({ length: n }, (_, i) => ({ frame: i * 10 })) });
const comb = (n = 3, cursor = n - 1) => ({
  schema: 1, title: 'テスト', timeline: [{ name: 'a' }, { name: 'b' }], selected: 2, playbackSpeed: 1, updatedAt: '2026-10-20T00:00:00.000Z', cursor,
  history: Array.from({ length: n }, (_, i) => ({ label: `v${i}`, at: '2026-10-20T00:00:00.000Z', timeline: Array.from({ length: i + 1 }, (_, k) => ({ name: `n${k}` })), selected: 1, playbackSpeed: 1 })),
});

/** 本物のサーバーと同じ規則（版の比較・同期の番号）を持つ偽のサーバー。呼び出しを記録し、指定した要求を保留できる。 */
function makeServer({ combination = comb(), camera = CAMERA, workspace = null } = {}) {
  const srv = {
    comb: combination, camera, workspace, syncRev: 0, command: null, cameraBroken: false, offline: false, failBundle: false,
    /** @type {string[]} */ calls: [],
    /** @type {Map<string, {promise: Promise<void>, release: () => void}>} */ gates: new Map(),
    projectRev: () => 'P' + canon(srv.comb ?? {}),
    bundleRev: () => 'B' + canon({ combination: srv.comb, camera: srv.camera, workspace: srv.workspace }),
    /** 次の要求を保留する。戻り値の release() で再開。 */
    hold(key) {
      let release = () => {};
      const promise = new Promise((r) => { release = r; });
      srv.gates.set(key, { promise, release });
      return release;
    },
    count: (key) => srv.calls.filter((c) => c === key).length,
    /** 別の画面・MCP による保存。 */
    externalSave(c) { srv.comb = c; srv.syncRev++; },
  };
  const invalid = () => makeError('unprocessable', 422, { error: 'カメラ保存データ（camera_project.json）を読めません。退避コピー：camera_project.invalid-aaaaaaaa-1.json。手で直す場合：…', error_code: 'camera_project_invalid', backup: 'camera_project.invalid-aaaaaaaa-1.json' });
  async function handle(method, path, body, opts) {
    const key = `${method} ${path}`;
    srv.calls.push(key);
    if (srv.offline) return makeError('offline');
    const gate = srv.gates.get(key);
    if (gate) { srv.gates.delete(key); await gate.promise; }
    if (method === 'GET' && path === '/api/sync') return { ok: true, status: 200, data: { revision: srv.syncRev, commandId: srv.command ? srv.command.id : 0, command: srv.command } };
    if (method === 'GET' && path === '/api/project?envelope=1') return { ok: true, status: 200, data: { project: srv.comb ?? {}, revision: srv.projectRev() } };
    if (method === 'GET' && path === '/api/project/bundle') {
      if (srv.failBundle) return makeError('server', 500, { error: 'x' });
      if (srv.cameraBroken) return invalid();
      return { ok: true, status: 200, data: { schema: 1, combination: srv.comb, camera: srv.camera, workspace: srv.workspace, complete: srv.comb !== null, revision: srv.bundleRev() } };
    }
    if (method === 'POST' && path === '/api/project') {
      if (opts && opts.ifMatch && opts.ifMatch !== srv.projectRev()) return makeError('conflict', 409, { error: 'project changed on server' });
      srv.comb = body; srv.syncRev++;
      return { ok: true, status: 200, data: { ok: true, revision: srv.projectRev() } };
    }
    if (method === 'POST' && path === '/api/project/bundle') {
      if (!opts || !opts.ifMatch) return makeError('revision_required', 428, { error: 'bundle revision required' });
      if (srv.cameraBroken) return invalid();
      if (opts.ifMatch !== srv.bundleRev()) return makeError('conflict', 409, { error: 'bundle changed on server' });
      srv.comb = body.combination; srv.camera = body.camera; srv.workspace = body.workspace ?? null; srv.syncRev++;
      return { ok: true, status: 200, data: { ok: true, schema: 1, revision: srv.bundleRev() } };
    }
    throw new Error(`unexpected ${key}`);
  }
  const api = {
    getJson: (path, opts) => handle('GET', path, null, opts),
    postJson: (path, body, opts) => handle('POST', path, body, opts),
  };
  return { srv, api };
}

function setup(seed, options = {}) {
  const { srv, api } = makeServer(seed);
  const clock = makeClock();
  const store = createStore(initialProjectState());
  const log = { toasts: [], conflicts: 0, confirms: [], emits: [], conflictReload: null, confirmAnswer: true };
  const ctrl = createProjectController({
    api, store, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: () => 0,
    ...options,
    ui: {
      toast: (m, k) => log.toasts.push([m, k]),
      confirm: async (o) => { log.confirms.push(o); return log.confirmAnswer; },
      conflict: (reload) => { log.conflicts++; log.conflictReload = reload; },
      emit: (n, d) => log.emits.push([n, d]),
    },
  });
  return { srv, clock, store, log, ctrl };
}

test('shared bundle component failure stops explicit save and keeps autosave available', async () => {
  const { srv, ctrl, store, clock } = setup(undefined, { loadBundleCore: async () => { throw Error('HTTP 404'); } });
  await ctrl.loadProject();
  ctrl.setWorkspaceFields({ stage: { asset: 'stage-a' } });
  assert.equal(await ctrl.saveProject(), false);
  assert.equal(store.get().bundleCoreError, 'HTTP 404');
  assert.equal(canSave(store.get()), false);
  assert.equal(describeStatus(store.get()).key, 'bundle-core-error');
  assert.equal(srv.count('POST /api/project/bundle'), 0);
  ctrl.editCombination([{ name: 'x' }]);
  await clock.advance(AUTOSAVE_MS);
  assert.equal(srv.count('POST /api/project'), 1);
});

test('camera-only save adopts the new bundle revision without losing workspace edits', async () => {
  const { srv, ctrl, store } = setup();
  await ctrl.loadProject();
  ctrl.setWorkspaceFields({ stage: { asset: 'stage-a' } });
  const oldRevision = store.get().revision;
  srv.camera = camKeys(4);
  assert.equal(await ctrl.cameraOnlySaved(), true);
  assert.notEqual(store.get().revision, oldRevision);
  assert.deepEqual(store.get().base.camera, srv.camera);
  assert.equal(store.get().dirty.workspace, true);
  assert.equal(store.get().externalChange, false);
  assert.equal(await ctrl.saveProject(), true);
  assert.equal(srv.count('POST /api/project/bundle'), 1);
});

test('camera-only save invalidates an older sync tick before it can reload the live workspace', async () => {
  const { srv, ctrl, store, log } = setup({ workspace: { frame: 0, asset: '', clip: null } });
  await ctrl.loadProject();
  const release = srv.hold('GET /api/project/bundle');
  const pendingTick = ctrl.tick();
  await settle();
  srv.camera = camKeys(4);
  assert.equal(await ctrl.cameraOnlySaved(), true);
  ctrl.setWorkspaceFields({ frame: 37 }, { source: 'host' });
  release();
  await pendingTick;
  assert.equal(store.get().bundle.workspace.frame, 37);
  assert.equal(store.get().externalChange, false);
  assert.equal(log.emits.filter(([name]) => name === 'studio:project-loaded').length, 1);
});

test('load: reads bundle and envelope together; state is ready and clean', async () => {
  const { srv, store, ctrl, log } = setup();
  assert.equal(await ctrl.loadProject(), true);
  const s = store.get();
  assert.equal(s.status, 'ready');
  assert.equal(s.revision, srv.bundleRev());
  assert.equal(s.projectRevision, srv.projectRev());
  assert.deepEqual(s.dirty, { combination: false, workspace: false, camera: false });
  assert.equal(s.combinationMissing, false);
  assert.ok(log.emits.some(([n]) => n === 'studio:project-loaded'));
  const m = summarize({ ...s.bundle, combinationMissing: s.combinationMissing });
  assert.match(m.combination, /2件・履歴3件（3番目）/);
  assert.match(m.camera, /2キー・300F・30fps/);
});

test('load: a missing combination is only a default inside the store', async () => {
  const { srv, store, ctrl } = setup({ combination: null });
  srv.comb = null;
  await ctrl.loadProject();
  const s = store.get();
  assert.equal(s.combinationMissing, true);
  assert.deepEqual(s.bundle.combination, DEFAULT_COMBINATION);
  assert.equal(srv.count('POST /api/project'), 0);
  assert.equal(canSave(s), false, 'nothing to save');
  assert.equal(describeStatus(s).text, 'コンビネーション未保存');
});

test('load: a change between the two GETs is retried once', async () => {
  const { srv, store, ctrl } = setup();
  const rel = srv.hold('GET /api/project?envelope=1');
  const p = ctrl.loadProject();
  await settle();
  srv.comb = { ...srv.comb, title: '読込中に変更' }; // bundle は古い内容を読んだ後
  rel();
  assert.equal(await p, true, 'the second round matches');
  assert.equal(srv.count('GET /api/project/bundle'), 2);
  assert.equal(store.get().bundle.combination.title, '読込中に変更');
});

test('undo/restoreHistory: changes only timeline, cursor, playbackSpeed; autosave after 450ms with the envelope revision', async () => {
  const { srv, clock, store, ctrl, log } = setup();
  await ctrl.loadProject();
  const before = store.get();
  const rev0 = before.projectRevision;
  ctrl.undo();
  let s = store.get();
  assert.equal(s.bundle.combination.cursor, 1);
  assert.equal(s.bundle.combination.selected, 2, 'selected unchanged');
  assert.equal(s.bundle.combination.history.length, 3, 'history unchanged');
  assert.equal(canon(s.bundle.combination.timeline), canon(before.bundle.combination.history[1].timeline));
  assert.equal(s.autosavePending, true);
  assert.equal(describeStatus(s).text, '自動保存待ち…');
  await clock.advance(AUTOSAVE_MS - 1);
  assert.equal(srv.count('POST /api/project'), 0, 'not before 450ms');
  await clock.advance(2);
  assert.equal(srv.count('POST /api/project'), 1);
  s = store.get();
  assert.equal(srv.comb.cursor, 1);
  assert.equal(srv.comb.selected, 2);
  assert.notEqual(s.projectRevision, rev0);
  assert.equal(s.projectRevision, srv.projectRev());
  assert.equal(s.revision, srv.bundleRev(), 'bundle revision is taken again after the autosave');
  assert.equal(s.dirty.combination, false);
  assert.equal(s.saving, false);
  assert.equal(describeStatus(s).text, '保存済み');
  assert.ok(log.emits.some(([n, d]) => n === 'studio:project-saved' && d.kind === 'autosave'));
  assert.equal(log.toasts.length, 0, 'autosave is silent');
  // 範囲外・status!==ready は何もしない
  ctrl.restoreHistory(99); ctrl.restoreHistory(-1);
  assert.equal(store.get().bundle.combination.cursor, 1);
});

test('explicit save flushes the pending autosave: one bundle POST, no project POST', async () => {
  const { srv, clock, store, ctrl, log } = setup({ workspace: { frame: 0, asset: 'char.glb', clip: null } });
  await ctrl.loadProject();
  ctrl.undo();
  assert.equal(await ctrl.saveProject(), true);
  await clock.advance(5000);
  assert.equal(srv.count('POST /api/project/bundle'), 1);
  assert.equal(srv.count('POST /api/project'), 0);
  assert.deepEqual(srv.workspace, { frame: 0, asset: 'char.glb', clip: null }, 'workspace is sent along');
  assert.equal(srv.comb.cursor, 1);
  const s = store.get();
  assert.equal(s.revision, srv.bundleRev());
  assert.equal(s.projectRevision, srv.projectRev());
  assert.equal(s.dirty.combination, false);
  assert.ok(log.toasts.some(([m, k]) => /保存しました/.test(m) && k === 'real'));
  assert.equal(clock.pending(), 0);
});

test('save: nothing to save -> toast only; missing combination asks first', async () => {
  const a = setup();
  await a.ctrl.loadProject();
  assert.equal(await a.ctrl.saveProject(), false);
  assert.ok(a.log.toasts.some(([m]) => m === '変更はありません'));
  assert.equal(a.srv.count('POST /api/project/bundle'), 0);

  const b = setup({ combination: null });
  b.srv.comb = null;
  await b.ctrl.loadProject();
  // workspace を変えると未保存になる（④ の経路）
  b.ctrl.setWorkspaceFields({ asset: 'x.glb' });
  b.log.confirmAnswer = false;
  assert.equal(await b.ctrl.saveProject(), false);
  assert.equal(b.log.confirms.length, 1);
  assert.match(b.log.confirms[0].body, /空のコンビネーションも一緒に作られます/);
  assert.equal(b.srv.count('POST /api/project/bundle'), 0);
  b.log.confirmAnswer = true;
  assert.equal(await b.ctrl.saveProject(), true);
  assert.deepEqual(b.srv.comb.timeline, [], 'empty combination is created');
  assert.equal(b.srv.workspace.asset, 'x.glb');
  assert.equal(b.store.get().combinationMissing, false);
});

test('workspace fields: asset change clears clip, frame alone is not dirty, stage is kept', async () => {
  const { store, ctrl } = setup({ workspace: { frame: 5, asset: 'a.glb', clip: 2 } });
  await ctrl.loadProject();
  ctrl.setWorkspaceFields({ frame: 9 });
  assert.equal(store.get().dirty.workspace, false);
  assert.equal(store.get().bundle.workspace.frame, 9);
  ctrl.setWorkspaceFields({ asset: 'b.glb' });
  let s = store.get();
  assert.deepEqual(s.bundle.workspace, { frame: 9, asset: 'b.glb', clip: null });
  assert.equal(s.dirty.workspace, true);
  ctrl.setWorkspaceFields({ asset: 'c.glb', clip: 1 });
  assert.equal(store.get().bundle.workspace.clip, 1);
  ctrl.setWorkspaceFields({ stage: { asset: 'mmd:A:s', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 } });
  assert.ok(store.get().bundle.workspace.stage);
  assert.equal(store.get().bundle.workspace.asset, 'c.glb', 'other fields are kept');
});

test('character placement is a meaningful workspace edit and preserves other fields', async () => {
  const { store, ctrl } = setup({ workspace: { frame: 5, asset: 'a.glb', clip: 2 } });
  await ctrl.loadProject();
  ctrl.setWorkspaceFields({ character: { position: [1, 2, 3], rotation: [0, 90, 0], scale: 1.5 } });
  const s = store.get();
  assert.equal(s.dirty.workspace, true);
  assert.deepEqual(s.bundle.workspace.character, { position: [1, 2, 3], rotation: [0, 90, 0], scale: 1.5 });
  assert.deepEqual({ asset: s.bundle.workspace.asset, clip: s.bundle.workspace.clip, frame: s.bundle.workspace.frame },
    { asset: 'a.glb', clip: 2, frame: 5 });
});

test('3-M3 save sequencing (1): an autosave response that arrives after a reload is discarded', async () => {
  const { srv, clock, store, ctrl, log } = setup();
  await ctrl.loadProject();
  ctrl.undo();
  const rel = srv.hold('POST /api/project');
  await clock.advance(AUTOSAVE_MS + 1);
  assert.equal(srv.count('POST /api/project'), 1);
  assert.equal(store.get().saving, true);
  srv.comb = { ...srv.comb, title: '別の画面の保存' }; // 保存の途中でサーバーが変わった
  srv.syncRev++;
  assert.equal(await ctrl.loadProject({ discardLocal: true }), true);
  rel();
  await settle();
  const s = store.get();
  assert.equal(s.bundle.combination.title, '別の画面の保存', 'the reload wins');
  assert.equal(s.dirty.combination, false);
  assert.equal(s.saving, false);
  assert.equal(s.projectRevision, srv.projectRev());
  assert.equal(log.conflicts, 0, 'a stale 409 is not shown');
  assert.equal(log.toasts.length, 0);
});

test('3-M3 save sequencing (2): autosave waits for a running tick and sends after it', async () => {
  const { srv, clock, store, ctrl } = setup();
  await ctrl.loadProject();
  const rel = srv.hold('GET /api/sync');
  const tickP = ctrl.tick();
  await settle();
  ctrl.undo();
  await clock.advance(AUTOSAVE_MS * 3);
  assert.equal(srv.count('POST /api/project'), 0, 'held while the tick is running');
  rel();
  await tickP;
  await settle();
  await clock.advance(10);
  assert.equal(srv.count('POST /api/project'), 1, 'sent after the tick');
  assert.equal(store.get().dirty.combination, false);
});

test('3-M3 save sequencing (3): while the post-save GET is held, tick does nothing', async () => {
  const { srv, store, ctrl } = setup();
  await ctrl.loadProject();
  ctrl.undo();
  const rel = srv.hold('GET /api/project?envelope=1');
  const saveP = ctrl.saveProject();
  await settle();
  assert.equal(store.get().saving, true, 'still saving until the GET returns');
  const syncBefore = srv.count('GET /api/sync');
  await ctrl.tick();
  assert.equal(srv.count('GET /api/sync'), syncBefore, 'tick did not even ask');
  rel();
  await saveP;
  assert.equal(store.get().saving, false);
  assert.equal(store.get().externalChange, false);
  await ctrl.tick();
  assert.equal(store.get().externalChange, false, 'own save is not an external change');
  assert.equal(store.get().projectRevision, srv.projectRev());
});

test('3-M3 save sequencing (4): an explicit save while an autosave and a tick are both waiting is not stuck', async () => {
  // 自動保存が tick の終わりを待っている間に［保存］を押すと、自動保存が世代番号だけを進めて何もせずに戻り、
  // 統合保存が「別の読込・保存が始まった」と誤って判断して saving:true のまま止まっていた（レビューで修正）。
  const { srv, clock, store, ctrl } = setup();
  await ctrl.loadProject();
  const rel = srv.hold('GET /api/sync');
  const tickP = ctrl.tick();
  await settle();
  ctrl.undo();
  await clock.advance(AUTOSAVE_MS + 1); // 自動保存は tick を待つ
  const saveP = ctrl.saveProject();     // 統合保存も tick を待つ
  await settle();
  rel();
  await tickP;
  assert.equal(await saveP, true, 'the explicit save is sent');
  await clock.advance(AUTOSAVE_MS * 2);
  const s = store.get();
  assert.equal(s.saving, false);
  assert.equal(s.autosavePending, false);
  assert.equal(s.dirty.combination, false);
  assert.equal(srv.count('POST /api/project/bundle'), 1);
  assert.equal(srv.count('POST /api/project'), 0);
  assert.equal(srv.comb.cursor, 1);
});

test('own autosave/save are never reported as external changes over many ticks', async () => {
  const { srv, clock, store, ctrl, log } = setup();
  await ctrl.loadProject();
  await ctrl.tick(); // 初回
  ctrl.undo();
  await clock.advance(AUTOSAVE_MS + 5);
  for (let i = 0; i < 4; i++) await ctrl.tick();
  assert.equal(store.get().externalChange, false);
  assert.ok(!log.toasts.some(([m]) => /外部の変更/.test(m)));
  ctrl.undo();
  await ctrl.saveProject();
  for (let i = 0; i < 4; i++) await ctrl.tick();
  assert.equal(store.get().externalChange, false);
  assert.ok(!log.toasts.some(([m]) => /外部の変更/.test(m)));
  assert.equal(srv.count('POST /api/project/bundle'), 1);
});

test('autosave 409 keeps local edits and offers reload; reload discards them', async () => {
  const { srv, clock, store, ctrl, log } = setup();
  await ctrl.loadProject();
  srv.externalSave({ ...comb(), title: '先に保存された', timeline: [{ name: 'x' }, { name: 'y' }, { name: 'z' }] });
  ctrl.undo();
  await clock.advance(AUTOSAVE_MS + 5);
  assert.equal(log.conflicts, 1);
  let s = store.get();
  assert.equal(s.dirty.combination, true, 'local edit kept');
  assert.equal(s.autosavePending, false, 'autosave stopped');
  assert.equal(srv.comb.title, '先に保存された', 'the other save is untouched');
  assert.equal(describeStatus(s).key, 'dirty');
  log.conflictReload();
  await settle();
  s = store.get();
  assert.equal(s.bundle.combination.title, '先に保存された');
  assert.equal(s.dirty.combination, false);
});

test('bundle 409 keeps local edits', async () => {
  const { srv, store, ctrl, log } = setup();
  await ctrl.loadProject();
  ctrl.undo();
  srv.camera = camKeys(5); srv.syncRev++; // 外部がカメラを保存した
  assert.equal(await ctrl.saveProject(), false);
  assert.equal(log.conflicts, 1);
  assert.equal(srv.camera.keys.length, 5, 'server camera is unchanged by us');
  assert.equal(store.get().dirty.combination, true);
  assert.equal(store.get().saving, false);
});

test('offline autosave keeps the edit and is retried when a tick succeeds again', async () => {
  const { srv, clock, store, ctrl, log } = setup();
  await ctrl.loadProject();
  ctrl.undo();
  srv.offline = true;
  await clock.advance(AUTOSAVE_MS + 5);
  assert.ok(log.toasts.some(([m]) => /未接続：自動保存できませんでした/.test(m)));
  assert.equal(store.get().dirty.combination, true);
  assert.equal(store.get().autosavePending, false);
  srv.offline = false;
  await ctrl.tick();
  await ctrl.tick();
  await clock.advance(AUTOSAVE_MS + 5);
  assert.equal(srv.comb.cursor, 1, 'saved after recovery');
  assert.equal(store.get().dirty.combination, false);
});

test('an edit made while an autosave is in flight is not lost', async () => {
  const { srv, clock, store, ctrl } = setup();
  await ctrl.loadProject();
  ctrl.undo(); // cursor 1
  const rel = srv.hold('POST /api/project');
  await clock.advance(AUTOSAVE_MS + 5);
  ctrl.undo(); // cursor 0 を通信中に
  rel();
  await settle();
  await clock.advance(AUTOSAVE_MS + 5);
  await settle();
  assert.equal(srv.comb.cursor, 0, 'second edit saved too');
  assert.equal(srv.count('POST /api/project'), 2);
  assert.equal(store.get().dirty.combination, false);
  assert.equal(store.get().bundle.combination.cursor, 0);
});

test('external change: clean -> reloaded with a toast; dirty -> banner only, nothing overwritten', async () => {
  const a = setup();
  await a.ctrl.loadProject();
  await a.ctrl.tick(); // 初回
  a.srv.externalSave({ ...comb(), timeline: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] });
  await a.ctrl.tick();
  assert.equal(a.store.get().bundle.combination.timeline.length, 3);
  assert.ok(a.log.toasts.some(([m, k]) => m === '外部の変更を読み込みました' && k === 'real'));

  const b = setup();
  await b.ctrl.loadProject();
  await b.ctrl.tick();
  b.ctrl.setWorkspaceFields({ asset: 'mine.glb' }); // 未保存（自動保存の予約は無い）
  b.srv.externalSave({ ...comb(), title: '外部' });
  await b.ctrl.tick();
  const s = b.store.get();
  assert.equal(s.externalChange, true);
  assert.equal(s.bundle.workspace.asset, 'mine.glb', 'local edit kept');
  assert.equal(s.bundle.combination.title, 'テスト', 'not overwritten');
  assert.equal(describeStatus(s).key, 'external');
  assert.equal(await b.ctrl.saveProject(), false, 'saving now would be a 409');
  assert.equal(b.log.conflicts, 1);
});

test('v5 C5: invalid camera on load keeps the combination usable; autosave skips the bundle GET; save is blocked', async () => {
  const { srv, clock, store, ctrl, log } = setup();
  srv.cameraBroken = true;
  assert.equal(await ctrl.loadProject(), true);
  let s = store.get();
  assert.equal(s.status, 'ready');
  assert.ok(s.cameraInvalid);
  assert.equal(s.cameraInvalid.backup, 'camera_project.invalid-aaaaaaaa-1.json');
  assert.match(describeStatus(s).detail, /camera_project\.invalid-/);
  assert.equal(describeStatus(s).text, 'カメラ保存データを読めません');
  assert.equal(s.revision, null);
  assert.equal(canSave(s), false);
  ctrl.undo();
  assert.equal(canSave(store.get()), false, 'save stays disabled even with a dirty combination');
  assert.equal(await ctrl.saveProject(), false);
  assert.equal(srv.count('POST /api/project/bundle'), 0);
  const bundleGets = srv.count('GET /api/project/bundle');
  await clock.advance(AUTOSAVE_MS + 5);
  assert.equal(srv.count('POST /api/project'), 1, 'combination autosave still works');
  assert.equal(srv.count('GET /api/project/bundle'), bundleGets, 'no bundle GET after the autosave (it would be a 422)');
  assert.equal(store.get().saving, false);
  ctrl.setWorkspaceFields({ asset: 'x.glb' });
  assert.ok(log.toasts.some(([m]) => /カメラ保存データを読めないため、作業中の素材は変えられません/.test(m)));
  assert.equal(store.get().bundle.workspace, null);
});

test('v5 C5: camera fixed outside -> clean reload clears the state; dirty keeps it and shows the banner', async () => {
  const a = setup();
  a.srv.cameraBroken = true;
  await a.ctrl.loadProject();
  await a.ctrl.tick(); // 初回（まだ壊れている）
  assert.ok(a.store.get().cameraInvalid);
  a.srv.cameraBroken = false; a.srv.syncRev++;
  await a.ctrl.tick();
  assert.equal(a.store.get().cameraInvalid, null);
  assert.equal(a.store.get().revision, a.srv.bundleRev());

  const b = setup();
  b.srv.cameraBroken = true;
  await b.ctrl.loadProject();
  await b.ctrl.tick();
  b.ctrl.undo();
  b.srv.offline = true; // 自動保存が失敗して、未保存の変更が残る
  await b.clock.advance(AUTOSAVE_MS + 5);
  assert.equal(b.store.get().dirty.combination, true);
  b.srv.offline = false;
  b.srv.cameraBroken = false; b.srv.syncRev++;
  await b.ctrl.tick();
  const s = b.store.get();
  assert.ok(s.cameraInvalid, 'kept');
  assert.equal(s.cameraRecovered, true);
  assert.equal(s.dirty.combination, true);
  assert.equal(describeStatus(s).key, 'camera-recovered');
});

test('camera broken after load is reported as camera-invalid, not offline', async () => {
  const { srv, store, ctrl } = setup();
  await ctrl.loadProject();
  await ctrl.tick();
  srv.cameraBroken = true;
  srv.externalSave({ ...comb(), title: '外部' });
  await ctrl.tick();
  const s = store.get();
  assert.ok(s.cameraInvalid);
  assert.equal(s.syncError, null);
  assert.equal(describeStatus(s).text, 'カメラ保存データを読めません');
  assert.equal(canSave(s), false);
});

test('server error during sync keeps the page usable and the change is found on the next good tick (3-M4a)', async () => {
  const { srv, store, ctrl } = setup();
  await ctrl.loadProject();
  await ctrl.tick();
  srv.failBundle = true;
  srv.externalSave({ ...comb(), title: '外部' });
  await ctrl.tick();
  let s = store.get();
  assert.equal(s.status, 'ready');
  assert.match(describeStatus(s).text, /サーバーでエラーが起きました（HTTP 500）/);
  ctrl.undo(); // まだ使える
  assert.equal(store.get().bundle.combination.cursor, 1);
  srv.failBundle = false;
  store.set({ autosavePending: false, dirty: { combination: false, workspace: false, camera: false } }, 'test');
  await ctrl.tick();
  s = store.get();
  assert.equal(s.syncError, null);
  assert.equal(s.bundle.combination.title, '外部', 'the external change was not missed');
  assert.equal(describeStatus(s).text, '保存済み');
});

test('invalid camera: the combination is not shown as unsaved', async () => {
  const { srv, store, ctrl } = setup();
  srv.cameraBroken = true;
  await ctrl.loadProject();
  const s = store.get();
  const m = summarize({ ...s.bundle, combinationMissing: s.combinationMissing });
  assert.equal(m.title, 'テスト');
  assert.equal(m.integrated, '保存済み');
  assert.match(m.camera, /読めません/);
});

test('describeStatus covers every state in the design list', () => {
  const base = initialProjectState();
  const t = (patch) => describeStatus({ ...base, ...patch }).text;
  assert.equal(t({}), '未読込');
  assert.equal(t({ status: 'loading' }), '読込中…');
  assert.equal(t({ status: 'ready' }), '保存済み');
  assert.equal(t({ status: 'ready', autosavePending: true }), '自動保存待ち…');
  assert.equal(t({ status: 'ready', saving: true }), '保存中…');
  assert.equal(t({ status: 'ready', dirty: { combination: false, workspace: true, camera: false } }), '未保存の変更があります（［保存］で保存）');
  assert.equal(t({ status: 'error', error: makeError('offline') }), '未接続');
  assert.match(t({ status: 'ready', externalChange: true }), /^サーバー側が更新されました/);
  assert.equal(t({ status: 'ready', cameraInvalid: { backup: null } }), 'カメラ保存データを読めません');
  assert.match(t({ status: 'ready', syncError: makeError('server', 500, null) }), /サーバーでエラーが起きました（HTTP 500）/);
});

test('05b: external commands other than refresh_assets are emitted once per id, and not for the first tick', async () => {
  const { srv, store, ctrl, log } = setup();
  srv.command = { id: 7, action: 'preview_vmd', name: 'old.vmd', slot: 'A' }; // 読込前からあった古い指示は実行しない
  await ctrl.loadProject();
  await ctrl.tick(); // 初回
  const cmds = () => log.emits.filter(([n]) => n === 'studio:sync-command');
  assert.equal(cmds().length, 0, 'first tick does not replay an old command');
  srv.command = { id: 8, action: 'preview_vmd', name: 'a.vmd', slot: 'B' };
  await ctrl.tick();
  await ctrl.tick();
  assert.deepEqual(cmds().map(([, d]) => d), [{ id: 8, action: 'preview_vmd', name: 'a.vmd', slot: 'B', target: undefined }]);
  srv.command = { id: 9, action: 'refresh_assets' };
  await ctrl.tick();
  assert.equal(cmds().length, 1, 'refresh_assets keeps its own event');
  assert.equal(log.emits.filter(([n]) => n === 'studio:assets-refresh').length, 1);
  srv.command = { id: 10, action: 'integrated_preview', name: 'x.glb' };
  await ctrl.tick();
  assert.equal(cmds().length, 2);
  assert.equal(store.get().lastCommandId, 10);
});
