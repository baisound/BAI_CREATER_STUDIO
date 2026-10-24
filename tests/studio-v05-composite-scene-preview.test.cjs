'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');

async function ok(response) { const body = await response.text(); assert.equal(response.status, 200, body); return JSON.parse(body); }

function compareImages(before, after) {
  const source = `from PIL import Image, ImageChops\nimport json, sys\na=Image.open(sys.argv[1]).convert('RGB')\nb=Image.open(sys.argv[2]).convert('RGB')\nassert a.size==b.size\nw,h=a.size\nd=ImageChops.difference(a,b)\nmid=d.crop((int(w*.2),int(h*.35),int(w*.8),int(h*.85)))\nchanged=sum(1 for p in mid.getdata() if max(p)>25)\ncorner=d.crop((0,h-25,25,h))\ncorner_mean=sum(sum(p) for p in corner.getdata())/(25*25*3)\nprint(json.dumps({'width':w,'height':h,'center_changed':changed,'corner_mean':corner_mean}))`;
  const run = spawnSync(harness.python, ['-c', source, before, after], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('saved 3D canvas overlays the same project image with transparent background and shared seek', async () => {
  const server = await harness.startServer({ port: 8904 });
  let browser, page;
  try {
    const image = await ok(await fetch(`${server.base}/api/library-assets/upload?kind=image&name=backdrop.webp`, {
      method: 'POST', body: fs.readFileSync(path.join(__dirname, '..', 'studio', 'assets', 'samples', 'viewport-shrine.webp')),
    }));
    const glb = await ok(await fetch(`${server.base}/api/library-assets/upload?kind=stage&name=prop.glb`, {
      method: 'POST', body: fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb')),
    }));
    const video = await ok(await fetch(`${server.base}/api/library-assets/upload?kind=video&name=cut.mp4`, {
      method: 'POST', body: fs.readFileSync(path.join(__dirname, 'fixtures', 'media_preview.mp4')),
    }));
    const project = await ok(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '同画素プレビュー検査', kind: 'empty' }),
    }));
    const id = project.project.id;
    const placedImage = await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: image.item.id, track: 'image', start: 0, duration: 4, revision: 0 }),
    }));
    await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: video.item.id, track: 'video', start: 2, duration: 2, revision: placedImage.revision }),
    }));
    const scene = await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, action: 'add', revision: 0, asset_id: glb.item.id,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    }));
    browser = await server.launchBrowser();
    page = await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.waitForFunction(projectId => window.BAIStudioMediaPreviewV68?.status().ready &&
      window.BAIStudioMediaPreviewV68.status().projectId === projectId &&
      document.querySelector('#v68layers img')?.naturalWidth > 0, id);
    const before = path.join(server.dataDir, 'before.png');
    const after = path.join(server.dataDir, 'after.png');
    await page.locator('#v68stage').screenshot({ path: before });
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(() => window.BAIStudioMultiScenePreview?.status().loaded === 1 &&
      window.BAIStudioMultiScenePreview.status().composite === true &&
      document.querySelector('#v68stage #v58-canvas canvas'));
    assert.equal(await page.locator('#v68stage #v68layers img').isVisible(), true);
    assert.equal(await page.locator('#v68stage #v58-canvas canvas').count(), 1);
    await page.locator('#v68stage').screenshot({ path: after });
    const pixels = compareImages(before, after);
    console.log(`composite pixels: ${JSON.stringify(pixels)}`);
    assert.ok(pixels.center_changed > 100, `3D実画素が画像と同じ枠にない: ${JSON.stringify(pixels)}`);
    assert.ok(pixels.corner_mean < 8, `WebGL背景が画像を覆っている: ${JSON.stringify(pixels)}`);
    await page.locator('#v68frame').fill('60');
    await page.locator('#v68seek').click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68.status().frame === 60 &&
      Number(document.querySelector('#v58-motion-seek')?.value) === 1);
    await page.locator('#v68frame').fill('150');
    await page.locator('#v68seek').click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68.status().frame === 150 &&
      document.querySelector('#v68layers video')?.readyState >= 2 &&
      Math.abs(document.querySelector('#v68layers video').currentTime - 0.5) < 0.1);
    assert.equal(await page.locator('#v68layers video').isVisible(), true);
    assert.equal(await page.locator('#v68stage #v58-canvas canvas').count(), 1);
    await page.locator('#v68frame').fill('60');
    await page.locator('#v68seek').click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68.status().frame === 60);
    await page.reload();
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(() => window.BAIStudioMultiScenePreview?.status().loaded === 1 &&
      window.BAIStudioMultiScenePreview.status().composite === true);
    assert.equal((await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).frame, 60);
    assert.equal((await page.evaluate(() => window.BAIStudioMultiScenePreview.status())).projectId, id);
    await page.setViewportSize({ width: 900, height: 700 });
    const stageBox = await page.locator('#v68stage').boundingBox();
    const panelBox = await page.locator('#v58-multi-preview').boundingBox();
    assert.ok(stageBox && panelBox && panelBox.x > stageBox.x + stageBox.width * .5,
      `狭い画面の中央プレビューを操作パネルが覆っています: ${JSON.stringify({ stageBox, panelBox })}`);
    await page.locator('#v58-save-camera').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#v58-save-camera').isVisible(), true);
    assert.equal(scene.instances.length, 1);
  } finally { await page?.close(); await browser?.close(); await server.stop(); }
});
