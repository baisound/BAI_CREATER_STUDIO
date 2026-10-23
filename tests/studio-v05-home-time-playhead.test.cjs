'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

async function json(response) { assert.equal(response.status, 200); return response.json(); }

test('HOME shows JST seconds and live preview playhead follows the timeline through zoom, seek and project switch', async () => {
  const server = await harness.startServer({ port: 8903 });
  let browser, page;
  try {
    const image = await json(await fetch(`${server.base}/api/library-assets/upload?kind=image&name=still.webp`, {
      method: 'POST', body: fs.readFileSync(path.join(__dirname, '..', 'studio', 'assets', 'samples', 'viewport-shrine.webp')),
    }));
    const project = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '時刻と再生位置の試験', kind: 'empty' }),
    }));
    const other = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '別作品の位置', kind: 'empty' }),
    }));
    const id = project.project.id;
    await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: image.item.id, track: 'image', start: 0, duration: 4, revision: 0 }),
    }));
    browser = await server.launchBrowser();
    page = await server.newPage(browser);
    await page.route('**/api/studio/v05/projects', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      for (const item of body.projects) {
        if (item.id === id) item.modified = '2026-10-23T18:00:12.635074+00:00';
        if (item.id === other.project.id) item.modified = '2026-10-24T04:00:13.123456+09:00';
      }
      await route.fulfill({ response, json: body });
    });
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.waitForFunction(() => document.querySelector('#baiRecent')?.textContent.includes('時刻と再生位置の試験'));
    const cards = await page.locator('#baiRecent .baiCard').allTextContents();
    assert.ok(cards.some(text => text.includes('2026-10-24 03:00:12 JST')));
    assert.ok(cards.some(text => text.includes('2026-10-24 04:00:13 JST')));
    assert.ok(cards.every(text => !text.includes('T18:00') && !text.includes('+00:00')));
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.waitForFunction(projectId => window.BAIStudioMediaPreviewV68?.status().ready &&
      window.BAIStudioMediaPreviewV68.status().projectId === projectId &&
      document.querySelectorAll('#v07timeline .v89-cursor').length > 1, id);
    assert.equal((await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).mediaCount, 1);
    await page.locator('#v68play').click();
    await page.waitForTimeout(800);
    const playbackDebug = await page.evaluate(() => ({ status: window.BAIStudioMediaPreviewV68.status(), message: document.querySelector('#v68status').textContent, button: document.querySelector('#v68play').disabled }));
    assert.ok(playbackDebug.status.frame >= 40, JSON.stringify(playbackDebug));
    const moving = await page.evaluate(() => {
      const frame = window.BAIStudioMediaPreviewV68.status().frame;
      return { frame, cursor: parseFloat(document.querySelector('#v07timeline .v89-cursor').style.left), label: document.querySelector('#v89PlayheadLabel').textContent };
    });
    assert.ok(Math.abs(moving.cursor - moving.frame / 60 * 24) < 3, JSON.stringify(moving));
    assert.ok(moving.label.includes((moving.frame / 60).toFixed(2)), JSON.stringify(moving));
    await page.locator('#v68pause').click();
    const paused = (await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).frame;
    await page.waitForTimeout(130);
    assert.equal((await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).frame, paused);
    await page.locator('#v89ZoomIn').click();
    await page.waitForFunction(() => document.querySelector('#v89ZoomValue')?.textContent === '36 px/秒');
    assert.equal(await page.locator('#v89ZoomValue').textContent(), '36 px/秒');
    const zoomed = await page.evaluate(() => ({ cursor: parseFloat(document.querySelector('#v07timeline .v89-cursor').style.left), frame: window.BAIStudioMediaPreviewV68.status().frame }));
    assert.ok(Math.abs(zoomed.cursor - zoomed.frame / 60 * 36) < 3, JSON.stringify(zoomed));
    const slider = page.locator('#v07zoom');
    await slider.evaluate(element => { element.value = '60'; element.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#v89ZoomValue').textContent(), '60 px/秒');
    await slider.evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })));
    await page.waitForFunction(() => document.querySelector('#v07zoom')?.value === '60');
    const afterZoom = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    assert.equal(afterZoom.clips[0].start, 0);
    assert.equal(afterZoom.clips[0].duration, 4);
    await page.locator('#v89PlayheadInput').fill('2');
    await page.getByRole('button', { name: '指定秒へ移動' }).click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68.status().frame === 120);
    assert.equal(await page.locator('#v07timeline .v89-cursor').first().evaluate(element => parseFloat(element.style.left)), 120);
    await page.locator('#v68stop').click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68.status().frame === 0 &&
      parseFloat(document.querySelector('#v07timeline .v89-cursor').style.left) === 0);
    await page.locator('#v89PlayheadInput').fill('2');
    await page.getByRole('button', { name: '指定秒へ移動' }).click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68.status().frame === 120);
    await page.waitForFunction(async projectId =>
      (await (await fetch(`/api/studio/v05/playhead?id=${encodeURIComponent(projectId)}`)).json()).seconds === 2, id);
    await page.reload();
    await page.locator('#v06project').selectOption(id);
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68?.status().projectId === document.querySelector('#v06project').value &&
      window.BAIStudioMediaPreviewV68.status().frame === 120);
    assert.equal(await page.locator('#v07timeline .v89-cursor').first().evaluate(element => parseFloat(element.style.left)), 48);
    await page.locator('#v06project').selectOption(other.project.id);
    await page.waitForFunction(projectId => window.BAIStudioMediaPreviewV68?.status().projectId === projectId &&
      document.querySelector('#v89PlayheadLabel')?.textContent.includes('0.00秒'), other.project.id);
    assert.equal(await page.locator('#v07timeline .v89-cursor').first().evaluate(element => parseFloat(element.style.left)), 0);
  } finally { await page?.close(); await browser?.close(); await server.stop(); }
});
