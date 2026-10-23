'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

function wav(seconds = 2) {
  const samples = 8000 * seconds, data = Buffer.alloc(samples * 2), head = Buffer.alloc(44);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i * Math.PI / 16) * 4000), i * 2);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(8000, 24); head.writeUInt32LE(16000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
async function ok(response, expected = 200) { const body = await response.text(); assert.equal(response.status, expected, body); return JSON.parse(body); }

test('saved 3D scene and WAV share a frame clock; incompatible dance reports its failure', async () => {
  const server = await harness.startServer({ port: 8893 });
  let browser, page;
  try {
    const glb = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'));
    const stage = await ok(await fetch(`${server.base}/api/library-assets/upload?kind=stage&name=animated.glb`, {
      method: 'POST', body: glb,
    }));
    const motionUpload = await ok(await fetch(`${server.base}/api/integrated-v02/upload?kind=motion&name=move.glb`, {
      method: 'POST', body: glb,
    }));
    const sound = await ok(await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=tone.wav`, {
      method: 'POST', body: wav(),
    }));
    const project = await ok(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '3Dと音声の共通時刻', kind: 'empty' }),
    }));
    const id = project.project.id;
    const placed = await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: sound.item.id, track: 'audio',
        start: 0, duration: 2, revision: 0 }),
    }));
    assert.equal(placed.revision, 1);
    const scene = await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, action: 'add', revision: 0, asset_id: stage.item.id,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    }));
    assert.equal(scene.instances.length, 1);
    const motion = await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: `integrated:${motionUpload.asset}`,
        track: 'motion', start: 0, duration: 2, revision: placed.revision }),
    }));
    const assigned = await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, clip_id: motion.clip.id,
        revision: motion.revision, instance_id: scene.instances[0].id }),
    }));
    assert.equal(assigned.revision, motion.revision + 1);
    const plan = await ok(await fetch(`${server.base}/api/studio/v05/scene/multi-motion-plan?id=${id}`));
    assert.equal(plan.ready_count, 1);
    const secondProject = await ok(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '音声なし3D', kind: 'empty' }),
    }));
    const secondId = secondProject.project.id;
    await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: secondId, asset_id: `integrated:${motionUpload.asset}`,
        track: 'motion', start: 0, duration: 2, revision: 0 }),
    }));
    await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: secondId, action: 'add', revision: 0, asset_id: stage.item.id,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    }));
    browser = await server.launchBrowser();
    page = await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68?.status().ready &&
      window.BAIStudioMediaPreviewV68?.status().projectId === document.querySelector('#v06project')?.value);
    await page.locator('#v70sceneOpen').click();
    try {
      await page.waitForFunction(() => window.BAIStudioMultiScenePreview?.status().loaded === 1 &&
        window.BAIStudioMultiScenePreview?.status().motion?.issues.length > 0,
        null, { timeout: 15000 });
    } catch (error) {
      const detail = await page.evaluate(() => ({ scene: window.BAIStudioMultiScenePreview?.status(),
        progress: document.querySelector('#v58-multi-preview [role=status]')?.textContent,
        motion: document.querySelector('#v58-motion-seek')?.parentElement?.textContent }));
      throw new Error(`${error.message}: ${JSON.stringify(detail)}`);
    }
    const motionState = await page.evaluate(() => window.BAIStudioMultiScenePreview.status().motion);
    assert.equal(motionState.loadedClips.length, 0);
    assert.equal(motionState.issues[0].reason, 'motion_load_failed');
    assert.match(motionState.issues[0].message, /人体骨対応は不足/);
    assert.match(await page.locator('#v58-motion-seek').locator('xpath=..').textContent(), /モーション未読込: .*人体骨対応は不足/);
    assert.equal(await page.locator('#v58-canvas canvas').count(), 1);
    assert.ok((await page.locator('#v58-canvas canvas').boundingBox()).width > 100);
    await page.locator('#v70play').click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68?.status().frame >= 12 &&
      Number(document.querySelector('#v58-motion-seek')?.value) >= 0.18, null, { timeout: 6000 });
    const running = await page.evaluate(() => ({ media: window.BAIStudioMediaPreviewV68.status(),
      sceneTime: Number(document.querySelector('#v58-motion-seek').value) }));
    assert.ok(Math.abs(running.sceneTime - running.media.frame / running.media.fps) < 1 / running.media.fps + 0.02);
    await page.locator('#v70pause').click();
    const paused = await page.evaluate(() => window.BAIStudioMediaPreviewV68.status());
    assert.equal(paused.playing, false);
    await page.locator('#v70forward').click();
    await page.waitForFunction(previous => window.BAIStudioMediaPreviewV68.status().frame === previous + 1,
      paused.frame);
    await page.locator('#v70stop').click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68.status().frame === 0);
    assert.equal(Number(await page.locator('#v58-motion-seek').inputValue()), 0);
    await page.reload();
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68?.status().ready &&
      window.BAIStudioMediaPreviewV68?.status().projectId === document.querySelector('#v06project')?.value);
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(() => window.BAIStudioMultiScenePreview?.status().loaded === 1 &&
      window.BAIStudioMultiScenePreview?.status().motion?.issues.length > 0);
    await page.waitForFunction(() => document.querySelector('#v70sceneStatus')?.textContent.includes('3D読込 1件'));
    await page.locator('#v06project').selectOption(secondId);
    await page.waitForFunction(expected => window.BAIStudioMediaPreviewV68?.status().projectId === expected &&
      window.BAIStudioMediaPreviewV68?.status().ready, secondId);
    await page.waitForFunction(expected => window.BAIStudioMultiScenePreview?.status().projectId === expected &&
      window.BAIStudioMultiScenePreview?.status().loaded === 1, secondId);
    assert.equal((await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).mediaCount, 0);
    await page.locator('#v70play').click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68.status().frame >= 6);
    await page.locator('#v70pause').click();
  } finally { await page?.close(); await browser?.close(); await server.stop(); }
});
