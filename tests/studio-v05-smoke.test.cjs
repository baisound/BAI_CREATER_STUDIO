'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/studio-harness.cjs');

let server;
let browser;

test.before(async () => {
  server = await harness.startServer({ port: 8876 });
  browser = await server.launchBrowser();
});

test.after(async () => {
  await browser?.close();
  await server?.stop();
});

test('v0.5 editor opens and reaches the asset library', async () => {
  const page = await server.newPage(browser);
  try {
    const response = await page.goto(`${server.base}/studio/v05/index.html`);
    assert.equal(response?.status(), 200);
    await page.locator('.brand').waitFor();
    await page.locator('#bai-library').waitFor({ state: 'attached' });
    await page.locator('[data-go="library"]').first().click();
    await page.waitForFunction(() => document.querySelector('#bai-library')?.classList.contains('active'));
    harness.assertNoErrors(page);
  } finally {
    await page.context().close();
  }
});
