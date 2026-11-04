'use strict';
// v0.5（③）の素材管理だけで、実素材を形式別に登録・見本・再読込する（DATA-016/008、Issue #37/#50/#69）。
// VRM・FBX（モデル／動作）・GLB動作も③から直接登録し、②（/workspace/08）は開かない。
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
// kind: ③の「素材を追加」の種類。store: 隔離サーバー上の保存先。
// sample: v0.5詳細に出る見本（thumbnail=保存済みの正面画像、motion=3姿勢の画像、none=見本なしと明示）
// view: 詳細欄の3D表示（model=回転表示、motion=動作の再生）
const sources = root && [
  { label: 'VRM', kind: 'vrm', store: 'integrated', name: 'proof-character.vrm', sample: 'thumbnail', view: 'model', file: path.join(root, 'integrated_v02', 'assets', 'K00_黒狼_バイサウンド.vrm') },
  { label: 'FBXモデル', kind: 'fbxModelA', store: 'fbx', name: 'proof-model.fbx', sample: 'thumbnail', view: 'model', file: path.join(root, 'files', '6986893f16a496f7ccb0409e.fbx') },
  { label: 'FBX動作', kind: 'fbxMotion', store: 'fbx', name: 'proof-motion.fbx', sample: 'motion', view: 'motion', file: path.join(root, 'integrated_v02', 'assets', 'walk_standard.fbx') },
  { label: 'GLB人体動作', kind: 'glbMotion', store: 'integrated', name: 'proof-motion.glb', sample: 'motion', view: 'motion', file: path.join(root, 'integrated_v02', 'assets', 'Rig_Medium_General.glb') },
  { label: 'GLBステージ', kind: 'stage', store: 'library', name: 'proof-stage.glb', sample: 'none', view: null, file: libraryFile('a54a7451a580eb88df9e6b13308d406cad9000abc72410fd4a006197dd7cae35.glb') },
  { label: 'WAV', kind: 'audio', store: 'library', name: 'proof-audio.wav', sample: 'audio', view: null, file: libraryFile('c8506bc68749956b12713631127d22771d8212de99f1e189296ee1c528a39809.wav') },
  { label: '画像', kind: 'image', store: 'library', name: 'proof-image.png', sample: 'image', view: null, file: path.join(root, 'sample_imports_20261021', 'ready', 'kenney_platformer_image.png') },
  { label: '動画', kind: 'video', store: 'library', name: 'proof-video.mp4', sample: 'video', view: null, file: path.join(root, 'sample_imports_20261021', 'ready', 'kenney_platformer_demo.mp4') },
];
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function json(response) {
  const body = await response.text();
  assert.equal(response.status, 200, body);
  return JSON.parse(body);
}
function storedPath(dataDir, row, item) {
  if (row.store === 'library') return path.join(dataDir, 'library_assets', 'files', item.filename);
  if (row.store === 'fbx') return path.join(dataDir, 'files', `${item.id.slice(4)}.fbx`);
  return path.join(dataDir, 'integrated_v02', 'assets', item.filename);
}

test('real VRM/FBX/GLB motion/stage/WAV/image/video register, preview and reload in v0.5 alone without changing originals',
  { skip: !root && 'BAI_REAL_MMD_DATA が未指定です', timeout: 600000 }, async () => {
    const missing = sources.filter(row => !fs.existsSync(row.file)).map(row => `${row.label}: ${row.file}`);
    assert.deepEqual(missing, [], '実素材が見つかりません');
    const before = sources.map(row => hashFile(row.file));
    // 50MBを超える実ファイルはバッファで渡せないため、登録名の一時複製をファイルとして選ぶ。
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'bai-real-format-'));
    const staged = row => { const file = path.join(staging, row.name); if (!fs.existsSync(file)) fs.copyFileSync(row.file, file); return file; };
    const server = await harness.startServer({ port: 8921 });
    let browser, page;
    const openedPages = [];
    const failedRequests = [];
    const shot = async (target, name) => {
      if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await target.screenshot({ path: path.join(shotDir, name) }); }
    };
    try {
      // BAI_REAL_GPU=1 では SwiftShader を使わず実GPUで描画する（見本の3D描画を実機で確かめる）。
      browser = process.env.BAI_REAL_GPU === '1'
        ? await require('playwright').chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
        : await server.launchBrowser();
      page = await server.newPage(browser);
      page.context().on('page', opened => openedPages.push(opened.url()));
      page.on('requestfailed', request => failedRequests.push(`${request.url().replace(server.base, '')} ${request.failure()?.errorText}`));
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.waitForFunction(() => Boolean(window.BAIStudioV05ModelImport));
      await page.locator('[data-go="library"]').first().click();
      const renderer = await harness.webglRenderer(page);
      let registered = 0;
      for (const row of sources) {
        await page.locator('#baiImport').click();
        await page.locator('#baiUploadKind').selectOption(row.kind);
        await page.locator('#baiUploadFiles').setInputFiles(staged(row));
        await page.locator('#baiUploadSubmit').click();
        registered++;
        await page.waitForFunction(count => document.querySelector('#baiAssetCount')?.textContent.includes(`登録${count}件`) &&
          !document.querySelector('#baiUploadKind'), registered, { timeout: 180000 });
      }
      assert.deepEqual(openedPages, [], '②の画面などの別タブを開いてはいけません');

      const inventory = await json(await fetch(`${server.base}/api/assets`));
      const byName = new Map(inventory.items.map(item => [item.originalName || item.name, item]));
      // ③の一覧で3Dのカードを表示すると、③が見本を作る。モデルの正面画像は保存されるまで待つ。
      for (const row of sources.filter(r => r.sample === 'thumbnail' || r.sample === 'motion')) {
        const id = byName.get(row.name).id;
        await page.locator(`[data-library-id="${id}"]`).scrollIntoViewIfNeeded();
        await page.waitForFunction(target => document.querySelector(`[data-library-id="${CSS.escape(target)}"] img`), id, { timeout: 180000 });
      }
      const saved = await json(await fetch(`${server.base}/api/assets`));
      for (const row of sources) {
        const item = saved.items.find(candidate => candidate.id === byName.get(row.name).id);
        assert.equal(Boolean(item.thumbnailUrl), row.sample === 'thumbnail', `見本の保存: ${row.label}`);
        byName.set(row.name, item);
      }
      await shot(page, '00_list_v05_only.png');

      const v05 = await json(await fetch(`${server.base}/api/studio/v05/assets`));
      const categories = new Map(v05.items.map(item => [item.id, item.category]));
      const inspect = async (row, item, shotName) => {
        await page.locator(`[data-library-id="${item.id}"]`).click();
        const detail = page.locator('#baiAssetDetail');
        await page.waitForFunction(id => document.querySelector(`[data-library-id="${CSS.escape(id)}"]`)?.getAttribute('aria-pressed') === 'true', item.id);
        assert.match(await detail.textContent(), /登録済み・利用可能/);
        if (row.sample === 'motion') await page.waitForFunction(() => document.querySelector('#baiAssetDetail img[data-v188-sample="motion"]'), null, { timeout: 120000 });
        const shown = await detail.evaluate(node => {
          const img = node.querySelector('img');
          const src = img?.getAttribute('src') || '';
          return {
            sample: img ? (src.startsWith('data:image/png') ? 'motion' : /\/thumbnail\//.test(src) ? 'thumbnail' : 'image')
              : node.querySelector('audio') ? 'audio' : node.querySelector('video') ? 'video' : 'none',
            warning: node.querySelector('.baiWarning')?.textContent || null,
            unsupported: [...node.querySelectorAll('.baiTiny')].map(p => p.textContent).find(t => /未接続/.test(t)) || null,
          };
        });
        assert.equal(shown.sample, row.sample, `見本の種類: ${row.label}`);
        if (row.sample === 'none') assert.match(shown.warning || '', /保存済み見本なし/, `見本なしの表示: ${row.label}`);
        if (row.view) assert.equal(shown.unsupported, null, `3D対応の素材に未接続と表示しています: ${row.label}`);
        else if (['model', 'motion'].includes(categories.get(item.id))) assert.match(shown.unsupported || '', /3D回転表示と実動作はこの詳細欄へ未接続/, `未対応の表示: ${row.label}`);
        if (['thumbnail', 'image', 'motion'].includes(shown.sample)) {
          await page.waitForFunction(() => document.querySelector('#baiAssetDetail img')?.naturalWidth > 0, null, { timeout: 30000 });
        }
        if (shown.sample === 'thumbnail' || shown.sample === 'motion') {
          // 見本の背景（左上の画素）以外の画素の平均輝度。材質が読めない黒い影絵は 0 付近になる。
          const luma = await detail.locator('img').first().evaluate(img => {
            const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
            const g = canvas.getContext('2d'); g.drawImage(img, 0, 0);
            const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
            const bg = [d[0], d[1], d[2]];
            let sum = 0, count = 0;
            for (let i = 0; i < d.length; i += 16) {
              if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) <= 24) continue;
              sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; count++;
            }
            return { mean: count ? Math.round(sum / count) : 0, figure: count };
          });
          assert.ok(luma.mean > 30 && luma.figure > 50, `見本に形が描かれていません（${JSON.stringify(luma)}）: ${row.label}`);
        }
        if (shown.sample === 'audio' || shown.sample === 'video') {
          await detail.locator(shown.sample).evaluate(node => { node.preload = 'metadata'; node.load(); });
          await page.waitForFunction(t => document.querySelector(`#baiAssetDetail ${t}`)?.readyState >= 1, shown.sample, { timeout: 60000 });
          assert.ok(await detail.locator(shown.sample).evaluate(node => node.duration) > 0, `再生時間: ${row.label}`);
          // 試験で強制した先読みを止める。50MBのWAVを読み続ける接続が同じホストの6本を埋めると、
          // 後の静的ファイルの取得が待たされて時間切れになる（画面の既定は preload="none"）。
          await detail.locator(shown.sample).evaluate(node => { node.pause(); node.removeAttribute('src'); node.load(); });
        }
        if (row.view === 'model') {
          await page.waitForFunction(() => window.BAIStudioV05ModelImport.detailStatus()?.ready, null, { timeout: 120000 });
          const stage = page.locator('[data-role="v188-stage"] canvas');
          await stage.scrollIntoViewIfNeeded();
          const box = await stage.boundingBox();
          const before3d = (await page.evaluate(() => window.BAIStudioV05ModelImport.detailStatus())).camera.position;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down({ button: 'middle' });
          await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 20, { steps: 8 });
          await page.mouse.up({ button: 'middle' });
          const after3d = (await page.evaluate(() => window.BAIStudioV05ModelImport.detailStatus())).camera.position;
          assert.ok(Math.hypot(...after3d.map((v, i) => v - before3d[i])) > 0.05, `中ドラッグで回転しません: ${row.label}`);
        }
        if (row.view === 'motion') {
          await page.waitForFunction(() => window.BAIStudioV05ModelImport.detailStatus()?.grayman === '1', null, { timeout: 120000 });
          const t0 = await page.locator('[data-role="v188-time"]').textContent();
          await page.waitForFunction(first => document.querySelector('[data-role="v188-time"]')?.textContent !== first, t0, { timeout: 15000 });
          await page.locator('[data-role="v188-pause"]').click();
          await page.locator('[data-role="v188-seek"]').evaluate(input => { input.value = String(Number(input.max) / 2); input.dispatchEvent(new Event('input', { bubbles: true })); });
          const seeked = await page.evaluate(() => window.BAIStudioV05ModelImport.detailStatus());
          assert.ok(seeked.seek > 0, `シークできません: ${row.label}`);
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
        results.push({ label: row.label, kind: row.kind, id: item.id, category: categories.get(item.id), format: item.format,
          sha256: before[i], thumbnailUrl: item.thumbnailUrl || null, shown });
      }

      // 上書きになる登録は、確認なしでは送らない（②と同じ判定）。
      const fbxMotion = sources.find(row => row.kind === 'fbxMotion');
      const motionFile = storedPath(server.dataDir, fbxMotion, byName.get(fbxMotion.name));
      const motionMtime = fs.statSync(motionFile).mtimeMs;
      await page.locator('#baiImport').click();
      await page.locator('#baiUploadKind').selectOption('fbxMotion');
      await page.locator('#baiUploadFiles').setInputFiles(staged(fbxMotion));
      await page.locator('#baiUploadSubmit').click();
      await page.locator('#baiUploadConfirm [data-v188-ack]').waitFor({ timeout: 60000 });
      assert.match(await page.locator('#baiUploadConfirm').textContent(), /同じ名前の FBX/);
      assert.equal(fs.statSync(motionFile).mtimeMs, motionMtime, '確認の前に上書きしました');
      await shot(page, '90_overwrite_confirm.png');

      await page.reload();
      await page.waitForFunction(() => Boolean(window.BAIStudioV05ModelImport));
      await page.locator('[data-go="library"]').first().click();
      await page.waitForFunction(count => document.querySelector('#baiAssetCount')?.textContent.includes(`登録${count}件`), sources.length);
      const reloaded = await json(await fetch(`${server.base}/api/assets`));
      for (let i = 0; i < sources.length; i++) {
        const item = reloaded.items.find(candidate => candidate.id === results[i].id);
        assert.ok(item?.available, `再読込後に利用不可: ${sources[i].label}`);
        assert.equal(item.thumbnailUrl || null, results[i].thumbnailUrl, `再読込後の見本URL: ${sources[i].label}`);
        await page.locator(`[data-library-id="${item.id}"]`).scrollIntoViewIfNeeded();
        const again = await inspect(sources[i], item, `R${String(i + 1).padStart(2, '0')}_${sources[i].name.replace(/\W/g, '_')}.png`);
        assert.deepEqual(again, results[i].shown, `再読込後の詳細: ${sources[i].label}`);
      }
      assert.deepEqual(openedPages, [], '②の画面などの別タブを開いてはいけません');
      assert.deepEqual(sources.map(row => hashFile(row.file)), before, '実素材の原本hashが変わりました');
      harness.assertNoErrors(page);
      console.log(`REAL_FORMAT_RESULTS ${JSON.stringify({ renderer, results })}`);
    } catch (error) {
      // 失敗時の診断：画面と件数・詳細欄を残す。
      if (page && !page.isClosed()) await shot(page, 'failure_v05.png').catch(() => {});
      const count = page && !page.isClosed() ? await page.locator('#baiAssetCount').textContent().catch(() => null) : null;
      const status = page && !page.isClosed() ? await page.locator('#baiAssetDetail').textContent().catch(() => null) : null;
      console.log(`REAL_FORMAT_FAILURE ${JSON.stringify({ count, status: status?.slice(0, 600), openedPages, failedRequests })}`);
      throw error;
    } finally {
      await page?.close(); await browser?.close(); await server.stop();
      fs.rmSync(staging, { recursive: true, force: true });
    }
  });
