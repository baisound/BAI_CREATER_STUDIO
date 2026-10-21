'use strict';
// ② プロジェクトの保存と読込（P2 設計 §2.2(g)、WP-01）。実サーバー（隔離データ）と Chromium で、画面の操作から確かめる。
// ポート：P2_PROJECT_PORT（既定 8797）。テストごとに新しいサーバー・種データで始める。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.P2_PROJECT_PORT || 8797);
const SHOTS = process.env.P2_PROJECT_SHOTS || '';

const NOW = '2026-10-20T05:00:00.000Z';
const entry = (label, names) => ({ label, at: NOW, timeline: names.map((name) => ({ name })), selected: 1, playbackSpeed: 1 });
const COMB = {
  schema: 1, title: '歌ってみた', timeline: [{ name: 'a' }, { name: 'b' }], selected: 2, playbackSpeed: 1.5, updatedAt: NOW, cursor: 2,
  history: [entry('初期', []), entry('1件', ['a']), entry('2件', ['a', 'b'])],
};
const CAMERA = { schema: 1, fps: 30, duration: 300, keys: [
  { frame: 0, position: [0, 1.6, 5], target: [0, 1, 0], fov: 40, interpolation: 'linear' },
  { frame: 90, position: [4, 2, 3], target: [0, 1, 0], fov: 35, interpolation: 'linear' },
] };
const WORKSPACE = { frame: 0, asset: '', clip: null };
const seedAll = () => ({
  'project_state.json': JSON.stringify(COMB, null, 2),
  'camera_project.json': JSON.stringify(CAMERA, null, 2),
  'project_state.workspace.json': JSON.stringify(WORKSPACE, null, 2),
});

let browser;
test.before(async () => { browser = await harness.launchBrowser(); });
test.after(async () => { await browser?.close(); });

/** サーバーを起動して page を渡し、終わったら必ず止める。 */
async function withApp(seed, fn, { errors = [] } = {}) {
  const server = await harness.startServer({ port: PORT, seed });
  const context = { server, page: null };
  try {
    context.page = await server.newPage(browser, { expectErrors: errors });
    await fn(context);
    harness.assertNoErrors(context.page);
  } finally {
    await context.page?.context().close();
    await server.stop();
  }
}
const readJson = (server, name) => JSON.parse(fs.readFileSync(path.join(server.dataDir, name), 'utf8'));
const readRaw = (server, name) => fs.readFileSync(path.join(server.dataDir, name));
const exists = (server, name) => fs.existsSync(path.join(server.dataDir, name));
const backups = (server) => fs.readdirSync(server.dataDir).filter((f) => /^camera_project\.invalid-.*\.json$/.test(f));
const api = async (server, route, init) => { const r = await fetch(server.base + route, init); return { status: r.status, json: await r.json().catch(() => null) }; };
const postProject = (server, obj, headers = {}) => api(server, '/api/project', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(obj) });
const EXTERNAL = (n) => ({ ...COMB, title: '外部の保存', timeline: Array.from({ length: n }, (_, i) => ({ name: `ext${i}` })), cursor: 2 });

async function open(page, server, screen = '18') {
  await page.goto(`${server.base}/workspace/${screen}`);
}
async function loaded(page) {
  // Evidence の全画面試験と続けて実行すると、Windows Chrome の初回描画が8秒を
  // 超えることがある。表示を確認する条件は維持し、負荷時の待機上限だけ広げる。
  await page.waitForSelector('[data-feature="projectSummary"] dl', { timeout: 15000 });
}
/** 最初の同期 tick が終わるのを待つ（その前後で外部変更の見え方が変わるため、競合のテストは終わってから始める）。 */
async function firstTick(page) {
  await page.waitForFunction(() => window.baiStudio.project.getState().syncRevision !== null, null, { timeout: 8000 });
}
const statusText = (page) => page.textContent('[data-feature="projectStatus"]:not(.compact)');
async function waitStatus(page, re, timeout = 8000) {
  await page.waitForFunction(({ src }) => {
    const el = document.querySelector('[data-feature="projectStatus"]:not(.compact)');
    return !!el && new RegExp(src).test(el.textContent || '');
  }, { src: re.source }, { timeout });
}
/** 同期を止める（外部変更の検知を邪魔させない）。 */
const freezeSync = (page) => page.route('**/api/sync', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"revision":0,"commandId":0,"command":null}' }));
const clickBoth = (page, a, b) => page.evaluate(([x, y]) => { /** @type {HTMLElement} */ (document.querySelector(x)).click(); /** @type {HTMLElement} */ (document.querySelector(y)).click(); }, [a, b]);
const UNDO = '[data-role="undo"]';
const SAVE = '[data-role="project-save"]';

test('SCR-18 shows the real production state', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await open(page, server);
    await loaded(page);
    const text = await page.textContent('[data-feature="projectSummary"]');
    assert.match(text, /歌ってみた/);
    assert.match(text, /2件・履歴3件（3番目）/);
    assert.match(text, /2キー・300F・30fps/);
    assert.match(text, /なし・クリップなし・F 0/);
    assert.match(text, /保存済み/);
    const bundle = await api(server, '/api/project/bundle');
    assert.equal(await page.textContent('[data-key="revision"]'), bundle.json.revision.slice(0, 12));
    assert.equal(await page.getAttribute('[data-key="revision"]', 'title'), bundle.json.revision);
    // カードの見出しに「実機能」バッジ。左の一覧は実データの1件。
    const badge = page.locator('.card:has([data-feature="projectSummary"]) .pane-head .badge-real');
    assert.equal(await badge.count(), 1);
    assert.equal(await page.locator('.card:has([data-feature="projectSummary"])[data-dim]').count(), 0);
    assert.match(await page.textContent('[data-feature="projectList"]'), /現在の制作状態/);
    assert.match(await statusText(page), /保存済み/);
    // 履歴：新しい順の一覧と現在の印
    const rows = page.locator('[data-feature="projectHistory"] li[role="option"]');
    assert.equal(await rows.count(), 3);
    assert.match(await rows.nth(0).textContent(), /3\. .* 2件.*現在/);
    assert.match(await rows.nth(1).textContent(), /2\. .* 1件/);
    assert.match(await rows.nth(2).textContent(), /1\. .* 初期/);
    assert.equal(await page.locator('[data-feature="projectHistory"] ' + UNDO).isDisabled(), false);
    assert.equal(await page.locator('[data-feature="projectHistory"] [data-role="redo"]').isDisabled(), true);
    assert.equal(await page.locator(SAVE).isDisabled(), true, 'nothing to save yet');
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.setViewportSize({ width: 1600, height: 900 }); await page.screenshot({ path: path.join(SHOTS, 'scr18-loaded.jpg'), type: 'jpeg', quality: 70 }); }
  });
});

test('history displays newest first and restores the original oldest entry', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await freezeSync(page);
    await open(page, server);
    await loaded(page);
    const rows = page.locator('[data-feature="projectHistory"] li[role="option"]');
    await rows.nth(2).click();
    assert.equal(await rows.nth(2).getAttribute('aria-selected'), 'true');
    await page.click('[data-feature="projectHistory"] [data-role="restore-selected"]');
    await page.waitForFunction(() => window.baiStudio.project.getState().bundle?.combination?.cursor === 0);
    const state = await page.evaluate(() => window.baiStudio.project.getState().bundle.combination);
    assert.deepEqual(state.timeline, []);
    assert.equal(state.selected, 2, 'restoring a version keeps the pattern selection');
    assert.match(await rows.nth(2).textContent(), /1\. .* 初期.*現在/);
  });
});

test('undo autosaves the combination with the envelope revision', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await freezeSync(page);
    await open(page, server);
    await loaded(page);
    await firstTick(page);
    const env = await api(server, '/api/project?envelope=1');
    const before = { cam: readRaw(server, 'camera_project.json'), ws: readRaw(server, 'project_state.workspace.json') };
    const reqP = page.waitForRequest((r) => r.method() === 'POST' && /\/api\/project$/.test(r.url()));
    const t0 = Date.now();
    await page.click(UNDO);
    assert.match(await statusText(page), /自動保存待ち…/);
    const req = await reqP;
    const waited = Date.now() - t0;
    assert.ok(waited >= 400, `autosave waits 450ms (waited ${waited}ms)`);
    assert.equal(req.headers()['if-match'], env.json.revision);
    await waitStatus(page, /保存済み/);
    const saved = readJson(server, 'project_state.json');
    assert.equal(saved.cursor, 1);
    assert.deepEqual(saved.timeline, [{ name: 'a' }]);
    assert.equal(saved.selected, 2, 'selected is kept');
    assert.equal(saved.history.length, 3);
    assert.deepEqual(readRaw(server, 'camera_project.json'), before.cam, 'camera file untouched');
    assert.deepEqual(readRaw(server, 'project_state.workspace.json'), before.ws, 'workspace file untouched');
    assert.match(await page.textContent('[data-key="combination"]'), /1件・履歴3件（2番目）/);
    // 続けて［戻す］→（450ms 以内に）［保存］：統合保存が 200（版を取り直しているので 409 にならない）
    const bundleP = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/project\/bundle$/.test(r.url()));
    await clickBoth(page, UNDO, SAVE);
    const res = await bundleP;
    assert.equal(res.status(), 200);
    assert.equal(readJson(server, 'project_state.json').cursor, 0);
    await waitStatus(page, /保存済み/);
  });
});

test('own autosave is not reported as an external change', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await page.addInitScript(() => {
      window.__seen = [];
      new MutationObserver(() => {
        const t = document.body ? document.body.textContent || '' : '';
        for (const w of ['外部の変更を読み込みました', 'サーバー側が更新されました']) if (t.includes(w)) window.__seen.push(w);
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await open(page, server);
    await loaded(page);
    await page.click(UNDO);
    await waitStatus(page, /保存済み/);
    await page.waitForTimeout(3500); // tick が2回以上動く
    assert.deepEqual(await page.evaluate(() => window.__seen), []);
    await clickBoth(page, UNDO, SAVE);
    await page.waitForResponse((r) => /\/api\/project\/bundle$/.test(r.url()) && r.request().method() === 'POST');
    await waitStatus(page, /保存済み/);
    await page.waitForTimeout(3500);
    assert.deepEqual(await page.evaluate(() => window.__seen), []);
    assert.equal(readJson(server, 'project_state.json').cursor, 0);
  });
});

test('explicit save flushes the pending autosave into the bundle', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await freezeSync(page);
    await open(page, server);
    await loaded(page);
    await firstTick(page);
    const posts = [];
    page.on('request', (r) => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
    await clickBoth(page, UNDO, SAVE);
    await page.waitForTimeout(2000);
    assert.equal(posts.filter((p) => p === '/api/project/bundle').length, 1);
    assert.equal(posts.filter((p) => p === '/api/project').length, 0);
    assert.deepEqual(readJson(server, 'project_state.workspace.json'), WORKSPACE, 'workspace file is kept');
    assert.equal(readJson(server, 'project_state.json').cursor, 1);
    // 保存した内容は再読込しても同じ（②-1・②-3）
    await page.reload();
    await loaded(page);
    assert.match(await page.textContent('[data-key="combination"]'), /1件・履歴3件（2番目）/);
  });
});

test('autosave conflict keeps local edits and offers reload', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await freezeSync(page);
    await open(page, server);
    await loaded(page);
    await firstTick(page);
    const ext = await postProject(server, EXTERNAL(3));
    assert.equal(ext.status, 200);
    await page.click(UNDO);
    await page.waitForSelector('[role="dialog"]');
    assert.match(await page.textContent('[role="dialog"]'), /他の画面/);
    assert.equal(readJson(server, 'project_state.json').timeline.length, 3, 'the other save is untouched');
    assert.match(await statusText(page), /未保存の変更があります/);
    await page.click('[data-role="conflict-reload"]');
    await page.waitForFunction(() => /3件・履歴3件/.test(document.querySelector('[data-key="combination"]')?.textContent || ''));
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
    assert.match(await page.textContent('[data-key="title"]'), /外部の保存/);
  }, { errors: [/409/] });
});

test('bundle conflict keeps local edits', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await freezeSync(page);
    await open(page, server);
    await loaded(page);
    await firstTick(page);
    const b = await api(server, '/api/project/bundle');
    const camera = { ...b.json.camera, duration: 400 };
    const ext = await api(server, '/api/project/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': b.json.revision },
      body: JSON.stringify({ schema: 1, combination: b.json.combination, camera, workspace: b.json.workspace }) });
    assert.equal(ext.status, 200);
    await clickBoth(page, UNDO, SAVE);
    await page.waitForSelector('[role="dialog"]');
    assert.match(await page.textContent('[role="dialog"]'), /サーバー側が更新されています/);
    assert.equal(readJson(server, 'camera_project.json').duration, 400);
    assert.equal(readJson(server, 'project_state.json').cursor, 2, 'our edit was not written');
    await page.click('[data-role="conflict-close"]');
    assert.match(await statusText(page), /未保存の変更があります/);
  }, { errors: [/409/] });
});

test('invalid camera file blocks bundle saving but keeps the combination usable', async () => {
  const seed = { ...seedAll(), 'camera_project.json': '{"broken":' };
  await withApp(seed, async ({ server, page }) => {
    await freezeSync(page);
    await open(page, server);
    await loaded(page);
    await firstTick(page);
    const text = await statusText(page);
    assert.match(text, /カメラ保存データを読めません/);
    assert.match(text, /camera_project\.invalid-/);
    assert.match(text, /手で直す場合/);
    assert.equal(await page.locator(SAVE).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.baiStudio.project.getState().status), 'ready');
    // ［戻す］は使え、450ms 後に POST /api/project が 200 になる
    const resP = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/project$/.test(r.url()));
    await page.click(UNDO);
    assert.equal((await resP).status(), 200);
    assert.equal(readJson(server, 'project_state.json').cursor, 1);
    assert.equal(await page.locator(SAVE).isDisabled(), true, 'still disabled with a dirty combination');
    assert.deepEqual(readRaw(server, 'camera_project.json'), Buffer.from('{"broken":'), 'camera file bytes unchanged');
    assert.equal(backups(server).length, 1);
    // 直接 POST しても 422 で書かれない
    const direct = await api(server, '/api/project/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': 'x' }, body: '{}' });
    assert.equal(direct.status, 422);
    assert.deepEqual(readRaw(server, 'camera_project.json'), Buffer.from('{"broken":'));
    assert.equal(backups(server).length, 1);
    // 作業中の素材は変えられない
    assert.match(await page.textContent('[data-key="camera"]'), /読めません/);
    assert.doesNotMatch(await page.textContent('[data-key="title"]'), /未保存/, 'the combination exists; only the camera is unreadable');
    assert.equal(await page.textContent('[data-key="integrated"]'), '保存済み');
    if (SHOTS) { await page.setViewportSize({ width: 1600, height: 900 }); await page.screenshot({ path: path.join(SHOTS, 'scr18-camera-invalid.jpg'), type: 'jpeg', quality: 70 }); }
  }, { errors: [/422/] });
});

test('reset from the invalid state requires confirmation and keeps the backup', async () => {
  const seed = { ...seedAll(), 'camera_project.json': '{"broken":' };
  await withApp(seed, async ({ server, page }) => {
    await freezeSync(page);
    await open(page, server);
    await loaded(page);
    await firstTick(page);
    let resets = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/camera\/project\/reset$/.test(r.url())) resets++; });
    await page.click('[data-role="camera-reset"]');
    await page.waitForSelector('[role="dialog"]');
    assert.match(await page.textContent('[role="dialog"]'), /カメラの保存データを初期状態に戻します/);
    assert.match(await page.textContent('[role="dialog"]'), /camera_project\.invalid-/);
    await page.click('[data-role="confirm-cancel"]');
    await page.waitForTimeout(300);
    assert.equal(resets, 0);
    await page.click('[data-role="camera-reset"]');
    await page.click('[data-role="confirm-ok"]');
    await waitStatus(page, /保存済み/);
    assert.equal(resets, 1);
    const cam = readJson(server, 'camera_project.json');
    assert.equal(cam.schema, 1);
    assert.equal(backups(server).length, 1, 'backup remains');
    assert.equal(fs.readFileSync(path.join(server.dataDir, backups(server)[0]), 'utf8'), '{"broken":');
    assert.equal(await page.evaluate(() => window.baiStudio.project.getState().cameraInvalid), null);
    await page.click(UNDO); // 編集すると［保存］が使える
    assert.equal(await page.locator(SAVE).isDisabled(), false);
  }, { errors: [/422/] });
});

test('camera file broken after load is reported, not treated as offline', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await open(page, server);
    await loaded(page);
    await firstTick(page);
    fs.writeFileSync(path.join(server.dataDir, 'camera_project.json'), '{"broken":');
    assert.equal((await postProject(server, EXTERNAL(3))).status, 200);
    await waitStatus(page, /カメラ保存データを読めません/, 6000);
    assert.doesNotMatch(await statusText(page), /^未接続/);
    assert.equal(await page.locator(SAVE).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.baiStudio.project.getState().status), 'ready');
  }, { errors: [/422/] });
});

test('server error during sync keeps the page usable', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await open(page, server);
    await loaded(page);
    await firstTick(page);
    const handler = (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' });
    await page.route('**/api/project/bundle', handler);
    assert.equal((await postProject(server, EXTERNAL(3))).status, 200);
    await waitStatus(page, /サーバーでエラーが起きました（HTTP 500）/, 6000);
    assert.equal(await page.evaluate(() => window.baiStudio.project.getState().status), 'ready');
    assert.equal(await page.locator(UNDO).isDisabled(), false, 'still usable');
    await page.unroute('**/api/project/bundle', handler);
    await waitStatus(page, /保存済み/, 6000); // 次の tick で元に戻り、外部の変更も読み込まれる
    assert.match(await page.textContent('[data-key="title"]'), /外部の保存/);
  }, { errors: [/500/] });
});

test('missing combination is not created without an edit', async () => {
  const seed = seedAll();
  delete seed['project_state.json'];
  await withApp(seed, async ({ server, page }) => {
    await open(page, server);
    await loaded(page);
    assert.match(await page.textContent('[data-feature="projectSummary"]'), /コンビネーション未保存/);
    assert.match(await statusText(page), /コンビネーション未保存/);
    assert.equal(await page.locator(SAVE).isDisabled(), true);
    await page.waitForTimeout(10000);
    assert.equal(exists(server, 'project_state.json'), false);
    assert.equal(await page.locator(SAVE).isDisabled(), true);
  });
});

test('external change reloads when clean', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await open(page, server);
    await loaded(page);
    await firstTick(page);
    assert.equal((await postProject(server, EXTERNAL(3))).status, 200);
    await page.waitForFunction(() => /3件・履歴3件/.test(document.querySelector('[data-key="combination"]')?.textContent || ''), null, { timeout: 3500 });
    assert.match(await page.textContent('#toasts'), /外部の変更を読み込みました/);
  });
});

test('beforeunload guard while autosave is in flight', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await freezeSync(page);
    await open(page, server);
    await loaded(page);
    await firstTick(page);
    await page.route('**/api/project', (route) => { if (route.request().method() === 'POST') return; return route.continue(); }); // 応答しない
    const types = [];
    page.on('dialog', (d) => { types.push(d.type()); void d.accept(); });
    await page.click(UNDO);
    await page.waitForTimeout(700);
    assert.match(await statusText(page), /保存中…/);
    await page.reload();
    assert.deepEqual(types, ['beforeunload']);
  }, { errors: [/ERR_|Failed to load|net::/] });
});

test('other screens get a toast when the project needs attention', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await open(page, server, '02');
    await page.waitForFunction(() => window.baiStudio.project.getState().status === 'ready');
    await firstTick(page);
    fs.writeFileSync(path.join(server.dataDir, 'camera_project.json'), '{"broken":');
    assert.equal((await postProject(server, EXTERNAL(3))).status, 200);
    await page.waitForFunction(() => /カメラ保存データを読めません/.test(document.querySelector('#toasts')?.textContent || ''), null, { timeout: 6000 });
    assert.match(await page.textContent('#toasts'), /保存・復元（18）/);
  }, { errors: [/422/] });
});

test('home shows one real project card and no sample projects', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await open(page, server, '01');
    await page.waitForSelector('[data-feature="projectCard"]');
    assert.equal(await page.locator('[data-feature="projectCard"]').count(), 1);
    assert.equal(await page.locator('.ribbon').count(), 0);
    const block = await page.textContent('.block:has([data-feature="projectCard"])');
    assert.doesNotMatch(block, /City_Night_MV|Blue_Resonance|Sakura_Dance|Virtual_Stage_Live/);
    assert.equal(await page.locator('.block:has([data-feature="projectCard"]) .media-card').count(), 1);
    await page.waitForFunction(() => /保存済み/.test(document.querySelector('[data-feature="projectCard"]')?.textContent || ''));
    assert.match(await page.textContent('[data-feature="projectCard"]'), /歌ってみた/);
    assert.equal(await page.locator('[data-role="project-note"]').count(), 1);
    // ［新規プロジェクト］は ◇（Q1 の回答待ち）
    await page.click('.hero .btn-row .btn.primary');
    await page.waitForSelector('[role="dialog"]');
    assert.match(await page.textContent('[role="dialog"]'), /DATA-008/);
    await page.keyboard.press('Escape');
    // カードを押すと SCR-18
    await page.click('[data-feature="projectCard"]');
    await page.waitForFunction(() => location.pathname === '/workspace/18');
    if (SHOTS) { await page.setViewportSize({ width: 1600, height: 900 }); await open(page, server, '01'); await page.waitForSelector('[data-feature="projectCard"]'); await page.waitForTimeout(400); await page.screenshot({ path: path.join(SHOTS, 'scr01-home.jpg'), type: 'jpeg', quality: 70 }); }
  });
});

test('offline shows 未接続 and disables save', async () => {
  await withApp(seedAll(), async ({ server, page }) => {
    await page.route('**/api/project/bundle', (route) => route.abort());
    await open(page, server);
    await page.waitForSelector('[data-feature="projectSummary"] [data-kind="offline"]', { timeout: 8000 });
    assert.match(await page.textContent('[data-feature="projectSummary"]'), /未接続/);
    assert.match(await statusText(page), /未接続/);
    assert.equal(await page.locator(SAVE).isDisabled(), true);
  }, { errors: [/ERR_FAILED|Failed to load|net::/] });
});
