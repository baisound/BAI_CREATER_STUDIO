'use strict';
// ④ 3D 表示とステージ配置（P2 設計 §2.4(f)(g)、WP-04）。実サーバー（隔離データ）と Chromium（SwiftShader）で、画面の操作から確かめる。
// ポート：P2_VIEWPORT_PORT（既定 8795）。テストごとに新しいサーバー・種データで始める。three が無い環境では skip（理由付き）。
// GPU は未検証（SwiftShader のみ）。
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.P2_VIEWPORT_PORT || 8795);
const SHOTS = process.env.P2_VIEWPORT_SHOTS || '';
const FIX = path.join(__dirname, 'fixtures');
const GLB = fs.readFileSync(path.join(FIX, 'synthetic_test_model.glb'));
const FBX_MODEL = fs.readFileSync(path.join(FIX, 'minimal_model.fbx'));
const ZIP = fs.readFileSync(path.join(FIX, 'minimal_pmx.zip'));

/** 標準ライブラリだけの ZIP 読み（中央ディレクトリから。格納と deflate のみ）。 */
function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    p += 46 + nlen + elen + clen;
  }
  return files;
}
const ZIPFILES = readZip(ZIP);
const PMX = ZIPFILES['model/test.pmx'];
const PNG = ZIPFILES['model/tex/a.png'];
const fbxId = (kind, name) => crypto.createHash('sha256').update(`${kind}\0${name}`).digest('hex').slice(0, 24);

const STORED = 'aaaaaaaaaaaaaaaaaaaa.glb';
const STORED2 = 'cccccccccccccccccccc.glb';
const STORED_MISSING = 'dddddddddddddddddddd.glb';
const GLB_ID = `integrated:${STORED}`;
const GLB2_ID = `integrated:${STORED2}`;
const PMX_ID = 'mmd:A:test.pmx';
const FBX_ID = `fbx:${fbxId('modelA', 'model.fbx')}`;

const NOW = '2026-10-20T05:00:00.000Z';
const COMB = { schema: 1, title: '歌ってみた', timeline: [], selected: 0, playbackSpeed: 1, updatedAt: NOW, cursor: -1, history: [] };
const CAMERA = { schema: 1, fps: 30, duration: 300, keys: [
  { frame: 0, position: [0, 1.6, 5], target: [0, 1, 0], fov: 40, interpolation: 'linear' },
  { frame: 90, position: [4, 2, 3], target: [0, 1, 0], fov: 35, interpolation: 'linear' },
] };
const WS_NAME = 'project_state.workspace.json';

/** 種データ：GLB モデル2（片方は2つ目のステージ用）、ファイルなしの GLB、PMX（テクスチャ付き）、FBX モデル。project は任意。 */
function seed({ project = true, workspace = null, extra = {} } = {}) {
  const fid = fbxId('modelA', 'model.fbx');
  return {
    [`integrated_v02/assets/${STORED}`]: GLB,
    [`integrated_v02/assets/${STORED2}`]: GLB,
    'integrated_v02/user_assets.json': JSON.stringify([
      { id: 'user-aaaaaaaaaaaaaaaaaaaa', name: 'seed-model.glb', filename: STORED, kind: 'model', bytes: GLB.length },
      { id: 'user-cccccccccccccccccccc', name: 'seed-stage.glb', filename: STORED2, kind: 'model', bytes: GLB.length },
      { id: 'user-dddddddddddddddddddd', name: 'seed-gone.glb', filename: STORED_MISSING, kind: 'model', bytes: 1 },
    ]),
    'mmd_assets.json': JSON.stringify({ A: [{ name: 'test.pmx', size: PMX.length }, { name: 'tex/a.png', size: PNG.length }], B: [], vmd: [] }),
    'mmd/A/test.pmx': PMX,
    'mmd/A/tex/a.png': PNG,
    'manifest.json': JSON.stringify({ files: [{ id: fid, name: 'model.fbx', kind: 'modelA', size: FBX_MODEL.length }], mapping: {} }),
    [`files/${fid}.fbx`]: FBX_MODEL,
    ...(project ? { 'project_state.json': JSON.stringify(COMB), 'camera_project.json': JSON.stringify(CAMERA) } : {}),
    ...(workspace ? { [WS_NAME]: JSON.stringify(workspace) } : {}),
    ...extra,
  };
}

let browser;
test.before(async () => { if (harness.haveThree()) browser = await harness.launchBrowser(); });
test.after(async () => { await browser?.close(); });

async function withApp(seedData, fn, { errors = [] } = {}) {
  const server = await harness.startServer({ port: PORT, seed: seedData });
  const ctx = { server, page: null };
  try {
    ctx.page = await server.newPage(browser, { expectErrors: errors });
    await fn(ctx);
    harness.assertNoErrors(ctx.page);
  } finally {
    await ctx.page?.context().close();
    await server.stop();
  }
}
const readJson = (server, name) => JSON.parse(fs.readFileSync(path.join(server.dataDir, name), 'utf8'));
const exists = (server, name) => fs.existsSync(path.join(server.dataDir, name));
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, name), type: 'jpeg', quality: 70 });
  await page.setViewportSize({ width: 1440, height: 900 });
};
/** スクリーンショット用：ホイールで引いて全体を見せる（SHOTS を指定したときだけ使う）。 */
const zoomOut = async (page, clicks = 4) => {
  if (!SHOTS) return;
  const box = await page.locator('[data-role="viewport"] canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < clicks; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(120); }
};
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} は ${b} ±${eps} ではありません`);
const nearAll = (a, b, eps, label) => { assert.equal(a.length, b.length, label); a.forEach((v, i) => near(v, b[i], eps, `${label}[${i}]`)); };

const vp = (page) => page.evaluate(() => window.baiStudio.viewport.getState());
const viewCamera = (page) => page.evaluate(async () => {
  const host = (await import('/studio/js/viewport/three-host.js')).currentViewport();
  return { position: host.camera.position.toArray(), target: host.controls.target.toArray(), distance: host.camera.position.distanceTo(host.controls.target) };
});
/** 3D ビューポートが読み込み済みになるまで待つ。 */
async function waitLoaded(page, timeout = 20000) {
  await page.waitForFunction(() => window.baiStudio.viewport.getState().loaded === true, null, { timeout });
}
async function openChar(page, server, id, { wait = true } = {}) {
  await page.goto(`${server.base}/workspace/12${id ? `?asset=${encodeURIComponent(id)}` : ''}`);
  if (id && wait) await waitLoaded(page);
}

test('middle drag navigation rotates, pans and moves in depth without editing the model', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    await openChar(page, server, GLB_ID);
    const canvas = page.locator('[data-feature="characterViewport"] canvas');
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 100);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    assert.match(await page.locator('.vp-nav-help').innerText(), /視点操作/);
    const before = await viewCamera(page);
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(x + 60, y + 25, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    const rotated = await viewCamera(page);
    nearAll(rotated.target, before.target, 1e-6, '中ドラッグは注視点を変えない');
    assert.ok(Math.abs(rotated.position[0] - before.position[0]) > .01, '中ドラッグで回転');

    await page.keyboard.down('Shift');
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(x + 100, y + 65, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    await page.keyboard.up('Shift');
    const panned = await viewCamera(page);
    assert.ok(panned.target.some((v, i) => Math.abs(v - rotated.target[i]) > .01), 'Shift＋中ドラッグで平行移動');
    near(panned.distance, rotated.distance, 1e-6, '平行移動で距離を保つ');

    await page.keyboard.down('Control');
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(x + 100, y + 105, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    await page.keyboard.up('Control');
    const moved = await viewCamera(page);
    nearAll(moved.target, panned.target, 1e-6, 'Ctrl＋中ドラッグは注視点を変えない');
    assert.ok(Math.abs(moved.distance - panned.distance) > .01, 'Ctrl＋中ドラッグで前後移動');
    assert.equal((await vp(page)).assetId, GLB_ID);
  });
});
async function openScene(page, server) {
  await page.goto(`${server.base}/workspace/06`);
  await page.waitForSelector('[data-feature="sceneViewport"]');
  await page.waitForFunction(() => window.baiStudio.project.getState().status === 'ready' && window.baiStudio.assets.getState().status === 'ready', null, { timeout: 8000 });
}
async function waitSaved(page) {
  await page.waitForFunction(() => { const s = window.baiStudio.project.getState(); return s.status === 'ready' && !s.saving && !s.dirty.workspace && !s.dirty.combination; }, null, { timeout: 8000 });
}
const STAGE_SEL = '[data-role="stage-asset"]';
async function pickStage(page, id) {
  await page.selectOption(STAGE_SEL, id);
  await page.waitForFunction((x) => window.baiStudio.viewport.getState().stage?.assetId === x, id, { timeout: 20000 });
}
/** n 番目のスライダー（X, Y, Z, 回転 Y, 拡大）の数値欄に入れる。 */
async function setSlider(page, n, value) {
  const num = page.locator('[data-role="stage-slider"]').nth(n).locator('input.num');
  await num.fill(String(value));
  await num.dispatchEvent('change');
}
async function stageState(page) { return (await vp(page)).stage; }
async function save(page) {
  await page.click('.screen-head [data-role="project-save"]');
  await waitSaved(page);
}

test('glb renders and normalizes like the camera page', harness.skip3d(), async () => {
  await withApp(seed({ workspace: { frame: 42, asset: 'a.glb', clip: 1 } }), async ({ server, page }) => {
    await openChar(page, server, GLB_ID);
    const s = await vp(page);
    assert.equal(s.loaded, true);
    assert.equal(s.assetId, GLB_ID);
    assert.equal(s.format, 'GLB');
    near(s.scale, 1, 1e-9, 'scale');            // 合成モデルは高さ 2.0・中心 0・足 y=0
    nearAll(s.offset, [0, 0, 0], 1e-9, 'offset');
    near(s.bounds.max[1] - s.bounds.min[1], 2, 1e-6, 'height');
    assert.ok(typeof s.renderer === 'string' && s.renderer.length > 0);
    assert.ok((await page.evaluate(() => window.baiStudio.viewport.countNonBackground())) > 50, 'キャンバスにモデルが描かれている');
    // HUD：名前・形式・クリップ・頂点数
    const hud = await page.textContent('[data-feature="characterViewport"] .vp-hud');
    assert.match(hud, /seed-model\.glb/);
    assert.match(hud, /GLB/);
    assert.match(hud, /クリップ 1 件/);
    assert.match(hud, /頂点 \d/);
    // ボーン一覧：10 本（hips〜foot_r）と分類
    await page.click('.pane-right [role="tab"][data-tab="bone"]');
    await page.waitForSelector('[data-role="bones"] tr[data-bone]');
    const names = await page.locator('[data-role="bones"] tr[data-bone]').evaluateAll((rows) => rows.map((r) => r.dataset.bone));
    assert.deepEqual([...names].sort(), ['chest', 'eye_l', 'eye_r', 'foot_l', 'foot_r', 'hand_l', 'hand_r', 'head', 'hips', 'spine']);
    assert.match(await page.textContent('[data-role="bones"] tr[data-bone="hips"]'), /腰（hips）/);
    assert.match(await page.textContent('[data-role="bones"] tr[data-bone="head"]'), /頭（head）/);
    assert.match(await page.textContent('[data-role="bone-count"]'), /10 本/);
    await shot(page, 'wp04-1-character-3d.jpg');
    await page.fill('[data-role="bone-search"]', 'foot');
    assert.equal(await page.locator('[data-role="bones"] tr[data-bone]').count(), 2);
    // 一覧の表示：キャラクターは GLB/PMX/FBX の3体（ファイルなしの GLB も選べる）
    assert.equal(await page.locator('[data-role="char-list"] li[data-asset-id]').count(), 5);
    assert.equal(await page.getAttribute(`[data-role="char-list"] li[data-asset-id="${GLB_ID}"]`, 'aria-selected'), 'true');
  });
});

test('pmx renders with its texture and bones', harness.skip3d(), async () => {
  await withApp(seed(), async ({ server, page }) => {
    const textures = [];
    page.on('response', (r) => { if (/\/api\/mmd-file\//.test(r.url())) textures.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    await openChar(page, server, PMX_ID);
    const s = await vp(page);
    assert.equal(s.format, 'PMX');
    near(s.scale, 1.8, 1e-6, 'pmx scale');       // 最小 PMX は高さ 1.0（O-④-2）
    assert.ok((await page.evaluate(() => window.baiStudio.viewport.countNonBackground())) > 20);
    await page.click('.pane-right [role="tab"][data-tab="bone"]');
    await page.waitForSelector('[data-role="bones"] tr[data-bone]');
    assert.deepEqual(await page.locator('[data-role="bones"] tr[data-bone]').evaluateAll((rows) => rows.map((r) => r.dataset.bone)), ['センター']);
    assert.match(await page.textContent('[data-role="bones"] tr[data-bone="センター"]'), /腰（hips）/);
    await page.waitForFunction(() => true);
    assert.ok(textures.includes('200 /api/mmd-file/A/test.pmx'), textures.join(', '));
    assert.ok(textures.includes('200 /api/mmd-file/A/tex/a.png'), `テクスチャを相対パスで読む: ${textures.join(', ')}`);
    assert.ok(!textures.some((t) => t.startsWith('404')), '404 が出ない');
  });
});

test('fbx renders at the legacy height', harness.skip3d(), async () => {
  await withApp(seed(), async ({ server, page }) => {
    await openChar(page, server, FBX_ID);
    const s = await vp(page);
    assert.equal(s.format, 'FBX');
    near(s.bounds.max[1] - s.bounds.min[1], 1.95, 1e-6, 'fbx height');
    assert.ok((await page.evaluate(() => window.baiStudio.viewport.countNonBackground())) > 10);
  });
});

test('viewport is disposed on leave', harness.skip3d(), async () => {
  await withApp(seed(), async ({ server, page }) => {
    await page.addInitScript(() => {
      window.__lose = 0;
      const orig = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (name) {
        const e = orig.call(this, name);
        if (name === 'WEBGL_lose_context' && e && !e.__wrapped) { const l = e.loseContext.bind(e); e.loseContext = () => { window.__lose++; return l(); }; e.__wrapped = true; }
        return e;
      };
    });
    await openChar(page, server, GLB_ID);
    assert.equal(await page.evaluate(() => window.__lose), 0);
    assert.equal(await page.locator('[data-feature="characterViewport"] canvas').count(), 1);
    await page.click('#nav a[data-route="08"]');
    await page.waitForSelector('[data-feature="assetLibrary"]');
    await page.waitForFunction(() => window.__lose >= 1, null, { timeout: 5000 });
    assert.equal((await vp(page)).loaded, false);
    // 3D の画面へ戻っても、前のものを引きずらない
    await page.click('#nav a[data-route="12"]');
    await page.waitForSelector('[data-feature="characterViewport"] canvas');
    assert.equal(await page.locator('canvas').count(), 1);
  });
});

test('missing file shows re-register message', harness.skip3d(), async () => {
  await withApp(seed(), async ({ server, page }) => {
    // 一覧で「ファイルなし」の素材は、読み込まずに同じ文言
    await openChar(page, server, `integrated:${STORED_MISSING}`, { wait: false });
    await page.waitForFunction(() => /元ファイルが見つかりません/.test(document.querySelector('[data-role="vp-message"]')?.textContent || ''));
    assert.match(await page.textContent('[data-role="vp-message"]'), /元ファイルが見つかりません。素材を再登録してください。/);
    assert.equal((await vp(page)).loaded, false);
    // 一覧では available のはずがサーバーが 404 を返したとき
    await page.route('**/api/integrated-v02/asset/*', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"asset is not registered"}' }));
    await page.click(`[data-role="char-list"] li[data-asset-id="${GLB_ID}"]`);
    await page.waitForFunction(() => /元ファイルが見つかりません/.test(document.querySelector('[data-role="vp-message"]')?.textContent || '') && !document.querySelector('[data-role="vp-message"]').hidden);
    assert.equal((await vp(page)).loaded, false);
    // 壊れたファイルは「3D 表示できませんでした：…」
    await page.unroute('**/api/integrated-v02/asset/*');
    await page.route('**/api/integrated-v02/asset/*', (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from('not a glb') }));
    await page.click(`[data-role="char-list"] li[data-asset-id="integrated:${STORED2}"]`);
    await page.waitForFunction(() => /3D 表示できませんでした：/.test(document.querySelector('[data-role="vp-message"]')?.textContent || ''));
    assert.equal(await page.getAttribute('[data-role="use-model"]', 'disabled') !== null, true);
  }, { errors: [/404/] });
});

test('workspace asset merge keeps frame and other fields', harness.skip3d(), async () => {
  await withApp(seed({ workspace: { frame: 42, asset: 'a.glb', clip: 1 } }), async ({ server, page }) => {
    await openChar(page, server, GLB_ID);
    assert.equal(await page.isEnabled('[data-role="use-model"]'), true);
    await page.click('[data-role="use-model"]');
    await page.waitForFunction(() => window.baiStudio.project.getState().dirty.workspace === true);
    assert.match(await page.textContent('#toasts'), /作業中の素材を seed-model\.glb にしました。［保存］で保存されます。/);
    assert.equal(await page.locator('#toasts [data-role="use-toast"] button').count(), 1);
    // frame は種データの値のまま。asset が変わったので clip は null
    const ws = await page.evaluate(() => window.baiStudio.project.getState().bundle.workspace);
    assert.deepEqual(ws, { frame: 42, asset: STORED, clip: null });
    await save(page);
    assert.deepEqual(readJson(server, WS_NAME), { frame: 42, asset: STORED, clip: null });
    // 同じ素材をもう一度選んでも clip は変わらない（asset が変わったときだけ null）
  });
});

test('workspace asset is set only for GLB/VRM', harness.skip3d(), async () => {
  await withApp(seed(), async ({ server, page }) => {
    for (const id of [PMX_ID, FBX_ID]) {
      await openChar(page, server, id);
      assert.equal(await page.isDisabled('[data-role="use-model"]'), true, id);
      assert.match(await page.getAttribute('[data-role="use-model"]', 'title'), /統合保存に記録できるのは GLB\/VRM だけです/);
    }
    assert.equal(exists(server, WS_NAME), false);
    await openChar(page, server, GLB_ID);
    assert.equal(await page.isEnabled('[data-role="use-model"]'), true);
  });
});

test('missing combination warns before creating it', harness.skip3d(), async () => {
  await withApp(seed({ project: false }), async ({ server, page }) => {
    await openChar(page, server, GLB_ID);
    await page.waitForFunction(() => window.baiStudio.project.getState().status === 'ready');
    assert.equal(await page.locator('[data-role="combination-note"]:not([hidden])').count(), 1);
    assert.match(await page.textContent('[data-role="combination-note"]'), /空のコンビネーション（project_state\.json）も一緒に作られます/);
    await page.click('[data-role="use-model"]');
    await page.click('.screen-head [data-role="project-save"]');
    // 空のコンビネーションを作る確認（②の規則）が出る
    await page.waitForSelector('[data-role="confirm-ok"]');
    await page.click('[data-role="confirm-ok"]');
    await waitSaved(page);
    assert.equal(exists(server, 'project_state.json'), true);
    assert.equal(readJson(server, WS_NAME).asset, STORED);
    assert.equal(await page.locator('[data-role="combination-note"]:not([hidden])').count(), 0);
  });
});

test('external change warns while workspace is dirty', harness.skip3d(), async () => {
  await withApp(seed({ workspace: { frame: 42, asset: 'a.glb', clip: 1 } }), async ({ server, page }) => {
    await openChar(page, server, GLB_ID);
    await page.waitForFunction(() => window.baiStudio.project.getState().syncRevision !== null, null, { timeout: 8000 });
    await page.click('[data-role="use-model"]');
    await page.waitForFunction(() => window.baiStudio.project.getState().dirty.workspace === true);
    const before = await page.evaluate(() => window.baiStudio.project.getState().bundle.workspace);
    const r = await fetch(`${server.base}/api/project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...COMB, title: '外部の保存' }) });
    assert.equal(r.status, 200);
    await page.waitForFunction(() => window.baiStudio.project.getState().externalChange === true, null, { timeout: 5000 });
    // 表示は変わらず、警告が出る（保存・復元（18）へ誘導するトースト）
    assert.deepEqual(await page.evaluate(() => window.baiStudio.project.getState().bundle.workspace), before);
    await page.waitForFunction(() => /自動では読み込みません/.test(document.querySelector('#toasts')?.textContent || ''), null, { timeout: 3000 });
    assert.equal((await vp(page)).assetId, GLB_ID);
  });
});

test('stage placement saves and restores', harness.skip3d(), async () => {
  await withApp(seed({ workspace: { frame: 42, asset: STORED, clip: 0 } }), async ({ server, page }) => {
    await openScene(page, server);
    await page.waitForFunction(() => window.baiStudio.viewport.getState().character?.assetId === 'integrated:aaaaaaaaaaaaaaaaaaaa.glb', null, { timeout: 20000 });
    // 「ステージを読み込む」は右の選択欄へ移る
    await page.click('.screen-head [data-role="stage-load"]');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-role') === 'stage-asset'); // フォーカスは setTimeout 0 で移る
    await pickStage(page, GLB2_ID);
    await setSlider(page, 0, 3);       // X
      await setSlider(page, 4, 90);      // 回転 Y
      await setSlider(page, 6, 2);       // 拡大
    const live = await stageState(page);
    near(live.position[0], 3, 1e-9, 'x');
    near(live.rotation[1], 90, 1e-9, 'rotY');
    near(live.displayScale, 2, 1e-9, 'scale');
    assert.equal(await page.evaluate(() => window.baiStudio.project.getState().dirty.workspace), true);
    assert.match(await page.textContent('[data-feature="projectToolbar"] [data-role="project-save"]'), /保存/);
    await zoomOut(page);
    await shot(page, 'wp04-3-stage-sliders.jpg');
    await save(page);
    const ws = readJson(server, WS_NAME);
    assert.deepEqual(ws.stage, { asset: GLB2_ID, position: [3, 0, 0], rotation: [0, 90, 0], scale: 2 });
    // frame・asset・clip は変わらない
    assert.deepEqual({ frame: ws.frame, asset: ws.asset, clip: ws.clip }, { frame: 42, asset: STORED, clip: 0 });
    // 読み直すと同じ配置
    await page.reload();
    await page.waitForFunction(() => window.baiStudio.viewport.getState().stage?.assetId, null, { timeout: 20000 });
    const back = await stageState(page);
    nearAll(back.position, [3, 0, 0], 1e-9, 'position');
    nearAll(back.rotation, [0, 90, 0], 1e-9, 'rotation');
    near(back.displayScale, 2, 1e-9, 'displayScale');
    near(back.scale, 2, 1e-9, 'user scale');
    assert.equal(await page.inputValue('[data-role="stage-slider"] >> nth=0 >> input.num'), '3');
    assert.equal(await page.inputValue('[data-role="stage-asset"]'), GLB2_ID);
    // ステージを外す → stage が消える（ファイルにキーが無い）
    await page.click('[data-role="stage-remove"]');
    await page.waitForFunction(() => window.baiStudio.viewport.getState().stage === null);
    await save(page);
    assert.equal('stage' in readJson(server, WS_NAME), false);
    assert.deepEqual(readJson(server, WS_NAME), { frame: 42, asset: STORED, clip: 0 });
  });
});

test('stage with a character placed in the same scene', harness.skip3d(), async () => {
  await withApp(seed({ workspace: { frame: 0, asset: STORED, clip: null, stage: { asset: GLB2_ID, position: [2, 0, 0], rotation: [0, 0, 0], scale: 1 } } }), async ({ server, page }) => {
    await openScene(page, server);
    await page.waitForFunction(() => { const s = window.baiStudio.viewport.getState(); return s.stage && s.character; }, null, { timeout: 20000 });
    const s = await vp(page);
    near(s.character.displayScale, 1, 1e-9, 'GLB は 1 m/単位');
    near(s.character.height, 2, 1e-6, 'キャラクターは高さを正規化しない（合成 GLB は元から 2.0）');
    assert.ok((await page.evaluate(() => window.baiStudio.viewport.countNonBackground())) > 100);
    assert.match(await page.textContent('[data-feature="sceneViewport"] .vp-hud'), /キャラクター：seed-model\.glb.*ステージ：seed-stage\.glb/);
    await shot(page, 'wp04-2-character-on-stage.jpg');
  });
});

test('scene wheel can travel through the focus point and below the floor', harness.skip3d(), async () => {
  await withApp(seed({ workspace: { frame: 0, asset: '', clip: null, stage: { asset: GLB2_ID, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 } } }), async ({ server, page }) => {
    await openScene(page, server);
    await waitLoaded(page);
    await page.evaluate(async () => {
      const host = (await import('/studio/js/viewport/three-host.js')).currentViewport();
      host.camera.position.set(0, 2, 0);
      host.controls.target.set(0, 0, 0);
      host.controls.update();
    });
    const canvas = page.locator('[data-feature="sceneViewport"] canvas').first();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await page.mouse.wheel(0, -400);
    const state = await viewCamera(page);
    assert.ok(state.position[1] < 0, `camera passes below floor: ${state.position[1]}`);
    assert.ok(state.target[1] < 0, `target follows camera: ${state.target[1]}`);
    near(state.distance, 2, 1e-5, 'free dolly keeps orbit radius');
    await page.evaluate(async () => {
      const host = (await import('/studio/js/viewport/three-host.js')).currentViewport();
      host.camera.position.set(0, 2, 0);
      host.controls.target.set(0, 0, 0);
      host.controls.update();
    });
    await page.keyboard.down('Control');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 120, { steps: 4 });
    await page.mouse.up({ button: 'middle' });
    await page.keyboard.up('Control');
    const dragged = await viewCamera(page);
    assert.ok(dragged.position[1] < 0, `Ctrl+middle also passes below floor: ${dragged.position[1]}`);
    near(dragged.distance, 2, 1e-5, 'Ctrl+middle keeps orbit radius');
  });
});

test('stage unit conversion for PMX and FBX', harness.skip3d(), async () => {
  await withApp(seed(), async ({ server, page }) => {
    await openScene(page, server);
    await page.click('.pane-right [role="tab"][data-tab="xf"]').catch(() => {});
    await pickStage(page, PMX_ID);
    let s = await stageState(page);
    assert.equal(s.format, 'PMX');
    near(s.unit, 0.08, 1e-12, 'pmx unit');
    near(s.displayScale, 0.08, 1e-9, 'pmx display scale (scale 1)');
    near(s.height, 0.08, 1e-6, 'pmx stage height = 1.0 × 0.08');
      await setSlider(page, 6, 3);
    s = await stageState(page);
    near(s.displayScale, 0.24, 1e-9, 'pmx display scale (scale 3)');
    near(s.scale, 3, 1e-9, '保存する倍率には換算を含めない');
    // 保存するのは利用者の倍率だけ
    const saved = await page.evaluate(() => window.baiStudio.project.getState().bundle.workspace.stage);
    assert.equal(saved.scale, 3);
    // FBX（minimal_model.fbx には UnitScaleFactor が無いので 0.01）
    await pickStage(page, FBX_ID);
    s = await stageState(page);
    assert.equal(s.format, 'FBX');
    near(s.unit, 0.01, 1e-12, 'fbx unit');
    near(s.displayScale, 0.03, 1e-9, 'fbx display scale');
    // GLB は 1 m/単位
    await pickStage(page, GLB2_ID);
    s = await stageState(page);
    near(s.unit, 1, 1e-12, 'glb unit');
    near(s.displayScale, 3, 1e-9, 'glb display scale');
    near(s.height, 6, 1e-6, 'glb stage height 2.0 × 3');
    // 回転 X/Z は触らない（保存された値を残す）
    const st = await page.evaluate(() => window.baiStudio.project.getState().bundle.workspace.stage);
    assert.deepEqual(st.rotation, [0, 0, 0]);
  });
});

test('pmx character and glb stage share the scene in mmd units', harness.skip3d(), async () => {
  // 2026-10-20 の上書き：SCR-06 ではキャラクターも高さを正規化せず、ステージと同じ単位の換算（PMX 0.08）を使う。
  // workspace.asset は GLB/VRM だけなので、PMX のキャラクターは画面からは置けない。ここでは SCR-06 と同じ部品（scene-parts）で、
  // 最小 PMX と GLB のステージを同じシーンに置いて確かめる。
  await withApp(seed({ workspace: { frame: 0, asset: STORED, clip: null, stage: { asset: GLB2_ID, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 } } }), async ({ server, page }) => {
    await openScene(page, server);
    await page.waitForFunction(() => window.baiStudio.viewport.getState().stage, null, { timeout: 20000 });
    const r = await page.evaluate(async () => {
      const parts = await import('/studio/js/viewport/scene-parts.js');
      const loader = await import('/studio/js/viewport/model-loader.js');
      const placement = await import('/studio/js/viewport/placement.js');
      const libs = await loader.loadLibs();
      const items = window.baiStudio.assets.getState().items;
      const pmx = await parts.buildPlaced(items.find((i) => i.id === 'mmd:A:test.pmx'), libs);
      const glb = await parts.buildPlaced(items.find((i) => i.id === 'integrated:cccccccccccccccccccc.glb'), libs);
      const scene = new libs.THREE.Scene();
      scene.add(pmx.root, glb.root);
      parts.applyStage(glb.root, { ...placement.defaultStage('x'), scale: 1.5 });
      return {
        pmxUnit: pmx.unit, pmxScale: pmx.root.scale.x, pmxHeight: parts.heightOf(libs.THREE, pmx.root), pmxPos: pmx.root.position.toArray(),
        glbUnit: glb.unit, glbHeight: parts.heightOf(libs.THREE, glb.root),
        sceneHasBoth: scene.children.length,
      };
    });
    assert.equal(r.sceneHasBoth, 2);
    near(r.pmxUnit, 0.08, 1e-12, 'pmx unit');
    near(r.pmxScale, 0.08, 1e-12, 'pmx root scale');
    near(r.pmxHeight, 1.0 * 0.08, 1e-6, 'PMX の高さ = ファイルの単位 1.0 × 0.08 m（正規化しない）');
    nearAll(r.pmxPos, [0, 0, 0], 1e-12, 'ファイルの原点のまま');
    near(r.glbUnit, 1, 1e-12, 'glb unit');
    near(r.glbHeight, 2 * 1.5, 1e-6, 'GLB ステージは 1 m/単位 × 倍率');
    // 単体表示（SCR-12）の正規化は別：PMX は 1.8 に正規化される（pmx renders… で確認済み）
  });
});

test('stage is kept when legacy camera bundle save omits it', harness.skip3d(), async () => {
  const stage = { asset: GLB2_ID, position: [1, 0, -2], rotation: [0, 45, 0], scale: 1.5 };
  await withApp(seed({ workspace: { frame: 0, asset: STORED, clip: null, stage } }), async ({ server }) => {
    const get = async () => (await fetch(`${server.base}/api/project/bundle`)).json();
    const cur = await get();
    assert.deepEqual(cur.workspace.stage, stage);
    // 旧 camera.html の形（workspace が frame・asset・clip だけ）
    const post = (workspace) => fetch(`${server.base}/api/project/bundle`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': cur.revision }, body: JSON.stringify({ schema: 1, combination: cur.combination, camera: cur.camera, workspace }) });
    const r = await post({ frame: 3, asset: STORED, clip: null });
    assert.equal(r.status, 200);
    const after = await get();
    assert.deepEqual(after.workspace, { frame: 3, asset: STORED, clip: null, stage });
    // 範囲外の stage は 400 で、ファイルは変わらない
    const before = fs.readFileSync(path.join(server.dataDir, WS_NAME));
    const bad = await fetch(`${server.base}/api/project/bundle`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': after.revision }, body: JSON.stringify({ schema: 1, combination: after.combination, camera: after.camera, workspace: { frame: 3, asset: STORED, clip: null, stage: { ...stage, scale: 1000 } } }) });
    assert.equal(bad.status, 400);
    assert.deepEqual(fs.readFileSync(path.join(server.dataDir, WS_NAME)), before);
    // 既存の stage が不正なとき、旧 camera.html の形の保存は 400 で、3つのファイルのどれも変わらない（§1.15 B-4：黙って捨てない）
    fs.writeFileSync(path.join(server.dataDir, WS_NAME), JSON.stringify({ frame: 3, asset: STORED, clip: null, stage: { asset: 'zzz' } }));
    const files = fs.readdirSync(server.dataDir).filter((n) => /^(project_state|camera_project)/.test(n)).sort();
    const snap = () => files.map((n) => fs.readFileSync(path.join(server.dataDir, n)));
    const beforeAll = snap();
    const corrupt = await get();
    const legacy = await fetch(`${server.base}/api/project/bundle`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': corrupt.revision }, body: JSON.stringify({ schema: 1, combination: corrupt.combination, camera: corrupt.camera, workspace: { frame: 4, asset: STORED, clip: null } }) });
    assert.equal(legacy.status, 400);
    assert.match((await legacy.json()).error || '', /existing workspace stage is unreadable/);
    assert.deepEqual(fs.readdirSync(server.dataDir).filter((n) => /^(project_state|camera_project)/.test(n)).sort(), files);
    assert.deepEqual(snap(), beforeAll);
  });
});

test('bundle body always carries workspace once stage is set', harness.skip3d(), async () => {
  // workspace ファイルが無い種データで、ステージだけを置いて［保存］する
  await withApp(seed({ workspace: null }), async ({ server, page }) => {
    const bodies = [];
    page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/project\/bundle$/.test(r.url())) bodies.push(JSON.parse(r.postData())); });
    await openScene(page, server);
    assert.equal(exists(server, WS_NAME), false);
    await pickStage(page, GLB2_ID);
    await setSlider(page, 1, 1.5);
    await save(page);
    assert.equal(bodies.length, 1);
    assert.deepEqual(bodies[0].workspace, { frame: 0, asset: '', clip: null, stage: { asset: GLB2_ID, position: [0, 1.5, 0], rotation: [0, 0, 0], scale: 1 } });
    assert.deepEqual(readJson(server, WS_NAME).stage, { asset: GLB2_ID, position: [0, 1.5, 0], rotation: [0, 0, 0], scale: 1 });
  });
});

test('stage missing asset keeps value', harness.skip3d(), async () => {
  const ghost = { asset: 'integrated:ffffffffffffffffffff.glb', position: [1, 0, 0], rotation: [10, 20, 30], scale: 1 };
  await withApp(seed({ workspace: { frame: 0, asset: '', clip: null, stage: ghost } }), async ({ server, page }) => {
    await openScene(page, server);
    await page.waitForFunction(() => /ステージの素材が見つかりません：integrated:ffffffffffffffffffff\.glb/.test(document.querySelector('[data-role="scene-note"]')?.textContent || ''), null, { timeout: 15000 });
    assert.match(await page.textContent('[data-role="stage-message"]'), /ステージの素材が見つかりません/);
    assert.equal((await vp(page)).stage, null);
    // 一覧に無い id でも選択欄は保存値のまま。位置だけ変えて保存しても stage.asset と回転 X/Z は残る
    assert.equal(await page.inputValue(STAGE_SEL), ghost.asset);
    await setSlider(page, 0, 4);
    await save(page);
    assert.deepEqual(readJson(server, WS_NAME).stage, { ...ghost, position: [4, 0, 0] });
  });
});

test('sample playback banner is gone on the real scene', harness.skip3d(), async () => {
  await withApp(seed(), async ({ server, page }) => {
    await openScene(page, server);
    assert.equal(await page.locator('#main .sample-banner').count(), 0);
    assert.equal(await page.getAttribute('[data-feature="sceneViewport"]', 'data-status') ?? 'real', 'real');
  });
});

test('show-in-3d button on the asset detail opens the character screen', harness.skip3d(), async () => {
  await withApp(seed(), async ({ server, page }) => {
    await page.goto(`${server.base}/workspace/08?asset=${encodeURIComponent(PMX_ID)}`);
    await page.waitForSelector('[data-feature="assetDetail"] [data-role="show-3d"]');
    assert.equal(await page.isEnabled('[data-role="show-3d"]'), true);
    await page.click('[data-role="show-3d"]');
    await page.waitForFunction(() => location.pathname === '/workspace/12');
    assert.match(page.url(), /asset=mmd%3AA%3Atest\.pmx/);
    await waitLoaded(page);
    assert.equal((await vp(page)).format, 'PMX');
    // モーションの素材では押せない
    await page.goto(`${server.base}/workspace/08`);
    await page.waitForSelector('[data-feature="assetLibrary"]');
  });
});
