// @ts-check
// 旧 index.html:257・291〜299 の連結再生計算のフォーク（P2 §2.5 O-⑤-2）。DOMには触れない。

/** 腰/rootの XZ 移動差分。旧 clipOffset と同じ。 @param {any} clip @param {number} t @param {any} THREE */
export function clipOffset(clip, t, THREE) {
  const tr = clip.tracks.find((/** @type {any} */ x) => x.name.endsWith('.position') && /hips|root|pelvis/i.test(x.name));
  if (!tr) return new THREE.Vector3();
  const interp = tr.createInterpolant();
  const a = interp.evaluate(0), b = interp.evaluate(Math.max(0, Math.min(t, clip.duration)));
  return new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]);
}

/** 旧 chainFrame のループと境界計算。 @param {number[]} lengths @param {number} clock */
export function chainLocate(lengths, clock) {
  const total = lengths.reduce((a, b) => a + b, 0);
  if (clock >= total) clock = 0;
  let remain = clock, index = 0;
  while (index < lengths.length - 1 && remain >= lengths[index]) remain -= lengths[index++];
  return { clock, index, remain };
}

/** 旧 chainFrame の前の手順の移動合計。 @param {any[]} prevClips @param {any} THREE */
export function chainShift(prevClips, THREE) {
  const shift = new THREE.Vector3();
  for (const clip of prevClips) if (clip) shift.add(clipOffset(clip, clip.duration, THREE));
  return shift;
}
