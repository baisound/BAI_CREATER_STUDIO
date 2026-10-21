import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLighting, hexOf, isLighting, newLight, putLightKey, removeLight, removeLightKey, sampleLight } from '../studio/js/viewport/scene-lighting.js';

test('three-point setup is an editable starting preset, not a fixed actor count', () => {
  const initial = defaultLighting();
  assert.deepEqual(initial.items.map((l) => l.id), ['key', 'fill', 'rim']);
  const added = newLight(initial, 'spot');
  const four = { ...initial, items: [...initial.items, added] };
  assert.equal(four.items.length, 4);
  assert.equal(removeLight(four, 'fill').items.length, 3);
  assert.equal(defaultLighting().items.length, 3, 'template was not mutated');
  assert.equal(isLighting(four), true);
});

test('independent light keys interpolate RGB/intensity/position and shortest rotation', () => {
  const initial = defaultLighting();
  const keyed = putLightKey(initial, 'key', 30, { position: [3, 4, 5], rgb: [255, 0, 0], intensity: 4, rotation: [-38, 170, 0] });
  const keyed2 = putLightKey(keyed, 'key', 60, { rotation: [-38, -170, 0], enabled: false });
  const at15 = sampleLight(keyed2.items[0], 15);
  assert.deepEqual(at15.position, [-0.25, 4.1, 4.25]);
  assert.deepEqual(at15.rgb, [229, 114, 128]);
  assert.equal(at15.intensity, 3.25);
  assert.equal(sampleLight(keyed2.items[0], 45).rotation[1], 180);
  assert.equal(sampleLight(keyed2.items[0], 45).enabled, true);
  assert.equal(sampleLight(keyed2.items[0], 60).enabled, false);
  assert.equal(sampleLight(keyed2.items[1], 15).rgb[0], 255, 'fill stays independent');
  assert.deepEqual(removeLightKey(keyed2, 'key', 30).items[0].keys.map((k) => k.frame), [0, 60]);
  assert.deepEqual(removeLightKey(keyed2, 'key', 0).items[0].keys.map((k) => k.frame), [0, 30, 60]);
  assert.equal(hexOf([0, 128, 255]), '#0080ff');
});
