'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');

const sourceRoot = process.env.BAI_REAL_MMD_DATA;
const modelName = 'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motionName = 'キラメキのシンフォニー1005.vmd';
const songFilename = 'c8506bc68749956b12713631127d22771d8212de99f1e189296ee1c528a39809.wav';
const songId = 'library:c753fcabd67797f28ddd4b22';
const paths = sourceRoot && {
  model: path.join(sourceRoot, 'mmd', 'A', modelName),
  motion: path.join(sourceRoot, 'mmd', 'vmd', motionName),
  song: path.join(sourceRoot, 'library_assets', 'files', songFilename),
  mmdIndex: path.join(sourceRoot, 'mmd_assets.json'),
  libraryIndex: path.join(sourceRoot, 'library_assets', 'index.json'),
};
const available = paths && Object.values(paths).every(file => fs.existsSync(file));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const hashFile = file => hash(fs.readFileSync(file));
async function json(response, status = 200) {
  const body = await response.text();
  assert.equal(response.status, status, body);
  return JSON.parse(body);
}
function decode(mp4, args) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...args],
    { input: mp4, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr.toString());
  return run.stdout;
}
function rms(pcm) {
  let energy = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) energy += pcm.readInt16LE(i) ** 2;
  return Math.sqrt(energy / Math.max(1, pcm.length / 2));
}
function poseDelta(a, b) {
  return Math.max(...a.quaternion.map((value, i) => Math.abs(value - b.quaternion[i])),
    ...a.position.map((value, i) => Math.abs(value - b.position[i])));
}

test('one saved project joins existing PMX/VMD/WAV with a new image through preview and MP4',
  { skip: !available && 'BAI_REAL_MMD_DATA に実PMX/VMD/登録WAVがありません', timeout: 300000 }, async () => {
    const before = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, hashFile(file)]));
    const mmdIndex = JSON.parse(fs.readFileSync(paths.mmdIndex, 'utf8'));
    const modelEntries = mmdIndex.A.filter(row => row.name === modelName || row.name.startsWith('tex/'));
    assert.ok(modelEntries.some(row => row.name === modelName));
    const songEntry = JSON.parse(fs.readFileSync(paths.libraryIndex, 'utf8')).items.find(row => row.id === songId);
    assert.equal(songEntry.filename, songFilename);
    assert.equal(songEntry.sha256, before.song);
    const seed = {
      'mmd_assets.json': JSON.stringify({ A: modelEntries, B: [], vmd: [{ name: motionName, size: fs.statSync(paths.motion).size }] }),
      'library_assets/index.json': JSON.stringify({ schema: 1, items: [songEntry] }),
      [`library_assets/files/${songFilename}`]: fs.readFileSync(paths.song),
      [`mmd/vmd/${motionName}`]: fs.readFileSync(paths.motion),
    };
    for (const row of modelEntries) {
      const file = path.join(sourceRoot, 'mmd', 'A', ...row.name.split('/'));
      assert.ok(fs.existsSync(file), row.name);
      seed[`mmd/A/${row.name}`] = fs.readFileSync(file);
    }
    const server = await harness.startServer({ port: 8919, seed });
    let browser, page;
    try {
      const imagePath = path.join(__dirname, '..', 'studio', 'v05', 'assets', 'render-sakura.webp');
      const imageBytes = fs.readFileSync(imagePath);
      const imageBefore = hash(imageBytes);
      const image = await json(await fetch(`${server.base}/api/library-assets/upload?kind=image&name=vertical-new.webp`,
        { method: 'POST', body: imageBytes }));
      assert.ok(image.item.id);
      const project = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '同一作品縦断実証', kind: 'empty' }),
      }));
      const id = project.project.id;
      const scene = await json(await fetch(`${server.base}/api/studio/v05/scene/instances`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id, action: 'add', revision: 0,
          asset_id: `mmd:A:${modelName}`,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
      }));
      const instanceId = scene.instances[0].id;
      let revision = 0;
      const place = async (assetId, track, start, duration) => {
        const placed = await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: id, asset_id: assetId, track, start, duration, revision }),
        }));
        revision = placed.revision;
        return placed.clip;
      };
      const imageClip = await place(image.item.id, 'image', 0, 6);
      const audioClip = await place(songId, 'audio', 0, 6);
      const motionClip = await place(`mmd:vmd:${motionName}`, 'motion', 0, 184.5);
      const assigned = await json(await fetch(`${server.base}/api/studio/v05/scene/motion-target`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id, clip_id: motionClip.id, revision, instance_id: instanceId }),
      }));
      revision = assigned.revision;
      const saved = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
      assert.equal(saved.revision, revision);
      assert.deepEqual(saved.clips.map(clip => clip.id).sort(), [imageClip.id, audioClip.id, motionClip.id].sort());
      assert.equal(saved.clips.find(clip => clip.id === motionClip.id).target_scene_instance_id, instanceId);
      browser = await server.launchBrowser();
      page = await server.newPage(browser, { expectErrors: [/unknown char code \d+\./] });
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.getByRole('button', { name: '制作', exact: true }).click();
      await page.locator('#v06project').selectOption(id);
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(projectId => window.BAIStudioMediaPreviewV68?.status().projectId === projectId &&
        window.BAIStudioMediaPreviewV68.status().mediaCount === 2 &&
        window.BAIStudioMultiScenePreview?.status().loaded === 1 &&
        window.BAIStudioMultiScenePreview.status().motion?.loadedClips.length === 1,
      id, { timeout: 180000 });
      const samples = [];
      for (const seconds of [0, 2, 4]) {
        await page.evaluate(frame => window.BAIStudioMediaPreviewV68.seek(frame), seconds * 60);
        await page.waitForFunction(frame => window.BAIStudioMediaPreviewV68.status().frame === frame,
          seconds * 60);
        await page.waitForTimeout(250);
        samples.push({ seconds,
          pose: await page.evaluate(target => window.BAIStudioMultiScenePreview.poseProbe(target, ['センター', '上半身', '頭', '右腕', '左腕']), instanceId),
          frame: await page.evaluate(target => window.BAIStudioMultiScenePreview.frameProbe(target), instanceId),
          media: await page.evaluate(() => window.BAIStudioMediaPreviewV68.status()),
          imageVisible: await page.locator('#v68layers img').first().isVisible(),
          audio: await page.locator('#v68layers audio').first().evaluate(element =>
            ({ readyState: element.readyState, currentTime: element.currentTime })),
        });
      }
      assert.ok(samples.every(sample => sample.imageVisible && sample.frame.renderer.length > 0));
      assert.ok(samples.every(sample => sample.media.projectId === id));
      assert.ok(samples.every(sample => sample.audio.readyState >= 1 &&
        Math.abs(sample.audio.currentTime - sample.seconds) < 0.15), '音声のプレビュー時刻が作品時刻と一致しません');
      const bones = ['センター', '上半身', '頭', '右腕', '左腕'];
      assert.ok(bones.some(name => samples[0].pose.bones[name] && samples[1].pose.bones[name] &&
        poseDelta(samples[0].pose.bones[name], samples[1].pose.bones[name]) > 1e-3), 'VMD姿勢が変化しません');
      await page.reload();
      await page.getByRole('button', { name: '制作', exact: true }).click();
      await page.locator('#v06project').selectOption(id);
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(() => window.BAIStudioMultiScenePreview?.status().loaded === 1 &&
        window.BAIStudioMultiScenePreview.status().motion?.loadedClips.length === 1,
      null, { timeout: 180000 });
      const reloaded = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
      assert.deepEqual(reloaded.clips, saved.clips);
      assert.equal((await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).projectId, id);
      const range = await json(await fetch(`${server.base}/api/studio/v05/timeline/range`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id, revision: 0, arrangement_revision: revision,
          in_frame: 120, out_frame: 122 }),
      }));
      const started = await json(await fetch(`${server.base}/api/studio/v05/render/jobs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id, arrangement_revision: revision,
          range_revision: range.revision, scene_revision: scene.revision, resolution: '720p' }),
      }), 202);
      let job;
      const deadline = Date.now() + 180000;
      do {
        await new Promise(resolve => setTimeout(resolve, 500));
        job = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${started.id}`));
      } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
      assert.equal(job.status, 'succeeded', job.error);
      assert.equal(job.probe.frames, 3);
      assert.equal(job.probe.video_codec, 'h264');
      assert.equal(job.probe.audio_codec, 'aac');
      assert.equal(job.scene_capture.motion_clips, 1);
      for (const [assetId, expected] of [[`mmd:A:${modelName}`, before.model],
        [`mmd:vmd:${motionName}`, before.motion], [songId, before.song], [image.item.id, imageBefore]]) {
        assert.ok(job.inputs.some(input => input.asset_id === assetId && input.sha256 === expected), assetId);
      }
      const mp4 = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
      const rgb = decode(mp4, ['-frames:v', '1', '-vf', 'scale=160:90', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
      assert.equal(rgb.length, 160 * 90 * 3);
      const background = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', imagePath,
        '-frames:v', '1', '-vf', 'scale=160:90', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
      { maxBuffer: 1024 * 1024 });
      assert.equal(background.status, 0, background.stderr.toString());
      assert.equal(background.stdout.length, rgb.length);
      let changedPixels = 0;
      for (let i = 0; i < rgb.length; i += 3)
        if (Math.max(...[0, 1, 2].map(j => Math.abs(rgb[i + j] - background.stdout[i + j]))) > 24) changedPixels++;
      assert.ok(changedPixels > 200, `3Dを含むMP4の画素差が不足: ${changedPixels}`);
      const pcm = decode(mp4, ['-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1']);
      assert.ok(rms(pcm) > 100, `WAVが書き出しに含まれません: RMS=${rms(pcm)}`);
      assert.equal(hash(fs.readFileSync(imagePath)), imageBefore);
      harness.assertNoErrors(page);
      console.log(JSON.stringify({ project_id: id, inputHashes: { model: before.model, motion: before.motion,
        audio: before.song, image: imageBefore }, frames: job.probe.frames, changedPixels,
        audioRms: rms(pcm), renderer: job.scene_capture.renderer,
        previewSeconds: samples.map(sample => sample.seconds) }));
    } finally {
      await page?.close(); await browser?.close(); await server.stop();
      for (const [key, file] of Object.entries(paths)) assert.equal(hashFile(file), before[key], `${key}原本が変わりました`);
    }
  });
