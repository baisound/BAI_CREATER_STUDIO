'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/studio-harness.cjs');
const IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');

let server;
let browser;

test.before(async () => {
  server = await harness.startServer({ port: 8876 });
  const response = await fetch(`${server.base}/api/library-assets/upload?kind=image&name=existing.png`, {
    method: 'POST', body: IMAGE, headers: { 'Content-Type': 'image/png' },
  });
  assert.equal(response.status, 200);
  const project = await fetch(`${server.base}/api/studio/v05/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '素材接続の隔離試験', kind: 'empty' }),
  });
  assert.equal(project.status, 200);
  browser = await server.launchBrowser();
});

test.after(async () => {
  await browser?.close();
  await server?.stop();
});

test('v0.5 library shows existing registration, uploads and selects a real asset', async () => {
  const page = await server.newPage(browser);
  try {
    const response = await page.goto(`${server.base}/studio/v05/index.html`);
    assert.equal(response?.status(), 200);
    await page.locator('.brand').waitFor();
    await page.waitForFunction(() => document.querySelector('#baiPages').getBoundingClientRect().top >= document.querySelector('.top').getBoundingClientRect().bottom);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForFunction(() => document.querySelector('#baiPages').getBoundingClientRect().top >= document.querySelector('.top').getBoundingClientRect().bottom);
    await page.locator('[data-go="library"]').first().click();
    await page.waitForFunction(() => document.querySelector('#bai-library')?.classList.contains('active'));
    await page.locator('#v54-assets').waitFor();
    assert.ok(await page.locator('#v54-assets').evaluate((pane) => pane.previousElementSibling?.classList.contains('baiTitle')));
    assert.equal(await page.locator('#v54-assets').evaluate((pane) => pane.open), false);
    await page.locator('#v54-assets summary').click();
    assert.equal(await page.locator('#v54-assets form').isVisible(), true);
    await page.locator('#v54-assets summary').click();
    await page.getByText('existing', { exact: true }).first().waitFor();
    assert.match(await page.locator('#baiAssetCount').textContent(), /登録1件/);
    assert.equal(await page.locator('#v42-focus-scan').isVisible(), false);
    const existing = page.locator('[data-library-id]').first();
    const existingId = await existing.getAttribute('data-library-id');
    await existing.click();
    assert.match(await page.locator('#baiAssetDetail').textContent(), /existing.png/);
    assert.match(await page.locator('#baiAssetDetail img').getAttribute('src'), /\/api\/library-assets\/file\//);
    await page.locator('#baiPlaceSelected').click();
    await page.waitForFunction(() => document.querySelector('#v06status')?.textContent.includes('タイムラインに配置する素材'));
    await page.locator('#v06track').selectOption('image');
    await page.waitForFunction(() => Boolean(document.querySelector('#v06project')?.value));
    const projectId = await page.locator('#v06project').inputValue();
    assert.ok(projectId);
    await page.locator('#v06place').click();
    await page.waitForFunction(() => document.querySelector('#v06status')?.textContent.includes('配置しました'));
    const arrangement = await (await fetch(`${server.base}/api/studio/v05/arrangement?id=${encodeURIComponent(projectId)}`)).json();
    assert.equal(arrangement.clips.length, 1);
    assert.equal(arrangement.clips[0].asset_id, existingId);

    await page.evaluate(() => window.baiGo('library'));
    await page.locator('#baiImport').click();
    await page.locator('#baiUploadKind').selectOption('image');
    await page.locator('#baiUploadFiles').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: IMAGE });
    await page.locator('#baiUploadSubmit').click();
    await page.waitForFunction(() => document.querySelector('#baiAssetCount')?.textContent.includes('登録2件'));
    assert.match(await page.locator('#baiAssetDetail').textContent(), /登録 1\/1件/);
    await page.reload();
    await page.locator('[data-go="library"]').first().click();
    await page.waitForFunction(() => document.querySelector('#baiAssetCount')?.textContent.includes('登録2件'));
    assert.equal(await page.locator('[data-library-id]').count(), 2);
    harness.assertNoErrors(page);
  } finally {
    await page.context().close();
  }
});

test('v0.5 library reports index failure without showing sample assets', async () => {
  const page = await server.newPage(browser, { expectErrors: [/Failed to load resource:.*500/] });
  try {
    await page.route('**/api/assets', (route) => route.fulfill({ status: 500, body: 'index unavailable' }));
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('[data-go="library"]').first().click();
    await page.locator('#baiLibraryGrid [role="alert"]').waitFor();
    assert.match(await page.locator('#baiAssetCount').textContent(), /取得失敗/);
    assert.equal(await page.locator('[data-library-id]').count(), 0);
    harness.assertNoErrors(page);
  } finally {
    await page.context().close();
  }
});

test('focus interval diagnostic stays folded in camera workspace and does not cover mobile library', async () => {
  const page = await server.newPage(browser);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.waitForFunction(() => document.querySelector('#baiPages').getBoundingClientRect().top >= document.querySelector('.top').getBoundingClientRect().bottom);
    await page.locator('[data-workspace="camera"]').click();
    await page.locator('#v42-focus-scan').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#v42-focus-scan').evaluate((panel) => panel.open), false);
    await page.locator('#v42-focus-scan summary').click();
    assert.equal(await page.locator('#v42-run').isVisible(), true);
    await page.locator('[data-page="library"]').click();
    assert.equal(await page.locator('#v42-focus-scan').isVisible(), false);
    await page.locator('[data-library-id]').first().click();
    await page.locator('#baiPlaceSelected').click();
    await page.waitForFunction(() => document.querySelector('#v06status')?.textContent.includes('タイムラインに配置する素材'));
    harness.assertNoErrors(page);
  } finally {
    await page.context().close();
  }
});
