'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');

const frameCount = Number(process.env.BAI_REAL_RENDER_FRAMES || 600);
assert.ok(Number.isInteger(frameCount) && frameCount >= 600 && frameCount <= 13800);
const seconds = frameCount / 60;
const sampleFrames = [0, Math.floor(frameCount / 2), frameCount - 1];
const stageCamera = process.env.BAI_REAL_STAGE_CAMERA === '1';
const expectedLoaded = stageCamera ? 2 : 1;
const root = process.env.BAI_REAL_MMD_DATA;
const motionPath = process.env.BAI_REAL_LIP_VMD;
const modelName = 'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const audioId = 'library:fd895f1ca8efd8b2bfbe0f43';
const modelPath = root && path.join(root, 'mmd', 'A', modelName);
const audioIndexPath = root && path.join(root, 'library_assets', 'index.json');
const mmdIndexPath = root && path.join(root, 'mmd_assets.json');
const available = Boolean(modelPath && motionPath && audioIndexPath && mmdIndexPath &&
  [modelPath, motionPath, audioIndexPath, mmdIndexPath].every(file => fs.existsSync(file)));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = file => sha(fs.readFileSync(file));
const post = (server, route, body) => fetch(server.base + route, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function json(response, status = 200) {
  const body = await response.text();
  assert.equal(response.status, status, body);
  return JSON.parse(body);
}
async function waitJob(base, id) {
  const deadline = Date.now() + 1200000;
  let job, phase;
  do {
    await new Promise(resolve => setTimeout(resolve, 1000));
    job = await json(await fetch(`${base}/api/studio/v05/render/jobs?id=${id}`));
    if (job.phase !== phase) { phase = job.phase; console.log(JSON.stringify({ phase, status: job.status })); }
  } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
  assert.equal(job.status, 'succeeded', JSON.stringify({ phase: job.phase, error: job.error }));
  return job;
}
function ffmpeg(input, args, maxBuffer = 1024 * 1024) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...args],
    { input, maxBuffer });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}
function frameSamples(mp4) {
  const raw = ffmpeg(mp4, ['-vf', `select=${sampleFrames.map(frame => `eq(n\\,${frame})`).join('+')},scale=160:90`,
    '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
  const frameSize = 160 * 90 * 3;
  assert.equal(raw.length, frameSize * 3);
  return [0, 1, 2].map(index => raw.subarray(index * frameSize, (index + 1) * frameSize));
}
function changedPixels(a, b) {
  let count = 0;
  for (let i = 0; i < a.length; i += 3)
    if (Math.max(...[0, 1, 2].map(channel => Math.abs(a[i + channel] - b[i + channel]))) > 24) count++;
  return count;
}
function audioPcm(bytes) {
  return ffmpeg(bytes, ['-t', String(seconds), '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], 4 * 1024 * 1024);
}
function audioLag(source, rendered, second) {
  const start = Math.round(second * 8000);
  const window = 2400;
  const limit = 400;
  let best = { lag: 0, correlation: -Infinity };
  for (let lag = -limit; lag <= limit; lag += 2) {
    let dot = 0, sourceEnergy = 0, outputEnergy = 0;
    for (let offset = 0; offset < window; offset += 4) {
      const a = source.readInt16LE((start + offset) * 2);
      const b = rendered.readInt16LE((start + offset + lag) * 2);
      dot += a * b; sourceEnergy += a * a; outputEnergy += b * b;
    }
    const correlation = dot / Math.sqrt(sourceEnergy * outputEnergy || 1);
    if (correlation > best.correlation) best = { lag, correlation };
  }
  return best;
}
function poseDelta(a, b) {
  return Math.max(...a.quaternion.map((value, index) => Math.abs(value - b.quaternion[index])),
    ...a.position.map((value, index) => Math.abs(value - b.position[index])));
}

test(`real PMX/VMD and registered song WAV render all ${frameCount} frames with aligned audio`,
  { skip: !available && 'BAI_REAL_MMD_DATA と BAI_REAL_LIP_VMD が必要', timeout: 1200000 }, async () => {
    const audioIndex = JSON.parse(fs.readFileSync(audioIndexPath, 'utf8'));
    const audioEntry = audioIndex.items.find(row => row.id === audioId);
    assert.ok(audioEntry && audioEntry.kind === 'audio' && audioEntry.format === 'WAV');
    const audioPath = path.join(root, 'library_assets', 'files', audioEntry.filename);
    assert.ok(fs.existsSync(audioPath));
    const before = { model: digest(modelPath), motion: digest(motionPath), audio: digest(audioPath),
      audioIndex: digest(audioIndexPath), mmdIndex: digest(mmdIndexPath) };
    assert.equal(before.audio, audioEntry.sha256);
    const stageEntry = stageCamera && audioIndex.items.find(row => row.id === 'library:c8b7aa49c924c0b00b5d3ecc');
    assert.ok(!stageCamera || stageEntry);
    const stagePath = stageEntry && path.join(root, 'library_assets', 'files', stageEntry.filename);
    if (stagePath) { before.stage = digest(stagePath); assert.equal(before.stage, stageEntry.sha256); }
    const motionName = path.basename(motionPath);
    const mmdIndex = JSON.parse(fs.readFileSync(mmdIndexPath, 'utf8'));
    const entries = mmdIndex.A.filter(row => row.name === modelName || row.name.startsWith('tex/'));
    assert.ok(entries.length > 1);
    const seed = {
      'mmd_assets.json': JSON.stringify({ A: entries, B: [],
        vmd: [{ name: motionName, size: fs.statSync(motionPath).size }] }),
      'library_assets/index.json': JSON.stringify({ schema: 1, items: [audioEntry, ...(stageEntry ? [stageEntry] : [])] }),
      [`library_assets/files/${audioEntry.filename}`]: fs.readFileSync(audioPath),
      [`mmd/vmd/${motionName}`]: fs.readFileSync(motionPath),
    };
    for (const row of entries) {
      const file = path.join(root, 'mmd', 'A', ...row.name.split('/'));
      assert.ok(fs.existsSync(file), `missing texture: ${row.name}`);
      seed[`mmd/A/${row.name}`] = fs.readFileSync(file);
    }
    if (stageEntry) seed[`library_assets/files/${stageEntry.filename}`] = fs.readFileSync(stagePath);
    const server = await harness.startServer({ port: 8996, seed });
    let browser, page;
    try {
      const project = await json(await post(server, '/api/studio/v05/projects',
        { name: `実曲${frameCount}F隔離確認`, kind: 'empty' }));
      const id = project.project.id;
      let scene = await json(await post(server, '/api/studio/v05/scene/instances', {
        project_id: id, action: 'add', revision: 0, asset_id: `mmd:A:${modelName}`,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      }));
      const modelId = scene.instances[0].id;
      const camera = { position: [4.5, 3.2, 6.5], target: [1.5, 1, -2], fov: 38 };
      const stageTransform = { position: [3, 0, -4], rotation: [0, 35, 0], scale: [0.5, 0.5, 0.5] };
      if (stageEntry) {
        scene = await json(await post(server, '/api/studio/v05/scene/instances', { project_id: id,
          action: 'add', revision: scene.revision, asset_id: stageEntry.id, transform: stageTransform }));
        scene = await json(await post(server, '/api/studio/v05/scene/instances', { project_id: id,
          action: 'camera', revision: scene.revision, camera }));
      }
      const motion = await json(await post(server, '/api/studio/v05/arrangement/place', {
        project_id: id, asset_id: `mmd:vmd:${motionName}`, track: 'motion',
        start: 0, duration: 230, revision: 0,
      }));
      const audio = await json(await post(server, '/api/studio/v05/arrangement/place', {
        project_id: id, asset_id: audioId, track: 'audio', start: 0,
        duration: seconds, revision: motion.revision,
      }));
      const assigned = await json(await post(server, '/api/studio/v05/scene/motion-target', {
        project_id: id, clip_id: motion.clip.id, revision: audio.revision,
        instance_id: modelId,
      }));
      const saved = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
      assert.equal(saved.revision, assigned.revision);
      assert.equal(saved.clips.length, 2);
      assert.equal(saved.clips.find(row => row.id === motion.clip.id).target_scene_instance_id,
        modelId);
      browser = stageCamera && process.env.BAI_REAL_GPU === '1'
        ? await require('playwright').chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
        : await server.launchBrowser();
      page = await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html${stageCamera ? '?scene_capture=1' : ''}`);
      await page.locator('#v06project').selectOption(id);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(count => window.BAIStudioMultiScenePreview?.status().loaded === count &&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length === 1 &&
        window.BAIStudioMediaPreviewV68?.status().mediaCount === 1, expectedLoaded, { timeout: 180000 });
      await page.waitForFunction(() => document.querySelector('#v68layers audio')?.readyState >= 1,
      null, { timeout: 180000 });
      const bones = ['センター', '上半身', '頭', '右腕', '左腕'];
      const preview = [], referenceFrames = [];
      for (const frame of sampleFrames) {
        await page.evaluate(target => window.BAIStudioMediaPreviewV68.seek(target), frame);
        await page.waitForFunction(target => Math.abs(
          document.querySelector('#v68layers audio')?.currentTime - target / 60) < 0.15,
        frame, { timeout: 15000 });
        await page.waitForTimeout(200);
        const pose = await page.evaluate(([instanceId, names]) =>
          window.BAIStudioMultiScenePreview.poseProbe(instanceId, names),
        [modelId, bones]);
        const audioTime = await page.locator('#v68layers audio').first().evaluate(element => element.currentTime);
        assert.ok(Math.abs(audioTime - frame / 60) < 0.15, `preview audio F${frame}: ${audioTime}`);
        preview.push({ frame, pose, audioTime });
        if (stageCamera) {
          const data = await page.evaluate(frame => window.BAIStudioMultiScenePreview.captureFrame(frame, 60, 1280, 720), frame);
          const png = Buffer.from(data.split(',')[1], 'base64');
          referenceFrames.push(ffmpeg(png, ['-frames:v', '1', '-vf', 'scale=160:90', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']));
          const probe = await page.evaluate(id => window.BAIStudioMultiScenePreview.frameProbe(id), modelId);
          assert.equal(probe.cameraSaved, true); assert.ok(probe.camera.every((x, i) => Math.abs(x - camera.position[i]) < 1e-9));
        }
      }
      assert.ok(bones.some(name => preview[0].pose.bones[name] && preview[1].pose.bones[name] &&
        poseDelta(preview[0].pose.bones[name], preview[1].pose.bones[name]) > 1e-3),
      '実VMDの中間姿勢が変化しません');
      await page.reload();
      await page.locator('#v06project').selectOption(id);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(count => window.BAIStudioMultiScenePreview?.status().loaded === count &&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length === 1,
      expectedLoaded, { timeout: 180000 });
      const restored = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
      assert.deepEqual(restored.clips, saved.clips);
      if (stageCamera) {
        const restoredScene = await json(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${id}`));
        assert.deepEqual(restoredScene.camera, camera);
        assert.deepEqual(restoredScene.instances.find(x => x.asset_id === stageEntry.id).transform, stageTransform);
      }
      harness.assertNoErrors(page);
      await page.close(); await browser.close(); page = browser = null;
      const range = await json(await post(server, '/api/studio/v05/timeline/range', {
        project_id: id, revision: 0, arrangement_revision: assigned.revision,
        in_frame: 0, out_frame: frameCount - 1,
      }));
      assert.equal(range.frame_count, frameCount);
      const started = await json(await post(server, '/api/studio/v05/render/jobs', {
        project_id: id, arrangement_revision: assigned.revision,
        range_revision: range.revision, scene_revision: scene.revision, resolution: '720p',
      }), 202);
      const job = await waitJob(server.base, started.id);
      assert.equal(job.probe.frames, frameCount);
      assert.equal(job.probe.video_codec, 'h264');
      assert.equal(job.probe.audio_codec, 'aac');
      assert.equal(job.scene_capture.frames, frameCount);
      assert.equal(job.scene_capture.motion_clips, 1);
      for (const [assetId, expected] of [[`mmd:A:${modelName}`, before.model],
        [`mmd:vmd:${motionName}`, before.motion], [audioId, before.audio]])
        assert.ok(job.inputs.some(input => input.asset_id === assetId && input.sha256 === expected), assetId);
      const mp4 = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
      const frames = frameSamples(mp4);
      const previewErrors = referenceFrames.map((ref, n) => ref.reduce((sum, x, i) => sum + Math.abs(x - frames[n][i]), 0) / ref.length);
      assert.ok(previewErrors.every(x => x < 1), `saved scene preview/MP4 mismatch: ${previewErrors}`);
      if (stageEntry) assert.ok(job.inputs.some(x => x.asset_id === stageEntry.id && x.sha256 === before.stage));
      const differences = [changedPixels(frames[0], frames[1]), changedPixels(frames[1], frames[2])];
      if (stageCamera) {
        const expectedDifferences = [changedPixels(referenceFrames[0], referenceFrames[1]), changedPixels(referenceFrames[1], referenceFrames[2])];
        assert.ok(expectedDifferences.every(x => x > 50), `reference motion is not visible: ${expectedDifferences}`);
        assert.ok(differences.every((x, i) => x >= expectedDifferences[i] * 0.75),
          `output lost reference motion pixels: ${differences} vs ${expectedDifferences}`);
      } else assert.ok(differences.every(value => value > 200), `motion frames are unchanged: ${differences}`);
      const sourcePcm = audioPcm(fs.readFileSync(audioPath));
      const renderedPcm = audioPcm(mp4);
      assert.ok(sourcePcm.length >= seconds * 8000 * 2 && renderedPcm.length >= seconds * 8000 * 2);
      const lags = [1, seconds / 2, seconds - 1].map(second => ({ second, ...audioLag(sourcePcm, renderedPcm, second) }));
      assert.ok(lags.every(row => row.correlation > 0.75 && Math.abs(row.lag) <= 8000 / 60),
        `実曲の音声時刻が1Fを超えてずれています: ${JSON.stringify(lags)}`);
      assert.equal(fs.existsSync(path.join(server.dataDir, 'studio_v05_media_renders', 'jobs',
        `${started.id}.frames`)), false);
      console.log(JSON.stringify({ frames: job.probe.frames, renderer: job.scene_capture.renderer,
        preview: preview.map(row => ({ frame: row.frame, audioTime: row.audioTime })),
        stageCamera, previewErrors, differences, audioLags: lags, outputBytes: mp4.length,
        inputHashes: { model: before.model, motion: before.motion, audio: before.audio } }));
    } finally {
      await page?.close(); await browser?.close();
      await server.stop();
      if (stagePath) assert.equal(digest(stagePath), before.stage, 'stage source changed');
      assert.equal(digest(modelPath), before.model, 'PMX source changed');
      assert.equal(digest(motionPath), before.motion, 'VMD source changed');
      assert.equal(digest(audioPath), before.audio, 'WAV source changed');
      assert.equal(digest(audioIndexPath), before.audioIndex, 'audio index changed');
      assert.equal(digest(mmdIndexPath), before.mmdIndex, 'MMD index changed');
    }
  });
