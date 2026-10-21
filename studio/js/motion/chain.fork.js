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

/** 旧タイムラインの safe と同じ入力正規化。 @param {any} c */
export function safeTimelineClip(c) {
  return {
    name: String(c?.name || ''),
    start: Math.max(0, Math.round(+c?.start || 0)),
    duration: Math.max(1, Math.round(+c?.duration || 90)),
    speed: Math.max(.1, Math.min(4, +c?.speed || 1)),
    blend: Math.max(0, Math.min(120, Math.round(+c?.blend || 0))),
  };
}

/** 旧 transport の終端。 @param {any[]} clips */
export function timelineEnd(clips) { return Math.max(1, ...clips.map((c) => c.start + c.duration)); }

/** 再生中の1tick。 @param {number} position @param {number} dt @param {any[]} clips */
export function timelineAdvance(position, dt, clips) {
  const end = timelineEnd(clips);
  const next = Math.max(0, position + dt * 30);
  return { position: Math.min(next, end), ended: next >= end, end };
}

/** 開始順のうち、現在フレームを含む最後のクリップ。 @param {any[]} clips @param {number} frame @returns {{clip:any,index:number,originalIndex:number}|null} */
export function timelineSelect(clips, frame) {
  const ordered = clips.map((clip, originalIndex) => ({ clip, originalIndex })).sort((a, b) => a.clip.start - b.clip.start);
  /** @type {{clip:any, index:number, originalIndex:number}|null} */ let selected = null;
  ordered.forEach((entry, index) => {
    const c = entry.clip;
    if (frame >= c.start && frame < c.start + c.duration) selected = { clip: c, index, originalIndex: entry.originalIndex };
  });
  return selected;
}

/** 旧 timelineFrame のローカル時刻。 @param {number} clipDuration @param {any} c @param {number} frame */
export function timelineLocalTime(clipDuration, c, frame) {
  return Math.min(clipDuration, Math.max(0, (frame - c.start) / 30 * c.speed));
}

/** 先行クリップの root/hips XZ 移動を足す。 @param {{clip:any,c:any}[]} prevPairs @param {any} THREE */
export function timelineShift(prevPairs, THREE) {
  const offset = new THREE.Vector3();
  for (const { clip, c } of prevPairs) {
    if (clip) offset.add(clipOffset(clip, Math.min(clip.duration, c.duration / 30 * c.speed), THREE));
  }
  return offset;
}
