'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');

async function json(response, status = 200) {
  const body = await response.text();
  assert.equal(response.status, status, body);
  return JSON.parse(body);
}
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function waitJob(base, id) {
  let job;
  const deadline = Date.now() + 300000;
  do {
    await new Promise(resolve => setTimeout(resolve, 700));
    job = await json(await fetch(`${base}/api/studio/v05/render/jobs?id=${id}`));
  } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
  assert.equal(job.status, 'succeeded', job.error);
  return job;
}
function pixels(mp4, seconds) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
    '-ss', String(seconds), '-frames:v', '1', '-vf', 'scale=160:90', '-pix_fmt', 'rgb24',
    '-f', 'rawvideo', 'pipe:1'], { input: mp4, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr.toString());
  assert.equal(run.stdout.length, 160 * 90 * 3);
  return run.stdout;
}
function difference(a, b) {
  let count = 0;
  for (let i = 0; i < a.length; i += 3)
    if (Math.max(...[0, 1, 2].map(j => Math.abs(a[i + j] - b[i + j]))) > 24) count++;
  return count;
}

test('600 saved 3D frames render beyond the former 300F bound and 601F is rejected', async () => {
  const server = await harness.startServer({ port: 8992 });
  let browser, page;
  try {
    const caps = await json(await fetch(`${server.base}/api/studio/v05/render/capabilities`));
    assert.equal(caps.scene_capture_available, true);
    assert.equal(caps.max_scene_frames, 600);
    const imageBytes = fs.readFileSync(path.join(__dirname, '..', 'studio', 'assets', 'samples', 'viewport-shrine.webp'));
    const glbBytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'));
    const image = await json(await fetch(`${server.base}/api/library-assets/upload?kind=image&name=long-back.webp`,
      { method: 'POST', body: imageBytes }));
    const glb = await json(await fetch(`${server.base}/api/library-assets/upload?kind=stage&name=long-prop.glb`,
      { method: 'POST', body: glbBytes }));
    const project = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '3D長区間隔離検査', kind: 'empty' }),
    }));
    const id = project.project.id;
    const arrangement = await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: image.item.id,
        track: 'image', start: 0, duration: 12, revision: 0 }),
    }));
    const range = await json(await fetch(`${server.base}/api/studio/v05/timeline/range`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, revision: 0, arrangement_revision: arrangement.revision,
        in_frame: 60, out_frame: 659 }),
    }));
    assert.equal(range.frame_count, 600);
    const start = async body => json(await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), 202);
    const body = { project_id: id, arrangement_revision: arrangement.revision,
      range_revision: range.revision, resolution: '720p' };
    const flat = await start(body);
    await waitJob(server.base, flat.id);
    const flatMp4 = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${flat.id}`)).arrayBuffer());
    const scene = await json(await fetch(`${server.base}/api/studio/v05/scene/instances`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, action: 'add', revision: 0, asset_id: glb.item.id,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    }));
    browser = await server.launchBrowser();
    page = await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="export"]').click();
    await page.waitForFunction(() => !document.querySelector('#baiAddRender')?.disabled);
    assert.match(await page.locator('#v69status').textContent(), /3D実描画720p/);
    const started = await start({ ...body, scene_revision: scene.revision });
    const completed = await waitJob(server.base, started.id);
    assert.equal(completed.scene_capture.frames, 600);
    assert.equal(completed.probe.frames, 600);
    assert.equal(completed.probe.video_codec, 'h264');
    assert.equal(completed.probe.audio_codec, 'aac');
    assert.ok(completed.inputs.some(input => input.asset_id === glb.item.id && input.sha256 === sha(glbBytes)));
    const longMp4 = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
    assert.ok(difference(pixels(flatMp4, 0.05), pixels(longMp4, 0.05)) > 200);
    assert.ok(difference(pixels(flatMp4, 9.95), pixels(longMp4, 9.95)) > 200);
    assert.equal(sha(glbBytes), sha(fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'))));
    assert.equal(fs.existsSync(path.join(server.dataDir, 'studio_v05_media_renders', 'jobs', `${started.id}.frames`)), false);
    const tooLong = await json(await fetch(`${server.base}/api/studio/v05/timeline/range`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, revision: range.revision,
        arrangement_revision: arrangement.revision, in_frame: 0, out_frame: 600 }),
    }));
    assert.equal(tooLong.frame_count, 601);
    const rejected = await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, range_revision: tooLong.revision, scene_revision: scene.revision }),
    });
    assert.equal(rejected.status, 422);
    assert.match((await rejected.json()).error, /600フレーム以内/);
    await page.reload();
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="export"]').click();
    await page.waitForFunction(() => document.querySelector('#v69status')?.textContent.includes('600フレーム以内'));
    assert.equal(await page.locator('#baiAddRender').isDisabled(), true);
    const oldFile = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
    assert.equal(sha(oldFile), sha(longMp4));
  } finally { await page?.close(); await browser?.close(); await server.stop(); }
});
