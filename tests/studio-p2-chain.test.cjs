'use strict';
// ⑤ SCR-05：82パターンとA/B 3D・連結再生（P2 設計 §2.5(g)、WP-05c/d）。
// 実サーバー（隔離データ）と Chromium で、画面の操作から確かめる。
// ポート：P2_CHAIN_PORT（既定 8784）。テストごとに新しいサーバー・種データで始める。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.P2_CHAIN_PORT || 8784);
const FIX = path.join(__dirname, 'fixtures');
const FBX_MODEL = fs.readFileSync(path.join(FIX, 'minimal_model.fbx'));
const FBX_MOTION = fs.readFileSync(path.join(FIX, 'minimal_motion.fbx'));
const GLB_MODEL = fs.readFileSync(path.join(FIX, 'synthetic_test_model.glb'));
const VMD = fs.readFileSync(path.join(FIX, 'minimal.vmd'));
/** 最小PMXのテストZIPから指定エントリーだけ取得する（標準ライブラリ）。 */
function zipEntry(buf, wanted) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0, n = buf.readUInt16LE(eocd + 10); i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const name = buf.toString('utf8', p + 46, p + 46 + nl), local = buf.readUInt32LE(p + 42);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const raw = buf.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    }
    p += 46 + nl + el + cl;
  }
  throw new Error(`ZIPに ${wanted} がありません`);
}
const PMX_ZIP = fs.readFileSync(path.join(FIX, 'minimal_pmx.zip'));
const PMX = zipEntry(PMX_ZIP, 'model/test.pmx');
const PMX_PNG = zipEntry(PMX_ZIP, 'model/tex/a.png');

let browser;
test.before(async () => { browser = await harness.launchBrowser(); });
test.after(async () => { await browser?.close(); });

const JAB = 'Boxing Leading Hand Jab'; // パターン1
const COMBO = 'Boxing Jab Cross Combo'; // パターン9
const HOOK = 'Boxing Lead Hand Hook'; // パターン3（未登録のまま）

/** 登録済みモーション：1 は名前で一致、9 は手動の対応（mapping）で一致、2 は modelA として登録されているので👑にならない。 */
const MANIFEST = {
  files: [
    { id: 'f-jab', name: `${JAB}.fbx`, kind: 'motions' },
    { id: 'f-other', name: 'Some Other Clip.fbx', kind: 'motions' },
    { id: 'f-model', name: 'Back Hand Cross.fbx', kind: 'modelA' },
  ],
  mapping: { [COMBO]: 'someotherclip' },
};
const seed = (extra = {}) => ({
  'manifest.json': JSON.stringify(MANIFEST),
  'files/f-jab.fbx': FBX_MOTION, 'files/f-other.fbx': FBX_MOTION, 'files/f-model.fbx': FBX_MODEL,
  ...extra,
});
const seedPmx = (extra = {}) => seed({
  'mmd_assets.json': JSON.stringify({ A: [{ name: 'test.pmx', size: PMX.length }, { name: 'tex/a.png', size: PMX_PNG.length }], B: [], vmd: [{ name: 'minimal.vmd', size: VMD.length }] }),
  'mmd/A/test.pmx': PMX, 'mmd/A/tex/a.png': PMX_PNG, 'mmd/vmd/minimal.vmd': VMD,
  ...extra,
});
const seedPmxBoth = () => seedPmx({
  'mmd_assets.json': JSON.stringify({ A: [{ name: 'test.pmx', size: PMX.length }, { name: 'tex/a.png', size: PMX_PNG.length }], B: [{ name: 'test.pmx', size: PMX.length }, { name: 'tex/a.png', size: PMX_PNG.length }], vmd: [{ name: 'minimal.vmd', size: VMD.length }] }),
  'mmd/B/test.pmx': PMX, 'mmd/B/tex/a.png': PMX_PNG,
});
const seedAllCharacters = () => seedPmx({
  'integrated_v02/assets/aaaaaaaaaaaaaaaaaaaa.glb': GLB_MODEL,
  'integrated_v02/assets/bbbbbbbbbbbbbbbbbbbb.vrm': GLB_MODEL,
  'integrated_v02/user_assets.json': JSON.stringify([
    { id: 'user-aaaaaaaaaaaaaaaaaaaa', name: 'test.glb', filename: 'aaaaaaaaaaaaaaaaaaaa.glb', kind: 'model', bytes: GLB_MODEL.length },
    { id: 'user-bbbbbbbbbbbbbbbbbbbb', name: 'test.vrm', filename: 'bbbbbbbbbbbbbbbbbbbb.vrm', kind: 'model', bytes: GLB_MODEL.length },
  ]),
});

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
const postJson = (page, url, body) => page.evaluate(([u, b]) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.status), [url, body]);
const proj = (page) => page.evaluate(() => window.baiStudio.project.getState());

async function open05(page, server) {
  await page.goto(`${server.base}/workspace/05`);
  await page.waitForSelector('[data-feature="patternList"] li[data-pattern-id]');
  await page.waitForFunction(() => { const x = window.baiStudio.project.getState(); return x.status === 'ready' && x.syncRevision !== null; }, null, { timeout: 15000 });
  // 登録状況（👑）の読込を待つ
  await page.waitForFunction(() => /^👑 \d+件/.test(document.querySelector('[data-role="pattern-legend"]').textContent), null, { timeout: 10000 });
}
const row = (id) => `[data-feature="patternList"] li[data-pattern-id="${id}"]`;
const steps = (page) => page.$$eval('[data-role="chain-step"]', (els) => els.map((e) => e.textContent));
const toastText = (page) => page.textContent('#toasts');
/** 保存の完了（自動保存の待ちと通信が終わる）を待つ。 */
async function settled(page) {
  await page.waitForFunction(() => { const x = window.baiStudio.project.getState(); return !x.autosavePending && !x.saving && !x.dirty.combination; }, null, { timeout: 10000 });
}
async function selectAndAdd(page, id) {
  await page.click(row(id));
  await page.click('[data-role="chain-add"]');
}

test('pattern list marks registered fbx with a crown', async () => {
  await withApp(seed(), async ({ page, server }) => {
    await open05(page, server);
    assert.equal(await page.locator('[data-feature="patternList"] li[data-pattern-id]').count(), 82);
    // 👑：1（名前で一致）と 9（手動の対応）だけ。2 は modelA 登録なので数えない
    const crowned = await page.$$eval('[data-feature="patternList"] li[data-playable="true"]', (els) => els.map((e) => e.dataset.patternId));
    assert.deepEqual(crowned, ['1', '9']);
    assert.match(await page.textContent('[data-role="pattern-legend"]'), /^👑 2件：色付き＝全モーションを実FBXで再生可能/);
    assert.match(await page.textContent(row(1)), /01.*ジャブ 👑/);
    assert.doesNotMatch(await page.textContent(row(2)), /👑/);

    // 検索（番号・タイトル・Mixamo 名）と分類
    await page.fill('[data-role="pattern-search"]', '膝');
    const hits = await page.$$eval('[data-feature="patternList"] li[data-pattern-id]', (els) => els.map((e) => e.dataset.patternId));
    assert.ok(hits.length >= 1 && hits.includes('13'), `膝蹴り(13) が残る: ${hits}`);
    await page.fill('[data-role="pattern-search"]', 'uppercut');
    assert.ok((await page.locator('[data-feature="patternList"] li[data-pattern-id]').count()) >= 2);
    await page.fill('[data-role="pattern-search"]', '');
    await page.selectOption('[data-role="pattern-cat"]', '起き上がり');
    assert.equal(await page.locator('[data-feature="patternList"] li[data-pattern-id]').count(), 5);
    await page.selectOption('[data-role="pattern-cat"]', '');
    assert.equal(await page.locator('[data-feature="patternList"] li[data-pattern-id]').count(), 82);

    // 選ぶと Mixamo 検索名（実行順）が出る。選んだだけでは保存しない（dirty にしない）
    await page.click(row(9));
    assert.equal(await page.getAttribute(row(9), 'aria-selected'), 'true');
    assert.equal(await page.textContent('[data-role="pattern-steps"] li'), COMBO);
    const st = await proj(page);
    assert.equal(st.bundle.combination.selected, 9);
    assert.equal(st.dirty.combination, false);
    assert.equal(st.autosavePending, false);
    assert.equal(exists(server, 'project_state.json'), false, '選んだだけでは保存されない');
  });
});

test('pattern preview draws 2D fighters and animates A/B dummies without an FBX model', async () => {
  const noModels = seed({ 'manifest.json': JSON.stringify({ ...MANIFEST, files: MANIFEST.files.filter((f) => f.kind !== 'modelA') }) });
  await withApp(noModels, async ({ page, server }) => {
    await open05(page, server);
    await page.click(row(1));
    await page.waitForFunction(() => /A: 3D模式 \/ B: 3D模式/.test(document.querySelector('[data-role="pattern-status"]')?.textContent || ''));
    assert.match(await page.textContent('[data-role="pattern-description"]'), /連続動作を確認します/);
    assert.match(await page.textContent('[data-role="pattern-steps"]'), /Boxing Leading Hand Jab/);
    assert.ok(await page.locator('[data-role="pattern-svg"] #fighterA line').count() >= 7);
    assert.ok(await page.locator('[data-role="pattern-svg"] #fighterB line').count() >= 7);
    assert.equal((await page.evaluate(() => window.baiStudio.chain.getState())).actors[0].kind, null);
    await page.click('[data-role="pattern-play"]');
    await page.evaluate(() => { const el = document.querySelector('[data-role="pattern-seek"]'); el.value = '500'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => (window.baiStudio.chain.probe({ rotations: ['rightarm'] })?.rotations.rightarm?.[0] ?? 0) < -1.5);
    const a = await page.evaluate(() => window.baiStudio.chain.probe({ rotations: ['rightarm'] }).rotations.rightarm[0]);
    const b = await page.evaluate(() => window.baiStudio.chain.probe({ slot: 'B', rotations: ['rightarm'] }).rotations.rightarm[0]);
    assert.ok(a < -1.5 && Number.isFinite(b));
    await page.click(row(2));
    assert.match(await page.textContent('[data-role="pattern-time"]'), /^0\.0 \/ /, 'pattern selection resets its clock');
    await page.goto(`${server.base}/workspace/04`);
    await page.waitForFunction(() => window.baiStudio.chain.getState() === null);
    assert.equal((await page.evaluate(() => window.baiStudio.viewport.getState())).loaded, false);
  });
});

test('registered FBX takes priority in the pattern preview', async () => {
  await withApp(seed(), async ({ page, server }) => {
    await open05(page, server);
    await page.click(row(1));
    await page.waitForFunction(() => /A: 実FBX \/ B: 3D模式/.test(document.querySelector('[data-role="pattern-status"]')?.textContent || ''), null, { timeout: 15000 });
    await page.waitForFunction(() => (window.baiStudio.chain.probe({ bones: ['Tri'] })?.bones.Tri?.[0] ?? 0) > .1, null, { timeout: 10000 });
    assert.match(await page.textContent('[data-role="pattern-status"]'), /A: 実FBX/);
  });
});

test('pattern list says so when the registration cannot be read', async () => {
  await withApp(seed(), async ({ page, server }) => {
    await page.route('**/api/manifest', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }));
    await page.goto(`${server.base}/workspace/05`);
    await page.waitForSelector('[data-feature="patternList"] li[data-pattern-id]');
    await page.waitForFunction(() => /読み込めません/.test(document.querySelector('[data-role="pattern-legend"]').textContent), null, { timeout: 10000 });
    assert.equal(await page.locator('[data-feature="patternList"] li[data-playable="true"]').count(), 0);
  }, { errors: [/Failed to load resource/] });
});

test('add to combination records history and autosaves', async () => {
  await withApp(seed(), async ({ page, server }) => {
    await open05(page, server);
    await selectAndAdd(page, 1);
    assert.deepEqual(await steps(page), [`1. ${JAB}`]);
    assert.equal(await page.textContent('[data-role="chain-count"]'), '1件');
    let st = await proj(page);
    // 「初期状態」＋追加の2件（旧 index.html:383・374 と同じ）
    assert.deepEqual(st.bundle.combination.history.map((x) => x.label.split('：')[0]), ['初期状態', '追加']);
    assert.equal(st.bundle.combination.cursor, 1);
    assert.deepEqual(st.bundle.combination.history[0].timeline, []);
    assert.equal(st.dirty.combination, true);
    await settled(page);
    let disk = readJson(server, 'project_state.json');
    assert.deepEqual(disk.timeline, [{ name: JAB }]);
    assert.equal(disk.history.length, 2);
    assert.equal(disk.cursor, 1);
    assert.equal(disk.selected, 1);

    // 手動の対応で登録済みの 9 も追加できる。履歴は3件
    await selectAndAdd(page, 9);
    assert.deepEqual(await steps(page), [`1. ${JAB}`, `2. ${COMBO}`]);
    await settled(page);
    disk = readJson(server, 'project_state.json');
    assert.equal(disk.history.length, 3);
    assert.equal(disk.selected, 9);

    // ②の「戻す」で並びが戻り、下部の表示も変わる（ストアを購読している）
    await page.click('#nav a[data-route="18"]');
    await page.waitForSelector('[data-role="undo"]');
    await page.click('[data-role="undo"]');
    await page.click('#nav a[data-route="05"]');
    await page.waitForSelector('[data-feature="chainTimeline"]');
    assert.deepEqual(await steps(page), [`1. ${JAB}`]);
    await settled(page);
    assert.deepEqual(readJson(server, 'project_state.json').timeline, [{ name: JAB }]);
    st = await proj(page);
    assert.equal(st.bundle.combination.history.length, 3, '戻しても履歴は消えない');
  });
});

test('unregistered pattern is not added', async () => {
  await withApp(seed(), async ({ page, server }) => {
    await open05(page, server);
    // 何も選ばないで追加
    await page.click('[data-role="chain-add"]');
    assert.match(await toastText(page), /追加するパターンを選んでください/);
    await page.click(row(3)); // 左フック（HOOK）は未登録
    await page.click('[data-role="chain-add"]');
    assert.match(await toastText(page), /このモーションは実FBXが未登録です。FBXを登録・割当してから追加してください。/);
    assert.deepEqual(await steps(page), []);
    assert.match(await page.textContent('[data-role="chain-feedback"]'), /追加できていません/);
    const st = await proj(page);
    assert.equal(st.bundle.combination.history.length, 0);
    assert.equal(st.dirty.combination, false);
    assert.equal(exists(server, 'project_state.json'), false);
    assert.ok(HOOK);
  });
});

test('reorder delete clear follow record rules', async () => {
  await withApp(seed(), async ({ page, server }) => {
    await open05(page, server);
    await selectAndAdd(page, 1);
    await selectAndAdd(page, 9);
    await selectAndAdd(page, 1);
    assert.deepEqual(await steps(page), [`1. ${JAB}`, `2. ${COMBO}`, `3. ${JAB}`]);
    // 帯のボタンは手順を選ぶまで使えない
    for (const r of ['step-up', 'step-down', 'step-delete']) assert.equal(await page.isDisabled(`[data-role="${r}"]`), true, r);
    await page.click('[data-role="chain-step"][data-index="1"]');
    assert.equal(await page.isDisabled('[data-role="step-up"]'), false);
    await page.click('[data-role="step-up"]');
    assert.deepEqual(await steps(page), [`1. ${COMBO}`, `2. ${JAB}`, `3. ${JAB}`]);
    assert.equal(await page.isDisabled('[data-role="step-up"]'), true, '先頭では↑が使えない');
    await page.click('[data-role="step-down"]');
    await page.click('[data-role="step-down"]');
    assert.equal(await page.isDisabled('[data-role="step-down"]'), true, '末尾では↓が使えない');
    assert.deepEqual(await steps(page), [`1. ${JAB}`, `2. ${JAB}`, `3. ${COMBO}`]);
    await page.click('[data-role="step-delete"]');
    assert.deepEqual(await steps(page), [`1. ${JAB}`, `2. ${JAB}`]);
    let st = await proj(page);
    // 初期状態＋追加3＋並べ替え3＋削除1 = 8件
    assert.equal(st.bundle.combination.history.length, 8);
    await settled(page);
    // 全消去は確認なし。件数0・履歴は +1
    await page.click('[data-role="chain-clear"]');
    assert.deepEqual(await steps(page), []);
    assert.equal(await page.textContent('[data-role="chain-count"]'), '0件');
    st = await proj(page);
    assert.equal(st.bundle.combination.history.length, 9);
    assert.equal(await page.isDisabled('[data-role="chain-clear"]'), true);
    await settled(page);
    const disk = readJson(server, 'project_state.json');
    assert.deepEqual(disk.timeline, []);
    assert.equal(disk.cursor, 8);
    // 表情トラックは ◇ 未実装
    await page.click('[data-role="face-track"]');
    assert.match(await page.textContent('[role="dialog"]'), /LIP-009/);
  });
});

test('speed autosaves without history', async () => {
  const comb = {
    schema: 1, title: '歌ってみた', timeline: [{ name: JAB }], selected: 1, playbackSpeed: 1, updatedAt: '2026-10-20T00:00:00.000Z', cursor: 0,
    history: [{ label: '初期状態', at: '2026-10-20T00:00:00.000Z', timeline: [{ name: JAB }], selected: 1, playbackSpeed: 1 }],
  };
  await withApp(seed({ 'project_state.json': JSON.stringify(comb) }), async ({ page, server }) => {
    await open05(page, server);
    assert.equal(await page.inputValue('[data-role="playback-speed"]'), '1');
    assert.equal(await page.isDisabled('[data-role="loop"]'), true);
    assert.equal(await page.getAttribute('[data-feature="playbackSettings"] label.switch', 'title'), '旧画面と同じく常にループします');
    assert.deepEqual(await page.$$eval('[data-role="playback-speed"] option', (o) => o.map((x) => x.value)), ['0.5', '1', '1.5', '2']);
    await page.selectOption('[data-role="playback-speed"]', '2');
    const st = await proj(page);
    assert.equal(st.bundle.combination.playbackSpeed, 2);
    assert.equal(st.bundle.combination.history.length, 1, '速度は履歴に積まない');
    assert.equal(st.dirty.combination, true);
    await settled(page);
    const disk = readJson(server, 'project_state.json');
    assert.equal(disk.playbackSpeed, 2);
    assert.equal(disk.history.length, 1);
    // 戻す／再読込でも速度が画面に反映される
    await page.reload();
    await page.waitForSelector('[data-role="playback-speed"]');
    await page.waitForFunction(() => window.baiStudio.project.getState().status === 'ready');
    await page.waitForFunction(() => document.querySelector('[data-role="playback-speed"]').value === '2');
  });
});

test('favorites keep entries added elsewhere', async () => {
  const EXT = { id: 'mcp-1', name: 'MCPで足した', tags: ['mcp'], steps: [{ name: JAB }, { name: COMBO }] };
  await withApp(seed({ 'favorites.json': JSON.stringify([EXT]) }), async ({ page, server }) => {
    await open05(page, server);
    await page.click('[data-role="pattern-tab"][data-tab="favorites"]');
    assert.equal(await page.locator('[data-feature="patternList"] [data-pane="favorites"]').isVisible(), true);
    await page.waitForSelector('.favorite-card[data-fav-id="mcp-1"]');
    assert.match(await page.textContent('.favorite-card[data-fav-id="mcp-1"]'), /MCPで足した \(2動作\)/);
    assert.match(await page.textContent('.favorite-card[data-fav-id="mcp-1"]'), /#mcp/);
    await page.fill('[data-role="fav-search"]', 'zzz');
    assert.equal(await page.locator('.favorite-card').count(), 0);
    await page.fill('[data-role="fav-search"]', 'mcp  jab');
    assert.equal(await page.locator('.favorite-card').count(), 1, '空白で区切った語がすべて name・tags・steps に含まれる');
    await page.fill('[data-role="fav-search"]', '');

    // 読み込み：コンビネーションが置き換わり、履歴に積まれる
    await page.click('.favorite-card[data-fav-id="mcp-1"] [data-role="fav-load"]');
    assert.deepEqual(await steps(page), [`1. ${JAB}`, `2. ${COMBO}`]);
    await settled(page);
    assert.equal(readJson(server, 'project_state.json').history.length, 2);

    // 画面を開いた後で、他（MCP）がお気に入りを足した。画面から保存しても消えない
    const ext2 = { id: 'mcp-2', name: '後から足した', tags: [], steps: [{ name: JAB }] };
    assert.equal(await postJson(page, '/api/favorites', [EXT, ext2]), 200);
    await page.click('[data-role="chain-save"]');
    // 空の名前は保存しない
    await page.fill('[data-role="fav-name"]', '   ');
    await page.click('[data-role="fav-save-ok"]');
    assert.equal(await page.textContent('[data-role="fav-message"]'), '名前が必要です');
    // 読み込んだお気に入りが既定（上書き保存）。名前とタグを変えて保存
    assert.equal(await page.inputValue('[data-role="fav-tags"]'), 'mcp');
    await page.fill('[data-role="fav-name"]', ' 更新した名前 ');
    await page.fill('[data-role="fav-tags"]', 'a, b，a, c');
    await page.click('[data-role="fav-save-ok"]');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null);
    assert.match(await page.textContent('[data-role="chain-feedback"]'), /「★ お気に入り」に「更新した名前」を保存しました。/);
    let favs = readJson(server, 'favorites.json');
    assert.deepEqual(favs.map((f) => f.id), ['mcp-1', 'mcp-2'], '同じ id は置き換え、後から足されたものも残る');
    assert.equal(favs[0].name, '更新した名前');
    assert.deepEqual(favs[0].tags, ['a', 'b', 'c']);
    assert.deepEqual(favs[0].steps, [{ name: JAB }, { name: COMBO }]);

    // 新規保存（全消去→追加→保存）は新しい id で末尾に足される
    await page.click('[data-role="chain-clear"]');
    assert.equal(await page.inputValue('[data-role="playback-speed"]'), '1');
    await page.click('[data-role="pattern-tab"][data-tab="catalog"]');
    await selectAndAdd(page, 1);
    await page.click('[data-role="chain-save"]');
    assert.equal(await page.inputValue('[data-role="fav-name"]'), '新規コンビネーション');
    assert.equal(await page.inputValue('[data-role="fav-tags"]'), '格闘, コンボ');
    await page.click('[data-role="fav-save-ok"]');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null);
    favs = readJson(server, 'favorites.json');
    assert.equal(favs.length, 3);
    assert.match(favs[2].id, /^combo-\d+$/);
    assert.deepEqual(favs[2].tags, ['格闘', 'コンボ']);

    // 削除：確認 → 最新の一覧から除く。確認の間に足されたものは残る
    await page.click('[data-role="pattern-tab"][data-tab="favorites"]');
    const ext3 = { id: 'mcp-3', name: '削除中に足した', tags: [], steps: [{ name: JAB }] };
    await page.click('.favorite-card[data-fav-id="mcp-2"] [data-role="fav-delete"]');
    assert.match(await page.textContent('[role="dialog"]'), /このお気に入りを削除しますか？/);
    await page.click('[data-role="confirm-cancel"]');
    assert.equal(readJson(server, 'favorites.json').length, 3, 'キャンセルでは消えない');
    assert.equal(await postJson(page, '/api/favorites', [...favs, ext3]), 200);
    await page.click('.favorite-card[data-fav-id="mcp-2"] [data-role="fav-delete"]');
    await page.click('[data-role="confirm-ok"]');
    await page.waitForFunction(() => !document.querySelector('.favorite-card[data-fav-id="mcp-2"]'));
    assert.deepEqual(readJson(server, 'favorites.json').map((f) => f.id), ['mcp-1', favs[2].id, 'mcp-3']);
  });
});

test('favorite save failure keeps the dialog', async () => {
  await withApp(seed(), async ({ page, server }) => {
    await open05(page, server);
    await selectAndAdd(page, 1);
    await page.route('**/api/favorites', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid favorites"}' }) : route.continue()));
    await page.click('[data-role="chain-save"]');
    await page.click('[data-role="fav-save-ok"]');
    await page.waitForFunction(() => /保存失敗/.test(document.querySelector('[data-role="fav-message"]').textContent));
    assert.equal(await page.locator('[role="dialog"]').count(), 1);
    assert.equal(exists(server, 'favorites.json'), false);
  }, { errors: [/Failed to load resource/] });
});

test('preview_motion selects the row', async () => {
  await withApp(seed(), async ({ page, server }) => {
    const send = (cmd) => page.evaluate((c) => fetch('/api/sync-command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) }).then((r) => r.status), cmd);
    // SCR-05 以外では選ばず、トーストを1回だけ出す
    await page.goto(`${server.base}/workspace/08`);
    await page.waitForSelector('[data-feature="assetLibrary"]');
    await page.waitForFunction(() => { const x = window.baiStudio.project.getState(); return x.status === 'ready' && x.syncRevision !== null; }, null, { timeout: 15000 });
    assert.equal(await send({ action: 'preview_motion', name: COMBO }), 200);
    await page.waitForFunction(() => /外部から再生の指示（preview_motion）がありました/.test(document.getElementById('toasts').textContent), null, { timeout: 8000 });
    assert.equal((await proj(page)).bundle.combination.selected, 0, '他の画面では選ばない');
    // SCR-05 を開いて検索中でも、steps に name を含む行を選ぶ（title でも選べる）
    await page.click('#nav a[data-route="05"]');
    await page.waitForSelector('[data-feature="patternList"] li[data-pattern-id]');
    await page.fill('[data-role="pattern-search"]', 'zzz-no-match');
    assert.equal(await page.locator('[data-feature="patternList"] li[data-pattern-id]').count(), 0);
    assert.equal(await send({ action: 'preview_motion', name: COMBO }), 200);
    await page.waitForSelector(`${row(9)}[aria-selected="true"]`, { timeout: 8000 });
    assert.equal(await page.inputValue('[data-role="pattern-search"]'), '', '絞り込みを外して行を見せる');
    assert.equal(await send({ action: 'preview_motion', name: 'ジャブ' }), 200); // title===name でも選ぶ
    await page.waitForFunction(() => window.baiStudio.project.getState().bundle.combination.selected === 1);
    assert.equal((await proj(page)).dirty.combination, false, '選ぶだけでは保存しない');
  });
});

test('A/B slots display all four character formats without applying incompatible motion', harness.skip3d(), async () => {
  await withApp(seedAllCharacters(), async ({ page, server }) => {
    await open05(page, server);
    const state = () => page.evaluate(() => window.baiStudio.chain.getState());
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.actors[0]?.kind === 'pmx', null, { timeout: 15000 });
    await page.selectOption('[data-role="actor-a"]', 'integrated:aaaaaaaaaaaaaaaaaaaa.glb');
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.actors[0]?.id === 'integrated:aaaaaaaaaaaaaaaaaaaa.glb', null, { timeout: 15000 });
    assert.equal((await state()).actors[0].kind, 'generic');
    await page.selectOption('[data-role="actor-b"]', 'integrated:bbbbbbbbbbbbbbbbbbbb.vrm');
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.actors[1]?.id === 'integrated:bbbbbbbbbbbbbbbbbbbb.vrm', null, { timeout: 15000 });
    assert.match(await page.textContent('[data-feature="chainViewport"] .vp-hud'), /A: GLB \/ B: VRM/);
    await page.selectOption('[data-role="actor-b"]', 'fbx:f-model');
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.actors[1]?.id === 'fbx:f-model', null, { timeout: 15000 });
    await page.selectOption('[data-role="actor-b"]', 'mmd:A:test.pmx');
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.actors[1]?.id === 'mmd:A:test.pmx', null, { timeout: 15000 });
    assert.equal((await state()).actors[1].kind, 'pmx');
  });
});

test('fbx model a is placed like the legacy page', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    await open05(page, server);
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.actors[0]?.kind === 'fbx', null, { timeout: 15000 });
    const state = await page.evaluate(() => ({ chain: window.baiStudio.chain.getState(), bounds: window.baiStudio.viewport.getState().bounds }));
    assert.equal(state.chain.actors[0].id, 'f-model');
    assert.equal(state.chain.actors[1].kind, null);
    const a = state.chain.actors[0].bounds, b = state.chain.actors[1].bounds;
    assert.ok(a.min[0] < -1 && a.max[0] < 0, `実FBXのAは左側: ${JSON.stringify(a)}`);
    assert.ok(Math.abs((a.max[1] - a.min[1]) - 1.95) < .06, `A の高さは1.95: ${JSON.stringify(a)}`);
    assert.ok(b.min[0] > 0 && state.bounds.max[0] > 0, `模式のBは右側: ${JSON.stringify(b)}`);
    assert.ok((await page.evaluate(() => window.baiStudio.viewport.countNonBackground())) > 0);
  });
});

test('chain playback follows the clip clock', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    await open05(page, server);
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.actors[0]?.kind === 'fbx');
    await selectAndAdd(page, 1);
    await page.click('[data-role="chain-play"]');
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.playing && window.baiStudio.chain.probe({ bones: ['Tri'] }).bones.Tri?.[0] > .1, null, { timeout: 10000 });
    const st = await page.evaluate(() => ({ state: window.baiStudio.chain.getState(), tri: window.baiStudio.chain.probe({ bones: ['Tri'] }).bones.Tri }));
    assert.equal(st.state.steps[0].name, JAB);
    assert.ok(st.state.clock > 0 && st.state.clock < 1);
    assert.ok(st.tri[0] > .1, `Tri がFBXクリップで動く: ${st.tri}`);
    assert.match(await page.textContent('[data-role="pattern-status"]'), /チェイン再生中 — 模式3Dを一時停止/);
    await page.click('[data-role="chain-stop"]');
    assert.equal((await page.evaluate(() => window.baiStudio.chain.getState())).playing, false);
    assert.match(await page.textContent('[data-role="chain-status"]'), /再生を停止しました/);
  });
});

test('mapping keeps keys added elsewhere', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    await open05(page, server);
    await page.click(row(2));
    const file = path.join(server.dataDir, 'manifest.json');
    const latest = readJson(server, 'manifest.json');
    latest.mapping['External Step'] = 'external';
    fs.writeFileSync(file, JSON.stringify(latest));
    await page.locator('details.chain-mapping').evaluate((el) => { el.open = true; });
    await page.selectOption('[data-role="mapping-step"][data-step="Back Hand Cross"]', 'boxingleadinghandjab');
    await page.waitForFunction(() => document.querySelector('[data-role="chain-status"]')?.textContent.includes('対応を保存しました'));
    const disk = readJson(server, 'manifest.json');
    assert.equal(disk.mapping['External Step'], 'external');
    assert.equal(disk.mapping['Back Hand Cross'], 'boxingleadinghandjab');
    await page.waitForFunction(() => document.querySelector('[data-feature="patternList"] li[data-pattern-id="2"]')?.dataset.playable === 'true');
  });
});

test('pmx slot vmd and chain switch', harness.skip3d(), async () => {
  await withApp(seedPmx(), async ({ page, server }) => {
    await open05(page, server);
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.actors[0]?.kind === 'pmx', null, { timeout: 15000 });
    assert.equal(await page.inputValue('[data-role="actor-a"]'), 'mmd:A:test.pmx');
    await page.selectOption('[data-role="vmd-select"]', 'mmd:vmd:minimal.vmd');
    await page.click('[data-role="vmd-play"]');
    await page.waitForFunction(() => window.baiStudio.chain.probe({ morphs: ['あ'] })?.morphs['あ'] > .2, null, { timeout: 10000 });
    await selectAndAdd(page, 1);
    await page.click('[data-role="chain-play"]');
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.playing);
    assert.equal((await page.evaluate(() => window.baiStudio.chain.getState())).actors[0].kind, 'fbx');
    assert.match(await toastText(page), /連結再生のため、A を FBX モデルの表示に戻しました/);
  });
});

test('slot b plays vmd independently from slot a', harness.skip3d(), async () => {
  await withApp(seedPmxBoth(), async ({ page, server }) => {
    await open05(page, server);
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.actors.every((x) => x.kind === 'pmx'), null, { timeout: 15000 });
    await page.selectOption('[data-role="vmd-target"]', 'B');
    await page.selectOption('[data-role="vmd-select"]', 'mmd:vmd:minimal.vmd');
    await page.click('[data-role="vmd-play"]');
    await page.waitForFunction(() => window.baiStudio.chain.probe({ slot: 'B', morphs: ['あ'] })?.morphs['あ'] > .2, null, { timeout: 10000 });
    const a = await page.evaluate(() => window.baiStudio.chain.probe({ slot: 'A', morphs: ['あ'] }).morphs['あ']);
    assert.equal(a, 0, 'AにはVMDを当てていない');
    assert.match(await page.textContent('[data-role="chain-status"]'), /B : minimal.vmd を再生中/);
  });
});

test('play_chain and stop_chain', harness.skip3d(), async () => {
  await withApp(seed(), async ({ page, server }) => {
    await open05(page, server);
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.actors[0]?.kind === 'fbx');
    await selectAndAdd(page, 1);
    const send = (action) => page.evaluate((cmd) => fetch('/api/sync-command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: cmd }) }).then((r) => r.status), action);
    assert.equal(await send('play_chain'), 200);
    await page.waitForFunction(() => window.baiStudio.chain.getState()?.playing, null, { timeout: 8000 });
    assert.equal(await send('stop_chain'), 200);
    await page.waitForFunction(() => !window.baiStudio.chain.getState()?.playing, null, { timeout: 8000 });
  });
});
