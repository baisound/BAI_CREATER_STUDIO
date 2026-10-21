'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.LEGACY_CAMERA_TEST_PORT || 8862);
const GLB = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'));

test('旧カメラは人物を収め、既存キーの後に一周を作り、終点から再生し直せる', harness.skip3d(), async () => {
  const server = await harness.startServer({ port: PORT, seed: {
    'integrated_v02/assets/synthetic_test_model.glb': GLB,
    'integrated_v02/catalog.json': JSON.stringify({ models: [], motions: [{ name: '合成テスト / test30', source_asset: 'assets/synthetic_test_model.glb' }] }),
  } });
  let browser;
  try {
    browser = await server.launchBrowser();
    const page = await server.newPage(browser, { viewport: { width: 1600, height: 900 } });
    await page.addInitScript(() => { window.cameraBoundsForTest = null; window.addEventListener('bai-camera-model-bounds', e => { window.cameraBoundsForTest = e.detail; }); });
    await page.goto(`${server.base}/camera.html`);
    await page.waitForFunction(() => /最後のカメラキー: 90/.test(document.querySelector('#camera-playback-info')?.textContent || ''));
    await page.click('#rig-orbit-full');
    assert.match(await page.locator('#rig-bake-status').textContent(), /91～300フレームに一周/);
    const poseAt = async (frame) => {
      await page.locator('#frame-number').fill(String(frame));
      await page.locator('#frame-number').dispatchEvent('change');
      return JSON.parse(await page.locator('#sample').textContent()).position;
    };
    const first = await poseAt(91), quarter = await poseAt(143), half = await poseAt(195), last = await poseAt(300);
    const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
    assert.ok(distance(first, quarter) > 3 && distance(first, half) > 7, '途中の構図が人物の周りを移る');
    assert.ok(distance(first, last) < 0.01, '360度で開始位置へ戻る');
    assert.match(await page.locator('#camera-playback-info').textContent(), /最後のカメラキー: 300/);
    if (process.env.CAMERA_ISSUE_SHOT_DIR) {
      await poseAt(195);
      fs.mkdirSync(process.env.CAMERA_ISSUE_SHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.CAMERA_ISSUE_SHOT_DIR, 'guide_orbit_after.png') });
      await poseAt(300);
    }
    await page.click('#play');
    await page.waitForTimeout(450);
    assert.ok(Number(await page.locator('#frame-number').inputValue()) < 100, '終点からの再生は先頭へ戻る');
    await page.click('#play');

    await page.selectOption('#camera-asset', 'synthetic_test_model.glb');
    await page.click('#camera-load-asset');
    await page.waitForFunction(() => /3D表示中/.test(document.querySelector('#camera-asset-status')?.textContent || ''));
    assert.match(await page.locator('#camera-asset-status').textContent(), /test30.*繰り返し/);
    const bounds = await page.evaluate(() => window.cameraBoundsForTest);
    assert.ok(bounds && bounds.min[1] > -0.3 && bounds.max[1] < 3, JSON.stringify(bounds));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bai-camera-face-target', { detail: { point: [0, 1.75, 0.05] } })));
    await page.selectOption('#preset', 'close'); await page.click('#preset-apply');
    assert.ok(Math.abs(Number(await page.locator('#target1').inputValue()) - 1.75) < 0.01, '顔アップは目の高さを注視する');
    assert.ok(Math.abs(Number(await page.locator('#position2').inputValue()) - 0.6) < 0.01, '顔アップは顔へ近づく');
    await page.selectOption('#rig-type', 'orbit'); await page.click('#rig-apply');
    assert.ok(Math.abs(Number(await page.locator('#target1').inputValue()) - 1.75) < 0.01, '静止オービットでも顔を注視し続ける');
    await page.selectOption('#preset', 'front'); await page.click('#preset-apply');
    assert.equal(await page.locator('#preview').evaluate(el => getComputedStyle(el).visibility), 'hidden');
    const preview = await page.locator('.preview-shell').boundingBox();
    assert.ok(preview);
    await page.mouse.move(preview.x + preview.width / 2, preview.y + preview.height / 2);
    await page.mouse.down();
    await page.mouse.move(preview.x + preview.width / 2 + 90, preview.y + preview.height / 2 + 10, { steps: 5 });
    const during = await page.locator('#position0').inputValue();
    assert.ok(Math.abs(Number(during)) > 0.1, `モデル表示中もドラッグ中に撮影カメラが回る: ${during}`);
    await page.mouse.up();
    assert.equal(fs.existsSync(path.join(server.dataDir, 'camera_project.json')), false, '画面の試操作は保存されない');
    harness.assertNoErrors(page);
    await page.close();
  } finally { if (browser) await browser.close(); await server.stop(); }
});
