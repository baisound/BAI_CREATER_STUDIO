'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

let server;
let browser;
let modelId;

test.before(async () => {
  server = await harness.startServer({ port: 8877 });
  const glb = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'));
  const upload = await fetch(`${server.base}/api/library-assets/upload?kind=stage&name=synthetic_test_model.glb`, {
    method: 'POST', body: glb, headers: { 'Content-Type': 'model/gltf-binary' },
  });
  assert.equal(upload.status, 200);
  modelId = (await upload.json()).item.id;
  const project = await fetch(`${server.base}/api/studio/v05/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '3D描画の隔離試験', kind: 'empty' }),
  });
  assert.equal(project.status, 200);
  browser = await server.launchBrowser();
});

test.after(async () => {
  await browser?.close();
  await server?.stop();
});

test('registered GLB can be saved and reopened in the existing v0.5 3D viewer', async () => {
  const page = await server.newPage(browser);
  try {
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.waitForFunction((id) => [...document.querySelectorAll('#v55-model option')].some((option) => option.value === id), modelId);
    await page.locator('#v55-model').selectOption(modelId);
    await page.locator('#v55-scene-model button').first().click();
    await page.waitForFunction(() => document.querySelector('#v55-scene-model [role="status"]')?.textContent.includes('synthetic_test_model'));
    const projectId = await page.locator('#v06project').inputValue();
    const saved = await (await fetch(`${server.base}/api/studio/v05/scene/model?id=${encodeURIComponent(projectId)}`)).json();
    assert.equal(saved.model.asset_id, modelId);

    await page.locator('#v55-scene-model button').nth(1).click();
    await page.waitForFunction(() => window.BAIStudioScenePreview?.getStatus().active === true);
    assert.ok(await page.locator('#v22-preview canvas').count() >= 1);
    assert.equal(await page.locator('#v22-panel').evaluate((element) => element.classList.contains('open')), true);

    await page.reload();
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.waitForFunction((id) => document.querySelector('#v55-model')?.value === id, modelId);
    await page.locator('#v55-scene-model button').nth(1).click();
    await page.waitForFunction(() => window.BAIStudioScenePreview?.getStatus().active === true);
    assert.ok(await page.locator('#v22-preview canvas').count() >= 1);
    harness.assertNoErrors(page);
  } finally {
    await page.context().close();
  }
});
