// ⑤ コンビネーションの編集（project.js の editCombination・setCombinationSpeed・setCombinationSelected）とお気に入りの通信
// （features/favorites.js）の単体テスト（P2 設計 §2.5(g)、WP-05c）。ブラウザー不要。偽の時計と偽のサーバーで、旧 record の規則を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, initialProjectState } from '../studio/js/store.js';
import { makeError } from '../studio/js/api.js';
import { createProjectController, canon, AUTOSAVE_MS } from '../studio/js/features/project.js';
import { createFavoritesClient, parseTags, filterFavorites, normalizeFavorites } from '../studio/js/features/favorites.js';

const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

function makeClock() {
  let t = Date.parse('2026-10-20T00:00:00.000Z');
  let seq = 0;
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

const CAMERA = { schema: 1, fps: 30, duration: 300, keys: [{ frame: 0 }] };
const at = '2026-10-20T00:00:00.000Z';
const names = (...n) => n.map((name) => ({ name }));
const entry = (label, timeline, selected = 1, playbackSpeed = 1) => ({ label, at, timeline, selected, playbackSpeed });
const blank = () => ({ schema: 1, title: 'T', timeline: [], history: [], cursor: -1, selected: 0, playbackSpeed: 1, updatedAt: '' });

function makeServer(comb) {
  const srv = {
    comb, posts: [],
    projectRev: () => 'P' + canon(srv.comb ?? {}),
    bundleRev: () => 'B' + canon({ combination: srv.comb, camera: CAMERA, workspace: null }),
  };
  const api = {
    async getJson(path) {
      if (path === '/api/project?envelope=1') return { ok: true, status: 200, data: { project: srv.comb ?? {}, revision: srv.projectRev() } };
      if (path === '/api/project/bundle') return { ok: true, status: 200, data: { schema: 1, combination: srv.comb, camera: CAMERA, workspace: null, complete: true, revision: srv.bundleRev() } };
      if (path === '/api/sync') return { ok: true, status: 200, data: { revision: 0, commandId: 0, command: null } };
      throw new Error(`unexpected GET ${path}`);
    },
    async postJson(path, body, opts) {
      if (path !== '/api/project') throw new Error(`unexpected POST ${path}`);
      if (opts && opts.ifMatch && opts.ifMatch !== srv.projectRev()) return makeError('conflict', 409, { error: 'changed' });
      srv.posts.push(body);
      srv.comb = body;
      return { ok: true, status: 200, data: { ok: true, revision: srv.projectRev() } };
    },
  };
  return { srv, api };
}

async function setup(comb = blank()) {
  const { srv, api } = makeServer(comb);
  const clock = makeClock();
  const store = createStore(initialProjectState());
  const ctrl = createProjectController({ api, store, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: () => 0, ui: {} });
  await ctrl.loadProject();
  return { srv, clock, store, ctrl };
}
const combOf = (store) => store.get().bundle.combination;

test('first edit pushes the initial state, then the edit (index.html:374・383)', async () => {
  const { store, ctrl, clock, srv } = await setup();
  assert.equal(ctrl.editCombination(names('a'), { label: '追加：a' }), true);
  const c = combOf(store);
  assert.deepEqual(c.timeline, names('a'));
  assert.deepEqual(c.history.map((x) => x.label), ['初期状態', '追加：a']);
  assert.deepEqual(c.history[0].timeline, []);
  assert.deepEqual(c.history[1].timeline, names('a'));
  assert.equal(c.cursor, 1);
  assert.equal(c.history[1].selected, 1, 'selected が未選択(0)なら 1');
  assert.equal(c.history[1].playbackSpeed, 1);
  assert.equal(c.history[1].at, '2026-10-20T00:00:00.000Z');
  assert.equal(store.get().dirty.combination, true);
  assert.equal(store.get().autosavePending, true);
  assert.equal(srv.posts.length, 0);
  await clock.advance(AUTOSAVE_MS - 1);
  assert.equal(srv.posts.length, 0, '450ms 待つ');
  await clock.advance(2);
  assert.equal(srv.posts.length, 1);
  assert.deepEqual(srv.posts[0].timeline, names('a'));
  assert.equal(srv.posts[0].history.length, 2);
  assert.equal(store.get().dirty.combination, false);
});

test('an edit that changes nothing does not touch history or autosave', async () => {
  const { store, ctrl, clock, srv } = await setup();
  assert.equal(ctrl.editCombination([]), false, '履歴が空で並びも同じなら「初期状態」も作らない');
  assert.deepEqual(combOf(store).history, []);
  ctrl.editCombination(names('a'));
  await clock.advance(AUTOSAVE_MS + 10);
  assert.equal(srv.posts.length, 1);
  assert.equal(ctrl.editCombination(names('a')), false);
  assert.equal(store.get().dirty.combination, false);
  assert.equal(store.get().autosavePending, false);
  assert.equal(clock.pending(), 0);
  await clock.advance(AUTOSAVE_MS * 3);
  assert.equal(srv.posts.length, 1);
  assert.equal(combOf(store).history.length, 2);
});

test('same as the latest history entry but different from the shown list: fix the list only', async () => {
  const comb = { ...blank(), timeline: names('x'), history: [entry('初期状態', names('a'))], cursor: 0, selected: 1 };
  const { store, ctrl } = await setup(comb);
  assert.equal(ctrl.editCombination(names('a')), true);
  const c = combOf(store);
  assert.deepEqual(c.timeline, names('a'));
  assert.equal(c.history.length, 1, '履歴は増やさない');
  assert.equal(c.cursor, 0);
  assert.equal(store.get().dirty.combination, true);
});

test('an edit after undo drops the redo side (cursor + 1 onward)', async () => {
  const comb = {
    ...blank(), timeline: names('a', 'b'), selected: 2, cursor: 2,
    history: [entry('初期状態', []), entry('v1', names('a')), entry('v2', names('a', 'b'))],
  };
  const { store, ctrl } = await setup(comb);
  ctrl.undo();
  assert.deepEqual(combOf(store).timeline, names('a'));
  assert.equal(combOf(store).cursor, 1);
  ctrl.editCombination(names('a', 'z'), { label: 'new' });
  const c = combOf(store);
  assert.deepEqual(c.history.map((x) => x.label), ['初期状態', 'v1', 'new']);
  assert.equal(c.cursor, 2);
  assert.equal(c.history[2].selected, 2, 'selected は今の選択');
  ctrl.undo();
  assert.deepEqual(combOf(store).timeline, names('a'), '戻すと1つ前');
  ctrl.redo();
  assert.deepEqual(combOf(store).timeline, names('a', 'z'));
});

test('history is capped at 100: the oldest entry is dropped', async () => {
  const history = Array.from({ length: 100 }, (_, i) => entry(`h${i}`, names(`n${i}`)));
  const comb = { ...blank(), timeline: names('n99'), history, cursor: 99, selected: 1 };
  const { store, ctrl } = await setup(comb);
  ctrl.editCombination(names('n99', 'x'), { label: 'last' });
  const c = combOf(store);
  assert.equal(c.history.length, 100);
  assert.equal(c.history[0].label, 'h1');
  assert.equal(c.history[99].label, 'last');
  assert.equal(c.cursor, 99);
});

test('only name is kept; entries without a name are dropped; the caller array is not kept', async () => {
  const { store, ctrl } = await setup();
  const src = [{ name: 'a', extra: 1 }, { nope: true }, null, { name: 'b' }];
  ctrl.editCombination(src);
  assert.deepEqual(combOf(store).timeline, names('a', 'b'));
  src[0].name = 'changed';
  assert.deepEqual(combOf(store).history[1].timeline, names('a', 'b'));
  assert.equal(ctrl.editCombination('x'), false);
});

test('edit is ignored until the project is ready', async () => {
  const { srv, api } = makeServer(blank());
  const clock = makeClock();
  const store = createStore(initialProjectState());
  const ctrl = createProjectController({ api, store, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: () => 0, ui: {} });
  assert.equal(ctrl.editCombination(names('a')), false);
  assert.equal(ctrl.setCombinationSpeed(2), false);
  assert.equal(ctrl.setCombinationSelected(3), false);
  assert.equal(clock.pending(), 0);
  assert.equal(srv.posts.length, 0);
});

test('speed: only 0.5/1/1.5/2, saved without history', async () => {
  const comb = { ...blank(), timeline: names('a'), history: [entry('初期状態', names('a'))], cursor: 0, selected: 1 };
  const { store, ctrl, clock, srv } = await setup(comb);
  for (const bad of [0, 3, 1.25, NaN, '2', -1]) assert.equal(ctrl.setCombinationSpeed(/** @type {any} */ (bad)), false, String(bad));
  assert.equal(store.get().dirty.combination, false);
  assert.equal(ctrl.setCombinationSpeed(1), false, '同じ値は何もしない');
  assert.equal(ctrl.setCombinationSpeed(1.5), true);
  assert.equal(combOf(store).playbackSpeed, 1.5);
  assert.equal(combOf(store).history.length, 1);
  assert.equal(store.get().dirty.combination, true);
  await clock.advance(AUTOSAVE_MS + 10);
  assert.equal(srv.posts.length, 1);
  assert.equal(srv.posts[0].playbackSpeed, 1.5);
  assert.equal(srv.posts[0].history.length, 1);
  // 履歴の復元は、その時点の速度に戻す（既存の restoreHistory）
  ctrl.editCombination(names('a', 'b'));
  assert.equal(combOf(store).history.at(-1).playbackSpeed, 1.5, '履歴の速度は今の速度');
});

test('selected: changes the store only, never dirty or autosave', async () => {
  const { store, ctrl, clock, srv } = await setup();
  for (const bad of [0, -1, 1.5, NaN]) assert.equal(ctrl.setCombinationSelected(bad), false, String(bad));
  assert.equal(ctrl.setCombinationSelected(9), true);
  assert.equal(combOf(store).selected, 9);
  assert.equal(ctrl.setCombinationSelected(9), false);
  assert.equal(store.get().dirty.combination, false);
  assert.equal(store.get().autosavePending, false);
  assert.equal(clock.pending(), 0);
  await clock.advance(AUTOSAVE_MS * 3);
  assert.equal(srv.posts.length, 0);
  // 次の編集の履歴には選択が入る
  ctrl.editCombination(names('a'));
  assert.equal(combOf(store).history[1].selected, 9);
  assert.equal(combOf(store).history[0].selected, 9);
});

test('editing while a save is in flight keeps the newer edit dirty and saves again', async () => {
  const { srv, api } = makeServer(blank());
  let release;
  const gate = new Promise((r) => { release = r; });
  let first = true;
  const slow = { ...api, async postJson(p, b, o) { if (first) { first = false; await gate; } return api.postJson(p, b, o); } };
  const clock = makeClock();
  const store = createStore(initialProjectState());
  const ctrl = createProjectController({ api: slow, store, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: () => 0, ui: {} });
  await ctrl.loadProject();
  ctrl.editCombination(names('a'));
  await clock.advance(AUTOSAVE_MS + 1); // 保存が始まり、gate で止まる
  assert.equal(store.get().saving, true);
  ctrl.editCombination(names('a', 'b'));
  release();
  await settle(20);
  await clock.advance(AUTOSAVE_MS + 10);
  await settle(20);
  assert.equal(srv.posts.length, 2);
  assert.deepEqual(srv.posts[1].timeline, names('a', 'b'));
  assert.equal(store.get().dirty.combination, false);
  assert.equal(combOf(store).history.length, 3);
});

/* ------------------------------ お気に入り */

const fav = (id, name = id, steps = [{ name: 'S' }]) => ({ id, name, tags: [], steps });
function makeFavServer(list, { failPost = false } = {}) {
  const s = { list, calls: [], posts: [] };
  const api = {
    async getJson(p) { s.calls.push('GET'); assert.equal(p, '/api/favorites'); await settle(1); return { ok: true, status: 200, data: structuredClone(s.list) }; },
    async postJson(p, body) { s.calls.push('POST'); assert.equal(p, '/api/favorites'); await settle(1); if (failPost) return makeError('bad_request', 400, { error: 'invalid favorites' }); s.list = structuredClone(body); s.posts.push(body); return { ok: true, status: 200, data: { ok: true } }; },
  };
  return { s, api };
}

test('favorites: upsert reads the latest list first, replaces by id, appends otherwise', async () => {
  const { s, api } = makeFavServer([fav('a'), fav('b')]);
  const client = createFavoritesClient(api);
  s.list.push(fav('mcp')); // 画面が最後に読んだ後で、他が足した
  let r = await client.upsert(fav('b', 'B2'));
  assert.equal(r.ok, true);
  assert.deepEqual(s.list.map((x) => x.id), ['a', 'b', 'mcp']);
  assert.equal(s.list[1].name, 'B2');
  assert.deepEqual(s.calls.slice(0, 2), ['GET', 'POST'], '書く前に必ず取得する');
  r = await client.upsert(fav('new'));
  assert.deepEqual(s.list.map((x) => x.id), ['a', 'b', 'mcp', 'new']);
  assert.deepEqual(r.list.map((x) => x.id), ['a', 'b', 'mcp', 'new']);
});

test('favorites: remove only removes that id and keeps entries as the server has them', async () => {
  const odd = { name: 'no id from elsewhere', tags: ['x'], steps: [{ name: 'S', note: 'kept' }], extra: 1 };
  const { s, api } = makeFavServer([fav('a'), odd, fav('c')]);
  const client = createFavoritesClient(api);
  const r = await client.remove('a');
  assert.equal(r.ok, true);
  assert.deepEqual(s.list.map((x) => x.name), ['no id from elsewhere', 'c']);
  assert.deepEqual(s.list[0], odd, '他が書いた項目に手を加えない');
});

test('favorites: saves run one at a time and failures are returned', async () => {
  const { s, api } = makeFavServer([]);
  const client = createFavoritesClient(api);
  const [r1, r2] = await Promise.all([client.upsert(fav('1')), client.upsert(fav('2'))]);
  assert.equal(r1.ok && r2.ok, true);
  assert.deepEqual(s.list.map((x) => x.id), ['1', '2'], '重なっても両方残る');
  assert.deepEqual(s.calls, ['GET', 'POST', 'GET', 'POST']);
  const bad = makeFavServer([fav('a')], { failPost: true });
  const r = await createFavoritesClient(bad.api).upsert(fav('x'));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'bad_request');
  assert.deepEqual(bad.s.list.map((x) => x.id), ['a']);
  const off = { getJson: async () => makeError('offline'), postJson: async () => { throw new Error('must not post'); } };
  assert.equal((await createFavoritesClient(off).remove('a')).ok, false, '取得に失敗したら書かない');
});

test('favorites: tags, search and normalize follow index.html:129・131', () => {
  assert.deepEqual(parseTags(' a, b，a\n c ,, '), ['a', 'b', 'c']);
  assert.deepEqual(parseTags(''), []);
  const list = normalizeFavorites([{ id: 'x', name: 'ワンツー', tags: ['格闘'], steps: [{ name: 'Boxing Jab' }, { name: 'Cross' }] }, { name: 5 }, null, { id: 'y', name: 'n' }]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[1], { id: 'y', name: 'n', tags: [], steps: [] });
  assert.equal(filterFavorites(list, '').length, 2);
  assert.equal(filterFavorites(list, '  格闘 jab ').length, 1, '空白で区切った語がすべて含まれる');
  assert.equal(filterFavorites(list, 'JAB').length, 1, '大文字小文字を区別しない');
  assert.equal(filterFavorites(list, '格闘 zzz').length, 0);
  assert.deepEqual(normalizeFavorites('x'), []);
});
