// WP-L8a §6.2：③の読込の置き方 placeInstanceObject（印なし＝③の正規化、印 'legacy'＝素材の単位の換算だけ）。
// WebGL は使わない。three が必須なので、node_modules/three が無ければ skip せずに失敗する。
// 期待値は試験の中に数で直接書く（同じ正規化の関数と比べると、自分と自分を比べることになるため）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeFile = path.join(root, 'node_modules', 'three', 'build', 'three.module.js');
assert.ok(fs.existsSync(threeFile), 'node_modules/three がありません（npm ci を実行してください）');
const THREE = await import(pathToFileURL(threeFile).href);
const { placeInstanceObject, LEGACY_UNITS } = await import(pathToFileURL(path.join(root, 'studio', 'v05', 'js', 'instance-units-v189.mjs')).href);

/** 箱のメッシュ（min (2,−0.5,−5)、max (12,3.5,1)）を Group に入れた object。 */
function boxObject() {
  const geometry = new THREE.BoxGeometry(10, 4, 6);
  geometry.translate(7, 1.5, -2);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  return group;
}
function near(actual, expected, label) {
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= 1e-12, `${label}[${i}]: ${v} ≠ ${expected[i]}`));
}
const scaleOf = o => o.scale.toArray();
const positionOf = o => o.position.toArray();

test('N1 GLB without units is normalized to 2 m, centred in XZ and set on y=0', () => {
  const o = boxObject();
  assert.deepEqual(placeInstanceObject(o, 'GLB', null, THREE), { mode: 'v05', unit: null });
  near(scaleOf(o), [0.5, 0.5, 0.5], 'scale');
  near(positionOf(o), [-3.5, 0.25, 1], 'position');
});

test('N2 units undefined is the same as null', () => {
  const o = boxObject();
  assert.deepEqual(placeInstanceObject(o, 'GLB', undefined, THREE), { mode: 'v05', unit: null });
  near(scaleOf(o), [0.5, 0.5, 0.5], 'scale');
  near(positionOf(o), [-3.5, 0.25, 1], 'position');
});

test('N3 PMX without units is 0.08x with the lowest vertex lifted to y=0', () => {
  const o = boxObject();
  assert.deepEqual(placeInstanceObject(o, 'PMX', null, THREE), { mode: 'v05', unit: null });
  near(scaleOf(o), [0.08, 0.08, 0.08], 'scale');
  near(positionOf(o), [0, 0.04, 0], 'position');
});

test('N4 GLB with legacy units keeps the file origin and unit 1', () => {
  const o = boxObject();
  assert.equal(LEGACY_UNITS, 'legacy');
  assert.deepEqual(placeInstanceObject(o, 'GLB', 'legacy', THREE), { mode: 'legacy', unit: 1 });
  near(scaleOf(o), [1, 1, 1], 'scale');
  near(positionOf(o), [0, 0, 0], 'position');
});

test('N5 PMX with legacy units is 0.08x and not moved', () => {
  const o = boxObject();
  assert.deepEqual(placeInstanceObject(o, 'PMX', 'legacy', THREE), { mode: 'legacy', unit: 0.08 });
  near(scaleOf(o), [0.08, 0.08, 0.08], 'scale');
  near(positionOf(o), [0, 0, 0], 'position');
});

test('N6 FBX with legacy units uses UnitScaleFactor / 100', () => {
  const o = boxObject();
  o.userData.unitScaleFactor = 2.54;
  const result = placeInstanceObject(o, 'FBX', 'legacy', THREE);
  assert.equal(result.mode, 'legacy');
  near(scaleOf(o), [0.0254, 0.0254, 0.0254], 'scale');
  near(positionOf(o), [0, 0, 0], 'position');
});

test('N7 unknown units throw', () => {
  assert.throws(() => placeInstanceObject(boxObject(), 'GLB', 'other', THREE), /units が不正です: other/);
});
