'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const harness = require('./helpers/studio-harness.cjs');

const vrmFile = process.env.BAI_REAL_DANCE_VRM;
const motionFile = process.env.BAI_REAL_DANCE_GLB;
const glbModelFile = process.env.BAI_REAL_DANCE_MODEL_GLB;
const fbxModelFile = process.env.BAI_REAL_DANCE_MODEL_FBX;
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('registered VRM, GLB and FBX join music and dance, animate and survive reload',
  { skip: vrmFile && motionFile && glbModelFile && fbxModelFile ? false : 'set BAI_REAL_DANCE_VRM/GLB/MODEL_GLB/MODEL_FBX' }, async () => {
    const originals = [vrmFile, motionFile, glbModelFile, fbxModelFile];
    const before = originals.map(hash);
    const vrmName = 'local_dancer.vrm', motionName = 'local_motion.glb';
    const glbName = 'synthetic_model.glb', fbxName = 'synthetic_model.fbx';
    const seed = {
      [`integrated_v02/assets/${vrmName}`]: fs.readFileSync(vrmFile),
      [`integrated_v02/assets/${motionName}`]: fs.readFileSync(motionFile),
      [`integrated_v02/assets/${glbName}`]: fs.readFileSync(glbModelFile),
      [`integrated_v02/assets/${fbxName}`]: fs.readFileSync(fbxModelFile),
      'integrated_v02/user_assets.json': JSON.stringify([
        { id: 'real-vrm', name: 'Test VRM dancer', filename: vrmName, kind: 'model' },
        { id: 'real-glb', name: 'Test GLB dance', filename: motionName, kind: 'motion' },
        { id: 'synthetic-glb', name: 'Test GLB model', filename: glbName, kind: 'model' },
        { id: 'synthetic-fbx', name: 'Test FBX model', filename: fbxName, kind: 'model' },
      ]),
    };
    const browser = await harness.launchBrowser();
    const server = await harness.startServer({ port: 8867, seed });
    let page;
    try {
      page = await server.newPage(browser);
      await page.goto(`${server.base}/workspace/10`);
      await page.waitForFunction(() => document.querySelectorAll('[data-role="dance-model"] option').length >= 4);
      const options = await page.locator('[data-role="dance-model"] option').allTextContents();
      assert.ok(options.some((s) => s.includes('VRM')));
      assert.ok(options.some((s) => s.includes('GLB')));
      assert.ok(options.some((s) => s.includes('FBX')));
      await page.selectOption('[data-role="dance-model"]', `integrated:${vrmName}`);
      await page.waitForFunction(() => document.querySelector('[data-role="dance-pose-status"]')?.textContent.includes('VRMモデルを表示中'), null, { timeout: 60000 });
      await page.selectOption('[data-role="dance-motion"]', `integrated:${motionName}`);
      await page.waitForFunction(() => document.querySelector('[data-role="dance-pose-status"]')?.textContent.includes('骨で'), null, { timeout: 60000 });
      const canvas = page.locator('[data-role="dance-viewport"] canvas');
      const startImage = await canvas.screenshot();
      const durationFrames = Number(await page.getAttribute('[data-role="dance-head"]', 'max'));
      assert.ok(durationFrames > 10);
      await page.locator('[data-role="dance-head"]').fill(String(Math.min(durationFrames - 1, 30)));
      await page.locator('[data-role="dance-head"]').dispatchEvent('input');
      const movedImage = await canvas.screenshot();
      assert.notEqual(crypto.createHash('sha256').update(movedImage).digest('hex'), crypto.createHash('sha256').update(startImage).digest('hex'), 'VRM canvas must change after seeking the real dance');
      assert.match(await page.textContent('[data-role="dance-physics-status"]'), /VRMの物理演算は.*未対応/);
      await page.click('[data-role="dance-save"]');
      await page.waitForFunction(() => document.querySelector('[data-role="dance-save-status"]')?.textContent.includes('保存しました'));
      await page.reload();
      await page.waitForFunction(() => document.querySelector('[data-role="dance-model"]')?.value === 'integrated:local_dancer.vrm');
      await page.waitForFunction(() => document.querySelector('[data-role="dance-pose-status"]')?.textContent.includes('骨で'), null, { timeout: 60000 });
      assert.equal(await page.inputValue('[data-role="dance-motion"]'), `integrated:${motionName}`);
      for (const [name, format, toFrame] of [[glbName, 'GLB', 10], [fbxName, 'FBX', Math.min(durationFrames - 1, 30)]]) {
        await page.selectOption('[data-role="dance-model"]', `integrated:${name}`);
        await page.waitForFunction((expected) => document.querySelector('[data-role="dance-pose-status"]')?.textContent.includes(expected), `${format}の`, { timeout: 60000 });
        assert.match(await page.textContent('[data-role="dance-pose-status"]'), /骨で.*プレビュー中/);
        const start = await canvas.screenshot();
        await page.locator('[data-role="dance-head"]').fill(String(toFrame));
        await page.locator('[data-role="dance-head"]').dispatchEvent('input');
        const moved = await canvas.screenshot();
        assert.notEqual(crypto.createHash('sha256').update(start).digest('hex'), crypto.createHash('sha256').update(moved).digest('hex'), `${format} model canvas must move`);
      }
      harness.assertNoErrors(page);
    } finally {
      await page?.context().close(); await server.stop(); await browser.close();
      assert.deepEqual(originals.map(hash), before, 'source media must remain byte-identical');
    }
  });
