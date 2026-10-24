// Evaluate one adopted morph-only VMD candidate within its original SRT cue spans.
// The caller seeks the source motion first, then applies these values, then manual
// face keys. Nothing is written to the source VMD or the scene face-key store.
export function evaluateLipCueTracks(cueTracks, seconds) {
  const result = new Map();
  if (!Number.isFinite(seconds)) return result;
  for (const cue of cueTracks || []) {
    if (!Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs)
      || seconds < cue.startMs / 1000 || seconds >= cue.endMs / 1000) continue;
    const byName = new Map();
    for (const row of cue.records || []) {
      if (typeof row.name !== 'string' || !Number.isInteger(row.frame)
        || !Number.isFinite(row.weight)) continue;
      if (!byName.has(row.name)) byName.set(row.name, []);
      byName.get(row.name).push(row);
    }
    for (const [name, keys] of byName) {
      keys.sort((a, b) => a.frame - b.frame);
      const frame = seconds * 30;
      if (frame < keys[0].frame) continue;
      let value = keys.at(-1).weight;
      for (let index = 0; index < keys.length - 1; index++) {
        const a = keys[index], b = keys[index + 1];
        if (frame > b.frame) continue;
        const mix = Math.max(0, Math.min(1, (frame - a.frame) / (b.frame - a.frame)));
        value = a.weight + (b.weight - a.weight) * mix;
        break;
      }
      result.set(name, Math.max(0, Math.min(1, value)));
    }
  }
  return result;
}
