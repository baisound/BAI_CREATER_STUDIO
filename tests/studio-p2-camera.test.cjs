'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const harness = require('./helpers/studio-harness.cjs');

function pmxEntry(wanted) {
  const zip = fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal_pmx.zip'));
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let cursor = zip.readUInt32LE(eocd + 16);
  for (let i = 0, n = zip.readUInt16LE(eocd + 10); i < n; i++) {
    const method = zip.readUInt16LE(cursor + 10), size = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28), extra = zip.readUInt16LE(cursor + 30), comment = zip.readUInt16LE(cursor + 32);
    const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength), local = zip.readUInt32LE(cursor + 42);
    if (name === wanted) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const raw = zip.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    }
    cursor += 46 + nameLength + extra + comment;
  }
  throw Error(`PMX fixture entry missing: ${wanted}`);
}

test('camera host keeps keys across studio routes', harness.skip3d(), async () => {
  let server;
  for (let port = 8794; port <= 8804; port++) {
    try { server = await harness.startServer({ port }); break; }
    catch (error) { if (!/既に使われています/.test(String(error))) throw error; }
  }
  assert.ok(server, 'camera test needs an unused isolated port');
  const browser = await server.launchBrowser();
  let page;
  try {
    const coreResponse = await fetch(`${server.base}/camera_bundle_core.js`);
    assert.equal(coreResponse.status, 200);
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/02`);
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio' &&
      document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
    assert.equal(await page.locator('[data-feature="cameraHost"] #scene').count(), 1);
    assert.equal(await page.locator('[data-feature="cameraHost"] #preview').count(), 1);
    assert.equal(await page.locator('[data-feature="cameraHost"] .view-3d-canvas').count(), 2);
    const sceneSize = await page.locator('#scene').boundingBox();
    assert.ok(sceneSize && sceneSize.width > 100 && sceneSize.height > 100, 'scene has usable dimensions');
    await page.click('.camera-host-tabs [data-camera-tab="focus"]');
    assert.equal(await page.locator('#focus-lens:visible').count(), 1);
    await page.click('.camera-host-tabs [data-camera-tab="rail"]');
    assert.equal(await page.locator('#rig-type:visible').count(), 1);
    await page.click('.camera-host-tabs [data-camera-tab="easing"]');
    assert.equal(await page.locator('#interpolation:visible').count(), 1);
    await page.click('.camera-host-tabs [data-camera-tab="camera"]');
    const firstCount = await page.locator('#track button').count();
    await page.fill('#frame-number', '37');
    await page.locator('#frame-number').dispatchEvent('change');
    await page.click('#add');
    assert.equal(await page.locator('#track button').count(), firstCount + 1);
    assert.equal(await page.evaluate(() => window.BAICameraPage.handle().isDirty()), true);
    await page.evaluate(() => window.baiStudio.navigate('08'));
    await page.waitForFunction(() => location.pathname.endsWith('/08'));
    assert.equal(await page.locator('#keepalive [data-feature="cameraHost"]').count(), 1);
    await page.evaluate(() => window.baiStudio.navigate('02'));
    await page.waitForFunction(() => location.pathname.endsWith('/02'));
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio');
    await page.fill('#frame-number', '41');
    await page.locator('#frame-number').dispatchEvent('change');
    await page.click('#add');
    const kept = await page.locator('#track button').count();
    await page.evaluate(() => window.baiStudio.navigate('08'));
    await page.waitForFunction(() => location.pathname.endsWith('/08'));
    assert.equal(await page.locator('#keepalive [data-feature="cameraHost"]').count(), 1);
    await page.evaluate(() => window.baiStudio.navigate('02'));
    await page.waitForFunction(() => location.pathname.endsWith('/02'));
    assert.equal(await page.locator('#track button').count(), kept);
    assert.equal(await page.evaluate(() => window.BAICameraPage.handle().isDirty()), true);
    await page.click('#undo');
    assert.equal(await page.locator('#track button').count(), kept - 1);
    await page.click('#redo');
    assert.equal(await page.locator('#track button').count(), kept);
    await page.evaluate(() => window.baiStudio.navigate('03'));
    await page.click('.screen-head button:has-text("撮影画面のフォーカスタブへ")');
    await page.waitForFunction(() => location.pathname.endsWith('/02') && new URLSearchParams(location.search).get('tab') === 'focus');
    assert.equal(await page.locator('#main .camera-host-tabs [data-camera-tab="focus"][aria-selected="true"]').count(), 1);
    assert.equal(await page.locator('#track button').count(), kept);
    await page.click('#save');
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === '保存しました');
    await page.reload();
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio' &&
      document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
    assert.equal(await page.locator('#track button').count(), kept);
    await page.goto(`${server.base}/camera.html`);
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'legacy' &&
      document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
    assert.equal(await page.locator('#track button').count(), kept, 'the legacy page reads the keys saved from SCR-02');
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await browser.close(); await server.stop(); }
});

test('camera host does not mount on an unreadable camera file', async () => {
  const server = await harness.startServer({ port: 8796, seed: { 'camera_project.json': '{ invalid' } });
  const original = fs.readFileSync(path.join(server.dataDir, 'camera_project.json'));
  const browser = await server.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser, { expectErrors: [/422 \(Unprocessable Entity\)/] });
    await page.goto(`${server.base}/workspace/02`);
    await page.waitForSelector('[data-role="camera-invalid"]');
    assert.match(await page.textContent('[data-role="camera-invalid"]'), /camera_project\.json/);
    assert.equal(await page.evaluate(() => window.BAICameraPage), undefined);
    assert.equal(await page.locator('[data-feature="cameraHost"]').count(), 0);
    assert.deepEqual(fs.readFileSync(path.join(server.dataDir, 'camera_project.json')), original);
    await page.click('[data-role="camera-invalid"] button:has-text("初期状態から始める")');
    await page.click('[data-role="confirm-ok"]');
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio' &&
      document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
    const backups = fs.readdirSync(server.dataDir).filter((name) => /^camera_project\.invalid-.*\.json$/.test(name));
    assert.equal(backups.length, 1);
    assert.deepEqual(fs.readFileSync(path.join(server.dataDir, backups[0])), original);
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await browser.close(); await server.stop(); }
});

test('integrated save cannot capture camera while a full restore is pending', harness.skip3d(), async () => {
  const combination = { schema: 1, title: '復元中の保存', timeline: [], history: [], cursor: -1,
    selected: 1, playbackSpeed: 1, updatedAt: '2026-10-20T00:00:00Z' };
  const server = await harness.startServer({ port: 8811, seed: {
    'project_state.json': JSON.stringify(combination),
    'project_state.workspace.json': JSON.stringify({ frame: 0, asset: '', clip: null }),
  } });
  const browser = await server.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/02`);
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('カメラ編集を開始'));
    await page.fill('#frame-number', '37');
    await page.locator('#frame-number').dispatchEvent('change');
    await page.click('#add');
    await page.waitForFunction(() => window.baiStudio.project.getState().dirty.camera === true);
    const cameraFile = path.join(server.dataDir, 'camera_project.json');
    const before = fs.existsSync(cameraFile) ? fs.readFileSync(cameraFile) : null;
    let posts = 0;
    page.on('request', (request) => { if (request.method() === 'POST' && /\/api\/project\/bundle$/.test(request.url())) posts++; });
    await page.evaluate(async () => {
      window.__releaseCameraRestore = null;
      window.addEventListener('bai-camera-bundle-restore', (event) => {
        if (window.__releaseCameraRestore) return;
        event.stopImmediatePropagation();
        window.__releaseCameraRestore = () => window.dispatchEvent(new CustomEvent('bai-camera-bundle-restore', { detail: event.detail }));
      }, { capture: true });
      const { emit } = await import('/studio/js/bus.js');
      emit('studio:project-loaded');
    });
    await page.waitForFunction(() => document.querySelector('.camera-host')?.getAttribute('aria-busy') === 'true' &&
      typeof window.__releaseCameraRestore === 'function');
    const saveResult = await page.evaluate(async () => {
      let captureError = null;
      window.addEventListener('bai-studio-camera-before-save', (event) => {
        captureError = event.detail.error?.message || null;
      }, { once: true });
      const saved = await (await import('/studio/js/features/project.js')).saveProject();
      return { saved, captureError };
    });
    assert.equal(saveResult.saved, false);
    assert.match(saveResult.captureError || '', /カメラ画面の準備が終わっていません/);
    assert.equal(posts, 0, 'no bundle POST can be sent with an incomplete camera snapshot');
    assert.deepEqual(fs.existsSync(cameraFile) ? fs.readFileSync(cameraFile) : null, before);
    await page.evaluate(() => window.__releaseCameraRestore());
    await page.waitForFunction(() => document.querySelector('.camera-host')?.getAttribute('aria-busy') !== 'true');
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await browser.close(); await server.stop(); }
});

test('camera-only save updates the bundle revision before integrated save', harness.skip3d(), async () => {
  const combination = { schema: 1, title: 'カメラ保存連携', timeline: [], history: [
    { label: '初期', at: '2026-10-20T00:00:00Z', timeline: [], selected: 1, playbackSpeed: 1 },
    { label: '次', at: '2026-10-20T00:00:01Z', timeline: [{ name: 'x' }], selected: 1, playbackSpeed: 1 },
  ], cursor: 1, selected: 1, playbackSpeed: 1, updatedAt: '2026-10-20T00:00:01Z' };
  combination.timeline = [{ name: 'x' }];
  const server = await harness.startServer({ port: 8798, seed: {
    'project_state.json': JSON.stringify(combination),
    'project_state.workspace.json': JSON.stringify({ frame: 0, asset: '', clip: null }),
  } });
  const browser = await server.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser);
    await page.addInitScript(() => { window.__cameraSavedCount = 0; window.addEventListener('bai-camera-saved', () => { window.__cameraSavedCount++; }); });
    await page.goto(`${server.base}/workspace/02`);
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio' &&
      document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
    const oldRevision = await page.evaluate(() => window.baiStudio.project.getState().revision);
    await page.fill('#frame-number', '37');
    await page.locator('#frame-number').dispatchEvent('change');
    await page.click('#add');
    await page.waitForFunction(() => window.baiStudio.project.getState().dirty.camera === true);
    await page.click('#save');
    await page.waitForFunction((old) => window.__cameraSavedCount === 1 &&
      window.baiStudio.project.getState().revision !== old &&
      window.baiStudio.project.getState().dirty.camera === false, oldRevision);
    await page.evaluate(() => window.baiStudio.navigate('18'));
    await page.waitForSelector('[data-feature="projectSummary"] dl');
    assert.equal(await page.evaluate(() => window.baiStudio.project.getState().bundle.workspace.frame), 37);
    const response = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/project\/bundle$/.test(r.url()));
    await page.evaluate(() => {
      document.querySelector('[data-feature="projectHistory"] [data-role="undo"]').click();
      document.querySelector('[data-role="project-save"]').click();
    });
    assert.equal((await response).status(), 200);
    await page.waitForFunction(() => !window.baiStudio.project.getState().saving &&
      !window.baiStudio.project.getState().dirty.combination);
    const saved = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'camera_project.json'), 'utf8'));
    assert.ok(saved.keys.some((key) => key.frame === 37));
    assert.equal(JSON.parse(fs.readFileSync(path.join(server.dataDir, 'project_state.workspace.json'), 'utf8')).frame, 37);
    await page.evaluate(() => window.baiStudio.navigate('02'));
    await page.waitForFunction(() => document.querySelector('#frame-number')?.value === '37');
    await page.fill('#frame-number', '59');
    await page.locator('#frame-number').dispatchEvent('change');
    await page.click('#add');
    await page.evaluate(() => window.baiStudio.navigate('18'));
    await page.waitForFunction(() => window.baiStudio.project.getState().dirty.camera === true);
    await page.click('[data-role="project-reload"]');
    await page.click('[data-role="confirm-ok"]');
    await page.waitForFunction(() => window.baiStudio.project.getState().dirty.camera === false);
    await page.evaluate(() => window.baiStudio.navigate('02'));
    await page.waitForFunction(() => document.querySelector('#frame-number')?.value === '37');
    await page.waitForFunction((count) => document.querySelectorAll('#track button').length === count, saved.keys.length, { timeout: 10000 });
    assert.equal(await page.locator('#track button').count(), saved.keys.length, 'discard reload removes the unsaved key from the persistent camera host');
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await browser.close(); await server.stop(); }
});

test('frame-only workspace change returns to camera without a model restore', harness.skip3d(), async () => {
  const server = await harness.startServer({ port: 8799, seed: {
    'project_state.json': JSON.stringify({ schema: 1, title: '再生位置', timeline: [], history: [], cursor: -1, selected: 1, playbackSpeed: 1, updatedAt: '' }),
    'project_state.workspace.json': JSON.stringify({ frame: 0, asset: '', clip: null }),
  } });
  const browser = await server.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser);
    await page.addInitScript(() => { window.__workspaceRestoreCount = 0; window.addEventListener('bai-camera-workspace-restore', () => { window.__workspaceRestoreCount++; }); });
    await page.goto(`${server.base}/workspace/02`);
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio' && document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
    await page.evaluate(() => window.baiStudio.navigate('12'));
    await page.evaluate(async () => (await import('/studio/js/features/project.js')).setWorkspaceFields({ frame: 42 }));
    assert.equal(await page.evaluate(() => window.baiStudio.project.getState().dirty.workspace), false);
    await page.evaluate(() => window.baiStudio.navigate('02'));
    await page.waitForFunction(() => document.querySelector('#frame-number')?.value === '42');
    assert.equal(await page.evaluate(() => window.__workspaceRestoreCount), 0);
    assert.equal(await page.evaluate(() => window.baiStudio.project.getState().dirty.workspace), false);
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await browser.close(); await server.stop(); }
});

test('camera host follows store-owned GLB VRM PMX FBX selection and saves the final reference', harness.skip3d(), async () => {
  const model = pmxEntry('model/test.pmx'), texture = pmxEntry('model/tex/a.png');
  const glb = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'));
  const fbx = fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal_model.fbx'));
  const server = await harness.startServer({ port: 8801, seed: {
    'project_state.json': JSON.stringify({ schema: 1, title: '4形式の素材参照', timeline: [], history: [], cursor: -1, selected: 1, playbackSpeed: 1, updatedAt: '' }),
    'project_state.workspace.json': JSON.stringify({ frame: 0, asset: '', clip: null }),
    'integrated_v02/assets/aaaaaaaaaaaaaaaaaaaa.glb': glb,
    'integrated_v02/assets/bbbbbbbbbbbbbbbbbbbb.vrm': glb,
    'integrated_v02/user_assets.json': JSON.stringify([
      { id: 'user-aaaaaaaaaaaaaaaaaaaa', name: 'small.glb', filename: 'aaaaaaaaaaaaaaaaaaaa.glb', kind: 'model', bytes: glb.length },
      { id: 'user-bbbbbbbbbbbbbbbbbbbb', name: 'small.vrm', filename: 'bbbbbbbbbbbbbbbbbbbb.vrm', kind: 'model', bytes: glb.length },
    ]),
    'mmd_assets.json': JSON.stringify({ A: [{ name: 'test.pmx', size: model.length }, { name: 'tex/a.png', size: texture.length }], B: [], vmd: [] }),
    'mmd/A/test.pmx': model, 'mmd/A/tex/a.png': texture,
    'manifest.json': JSON.stringify({ files: [{ id: 'f-model', name: 'model.fbx', kind: 'modelA', size: fbx.length }], mapping: {} }),
    'files/f-model.fbx': fbx,
  } });
  const browser = await server.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/02`);
    await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio' &&
      document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
    for (const [asset, name] of [
      ['aaaaaaaaaaaaaaaaaaaa.glb', 'small.glb'],
      ['bbbbbbbbbbbbbbbbbbbb.vrm', 'small.vrm'],
      ['mmd:A:test.pmx', 'test.pmx'],
      ['fbx:f-model', 'model.fbx'],
    ]) {
      await page.evaluate(() => window.baiStudio.navigate('18'));
      await page.evaluate(async (ref) => (await import('/studio/js/features/project.js')).setWorkspaceFields({ asset: ref, clip: null }), asset);
      await page.evaluate(() => window.baiStudio.navigate('02'));
      await page.waitForFunction((label) => document.querySelector('#camera-asset-status')?.textContent.includes(label) &&
        document.querySelector('#camera-asset-status')?.textContent.includes('3D表示中'), name, { timeout: 20000 });
      assert.equal(await page.locator('#camera-asset').inputValue(), asset);
      assert.equal(await page.evaluate(() => window.baiStudio.project.getState().bundle.workspace.clip), null);
    }
    await page.evaluate(() => window.baiStudio.navigate('18'));
    const response = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/project\/bundle$/.test(r.url()));
    await page.click('[data-role="project-save"]');
    assert.equal((await response).status(), 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(server.dataDir, 'project_state.workspace.json'), 'utf8')).asset, 'fbx:f-model');
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await browser.close(); await server.stop(); }
});
