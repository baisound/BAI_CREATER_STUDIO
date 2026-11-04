'use strict';
// WP-L6 の 3D 描画の確認（設計書 WP-L6 の最後の項目）。取込のあとで 3D 場面を開くと、読み込まれたモデル数が 2（キャラクターとステージ）。
// three.js が無い環境では skip3d() で飛ばされる。飛ばされたら「未検証」と記録する（合格扱いにしない）。
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/studio-harness.cjs');
const seed = require('./helpers/legacy-import-seed.cjs');

test('after a legacy import, the 3D scene loads the imported character and stage (2 models)',
  { ...harness.skip3d(), timeout: 240000 }, async () => {
    const server = await harness.startServer({ port: 8942 });
    let browser, page;
    try {
      const ids = await seed.registerAssets(server.base);
      seed.writeLegacyFiles(server.dataDir, ids);
      const id = await seed.createProjectWithSnapshot(server.base, '取込3D確認');
      browser = await server.launchBrowser();
      page = await server.newPage(browser, { viewport: { width: 1280, height: 720 }, expectErrors: [/unknown char code \d+\./] });
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.evaluate(() => window.baiGo('projects'));
      const dialog = page.locator('#v188LegacyImport');
      await page.locator('#baiProjectList .baiCard', { has: page.locator('h3', { hasText: '取込3D確認' }) })
        .locator('[data-v05-legacy-import]').click();
      await dialog.locator('[data-act="start-apply"]').click();
      await dialog.locator('[data-act="confirm-apply"]').click();
      await page.waitForFunction(() => /^取り込みました/.test(document.querySelector('#v188LegacyImport [role="status"]')?.textContent || ''));
      const instances = (await (await fetch(`${server.base}/api/studio/v05/scene/instances?id=${id}`)).json()).instances;
      assert.equal(instances.length, 2);
      await dialog.locator('[data-act="close"]').click();
      await page.locator('#baiProjectList .baiCard', { has: page.locator('h3', { hasText: '取込3D確認' }) })
        .locator('[data-openproject]').click();
      await page.waitForFunction(value => document.querySelector('#v06project')?.value === value, id);
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(() => window.BAIStudioMultiScenePreview?.status().loaded === 2, null, { timeout: 120000 });
      const status = await page.evaluate(() => window.BAIStudioMultiScenePreview.status());
      assert.equal(status.loaded, 2);
      console.log(JSON.stringify({ loaded: status.loaded }));
      harness.assertNoErrors(page);
    } finally {
      await page?.close(); await browser?.close(); await server.stop();
    }
  });
