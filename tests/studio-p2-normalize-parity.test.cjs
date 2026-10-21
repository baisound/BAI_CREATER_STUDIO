'use strict';
// 照合（P2 設計 §2.4(g)）：新UIの単体表示の正規化（viewport/normalize.fork.js）が、旧カメラ画面（camera_3d.js:278）と同じ結果になる。
// 同じ合成 GLB を /camera.html の［3Dモデルを表示］で読み、publishModelFraming の bai-camera-model-bounds の min/max と、
// SCR-12 の3Dビューの包囲箱を比べる（誤差 1e-6）。three が無い環境では skip（理由付き）。ポート：P2_PARITY_PORT（既定 8793）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.P2_PARITY_PORT || 8793);
const GLB = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'));
const STORED = 'aaaaaaaaaaaaaaaaaaaa.glb';

let browser;
test.before(async () => { if (harness.haveThree()) browser = await harness.launchBrowser(); });
test.after(async () => { await browser?.close(); });

test('normalized bounds match the camera page', harness.skip3d(), async () => {
  const server = await harness.startServer({ port: PORT, seed: {
    [`integrated_v02/assets/${STORED}`]: GLB,
    'integrated_v02/user_assets.json': JSON.stringify([{ id: 'user-aaaaaaaaaaaaaaaaaaaa', name: 'seed-model.glb', filename: STORED, kind: 'model', bytes: GLB.length }]),
  } });
  try {
    const page = await server.newPage(browser);
    // 旧カメラ画面
    await page.goto(`${server.base}/camera.html`);
    await page.waitForFunction((v) => Array.from(document.getElementById('camera-asset')?.options || []).some((o) => o.value === v), STORED, { timeout: 10000 });
    await page.evaluate(() => { window.__bounds = null; window.addEventListener('bai-camera-model-bounds', (e) => { if (e.detail && e.detail.source === 'model') window.__bounds = e.detail; }); });
    await page.selectOption('#camera-asset', STORED);
    await page.click('#camera-load-asset');
    await page.waitForFunction(() => window.__bounds !== null, null, { timeout: 20000 });
    const legacy = await page.evaluate(() => ({ min: window.__bounds.min, max: window.__bounds.max }));
    // 新UI
    await page.goto(`${server.base}/workspace/12?asset=${encodeURIComponent(`integrated:${STORED}`)}`);
    await page.waitForFunction(() => window.baiStudio.viewport.getState().loaded === true, null, { timeout: 20000 });
    const s = await page.evaluate(() => window.baiStudio.viewport.getState());
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(s.bounds.min[i] - legacy.min[i]) <= 1e-6, `min[${i}]: 新 ${s.bounds.min[i]} 旧 ${legacy.min[i]}`);
      assert.ok(Math.abs(s.bounds.max[i] - legacy.max[i]) <= 1e-6, `max[${i}]: 新 ${s.bounds.max[i]} 旧 ${legacy.max[i]}`);
    }
    harness.assertNoErrors(page);
    await page.context().close();
  } finally { await server.stop(); }
});
