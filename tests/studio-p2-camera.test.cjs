'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

test('camera host keeps keys across studio routes', harness.skip3d(), async () => {
  let server;
  for (let port = 8794; port <= 8804; port++) {
    try { server = await harness.startServer({ port }); break; }
    catch (error) { if (!/既に使われています/.test(String(error))) throw error; }
  }
  assert.ok(server, 'camera test needs an unused isolated port');
  const browser = await server.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/02`);
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio' &&
      document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
    assert.equal(await page.locator('[data-feature="cameraHost"] #scene').count(), 1);
    assert.equal(await page.locator('[data-feature="cameraHost"] #preview').count(), 1);
    assert.equal(await page.locator('[data-feature="cameraHost"] .view-3d-canvas').count(), 2);
    const sceneSize = await page.locator('#scene').boundingBox();
    assert.ok(sceneSize && sceneSize.width > 100 && sceneSize.height > 100, 'scene has usable dimensions');
    await page.click('.camera-host-tabs [data-camera-tab="focus"]');
    assert.equal(await page.locator('#focus-lens:visible').count(), 1);
    await page.click('.camera-host-tabs [data-camera-tab="rail"]');
    assert.equal(await page.locator('#rig-type:visible').count(), 1);
    await page.click('.camera-host-tabs [data-camera-tab="easing"]');
    assert.equal(await page.locator('#interpolation:visible').count(), 1);
    await page.click('.camera-host-tabs [data-camera-tab="camera"]');
    const firstCount = await page.locator('#track button').count();
    await page.fill('#frame-number', '37');
    await page.locator('#frame-number').dispatchEvent('change');
    await page.click('#add');
    assert.equal(await page.locator('#track button').count(), firstCount + 1);
    assert.equal(await page.evaluate(() => window.BAICameraPage.handle().isDirty()), true);
    await page.evaluate(() => window.baiStudio.navigate('08'));
    await page.waitForFunction(() => location.pathname.endsWith('/08'));
    assert.equal(await page.locator('#keepalive [data-feature="cameraHost"]').count(), 1);
    await page.evaluate(() => window.baiStudio.navigate('02'));
    await page.waitForFunction(() => location.pathname.endsWith('/02'));
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio');
    await page.fill('#frame-number', '41');
    await page.locator('#frame-number').dispatchEvent('change');
    await page.click('#add');
    const kept = await page.locator('#track button').count();
    await page.evaluate(() => window.baiStudio.navigate('08'));
    await page.waitForFunction(() => location.pathname.endsWith('/08'));
    assert.equal(await page.locator('#keepalive [data-feature="cameraHost"]').count(), 1);
    await page.evaluate(() => window.baiStudio.navigate('02'));
    await page.waitForFunction(() => location.pathname.endsWith('/02'));
    assert.equal(await page.locator('#track button').count(), kept);
    assert.equal(await page.evaluate(() => window.BAICameraPage.handle().isDirty()), true);
    await page.click('#undo');
    assert.equal(await page.locator('#track button').count(), kept - 1);
    await page.click('#redo');
    assert.equal(await page.locator('#track button').count(), kept);
    await page.evaluate(() => window.baiStudio.navigate('03'));
    await page.click('.screen-head button:has-text("撮影画面のフォーカスタブへ")');
    await page.waitForFunction(() => location.pathname.endsWith('/02') && new URLSearchParams(location.search).get('tab') === 'focus');
    assert.equal(await page.locator('#main .camera-host-tabs [data-camera-tab="focus"][aria-selected="true"]').count(), 1);
    assert.equal(await page.locator('#track button').count(), kept);
    await page.click('#save');
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === '保存しました');
    await page.reload();
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio' &&
      document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
    assert.equal(await page.locator('#track button').count(), kept);
    await page.goto(`${server.base}/camera.html`);
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'legacy' &&
      document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
    assert.equal(await page.locator('#track button').count(), kept, 'the legacy page reads the keys saved from SCR-02');
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await browser.close(); await server.stop(); }
});

test('camera host does not mount on an unreadable camera file', async () => {
  const server = await harness.startServer({ port: 8796, seed: { 'camera_project.json': '{ invalid' } });
  const original = fs.readFileSync(path.join(server.dataDir, 'camera_project.json'));
  const browser = await server.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser, { expectErrors: [/422 \(Unprocessable Entity\)/] });
    await page.goto(`${server.base}/workspace/02`);
    await page.waitForSelector('[data-role="camera-invalid"]');
    assert.match(await page.textContent('[data-role="camera-invalid"]'), /camera_project\.json/);
    assert.equal(await page.evaluate(() => window.BAICameraPage), undefined);
    assert.equal(await page.locator('[data-feature="cameraHost"]').count(), 0);
    assert.deepEqual(fs.readFileSync(path.join(server.dataDir, 'camera_project.json')), original);
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await browser.close(); await server.stop(); }
});
