'use strict';
// 保存したステージ位置と保存カメラが、プレビューとMP4で同じ構図になるか（ロードマップ次の実施順3、#39/#63/#81）。
// 実PMXと所有者の実GLBステージを BAI_REAL_MMD_DATA から読み取り専用で隔離サーバーへ複製する。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');

const sourceRoot = process.env.BAI_REAL_MMD_DATA;
const shotDir = process.env.BAI_SHOT_DIR;
const modelName = 'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const stageId = 'library:c8b7aa49c924c0b00b5d3ecc';
const stageFilename = 'a54a7451a580eb88df9e6b13308d406cad9000abc72410fd4a006197dd7cae35.glb';
const paths = sourceRoot && {
  model: path.join(sourceRoot, 'mmd', 'A', modelName),
  stage: path.join(sourceRoot, 'library_assets', 'files', stageFilename),
  mmdIndex: path.join(sourceRoot, 'mmd_assets.json'),
  libraryIndex: path.join(sourceRoot, 'library_assets', 'index.json'),
};
const W = 320, H = 180;
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function json(response, status = 200) {
  const body = await response.text();
  assert.equal(response.status, status, body);
  return JSON.parse(body);
}
// 画像（PNG/MP4）を W×H の RGB へ縮小して返す。縦横比は保たず、出力枠全体を W×H に写す。
function rgb(input, args = []) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...args,
    '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
  { input, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr.toString());
  assert.equal(run.stdout.length, W * H * 3);
  return run.stdout;
}
const far = (a, i, color) => Math.abs(a[i] - color[0]) + Math.abs(a[i + 1] - color[1]) + Math.abs(a[i + 2] - color[2]) > 90;
// 3Dが描かれた画素＝背景のマゼンタ画像でも、プレビューの余白色でもない画素。
// 枠は小数画素の位置にあり、撮影した外周2画素はマゼンタと余白色が混ざるため除く。
function mask(pixels) {
  const out = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const x = p % W, y = Math.floor(p / W);
    const inside = x >= 2 && x < W - 2 && y >= 2 && y < H - 2;
    out[p] = inside && far(pixels, p * 3, [255, 0, 255]) && far(pixels, p * 3, [5, 11, 18]) ? 1 : 0;
  }
  return out;
}
function compare(a, b) {
  let both = 0, either = 0;
  const center = m => { let x = 0, y = 0, n = 0; m.forEach((v, p) => { if (v) { x += p % W; y += Math.floor(p / W); n++; } }); return n ? [x / n / W, y / n / H, n] : [NaN, NaN, 0]; };
  for (let p = 0; p < W * H; p++) { both += a[p] & b[p]; either += a[p] | b[p]; }
  const [ax, ay, an] = center(a), [bx, by, bn] = center(b);
  return { iou: either ? both / either : 0, centerShift: Math.hypot(ax - bx, ay - by), previewPixels: an, mp4Pixels: bn };
}

test('automatic camera gives the same framing in preview and MP4',
  { skip: !sourceRoot && 'BAI_REAL_MMD_DATA が未指定です', timeout: 420000 }, async () => {
    const missing = Object.entries(paths).filter(([, file]) => !fs.existsSync(file)).map(([key]) => key);
    assert.deepEqual(missing, [], '実PMXまたは実GLBステージがありません');
    const before = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, hashFile(file)]));
    const mmdIndex = JSON.parse(fs.readFileSync(paths.mmdIndex, 'utf8'));
    const modelEntries = mmdIndex.A.filter(row => row.name === modelName || row.name.startsWith('tex/'));
    const stageEntry = JSON.parse(fs.readFileSync(paths.libraryIndex, 'utf8')).items.find(row => row.id === stageId);
    assert.equal(stageEntry?.filename, stageFilename);
    const seed = {
      'mmd_assets.json': JSON.stringify({ A: modelEntries, B: [], vmd: [] }),
      'library_assets/index.json': JSON.stringify({ schema: 1, items: [stageEntry] }),
      [`library_assets/files/${stageFilename}`]: fs.readFileSync(paths.stage),
    };
    for (const row of modelEntries) seed[`mmd/A/${row.name}`] = fs.readFileSync(path.join(sourceRoot, 'mmd', 'A', ...row.name.split('/')));
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bai-auto-composition-'));
    const backdrop = path.join(temp, 'magenta.png');
    const made = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0xff00ff:s=1280x720',
      '-frames:v', '1', backdrop]);
    assert.equal(made.status, 0, made.stderr.toString());
    const server = await harness.startServer({ port: 8923, seed });
    let browser, page;
    try {
      const image = await json(await fetch(`${server.base}/api/library-assets/upload?kind=image&name=composition-backdrop.png`,
        { method: 'POST', body: fs.readFileSync(backdrop) }));
      const project = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '自動構図の一致', kind: 'empty' }),
      }));
      const id = project.project.id;
      const sceneApi = async body => json(await fetch(`${server.base}/api/studio/v05/scene/instances`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: id, ...body }),
      }));
      let scene = await sceneApi({ action: 'add', revision: 0, asset_id: `mmd:A:${modelName}`,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } });
      // ステージは原点からずらし、回転・縮小して保存する。
      const stageTransform = { position: [3, 0, -4], rotation: [0, 35, 0], scale: [0.5, 0.5, 0.5] };
      scene = await sceneApi({ action: 'add', revision: scene.revision, asset_id: stageId, transform: stageTransform });
      // 選択時の移動ハンドルはMP4に出ないため、両方を固定してハンドルを外す。
      for (const row of scene.instances) scene = await sceneApi({ action: 'update', revision: scene.revision, instance_id: row.id, locked: true });
      const saved = await json(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${id}`));
      assert.equal(saved.camera, null, 'カメラ未保存の作品であること');
      assert.deepEqual(saved.instances.find(row => row.asset_id === stageId).transform, stageTransform);
      const placed = await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id, asset_id: image.item.id, track: 'image', start: 0, duration: 1, revision: 0 }),
      }));

      browser = process.env.BAI_REAL_GPU === '1'
        ? await require('playwright').chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
        : await server.launchBrowser();
      page = await server.newPage(browser, { expectErrors: [/unknown char code \d+\./] });
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(id);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(projectId => window.BAIStudioMultiScenePreview?.status().projectId === projectId &&
        window.BAIStudioMultiScenePreview.status().loaded === 2 && window.BAIStudioMediaPreviewV68?.status().mediaCount === 1,
      id, { timeout: 180000 });
      await page.evaluate(() => window.BAIStudioMediaPreviewV68.seek(0));
      await page.waitForTimeout(800);
      const stageInstance = saved.instances.find(row => row.asset_id === stageId).id;
      const probe = await page.evaluate(target => window.BAIStudioMultiScenePreview.frameProbe(target), stageInstance);
      assert.equal(probe.cameraSaved, false, '自動構図を使っていません');
      assert.ok(probe.camera.every(Number.isFinite), '自動カメラの位置が不正です');
      // 重なっている操作パネルを隠し、3D表示の範囲だけを撮る。
      const chrome = ['#v58-multi-preview', '#v58-canvas .vp-nav-help'];
      await page.evaluate(list => list.forEach(selector => { document.querySelector(selector).style.visibility = 'hidden'; }), chrome);
      const previewPng = await page.locator('#v58-canvas').screenshot();
      await page.evaluate(list => list.forEach(selector => { document.querySelector(selector).style.visibility = ''; }), chrome);
      // プレビューの3D表示とメディアの枠が同じ位置・大きさ（出力枠）であること。
      const boxes = await page.evaluate(() => ['#v58-canvas', '#v68layers'].map(selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return [r.left, r.top, r.width, r.height].map(Math.round);
      }));
      assert.deepEqual(boxes[0], boxes[1], 'プレビューの3D表示とメディアの枠が一致しません');

      const range = await json(await fetch(`${server.base}/api/studio/v05/timeline/range`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id, revision: 0, arrangement_revision: placed.revision, in_frame: 0, out_frame: 0 }),
      }));
      const started = await json(await fetch(`${server.base}/api/studio/v05/render/jobs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id, arrangement_revision: placed.revision,
          range_revision: range.revision, scene_revision: scene.revision, resolution: '720p' }),
      }), 202);
      let job;
      const deadline = Date.now() + 240000;
      do {
        await new Promise(resolve => setTimeout(resolve, 500));
        job = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${started.id}`));
      } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
      assert.equal(job.status, 'succeeded', job.error);
      assert.equal(job.probe.width, 1280);
      assert.equal(job.probe.height, 720);
      for (const [assetId, expected] of [[`mmd:A:${modelName}`, before.model], [stageId, before.stage]]) {
        assert.ok(job.inputs.some(input => input.asset_id === assetId && input.sha256 === expected), assetId);
      }
      const mp4 = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
      if (shotDir) {
        fs.mkdirSync(shotDir, { recursive: true });
        fs.writeFileSync(path.join(shotDir, 'preview_3d.png'), previewPng);
        const frame = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', 'pipe:0', '-frames:v', '1',
          path.join(shotDir, 'mp4_frame0.png')], { input: mp4 });
        assert.equal(frame.status, 0, frame.stderr.toString());
      }
      const result = compare(mask(rgb(previewPng)), mask(rgb(mp4)));
      const aspect = probe.canvas[0] / probe.canvas[1];
      console.log(`COMPOSITION ${JSON.stringify({ previewCanvas: probe.canvas, frameBox: boxes[0], aspect, ...result,
        renderer: job.scene_capture?.renderer, previewRenderer: probe.renderer })}`);
      assert.ok(Math.abs(aspect - 16 / 9) < 0.02, `プレビューの3D表示が出力と同じ16:9ではありません（${probe.canvas.join('×')}）`);
      assert.ok(result.iou > 0.85, `プレビューとMP4で3Dの位置がずれています（IoU ${result.iou.toFixed(3)}）`);
      assert.ok(result.centerShift < 0.01, `3Dの中心がずれています（${result.centerShift.toFixed(4)}）`);
      harness.assertNoErrors(page);
    } finally {
      await page?.close(); await browser?.close(); await server.stop();
      fs.rmSync(temp, { recursive: true, force: true });
      for (const [key, file] of Object.entries(paths)) assert.equal(hashFile(file), before[key], `${key}原本が変わりました`);
    }
  });
