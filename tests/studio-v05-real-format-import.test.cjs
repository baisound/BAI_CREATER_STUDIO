'use strict';
// v0.5 実素材の形式別登録・見本・再読込（DATA-016/008、Issue #37/#50/#69）。
// 実素材は BAI_REAL_MMD_DATA から読み取り専用で読み、隔離サーバーへ「登録」操作で複製する。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const harness = require('./helpers/studio-harness.cjs');

const root = process.env.BAI_REAL_MMD_DATA;
const shotDir = process.env.BAI_SHOT_DIR;
const libraryFile = name => path.join(root, 'library_assets', 'files', name);
// via: v05 = v0.5素材管理の追加画面、legacy = v0.5から開く旧SCR-08取込画面
// sample: v0.5詳細に出る見本（thumbnail=保存済み見本画像、none=見本なしと明示）
const sources = root && [
  { label: 'VRM', via: 'legacy', name: 'proof-character.vrm', sample: 'thumbnail', kind: null, file: path.join(root, 'integrated_v02', 'assets', 'K00_黒狼_バイサウンド.vrm') },
  { label: 'FBXモデル', via: 'legacy', name: 'proof-model.fbx', sample: 'thumbnail', kind: 'modelA', file: path.join(root, 'files', '6986893f16a496f7ccb0409e.fbx') },
  { label: 'FBX動作', via: 'legacy', name: 'proof-motion.fbx', sample: 'none', kind: 'motions', file: path.join(root, 'integrated_v02', 'assets', 'walk_standard.fbx') },
  { label: 'GLB人体動作', via: 'legacy', name: 'proof-motion.glb', sample: 'none', kind: 'motion', file: path.join(root, 'integrated_v02', 'assets', 'Rig_Medium_General.glb') },
  { label: 'GLBステージ', via: 'v05', name: 'proof-stage.glb', sample: 'thumbnail', kind: 'stage', file: libraryFile('a54a7451a580eb88df9e6b13308d406cad9000abc72410fd4a006197dd7cae35.glb') },
  { label: 'WAV', via: 'v05', name: 'proof-audio.wav', sample: 'audio', kind: 'audio', file: libraryFile('c8506bc68749956b12713631127d22771d8212de99f1e189296ee1c528a39809.wav') },
  { label: '画像', via: 'v05', name: 'proof-image.png', sample: 'image', kind: 'image', file: path.join(root, 'sample_imports_20261021', 'ready', 'kenney_platformer_image.png') },
  { label: '動画', via: 'v05', name: 'proof-video.mp4', sample: 'video', kind: 'video', file: path.join(root, 'sample_imports_20261021', 'ready', 'kenney_platformer_demo.mp4') },
];
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function json(response) {
  const body = await response.text();
  assert.equal(response.status, 200, body);
  return JSON.parse(body);
}
function storedPath(dataDir, row, item) {
  if (row.via === 'v05') return path.join(dataDir, 'library_assets', 'files', item.filename);
  if (row.kind === 'motions' || row.kind === 'modelA') return path.join(dataDir, 'files', `${item.id.slice(4)}.fbx`);
  return path.join(dataDir, 'integrated_v02', 'assets', item.filename);
}

test('real VRM/FBX/GLB motion/stage/WAV/image/video register, preview and reload in v0.5 without changing originals',
  { skip: !root && 'BAI_REAL_MMD_DATA が未指定です', timeout: 600000 }, async () => {
    const missing = sources.filter(row => !fs.existsSync(row.file)).map(row => `${row.label}: ${row.file}`);
    assert.deepEqual(missing, [], '実素材が見つかりません');
    const before = sources.map(row => hashFile(row.file));
    // 50MBを超える実ファイルはバッファで渡せないため、登録名の一時複製をファイルとして選ぶ。
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'bai-real-format-'));
    const staged = row => { const file = path.join(staging, row.name); if (!fs.existsSync(file)) fs.copyFileSync(row.file, file); return file; };
    const server = await harness.startServer({ port: 8921 });
    let browser, page, legacy;
    const legacyErrors = [];
    const shot = async (target, name) => {
      if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await target.screenshot({ path: path.join(shotDir, name) }); }
    };
    try {
      // BAI_REAL_GPU=1 では SwiftShader を使わず実GPUで描画する（見本の3D描画を実機で確かめる）。
      browser = process.env.BAI_REAL_GPU === '1'
        ? await require('playwright').chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
        : await server.launchBrowser();
      page = await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('[data-go="library"]').first().click();
      let registered = 0;
      for (const row of sources.filter(r => r.via === 'v05')) {
        await page.locator('#baiImport').click();
        await page.locator('#baiUploadKind').selectOption(row.kind);
        await page.locator('#baiUploadFiles').setInputFiles(staged(row));
        await page.locator('#baiUploadSubmit').click();
        await page.waitForFunction(() => document.querySelector('#baiUploadStatus')?.textContent.startsWith('登録 1/1件'), null, { timeout: 120000 });
        registered++;
        await page.waitForFunction(count => document.querySelector('#baiAssetCount')?.textContent.includes(`登録${count}件`) &&
          !document.querySelector('#baiUploadKind'), registered);
      }
      const renderer = await harness.webglRenderer(page);
      // v0.5の追加画面だけで登録した直後の見本（旧画面を開く前）。
      const v05Only = await json(await fetch(`${server.base}/api/assets`));
      const thumbnailBeforeLegacy = Object.fromEntries(v05Only.items.map(item => [item.originalName || item.name, item.thumbnailUrl || null]));
      const legacyRows = sources.filter(r => r.via === 'legacy');
      const popup = page.context().waitForEvent('page');
      await page.locator('#baiLegacyImport').click();
      legacy = await popup;
      legacy.on('pageerror', error => legacyErrors.push(String(error)));
      await legacy.bringToFront();
      await legacy.waitForURL(/\/workspace\/08/);
      await legacy.locator('[data-feature="assetLibrary"]').waitFor({ timeout: 120000 });
      await legacy.locator('.screen-head [data-role="open-import"]').click();
      await legacy.locator('[role="dialog"] [data-role="import-files"]').setInputFiles(
        legacyRows.map(staged));
      for (const row of legacyRows.filter(r => r.kind)) {
        await legacy.locator(`[role="dialog"] li[data-name="${row.name}"] select[data-role="kind"]`).selectOption(row.kind);
      }
      await legacy.locator('[role="dialog"] [data-role="import-go"]').click();
      await legacy.waitForFunction(names => names.every(name =>
        document.querySelector(`[data-feature="importQueue"] tbody tr[data-name="${name}"] [data-role="status"]`)?.textContent.trim() === '完了'),
      legacyRows.map(row => row.name), { timeout: 300000 });
      await shot(legacy, '00_legacy_import_done.png');
      // 旧画面は一覧表示時に3D・動画の見本を順番に作る。作り終わるまで旧画面を開いたままにする。
      const wantsThumbnail = ['proof-character.vrm', 'proof-model.fbx', 'proof-stage.glb', 'proof-video.mp4'];
      const deadline = Date.now() + 180000;
      let pendingThumbs = wantsThumbnail;
      while (Date.now() < deadline) {
        const now = await json(await fetch(`${server.base}/api/assets`));
        pendingThumbs = wantsThumbnail.filter(name => !now.items.find(item => (item.originalName || item.name) === name)?.thumbnailUrl);
        if (!pendingThumbs.length) break;
        await legacy.waitForTimeout(2000);
      }
      await shot(legacy, '00_legacy_after_thumbnails.png');
      assert.deepEqual(pendingThumbs, [], '旧画面で見本が作られません');
      // 旧画面が見本を保存したら、開いたままのv0.5一覧も再読込なしで見本を出す。
      const inventory = await json(await fetch(`${server.base}/api/assets`));
      const byName = new Map(inventory.items.map(item => [item.originalName || item.name, item]));
      const thumbIds = sources.filter(row => row.sample === 'thumbnail').map(row => byName.get(row.name).id);
      await page.waitForFunction(ids => ids.every(id => document.querySelector(`[data-library-id="${CSS.escape(id)}"] img[src*="/thumbnail/"]`)), thumbIds, { timeout: 60000 });
      await legacy.close(); legacy = null;
      await page.bringToFront();
      await page.waitForFunction(count => document.querySelector('#baiAssetCount')?.textContent.includes(`登録${count}件`), sources.length);

      const v05 = await json(await fetch(`${server.base}/api/studio/v05/assets`));
      const categories = new Map(v05.items.map(item => [item.id, item.category]));
      const inspect = async (row, item, shotName) => {
        await page.locator(`[data-library-id="${item.id}"]`).click();
        const detail = page.locator('#baiAssetDetail');
        await page.waitForFunction(id => document.querySelector(`[data-library-id="${CSS.escape(id)}"]`)?.getAttribute('aria-pressed') === 'true', item.id);
        assert.match(await detail.textContent(), /登録済み・利用可能/);
        const shown = await detail.evaluate(node => {
          const img = node.querySelector('img');
          return {
            sample: img ? (/\/thumbnail\//.test(img.getAttribute('src')) ? 'thumbnail' : 'image')
              : node.querySelector('audio') ? 'audio' : node.querySelector('video') ? 'video' : 'none',
            warning: node.querySelector('.baiWarning')?.textContent || null,
            unsupported: [...node.querySelectorAll('.baiTiny')].map(p => p.textContent).find(t => /未接続/.test(t)) || null,
          };
        });
        assert.equal(shown.sample, row.sample, `見本の種類: ${row.label}`);
        if (row.sample === 'none') assert.match(shown.warning || '', /保存済み見本なし/, `見本なしの表示: ${row.label}`);
        if (['model', 'motion'].includes(categories.get(item.id))) assert.match(shown.unsupported || '', /3D回転表示と実動作はこの詳細欄へ未接続/, `未対応の表示: ${row.label}`);
        if (shown.sample === 'thumbnail' || shown.sample === 'image') {
          await page.waitForFunction(() => document.querySelector('#baiAssetDetail img')?.naturalWidth > 0, null, { timeout: 30000 });
        }
        if (shown.sample === 'audio' || shown.sample === 'video') {
          await detail.locator(shown.sample).evaluate(node => { node.preload = 'metadata'; node.load(); });
          await page.waitForFunction(t => document.querySelector(`#baiAssetDetail ${t}`)?.readyState >= 1, shown.sample, { timeout: 60000 });
          shown.duration = await detail.locator(shown.sample).evaluate(node => node.duration);
          assert.ok(shown.duration > 0, `再生時間: ${row.label}`);
        }
        await shot(page, shotName);
        return shown;
      };
      const results = [];
      for (let i = 0; i < sources.length; i++) {
        const row = sources[i];
        const item = byName.get(row.name);
        assert.ok(item?.available, `登録素材が見つかりません: ${row.label}`);
        assert.equal(hashFile(storedPath(server.dataDir, row, item)), before[i], `保存ファイルのhashが原本と異なります: ${row.label}`);
        const shown = await inspect(row, item, `${String(i + 1).padStart(2, '0')}_${row.name.replace(/\W/g, '_')}.png`);
        results.push({ label: row.label, via: row.via, id: item.id, category: categories.get(item.id), format: item.format, kind: item.kind,
          sha256: before[i], thumbnailBeforeLegacy: thumbnailBeforeLegacy[row.name] ?? null, thumbnailUrl: item.thumbnailUrl || null, shown });
      }
      await page.reload();
      await page.locator('[data-go="library"]').first().click();
      await page.waitForFunction(count => document.querySelector('#baiAssetCount')?.textContent.includes(`登録${count}件`), sources.length);
      const reloaded = await json(await fetch(`${server.base}/api/assets`));
      for (let i = 0; i < sources.length; i++) {
        const item = reloaded.items.find(candidate => candidate.id === results[i].id);
        assert.ok(item?.available, `再読込後に利用不可: ${sources[i].label}`);
        assert.equal(item.thumbnailUrl || null, results[i].thumbnailUrl, `再読込後の見本URL: ${sources[i].label}`);
        results[i].afterReload = await inspect(sources[i], item, `R${String(i + 1).padStart(2, '0')}_${sources[i].name.replace(/\W/g, '_')}.png`);
        assert.deepEqual(results[i].afterReload, results[i].shown, `再読込後の詳細: ${sources[i].label}`);
      }
      assert.deepEqual(sources.map(row => hashFile(row.file)), before, '実素材の原本hashが変わりました');
      harness.assertNoErrors(page);
      assert.deepEqual(legacyErrors, []);
      console.log(`REAL_FORMAT_RESULTS ${JSON.stringify({ renderer, results })}`);
    } catch (error) {
      // 失敗時の診断：画面と件数表示を残す。
      for (const [name, target] of [['failure_v05.png', page], ['failure_legacy.png', legacy]]) {
        if (target && !target.isClosed()) await shot(target, name).catch(() => {});
      }
      const count = page && !page.isClosed() ? await page.locator('#baiAssetCount').textContent().catch(() => null) : null;
      const status = page && !page.isClosed() ? await page.locator('#baiAssetDetail').textContent().catch(() => null) : null;
      console.log(`REAL_FORMAT_FAILURE ${JSON.stringify({ count, status: status?.slice(0, 400) })}`);
      throw error;
    } finally {
      await legacy?.close(); await page?.close(); await browser?.close(); await server.stop();
      fs.rmSync(staging, { recursive: true, force: true });
    }
  });
