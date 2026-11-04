// Evaluate one adopted morph-only VMD candidate within its original SRT cue spans.
// The caller seeks the source motion first, then applies these values, then manual
// face keys. Nothing is written to the source VMD or the scene face-key store.
//
// LIP-001 owner decision 2026-11-04 (design A1 section 4.1): the curve is linear on
// the 30 fps VMD grid. Each integer VMD frame takes the hard SRT rule (adopted value
// inside [startMs, endMs), source value outside); between two integer frames the
// value is the straight line between them. A cue start/end therefore becomes a
// one-VMD-frame ramp that a 30 fps VMD reproduces exactly, and the same function is
// used by the 3D view and the preview/MP4 capture. It must stay equal to
// studio_v05_lip_vmd_composite._lip_base.

const GRID_SNAP = 1e-9;

function cueMorphTracks(cueTracks) {
  const cues = [];
  for (const cue of cueTracks || []) {
    if (!Number.isFinite(cue?.startMs) || !Number.isFinite(cue?.endMs)) continue;
    const byName = new Map();
    for (const row of cue.records || []) {
      if (typeof row.name !== 'string' || !Number.isInteger(row.frame)
        || !Number.isFinite(row.weight)) continue;
      if (!byName.has(row.name)) byName.set(row.name, []);
      byName.get(row.name).push(row);
    }
    for (const keys of byName.values()) keys.sort((a, b) => a.frame - b.frame);
    cues.push({startMs: cue.startMs, endMs: cue.endMs, byName});
  }
  return cues;
}

function curve(keys, frame) {
  if (frame <= keys[0].frame) return keys[0].weight;
  for (let index = 0; index < keys.length - 1; index++) {
    const a = keys[index], b = keys[index + 1];
    if (frame > b.frame) continue;
    return a.weight + (b.weight - a.weight) * (frame - a.frame) / (b.frame - a.frame);
  }
  return keys.at(-1).weight;
}

/** Hard SRT rule at one integer VMD frame; undefined means the source value stays. */
function adoptedAtFrame(cues, frame, name) {
  for (const cue of cues) {
    if (!(cue.startMs * 30 <= frame * 1000 && frame * 1000 < cue.endMs * 30)) continue;
    const keys = cue.byName.get(name);
    if (keys && frame >= keys[0].frame) return Math.max(0, Math.min(1, curve(keys, frame)));
    return undefined;
  }
  return undefined;
}

/**
 * @param {any[]} cueTracks adopted cue tracks ({startMs,endMs,records})
 * @param {number} seconds project time
 * @param {(name:string, frame:number)=>number} [sourceAt] source morph value at an
 *   integer VMD frame (frame/30 s). Called only inside a boundary ramp.
 * @returns {Map<string, number>} morphs to override; absent names keep the source.
 */
export function evaluateLipCueTracks(cueTracks, seconds, sourceAt) {
  const result = new Map();
  if (!Number.isFinite(seconds)) return result;
  const cues = cueMorphTracks(cueTracks);
  const names = new Set();
  for (const cue of cues) for (const name of cue.byName.keys()) names.add(name);
  const position = seconds * 30;
  const nearest = Math.round(position);
  const onGrid = Math.abs(position - nearest) < GRID_SNAP;
  const frame = onGrid ? nearest : Math.floor(position);
  const mix = onGrid ? 0 : position - frame;
  for (const name of names) {
    let left = adoptedAtFrame(cues, frame, name);
    if (onGrid) {
      if (left !== undefined) result.set(name, left);
      continue;
    }
    let right = adoptedAtFrame(cues, frame + 1, name);
    if (left === undefined && right === undefined) continue;
    const source = (/** @type {number} */ at) => {
      if (typeof sourceAt !== 'function') throw Error('口形の境界補間には元動作のモーフ値が必要です');
      return Number(sourceAt(name, at));
    };
    if (left === undefined) left = source(frame);
    if (right === undefined) right = source(frame + 1);
    if (!Number.isFinite(left) || !Number.isFinite(right)) throw Error('元動作のモーフ値が不正です: ' + name);
    result.set(name, Math.max(0, Math.min(1, left + (right - left) * mix)));
  }
  return result;
}
