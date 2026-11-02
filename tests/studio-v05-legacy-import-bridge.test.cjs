'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const harness = require('./helpers/studio-harness.cjs');

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name));
const payloads = [
  { name: 'bridge-motion.glb', bytes: fixture('synthetic_test_model.glb'), kind: 'motion' },
  { name: 'bridge-character.vrm', bytes: fixture('synthetic_test_model.glb') },
  { name: 'bridge-pmx.zip', bytes: fixture('minimal_pmx.zip'), kind: 'A' },
  { name: 'bridge-motion.vmd', bytes: fixture('minimal.vmd') },
  { name: 'bridge-model.fbx', bytes: fixture('minimal_model.fbx'), kind: 'modelB' },
  { name: 'bridge-dance.fbx', bytes: fixture('minimal_motion.fbx'), kind: 'motions' },
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fbxId = (kind, name) => hash(Buffer.from(`${kind}\0${name}`)).slice(0, 24);
async function ok(response) {
  const body = await response.text();
  assert.equal(response.status, 200, body);
  return JSON.parse(body);
}

test('v0.5 links to legacy model and motion import; registered IDs return to its library and survive reload',
  { timeout: 180000 }, async () => {
    const originals = payloads.map(row => hash(row.bytes));
    const server = await harness.startServer({ port: 8920 });
    let browser, page, legacy;
    const legacyErrors = [];
    try {
      browser = await server.launchBrowser();
      page = await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('[data-go="library"]').first().click();
      assert.equal(await page.locator('#baiLegacyImport').getAttribute('href'), '/workspace/08');
      const popup = page.context().waitForEvent('page');
      await page.locator('#baiLegacyImport').click();
      legacy = await popup;
      legacy.on('pageerror', error => legacyErrors.push(String(error)));
      await legacy.bringToFront();
      await legacy.waitForURL(/\/workspace\/08/);
      await legacy.locator('[data-feature="assetLibrary"]').waitFor();
      await legacy.locator('.screen-head [data-role="open-import"]').click();
      await legacy.locator('[role="dialog"] [data-role="import-files"]').setInputFiles(
        payloads.map(row => ({ name: row.name, mimeType: 'application/octet-stream', buffer: row.bytes })));
      for (const row of payloads.filter(row => row.kind)) {
        await legacy.locator(`[role="dialog"] li[data-name="${row.name}"] select[data-role="kind"]`).selectOption(row.kind);
      }
      await legacy.locator('[role="dialog"] [data-role="import-go"]').click();
      await legacy.waitForFunction(names => names.every(name => {
        const status = document.querySelector(`[data-feature="importQueue"] tbody tr[data-name="${name}"] [data-role="status"]`);
        return status && status.textContent.trim() === '完了';
      }), payloads.map(row => row.name), { timeout: 60000 });
      const glbHash = hash(payloads[0].bytes).slice(0, 20);
      const expected = [
        `integrated:${glbHash}.glb`, `integrated:${glbHash}.vrm`, 'mmd:A:test.pmx',
        'mmd:vmd:bridge-motion.vmd', `fbx:${fbxId('modelB', 'bridge-model.fbx')}`,
        `fbx:${fbxId('motions', 'bridge-dance.fbx')}`,
      ];
      const inventory = await ok(await fetch(`${server.base}/api/assets`));
      assert.deepEqual(inventory.items.map(item => item.id).sort(), [...expected].sort());
      assert.ok(inventory.items.every(item => item.available));
      const pmx = inventory.items.find(item => item.id === 'mmd:A:test.pmx');
      assert.equal(pmx.format, 'PMX');
      assert.equal(fs.existsSync(path.join(server.dataDir, 'mmd', 'A', 'tex', 'a.png')), true);
      const vmdPath = path.join(server.dataDir, 'mmd', 'vmd', 'bridge-motion.vmd');
      assert.equal(hash(fs.readFileSync(vmdPath)), hash(payloads[3].bytes));
      const integrated = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'integrated_v02', 'user_assets.json'), 'utf8'));
      assert.equal(integrated.find(item => item.filename.endsWith('.glb')).kind, 'motion');
      assert.equal(integrated.find(item => item.filename.endsWith('.vrm')).kind, 'model');
      const manifest = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'manifest.json'), 'utf8'));
      assert.deepEqual(manifest.files.map(row => row.kind).sort(), ['modelB', 'motions']);
      for (const row of manifest.files) {
        const source = payloads.find(item => item.name === row.name);
        assert.equal(hash(fs.readFileSync(path.join(server.dataDir, 'files', `${row.id}.fbx`))), hash(source.bytes));
      }
      assert.deepEqual(legacyErrors, []);
      await legacy.close();
      legacy = null;
      await page.bringToFront();
      await page.waitForFunction(() => document.querySelector('#baiAssetCount')?.textContent.includes('登録6件'));
      for (const id of expected) {
        const card = page.locator(`[data-library-id="${id}"]`);
        assert.equal(await card.count(), 1, `v0.5に素材が表示されません: ${id}`);
        await card.click();
        assert.match(await page.locator('#baiAssetDetail').textContent(), /登録済み・利用可能/);
      }
      await page.reload();
      await page.locator('[data-go="library"]').first().click();
      await page.waitForFunction(() => document.querySelector('#baiAssetCount')?.textContent.includes('登録6件'));
      assert.deepEqual((await page.locator('[data-library-id]').evaluateAll(nodes => nodes.map(node => node.dataset.libraryId))).sort(),
        [...expected].sort());
      assert.deepEqual(payloads.map(row => hash(row.bytes)), originals, '入力fixtureを変更しない');
      harness.assertNoErrors(page);
      console.log(JSON.stringify({ registered: expected, sha256: originals }));
    } finally {
      await legacy?.close(); await page?.close(); await browser?.close(); await server.stop();
    }
  });
