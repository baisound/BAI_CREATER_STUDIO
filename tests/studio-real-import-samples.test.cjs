'use strict';
// CC0実素材の任意検査。取得したZIPはGitに含めず、tools/prepare_sample_import_assets.py の生成結果を使う。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

const ready = path.resolve(__dirname, '..', 'data', 'sample_imports_20261021', 'ready');
const manifestPath = path.join(ready, 'manifest.json');
const haveSamples = fs.existsSync(manifestPath);

test('Kenney CC0 sample set imports, displays, and saves derived previews', { skip: haveSamples ? false : 'download and prepare sample pack first' }, async () => {
  const browser = await harness.launchBrowser();
  const server = await harness.startServer({ port: Number(process.env.REAL_SAMPLES_PORT || 8798), seed: {} });
  let page;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const samples = manifest.outputs.filter((x) => ['stage', 'prop', 'material', 'fx', 'audio', 'video', 'image'].includes(x.kind));
    for (const sample of samples) {
      const bytes = fs.readFileSync(path.join(ready, sample.file));
      const response = await fetch(`${server.base}/api/library-assets/upload?kind=${sample.kind}&name=${encodeURIComponent(sample.file)}`, { method: 'POST', body: bytes });
      assert.equal(response.status, 200, `${sample.file}: ${await response.text()}`);
    }
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/08`, { waitUntil: 'domcontentloaded' });
    const shotDir = process.env.REAL_SAMPLE_SHOTS;
    if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
    const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name), type: 'png' }); };
    await page.waitForFunction((n) => document.querySelectorAll('[data-feature="assetLibrary"] .asset').length === n, samples.length);
    const expected = { stage: 1, prop: 1, mat: 1, fx: 1, audio: 2, video: 1, image: 1 };
    for (const [cat, count] of Object.entries(expected)) {
      assert.equal(await page.textContent(`[data-feature="assetCategories"] li[data-cat="${cat}"] [data-role="count"]`), String(count));
    }
    await page.click('[data-feature="assetCategories"] li[data-cat="audio"]');
    await page.locator('[data-feature="assetLibrary"] .asset').filter({ hasText: 'Kenney UI Audio Preview' }).click();
    await page.waitForSelector('[data-role="audio-waveform"][src*="thumbnail"]', { timeout: 15000 });
    assert.equal(await page.textContent('[data-feature="assetDetail"] [data-key="titleSource"]'), 'ファイル内のメタデータ');
    await shot('audio-waveform.png');
    await page.click('[data-feature="assetCategories"] li[data-cat="video"]');
    await page.click('[data-feature="assetLibrary"] .asset');
    await page.waitForFunction(() => document.querySelector('[data-role="video-media"]')?.poster.includes('/api/library-assets/thumbnail/'), null, { timeout: 15000 });
    await shot('video-poster.png');
    await page.click('[data-feature="assetCategories"] li[data-cat="stage"]');
    await page.click('[data-feature="assetLibrary"] .asset');
    await page.waitForSelector('[data-role="library-3d"] canvas', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('[data-role="library-preview-status"]')?.textContent.includes('回転'), null, { timeout: 15000 });
    await page.click('[data-role="show-3d"]');
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'CANVAS');
    await shot('stage-preview.png');
    const entries = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'library_assets', 'index.json'), 'utf8')).items;
    assert.equal(entries.length, samples.length);
    assert.ok(fs.readdirSync(path.join(server.dataDir, 'library_assets', 'thumbnails')).length >= 3);
    harness.assertNoErrors(page);
  } finally {
    await page?.context().close();
    await server.stop();
    await browser.close();
  }
});
