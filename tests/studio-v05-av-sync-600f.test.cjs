'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');
const frameCount = Number(process.env.BAI_SYNC_FRAMES || 600);
assert.ok(Number.isInteger(frameCount) && frameCount >= 600 && frameCount <= 13800 && frameCount % 10 === 0);

async function json(response, status = 200) {
  const body = await response.text();
  assert.equal(response.status, status, body);
  return JSON.parse(body);
}
function ffmpeg(args, input) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args],
    { input, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr.toString());
  return run.stdout;
}
function makeSource(dataDir) {
  const raw = path.join(dataDir, 'sync-rgb.raw');
  const wave = path.join(dataDir, 'sync-tone.wav');
  const mp4 = path.join(dataDir, 'sync-source.mp4');
  const rgb = Buffer.alloc(frameCount * 16 * 16 * 3);
  for (let frame = 0; frame < frameCount; frame += 10)
    rgb.fill(255, frame * 16 * 16 * 3, (frame + 1) * 16 * 16 * 3);
  fs.writeFileSync(raw, rgb);
  const samples = frameCount * 800;
  const pcm = Buffer.alloc(samples * 2);
  for (let frame = 0; frame < frameCount; frame += 10) {
    for (let offset = 160; offset < 640; offset++) {
      const value = Math.round(12000 * Math.sin(2 * Math.PI * 1000 * offset / 48000));
      pcm.writeInt16LE(value, (frame * 800 + offset) * 2);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(96000, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(wave, Buffer.concat([header, pcm]));
  ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '16x16', '-r', '60', '-i', raw,
    '-i', wave, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-crf', '0',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', String(frameCount / 60), '-y', mp4]);
  return fs.readFileSync(mp4);
}
async function waitJob(base, id) {
  let job;
  const deadline = Date.now() + Math.max(300000, frameCount * 80);
  do {
    await new Promise(resolve => setTimeout(resolve, 700));
    job = await json(await fetch(`${base}/api/studio/v05/render/jobs?id=${id}`));
  } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
  assert.equal(job.status, 'succeeded', job.error);
  return job;
}

test(`${frameCount}F video with embedded pulses keeps decoded sound within one frame of every flash in 3D MP4`, async () => {
  const server = await harness.startServer({ port: 8993 });
  try {
    const source = makeSource(server.dataDir);
    const video = await json(await fetch(`${server.base}/api/library-assets/upload?kind=video&name=sync.mp4`,
      { method: 'POST', body: source }));
    const glb = await json(await fetch(`${server.base}/api/library-assets/upload?kind=stage&name=sync-prop.glb`,
      { method: 'POST', body: fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb')) }));
    const project = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '音画同期隔離検査', kind: 'empty' }),
    }));
    const id = project.project.id;
    const placed = await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: video.item.id,
        track: 'video', start: 0, duration: frameCount / 60, revision: 0 }),
    }));
    const scene = await json(await fetch(`${server.base}/api/studio/v05/scene/instances`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, action: 'add', revision: 0, asset_id: glb.item.id,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    }));
    const range = await json(await fetch(`${server.base}/api/studio/v05/timeline/range`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, revision: 0, arrangement_revision: placed.revision,
        in_frame: 0, out_frame: frameCount - 1 }),
    }));
    assert.equal(range.frame_count, frameCount);
    const started = await json(await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, arrangement_revision: placed.revision,
        scene_revision: scene.revision, range_revision: range.revision, resolution: '720p' }),
    }), 202);
    const completed = await waitJob(server.base, started.id);
    assert.equal(completed.probe.frames, frameCount);
    assert.equal(completed.scene_capture.frames, frameCount);
    const sourceSha = crypto.createHash('sha256').update(source).digest('hex');
    assert.ok(completed.inputs.some(input => input.asset_id === video.item.id && input.sha256 === sourceSha));
    const mp4 = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
    const frameBytes = ffmpeg(['-i', 'pipe:0', '-map', '0:v:0', '-vf', 'crop=8:8:400:20',
      '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], mp4);
    assert.equal(frameBytes.length, frameCount * 8 * 8 * 3);
    const sampleBytes = ffmpeg(['-i', 'pipe:0', '-map', '0:a:0', '-ac', '1', '-ar', '48000',
      '-f', 's16le', 'pipe:1'], mp4);
    assert.ok(sampleBytes.length >= frameCount * 800 * 2);
    const visual = [];
    const energy = [];
    for (let frame = 0; frame < frameCount; frame++) {
      let sum = 0;
      const base = frame * 8 * 8 * 3;
      for (let i = 0; i < 8 * 8 * 3; i++) sum += frameBytes[base + i];
      visual.push(sum / (8 * 8 * 3));
      let square = 0;
      for (let i = frame * 800; i < (frame + 1) * 800; i++) {
        const value = sampleBytes.readInt16LE(i * 2); square += value * value;
      }
      energy.push(Math.sqrt(square / 800));
    }
    assert.ok(visual[0] > 180 && visual[1] < 70, 'F0 flash must appear in the first video frame');
    const firstPeak = [0, 1, 2].reduce((best, candidate) => energy[candidate] > energy[best] ? candidate : best, 0);
    assert.ok(firstPeak <= 1 && energy[firstPeak] > 200, `F0 audio peak at F${firstPeak}`);
    let maxOffset = firstPeak;
    for (let frame = 10; frame <= frameCount - 10; frame += 10) {
      assert.ok(visual[frame] > 180, `F${frame}: source flash missing (${visual[frame]})`);
      assert.ok(visual[frame - 1] < 70 && visual[frame + 1] < 70,
        `F${frame}: flash spread across adjacent video frames`);
      const nearby = [frame - 2, frame - 1, frame, frame + 1, frame + 2];
      const peak = nearby.reduce((best, candidate) => energy[candidate] > energy[best] ? candidate : best, nearby[0]);
      maxOffset = Math.max(maxOffset, Math.abs(peak - frame));
      assert.ok(Math.abs(peak - frame) <= 1 && energy[peak] > 200,
        `F${frame}: audio peak F${peak} (${energy[peak].toFixed(1)}) differs by more than 1F`);
    }
    assert.ok(maxOffset <= 1);
    console.log(JSON.stringify({ frames: frameCount, events: frameCount / 10, maxOffsetFrames: maxOffset }));
  } finally { await server.stop(); }
});
