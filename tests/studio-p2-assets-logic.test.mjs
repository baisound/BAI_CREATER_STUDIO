// ③ 素材一覧の読込の単体テスト（P2 設計 §2.3(d)、WP-02）。fetch を差し替える。ブラウザー不要。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAssets, ensureAssets } from '../studio/js/features/assets.js';
import { assets } from '../studio/js/store.js';

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

const ok = (items) => new Response(JSON.stringify({ items }), { status: 200, headers: { 'content-type': 'application/json' } });

test('loadAssets fills the store, and a failure keeps the previous list', async () => {
  globalThis.fetch = async () => ok([{ id: 'fbx:1', name: 'a.fbx', format: 'FBX', kind: 'motions', source: 'fbx', available: true }]);
  await loadAssets();
  assert.equal(assets.get().status, 'ready');
  assert.equal(assets.get().items.length, 1);
  globalThis.fetch = async () => { throw new TypeError('network down'); };
  await loadAssets();
  assert.equal(assets.get().status, 'error');
  assert.equal(assets.get().error.code, 'offline');
  assert.equal(assets.get().items.length, 1, 'the last good list stays visible');
});

test('an older load waits for the newest one: the importer never sees a stale list', async () => {
  let n = 0;
  let releaseFirst;
  const gate = new Promise((r) => { releaseFirst = r; });
  globalThis.fetch = async () => {
    n += 1;
    if (n === 1) { await gate; return ok([{ id: 'old', name: 'old', format: 'VMD', kind: 'vmd', source: 'mmd', available: true }]); }
    return ok([{ id: 'new', name: 'new', format: 'VMD', kind: 'vmd', source: 'mmd', available: true }]);
  };
  const first = loadAssets();
  const second = loadAssets();
  await second;
  assert.deepEqual(assets.get().items.map((i) => i.id), ['new']);
  releaseFirst();
  await first; // 古い読込が先に返っても、新しい結果を上書きしない
  assert.deepEqual(assets.get().items.map((i) => i.id), ['new']);
});

test('ensureAssets only loads when idle', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return ok([]); };
  // 前のテストで ready/error になっているので何もしない
  ensureAssets();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls, 0);
});
