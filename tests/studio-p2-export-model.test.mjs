import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BONE_MAP, parseBoneMap, resolveMotionNames } from '../studio/js/features/export-model.js';

test('VMD job resolves ordered registered FBX and a manual pattern mapping', () => {
  const timeline = [{ name: 'Boxing Leading Hand Jab' }, { name: 'Custom Pattern' }];
  const manifest = { files: [
    { name: 'Boxing Leading Hand Jab.fbx', kind: 'motions' },
    { name: 'Another Clip.fbx', kind: 'motions' },
    { name: 'Custom Pattern.fbx', kind: 'modelA' },
  ], mapping: { 'Custom Pattern': 'anotherclip' } };
  assert.deepEqual(resolveMotionNames(timeline, manifest), ['Boxing Leading Hand Jab.fbx', 'Another Clip.fbx']);
  assert.deepEqual(parseBoneMap(JSON.stringify(DEFAULT_BONE_MAP), true), DEFAULT_BONE_MAP);
  assert.throws(() => resolveMotionNames([{ name: 'Missing' }], manifest), /登録済みFBXが見つかりません/);
});

test('VMD bone map rejects missing, empty, malformed and oversized names before job submission', () => {
  assert.throws(() => parseBoneMap('broken'), /JSON/);
  assert.throws(() => parseBoneMap('[]'), /オブジェクト/);
  assert.throws(() => parseBoneMap('{}', true), /1件以上/);
  assert.throws(() => parseBoneMap('{"x":1}', true), /ボーン名/);
  assert.throws(() => parseBoneMap(JSON.stringify({ ['x'.repeat(128)]: 'a' }), true), /128文字未満/);
});
