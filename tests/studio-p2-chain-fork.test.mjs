// P2-WP-05d：旧画面の2体配置と連結再生の式を照合する。ブラウザー不要。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clipOffset, chainLocate, chainShift } from '../studio/js/motion/chain.fork.js';
import { fitActorFbx, placeActorPmx } from '../studio/js/viewport/normalize.fork.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const threePath = path.join(root, 'node_modules', 'three', 'build', 'three.module.js');

class Vec {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  toArray() { return [this.x, this.y, this.z]; }
}
const THREE_STUB = { Vector3: Vec };
const track = (name, end) => ({ name, createInterpolant: () => ({ evaluate: (t) => [1 + end[0] * t, 2, 3 + end[2] * t] }) });
const clip = (duration, tracks) => ({ duration, tracks });

test('clipOffset matches the actual legacy function and chainShift is absolute', () => {
  const src = html.match(/function clipOffset\(clip,t\)\{[^\n]+\}/)?.[0];
  assert.ok(src, '旧画面の clipOffset が見つかる');
  const old = new Function('THREE', `return (${src})`)(THREE_STUB);
  const clips = [
    clip(2, [track('mixamorigHips.position', [2, 0, -1])]),
    clip(1, [track('Root.position', [-3, 0, 4])]),
    clip(3, [track('Hand.position', [99, 0, 99])]),
  ];
  for (const c of clips) for (const t of [0, .3, c.duration, c.duration + 1]) {
    assert.deepEqual(clipOffset(c, t, THREE_STUB).toArray(), old(c, t).toArray());
  }
  const expected = new Vec();
  for (const c of clips) expected.add(old(c, c.duration));
  assert.deepEqual(chainShift(clips, THREE_STUB).toArray(), expected.toArray());
  assert.deepEqual(chainShift(clips, THREE_STUB).toArray(), expected.toArray(), '再計算しても位置が増えない');
});

test('chainLocate follows legacy boundary and loop rules', () => {
  const lengths = [1, 2, 3];
  assert.deepEqual(chainLocate(lengths, 0), { clock: 0, index: 0, remain: 0 });
  assert.deepEqual(chainLocate(lengths, 1), { clock: 1, index: 1, remain: 0 });
  assert.deepEqual(chainLocate(lengths, 3), { clock: 3, index: 2, remain: 0 });
  assert.deepEqual(chainLocate(lengths, 6), { clock: 0, index: 0, remain: 0 });
});

test('FBX A/B and PMX A/B keep legacy height, position and orientation', { skip: !fs.existsSync(threePath) && 'three.js がローカルにありません（npm ci）' }, async () => {
  const THREE = await import('../node_modules/three/build/three.module.js');
  for (const idx of [0, 1]) {
    const fbx = new THREE.Group();
    fbx.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()));
    fitActorFbx(fbx, idx, THREE);
    const fbxBox = new THREE.Box3().setFromObject(fbx);
    assert.ok(Math.abs(fbxBox.getSize(new THREE.Vector3()).y - 1.95) < 1e-6);
    assert.ok(Math.abs(fbxBox.min.y) < 1e-6);
    assert.equal(fbx.position.x, idx === 0 ? -1.4 : 1.4);
    assert.equal(fbx.rotation.y, idx === 0 ? Math.PI / 2 : -Math.PI / 2);
    const pmx = new THREE.Group();
    pmx.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()));
    placeActorPmx(pmx, idx, THREE);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(pmx).getSize(new THREE.Vector3()).y - 1.8) < 1e-6);
    assert.equal(pmx.position.x, idx === 0 ? -1.4 : 1.4);
    assert.equal(pmx.rotation.y, idx === 0 ? Math.PI / 2 : -Math.PI / 2);
  }
});
