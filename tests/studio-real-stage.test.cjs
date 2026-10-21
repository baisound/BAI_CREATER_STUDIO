'use strict';
// Provided S01 stage stays outside Git. This test uploads it to an isolated data directory.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const harness = require('./helpers/studio-harness.cjs');

const file = process.env.STAGE_GLB_PATH;
const expected = 'a54a7451a580eb88df9e6b13308d406cad9000abc72410fd4a006197dd7cae35';
const seed = {
  'project_state.json': JSON.stringify({ schema: 1, title: 'Stage QA', timeline: [], history: [], cursor: -1, selected: 0, playbackSpeed: 1, updatedAt: '' }),
  'camera_project.json': JSON.stringify({ schema: 1, fps: 30, duration: 300, keys: [{ frame: 0, position: [0, 1.6, 5], target: [0, 1, 0], fov: 40, interpolation: 'linear' }] }),
};

test('S01 GLB stage loads at the origin, frames its interior and survives save/reload', { skip: file && fs.existsSync(file) ? false : 'STAGE_GLB_PATH is not set' }, async () => {
  const raw = fs.readFileSync(file);
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), expected, 'source GLB changed');
  const server = await harness.startServer({ port: Number(process.env.REAL_STAGE_PORT || 8799), seed });
  const browser = await harness.launchBrowser();
  let page;
  try {
    const response = await fetch(`${server.base}/api/library-assets/upload?kind=stage&name=S01-test.glb`, { method: 'POST', body: raw });
    assert.equal(response.status, 200);
    const item = (await response.json()).item;
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/06`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`[data-role="stage-asset"] option[value="${item.id}"]`, { state: 'attached' });
    await page.selectOption('[data-role="stage-asset"]', item.id);
    await page.waitForFunction((id) => window.baiStudio.viewport.getState().stage?.assetId === id, item.id, { timeout: 30000 });
    const state = await page.evaluate(() => window.baiStudio.viewport.getState());
    assert.deepEqual(state.stage.position, [0, 0, 0]);
    assert.deepEqual(state.stage.rotation, [0, 0, 0]);
    assert.equal(state.stage.unit, 1);
    assert.ok(state.stage.height > 5 && state.stage.height < 6, `architectural height ${state.stage.height}`);
    assert.ok(state.cameraPosition[2] < 9, `camera must stay inside the room: ${state.cameraPosition}`);
    if (process.env.REAL_STAGE_SHOT) await page.screenshot({ path: process.env.REAL_STAGE_SHOT, type: 'png' });
    await page.click('[data-feature="projectToolbar"] [data-role="project-save"]');
    await page.waitForFunction(() => window.baiStudio.project.getState().dirty.workspace === false);
    const saved = JSON.parse(fs.readFileSync(require('node:path').join(server.dataDir, 'project_state.workspace.json'), 'utf8'));
    assert.equal(saved.stage.asset, item.id);
    await page.reload();
    await page.waitForFunction((id) => window.baiStudio.viewport.getState().stage?.assetId === id, item.id, { timeout: 30000 });
    assert.deepEqual((await page.evaluate(() => window.baiStudio.viewport.getState().stage)).position, [0, 0, 0]);
    harness.assertNoErrors(page);
  } finally {
    await page?.context().close();
    await browser.close();
    await server.stop();
  }
});
