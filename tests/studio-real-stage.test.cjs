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
    const editBeforeViews = await page.evaluate(() => JSON.stringify(window.baiStudio.project.getState().bundle.workspace));
    const perspectivePosition = state.cameraPosition;
    const perspectiveTarget = state.cameraTarget;
    for (const mode of ['front', 'back', 'left', 'right', 'top', 'bottom']) {
      await page.selectOption('[data-role="scene-view-mode"]', mode);
      await page.waitForFunction((wanted) => window.baiStudio.viewport.getState().viewMode === wanted, mode);
      const view = await page.evaluate(() => window.baiStudio.viewport.getState());
      assert.equal(view.cameraProjection, 'orthographic');
      const axis = mode === 'front' || mode === 'back' ? 2 : mode === 'left' || mode === 'right' ? 0 : 1;
      const sign = ['front', 'right', 'top'].includes(mode) ? 1 : -1;
      assert.ok((view.cameraPosition[axis] - view.cameraTarget[axis]) * sign > 1, `${mode} camera axis`);
      if (mode === 'front' || mode === 'top') {
        const nearSurface = await page.evaluate(async (wanted) => {
          const host = (await import('/studio/js/viewport/three-host.js')).currentViewport();
          let visible = null;
          host.content.traverse((object) => { if (object.name === (wanted === 'top' ? 'S01_R02_Ceiling' : 'S01_R02_Wall_S')) visible = object.visible; });
          return visible;
        }, mode);
        assert.equal(nearSurface, false, `${mode} near shell is hidden only in the editor view`);
      }
      if (mode === 'top') {
        await page.click('[data-role="scene-focus-light"]');
        const focused = await page.evaluate(() => window.baiStudio.viewport.getState());
        assert.ok(focused.cameraTarget.every((value, axis) => Math.abs(value - [-1.5, 2.3, 1][axis]) < 1e-6));
        await page.click('[data-role="scene-frame-all"]');
        assert.notDeepEqual((await page.evaluate(() => window.baiStudio.viewport.getState())).cameraTarget, focused.cameraTarget);
      }
      if (process.env.REAL_STAGE_VIEW_SHOT_DIR) await page.screenshot({ path: require('node:path').join(process.env.REAL_STAGE_VIEW_SHOT_DIR, `view_${mode}.png`), type: 'png' });
    }
    await page.selectOption('[data-role="scene-view-mode"]', 'perspective');
    await page.waitForFunction(() => window.baiStudio.viewport.getState().viewMode === 'perspective');
    const restored = await page.evaluate(() => window.baiStudio.viewport.getState());
    assert.equal(restored.cameraProjection, 'perspective');
    assert.deepEqual(restored.cameraPosition, perspectivePosition);
    assert.deepEqual(restored.cameraTarget, perspectiveTarget);
    assert.equal(await page.evaluate(async () => {
      const host = (await import('/studio/js/viewport/three-host.js')).currentViewport();
      let visible = null;
      host.content.traverse((object) => { if (object.name === 'S01_R02_Ceiling') visible = object.visible; });
      return visible;
    }), true, 'original stage visibility returns with perspective');
    assert.equal(await page.evaluate(() => JSON.stringify(window.baiStudio.project.getState().bundle.workspace)), editBeforeViews,
      'view mode and cutaway do not edit persisted workspace');
    await page.waitForFunction(() => window.baiStudio.viewport.getState().lights?.count === 3);
    assert.equal(await page.locator('.scene-object-row.light-object').count(), 3);
    await page.click('[data-light-id="key"]');
    await page.waitForFunction(() => window.baiStudio.viewport.getState().lights?.selected === 'key');
    if (process.env.REAL_STAGE_GIZMO_SHOT) await page.screenshot({ path: process.env.REAL_STAGE_GIZMO_SHOT, type: 'png' });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const handle = await page.evaluate(async () => {
      const host = (await import('/studio/js/viewport/three-host.js')).currentViewport();
      const pos = window.baiStudio.viewport.getState().lights.items.find((item) => item.id === 'key').position;
      const world = new host.camera.position.constructor(pos[0] + 0.35, pos[1], pos[2]);
      const clip = world.project(host.camera);
      const rect = host.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + (clip.x + 1) * rect.width / 2, y: rect.top + (1 - clip.y) * rect.height / 2 };
    });
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 35, handle.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(() => window.baiStudio.project.getState().bundle.workspace.lights?.items[0]?.keys[0]?.position[0] > -1.5, null, { timeout: 5000 });
    const dragged = await page.evaluate(() => window.baiStudio.project.getState().bundle.workspace.lights.items[0].keys[0].position[0]);
    assert.ok(dragged > -1.5, `move gizmo saved X ${dragged}`);
    await page.selectOption('[data-role="light-add-type"]', 'spot');
    await page.click('[data-role="light-add"]');
    await page.waitForFunction(() => window.baiStudio.viewport.getState().lights?.count === 4);
    await page.click('[role="tab"][data-tab="light"]');
    await page.fill('[data-role="light-frame"]', '90');
    await page.locator('[data-role="light-frame"]').dispatchEvent('change');
    await page.fill('[data-light-field="rgb-0"]', '18');
    await page.locator('[data-light-field="rgb-0"]').dispatchEvent('change');
    await page.fill('[data-light-field="position-1"]', '4.5');
    await page.locator('[data-light-field="position-1"]').dispatchEvent('change');
    await page.fill('[data-light-field="rotation-1"]', '45');
    await page.locator('[data-light-field="rotation-1"]').dispatchEvent('change');
    await page.fill('[data-light-field="intensity"]', '28');
    await page.locator('[data-light-field="intensity"]').dispatchEvent('change');
    const edited = await page.evaluate(() => window.baiStudio.project.getState().bundle.workspace.lights);
    assert.equal(edited.items.length, 4);
    assert.equal(edited.items[3].keys[1].frame, 90);
    assert.equal(edited.items[3].keys[1].rgb[0], 18);
    assert.equal(edited.items[3].keys[1].position[1], 4.5);
    assert.equal(edited.items[3].keys[1].rotation[1], 45);
    assert.equal(edited.items[3].keys[1].intensity, 28);
    assert.equal(await page.locator('.light-timeline-row').count(), 4);
    const scroll = await page.evaluate(() => {
      const inspector = document.querySelector('.pane-right > .pane-body');
      const tracks = document.querySelector('.light-timeline-rows');
      inspector.scrollTop = inspector.scrollHeight;
      tracks.scrollTop = tracks.scrollHeight;
      const last = tracks.lastElementChild.getBoundingClientRect();
      const box = tracks.getBoundingClientRect();
      return { inspector: inspector.scrollTop, tracks: tracks.scrollTop,
        inspectorOverflow: getComputedStyle(inspector).overflowY, trackOverflow: getComputedStyle(tracks).overflowY,
        lastVisible: last.bottom <= box.bottom + 1 && last.top >= box.top - 1 };
    });
    assert.ok(scroll.inspector > 0, `right inspector must scroll: ${JSON.stringify(scroll)}`);
    assert.ok(scroll.tracks > 0 && scroll.lastVisible, `light tracks must scroll: ${JSON.stringify(scroll)}`);
    assert.equal(scroll.inspectorOverflow, 'auto');
    assert.equal(scroll.trackOverflow, 'auto');
    if (process.env.REAL_STAGE_SHOT) await page.screenshot({ path: process.env.REAL_STAGE_SHOT, type: 'png' });
    await page.click('[data-feature="projectToolbar"] [data-role="project-save"]');
    await page.waitForFunction(() => window.baiStudio.project.getState().dirty.workspace === false);
    const saved = JSON.parse(fs.readFileSync(require('node:path').join(server.dataDir, 'project_state.workspace.json'), 'utf8'));
    assert.equal(saved.stage.asset, item.id);
    assert.equal(saved.lights.items.length, 4);
    assert.equal(saved.lights.items[3].keys[1].frame, 90);
    await page.reload();
    await page.waitForFunction((id) => window.baiStudio.viewport.getState().stage?.assetId === id, item.id, { timeout: 30000 });
    assert.deepEqual((await page.evaluate(() => window.baiStudio.viewport.getState().stage)).position, [0, 0, 0]);
    await page.waitForFunction(() => window.baiStudio.viewport.getState().lights?.count === 4);
    assert.equal((await page.evaluate(() => window.baiStudio.project.getState().bundle.workspace.lights.items[3].keys[1].rgb[0])), 18);
    harness.assertNoErrors(page);
  } finally {
    await page?.context().close();
    await browser.close();
    await server.stop();
  }
});
