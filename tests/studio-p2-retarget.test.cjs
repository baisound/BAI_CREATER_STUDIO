'use strict';
// ④-9・④-10 リターゲット検証の移植（P2 設計 §2.4(h) O-④-5、WP-04b）。実サーバー（隔離データ）と Chromium（SwiftShader）で、
// SCR-13 の画面の操作から確かめる。ポート：P2_RETARGET_PORT（既定 8791）。GPU は未検証（SwiftShader のみ）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.P2_RETARGET_PORT || 8784);
const SHOTS = process.env.P2_RETARGET_SHOTS || '';
const GLB = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'));
const A = 'aaaaaaaaaaaaaaaaaaaa.glb';
const B = 'cccccccccccccccccccc.glb';
const GONE = 'dddddddddddddddddddd.glb';
const IDA = `integrated:${A}`;
const IDB = `integrated:${B}`;
const IDGONE = `integrated:${GONE}`;

function seed() {
  return {
    [`integrated_v02/assets/${A}`]: GLB,
    [`integrated_v02/assets/${B}`]: GLB,
    'integrated_v02/user_assets.json': JSON.stringify([
      { id: 'user-a', name: 'seed-model.glb', filename: A, kind: 'model', bytes: GLB.length },
      { id: 'user-c', name: 'seed-other.glb', filename: B, kind: 'model', bytes: GLB.length },
      { id: 'user-d', name: 'seed-gone.glb', filename: GONE, kind: 'model', bytes: 1 },
    ]),
  };
}

let browser;
test.before(async () => { if (harness.haveThree()) browser = await harness.launchBrowser(); });
test.after(async () => { await browser?.close(); });

// 合成 GLB に VRM Humanoid が無い・対応表が無いなどで API が 400 を返すのは設計どおり（画面に文言を出す）。
const API_400 = [/status of 400/];
async function withApp(fn, { errors = API_400 } = {}) {
  const server = await harness.startServer({ port: PORT, seed: seed() });
  let page;
  try {
    page = await server.newPage(browser, { expectErrors: errors });
    await fn({ server, page });
    harness.assertNoErrors(page);
  } finally {
    await page?.context().close();
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

async function open13(page, server) {
  await page.goto(`${server.base}/workspace/13?tab=map`);
  await page.waitForSelector('[data-feature="retargetPanel"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-role="rt-source"] option').length >= 2, null, { timeout: 8000 });
}
const text = (page, role) => page.locator(`[data-role="${role}"]`).first().textContent();
/** ボタンを押して、欄の文言が「実行待ち」・途中の文言でなくなるまで待つ。 */
async function press(page, btn, out, pending) {
  await page.locator(`[data-role="${btn}"]`).click();
  await page.waitForFunction(([o, p]) => { const t = document.querySelector(`[data-role="${o}"]`)?.textContent || ''; return t !== '実行待ち' && t !== p && t !== ''; }, [out, pending || '実行待ち'], { timeout: 10000 });
  return text(page, out);
}

test('retarget panel shows every API response and saves the mapping', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    const hit = new Map();
    page.on('response', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/retarget/')) hit.set(`${r.request().method()} ${u.pathname}`, r.status()); });
    await open13(page, server);
    // 中央は three-host、右は既存タブ「ボーンマップ」（新しいタブは作らない）
    assert.equal(await page.locator('[data-feature="retargetViewport"] canvas').count(), 1);
    assert.deepEqual(await page.locator('.pane-right [role="tab"]').allTextContents().then((l) => l.slice(0, 1)), ['ボーンマップ']);
    await page.selectOption('[data-role="rt-source"]', IDA);
    await page.selectOption('[data-role="rt-target"]', IDB);

    // 骨格解析（表と JSON）
    let t = await press(page, 'rt-analyze', 'rt-result', '骨格を解析中…');
    assert.match(t, /"comparison"/);
    assert.ok(await page.locator('[data-role="rt-table"] tr').count() >= 3, '上位の項目の表が出る');
    assert.match(await press(page, 'rt-pose', 'rt-result', '基準方向の差を解析中…'), /calibration_proposal/);
    assert.match(await press(page, 'rt-calibrate', 'rt-result', '補正候補を算出中…'), /calibration_proposal/);
    t = await press(page, 'rt-motion', 'rt-result', '抽出中…');
    assert.match(t, /^共通アニメーションチャンネル（最大3件を表示）/);
    assert.match(t, /"channels"/);
    await press(page, 'rt-analyze', 'rt-result', '骨格を解析中…');
    await page.evaluate(() => document.querySelector('.pane-right .pane-body, .pane-right')?.scrollTo?.(0, 0));
    await shot(page, '01-scr13-bonemap.jpg');

    // プロファイル（保存は隔離データの retarget_profiles.json）
    await page.locator('summary', { hasText: 'モデル別補正プロファイル' }).click();
    await page.fill('[data-role="rt-profile-name"]', 'テスト組');
    await page.fill('[data-role="rt-profile-scale"]', '2.5');
    await page.fill('[data-role="rt-profile-yaw"]', '30');
    await page.locator('[data-role="rt-profile-save"]').click();
    await page.waitForFunction(() => /補正プロファイルを保存しました/.test(document.querySelector('[data-role="rt-result"]').textContent));
    const prof = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'retarget_profiles.json'), 'utf8'));
    const entry = Object.values(prof.profiles)[0];
    assert.equal(entry.name, 'テスト組'); assert.equal(entry.root_scale, 2.5); assert.equal(entry.yaw_offset_deg, 30);
    assert.equal(entry.source, IDA); assert.equal(entry.target, IDB);
    await page.fill('[data-role="rt-profile-name"]', '');
    await page.fill('[data-role="rt-profile-scale"]', '1');
    await page.locator('[data-role="rt-profile-load"]').click();
    await page.waitForFunction(() => /読み込みました/.test(document.querySelector('[data-role="rt-result"]').textContent));
    assert.equal(await page.inputValue('[data-role="rt-profile-name"]'), 'テスト組');
    assert.equal(await page.inputValue('[data-role="rt-profile-scale"]'), '2.5');
    await page.fill('[data-role="rt-profile-scale"]', '0');
    await page.locator('[data-role="rt-profile-save"]').click();
    await page.waitForFunction(() => /保存失敗: スケールまたは角度が不正です/.test(document.querySelector('[data-role="rt-result"]').textContent));
    await page.fill('[data-role="rt-profile-scale"]', '2');
    t = await press(page, 'rt-root-preview', 'rt-result', '試算中…');
    assert.match(t, /^移動座標の計算例（実モーションは未変更）/);
    assert.match(t, /"applied_to_model": false/);

    // ボーン対応表：候補 → 修正 → 保存 → 保存済みの読込 → プレビュー
    await page.locator('summary', { hasText: 'ボーン対応表' }).click();
    await page.locator('[data-role="rt-vrm-role-suggest"]').click();
    await page.waitForFunction(() => /Humanoid候補の取得失敗: .*VRM humanoid/.test(document.querySelector('[data-role="rt-vrm-role-status"]').textContent));
    await page.locator('[data-role="rt-mapping-suggest"]').click();
    await page.waitForSelector('[data-role="rt-mapping-rows"] select[data-source-bone="hips"]');
    assert.equal(await page.locator('[data-role="rt-mapping-rows"] select').count(), 10);
    assert.equal(await page.inputValue('select[data-source-bone="hips"]'), 'hips');
    assert.match(await text(page, 'rt-mapping-status'), /10件の元ボーン.*自動候補は未検証です/);
    await page.selectOption('select[data-source-bone="spine"]', 'hips'); // 重複
    await page.locator('[data-role="rt-mapping-save"]').click();
    await page.waitForFunction(() => /保存失敗: 同じ転写先ボーンの重複割り当て: hips/.test(document.querySelector('[data-role="rt-mapping-status"]').textContent));
    await page.selectOption('select[data-source-bone="spine"]', 'spine');
    await page.selectOption('select[data-source-bone="eye_l"]', '');
    await page.locator('[data-role="rt-mapping-save"]').click();
    await page.waitForFunction(() => /4組の対応表を保存しました/.test(document.querySelector('[data-role="rt-mapping-status"]').textContent));
    const saved = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'retarget_profiles.json'), 'utf8'));
    const e2 = Object.values(saved.profiles)[0];
    assert.equal(Object.keys(e2.mapping).length, 4);
    assert.equal(e2.mapping.hips, 'hips'); assert.equal(e2.root_scale, 2.5, '保存した他の項目は残る');
    await page.locator('[data-role="rt-mapping-suggest"]').click(); // 一度書き換える
    await page.selectOption('select[data-source-bone="head"]', '');
    await page.locator('[data-role="rt-mapping-saved"]').click();
    await page.waitForFunction(() => /保存済み対応表を読み込みました/.test(document.querySelector('[data-role="rt-mapping-status"]').textContent));
    assert.equal(await page.inputValue('select[data-source-bone="head"]'), 'head');
    assert.equal(await page.inputValue('select[data-source-bone="eye_l"]'), '');
    await page.fill('[data-role="rt-mapping-preview-input"]', '[{"bone":"hips","frame":0,"rotation_xyzw":[0,0,0,1]}]');
    t = await press(page, 'rt-mapping-preview-run', 'rt-mapping-preview-result', '実行中…');
    assert.match(t, /hips/);
    await page.fill('[data-role="rt-mapping-preview-input"]', '{}');
    t = await press(page, 'rt-mapping-preview-run', 'rt-mapping-preview-result', '実行中…');
    assert.match(t, /^プレビュー失敗: サンプルはJSON配列で入力してください/);

    // 基準姿勢の検査（読取のみ）。確認チェックが無いと計算されない
    await page.locator('summary', { hasText: '基準姿勢の検査' }).click();
    t = await press(page, 'rt-rest-preview-run', 'rt-rest-preview-result', '実行中…');
    assert.match(t, /^回転プレビュー失敗: .*(coordinate|座標)/i);
    await page.check('[data-role="rt-rest-confirm"]');
    t = await press(page, 'rt-rest-preview-run', 'rt-rest-preview-result', '実行中…');
    assert.doesNotMatch(t, /失敗/);
    assert.match(t, /"/);
    assert.match(await press(page, 'rt-rest-inspect', 'rt-rest-inspect-result', 'VRM基準姿勢を調査中…'), /^注意：ローカル回転は共通座標系の校正値ではありません/);
    assert.match(await press(page, 'rt-hierarchy', 'rt-hierarchy-result', '親階層を解析中…'), /^注意：ワールド基準回転は直接アニメーションへ適用できません/);
    assert.match(await press(page, 'rt-hier-clip', 'rt-hier-clip-result', '階層回転解析中…'), /^親ボーンのキーフレーム時刻が不一致の場合は未評価です/);
    await page.check('[data-role="rt-clip-agree"]');
    assert.match(await press(page, 'rt-clip-preview', 'rt-clip-result', 'GLB回転キーを解析中…'), /^注意：プレビューのみ・モデルは動きません/);
    await page.check('[data-role="rt-world-agree"]');
    assert.match(await press(page, 'rt-world-run', 'rt-world-result', '実行中…'), /^【注意】数値プレビューのみ/);

    // 仮転写（同意のチェックが無いと呼ばない）
    await page.locator('summary', { hasText: 'VRMローカル回転の仮転写' }).click();
    await page.locator('[data-role="rt-transfer-run"]').click();
    assert.match(await text(page, 'rt-transfer-result'), /^確認または解析エラー: 座標系の確認が必要です/);
    assert.equal(hit.has('POST /api/retarget/vrm-local-transfer-preview'), false, '同意なしでは API を呼ばない');
    await page.check('[data-role="rt-transfer-agree"]');
    t = await press(page, 'rt-transfer-run', 'rt-transfer-result', '解析中…');
    assert.match(t, /^品質ゲート: \S+（VMD出力不可）/);
    assert.match(t, /"vmd_written": false/);

    // 16 本の API がすべて画面から呼ばれた
    const expect = ['GET compare', 'GET calibration', 'GET pose-proposal', 'GET motion-channels', 'GET profile-for-pair', 'GET profiles', 'POST profiles', 'POST root-preview',
      'POST vrm-humanoid-preview', 'POST mapping-preview', 'POST explicit-rest-preview', 'POST rest-pose-inspection', 'POST rest-hierarchy-inspection',
      'POST glb-clip-hierarchy-inspection', 'POST glb-clip-rest-preview', 'POST world-rest-motion-preview', 'POST vrm-local-transfer-preview'];
    for (const e of expect) { const [m, n] = e.split(' '); assert.ok(hit.has(`${m} /api/retarget/${n}`), `${e} が呼ばれていません: ${[...hit.keys()].join(', ')}`); }
  });
});

test('retarget panel reports errors in Japanese and lists only available assets', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await open13(page, server);
    const opts = await page.locator('[data-role="rt-source"] option').allTextContents();
    assert.equal(opts.length, 2, 'ファイルなしの素材は選択欄に出ない');
    // 選び直して対応表の行を消す
    await page.selectOption('[data-role="rt-source"]', IDA);
    await page.selectOption('[data-role="rt-target"]', IDA);
    await page.locator('summary', { hasText: 'ボーン対応表' }).click();
    await page.locator('[data-role="rt-mapping-save"]').click();
    await page.waitForFunction(() => /保存失敗: 先に対応表を読み込んでください/.test(document.querySelector('[data-role="rt-mapping-status"]').textContent));
    await page.locator('[data-role="rt-mapping-suggest"]').click();
    await page.waitForSelector('select[data-source-bone="hips"]');
    await page.selectOption('[data-role="rt-target"]', IDB);
    assert.equal(await page.locator('select[data-source-bone]').count(), 0, '素材を選び直すと対応表の行を消す');
    assert.match(await text(page, 'rt-mapping-status'), /素材の選択が変わりました/);
    // 保存済みの対応表が無い組
    await page.locator('[data-role="rt-mapping-saved"]').click();
    await page.waitForFunction(() => /保存済みの対応表がありません/.test(document.querySelector('[data-role="rt-mapping-status"]').textContent));
    // 対応表なしのプレビューはサーバーの 400 を日本語の前置きで出す
    const t = await press(page, 'rt-mapping-preview-run', 'rt-mapping-preview-result', '実行中…');
    assert.match(t, /^プレビュー失敗: .*saved bone mapping required/);
  });
});

test('review bundle requires coordinate confirmation and downloads only verification JSON', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await open13(page, server);
    await page.selectOption('[data-role="rt-source"]', IDA);
    await page.selectOption('[data-role="rt-target"]', IDB);
    await page.locator('summary', { hasText: '転写タイムライン・QA・JSON保存' }).click();
    let calls = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/retarget/review-bundle') calls++; });
    await page.click('[data-role="rt-review-run"]');
    assert.match(await text(page, 'rt-review-result'), /^解析失敗: 座標系の確認が必要です/);
    assert.equal(calls, 0, '確認なしではAPIを呼ばない');
    assert.equal(await page.locator('[data-role="rt-review-save"]').isDisabled(), true);
    await page.check('[data-role="rt-review-agree"]');
    await page.click('[data-role="rt-review-run"]');
    await page.waitForFunction(() => /品質: .*\n対象フレーム:/.test(document.querySelector('[data-role="rt-review-result"]')?.textContent || ''), null, { timeout: 12000 });
    const output = await text(page, 'rt-review-result');
    assert.match(output, /対象ボーン: \d+/);
    assert.match(output, /回転キー候補: \d+/);
    assert.match(output, /診断警告: \d+/);
    assert.match(output, /VMD出力: 禁止（未校正）/);
    assert.equal(calls, 1);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-role="rt-review-save"]')]);
    assert.equal(download.suggestedFilename(), 'BAI_retarget_review_unverified.json');
    const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(saved.suitable_for_vmd_export, false);
    assert.equal(saved.animation_applied, false);
    await page.selectOption('[data-role="rt-target"]', IDA);
    assert.equal(await page.locator('[data-role="rt-review-save"]').isDisabled(), true);
    assert.equal(await page.locator('[data-role="rt-review-agree"]').isChecked(), false);
    assert.match(await text(page, 'rt-review-result'), /候補を再取得してください/);
    assert.ok(fs.readFileSync(path.join(server.dataDir, 'integrated_v02', 'assets', A)).equals(GLB));
  });
});

test('keyframe review rejects an oversized model before API or file retrieval', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await page.route('**/api/assets', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const target = body.items.find((item) => item.id === IDB);
      assert.equal(target.bytes, GLB.length, '素材一覧には実ファイル長が含まれる');
      target.bytes = 151 * 1024 * 1024;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const requests = [];
    page.on('request', (request) => {
      if (/\/api\/retarget\/keyframe-review|\/api\/integrated-v02\/asset\//.test(request.url())) requests.push(request.url());
    });
    await open13(page, server);
    await page.selectOption('[data-role="rt-source"]', IDA);
    await page.selectOption('[data-role="rt-target"]', IDB);
    await page.locator('summary', { hasText: 'キー候補・フレーム比較' }).click();
    await page.check('[data-role="rt-key-agree"]');
    await page.click('[data-role="rt-key-run"]');
    assert.match(await text(page, 'rt-key-status'), /150MB以下/);
    assert.equal(requests.length, 0);
  });
});

test('keyframe review places two models, scrubs unverified keys, and invalidates on target change', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await open13(page, server);
    await page.selectOption('[data-role="rt-source"]', IDA);
    await page.selectOption('[data-role="rt-target"]', IDB);
    await page.locator('summary', { hasText: 'キー候補・フレーム比較' }).click();
    const bodies = [];
    await page.route('**/api/retarget/keyframe-review', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        quality_gate: 'blocked_for_production', vmd_export_allowed: false,
        keys: [{ frame: 0, target_node: 1, rotation_xyzw: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
          { frame: 1, target_node: 1, rotation_xyzw: [0, 0, 0, 1] }],
      }) });
    });
    await page.click('[data-role="rt-key-run"]');
    assert.match(await text(page, 'rt-key-status'), /確認してください/);
    assert.equal(bodies.length, 0);
    await page.check('[data-role="rt-key-agree"]');
    await page.click('[data-role="rt-key-run"]');
    await page.waitForFunction(() => window.baiStudio.viewport.getState().keyReview?.applied === 1, null, { timeout: 15000 });
    assert.deepEqual(bodies[0], { source: IDA, target: IDB, fps: 30, coordinate_convention_confirmed: true });
    const state = await page.evaluate(() => window.baiStudio.viewport.getState().keyReview);
    assert.equal(state.objects, 2); assert.equal(state.frame, 0);
    near(state.centers[0].x, -1.1, 1e-6, '左 x'); near(state.centers[1].x, 1.1, 1e-6, '右 x');
    for (const c of state.centers) { near(c.minY, 0, 1e-6, '足 y'); near(c.height, 1.9, 1e-6, '高さ'); }
    assert.match(await text(page, 'rt-key-status'), /フレーム 0：候補 1 ボーン。未校正・プレビューのみ。VMD出力は禁止/);
    await page.click('[data-role="rt-key-step"]');
    assert.equal(await page.evaluate(() => window.baiStudio.viewport.getState().keyReview.frame), 1);
    await page.click('[data-role="rt-key-play"]');
    assert.equal(await page.locator('[data-role="rt-key-play"]').isDisabled(), true);
    await page.click('[data-role="rt-key-stop"]');
    assert.equal(await page.locator('[data-role="rt-key-play"]').isDisabled(), false);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-role="rt-key-save"]')]);
    assert.equal(download.suggestedFilename(), 'BAI_UNVERIFIED_keyframes.json');
    const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(saved.vmd_export_allowed, false);
    await page.selectOption('[data-role="rt-target"]', IDA);
    assert.equal(await page.locator('[data-role="rt-key-frame"]').isDisabled(), true);
    assert.equal(await page.locator('[data-role="rt-key-save"]').isDisabled(), true);
    assert.equal(await page.locator('[data-role="rt-key-agree"]').isChecked(), false);
    assert.equal(await page.evaluate(() => window.baiStudio.viewport.getState().keyReview), null);
    assert.ok(fs.readFileSync(path.join(server.dataDir, 'integrated_v02', 'assets', B)).equals(GLB));
  });
});

test('keyframe review rejects a production gate and an out-of-range node', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await open13(page, server);
    await page.selectOption('[data-role="rt-source"]', IDA);
    await page.selectOption('[data-role="rt-target"]', IDB);
    await page.locator('summary', { hasText: 'キー候補・フレーム比較' }).click();
    await page.check('[data-role="rt-key-agree"]');
    let data = { quality_gate: 'ready', vmd_export_allowed: true, keys: [] };
    await page.route('**/api/retarget/keyframe-review', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }));
    await page.click('[data-role="rt-key-run"]');
    await page.waitForFunction(() => /未校正品質ゲートが不正です/.test(document.querySelector('[data-role="rt-key-status"]')?.textContent || ''));
    assert.equal(await page.evaluate(() => window.baiStudio.viewport.getState().keyReview), undefined);
    data = { quality_gate: 'blocked_for_production', vmd_export_allowed: false,
      keys: [{ frame: 0, target_node: 9999, rotation_xyzw: [0, 0, 0, 1] }] };
    await page.click('[data-role="rt-key-run"]');
    await page.waitForFunction(() => /転写先ノードが存在しません/.test(document.querySelector('[data-role="rt-key-status"]')?.textContent || ''), null, { timeout: 15000 });
    assert.equal(await page.locator('[data-role="rt-key-frame"]').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.baiStudio.viewport.getState().keyReview), undefined);
  });
});

test('keyframe review discards a response after the selected target changes', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await open13(page, server);
    await page.selectOption('[data-role="rt-source"]', IDA);
    await page.selectOption('[data-role="rt-target"]', IDB);
    await page.locator('summary', { hasText: 'キー候補・フレーム比較' }).click();
    await page.check('[data-role="rt-key-agree"]');
    let release, signal;
    const requested = new Promise((resolve) => { signal = resolve; });
    await page.route('**/api/retarget/keyframe-review', async (route) => {
        signal();
        await new Promise((done) => { release = done; });
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          quality_gate: 'blocked_for_production', vmd_export_allowed: false,
          keys: [{ frame: 0, target_node: 1, rotation_xyzw: [0, 0, 0, 1] }],
        }) });
    });
    await page.click('[data-role="rt-key-run"]');
    await requested;
    await page.selectOption('[data-role="rt-target"]', IDA);
    release();
    await page.waitForTimeout(300);
    assert.match(await text(page, 'rt-key-status'), /素材が変更されました/);
    assert.equal(await page.evaluate(() => window.baiStudio.viewport.getState().keyReview), undefined);
    assert.equal(await page.locator('[data-role="rt-key-frame"]').isDisabled(), true);
  });
});

test('foot contact panel calls the three read-only diagnostic APIs', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await open13(page, server);
    await page.getByRole('tab', { name: '足IK' }).click();
    await page.waitForSelector('[data-feature="footContactPanel"]');
    const calls = new Map();
    let callCount = 0;
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (r.method() === 'POST' && u.pathname.startsWith('/api/qa/')) { callCount++; calls.set(u.pathname, r.postDataJSON()); }
    });
    assert.equal(await page.locator('[data-role="foot-apply"]').isDisabled(), true);
    assert.match(await page.locator('[data-role="foot-apply"]').locator('..').getAttribute('title'), /旧画面には無い設定/);
    await page.fill('[data-role="foot-ground"]', '1.25');
    assert.equal(await page.inputValue('[data-role="foot-ground"]'), '1.25', '数値欄はスライダーの範囲外を保つ');
    await page.click('[data-role="foot-run"]');
    await page.waitForFunction(() => /"root_offset_proposal"/.test(document.querySelector('[data-role="foot-result"]')?.textContent || ''));
    assert.equal(calls.get('/api/qa/foot-contact').ground_y, 1.25);
    assert.equal(calls.get('/api/qa/foot-contact').propose_root_offsets, true);

    await page.fill('[data-role="foot-ground"]', '0');
    const bvh = `HIERARCHY\nROOT Hips\n{\n OFFSET 0 0 0\n CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation\n JOINT LeftFoot\n {\n  OFFSET 0 -1 0\n  CHANNELS 3 Zrotation Xrotation Yrotation\n  End Site\n  {\n   OFFSET 0 -0.1 0\n  }\n }\n}\nMOTION\nFrames: 3\nFrame Time: 0.0333333\n0 1 0 0 0 0 0 0 0\n1 1 0 0 0 0 0 0 0\n2 1 0 0 0 0 0 0 0\n`;
    await page.locator('[data-role="foot-bvh-file"]').setInputFiles({ name: 'sample.bvh', mimeType: 'text/plain', buffer: Buffer.from(bvh) });
    await page.fill('[data-role="foot-bvh-stride"]', '2');
    await page.click('[data-role="foot-bvh-run"]');
    await page.waitForFunction(() => /"diagnosis"/.test(document.querySelector('[data-role="foot-bvh-result"]')?.textContent || ''));
    assert.equal(calls.get('/api/qa/bvh-foot-world').stride, 2);
    assert.equal(calls.get('/api/qa/bvh-foot-world').foot_bone, 'LeftFoot');
    assert.equal(calls.get('/api/qa/bvh-foot-world').diagnose, true);

    await page.locator('summary', { hasText: '両足の接地を同時に診断' }).click();
    await page.click('[data-role="foot-dual-run"]');
    await page.waitForFunction(() => /"/.test(document.querySelector('[data-role="foot-dual-result"]')?.textContent || ''));
    assert.equal(calls.get('/api/qa/dual-foot-preview').left_samples.length, 4);
    assert.equal(calls.get('/api/qa/dual-foot-preview').right_samples.length, 4);

    const count = callCount;
    await page.fill('[data-role="foot-bvh-stride"]', '1001');
    await page.click('[data-role="foot-bvh-run"]');
    assert.match(await text(page, 'foot-bvh-result'), /サンプル間隔は1〜1000/);
    assert.equal(callCount, count);
    await page.locator('[data-role="foot-bvh-file"]').setInputFiles({ name: 'too-large.bvh', mimeType: 'text/plain', buffer: Buffer.alloc(2000001, 65) });
    await page.click('[data-role="foot-bvh-run"]');
    assert.match(await text(page, 'foot-bvh-result'), /2MB以内のBVH/);
    assert.equal(callCount, count);
    await page.locator('summary', { hasText: 'サンプルの編集' }).click();
    await page.fill('[data-role="foot-samples"]', '{}');
    await page.click('[data-role="foot-run"]');
    await page.waitForFunction(() => /診断失敗: サンプルはJSON配列/.test(document.querySelector('[data-role="foot-result"]')?.textContent || ''));
    assert.equal(callCount, count);
    assert.ok(fs.readFileSync(path.join(server.dataDir, 'integrated_v02', 'assets', A)).equals(GLB));
  });
});

/** 仮転写の応答の形（samples は target_node と local_rotation_xyzw）。frame 0 に 3 件：適用 1・範囲外 1・不正な四元数 1、frame 1 に 1 件。 */
const REPORT = {
  samples: [
    { frame: 0, target_node: 1, local_rotation_xyzw: [0, 0, 1, 1] },
    { frame: 0, target_node: 99, local_rotation_xyzw: [0, 0, 0, 1] },
    { frame: 0, target_node: 2, local_rotation_xyzw: [0, 0, 0, 0] },
    { frame: 1, target_node: 3, local_rotation_xyzw: [0, 0, 0, 1] },
  ],
};
const cmp = (page) => page.evaluate(() => window.baiStudio.viewport.getState().compare);

test('pose compare places two models at x = -1.15 and +1.15 and applies the rotation to the right one', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await open13(page, server);
    await page.waitForFunction(() => document.querySelector('[data-role="rt-compare-model"] option[value^="integrated"]'), null, { timeout: 8000 });
    await page.waitForFunction(() => window.baiStudio.viewport.getState().renderer !== undefined && !!document.querySelector('[data-feature="retargetViewport"] canvas'));
    // 比較の前は何も置かない
    assert.equal(await cmp(page), undefined);
    // 取得ボタン：選んだ元・対象で仮転写 API を呼び、JSON を欄に入れる
    await page.selectOption('[data-role="rt-source"]', IDA);
    await page.selectOption('[data-role="rt-target"]', IDB);
    await page.locator('[data-role="rt-get-report"]').click();
    await page.waitForFunction(() => /数値候補を取得しました/.test(document.querySelector('[data-role="rt-compare-status"]').textContent));
    assert.equal(JSON.parse(await page.inputValue('[data-role="rt-report"]')).model_modified, false);
    // 手順の検査（旧と同じ順）
    const run = async () => { await page.locator('[data-role="rt-compare-run"]').click(); };
    const status = () => text(page, 'rt-compare-status');
    await page.fill('[data-role="rt-report"]', JSON.stringify(REPORT));
    await run();
    await page.waitForFunction(() => /比較失敗: 確認チェックを入れてください/.test(document.querySelector('[data-role="rt-compare-status"]').textContent));
    await page.check('[data-role="rt-compare-agree"]');
    await run();
    await page.waitForFunction(() => /比較失敗: モデルを選択してください/.test(document.querySelector('[data-role="rt-compare-status"]').textContent));
    await page.selectOption('[data-role="rt-compare-model"]', IDA);
    await page.fill('[data-role="rt-frame"]', '7');
    await run();
    await page.waitForFunction(() => /比較失敗: 指定フレームに転写候補がありません/.test(document.querySelector('[data-role="rt-compare-status"]').textContent));
    await page.fill('[data-role="rt-report"]', '{"x":1}');
    await page.fill('[data-role="rt-frame"]', '0');
    await run();
    await page.waitForFunction(() => /比較失敗: samples配列がありません/.test(document.querySelector('[data-role="rt-compare-status"]').textContent));
    await page.fill('[data-role="rt-report"]', JSON.stringify(REPORT));
    await run();
    await page.waitForFunction(() => window.baiStudio.viewport.getState().compare, null, { timeout: 15000 });
    const c = await cmp(page);
    assert.equal(c.objects, 2);
    assert.equal(c.frame, 0); assert.equal(c.applied, 1); assert.equal(c.skipped, 2);
    near(c.centers[0].x, -1.15, 1e-6, '左の x'); near(c.centers[1].x, 1.15, 1e-6, '右の x');
    for (const o of c.centers) { near(o.z, 0, 1e-6, 'z の中心'); near(o.minY, 0, 1e-6, '足は y=0'); }
    // 回転の適用は右だけ。四元数は正規化される（0,0,1,1 → 0,0,0.7071,0.7071）
    assert.deepEqual(Object.keys(c.rotated), ['1']);
    const q = c.rotated['1'];
    near(q[2], Math.SQRT1_2, 1e-9, 'qz'); near(q[3], Math.SQRT1_2, 1e-9, 'qw'); near(q[0], 0, 1e-9, 'qx');
    assert.match(await status(), /^左：変更前 \/ 右：仮補正後。フレーム 0、適用 1 ボーン、未適用 2。未校正・比較専用。/);
    assert.ok(await page.evaluate(() => window.baiStudio.viewport.countNonBackground()) > 0, '2体が描画されている');
    // 2体だけ（床とライトを除く）。モデルのファイルは変わらない
    const st = await page.evaluate(() => window.baiStudio.viewport.getState());
    assert.ok(st.bounds.min[0] < -1 && st.bounds.max[0] > 1);
    assert.ok(fs.readFileSync(path.join(server.dataDir, 'integrated_v02', 'assets', A)).equals(GLB));
    await shot(page, '02-scr13-pose-compare.jpg');
    // 画面を離れると three-host を破棄する
    await page.click('#nav a[data-route="08"]');
    await page.waitForSelector('[data-feature="assetLibrary"]');
    await page.waitForFunction(() => window.baiStudio.viewport.getState().loaded === false);
  });
});

test('pose compare shows the re-register message for a missing model file', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await page.goto(`${server.base}/workspace/13`);
    await page.waitForSelector('[data-feature="retargetViewport"]');
    await page.waitForFunction(() => window.baiStudio.assets.getState().status === 'ready');
    // ファイルなしの素材は選択欄に出ない（available=false）。一覧に出る素材でも、読込の失敗は文言になる
    assert.equal(await page.locator(`[data-role="rt-compare-model"] option[value="${IDGONE}"]`).count(), 0);
    await page.check('[data-role="rt-compare-agree"]');
    await page.fill('[data-role="rt-report"]', JSON.stringify(REPORT));
    await page.selectOption('[data-role="rt-compare-model"]', IDA);
    fs.unlinkSync(path.join(server.dataDir, 'integrated_v02', 'assets', A));
    await page.locator('[data-role="rt-compare-run"]').click();
    await page.waitForFunction(() => /比較失敗: 元ファイルが見つかりません。素材を再登録してください。/.test(document.querySelector('[data-role="rt-compare-status"]').textContent));
    assert.equal(await cmp(page), undefined);
  }, { errors: [/status of 404/] });
});
