'use strict';
// ⑧-1 手動IKポーズ補助の移植（P2 設計 §2.8(f) WP-08a）。実サーバー（隔離データ）と Chromium で、SCR-13「足IK」タブの操作から確かめる。
// ポート：P2_POSE_AI_PORT（既定 8781）。08b・08c（AI）のテストは、それぞれの WP でこのファイルに足す。
// 隔離：pose_ik_last.json は一時データの下に置く。実 data/ にも exports/ にも書かない。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.P2_POSE_AI_PORT || 8781);

/** pose_ik_ui.js:4 の template（フォークのテストが実コードと照合している）。 */
const TEMPLATE = {
  schema: 1, frame: 0,
  limbs: {
    leftArm: { base: [-0.2, 1.5], target: [-0.8, 1.14], upper: 0.42, lower: 0.4, bend: 1 },
    rightArm: { base: [0.2, 1.5], target: [0.8, 1.14], upper: 0.42, lower: 0.4, bend: -1 },
    leftLeg: { base: [-0.14, 1.0], target: [-0.2, 0.13], upper: 0.5, lower: 0.48, bend: 1 },
    rightLeg: { base: [0.14, 1.0], target: [0.25, 0.13], upper: 0.5, lower: 0.48, bend: -1 },
  },
};
const sx = (x) => 150 + x * 110;
const sy = (y) => 230 - y * 105;
const clone = (o) => JSON.parse(JSON.stringify(o));

let browser;
test.before(async () => { if (harness.haveThree()) browser = await harness.launchBrowser(); });
test.after(async () => { await browser?.close(); });

/** 意図して 400 を起こすテストだけ、その URL を許可する。 */
async function withApp(fn, { seed = {}, errors = [] } = {}) {
  const server = await harness.startServer({ port: PORT, seed });
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

/** solve の本文と、pose の GET・save の POST を順番に記録する。 */
function record(page) {
  const log = { solve: [], save: [], seq: [] };
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/api/pose/solve' && r.method() === 'POST') { log.solve.push(r.postDataJSON()); log.seq.push('solve'); }
    if (u.pathname === '/api/pose/save' && r.method() === 'POST') { log.save.push(r.postDataJSON()); log.seq.push('save'); }
    if (u.pathname === '/api/pose/last' && r.method() === 'GET') log.seq.push('last');
  });
  return log;
}
const state = (page) => page.evaluate(() => window.baiStudio.poseIk.getState());
const idle = (page) => page.waitForFunction(() => { const s = window.baiStudio.poseIk.getState(); return s && s.loaded && !s.busy && !s.queued; }, null, { timeout: 8000 });
const statusText = (page) => page.locator('[data-role="pose-ik-status"]').textContent();

/** タブを開く。log を先に作りたいテストのため、goto の前に record できるよう page を受け取る。 */
async function open(page, server) {
  await page.goto(`${server.base}/workspace/13?tab=ik`);
  await page.waitForSelector('[data-feature="ikTab"] [data-role="pose-ik-svg"]');
  await idle(page);
}
/** viewBox 座標をクライアント座標へ。 */
async function clientOf(page, vx, vy) {
  await page.locator('[data-role="pose-ik-svg"]').scrollIntoViewIfNeeded();
  const box = await page.locator('[data-role="pose-ik-svg"]').boundingBox();
  return { x: box.x + vx / 300 * box.width, y: box.y + vy / 260 * box.height };
}
async function handleCenter(page, limb) {
  await page.locator('[data-role="pose-ik-svg"]').scrollIntoViewIfNeeded();
  const h = await page.locator(`[data-role="pose-ik-svg"] [data-limb="${limb}"]`).boundingBox();
  return { x: h.x + h.width / 2, y: h.y + h.height / 2 };
}
async function dragTo(page, limb, vx, vy, steps = 6) {
  const from = await handleCenter(page, limb);
  const to = await clientOf(page, vx, vy);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}
const readFile = (server) => JSON.parse(fs.readFileSync(path.join(server.dataDir, 'pose_ik_last.json'), 'utf8'));
const post = (server, route, body) => fetch(`${server.base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('pose ik panel solves the legacy template on first open', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    const log = record(page);
    await open(page, server);
    assert.equal(await page.locator('[data-feature="ikTab"] [data-feature="footContactPanel"]').count(), 1, '足IK・接地はそのまま先頭にある');
    assert.equal(await page.locator('[data-feature="ikTab"] [data-role="pose-ik-svg"]').count(), 1);
    assert.deepEqual(log.solve[0], TEMPLATE);
    assert.equal(await statusText(page), 'IK計算済み（元モーション未変更）');
    assert.equal(await page.locator('[data-role="pose-ik-svg"] [data-limb]').count(), 4);
    assert.equal(await page.locator('[data-role="pose-ik-svg"] [data-limb].is-active').count(), 1);
    assert.equal(await page.locator('[data-role="pose-ik-svg"] [data-limb].is-active').getAttribute('data-limb'), 'rightArm');
    assert.equal(await page.inputValue('[data-role="pose-ik-bone"]'), 'rightArm');
    assert.equal(await page.locator('[data-role="pose-ik-save"]').isEnabled(), true);
    assert.equal(await page.locator('[data-role="pose-ik-conflict"]').isHidden(), true);
    // 縦横比を viewBox（300:260）に合わせている（O-⑧-3）
    const box = await page.locator('[data-role="pose-ik-svg"]').boundingBox();
    assert.ok(Math.abs(box.width / box.height - 300 / 260) < 0.01, `縦横比 ${box.width}/${box.height}`);
    // 部位を変えると、再計算せずに強調だけが移る
    const before = log.solve.length;
    await page.selectOption('[data-role="pose-ik-bone"]', 'leftLeg');
    assert.equal(await page.locator('[data-role="pose-ik-svg"] [data-limb].is-active').getAttribute('data-limb'), 'leftLeg');
    assert.equal(log.solve.length, before);
    assert.equal(fs.existsSync(path.join(server.dataDir, 'pose_ik_last.json')), false, '開いただけでは保存しない');
  });
});

test('saved pose is loaded', harness.skip3d(), async () => {
  const saved = clone(TEMPLATE);
  saved.limbs.rightArm.target = [0.9, 1.3];
  await withApp(async ({ server, page }) => {
    const log = record(page);
    await open(page, server);
    assert.deepEqual(log.solve[0], saved);
    assert.deepEqual((await state(page)).data, saved);
  }, { seed: { 'pose_ik_last.json': JSON.stringify(saved) } });
});

test('drag outside reach shows the corrected target', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    const log = record(page);
    await open(page, server);
    await dragTo(page, 'rightArm', 295, 20);
    await idle(page);
    assert.deepEqual(log.solve.at(-1).limbs.rightArm.target, [1.32, 2]);
    assert.equal(await statusText(page), '目標が届かないため、到達可能な位置に補正しました');
    const dashed = page.locator('[data-role="pose-ik-svg"] circle[stroke-dasharray="4 3"]');
    assert.equal(await dashed.count(), 1);
    const handle = page.locator('[data-role="pose-ik-svg"] [data-limb="rightArm"]');
    const cx = Number(await handle.getAttribute('cx')), cy = Number(await handle.getAttribute('cy'));
    assert.ok(Math.abs(cx - sx(1.32)) <= 0.01 && Math.abs(cy - sy(2)) <= 0.01, `丸の位置 (${cx}, ${cy})`);
    assert.equal(fs.existsSync(path.join(server.dataDir, 'pose_ik_last.json')), false, 'ドラッグしただけでは保存しない');
  });
});

test('moves during a solve are coalesced', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await open(page, server);
    const log = record(page);
    await page.route('**/api/pose/solve', async (route) => {
      const res = await route.fetch();
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({ response: res });
    });
    const from = await handleCenter(page, 'rightArm');
    const a = await clientOf(page, 220, 90), b = await clientOf(page, 230, 80), c = await clientOf(page, 240, 70);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(a.x, a.y);
    await page.mouse.move(b.x, b.y);
    await page.mouse.move(c.x, c.y);
    await page.mouse.up();
    await idle(page);
    assert.equal(log.solve.length, 2, '最初の1回と、最後の位置の1回');
    const want = [Math.round((240 - 150) / 110 * 100) / 100, Math.round((230 - 70) / 105 * 100) / 100];
    assert.deepEqual(log.solve[1].limbs.rightArm.target, want);
    const s = await state(page);
    assert.equal(s.busy, false);
    assert.equal(s.queued, false);
    assert.deepEqual(s.data.limbs.rightArm.target, want, '保存される値と表示が一致する');
  });
});

test('save clamps frame and checks the latest file first', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await open(page, server);
    const log = record(page);
    await page.selectOption('[data-role="pose-ik-bone"]', 'leftLeg');
    await page.fill('[data-role="pose-ik-frame"]', '12.7');
    await page.locator('[data-role="pose-ik-frame"]').blur();
    assert.equal(await page.inputValue('[data-role="pose-ik-frame"]'), '13');
    await page.click('[data-role="pose-ik-save"]');
    await page.waitForFunction(() => /補正設定を保存しました/.test(document.querySelector('[data-role="pose-ik-status"]').textContent));
    assert.deepEqual(log.seq, ['last', 'save'], '保存の前に最新を1回読む');
    assert.equal(log.save[0].frame, 13);
    assert.deepEqual(readFile(server), log.save[0]);
    assert.equal(await statusText(page), '補正設定を保存しました。元素材は変更していません。');
    await page.fill('[data-role="pose-ik-frame"]', '2000000');
    await page.locator('[data-role="pose-ik-frame"]').blur();
    assert.equal(await page.inputValue('[data-role="pose-ik-frame"]'), '1000000');
    await page.click('[data-role="pose-ik-save"]');
    await page.waitForFunction(() => window.baiStudio.poseIk.getState().synced.includes('1000000'));
    assert.equal(readFile(server).frame, 1000000);
  });
});

test('external change stops the save', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await open(page, server);
    const log = record(page);
    const external = clone(TEMPLATE);
    external.frame = 41;
    assert.equal((await post(server, '/api/pose/save', external)).status, 200);
    await page.click('[data-role="pose-ik-save"]');
    await page.waitForSelector('[data-role="pose-ik-conflict"]:not([hidden])');
    assert.equal(log.save.length, 0, '競合のときは POST しない');
    assert.equal(await statusText(page), '外部（旧画面・MCP）でIK設定が変わっています。どちらかを選んでください。');
    await page.click('[data-role="pose-ik-reload"]');
    await page.waitForSelector('[data-role="pose-ik-conflict"][hidden]', { state: 'attached' });
    await idle(page);
    assert.deepEqual(log.solve.at(-1), external, '次の計算はテストが書いた内容');
    // もう一度書き換えられても、「上書き」は画面の内容でファイルを置き換える
    const again = clone(TEMPLATE);
    again.frame = 77;
    await post(server, '/api/pose/save', again);
    await page.click('[data-role="pose-ik-save"]');
    await page.waitForSelector('[data-role="pose-ik-conflict"]:not([hidden])');
    await page.click('[data-role="pose-ik-overwrite"]');
    await page.waitForFunction(() => window.baiStudio.poseIk.getState().conflict === false && /保存しました/.test(document.querySelector('[data-role="pose-ik-status"]').textContent));
    assert.deepEqual(readFile(server), external, '画面の内容（41 フレーム）になる');
    assert.equal(log.save.length, 1);
  });
});

test('reset and solve error', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await open(page, server);
    const log = record(page);
    await dragTo(page, 'rightArm', 200, 60);
    await idle(page);
    assert.notDeepEqual(log.solve.at(-1), TEMPLATE);
    await page.click('[data-role="pose-ik-reset"]');
    await idle(page);
    assert.deepEqual(log.solve.at(-1), TEMPLATE, '初期姿勢に戻る');
    assert.equal(log.save.length, 0, '初期姿勢は保存しない');
    assert.equal(fs.existsSync(path.join(server.dataDir, 'pose_ik_last.json')), false);

    await page.route('**/api/pose/solve', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid lengths or bend"}' }));
    await page.click('[data-role="pose-ik-reset"]');
    await page.waitForFunction(() => /IK計算失敗/.test(document.querySelector('[data-role="pose-ik-status"]').textContent));
    assert.equal(await statusText(page), 'IK計算失敗：invalid lengths or bend');
    // 画面は止まらず、直ったら続けられる
    await page.unroute('**/api/pose/solve');
    await dragTo(page, 'leftArm', 60, 90);
    await idle(page);
    assert.match(await statusText(page), /IK計算済み|目標が届かない/);
  }, { errors: [/status of 400/] });
});

test('unsaved pose survives screen changes', harness.skip3d(), async () => {
  const saved = clone(TEMPLATE);
  saved.limbs.rightArm.target = [0.9, 1.3];
  await withApp(async ({ server, page }) => {
    const log = record(page);
    await open(page, server);
    await dragTo(page, 'rightArm', 200, 60);
    await idle(page);
    const dragged = (await state(page)).data;
    assert.notDeepEqual(dragged, saved);
    // 別の画面へ移ると節は無くなる
    await page.evaluate(() => window.baiStudio.navigate('08'));
    await page.waitForFunction(() => window.baiStudio.poseIk.getState() === null);
    assert.equal(await page.locator('[data-role="pose-ik-svg"]').count(), 0);
    const lastReads = () => log.seq.filter((s) => s === 'last').length;
    const before = lastReads();
    await page.evaluate(() => window.baiStudio.navigate('13', { tab: 'ik' }));
    await page.waitForSelector('[data-role="pose-ik-svg"]');
    await idle(page);
    assert.deepEqual((await state(page)).data, dragged, '移る前と同じ');
    assert.equal(lastReads(), before, '戻ったときは GET /api/pose/last を呼ばない');
    // ページを再読込すると、保存済みの内容に戻る
    await page.reload();
    await page.waitForSelector('[data-role="pose-ik-svg"]');
    await idle(page);
    assert.deepEqual((await state(page)).data, saved);
  }, { seed: { 'pose_ik_last.json': JSON.stringify(saved) } });
});

// ---- ⑧-2 AI管理（P2 設計 §2.8(f) WP-08b）。実サーバーは bai_ai_config.json を enabled:false にして Ollama に触れない ----
const AI_OFF = JSON.stringify({ enabled: false, default_llm: 'qwen3:8b' });
const CONNECTED = { available: true, state: 'connected', models: [{ name: 'qwen3.5:9b', size: 1 }], manual_available: true };
const aiStatusText = (page) => page.locator('[data-role="ai-status"]').textContent();
async function openAi(page, server) {
  await page.goto(`${server.base}/workspace/19`);
  await page.waitForSelector('[data-feature="aiManager"] [data-role="ai-status"]');
  await page.waitForFunction(() => document.querySelector('[data-role="ai-status"]').textContent !== '接続確認中…');
}

test('ai manager reads settings and status', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await openAi(page, server);
    assert.equal(await page.locator('[data-role="ai-enabled"]').isChecked(), false);
    assert.equal(await page.inputValue('[data-role="ai-model"]'), 'qwen3:8b');
    assert.equal(await aiStatusText(page), 'AI未接続：通常制作は使用できます');
    assert.equal(await page.locator('[data-role="ai-check"]').isEnabled(), true);
  }, { seed: { 'bai_ai_config.json': AI_OFF } });
});

test('ai settings save only the two legacy fields', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    const bodies = [];
    let saved = false; // 既存の「AI接続状態」カードも status を読むので、回数ではなく保存の後かどうかで切り替える
    await page.route('**/api/ai/status', (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(saved ? CONNECTED : { available: false, state: 'disabled', models: [], manual_available: true }) });
    });
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/ai/settings' && r.method() === 'POST') { bodies.push(r.postDataJSON()); saved = true; } });
    await openAi(page, server);
    await page.check('[data-role="ai-enabled"]');
    await page.fill('[data-role="ai-model"]', ' qwen3.5:9b ');
    await page.click('[data-role="ai-save"]');
    await page.waitForFunction(() => document.querySelector('[data-role="ai-status"]').textContent === '接続済み — qwen3.5:9b');
    assert.deepEqual(bodies, [{ enabled: true, default_llm: 'qwen3.5:9b' }]);
    assert.equal(await page.locator('[data-role="ai-settings-result"]').textContent(), '設定を保存しました');
    const cfg = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'bai_ai_config.json'), 'utf8'));
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.default_llm, 'qwen3.5:9b');
    const defaults = JSON.parse(require('node:child_process').execFileSync('python3', ['-c', 'import json,bai_ai_manager as m;print(json.dumps(m.DEFAULTS))'], { cwd: path.join(__dirname, '..') }).toString());
    for (const [k, v] of Object.entries(defaults)) if (k !== 'enabled' && k !== 'default_llm') assert.deepEqual(cfg[k], v, `${k} は既定値のまま`);
  }, { seed: { 'bai_ai_config.json': AI_OFF } });
});

test('ai manager errors and busy state', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await openAi(page, server);
    await page.route('**/api/ai/settings', (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"unknown settings"}' })
      : route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }));
    await page.click('[data-role="ai-save"]');
    await page.waitForFunction(() => /保存失敗/.test(document.querySelector('[data-role="ai-settings-result"]').textContent));
    assert.equal(await page.locator('[data-role="ai-settings-result"]').textContent(), '保存失敗: unknown settings');
    await page.click('[data-role="ai-check"]');
    await page.waitForFunction(() => /取得に失敗/.test(document.querySelector('[data-role="ai-status"]').textContent));
    assert.equal(await aiStatusText(page), 'AI設定の取得に失敗しました。通常制作には影響しません。');
    assert.equal(await page.inputValue('[data-role="ai-model"]'), 'qwen3:8b', '失敗ではモデル名を変えない');
    await page.unroute('**/api/ai/settings');
    // 通信中はボタンが無効。遅らせている間に画面を移ってもエラーにならない
    await page.route('**/api/ai/status', async (route) => { await new Promise((r) => setTimeout(r, 1000)); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CONNECTED) }); });
    await page.click('[data-role="ai-check"]');
    assert.equal(await page.locator('[data-role="ai-check"]').isDisabled(), true);
    assert.equal(await page.locator('[data-role="ai-save"]').isDisabled(), true);
    await page.evaluate(() => window.baiStudio.navigate('08'));
    await page.waitForTimeout(1300);
    assert.equal(await page.locator('[data-role="ai-status"]').count(), 0);
  }, { seed: { 'bai_ai_config.json': AI_OFF }, errors: [/status of 400/, /status of 500/] });
});

// ---- ⑧-3 AIでポーズ案を作る（P2 設計 §2.8(f) WP-08c）。成功の応答は page.route のスタブ（実際の Qwen の推論は未検証） ----
const AI_DISABLED = JSON.stringify({ enabled: false });
const SAVED_POSE = (() => { const p = clone(TEMPLATE); p.limbs.rightArm.target = [0.9, 1.3]; return p; })();
const aiSeed = { 'bai_ai_config.json': AI_DISABLED, 'pose_ik_last.json': JSON.stringify(SAVED_POSE) };
const aiResult = (page) => page.locator('[data-role="ai-result"]').textContent();
const aiBusyDone = (page) => page.waitForFunction(() => !document.querySelector('[data-role="ai-run"]').disabled);
function recordAi(page) {
  const log = { preview: [], proposal: [], seq: [] };
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (r.method() !== 'POST') return;
    if (u.pathname === '/api/ai/ik-preview') log.preview.push(r.postDataJSON());
    if (u.pathname === '/api/ai/pose-proposal') log.proposal.push(r.postDataJSON());
    if (u.pathname === '/api/pose/save') log.seq.push('save');
  });
  return log;
}
async function openAiPanel(page, server) {
  await open(page, server);
  await page.locator('[data-feature="aiPosePanel"] summary').scrollIntoViewIfNeeded();
  await page.click('[data-feature="aiPosePanel"] summary');
}
/** baseline の rightArm.target の y に 0.15 を足した pose_input と、その実サーバーの solve 応答を持つ成功の応答。 */
async function stubbedPreview(server, baseline, accepted) {
  const poseInput = clone(baseline);
  poseInput.limbs.rightArm.target = [poseInput.limbs.rightArm.target[0], Math.round((poseInput.limbs.rightArm.target[1] + 0.15) * 100) / 100];
  const solved = await (await post(server, '/api/pose/solve', poseInput)).json();
  return { poseInput, body: { ok: true, accepted, ignored: [], pose_input: poseInput, solved, limitations: ['2D'], preview_only: true, saved: false, applied: false } };
}

test('ai preview failure keeps manual editing', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    const log = recordAi(page);
    await openAiPanel(page, server);
    await page.fill('[data-role="ai-instruction"]', '右手を上げて');
    await page.click('[data-role="ai-preview"]');
    await page.waitForFunction(() => /プレビュー失敗/.test(document.querySelector('[data-role="ai-result"]').textContent));
    assert.deepEqual(log.preview[0], { text: '右手を上げて', baseline: SAVED_POSE }, '基準は画面上の値（種データと同じ）');
    assert.equal(await aiResult(page), 'プレビュー失敗: AI disabled. Manual controls remain available. — 手動編集は継続できます');
    assert.equal(await page.locator('[data-role="ai-preview-apply"]').isDisabled(), true);
    // 空の指示は AI を呼ぶ前の検査で 400
    await page.fill('[data-role="ai-instruction"]', '');
    await page.click('[data-role="ai-run"]');
    await page.waitForFunction(() => /推論できませんでした/.test(document.querySelector('[data-role="ai-result"]').textContent));
    assert.equal(await aiResult(page), '推論できませんでした: pose instruction must contain 1-1500 characters — 通常制作は継続できます');
    // 手動編集は止まらない
    await dragTo(page, 'leftArm', 60, 90);
    await idle(page);
    assert.match(await statusText(page), /IK計算済み|目標が届かない/);
  }, { seed: aiSeed, errors: [/status of 503/, /status of 400/] });
});

test('ai preview uses the on-screen pose as baseline', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    const log = recordAi(page);
    await openAiPanel(page, server);
    await dragTo(page, 'rightArm', 200, 60);
    await idle(page);
    const dragged = (await state(page)).data;
    assert.notDeepEqual(dragged, SAVED_POSE);
    await page.fill('[data-role="ai-instruction"]', '右手を上げて');
    await page.click('[data-role="ai-preview"]');
    await page.waitForFunction(() => /プレビュー失敗/.test(document.querySelector('[data-role="ai-result"]').textContent));
    assert.deepEqual(log.preview[0].baseline, dragged, 'ドラッグ後の値（ファイルの値ではない）');
  }, { seed: aiSeed, errors: [/status of 503/] });
});

test('ai pose preview loads into the ik helper without saving', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    const log = recordAi(page);
    const solveLog = record(page);
    await openAiPanel(page, server);
    const accepted = [{ limb: 'rightArm', action: 'up', delta: [0, 0.15] }];
    const { poseInput, body } = await stubbedPreview(server, SAVED_POSE, accepted);
    let mode = 'ok';
    await page.route('**/api/ai/ik-preview', (route) => mode === 'ok'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      : mode === 'empty'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...body, accepted: [] }) })
        : route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"state":"offline","manual_available":true,"error":"Ollama unavailable; manual editing is still available"}' }));
    await page.fill('[data-role="ai-instruction"]', '右手を上げて');
    await page.click('[data-role="ai-preview"]');
    await page.waitForFunction(() => !document.querySelector('[data-role="ai-preview-apply"]').disabled);
    assert.deepEqual(JSON.parse(await aiResult(page)), body);
    const before = solveLog.solve.length;
    await page.click('[data-role="ai-preview-apply"]');
    await page.waitForFunction(() => /未保存の提案を表示しました/.test(document.querySelector('[data-role="pose-ik-status"]').textContent));
    await idle(page);
    assert.equal(solveLog.solve.length, before + 1);
    assert.deepEqual(solveLog.solve.at(-1), poseInput, '次の solve の本文は pose_input');
    assert.equal(await statusText(page), 'IK補助画面へ未保存の提案を表示しました。保存する場合は手動IK側で「設定を保存」を押してください。');
    assert.equal(await aiResult(page), await statusText(page));
    assert.equal(solveLog.save.length, 0, '保存の要求は0回');
    assert.deepEqual(readFile(server), SAVED_POSE, 'pose_ik_last.json は種データのまま');
    // accepted が空なら押せないまま
    mode = 'empty';
    await page.click('[data-role="ai-preview"]');
    await page.waitForFunction(() => /"accepted": \[\]/.test(document.querySelector('[data-role="ai-result"]').textContent));
    assert.equal(await page.locator('[data-role="ai-preview-apply"]').isDisabled(), true);
    // 成功の後に 503 になると無効に戻る
    mode = 'ok';
    await page.click('[data-role="ai-preview"]');
    await page.waitForFunction(() => !document.querySelector('[data-role="ai-preview-apply"]').disabled);
    mode = 'fail';
    await page.click('[data-role="ai-preview"]');
    await page.waitForFunction(() => /プレビュー失敗/.test(document.querySelector('[data-role="ai-result"]').textContent));
    assert.equal(await page.locator('[data-role="ai-preview-apply"]').isDisabled(), true);
    assert.equal(log.seq.length, 0);
  }, { seed: aiSeed, errors: [/status of 503/] });
});

test('ai proposal json is shown', harness.skip3d(), async () => {
  await withApp(async ({ server, page }) => {
    await openAiPanel(page, server);
    const proposal = { ok: true, proposal: { constraints: [], preview_only: true }, applied: false, note: 'AI提案のみ。IK実行・キーフレーム保存は行いません。' };
    let release;
    const gate = new Promise((r) => { release = r; });
    await page.route('**/api/ai/pose-proposal', async (route) => { await gate; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(proposal) }); });
    await page.fill('[data-role="ai-instruction"]', '右手を上げて');
    await page.click('[data-role="ai-run"]');
    await page.waitForFunction(() => document.querySelector('[data-role="ai-run"]').disabled);
    assert.equal(await aiResult(page), 'Qwenで指示を解析しています…');
    assert.equal(await page.locator('[data-role="ai-preview"]').isDisabled(), true, '通信中は3つとも無効');
    assert.equal(await page.locator('[data-role="ai-preview-apply"]').isDisabled(), true);
    release();
    await aiBusyDone(page);
    assert.equal(await aiResult(page), JSON.stringify(proposal, null, 2));
    // 設定への導線
    await page.click('[data-role="ai-open-settings"]');
    await page.waitForSelector('[data-feature="aiManager"]');
    assert.match(page.url(), /\/workspace\/19/);
  }, { seed: aiSeed });
});
