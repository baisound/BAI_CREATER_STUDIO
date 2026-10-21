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
      await set(0, 3); await set(3, 90); await set(4, 2);
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
  { id: 'S3', title: 'カメラの設定', kind: 'pending_wp', reason: 'WP-06b・WP-06c が未着手' },
  { id: 'S4', title: 'BGM（歌の音声）の配置', kind: 'no_existing', reason: '既存機能なし（音声の登録 API・タイムラインの音声トラックが旧画面に無い。Q4 で所有者が決める）' },
  { id: 'S5', title: 'VMD/FBX の設置', kind: 'active', needs3d: true,
    // ⑤（WP-05a）：③の取り込みで PMX の ZIP と VMD を1回で登録 → SCR-13［編集］で PMX に VMD を当てる（位置 1.0 でモーフ あ=1・センターの y +1.0）
    //   → S1 の VRM のクリップを位置 0.5 にすると hips の z が 0.5。05b で clip・frame の記録、05d で FBX のコンビネーションの連結再生を足す。
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
    } },
  { id: 'S6', title: 'エフェクト', kind: 'later_phase', reason: '後段のフェーズ（MMDエフェクト）' },
  { id: 'S7', title: '踊らせる（再生）', kind: 'pending_wp', reason: 'WP-06c が未着手' },
  { id: 'S8', title: '書き出し', kind: 'pending_wp', reason: 'WP-07 が未着手（動画は既存機能なし：Phase F）' },
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
