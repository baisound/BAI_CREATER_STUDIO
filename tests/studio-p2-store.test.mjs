// store.js / bus.js / state-box の単体テスト（P2 設計 §1.4・§1.5、WP-00c）。DOM なしで動く部分だけ。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, project, assets, imports, hasUnsaved } from '../studio/js/store.js';
import { on, emit, bus } from '../studio/js/bus.js';

test('createStore: shallow merge, reason, unsubscribe, a throwing subscriber does not break others', () => {
  const s = createStore({ a: 1, b: { x: 1 } });
  const seen = [];
  const off = s.subscribe((st, reason) => seen.push([st.a, reason]));
  s.subscribe(() => { throw new Error('boom'); });
  const origErr = console.error; console.error = () => {};
  try { s.set({ a: 2 }, 'edit'); } finally { console.error = origErr; }
  assert.deepEqual(seen, [[2, 'edit']]);
  assert.deepEqual(s.get().b, { x: 1 }, 'untouched keys are kept');
  off();
  s.set({ a: 3 });
  assert.equal(seen.length, 1, 'unsubscribed');
  assert.equal(s.get().a, 3);
});

test('project store has the designed shape and hasUnsaved follows it', () => {
  const s = project.get();
  for (const k of ['status', 'bundle', 'base', 'revision', 'projectRevision', 'combinationMissing', 'dirty', 'autosavePending', 'saving', 'error', 'syncError', 'saveSeq', 'cameraInvalid', 'externalChange', 'syncRevision', 'lastCommandId', 'loadedAt']) assert.ok(k in s, k);
  assert.equal(s.status, 'idle');
  assert.deepEqual(s.dirty, { combination: false, workspace: false, camera: false });
  assert.equal(hasUnsaved(), false);
  project.set({ dirty: { ...project.get().dirty, workspace: true } });
  assert.equal(hasUnsaved(), true);
  project.set({ dirty: { combination: false, workspace: false, camera: false }, autosavePending: true });
  assert.equal(hasUnsaved(), true);
  project.set({ autosavePending: false, saving: true });
  assert.equal(hasUnsaved(), true);
  project.set({ saving: false });
  assert.equal(hasUnsaved(), false);
});

test('assets / imports stores start empty', () => {
  assert.deepEqual(assets.get(), { status: 'idle', items: [], error: null, loadedAt: null });
  assert.deepEqual(imports.get(), { rows: [] });
});

test('bus: on / emit / unsubscribe', () => {
  const got = [];
  const off = on('studio:project-loaded', (d) => got.push(d));
  emit('studio:project-loaded', { revision: 'r1' });
  off();
  emit('studio:project-loaded', { revision: 'r2' });
  assert.deepEqual(got, [{ revision: 'r1' }]);
  assert.ok(bus instanceof EventTarget);
});
