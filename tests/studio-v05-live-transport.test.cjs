'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/studio-harness.cjs');

function wav() {
  const samples = 24000, data = Buffer.alloc(samples * 2), head = Buffer.alloc(44);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i * Math.PI / 16) * 5000), i * 2);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(8000, 24); head.writeUInt32LE(16000, 28); head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

test('v0.5 transport follows the real music/dance frame clock', async () => {
  const server = await harness.startServer({ port: 8883 });
  let browser, page;
  try {
    browser = await server.launchBrowser();
    const upload = await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=v05_transport.wav`, {
      method: 'POST', body: wav(),
    });
    assert.equal(upload.status, 200);
    const id = (await upload.json()).item.id;
    page = await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('[data-page="live-motion"]').first().click();
    await page.waitForFunction(() => document.getElementById('baiLiveFrame')?.contentDocument?.querySelector('[data-role="dance-audio"]'), null, { timeout: 8000 });
    await page.locator('#baiLivePlay').click();
    await page.waitForFunction(() => document.querySelector('#baiLiveFeedback')?.textContent.includes('選択してください'));
    assert.equal(await page.locator('#baiLivePause').isDisabled(), true);

    const child = page.frameLocator('#baiLiveFrame');
    await page.waitForFunction(() => document.getElementById('baiLiveFrame')?.contentDocument?.querySelector('[data-role="dance-audio"]')?.options.length > 1);
    await child.locator('[data-role="dance-audio"]').selectOption(id);
    await child.locator('[data-role="dance-status"]').getByText('配置しました', { exact: false }).waitFor();
    await page.locator('#baiLiveSeek').click();
    await page.locator('#baiLiveForward').click();
    await page.waitForFunction(() => document.getElementById('baiLiveFrameNumber')?.value === '1');
    await page.locator('#baiLiveFastForward').click();
    await page.waitForFunction(() => document.getElementById('baiLiveFrameNumber')?.value === '31');
    await page.locator('#baiLiveRewind').click();
    await page.waitForFunction(() => document.getElementById('baiLiveFrameNumber')?.value === '1');
    await page.locator('#baiLiveBack').click();
    await page.waitForFunction(() => document.getElementById('baiLiveFrameNumber')?.value === '0');
    await page.locator('#baiLivePlay').click();
    await page.waitForFunction(() => Number(document.getElementById('baiLiveFrameNumber')?.value) > 5);
    assert.equal(await page.locator('#baiLivePause').isDisabled(), false);
    await page.locator('#baiLivePause').click();
    await page.waitForFunction(() => document.getElementById('baiLivePause')?.disabled);
    const paused = Number(await page.locator('#baiLiveFrameNumber').inputValue());
    await page.waitForTimeout(150);
    assert.equal(Number(await page.locator('#baiLiveFrameNumber').inputValue()), paused);
    await page.locator('#baiLiveStop').click();
    await page.waitForFunction(() => document.getElementById('baiLiveFrameNumber')?.value === '0');
    assert.match(await page.locator('#baiLiveSeconds').textContent(), /0\.00 秒/);
    harness.assertNoErrors(page);
  } finally {
    await page?.context().close();
    await browser?.close();
    await server.stop();
  }
});
