'use strict';
// P2 通し確認（設計 P2 §2.9）：S1〜S8。画面の操作だけで行う。ポート 8787（P2_E2E_PORT）。
// WP-00a-2 では土台だけ。まだ有効でない手順（WP が未着手）、既存機能が無い手順、後段のフェーズの手順は
// すべて skip で理由付き。**skip を合格と数えない**。有効にする WP が、その手順の body を実装する。
// 結果は P2_E2E_RESULT（既定 test-results/e2e_main.json）へ書き、tools/record_e2e_main.mjs が台帳へ写す。
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.P2_E2E_PORT || 8787);
const RESULT = process.env.P2_E2E_RESULT || path.join(harness.root, 'test-results', 'e2e_main.json');

// kind: pending_wp（WP が未着手＝切れ目になる）| no_existing（既存機能なし）| later_phase（後段のフェーズ）
// run: 実装済みの手順だけ (ctx) => Promise。ctx = { server, browser, page }
const STEPS = [
  // needs3d：three.js（THREE_DIR または node_modules/three）が要る手順。無い環境では skip（理由付き）。
  { id: 'S1', title: 'VRM/PMX の読込', kind: 'active', needs3d: true,
    // ③の取り込み（合成 GLB を VRM として登録）→ ④の表示（［3D で表示］から SCR-12）→ ［このモデルを制作に使う］→［保存］。
    run: async ({ server, page }) => {
      const glb = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'));
      await page.goto(`${server.base}/workspace/08`);
      await page.waitForSelector('[data-feature="assetLibrary"]');
      await page.click('.screen-head [data-role="open-import"]');
      await page.setInputFiles('[role="dialog"] [data-role="import-files"]', [{ name: 'singer.vrm', mimeType: 'application/octet-stream', buffer: glb }]);
      await page.click('[role="dialog"] [data-role="import-go"]');
      await page.waitForFunction(() => /^完了$/.test(document.querySelector('[data-feature="importQueue"] tbody tr[data-name="singer.vrm"] [data-role="status"]')?.textContent || ''), null, { timeout: 10000 });
      const selected = await page.locator('[data-feature="assetLibrary"] .asset[aria-selected="true"]').getAttribute('data-asset-id');
      if (!/^integrated:[0-9a-f]{20}\.vrm$/.test(selected || '')) throw new Error(`取り込んだ VRM が選ばれていません: ${selected}`);
      if (!/キャラクター/.test(await page.textContent('[data-feature="assetDetail"] [data-key="category"]'))) throw new Error('VRM が「キャラクター」に分類されていません');
      ctx.vrmId = selected;
      // ④：詳細の［3D で表示］から SCR-12 へ。キャンバスにモデルが描画される
      await page.click('[data-feature="assetDetail"] [data-role="show-3d"]');
      await page.waitForFunction(() => window.baiStudio.viewport.getState().loaded === true, null, { timeout: 25000 });
      const st = await page.evaluate(() => window.baiStudio.viewport.getState());
      if (st.assetId !== selected || st.format !== 'VRM') throw new Error(`表示されたモデルが違います: ${JSON.stringify([st.assetId, st.format])}`);
      if ((await page.evaluate(() => window.baiStudio.viewport.countNonBackground())) < 50) throw new Error('キャンバスにモデルが描画されていません');
      // ［このモデルを制作に使う］→［保存］（空のコンビネーションを作る確認が出る）
      await page.click('[data-role="use-model"]');
      await page.click('.screen-head [data-role="project-save"]');
      await page.waitForSelector('[data-role="confirm-ok"]');
      await page.click('[data-role="confirm-ok"]');
      await page.waitForFunction(() => { const x = window.baiStudio.project.getState(); return !x.saving && !x.dirty.workspace && !x.dirty.combination; }, null, { timeout: 10000 });
      const ws = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'project_state.workspace.json'), 'utf8'));
      if (ws.asset !== selected.slice('integrated:'.length)) throw new Error(`workspace.asset が入っていません: ${JSON.stringify(ws)}`);
    } },
  { id: 'S2', title: 'ステージの配置', kind: 'active', needs3d: true,
    // ④-11：SCR-06 でステージを選び、位置 X=3・回転 Y=90・拡大 2 にして保存。読み直しても同じ。
    run: async ({ server, page }) => {
      await page.click('#nav a[data-route="06"]');
      await page.waitForSelector('[data-feature="sceneViewport"]');
      await page.waitForFunction(() => window.baiStudio.viewport.getState().character?.assetId, null, { timeout: 25000 });
      await page.selectOption('[data-role="stage-asset"]', ctx.vrmId);
      await page.waitForFunction((id) => window.baiStudio.viewport.getState().stage?.assetId === id, ctx.vrmId, { timeout: 25000 });
      const set = async (n, v) => { const num = page.locator('[data-role="stage-slider"]').nth(n).locator('input.num'); await num.fill(String(v)); await num.dispatchEvent('change'); };
      await set(0, 3); await set(4, 90); await set(6, 2);
      await page.click('.screen-head [data-role="project-save"]');
      await page.waitForFunction(() => { const x = window.baiStudio.project.getState(); return !x.saving && !x.dirty.workspace; }, null, { timeout: 10000 });
      const ws = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'project_state.workspace.json'), 'utf8'));
      const want = { asset: ctx.vrmId, position: [3, 0, 0], rotation: [0, 90, 0], scale: 2 };
      if (JSON.stringify(ws.stage) !== JSON.stringify(want)) throw new Error(`stage が違います: ${JSON.stringify(ws.stage)}`);
      if (ws.asset !== ctx.vrmId.slice('integrated:'.length) || ws.clip !== null) throw new Error(`asset・clip が変わっています: ${JSON.stringify(ws)}`);
      await page.reload();
      await page.waitForFunction(() => window.baiStudio.viewport.getState().stage?.assetId, null, { timeout: 25000 });
      const s = (await page.evaluate(() => window.baiStudio.viewport.getState())).stage;
      const ok = Math.abs(s.position[0] - 3) < 1e-9 && Math.abs(s.rotation[1] - 90) < 1e-9 && Math.abs(s.displayScale - 2) < 1e-9;
      if (!ok) throw new Error(`読み直すと配置が違います: ${JSON.stringify(s)}`);
    } },
  { id: 'S3', title: 'カメラの設定', kind: 'active', needs3d: true,
    run: async ({ server, page }) => {
      await page.click('#nav a[data-route="02"]');
      await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio' &&
        document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
      const before = await page.evaluate(() => window.baiStudio.project.getState().bundle.camera.keys.length);
      for (const [frame, x] of [[60, 2], [120, -2]]) {
        await page.fill('#frame-number', String(frame));
        await page.locator('#frame-number').dispatchEvent('change');
        await page.fill('#position0', String(x));
        await page.click('#key-save');
      }
      await page.waitForFunction(() => window.baiStudio.project.getState().dirty.camera === true);
      const saved = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/project\/bundle$/.test(r.url()));
      await page.click('.screen-head [data-role="project-save"]');
      if ((await saved).status() !== 200) throw Error('カメラの統合保存に失敗しました');
      const camera = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'camera_project.json'), 'utf8'));
      if (camera.keys.length !== before + 2 || !camera.keys.some((key) => key.frame === 60 && key.position[0] === 2) ||
        !camera.keys.some((key) => key.frame === 120 && key.position[0] === -2)) throw Error('2つのカメラキーが保存されていません');
      const ws = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'project_state.workspace.json'), 'utf8'));
      if (ws.stage?.position?.[0] !== 3 || ws.stage?.rotation?.[1] !== 90) throw Error('統合保存でステージ配置が失われました');
      await page.reload();
      await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio' &&
        document.querySelector('#status')?.textContent.includes('カメラ編集を開始'), null, { timeout: 30000 });
      if ((await page.locator('#track button').count()) !== camera.keys.length) throw Error('再読込でカメラキーが一致しません');
    } },
  { id: 'S4', title: 'BGM（歌の音声）の配置', kind: 'no_existing', reason: '既存機能なし（音声の登録 API・タイムラインの音声トラックが旧画面に無い。Q4 で所有者が決める）' },
  { id: 'S5', title: 'VMD/FBX の設置', kind: 'active', needs3d: true,
    // ⑤（WP-05a）：③の取り込みで PMX の ZIP と VMD を1回で登録 → SCR-13［編集］で PMX に VMD を当てる（位置 1.0 でモーフ あ=1・センターの y +1.0）
    //   → S1 の VRM のクリップを位置 0.5 にすると hips の z が 0.5。05d で SCR-05 の FBX コンビネーションを連結再生する。
    run: async ({ server, page }) => {
      const zip = fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal_pmx.zip'));
      const vmd = fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal.vmd'));
      await page.click('#nav a[data-route="08"]');
      await page.waitForSelector('[data-feature="assetLibrary"]');
      await page.click('.screen-head [data-role="open-import"]');
      await page.setInputFiles('[role="dialog"] [data-role="import-files"]', [
        { name: 'pack.zip', mimeType: 'application/octet-stream', buffer: zip },
        { name: 'minimal.vmd', mimeType: 'application/octet-stream', buffer: vmd }]);
      await page.click('[role="dialog"] [data-role="import-go"]');
      for (const n of ['pack.zip', 'minimal.vmd']) {
        await page.waitForFunction((name) => /^完了$/.test(document.querySelector(`[data-feature="importQueue"] tbody tr[data-name="${CSS.escape(name)}"] [data-role="status"]`)?.textContent || ''), n, { timeout: 15000 });
      }
      // SCR-13 を開き［編集］
      await page.click('#nav a[data-route="13"]');
      await page.waitForSelector('.mode-switch [data-mode="edit"]');
      await page.click('.mode-switch [data-mode="edit"]');
      await page.waitForSelector('[data-feature="motionViewport"]');
      await page.selectOption('[data-role="motion-model"]', 'mmd:A:test.pmx');
      await page.waitForFunction(() => window.baiStudio.motion.getState().modelId === 'mmd:A:test.pmx' && window.baiStudio.viewport.getState().loaded, null, { timeout: 25000 });
      await page.click('[data-feature="vmdLibrary"] li[data-asset-id="mmd:vmd:minimal.vmd"]');
      await page.waitForFunction(() => window.baiStudio.motion.getState().motion?.kind === 'vmd', null, { timeout: 15000 });
      const pause = async () => { if ((await page.evaluate(() => window.baiStudio.motion.getState())).playing) await page.click('[data-role="motion-play"]'); };
      const seekTo = async (sec) => { await pause(); await page.fill('[data-role="motion-seek"]', String(sec)); };
      await seekTo(0);
      const p0 = await page.evaluate(() => window.baiStudio.motion.probe({ morphs: ['あ'], bones: ['センター'] }));
      await seekTo(1.0);
      const p1 = await page.evaluate(() => window.baiStudio.motion.probe({ morphs: ['あ'], bones: ['センター'] }));
      if (Math.abs(p1.morphs['あ'] - 1) > 1e-6) throw new Error(`位置 1.0 でモーフ あ が 1 ではありません: ${p1.morphs['あ']}`);
      const dy = p1.bones['センター'][1] - p0.bones['センター'][1];
      if (Math.abs(dy - 1) > 1e-4) throw new Error(`センターの y が +1.0 動いていません: ${dy}`);
      // S1 の VRM のクリップ
      await page.selectOption('[data-role="motion-model"]', ctx.vrmId);
      await page.waitForFunction((id) => window.baiStudio.motion.getState().modelId === id && window.baiStudio.viewport.getState().loaded, ctx.vrmId, { timeout: 25000 });
      await page.waitForFunction(() => window.baiStudio.motion.getState().motion?.kind === 'clip', null, { timeout: 10000 });
      await seekTo(0.5);
      const hips = (await page.evaluate(() => window.baiStudio.motion.probe({ bones: ['hips'] }))).bones.hips;
      if (!hips || Math.abs(hips[2] - 0.5) > 1e-6) throw new Error(`VRM のクリップ 0 の位置 0.5 で hips の z が 0.5 ではありません: ${JSON.stringify(hips)}`);
      await page.click('[data-role="motion-record"]');
      await page.click('#nav a[data-route="18"]');
      await page.click('.screen-head [data-role="project-save"]');
      await page.waitForFunction(() => { const s = window.baiStudio.project.getState(); return !s.saving && !s.dirty.workspace; }, null, { timeout: 10000 });
      const recorded = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'project_state.workspace.json'), 'utf8'));
      if (recorded.clip !== 0 || recorded.frame !== 15) throw Error(`VRMのクリップと再生位置を記録できませんでした: ${JSON.stringify(recorded)}`);
      // 05d：③の取り込みから FBX モデルA・モーションを登録し、05 の連結再生で Tri が動く。
      const model = fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal_model.fbx'));
      const motion = fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal_motion.fbx'));
      await page.click('#nav a[data-route="08"]');
      await page.waitForSelector('[data-feature="assetLibrary"]');
      await page.click('.screen-head [data-role="open-import"]');
      await page.setInputFiles('[role="dialog"] [data-role="import-files"]', [
        { name: 'model.fbx', mimeType: 'application/octet-stream', buffer: model },
        { name: 'Boxing Leading Hand Jab.fbx', mimeType: 'application/octet-stream', buffer: motion },
      ]);
      await page.selectOption('[role="dialog"] li[data-name="model.fbx"] select[data-role="kind"]', 'modelA');
      await page.click('[role="dialog"] [data-role="import-go"]');
      for (const name of ['model.fbx', 'Boxing Leading Hand Jab.fbx']) {
        await page.waitForFunction((n) => /^完了$/.test(document.querySelector(`[data-feature="importQueue"] tbody tr[data-name="${CSS.escape(n)}"] [data-role="status"]`)?.textContent || ''), name, { timeout: 15000 });
      }
      await page.click('#nav a[data-route="05"]');
      await page.waitForFunction(() => document.querySelector('[data-role="actor-a"] option[value="fbx"]')?.textContent === 'FBX モデル', null, { timeout: 25000 });
      await page.click('[data-feature="patternList"] li[data-pattern-id="1"]');
      await page.click('[data-role="chain-add"]');
      await page.click('[data-role="chain-play"]');
      await page.waitForFunction(() => window.baiStudio.chain.getState()?.playing && window.baiStudio.chain.probe({ bones: ['Tri'] }).bones.Tri?.[0] > .1, null, { timeout: 10000 });
    } },
  { id: 'S6', title: 'エフェクト', kind: 'later_phase', reason: '後段のフェーズ（MMDエフェクト）' },
  { id: 'S7', title: '踊らせる（再生）', kind: 'active', needs3d: true,
    run: async ({ page }) => {
      await page.click('#nav a[data-route="02"]');
      await page.waitForFunction(() => window.BAICameraPage?.handle()?.host === 'studio' &&
        document.querySelector('#camera-asset-status')?.textContent.includes('3D表示中'), null, { timeout: 30000 });
      const ws = await page.evaluate(() => window.baiStudio.project.getState().bundle.workspace);
      if (ws.clip !== 0 || ws.frame !== 15 || (await page.locator('#frame-number').inputValue()) !== '15') throw Error('記録したVRMのクリップ・再生位置がカメラに反映されていません');
      const hipsIndex = await page.locator('#camera-follow-bone option').evaluateAll((options) => options.find((option) => /hips/i.test(option.textContent))?.value ?? null);
      if (hipsIndex === null) throw Error('カメラの3Dモデルにhipsボーンがありません');
      await page.click('.camera-host-tabs [data-camera-tab="focus"]');
      await page.selectOption('#camera-follow-bone', hipsIndex);
      const boneAt = (frame) => page.evaluate((at) => {
        let result = null;
        window.dispatchEvent(new CustomEvent('bai-camera-query-focus-target', { detail: { frame: at, resolve: (value) => { result = value; } } }));
        return result?.point;
      }, frame);
      const a = await boneAt(0), b = await boneAt(15);
      if (!a || !b || Math.abs(b[2] - a[2]) < 0.1) throw Error(`再生位置でhipsボーンが動いていません: ${JSON.stringify([a, b])}`);
      const poseAt = (frame) => page.evaluate((at) => {
        let result = null;
        window.dispatchEvent(new CustomEvent('bai-camera-query-pose', { detail: { frame: at, resolve: (value) => { result = value; } } }));
        return result;
      }, frame);
      const start = await poseAt(60), middle = await poseAt(75), end = await poseAt(90), last = await poseAt(120);
      if (!start || !middle || !end || !last || Math.abs(start.position[0] - 2) > 1e-6 || Math.abs(last.position[0] + 2) > 1e-6 ||
        !(middle.position[0] > Math.min(start.position[0], end.position[0]) && middle.position[0] < Math.max(start.position[0], end.position[0])))
        throw Error(`カメラキーの間で位置が補間されていません: ${JSON.stringify([start, middle, end, last])}`);
      await page.click('#play');
      await page.waitForFunction(() => Number(document.querySelector('#frame-number')?.value) > 15, null, { timeout: 10000 });
      await page.click('#play');
    } },
  { id: 'S8', title: '書き出し', kind: 'active',
    // ⑦：既存のFBX→VMDジョブとBlender実行要求。どちらのPOSTもexports/へ書くため先に遮断する。
    // 音声付き動画の書き出しは既存機能なし（Phase F）。
    run: async ({ page }) => {
      const jobs = [], runs = [];
      await page.route('**/api/export-vmd-job', async (route) => {
        jobs.push(route.request().postDataJSON());
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"job":"exports/vmd_conversion_job.json"}' });
      });
      await page.route('**/api/run-vmd-conversion', async (route) => {
        runs.push(route.request().postDataJSON());
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Blender executable not found; set MIXAMO_BLENDER"}' });
      });
      harness.expectErrors(page, [/Failed to load resource: the server responded with a status of 503/]);
      await page.click('#nav a[data-route="23"]');
      await page.waitForSelector('[data-feature="exportPanel"]');
      await page.waitForFunction(() => document.querySelector('[data-role="vmd-combination"]')?.textContent.includes('1手順'));
      await page.waitForFunction(() => document.querySelector('[data-role="vmd-map-status"]')?.textContent.includes('対応表'));
      await page.click('[data-role="vmd-job"]');
      await page.waitForFunction(() => document.querySelector('[data-role="vmd-job-status"]')?.textContent.includes('作成済み'));
      if (jobs.length !== 1 || jobs[0].names?.[0] !== 'Boxing Leading Hand Jab.fbx' ||
        jobs[0].bone_map?.['mixamorig:Hips'] !== 'センター' || jobs[0].scale !== 1) {
        throw Error(`VMDジョブの要求が旧画面の仕様と違います: ${JSON.stringify(jobs)}`);
      }
      await page.click('[data-role="vmd-run"]');
      if (runs.length) throw Error('利用者の確認前にBlender実行要求を送っています');
      await page.click('[role="dialog"] [data-role="confirm-ok"]');
      await page.waitForFunction(() => document.querySelector('[data-role="vmd-run-status"]')?.textContent.includes('Blender executable not found'));
      if (JSON.stringify(runs) !== JSON.stringify([{ confirm: true, slot: 'A' }])) throw Error(`Blender実行要求が違います: ${JSON.stringify(runs)}`);
    } },
];

const results = [];
const ctx = {};

test.after(async () => {
  await ctx.browser?.close();   // ブラウザーを閉じてからサーバーを止める
  await ctx.server?.stop();
  fs.mkdirSync(path.dirname(RESULT), { recursive: true });
  results.sort((a, b) => STEPS.findIndex((x) => x.id === a.id) - STEPS.findIndex((x) => x.id === b.id)); // 手順の順（S1 は実行時に追加されるため）
  fs.writeFileSync(RESULT, JSON.stringify({ steps: results, checked_at: new Date().toISOString() }, null, 1) + '\n');
});

for (const step of STEPS) {
  const name = `${step.id} ${step.title}`;
  if (!step.run && step.partial) {
    // 有効な部分だけ実行し、結果は「skip（理由付き）」で記録する。部分が壊れたら fail にする。
    test(`${name}（有効な部分のみ。全体は skip として記録）`, async () => {
      try {
        if (!ctx.server) {
          ctx.server = await harness.startServer({ port: PORT });
          ctx.browser = await ctx.server.launchBrowser();
          ctx.page = await ctx.server.newPage(ctx.browser);
        }
        await step.partial(ctx);
        harness.assertNoErrors(ctx.page);
        results.push({ id: step.id, result: 'skip', reason: step.reason, kind: step.kind });
      } catch (e) {
        results.push({ id: step.id, result: 'fail', reason: `有効な部分が失敗: ${String(e.message).slice(0, 250)}`, kind: step.kind });
        throw e;
      }
    });
    continue;
  }
  if (!step.run) {
    results.push({ id: step.id, result: 'skip', reason: step.reason, kind: step.kind });
    test(name, { skip: step.reason }, () => {});
    continue;
  }
  const opts = step.needs3d ? harness.skip3d() : {};
  if (step.needs3d && !harness.haveThree()) results.push({ id: step.id, result: 'skip', reason: harness.THREE_SKIP_REASON, kind: 'pending_wp' });
  test(name, opts, async () => {
    try {
      if (!ctx.server) {
        ctx.server = await harness.startServer({ port: PORT });
        ctx.browser = await ctx.server.launchBrowser();
        ctx.page = await ctx.server.newPage(ctx.browser);
      }
      await step.run(ctx);
      harness.assertNoErrors(ctx.page);
      results.push({ id: step.id, result: 'pass', reason: '', kind: step.kind });
    } catch (e) {
      results.push({ id: step.id, result: 'fail', reason: String(e.message).slice(0, 300), kind: step.kind });
      throw e;
    }
  });
}
