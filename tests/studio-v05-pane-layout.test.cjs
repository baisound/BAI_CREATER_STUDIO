'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/studio-harness.cjs');

let server;
let browser;
test.before(async () => {
  server = await harness.startServer({ port: 8878 });
  browser = await server.launchBrowser();
});
test.after(async () => {
  await browser?.close();
  await server?.stop();
});

test('shared editor panes resize, persist across tabs and reload, and reset', async () => {
  const page = await server.newPage(browser);
  try {
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#baiLeftPaneHandle').waitFor();
    assert.equal(await page.locator('#nav [data-workspace="assets"]').count(), 0);
    const left = page.locator('.main .left');
    const timeline = page.locator('.main .timeline');
    const initialLeft = (await left.boundingBox()).width;
    const initialBottom = (await timeline.boundingBox()).height;

    const leftHandle = await page.locator('#baiLeftPaneHandle').boundingBox();
    await page.mouse.move(leftHandle.x + leftHandle.width / 2, leftHandle.y + 70);
    await page.mouse.down();
    await page.mouse.move(leftHandle.x + leftHandle.width / 2 + 84, leftHandle.y + 70, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction((before) => document.querySelector('.main .left').getBoundingClientRect().width > before + 60, initialLeft);
    const changedLeft = (await left.boundingBox()).width;

    const bottomHandle = await page.locator('#baiBottomPaneHandle').boundingBox();
    await page.mouse.move(bottomHandle.x + 180, bottomHandle.y + bottomHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(bottomHandle.x + 180, bottomHandle.y + bottomHandle.height / 2 - 70, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction((before) => document.querySelector('.main .timeline').getBoundingClientRect().height > before + 50, initialBottom);
    const changedBottom = (await timeline.boundingBox()).height;

    for (const workspace of ['motion', 'camera', 'edit']) {
      await page.locator(`#nav [data-workspace="${workspace}"]`).click();
      assert.ok(Math.abs((await left.boundingBox()).width - changedLeft) < 2);
      assert.ok(Math.abs((await timeline.boundingBox()).height - changedBottom) < 2);
    }
    await page.reload();
    await page.locator('#baiLeftPaneHandle').waitFor();
    await page.locator('#nav [data-workspace="edit"]').click();
    assert.ok(Math.abs((await left.boundingBox()).width - changedLeft) < 2);
    assert.ok(Math.abs((await timeline.boundingBox()).height - changedBottom) < 2);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bai.v05.paneLayout.v1')));
    assert.equal(saved.version, 1);
    assert.ok(saved.left > initialLeft);

    await page.locator('#baiLeftPaneHandle').focus();
    await page.keyboard.press('ArrowRight');
    assert.ok((await left.boundingBox()).width > changedLeft + 10);
    await page.locator('#baiPaneReset').click();
    assert.ok(Math.abs((await left.boundingBox()).width - initialLeft) < 2);
    assert.ok(Math.abs((await timeline.boundingBox()).height - initialBottom) < 2);
    assert.equal(await page.evaluate(() => localStorage.getItem('bai.v05.paneLayout.v1')), null);

    await page.evaluate(() => window.baiGo('assets'));
    assert.equal(await page.locator('#nav [data-workspace="edit"]').getAttribute('class').then((value) => value.includes('on')), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('#baiLeftPaneHandle').isVisible(), false);
    harness.assertNoErrors(page);
  } finally {
    await page.context().close();
  }
});
