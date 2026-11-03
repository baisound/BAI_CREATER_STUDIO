import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BONE_MAP, conversionFailureText, parseBoneMap, resolveMotionNames } from '../studio/js/features/export-model.js';

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

test('Blender run failures show the server reason instead of the generic 422/409 text', () => {
  // server.py /api/run-vmd-conversion: 422 {status,returncode,output_tail}、409 実行中、503/504 は error。
  const tail = conversionFailureText({ ok: false, status: 422, message: '保存データを読めません：', body: { status: 'failed', returncode: 2, output_tail: `${'x'.repeat(1000)}\nKeyError: Hips\n` } });
  assert.match(tail, /終了コード 2/);
  assert.match(tail, /KeyError: Hips$/);
  assert.ok(tail.length < 500, '出力の末尾だけを表示する');
  assert.doesNotMatch(tail, /保存データを読めません/);
  assert.match(conversionFailureText({ ok: false, status: 409, message: '他の画面・MCP でサーバー側が更新されています。', body: { error: 'conversion already running' } }), /別のVMD変換が実行中/);
  assert.equal(conversionFailureText({ ok: false, status: 504, message: 'サーバーでエラー', body: { error: 'Blender timed out' } }), 'Blender timed out');
  assert.equal(conversionFailureText({ ok: false, status: 0, message: '未接続：サーバーに接続できません。', body: null }), '未接続：サーバーに接続できません。');
});
