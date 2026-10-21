import test from 'node:test';
import assert from 'node:assert/strict';
import { safeTimelineClip, timelineEnd, timelineAdvance, timelineSelect, timelineLocalTime, timelineShift } from '../studio/js/motion/chain.fork.js';
import { safeLayer, layerValues, applyLayers } from '../studio/js/motion/layers.fork.js';
import { createTimelineSync } from '../studio/js/motion/timeline-sync.js';

const clip = (name, start, duration) => safeTimelineClip({ name, start, duration, speed: 1, blend: 6 });

test('timeline uses the legacy 30fps clock and last overlapping clip', () => {
  const clips = [clip('later', 60, 90), clip('first', 0, 90), clip('overlap', 60, 30)];
  assert.equal(timelineEnd(clips), 150);
  assert.deepEqual(timelineAdvance(149, .08, clips), { position: 150, ended: true, end: 150 });
  assert.equal(timelineSelect(clips, 60)?.clip.name, 'overlap');
  assert.equal(timelineSelect(clips, 90)?.clip.name, 'later');
  assert.equal(timelineSelect(clips, 150), null);
  assert.equal(timelineLocalTime(2, { start: 30, speed: 2 }, 75), 2);
});

test('previous clip root displacement is limited by its edited duration and speed', () => {
  class Vector3 { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; } }
  const source = { duration: 4, tracks: [{ name: 'Hips.position', createInterpolant: () => ({ evaluate: (t) => [t * 2, 0, t * 3] }) }] };
  const out = timelineShift([{ clip: source, c: { duration: 30, speed: 2 } }], { Vector3 });
  assert.deepEqual([out.x, out.z], [4, 6]); // 30F / 30fps × 2倍 = 2秒
});

test('layer interpolation and additive rotation match the old calculation', () => {
  const layer = safeLayer({ name: 'turn', bone: 'Tri', keys: [{ frame: 30, x: 0, y: 180, z: 0 }, { frame: 0, x: 0, y: 0, z: 0 }] });
  assert.equal(layerValues(layer.keys, 15).y, 90);
  const tri = { name: 'Tri', rotation: { x: 0, y: 0.25, z: 0 } };
  const model = { getObjectByName: (n) => n === 'Tri' ? tri : null, traverse: () => {} };
  applyLayers(model, [layer], 15);
  assert.ok(Math.abs(tri.rotation.y - (0.25 + Math.PI / 2)) < 1e-9);
  layer.enabled = false;
  applyLayers(model, [layer], 15);
  assert.ok(Math.abs(tri.rotation.y - (0.25 + Math.PI / 2)) < 1e-9);
});

function fixture(field = 'clips', delayMs = 550) {
  let server = [], posts = 0;
  const jobs = [];
  const api = {
    get: async () => ({ ok: true, data: { [field]: structuredClone(server) } }),
    post: async (_path, body) => { server = structuredClone(body[field]); posts++; return { ok: true, data: { ok: true } }; },
  };
  const sync = createTimelineSync({
    path: field === 'clips' ? '/api/timeline-editor' : '/api/motion-layers', field, delayMs,
    normalize: field === 'clips' ? safeTimelineClip : safeLayer,
    get: api.get, post: api.post,
    schedule: (fn, ms) => { const job = { fn, ms, active: true }; jobs.push(job); return job; },
    cancel: (job) => { job.active = false; },
    clock: () => new Date('2026-10-21T01:00:00Z'),
  });
  const fire = async () => { const job = jobs.findLast((x) => x.active); assert.ok(job); job.active = false; job.fn(); await new Promise((r) => setImmediate(r)); };
  return { sync, jobs, fire, get posts() { return posts; }, setServer: (v) => { server = structuredClone(v); }, get server() { return server; } };
}

test('timeline saves after 550ms and flushes a queued edit on leave', async () => {
  const f = fixture();
  assert.equal((await f.sync.load()).ok, true);
  f.sync.edit([clip('jab', 0, 90)]);
  assert.equal(f.sync.state().dirty, true);
  assert.equal(f.posts, 0);
  assert.equal(f.jobs.at(-1).ms, 550);
  await f.fire();
  assert.equal(f.posts, 1);
  assert.equal(f.sync.state().dirty, false);
  f.sync.edit([clip('jab', 0, 120)]);
  assert.equal((await f.sync.flushOnLeave()).ok, true);
  assert.equal(f.posts, 2);
  assert.equal(f.server[0].duration, 120);
});

test('external edit stops autosave; confirmed overwrite preserves local edits', async () => {
  const f = fixture();
  f.setServer([clip('server', 0, 90)]);
  await f.sync.load();
  f.sync.edit([clip('local', 0, 90)]);
  f.setServer([clip('other screen', 0, 90)]);
  const blocked = await f.sync.save();
  assert.equal(blocked.conflict, true);
  assert.equal(f.posts, 0);
  assert.deepEqual(f.sync.state().items.map((c) => c.name), ['local']);
  assert.match(f.sync.state().status, /まだ保存していません/);
  assert.equal((await f.sync.overwrite()).ok, true);
  assert.deepEqual(f.server.map((c) => c.name), ['local']);
  assert.equal(f.sync.state().conflict, false);
});

test('motion layers use 500ms and the same content conflict check', async () => {
  const f = fixture('layers', 500);
  await f.sync.load();
  f.sync.edit([safeLayer({ name: 'local', bone: 'Tri', keys: [] })]);
  assert.equal(f.jobs.at(-1).ms, 500);
  f.setServer([safeLayer({ name: 'remote', bone: 'Tri', keys: [] })]);
  await f.fire();
  assert.equal(f.posts, 0);
  assert.equal(f.sync.state().conflict, true);
  assert.match(f.sync.state().status, /補正レイヤーが更新/);
  assert.equal((await f.sync.load({ discard: true })).ok, true);
  assert.equal(f.sync.state().items[0].name, 'remote');
});

test('an edit made during POST remains dirty and is saved in the next debounce', async () => {
  let server = [], finishFirst;
  const jobs = [];
  let posts = 0;
  const sync = createTimelineSync({
    path: '/api/timeline-editor', field: 'clips', delayMs: 550, normalize: safeTimelineClip,
    get: async () => ({ ok: true, data: { clips: structuredClone(server) } }),
    post: async (_path, body) => {
      if (posts++ === 0) await new Promise((resolve) => { finishFirst = resolve; });
      server = structuredClone(body.clips);
      return { ok: true };
    },
    schedule: (fn) => { const job = { fn, active: true }; jobs.push(job); return job; },
    cancel: (job) => { job.active = false; },
  });
  await sync.load();
  sync.edit([clip('first', 0, 90)]);
  const first = sync.save();
  await new Promise((r) => setImmediate(r));
  sync.edit([clip('second', 0, 120)]);
  finishFirst();
  await first;
  assert.equal(sync.state().dirty, true);
  assert.equal(server[0].name, 'first');
  const next = jobs.findLast((job) => job.active);
  assert.ok(next);
  next.fn();
  await new Promise((r) => setImmediate(r));
  assert.equal(server[0].name, 'second');
  assert.equal(sync.state().dirty, false);
});
