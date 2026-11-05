'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const harness = require('./helpers/studio-harness.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
async function json(r, status = 200) {
  const text = await r.text(); assert.equal(r.status, status, text); return JSON.parse(text);
}
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, milliseconds = 90000) {
  const deadline = Date.now() + milliseconds;
  do { const value = await fn(); if (value) return value; await delay(100); } while (Date.now() < deadline);
  throw Error('isolated render condition timed out');
}

test('capacity rejection and forced restart during capture/encoding retain old MP4 and allow retry',
  { skip: process.platform !== 'win32' && 'Windows process-scope recovery contract', timeout: 240000 }, async () => {
    const server = await harness.startServer({ port: 8991 });
    const post = (route, body) => fetch(server.base + route, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const caps = await json(await fetch(server.base + '/api/studio/v05/render/capabilities'));
      assert.equal(caps.max_scene_frames, 36000);
      assert.equal(caps.max_duration_seconds, 600);
      assert.equal(caps.max_scene_bytes, 2 * 1024 ** 3);
      const upload = async (kind, name, bytes) => json(await fetch(
        `${server.base}/api/library-assets/upload?kind=${kind}&name=${name}`, { method: 'POST', body: bytes }));
      const glb = await upload('stage', 'recovery-prop.glb', fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb')));
      const image = await upload('image', 'recovery-back.webp', fs.readFileSync(path.join(__dirname, '..', 'studio', 'assets', 'samples', 'viewport-shrine.webp')));
      const p = await json(await post('/api/studio/v05/projects', { name: '再起動容量境界隔離', kind: 'empty' }));
      const id = p.project.id;
      const arrangement = await json(await post('/api/studio/v05/arrangement/place', {
        project_id: id, asset_id: image.item.id, track: 'image', start: 0, duration: 601, revision: 0 }));
      let scene = await json(await post('/api/studio/v05/scene/instances', { project_id: id,
        action: 'add', revision: 0, asset_id: glb.item.id,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }));
      let range = await json(await post('/api/studio/v05/timeline/range', { project_id: id,
        revision: 0, arrangement_revision: arrangement.revision, in_frame: 0, out_frame: 9 }));
      const start = async (withScene = true, expected = 202) => json(await post('/api/studio/v05/render/jobs', {
        project_id: id, arrangement_revision: arrangement.revision, range_revision: range.revision,
        resolution: '720p', ...(withScene ? { scene_revision: scene.revision } : {}) }), expected);
      const fetchJob = job => fetch(`${server.base}/api/studio/v05/render/jobs?id=${job.id}`);
      const status = async job => json(await fetchJob(job));
      const waitDone = job => until(async () => {
        const state = await status(job);
        if (state.status === 'failed') throw Error(state.error);
        return state.status === 'succeeded' && state;
      });
      const old = await start(); await waitDone(old);
      const oldBytes = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${old.id}`)).arrayBuffer());
      await json(await post('/api/studio/v05/project/fps', { project_id: id, fps: 120 }));
      range = await json(await post('/api/studio/v05/timeline/range', { project_id: id,
        revision: range.revision, arrangement_revision: arrangement.revision, in_frame: 0, out_frame: 36000 }));
      assert.match((await start(true, 422)).error, /36000フレーム/);
      await json(await post('/api/studio/v05/project/fps', { project_id: id, fps: 60 }));
      assert.match((await start(true, 422)).error, /10分/);
      range = await json(await post('/api/studio/v05/timeline/range', { project_id: id,
        revision: range.revision, arrangement_revision: arrangement.revision, in_frame: 0, out_frame: 35999 }));
      const interrupted = await start(); // exactly 36000F / 600s is accepted
      const work = path.join(server.dataDir, 'studio_v05_media_renders', 'jobs', `${interrupted.id}.frames`);
      await until(() => {
        const file = path.join(work, 'scene.mkv');
        return fs.existsSync(file) && fs.statSync(file).size > 8192;
      });
      await server.crash(); await server.restart();
      const recovered = await until(async () => {
        const state = await status(interrupted);
        assert.equal(state.status, 'interrupted');
        return state.temporary_cleanup === 'complete' && state;
      });
      assert.equal(recovered.status, 'interrupted');
      assert.equal(fs.existsSync(work), false);
      assert.equal((await fetch(`${server.base}/api/studio/v05/render/file?id=${interrupted.id}`)).status, 404);
      // Also force-stop the final 2D FFmpeg encoder, after it opened the part file.
      scene = await json(await post('/api/studio/v05/scene/instances', { project_id: id,
        action: 'update', revision: scene.revision, instance_id: scene.instances[0].id, visible: false }));
      const encoding = await start(false);
      const partial = path.join(server.dataDir, 'studio_v05_media_renders', 'files', `${encoding.id}.part.mp4`);
      await until(() => fs.existsSync(partial) && fs.statSync(partial).size > 1024);
      assert.equal((await status(encoding)).phase, 'encoding');
      await server.crash(); await server.restart();
      await until(async () => {
        const state = await status(encoding);
        assert.equal(state.status, 'interrupted');
        return state.temporary_cleanup === 'complete';
      });
      assert.equal(fs.existsSync(partial), false);
      const browser = await server.launchBrowser();
      try {
        const page = await server.newPage(browser);
        await page.goto(`${server.base}/studio/v05/index.html`);
        await page.locator('#v06project').selectOption(id);
        await page.locator('#nav [data-workspace="export"]').click();
        await page.waitForFunction(() => document.querySelector('#baiRenderQueue')?.textContent.includes('一時ファイルを回収しました'));
        assert.equal(await page.locator('#baiRenderQueue .v69job').filter({ hasText: 'interrupted' }).count(), 2);
        harness.assertNoErrors(page);
      } finally { await browser.close(); }
      const retained = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${old.id}`)).arrayBuffer());
      assert.equal(sha(retained), sha(oldBytes));
      scene = await json(await post('/api/studio/v05/scene/instances', { project_id: id,
        action: 'update', revision: scene.revision, instance_id: scene.instances[0].id, visible: true }));
      range = await json(await post('/api/studio/v05/timeline/range', { project_id: id,
        revision: range.revision, arrangement_revision: arrangement.revision, in_frame: 0, out_frame: 9 }));
      const retry = await start(); const completed = await waitDone(retry);
      assert.equal(completed.probe.frames, 10);
      assert.equal(completed.temporary_cleanup, 'complete');
      assert.notEqual(retry.id, interrupted.id);
      console.log(JSON.stringify({ rejectedFrames: 36001, rejectedSeconds: 600 + 1 / 60,
        acceptedFrames: 36000, captureRestart: 'interrupted/clean', encodingRestart: 'interrupted/clean', retryFrames: 10 }));
    } finally { await server.stop(); }
  });
