// @ts-check
// Issue #39: integer-frame mapping shared by timeline, Web Audio scheduling, and 3D pose.
export const FPS = 30;
export const MAX_FRAME = 216000;

/** @param {number} frame */
export function clampFrame(frame) { return Math.max(0, Math.min(MAX_FRAME, Math.round(Number.isFinite(frame) ? frame : 0))); }

/** @param {number} frame @param {number} start @param {number} source @param {number} durationSeconds */
export function mediaAt(frame, start, source, durationSeconds) {
  const seconds = (frame - start + source) / FPS;
  return { seconds: Math.max(0, seconds), active: frame >= start && seconds >= 0 && seconds < durationSeconds };
}

/** @param {number} currentFrame @param {number} start @param {number} source @param {number} durationSeconds @param {number} contextNow */
export function audioSchedule(currentFrame, start, source, durationSeconds, contextNow) {
  if (!(durationSeconds > 0)) return null;
  const delay = Math.max(0, (start - currentFrame) / FPS);
  const offset = Math.max(0, (delay > 0 ? source : currentFrame - start + source) / FPS);
  if (offset >= durationSeconds) return null;
  return { when: contextNow + delay, offset, duration: durationSeconds - offset };
}

/** @param {number} audioSeconds @param {number} motionSeconds @param {{audio_start_frame: number,audio_source_frame: number,motion_start_frame: number,motion_source_frame: number}} p */
export function timelineLength(audioSeconds, motionSeconds, p) {
  const audioEnd = p.audio_start_frame + Math.max(0, Math.ceil(audioSeconds * FPS) - p.audio_source_frame);
  const motionEnd = p.motion_start_frame + Math.max(0, Math.ceil(motionSeconds * FPS) - p.motion_source_frame);
  return clampFrame(Math.max(300, audioEnd, motionEnd) + 30);
}

/** @param {Float32Array} samples @param {number} count */
export function waveformPeaks(samples, count = 160) {
  const result = [];
  if (!samples?.length) return result;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * samples.length / count), end = Math.max(start + 1, Math.floor((i + 1) * samples.length / count));
    let peak = 0;
    for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(samples[j] || 0));
    result.push(peak);
  }
  return result;
}
