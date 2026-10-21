import test from 'node:test';
import assert from 'node:assert/strict';
import { FPS, clampFrame, mediaAt, audioSchedule, timelineLength, waveformPeaks } from '../studio/js/motion/music-dance-clock.js';

test('audio and motion frame maps use one 30 fps clock and preserve source head offsets', () => {
  assert.equal(FPS, 30);
  assert.deepEqual(mediaAt(59, 60, 3, 5), { seconds: 2 / 30, active: false });
  assert.deepEqual(mediaAt(60, 60, 3, 5), { seconds: 3 / 30, active: true });
  assert.deepEqual(audioSchedule(0, 60, 3, 5, 10), { when: 12, offset: .1, duration: 4.9 });
  assert.deepEqual(audioSchedule(90, 60, 3, 5, 10), { when: 10, offset: 1.1, duration: 3.9 });
  assert.equal(audioSchedule(220, 60, 3, 5, 10), null);
  assert.equal(timelineLength(4, 60, { audio_start_frame: 60, audio_source_frame: 3, motion_start_frame: 20, motion_source_frame: 0 }), 1850);
  assert.equal(clampFrame(-3), 0);
  assert.equal(clampFrame(1.7), 2);
});

test('waveform peaks summarize decoded PCM without changing source samples', () => {
  const samples = Float32Array.from([0, .25, -.8, .1, 0, -.4, .2, 0]);
  assert.deepEqual(waveformPeaks(samples, 4).map(x => +x.toFixed(2)), [.25, .8, .4, .2]);
  assert.equal(samples[2], Math.fround(-.8));
});
