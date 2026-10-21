import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const harness = require('./helpers/studio-harness.cjs');

const html = readFileSync('camera.html', 'utf8');
const inventory = JSON.parse(readFileSync('studio/js/camera/legacy-ids.json', 'utf8'));
const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

test('camera ID inventory covers the current legacy markup and source selectors', () => {
  assert.equal(new Set(htmlIds).size, htmlIds.length, 'camera.html IDs are unique');
  assert.equal(inventory.count, htmlIds.length);
  assert.deepEqual(inventory.elements.map((entry) => entry.id), htmlIds);
  const slots = new Set(['toolbar', 'shots', 'center', 'camera', 'focus', 'rail', 'interpolation', 'timeline']);
  for (const entry of inventory.elements) assert.ok(slots.has(entry.slot), `slot for ${entry.id}`);
  const referenced = ['camera.js', 'camera_3d.js'].flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]));
  for (const id of referenced) assert.ok(htmlIds.includes(id), `legacy source references #${id}`);
  for (const selector of ['.preview-shell', '.camera-frame', '.dual-views', '[data-camera-move]']) {
    assert.ok(html.includes(selector.startsWith('.') ? selector.slice(1) : 'data-camera-move='), `markup keeps ${selector}`);
  }
});

test('SCR-02 contains every camera ID once and no page-wide duplicate', harness.skip3d(), async () => {
  const server = await harness.startServer({ port: 8795 });
  const browser = await server.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/02`);
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio', null, { timeout: 30000 });
    const present = await page.locator('[data-feature="cameraHost"] [id]').evaluateAll((els) => els.map((el) => el.id));
    for (const id of htmlIds) assert.ok(present.includes(id), `mounted DOM keeps #${id}`);
    assert.deepEqual(new Set(present.filter((id) => !htmlIds.includes(id))),
      new Set(['position0', 'position1', 'position2', 'target0', 'target1', 'target2']),
      'camera.js creates six XYZ fields after mount');
    const all = await page.locator('[id]').evaluateAll((els) => els.map((el) => el.id));
    assert.equal(all.length, new Set(all).size, 'all page IDs are unique');
    for (const selector of ['.preview-shell', '.camera-frame', '.dual-views', '[data-camera-move]']) {
      assert.ok(await page.locator(`[data-feature="cameraHost"] ${selector}`).count() > 0, selector);
    }
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await browser.close(); await server.stop(); }
});
