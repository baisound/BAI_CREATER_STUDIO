'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');

async function json(response, status = 200) {
  const text = await response.text(); assert.equal(response.status, status, text);
  return JSON.parse(text);
}
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
function toneWav() {
  const count = 8000, data = Buffer.alloc(count * 4), head = Buffer.alloc(44);
  for (let i = 0; i < count; i++) {
    const value = Math.round(Math.sin(i * Math.PI / 10) * 7000);
    data.writeInt16LE(value, i * 4); data.writeInt16LE(value, i * 4 + 2);
  }
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(8000, 24); head.writeUInt32LE(32000, 28);
  head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
async function waitJob(base, id) {
  let job;
  const deadline = Date.now() + 120000;
  do {
    await new Promise(resolve => setTimeout(resolve, 500));
    job = await json(await fetch(`${base}/api/studio/v05/render/jobs?id=${id}`));
  } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
  assert.equal(job.status, 'succeeded', job.error);
  return job;
}
function rawFrame(mp4, seconds = 0.05, width = 160, height = 90) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0', '-ss', String(seconds), '-frames:v', '1', '-vf', `scale=${width}:${height}`, '-pix_fmt', 'rgb24',
    '-f', 'rawvideo', 'pipe:1'], { input: mp4, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr.toString());
  assert.equal(run.stdout.length, width * height * 3);
  return run.stdout;
}

test('saved GLB scene is captured at each In/Out frame and composited into a real MP4', async () => {
  const server = await harness.startServer({ port: 8905 });
  let browser, page;
  try {
    const caps = await json(await fetch(`${server.base}/api/studio/v05/render/capabilities`));
    assert.equal(caps.scene_capture_available, true);
    const imageBytes = fs.readFileSync(path.join(__dirname, '..', 'studio', 'assets', 'samples', 'viewport-shrine.webp'));
    const glbBytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'));
    const image = await json(await fetch(`${server.base}/api/library-assets/upload?kind=image&name=back.webp`, {
      method: 'POST', body: imageBytes,
    }));
    const glb = await json(await fetch(`${server.base}/api/library-assets/upload?kind=stage&name=prop.glb`, {
      method: 'POST', body: glbBytes,
    }));
    const audio = await json(await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=tone.wav`, {
      method: 'POST', body: toneWav(),
    }));
    const project = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '3D実MP4検査', kind: 'empty' }),
    }));
    const id = project.project.id;
    const placedImage = await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: image.item.id, track: 'image',
        start: 0, duration: 2, revision: 0 }),
    }));
    const placed = await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: audio.item.id, track: 'audio',
        start: 0, duration: 1, revision: placedImage.revision }),
    }));
    const range = await json(await fetch(`${server.base}/api/studio/v05/timeline/range`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, revision: 0, arrangement_revision: placed.revision,
        in_frame: 0, out_frame: 11 }),
    }));
    const body = { project_id: id, range_revision: range.revision,
      arrangement_revision: placed.revision, resolution: '720p' };
    const start = async value => json(await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    }), 202);
    const flatJob = await start(body);
    await waitJob(server.base, flatJob.id);
    const flat = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${flatJob.id}`)).arrayBuffer());
    const scene = await json(await fetch(`${server.base}/api/studio/v05/scene/instances`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, action: 'add', revision: 0, asset_id: glb.item.id,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    }));
    const omitted = await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(omitted.status, 422);
    assert.match((await omitted.json()).error, /3D/);
    const wrong = await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, scene_revision: scene.revision - 1 }),
    });
    assert.equal(wrong.status, 409);
    const started = await start({ ...body, scene_revision: scene.revision });
    const job = await waitJob(server.base, started.id);
    assert.equal(job.scene_capture.frames, 12);
    assert.equal(job.probe.frames, 12);
    assert.equal(job.probe.width, 1280);
    assert.equal(job.probe.audio_codec, 'aac');
    assert.ok(job.inputs.some(input => input.asset_id === glb.item.id && input.sha256 === hash(glbBytes)));
    const output = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
    const pcm = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      '-t', '0.15', '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'],
    { input: output, maxBuffer: 1024 * 1024 });
    assert.equal(pcm.status, 0, pcm.stderr.toString());
    let energy = 0;
    for (let i = 0; i + 1 < pcm.stdout.length; i += 2) energy += pcm.stdout.readInt16LE(i) ** 2;
    assert.ok(Math.sqrt(energy / Math.max(1, pcm.stdout.length / 2)) > 200,
      '保存済み独立音声が3D入りMP4と同期している');
    const flatPixel = rawFrame(flat), scenePixel = rawFrame(output);
    let changed = 0;
    for (let i = 0; i < scenePixel.length; i += 3)
      if (Math.max(...[0, 1, 2].map(j => Math.abs(scenePixel[i + j] - flatPixel[i + j]))) > 24) changed++;
    assert.ok(changed > 200, `3D frames must change the encoded pixels (${changed})`);
    assert.equal(hash(imageBytes), hash(fs.readFileSync(path.join(__dirname, '..', 'studio', 'assets', 'samples', 'viewport-shrine.webp'))));
    assert.equal(hash(glbBytes), hash(fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'))));
    const listed = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${id}`));
    assert.equal(listed.jobs[0].id, started.id);
    browser = await server.launchBrowser();
    page = await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="export"]').click();
    await page.waitForFunction(() => !document.querySelector('#baiAddRender')?.disabled);
    assert.match(await page.locator('#bai-output .baiTitle .pill').textContent(), /限定MP4の実書き出し/);
    assert.match(await page.locator('#bai-output').textContent(), /MP4書き出し履歴/);
    assert.doesNotMatch(await page.locator('#bai-output').textContent(), /実動画出力は未接続|実際の動画出力は行いません|実レンダー未接続/);
    assert.match(await page.locator('#v69status').textContent(), /3D実描画720p/);
    await page.locator('#v69result').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#v69resolution').inputValue(), '720p');
    await page.locator('#baiAddRender').click();
    await page.waitForFunction(() => document.querySelectorAll('#baiRenderQueue .v69job').length >= 3 &&
      document.querySelector('#v69status')?.textContent.includes('完成'), null, { timeout: 90000 });
    const uiJobs = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${id}`));
    assert.equal(uiJobs.jobs[0].status, 'succeeded');
    assert.equal(uiJobs.jobs[0].scene_revision, scene.revision);
    assert.notEqual(uiJobs.jobs[0].id, started.id);
    assert.match(await page.locator('#v69download').getAttribute('href'), new RegExp(uiJobs.jobs[0].id));
  } finally { await page?.close(); await browser?.close(); await server.stop(); }
});

const realRoot = process.env.BAI_REAL_MMD_DATA;
const pmxName = 'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const vmdName = '狐面物理確認用_頭振り_F000-0300.vmd';
const realAvailable = realRoot && fs.existsSync(path.join(realRoot, 'mmd', 'A', pmxName)) &&
  fs.existsSync(path.join(realRoot, 'mmd', 'vmd', vmdName));

test('real registered PMX and VMD produce different MP4 pixels at project F0/F240',
  { skip: !realAvailable && 'BAI_REAL_MMD_DATA に実PMX/VMDがありません' }, async () => {
  const modelPath = path.join(realRoot, 'mmd', 'A', pmxName);
  const motionPath = path.join(realRoot, 'mmd', 'vmd', vmdName);
  const before = { model: hash(fs.readFileSync(modelPath)), motion: hash(fs.readFileSync(motionPath)) };
  const meta = JSON.parse(fs.readFileSync(path.join(realRoot, 'mmd_assets.json'), 'utf8'));
  const entries = meta.A.filter(entry => entry.name === pmxName || entry.name.startsWith('tex/'));
  const seed = { 'mmd_assets.json': JSON.stringify({ A: entries, B: [], vmd: [{ name: vmdName, size: fs.statSync(motionPath).size }] }) };
  for (const entry of entries)
    seed[`mmd/A/${entry.name}`] = fs.readFileSync(path.join(realRoot, 'mmd', 'A', ...entry.name.split('/')));
  seed[`mmd/vmd/${vmdName}`] = fs.readFileSync(motionPath);
  const server = await harness.startServer({ port: 8906, seed });
  try {
    const project = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '実PMX・VMD限定MP4', kind: 'empty' }),
    }));
    const id = project.project.id;
    const scene = await json(await fetch(`${server.base}/api/studio/v05/scene/instances`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, action: 'add', revision: 0, asset_id: `mmd:A:${pmxName}`,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    }));
    const placed = await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: `mmd:vmd:${vmdName}`,
        track: 'motion', start: 0, duration: 10, revision: 0 }),
    }));
    const assigned = await json(await fetch(`${server.base}/api/studio/v05/scene/motion-target`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, clip_id: placed.clip.id,
        revision: placed.revision, instance_id: scene.instances[0].id }),
    }));
    const range = await json(await fetch(`${server.base}/api/studio/v05/timeline/range`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, revision: 0, arrangement_revision: assigned.revision,
        in_frame: 240, out_frame: 242 }),
    }));
    const started = await json(await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, arrangement_revision: assigned.revision,
        range_revision: range.revision, scene_revision: scene.revision, resolution: '720p' }),
    }), 202);
    const job = await waitJob(server.base, started.id);
    assert.equal(job.probe.frames, 3);
    assert.equal(job.scene_capture.frames, 3);
    assert.equal(job.scene_capture.motion_clips, 1);
    assert.ok(job.inputs.some(item => item.asset_id === `mmd:A:${pmxName}` && item.sha256 === before.model));
    assert.ok(job.inputs.some(item => item.asset_id === `mmd:vmd:${vmdName}` && item.sha256 === before.motion));
    const mp4 = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
    const pixels = rawFrame(mp4, 0.01, 1280, 720);
    let nonblack = 0;
    for (let i = 0; i < pixels.length; i += 3)
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 24) nonblack++;
    assert.ok(nonblack > 200, `実PMXがMP4画素にありません (${nonblack})`);
    const earlyRange = await json(await fetch(`${server.base}/api/studio/v05/timeline/range`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, revision: range.revision,
        arrangement_revision: assigned.revision, in_frame: 0, out_frame: 2 }),
    }));
    const earlyStart = await json(await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, arrangement_revision: assigned.revision,
        range_revision: earlyRange.revision, scene_revision: scene.revision, resolution: '720p' }),
    }), 202);
    await waitJob(server.base, earlyStart.id);
    const earlyMp4 = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${earlyStart.id}`)).arrayBuffer());
    const earlyPixels = rawFrame(earlyMp4, 0.01, 1280, 720);
    const headLater = job.scene_capture.pose_sample?.bones?.['頭'];
    const earlyJob = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${earlyStart.id}`));
    const headEarly = earlyJob.scene_capture.pose_sample?.bones?.['頭'];
    assert.ok(headLater && headEarly, '実PMXの頭骨を描画ジョブ中に観測');
    const headDelta = Math.max(...headLater.quaternion.map((value, i) =>
      Math.abs(value - headEarly.quaternion[i])));
    assert.ok(headDelta > 1e-3, `F0/F240で描画時の頭骨姿勢が同じです (${headDelta})`);
    let motionPixelChanges = 0;
    for (let i = 0; i < pixels.length; i += 3)
      if (Math.max(...[0, 1, 2].map(j => Math.abs(pixels[i + j] - earlyPixels[i + j]))) > 5) motionPixelChanges++;
    assert.ok(motionPixelChanges > 2, `F0/F240のMP4画素が同じです (${motionPixelChanges})`);
    const reread = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
    assert.equal(hash(reread), hash(mp4), '別名出力後も最初のMP4を保持');
    console.log(JSON.stringify({ pmx_sha256: before.model, vmd_sha256: before.motion,
      frames: job.probe.frames, renderer: job.scene_capture.renderer, nonblack, headDelta, motionPixelChanges }));
  } finally {
    await server.stop();
    assert.equal(hash(fs.readFileSync(modelPath)), before.model);
    assert.equal(hash(fs.readFileSync(motionPath)), before.motion);
  }
});
