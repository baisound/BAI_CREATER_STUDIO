'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');
const frameCount = 1200;
const startFrame = 60;
const pulseFrames = Array.from({ length: 15 }, (_, i) => 105 + i * 60);
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
function markerGlb() {
  const original = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'));
  const jsonLength = original.readUInt32LE(12);
  const doc = JSON.parse(original.toString('utf8', 20, 20 + jsonLength));
  const oldBin = original.subarray(28 + jsonLength);
  const times = [0], values = [10, 1, 0];
  for (let i = 0; i < 15; i++) {
    times.push(0.5 + i, 0.55 + i); values.push(0, 1, 0, 10, 1, 0);
  }
  times.push(15.1); values.push(10, 1, 0);
  const tb = Buffer.alloc(times.length * 4), vb = Buffer.alloc(values.length * 4);
  times.forEach((x, i) => tb.writeFloatLE(x, i * 4)); values.forEach((x, i) => vb.writeFloatLE(x, i * 4));
  const view = doc.bufferViews.length, accessor = doc.accessors.length;
  doc.bufferViews.push({ buffer: 0, byteOffset: oldBin.length, byteLength: tb.length },
    { buffer: 0, byteOffset: oldBin.length + tb.length, byteLength: vb.length });
  doc.accessors.push({ bufferView: view, componentType: 5126, count: times.length, type: 'SCALAR', min: [0], max: [15.1] },
    { bufferView: view + 1, componentType: 5126, count: times.length, type: 'VEC3' });
  doc.nodes[0].translation = [10, 1, 0];
  doc.nodes[0].children.push(11, 13);
  doc.nodes.push({ name: 'leftUpperLeg', children: [12] }, { name: 'leftLowerLeg' },
    { name: 'rightUpperLeg', children: [14] }, { name: 'rightLowerLeg' });
  doc.skins[0].joints.push(11, 12, 13, 14);
  const identities = Buffer.alloc(4 * 64);
  for (let matrix = 0; matrix < 4; matrix++) for (let axis = 0; axis < 4; axis++) identities.writeFloatLE(1, matrix * 64 + axis * 20);
  const ibm = Buffer.concat([oldBin.subarray(328, 968), identities]);
  doc.bufferViews.push({ buffer: 0, byteOffset: oldBin.length + tb.length + vb.length, byteLength: ibm.length });
  doc.accessors.push({ bufferView: view + 2, componentType: 5126, count: 14, type: 'MAT4' });
  doc.skins[0].inverseBindMatrices = accessor + 2;
  doc.animations = [{ name: 'clock', samplers: [{ input: accessor, output: accessor + 1, interpolation: 'STEP' }],
    channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }];
  doc.extensionsUsed = ['KHR_materials_unlit']; doc.materials[0].extensions = { KHR_materials_unlit: {} };
  const bin = Buffer.concat([oldBin, tb, vb, ibm]); doc.buffers[0].byteLength = bin.length;
  let jb = Buffer.from(JSON.stringify(doc)); jb = Buffer.concat([jb, Buffer.alloc((4 - jb.length % 4) % 4, 32)]);
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length); h.write(type, 4); return Buffer.concat([h, data]); };
  const h = Buffer.alloc(12); h.write('glTF'); h.writeUInt32LE(2, 4); h.writeUInt32LE(28 + jb.length + bin.length, 8);
  return Buffer.concat([h, chunk('JSON', jb), chunk('BIN\0', bin)]);
}
function makeSource(dataDir) {
  const pcm = Buffer.alloc(frameCount * 800 * 2);
  for (const frame of pulseFrames) for (let offset = 0; offset < 2400; offset++)
    pcm.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * 1000 * offset / 48000)), (frame * 800 + offset) * 2);
  const wave = path.join(dataDir, 'moving-clock.wav');
  ffmpeg(['-f', 's16le', '-ar', '48000', '-ac', '1', '-i', 'pipe:0', '-y', wave], pcm);
  return fs.readFileSync(wave);
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

test('moving GLB and independent audio keep the shared clock across nonzero motion start and In', async () => {
  const glb = markerGlb();
  const modelFile = 'aaaaaaaaaaaaaaaaaaaa.glb', motionFile = 'bbbbbbbbbbbbbbbbbbbb.glb';
  const server = await harness.startServer({ port: 8995, seed: {
    [`integrated_v02/assets/${modelFile}`]: glb, [`integrated_v02/assets/${motionFile}`]: glb,
    'integrated_v02/user_assets.json': JSON.stringify([{ id: 'clock-model', name: 'clock-model.glb', filename: modelFile, kind: 'model', bytes: glb.length },
      { id: 'clock-motion', name: 'clock-motion.glb', filename: motionFile, kind: 'motion', bytes: glb.length }]),
  } });
  try {
    const source = makeSource(server.dataDir);
    const audio = await json(await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=moving-clock.wav`,
      { method: 'POST', body: source }));
    const project = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '音画同期隔離検査', kind: 'empty' }),
    }));
    const id = project.project.id;
    const placed = await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: audio.item.id,
        track: 'audio', start: 0, duration: frameCount / 60, revision: 0 }),
    }));
    let scene = await json(await fetch(`${server.base}/api/studio/v05/scene/instances`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, action: 'add', revision: 0, asset_id: `integrated:${modelFile}`,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    }));
    scene = await json(await fetch(`${server.base}/api/studio/v05/scene/instances`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, action: 'camera', revision: scene.revision, camera: { position: [0, 1, 4], target: [0, 1, 0], fov: 40 } }) }));
    const motion = await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: `integrated:${motionFile}`, track: 'motion', start: 1.25, duration: 15.1, revision: placed.revision }) }));
    const assigned = await json(await fetch(`${server.base}/api/studio/v05/scene/motion-target`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, clip_id: motion.clip.id, instance_id: scene.instances[0].id, revision: motion.revision }) }));
    const browser = await server.launchBrowser();
    try {
      const page = await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html?scene_capture=1`);
      await page.locator('#v06project').selectOption(id);
      await page.waitForFunction(() => window.BAIStudioMultiScenePreview);
      await page.evaluate(() => window.BAIStudioMultiScenePreview.open({ composite: true }));
      const state = await page.evaluate(() => window.BAIStudioMultiScenePreview.status());
      assert.deepEqual(state.motion.issues, []);
      assert.equal(state.motion.loadedClips.length, 1);
      const positions = [];
      for (const frame of [103, 105, 110]) {
        positions.push(await page.evaluate(({ frame, id }) => {
          window.BAIStudioMultiScenePreview.captureFrame(frame, 60, 1280, 720);
          return window.BAIStudioMultiScenePreview.poseProbe(id, ['hips']).bones.hips.position[0];
        }, { frame, id: scene.instances[0].id }));
      }
      assert.ok(Math.abs(positions[0] - positions[1]) > 1);
      assert.ok(Math.abs(positions[0] - positions[2]) < 1e-6);
    } finally { await browser.close(); }
    const range = await json(await fetch(`${server.base}/api/studio/v05/timeline/range`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, revision: 0, arrangement_revision: assigned.revision,
        in_frame: startFrame, out_frame: frameCount - 1 }),
    }));
    assert.equal(range.frame_count, frameCount - startFrame);
    const started = await json(await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, arrangement_revision: assigned.revision,
        scene_revision: scene.revision, range_revision: range.revision, resolution: '720p' }),
    }), 202);
    const completed = await waitJob(server.base, started.id);
    assert.equal(completed.probe.frames, frameCount - startFrame);
    assert.equal(completed.scene_capture.frames, frameCount - startFrame);
    const sourceSha = crypto.createHash('sha256').update(source).digest('hex');
    assert.ok(completed.inputs.some(input => input.asset_id === audio.item.id && input.sha256 === sourceSha));
    const mp4 = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
    const frameBytes = ffmpeg(['-i', 'pipe:0', '-map', '0:v:0', '-vf', 'crop=8:8:636:356',
      '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], mp4);
    assert.equal(frameBytes.length, (frameCount - startFrame) * 8 * 8 * 3);
    const sampleBytes = ffmpeg(['-i', 'pipe:0', '-map', '0:a:0', '-ac', '1', '-ar', '48000',
      '-f', 's16le', 'pipe:1'], mp4);
    assert.ok(sampleBytes.length >= (frameCount - startFrame) * 800 * 2);
    const visual = [];
    const energy = [];
    for (let frame = 0; frame < frameCount - startFrame; frame++) {
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
    const results = [];
    for (const projectFrame of pulseFrames) {
      const f = projectFrame - startFrame;
      const nearby = [f - 1, f, f + 1, f + 2, f + 3, f + 4];
      assert.ok(energy[f - 2] < 100 && energy[f + 5] < 100, `audio pulse spread outside event F${projectFrame}`);
      const light = nearby.find(x => visual[x] < 70), sound = nearby.find(x => energy[x] > 1000);
      assert.ok(Number.isInteger(light) && Number.isInteger(sound), JSON.stringify({ projectFrame, visual: nearby.map(x => visual[x]), energy: nearby.map(x => energy[x]) }));
      assert.ok(visual[f - 2] > 180 && visual[f + 5] > 180, JSON.stringify({ projectFrame, before: visual[f - 2], after: visual[f + 5], nearby: nearby.map(x => visual[x]) }));
      assert.ok(Math.abs(light - f) <= 1 && Math.abs(sound - f) <= 1 && Math.abs(light - sound) <= 1,
        JSON.stringify({ projectFrame, light, sound, expected: f }));
      results.push({ projectFrame, videoOffset: light - f, audioOffset: sound - f });
    }
    assert.equal(completed.scene_capture.motion_clips, 1);
    console.log(JSON.stringify({ frames: completed.probe.frames, results }));
  } finally { await server.stop(); }
});
