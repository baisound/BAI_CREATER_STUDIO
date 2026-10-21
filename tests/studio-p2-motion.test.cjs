'use strict';
// ⑤ SCR-13［編集］モードの1体再生（P2 設計 §2.5(f) 05a、WP-05a）。実サーバー（隔離データ）と Chromium（SwiftShader）で、画面の操作から確かめる。
// ポート：P2_MOTION_PORT（既定 8793）。テストごとに新しいサーバー・種データで始める。three が無い環境では skip（理由付き）。
// GPU は未検証（SwiftShader のみ）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.P2_MOTION_PORT || 8793);
const SHOTS = process.env.P2_MOTION_SHOTS || '';
const FIX = path.join(__dirname, 'fixtures');
const GLB = fs.readFileSync(path.join(FIX, 'synthetic_test_model.glb'));
const VMD = fs.readFileSync(path.join(FIX, 'minimal.vmd'));
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

const STORED_GLB = 'aaaaaaaaaaaaaaaaaaaa.glb';
const STORED_VRM = 'bbbbbbbbbbbbbbbbbbbb.vrm';
const GLB_ID = `integrated:${STORED_GLB}`;
const VRM_ID = `integrated:${STORED_VRM}`;
const PMX_ID = 'mmd:A:test.pmx';
const VMD_ID = 'mmd:vmd:minimal.vmd';

/** 種データ：GLB（クリップ test30）、VRM（同じ中身）、PMX（テクスチャ付き）、VMD。 */
function seed({ pmx = true, vmd = true } = {}) {
  return {
    [`integrated_v02/assets/${STORED_GLB}`]: GLB,
    [`integrated_v02/assets/${STORED_VRM}`]: GLB,
    'integrated_v02/user_assets.json': JSON.stringify([
      { id: 'user-aaaaaaaaaaaaaaaaaaaa', name: 'seed-model.glb', filename: STORED_GLB, kind: 'model', bytes: GLB.length },
      { id: 'user-bbbbbbbbbbbbbbbbbbbb', name: 'seed-singer.vrm', filename: STORED_VRM, kind: 'model', bytes: GLB.length },
    ]),
    'mmd_assets.json': JSON.stringify({
      A: pmx ? [{ name: 'test.pmx', size: PMX.length }, { name: 'tex/a.png', size: PNG.length }] : [], B: [],
      vmd: vmd ? [{ name: 'minimal.vmd', size: VMD.length }] : [],
    }),
    ...(pmx ? { 'mmd/A/test.pmx': PMX, 'mmd/A/tex/a.png': PNG } : {}),
    ...(vmd ? { 'mmd/vmd/minimal.vmd': VMD } : {}),
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
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, name), type: 'jpeg', quality: 70 });
  await page.setViewportSize({ width: 1440, height: 900 });
};
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} は ${b} ±${eps} ではありません`);

const mo = (page) => page.evaluate(() => window.baiStudio.motion.getState());
const vp = (page) => page.evaluate(() => window.baiStudio.viewport.getState());
const probe = (page, q) => page.evaluate((x) => window.baiStudio.motion.probe(x), q);
const MODEL = '[data-role="motion-model"]';
async function openEdit(page, server, query = '') {
  await page.goto(`${server.base}/workspace/13?mode=edit${query}`);
  await page.waitForSelector('[data-feature="motionViewport"]');
}
/** モデルの読み込み（getState().modelId が入り、ビューポートが loaded）を待つ。 */
async function waitModel(page, id) {
  await page.waitForFunction((x) => window.baiStudio.motion?.getState()?.modelId === x && window.baiStudio.viewport.getState().loaded === true, id, { timeout: 25000 });
}
/** 一時停止してから位置を入れる（再生中だと次のフレームで進む）。 */
async function seekTo(page, sec) {
  if ((await mo(page)).playing) await page.click('[data-role="motion-play"]');
  await page.waitForFunction(() => window.baiStudio.motion.getState().playing === false);
  const seekBox = page.locator('[data-role="motion-seek"]');
  await seekBox.fill(String(sec));
}

test('pmx with vmd plays bones and morphs', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    await openEdit(page, server); // ?asset= なし → A の最初の PMX（index.html:353）
    await waitModel(page, PMX_ID);
    const v = await vp(page);
    assert.equal(v.format, 'PMX');
    near(v.scale, 1.8, 1e-6, 'scale');
    assert.ok((await page.evaluate(() => window.baiStudio.viewport.countNonBackground())) >= 50, 'モデルが描画されている');
    assert.equal(new URL(page.url()).searchParams.get('asset'), null, '既定の選択は URL を変えない');

    await page.click(`[data-feature="vmdLibrary"] li[data-asset-id="${VMD_ID}"]`);
    await page.waitForFunction(() => window.baiStudio.motion.getState().motion?.kind === 'vmd', null, { timeout: 15000 });
    const st = await mo(page);
    assert.equal(st.motion.id, VMD_ID);
    near(st.motion.duration, 1.0, 1e-6, 'duration');
    assert.equal(st.playing, true);
    assert.match(await page.textContent('[data-role="motion-status"]'), /test\.pmx : minimal\.vmd を再生中/);
    assert.equal(new URL(page.url()).searchParams.get('vmd'), VMD_ID);

    await seekTo(page, 0);
    const p0 = await probe(page, { morphs: ['あ'], bones: ['センター'] });
    near(p0.morphs['あ'], 0, 1e-6, 'あ@0');
    await seekTo(page, 0.5);
    const mid = (await probe(page, { morphs: ['あ'] })).morphs['あ'];
    assert.ok(mid > 0 && mid < 1, `あ@0.5 は 0 と 1 の間: ${mid}`);
    await seekTo(page, 1.0);
    const p1 = await probe(page, { morphs: ['あ'], bones: ['センター'] });
    near(p1.morphs['あ'], 1, 1e-6, 'あ@1.0');
    near(p1.bones['センター'][1] - p0.bones['センター'][1], 1.0, 1e-4, 'センターの y');
    assert.match(await page.textContent('[data-role="motion-time"]'), /^1\.00 \/ 1\.00 秒$/);
    await seekTo(page, 0);
    const again0 = await probe(page, { morphs: ['あ'], bones: ['センター'] });
    near(again0.morphs['あ'], p0.morphs['あ'], 1e-6, '往復後のあ@0');
    near(again0.bones['センター'][1], p0.bones['センター'][1], 1e-6, '往復後のセンター@0');
    await seekTo(page, 1.0);
    const again1 = await probe(page, { morphs: ['あ'], bones: ['センター'] });
    near(again1.morphs['あ'], p1.morphs['あ'], 1e-6, '往復後のあ@1.0');
    near(again1.bones['センター'][1], p1.bones['センター'][1], 1e-6, '往復後のセンター@1.0');
    await shot(page, 'pmx-vmd-edit.jpg');
  });
});

test('vmd library lists registered vmd and applies it', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    // ［比較］のまま行を押すと［編集］へ移って当てる（モデルは ?asset= のまま）
    await page.goto(`${server.base}/workspace/13?asset=${encodeURIComponent(PMX_ID)}`);
    await page.waitForSelector('[data-feature="vmdLibrary"] li[data-asset-id]');
    assert.deepEqual(await page.locator('[data-feature="vmdLibrary"] li[data-asset-id]').allTextContents(), ['minimal.vmdVMD']);
    assert.equal(await page.getAttribute('.mode-switch [data-mode="compare"]', 'aria-pressed'), 'true');
    await page.fill('[data-feature="vmdLibrary"] [data-role="search"]', 'zzz');
    assert.equal(await page.locator('[data-feature="vmdLibrary"] li[data-asset-id]').count(), 0);
    await page.fill('[data-feature="vmdLibrary"] [data-role="search"]', 'MINIMAL');
    await page.click(`[data-feature="vmdLibrary"] li[data-asset-id="${VMD_ID}"]`);
    await page.waitForSelector('[data-feature="motionViewport"]');
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'edit');
    await page.waitForFunction(() => window.baiStudio.motion.getState()?.motion?.kind === 'vmd' && window.baiStudio.motion.getState().playing, null, { timeout: 25000 });
    assert.equal((await mo(page)).modelId, PMX_ID);
    assert.equal(await page.getAttribute(`[data-feature="vmdLibrary"] li[data-asset-id="${VMD_ID}"]`, 'aria-selected'), 'true');
    // 再読込しても同じモード・同じモデル・同じ VMD（?asset=・?vmd=）
    await page.reload();
    await page.waitForFunction(() => window.baiStudio.motion?.getState()?.motion?.kind === 'vmd', null, { timeout: 25000 });
    const st = await mo(page);
    assert.equal(st.modelId, PMX_ID);
    assert.equal(st.motion.id, VMD_ID);
  });
});

test('vmd library without registered vmd shows how to import', harness.skip3d(), async () => {
  await withApp(seed({ vmd: false }), async ({ page, server }) => {
    await openEdit(page, server);
    await page.waitForSelector('[data-role="vmd-empty"]');
    assert.match(await page.textContent('[data-role="vmd-empty"]'), /登録された VMD はまだありません/);
  });
});

test('glb clip plays and seeks', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    await openEdit(page, server, `&asset=${encodeURIComponent(VRM_ID)}`);
    await waitModel(page, VRM_ID);
    assert.equal((await vp(page)).format, 'VRM');
    assert.deepEqual(await page.locator('[data-role="motion-clip"] option').allTextContents(), ['test30 (1.00s)']);
    await page.waitForFunction(() => window.baiStudio.motion.getState().playing === true && window.baiStudio.motion.getState().motion?.kind === 'clip');
    near((await mo(page)).motion.duration, 1.0, 1e-6, 'duration');
    await seekTo(page, 0.5);
    near((await probe(page, { bones: ['hips'] })).bones.hips[2], 0.5, 1e-6, 'hips z@0.5');
    assert.match(await page.textContent('[data-role="motion-time"]'), /^0\.50 \/ 1\.00 秒$/);
    // 再生してから［■ 停止］：位置を保つ
    await page.click('[data-role="motion-play"]');
    await page.waitForFunction(() => window.baiStudio.motion.getState().time > 0.55);
    await page.click('[data-role="motion-stop"]');
    const t = (await mo(page)).time;
    assert.equal((await mo(page)).playing, false);
    assert.match(await page.textContent('[data-role="motion-status"]'), /停止しました（現在位置を保持）/);
    await page.waitForTimeout(1000);
    assert.equal((await mo(page)).time, t, '停止後は時間が進まない');
    await shot(page, 'glb-clip-edit.jpg');
  });
});

test('vmd on vrm shows unimplemented and fetches nothing', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    const vmdFetch = [];
    page.on('request', (r) => { if (/\/api\/mmd-file\/vmd\//.test(r.url())) vmdFetch.push(r.url()); });
    await openEdit(page, server, `&asset=${encodeURIComponent(VRM_ID)}`);
    await waitModel(page, VRM_ID);
    await page.click(`[data-feature="vmdLibrary"] li[data-asset-id="${VMD_ID}"]`);
    const dlg = page.locator('[role="dialog"]');
    await dlg.waitFor();
    const text = await dlg.textContent();
    assert.match(text, /VMD/);
    assert.match(text, /PMX/);
    assert.deepEqual(vmdFetch, []);
    assert.equal((await mo(page)).motion.kind, 'clip', 'クリップの再生は変わらない');
    await shot(page, 'vmd-on-vrm.jpg');
  });
});

test('vmd with no model asks to choose one', harness.skip3d(), async () => {
  await withApp(seed({ pmx: false }), async ({ page, server }) => {
    const vmdFetch = [];
    page.on('request', (r) => { if (/\/api\/mmd-file\/vmd\//.test(r.url())) vmdFetch.push(r.url()); });
    await openEdit(page, server);
    await page.waitForSelector(`[data-feature="vmdLibrary"] li[data-asset-id="${VMD_ID}"]`);
    await page.click(`[data-feature="vmdLibrary"] li[data-asset-id="${VMD_ID}"]`);
    assert.match(await page.textContent('[data-role="motion-status"]'), /まずモデルを選んでください/);
    assert.deepEqual(vmdFetch, []);
  });
});

test('vmd whose file is gone is not listed, and a 404 at play time shows the missing-file text', harness.skip3d(), async () => {
  // ファイルが無い VMD は一覧に出ない（available:false）
  const gone = seed();
  delete gone['mmd/vmd/minimal.vmd'];
  await withApp(gone, async ({ page, server }) => {
    await openEdit(page, server);
    await page.waitForSelector('[data-role="vmd-empty"]');
  });
  // 一覧に出た後でファイルが消えた（404）
  await withApp(seed(), async ({ page, server }) => {
    await page.route(/\/api\/mmd-file\/vmd\//, (route) => route.fulfill({ status: 404, body: 'asset missing' }));
    await openEdit(page, server);
    await waitModel(page, PMX_ID);
    await page.click(`[data-feature="vmdLibrary"] li[data-asset-id="${VMD_ID}"]`);
    await page.waitForFunction(() => /元ファイルが見つかりません。素材を再登録してください。/.test(document.querySelector('[data-role="motion-status"]').textContent), null, { timeout: 15000 });
    assert.equal((await mo(page)).motion, null);
  }, { errors: [/404|Failed to load resource/i] });
});

test('mode switch is kept in the url', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    await page.goto(`${server.base}/workspace/13`);
    await page.waitForSelector('[data-feature="retargetViewport"]');
    assert.equal(await page.getAttribute('.mode-switch [data-mode="compare"]', 'aria-pressed'), 'true');
    await page.click('.mode-switch [data-mode="edit"]');
    await page.waitForSelector('[data-feature="motionViewport"]');
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'edit');
    assert.equal(await page.getAttribute('.mode-switch [data-mode="edit"]', 'aria-pressed'), 'true');
    await waitModel(page, PMX_ID);
    await page.selectOption(MODEL, GLB_ID);
    await page.waitForFunction((x) => window.baiStudio.motion.getState().modelId === x, GLB_ID, { timeout: 25000 });
    assert.equal(new URL(page.url()).searchParams.get('asset'), GLB_ID);
    await page.reload();
    await page.waitForFunction((x) => window.baiStudio.motion?.getState()?.modelId === x, GLB_ID, { timeout: 25000 });
    assert.equal(await page.getAttribute('.mode-switch [data-mode="edit"]', 'aria-pressed'), 'true');
    assert.equal(await page.inputValue(MODEL), GLB_ID);
    // ［比較］へ戻る：今の比較ビューが出る（クエリの asset は残る）
    await page.click('.mode-switch [data-mode="compare"]');
    await page.waitForSelector('[data-feature="retargetViewport"]');
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'compare');
    assert.equal(await page.evaluate(() => window.baiStudio.motion.getState()), null);
  });
});

test('clear button removes the model and the url asset', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    await openEdit(page, server, `&asset=${encodeURIComponent(PMX_ID)}`);
    await waitModel(page, PMX_ID);
    await page.click('[data-role="motion-clear"]');
    await page.waitForFunction(() => window.baiStudio.motion.getState().modelId === null && window.baiStudio.viewport.getState().loaded === false);
    assert.equal(new URL(page.url()).searchParams.get('asset'), null);
    assert.equal(await page.inputValue(MODEL), '');
    assert.equal(await page.isDisabled('[data-role="motion-play"]'), true);
  });
});

test('motion viewport is disposed on leave', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    await page.addInitScript(() => {
      window.__lost = 0; window.__raf = 0;
      for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        const orig = C.prototype.getExtension;
        C.prototype.getExtension = function (n) {
          const e = orig.call(this, n);
          if (n === 'WEBGL_lose_context' && e && !e.__wrapped) { const l = e.loseContext.bind(e); e.loseContext = () => { window.__lost++; return l(); }; e.__wrapped = true; }
          return e;
        };
      }
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (f) => { window.__raf++; return raf(f); };
    });
    await openEdit(page, server, `&asset=${encodeURIComponent(VRM_ID)}`); // クリップが自動で再生される（rAF が回る）
    await waitModel(page, VRM_ID);
    await page.waitForFunction(() => window.baiStudio.motion.getState().playing === true);
    await page.click('#nav a[data-route="08"]');
    await page.waitForSelector('[data-feature="assetLibrary"]');
    assert.ok((await page.evaluate(() => window.__lost)) >= 1, 'WEBGL_lose_context が呼ばれる');
    assert.equal(await page.evaluate(() => window.baiStudio.motion.getState()), null);
    assert.equal((await vp(page)).loaded, false);
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.__raf);
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.__raf), before, 'rAF のループが残っていない');
  });
});

/* ---------------------------------------------------------------- 05b：制作状態への記録と外部コマンド */

const NOW = '2026-10-20T05:00:00.000Z';
const COMB = { schema: 1, title: '記録テスト', timeline: [{ name: 'a' }], selected: 1, playbackSpeed: 1, updatedAt: NOW, cursor: 0, history: [{ label: '初期', at: NOW, timeline: [{ name: 'a' }], selected: 1, playbackSpeed: 1 }] };
const camera = (duration) => ({ schema: 1, fps: 30, duration, keys: [{ frame: 0, position: [0, 1.6, 5], target: [0, 1, 0], fov: 40, interpolation: 'linear' }] });
/** 種データに制作状態（作業中の素材）を足す。 */
function seedWs(workspace, { duration = 300, cameraRaw = null } = {}) {
  return {
    ...seed(),
    'project_state.json': JSON.stringify(COMB),
    'camera_project.json': cameraRaw ?? JSON.stringify(camera(duration)),
    'project_state.workspace.json': JSON.stringify(workspace),
  };
}
const readWs = (server) => JSON.parse(fs.readFileSync(path.join(server.dataDir, 'project_state.workspace.json'), 'utf8'));
const proj = (page) => page.evaluate(() => window.baiStudio.project.getState());
const REC = '[data-role="motion-record"]';
async function projectReady(page) {
  await page.waitForFunction(() => { const x = window.baiStudio.project.getState(); return x.status === 'ready' && x.syncRevision !== null; }, null, { timeout: 15000 });
}
async function saveProject(page) {
  await page.click('#nav a[data-route="18"]'); // ［保存］はプロジェクト（18）にある（画面は SPA で移るので状態は保たれる）
  await page.waitForSelector('[data-role="project-save"]');
  await page.click('.screen-head [data-role="project-save"]');
  await page.waitForFunction(() => { const x = window.baiStudio.project.getState(); return !x.saving && !x.dirty.workspace && !x.dirty.combination; }, null, { timeout: 10000 });
}

test('record clip and frame into workspace', harness.skip3d(), async () => {
  await withApp(seedWs({ frame: 0, asset: STORED_GLB, clip: null }), async ({ page, server }) => {
    await openEdit(page, server, `&asset=${encodeURIComponent(GLB_ID)}`);
    await waitModel(page, GLB_ID);
    await projectReady(page);
    // 作業中の素材と同じモデルなので一時停止で始まり、［記録］が有効
    assert.equal((await mo(page)).playing, false);
    assert.equal(await page.isDisabled(REC), false);
    await seekTo(page, 0.5);
    await page.click(REC);
    const st = await proj(page);
    assert.deepEqual({ frame: st.bundle.workspace.frame, clip: st.bundle.workspace.clip }, { frame: 15, clip: 0 });
    assert.equal(st.dirty.workspace, true, 'clip が変わったので未保存');
    assert.match(await page.textContent('#toasts'), /作業中のクリップ 0・再生位置 F 15 を記録しました。［保存］で保存されます。/);
    await saveProject(page);
    assert.deepEqual(readWs(server), { frame: 15, clip: 0, asset: STORED_GLB });
    // 開き直すと、同じクリップ・同じ位置で一時停止している（自動再生しない）
    await openEdit(page, server, `&asset=${encodeURIComponent(GLB_ID)}`);
    await waitModel(page, GLB_ID);
    await page.waitForFunction(() => Math.abs(window.baiStudio.motion.getState().time - 0.5) < 1e-6, null, { timeout: 5000 });
    assert.equal((await mo(page)).playing, false);
    assert.equal(await page.inputValue('[data-role="motion-clip"]'), '0');
    await page.waitForTimeout(500);
    near((await mo(page)).time, 0.5, 1e-6, 'time stays');
  });
});

test('frame is capped to camera duration', harness.skip3d(), async () => {
  await withApp(seedWs({ frame: 0, asset: STORED_GLB, clip: null }, { duration: 10 }), async ({ page, server }) => {
    await openEdit(page, server, `&asset=${encodeURIComponent(GLB_ID)}`);
    await waitModel(page, GLB_ID);
    await projectReady(page);
    await seekTo(page, 0.5);
    await page.click(REC);
    assert.equal((await proj(page)).bundle.workspace.frame, 10);
    assert.match(await page.textContent('[data-role="motion-status"]'), /再生位置をカメラの長さ（10 フレーム）までに丸めて記録しました/);
    await saveProject(page);
    assert.equal(readWs(server).frame, 10);
  });
});

test('frame-only record is not dirty', harness.skip3d(), async () => {
  await withApp(seedWs({ frame: 0, asset: STORED_GLB, clip: 0 }), async ({ page, server }) => {
    await openEdit(page, server, `&asset=${encodeURIComponent(GLB_ID)}`);
    await waitModel(page, GLB_ID);
    await projectReady(page);
    await seekTo(page, 0.5);
    await page.click(REC);
    const st = await proj(page);
    assert.equal(st.bundle.workspace.frame, 15);
    assert.equal(st.dirty.workspace, false, 'frame だけの変化は未保存にしない');
    assert.deepEqual(readWs(server), { frame: 0, asset: STORED_GLB, clip: 0 }, '保存していないのでファイルは変わらない');
  });
});

test('record is disabled for other models', harness.skip3d(), async () => {
  await withApp(seedWs({ frame: 0, asset: STORED_GLB, clip: null }), async ({ page, server }) => {
    await openEdit(page, server, `&asset=${encodeURIComponent(VRM_ID)}`);
    await waitModel(page, VRM_ID);
    assert.equal(await page.isDisabled(REC), true);
    assert.match(await page.getAttribute(REC, 'title'), new RegExp(`作業中の素材（${STORED_GLB}）と違うモデルです。キャラクター管理（12）の［このモデルを制作に使う］で選んでから記録してください。`));
    await page.selectOption(MODEL, PMX_ID);
    await waitModel(page, PMX_ID);
    assert.equal(await page.isDisabled(REC), true);
    assert.match(await page.getAttribute(REC, 'title'), /GLB\/VRM のクリップだけ/);
    assert.deepEqual(readWs(server), { frame: 0, asset: STORED_GLB, clip: null });
  });
});

test('record is disabled when the camera file is invalid', harness.skip3d(), async () => {
  await withApp(seedWs({ frame: 0, asset: STORED_GLB, clip: null }, { cameraRaw: '{"broken":' }), async ({ page, server }) => {
    await openEdit(page, server, `&asset=${encodeURIComponent(GLB_ID)}`);
    await waitModel(page, GLB_ID);
    await page.waitForFunction(() => window.baiStudio.project.getState().cameraInvalid !== null, null, { timeout: 15000 });
    assert.equal(await page.isDisabled(REC), true);
    assert.match(await page.getAttribute(REC, 'title'), /カメラ保存データを読めない/);
  }, { errors: [/422/] });
});

test('sync command preview_vmd only on SCR-13', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    const send = (cmd) => page.evaluate((c) => fetch('/api/sync-command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) }).then((r) => r.status), cmd);
    // SCR-08 では何もせず、トーストを1回だけ出す
    await page.goto(`${server.base}/workspace/08`);
    await page.waitForSelector('[data-feature="assetLibrary"]');
    await projectReady(page);
    assert.equal(await send({ action: 'preview_vmd', name: 'minimal.vmd', slot: 'A' }), 200);
    await page.waitForFunction(() => /外部から再生の指示（preview_vmd）がありました。モーション画面（05・13）を開いているときだけ反応します。/.test(document.getElementById('toasts').textContent), null, { timeout: 8000 });
    await page.waitForTimeout(2500); // 次の tick でも同じ id なので増えない
    assert.equal(await page.locator('#toasts .toast', { hasText: '外部から再生の指示' }).count() <= 1, true);
    assert.match(new URL(page.url()).pathname, /\/workspace\/08$/);
    // SCR-13［比較］では［編集］へ移り、A の最初の PMX に VMD を当てて再生する
    await page.click('#nav a[data-route="13"]');
    await page.waitForSelector('[data-feature="retargetViewport"]');
    assert.equal(await send({ action: 'preview_vmd', name: 'minimal.vmd', slot: 'A' }), 200);
    await page.waitForFunction(() => window.baiStudio.motion?.getState()?.motion?.kind === 'vmd', null, { timeout: 25000 });
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'edit');
    assert.equal((await mo(page)).modelId, PMX_ID);
    assert.equal((await mo(page)).motion.id, VMD_ID);
    assert.equal((await mo(page)).playing, true);
    // ［編集］のまま、integrated_preview も受ける（クリップ 0 を再生）
    const catalog = { models: [{ source_asset: `assets/${STORED_VRM}` }], motions: [] };
    fs.writeFileSync(path.join(server.dataDir, 'integrated_v02', 'catalog.json'), JSON.stringify(catalog));
    assert.equal(await send({ action: 'integrated_preview', name: STORED_VRM }), 200);
    await waitModel(page, VRM_ID);
    await page.waitForFunction(() => { const m = window.baiStudio.motion.getState(); return m.motion?.kind === 'clip' && m.playing; }, null, { timeout: 10000 });
    // 無い VMD は状態行に出す
    assert.equal(await send({ action: 'preview_vmd', name: 'nothing.vmd', slot: 'A' }), 200);
    await page.waitForFunction(() => /外部からの指示：nothing\.vmd が見つかりません/.test(document.querySelector('[data-role="motion-status"]').textContent), null, { timeout: 8000 });
  });
});
