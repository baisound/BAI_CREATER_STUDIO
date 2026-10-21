import test from 'node:test';
import assert from 'node:assert/strict';
import { motionFileMap, clipKeyFor, createFbxClipCache, saveMappingEntry } from '../studio/js/motion/fbx-clips.js';

test('registered motion lookup keeps the last matching filename and manual mapping wins', () => {
  const files = motionFileMap({ files: [
    { id: 'model', name: 'Back Hand Cross.fbx', kind: 'modelA' },
    { id: 'old', name: 'Back Hand Cross.fbx', kind: 'motions' },
    { id: 'new', name: 'Back Hand Cross.FBX', kind: 'motions' },
    { id: 'jab', name: 'Jab.fbx', kind: 'motions' },
  ] });
  assert.equal(files.get('backhandcross')?.id, 'new');
  assert.equal(clipKeyFor('Back Hand Cross', {}, files), 'backhandcross');
  assert.equal(clipKeyFor('Back Hand Cross', { 'Back Hand Cross': 'jab' }, files), 'jab');
  assert.equal(clipKeyFor('Back Hand Cross', { 'Back Hand Cross': 'missing' }, files), 'backhandcross');
  assert.equal(clipKeyFor('No Match', {}, files), null);
});

test('mapping save preserves a key added elsewhere before the save', async () => {
  let sent;
  const r = await saveMappingEntry('Back Hand Cross', 'jab', {
    get: async () => ({ ok: true, status: 200, data: { mapping: { 'External Step': 'other' } } }),
    post: async (url, value) => { assert.equal(url, '/api/mapping'); sent = value; return { ok: true, status: 200, data: { ok: true } }; },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(sent, { 'External Step': 'other', 'Back Hand Cross': 'jab' });
});

test('FBX clips load on demand, cache by ID, and reject a file without animation', async () => {
  let reads = 0, parses = 0;
  const clip = { duration: 1 };
  const libs = { FBXLoader: class { parse() { parses++; return { animations: parses === 2 ? [] : [clip], traverse() {} }; } } };
  const repo = createFbxClipCache(libs, { get: async (url) => { assert.match(url, /^\/api\/file\//); reads++; return { ok: true, status: 200, data: new ArrayBuffer(0) }; } });
  const file = { id: 'a', name: 'a.fbx', kind: 'motions' };
  assert.equal(await repo.getClip(file), clip);
  assert.equal(await repo.getClip(file), clip);
  assert.equal(reads, 1);
  repo.clear();
  await assert.rejects(repo.getClip(file), /アニメーションがありません/);
  assert.equal(reads, 2);
});
