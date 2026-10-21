'use strict';
// Optional private-source QA. Pass real character GLB and motion FBX paths; only isolated data is written.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

async function portraitPixels(page, url) {
  return page.evaluate(async (imageUrl) => {
    const image = new Image(); image.src = imageUrl; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let figure = 0; const colors = new Set();
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.abs(r - 0x17) + Math.abs(g - 0x26) + Math.abs(b - 0x38) <= 24) continue;
      figure++;
      colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
    }
    return { figure, colors: colors.size };
  }, url);
}

const character = process.env.REAL_CHARACTER_PATH || process.env.REAL_CHARACTER_GLB;
const motion = process.env.REAL_MOTION_FBX;
test('real character portrait and real FBX grayman render without changing sources', {
  skip: character && motion && fs.existsSync(character) && fs.existsSync(motion) ? false : 'real character/motion paths are not set',
}, async () => {
  const modelBytes = fs.readFileSync(character), motionBytes = fs.readFileSync(motion);
  const charName = 'real-character' + path.extname(character).toLowerCase(), motionId = 'e75ac5f672e1ba0d46a957e9';
  const server = await harness.startServer({ port: 8817, seed: {
    [`integrated_v02/assets/${charName}`]: modelBytes,
    'integrated_v02/user_assets.json': JSON.stringify([{ id: 'user-real-character', name: charName, filename: charName, kind: 'model', bytes: modelBytes.length }]),
    [`files/${motionId}.fbx`]: motionBytes,
    'manifest.json': JSON.stringify({ files: [{ id: motionId, name: 'real-motion.fbx', kind: 'motions', size: motionBytes.length }], mapping: {} }),
  } });
  const browser = await harness.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/08?cat=char`);
    const card = page.locator(`[data-asset-id="integrated:${charName}"]`);
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction((id) => !!document.querySelector(`[data-asset-id="${id}"] img[src*="/api/assets/thumbnail/"]`), `integrated:${charName}`, { timeout: 45000 });
    const item = (await (await fetch(`${server.base}/api/assets`)).json()).items.find((entry) => entry.id === `integrated:${charName}`);
    assert.ok(item.thumbnailUrl);
    const saved = path.join(server.dataDir, 'asset_thumbnails', `${item.thumbnailKey}.png`);
    assert.ok(fs.existsSync(saved));
    const portrait = await portraitPixels(page, item.thumbnailUrl);
    assert.ok(portrait.figure > 1000 && portrait.colors > 20, `character portrait should contain a visible model: ${JSON.stringify(portrait)}`);
    if (process.env.REAL_CHAR_SHOT) fs.copyFileSync(saved, process.env.REAL_CHAR_SHOT);
    assert.deepEqual(fs.readFileSync(character), modelBytes, 'source GLB must remain unchanged');

    await page.goto(`${server.base}/workspace/08?cat=motion`);
    await page.click('[data-feature="assetCategories"] li[data-cat="motion"]');
    await page.click(`[data-asset-id="fbx:${motionId}"]`);
    await page.waitForFunction(() => document.querySelector('[data-role="motion-preview"]')?.dataset.grayman === '1', null, { timeout: 45000 });
    await page.click('[data-role="preview-pause"]');
    const pose = async (part) => page.evaluate(async (fraction) => {
      const seek = document.querySelector('[data-role="preview-seek"]');
      seek.value = String(Number(seek.max) * fraction); seek.dispatchEvent(new Event('input', { bubbles: true }));
      const { currentViewport } = await import('/studio/js/viewport/three-host.js');
      const figure = currentViewport().content.getObjectByName('Neutral Grayman');
      return figure.children.flatMap((node) => [...node.position.toArray(), ...node.quaternion.toArray()]);
    }, part);
    const first = await pose(0), later = await pose(0.55);
    assert.equal(first.length, later.length);
    assert.ok(first.some((value, index) => Math.abs(value - later[index]) > 0.04), 'grayman pose must change with real motion');
    if (process.env.REAL_GRAYMAN_SHOT) await page.locator('[data-role="motion-preview"]').screenshot({ path: process.env.REAL_GRAYMAN_SHOT });
    assert.deepEqual(fs.readFileSync(motion), motionBytes, 'source FBX must remain unchanged');
    harness.assertNoErrors(page);
  } finally {
    await page?.context().close(); await browser.close(); await server.stop();
  }
});

const vrm = process.env.REAL_VRM_PATH;
test('real VRM front portrait shows a visible character', {
  skip: vrm && fs.existsSync(vrm) ? false : 'REAL_VRM_PATH is not set',
}, async () => {
  const original = fs.readFileSync(vrm), name = 'real-vrm.vrm';
  const server = await harness.startServer({ port: 8820, seed: {
    [`integrated_v02/assets/${name}`]: original,
    'integrated_v02/user_assets.json': JSON.stringify([{ id: 'user-real-vrm', name, filename: name, kind: 'model', bytes: original.length }]),
  } });
  const browser = await harness.launchBrowser(); let page;
  try {
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/08?cat=char`);
    const id = `integrated:${name}`;
    await page.waitForFunction((assetId) => !!document.querySelector(`[data-asset-id="${assetId}"] img[src*="/api/assets/thumbnail/"]`), id, { timeout: 45000 });
    const item = (await (await fetch(`${server.base}/api/assets`)).json()).items.find((entry) => entry.id === id);
    const portrait = await portraitPixels(page, item.thumbnailUrl);
    assert.ok(portrait.figure > 1000 && portrait.colors > 20, `VRM portrait should contain a visible character: ${JSON.stringify(portrait)}`);
    if (process.env.REAL_VRM_SHOT) fs.copyFileSync(path.join(server.dataDir, 'asset_thumbnails', `${item.thumbnailKey}.png`), process.env.REAL_VRM_SHOT);
    assert.deepEqual(fs.readFileSync(vrm), original);
    harness.assertNoErrors(page);
  } finally {
    await page?.context().close(); await browser.close(); await server.stop();
  }
});

const pmx = process.env.REAL_PMX_PATH;
test('real PMX front image is generated with its sibling textures', {
  skip: pmx && fs.existsSync(pmx) ? false : 'REAL_PMX_PATH is not set',
}, async () => {
  const folder = path.dirname(pmx), name = path.basename(pmx), original = fs.readFileSync(pmx);
  const entries = [{ name, size: original.length }];
  const seed = { [`mmd/A/${name}`]: original };
  const addFiles = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) addFiles(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(folder, absolute).replaceAll('\\', '/');
        seed['mmd/A/' + relative] = fs.readFileSync(absolute);
        if (relative !== name) entries.push({ name: relative, size: entry.isFile() ? fs.statSync(absolute).size : 0 });
      }
    }
  };
  addFiles(folder);
  seed['mmd_assets.json'] = JSON.stringify({ A: entries, B: [], vmd: [] });
  const server = await harness.startServer({ port: 8818, seed });
  const browser = await harness.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/08?cat=char`);
    const id = `mmd:A:${name}`;
    await page.waitForFunction((assetId) => !!document.querySelector(`[data-asset-id="${assetId}"] img[src*="/api/assets/thumbnail/"]`), id, { timeout: 15000 });
    const item = (await (await fetch(`${server.base}/api/assets`)).json()).items.find((entry) => entry.id === id);
    assert.ok(item.thumbnailUrl);
    const saved = path.join(server.dataDir, 'asset_thumbnails', `${item.thumbnailKey}.png`);
    assert.ok(fs.existsSync(saved));
    const portrait = await portraitPixels(page, item.thumbnailUrl);
    assert.ok(portrait.figure > 1000 && portrait.colors > 20, `PMX portrait should contain a textured model: ${JSON.stringify(portrait)}`);
    if (process.env.REAL_PMX_SHOT) fs.copyFileSync(saved, process.env.REAL_PMX_SHOT);
    assert.deepEqual(fs.readFileSync(pmx), original, 'source PMX must remain unchanged');
    harness.assertNoErrors(page);
  } finally {
    await page?.context().close(); await browser.close(); await server.stop();
  }
});

const vmd = process.env.REAL_VMD_PATH;
test('real VMD drives a neutral figure through a real PMX skeleton', {
  skip: pmx && vmd && fs.existsSync(pmx) && fs.existsSync(vmd) ? false : 'REAL_PMX_PATH and REAL_VMD_PATH are not set',
}, async () => {
  const folder = path.dirname(pmx), modelName = path.basename(pmx), motionName = path.basename(vmd);
  const modelBytes = fs.readFileSync(pmx), motionBytes = fs.readFileSync(vmd);
  const seed = { [`mmd/A/${modelName}`]: modelBytes, [`mmd/vmd/${motionName}`]: motionBytes };
  const entries = [{ name: modelName, size: modelBytes.length }];
  const addFiles = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) addFiles(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(folder, absolute).replaceAll('\\', '/');
        seed['mmd/A/' + relative] = fs.readFileSync(absolute);
        if (relative !== modelName) entries.push({ name: relative, size: fs.statSync(absolute).size });
      }
    }
  };
  addFiles(folder);
  seed['mmd_assets.json'] = JSON.stringify({ A: entries, B: [], vmd: [{ name: motionName, size: motionBytes.length }] });
  const server = await harness.startServer({ port: 8819, seed });
  // Keep the portrait backfill from loading the same texture set in parallel
  // with this VMD playback test; portrait generation is checked above.
  const catalog = (await (await fetch(`${server.base}/api/assets`)).json()).items;
  const modelItem = catalog.find((entry) => entry.format === 'PMX' && entry.name === modelName);
  assert.ok(modelItem?.thumbnailKey);
  const cache = path.join(server.dataDir, 'asset_thumbnails'); fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, `${modelItem.thumbnailKey}.png`), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64'));
  const browser = await harness.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/08?cat=motion`);
    const items = (await (await fetch(`${server.base}/api/assets`)).json()).items;
    const item = items.find((entry) => entry.format === 'VMD' && entry.name === motionName);
    assert.ok(item, 'real VMD should appear in the motion category');
    await page.click(`[data-asset-id="${item.id}"]`);
    await page.waitForFunction(() => document.querySelector('[data-role="motion-preview"]')?.dataset.grayman === '1', null, { timeout: 45000 });
    await page.click('[data-role="preview-pause"]');
    const pose = async (fraction) => page.evaluate(async (part) => {
      const seek = document.querySelector('[data-role="preview-seek"]');
      seek.value = String(Number(seek.max) * part); seek.dispatchEvent(new Event('input', { bubbles: true }));
      const { currentViewport } = await import('/studio/js/viewport/three-host.js');
      const figure = currentViewport().content.getObjectByName('Neutral Grayman');
      return figure.children.flatMap((node) => [...node.position.toArray(), ...node.quaternion.toArray()]);
    }, fraction);
    const first = await pose(0), later = await pose(0.6);
    assert.ok(first.some((value, index) => Math.abs(value - later[index]) > 0.02), 'real VMD should move the figure');
    if (process.env.REAL_VMD_SHOT) await page.locator('[data-role="motion-preview"]').screenshot({ path: process.env.REAL_VMD_SHOT });
    assert.deepEqual(fs.readFileSync(pmx), modelBytes);
    assert.deepEqual(fs.readFileSync(vmd), motionBytes);
    harness.assertNoErrors(page);
  } finally {
    await page?.context().close(); await browser.close(); await server.stop();
  }
});
