'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function core() {
  const ctx = { window: {} };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync('camera_bundle_core.js', 'utf8'), ctx);
  assert.ok(ctx.window.BAICameraBundleCore);
  assert.equal(ctx.window.BAICameraBundleCore, ctx.BAICameraBundleCore);
  return ctx.window.BAICameraBundleCore;
}

test('shared bundle restore validation rejects malformed camera and workspace', () => {
  const api = core();
  const valid = { complete: true, combination: {}, camera: { duration: 20, keys: [] }, workspace: { frame: 10, asset: '', clip: null } };
  assert.equal(api.validateRestore(valid), true);
  for (const bad of [
    { ...valid, complete: false }, { ...valid, camera: { duration: 0, keys: [] } },
    { ...valid, camera: { duration: 20, keys: null } }, { ...valid, workspace: null },
    { ...valid, workspace: { frame: 21, asset: '', clip: null } },
    { ...valid, workspace: { frame: 1, asset: '', clip: 1 } },
    { ...valid, workspace: { frame: 1, asset: 99, clip: null } },
  ]) assert.throws(() => api.validateRestore(bad));
});

test('shared bundle body and workspace merge preserve store ownership', () => {
  const api = core();
  const workspace = { frame: 42, asset: 'mmd:A:actor.pmx', clip: null,
    stage: { asset: 'stage.glb', position: [1, 2, 3] }, character: { position: [4, 5, 6] } };
  const merged = api.mergeWorkspace(workspace, { frame: 2, asset: 'wrong.glb', clip: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(merged)), workspace);
  assert.notEqual(merged, workspace);
  assert.deepEqual(Array.from(api.CAMERA_OWNED_WORKSPACE_FIELDS), []);
  const body = api.buildBundleBody({ combination: { schema: 1 }, camera: { keys: [] }, workspace: merged });
  assert.deepEqual(JSON.parse(JSON.stringify(body)), { schema: 1, combination: { schema: 1 }, camera: { keys: [] }, workspace });
  assert.equal('workspace' in api.buildBundleBody({ combination: {}, camera: {}, workspace: null }), false);
});
