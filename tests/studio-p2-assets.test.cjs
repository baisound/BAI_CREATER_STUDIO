'use strict';
// ③ 素材一覧と取り込み（P2 設計 §2.3(g)、WP-02・WP-03）。実サーバー（隔離データ）と Chromium で、画面の操作から確かめる。
// ポート：P2_ASSETS_PORT（既定 8796）。テストごとに新しいサーバー・種データで始める。
// FBX の解析（FBXLoader）を使うテストは three が要る（THREE_DIR または node_modules/three）。無ければ skip。
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.P2_ASSETS_PORT || 8796);
const SHOTS = process.env.P2_ASSETS_SHOTS || '';
const FIX = path.join(__dirname, 'fixtures');
const GLB = fs.readFileSync(path.join(FIX, 'synthetic_test_model.glb'));
const VMD = fs.readFileSync(path.join(FIX, 'minimal.vmd'));
const ZIP = fs.readFileSync(path.join(FIX, 'minimal_pmx.zip'));
const FBX_MODEL = fs.readFileSync(path.join(FIX, 'minimal_model.fbx'));   // tools/make_test_fbx.py（O-③-1）
const FBX_MOTION = fs.readFileSync(path.join(FIX, 'minimal_motion.fbx'));
const sha20 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 20);
const fbxId = (kind, name) => crypto.createHash('sha256').update(`${kind}\0${name}`).digest('hex').slice(0, 24);
const rand = (n, seed = 7) => { const b = Buffer.alloc(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; b[i] = x & 255; } return b; };

const SEED_STORED_MODEL = 'aaaaaaaaaaaaaaaaaaaa.glb';
const SEED_STORED_MOTION = 'bbbbbbbbbbbbbbbbbbbb.glb';
/** 種データ：integrated モデル1（ファイルあり）、integrated モーション1（ファイルなし）、mmd VMD 1、mmd A の PMX 1、FBX motions 1（ファイルあり）。 */
function seedLibrary(extra = {}) {
  const id = fbxId('motions', 'walk.fbx');
  return {
    [`integrated_v02/assets/${SEED_STORED_MODEL}`]: GLB,
    'integrated_v02/user_assets.json': JSON.stringify([
      { id: 'user-aaaaaaaaaaaaaaaaaaaa', name: 'seed-model.glb', filename: SEED_STORED_MODEL, kind: 'model', bytes: GLB.length },
      { id: 'user-bbbbbbbbbbbbbbbbbbbb', name: 'seed-motion-missing.glb', filename: SEED_STORED_MOTION, kind: 'motion', bytes: 1 },
    ]),
    'mmd_assets.json': JSON.stringify({ A: [{ name: 'seed.pmx', size: 24 }], B: [], vmd: [{ name: 'seed.vmd', size: VMD.length }] }),
    'mmd/A/seed.pmx': Buffer.from('PMX seed'),
    'mmd/vmd/seed.vmd': VMD,
    'manifest.json': JSON.stringify({ files: [{ id, name: 'walk.fbx', kind: 'motions', size: 100 }], mapping: {} }),
    [`files/${id}.fbx`]: rand(100),
    ...extra,
  };
}

let browser;
test.before(async () => { browser = await harness.launchBrowser(); });
test.after(async () => { await browser?.close(); });

async function withApp(seed, fn, { errors = [] } = {}) {
  const server = await harness.startServer({ port: PORT, seed });
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
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.screenshot({ path: path.join(SHOTS, name), type: 'jpeg', quality: 70 });
  await page.setViewportSize({ width: 1440, height: 900 });
};

const CARD = '[data-feature="assetLibrary"] .asset';
const QROW = '[data-feature="importQueue"] tbody tr';
async function open08(page, server, query = '') {
  await page.goto(`${server.base}/workspace/08${query}`);
  await page.waitForSelector('[data-feature="assetLibrary"]');
}
async function waitCards(page, n) {
  await page.waitForFunction((count) => document.querySelectorAll('[data-feature="assetLibrary"] .asset').length === count, n, { timeout: 8000 });
}
/** ダイアログでファイルを選ぶ。files: [{name, buffer}]。 */
async function pickFiles(page, files) {
  await page.click('.screen-head [data-role="open-import"]');
  await page.waitForSelector('[role="dialog"] [data-role="import-files"]');
  await page.setInputFiles('[role="dialog"] [data-role="import-files"]', files.map((f) => ({ name: f.name, mimeType: 'application/octet-stream', buffer: f.buffer })));
}
async function setKind(page, name, value) {
  await page.selectOption(`[role="dialog"] li[data-name="${name}"] select[data-role="kind"]`, value);
}
async function rowStatus(page, name) {
  return (await page.locator(`${QROW}[data-name="${name}"] [data-role="status"]`).first().textContent()) || '';
}
async function waitRow(page, name, re, timeout = 10000) {
  await page.waitForFunction(({ n, src }) => {
    const el = document.querySelector(`[data-feature="importQueue"] tbody tr[data-name="${CSS.escape(n)}"] [data-role="status"]`);
    return !!el && new RegExp(src).test(el.textContent || '');
  }, { n: name, src: re.source }, { timeout });
}

test('library lists real assets by category', async () => {
  await withApp(seedLibrary(), async ({ server, page }) => {
    await open08(page, server);
    await waitCards(page, 5);
    const count = (cat) => page.textContent(`[data-feature="assetCategories"] li[data-cat="${cat}"] [data-role="count"]`);
    assert.equal(await count('char'), '2');
    assert.equal(await count('motion'), '3');
    assert.equal(await count('all'), '5');
    assert.equal(await count('stage'), '0');
    assert.match(await page.textContent('[data-feature="assetCategories"] li[data-cat="motion"]'), /モーション/);
    assert.doesNotMatch(await page.textContent('[data-feature="assetCategories"] li[data-cat="motion"]'), /VMD/);
    // ファイルなしの素材にだけ「ファイルなし」
    assert.equal(await page.locator(`${CARD}[data-available="false"] [data-role="missing"]`).count(), 1);
    assert.match(await page.textContent(`${CARD}[data-available="false"]`), /ファイルなし/);
    assert.equal(await page.locator(`${CARD}[data-available="true"] [data-role="missing"]`).count(), 0);
    // サンプルの素材名は出ない
    assert.doesNotMatch(await page.textContent('#main'), /夜の神社/);
    assert.match(await page.textContent('[data-feature="assetLibrary"] [data-role="count"]'), /5件（?/);
    assert.doesNotMatch(await page.textContent('[data-feature="assetLibrary"] .lib-crumb'), /サンプル/);
    // 分類を選ぶと URL に cat= が付き、件数が変わる
    await page.click('[data-feature="assetCategories"] li[data-cat="char"]');
    await waitCards(page, 2);
    assert.match(page.url(), /[?&]cat=char/);
    // 登録手段の無い分類は空表示と ◇ の説明
    await page.click('[data-feature="assetCategories"] li[data-cat="stage"]');
    assert.match(await page.textContent('[data-role="empty-cat"]'), /この種類の素材を登録する機能はまだありません。/);
    await page.click('[data-role="empty-cat"] button');
    assert.match(await page.textContent('[role="dialog"]'), /LYRIC-009/);
    await page.keyboard.press('Escape');
    await page.click('[data-feature="assetCategories"] li[data-cat="all"]');
    await waitCards(page, 5);
    await shot(page, 'scr08-library.jpg');
  });
});

test('motion card shows three poses and detail plays, pauses and seeks a real FBX clip', harness.skip3d(), async () => {
  const id = fbxId('motions', 'walk.fbx');
  await withApp(seedLibrary({ [`files/${id}.fbx`]: FBX_MOTION }), async ({ server, page }) => {
    await open08(page, server, '?cat=motion');
    const card = page.locator(`${CARD}[data-asset-id="fbx:${id}"]`);
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction((assetId) => {
      const el = document.querySelector(`[data-feature="assetLibrary"] .asset[data-asset-id="fbx:${assetId}"] img`);
      return el?.getAttribute('src')?.startsWith('data:image/png');
    }, id, { timeout: 20000 });
    assert.match(await card.locator('img').getAttribute('alt'), /開始・中間・終了/);
    await card.click();
    await page.waitForFunction(() => /再生中/.test(document.querySelector('[data-role="preview-status"]')?.textContent || ''), null, { timeout: 20000 });
    await page.click('[data-role="preview-pause"]');
    const paused = await page.locator('[data-role="preview-time"]').textContent();
    await page.waitForTimeout(180);
    assert.equal(await page.locator('[data-role="preview-time"]').textContent(), paused);
    await page.locator('[data-role="preview-seek"]').evaluate((el) => { el.value = '0.75'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.match(await page.locator('[data-role="preview-time"]').textContent(), /0\.7|0\.8/);
    await page.click('[data-role="preview-play"]');
    assert.equal(await page.locator('[data-role="preview-play"]').isDisabled(), true);
  });
});

test('search and format filter work on real data', async () => {
  await withApp(seedLibrary(), async ({ server, page }) => {
    await open08(page, server);
    await waitCards(page, 5);
    await page.fill('[data-role="search"]', 'walk');
    await waitCards(page, 1);
    assert.match(await page.textContent(CARD), /walk\.fbx/);
    await page.fill('[data-role="search"]', '');
    await waitCards(page, 5);
    assert.deepEqual(await page.locator('[data-role="format"] option').allTextContents(), ['すべての形式', 'FBX', 'GLB', 'PMX', 'VMD']);
    await page.selectOption('[data-role="format"]', 'VMD');
    await waitCards(page, 1);
    assert.match(await page.textContent(CARD), /seed\.vmd/);
    await page.selectOption('[data-role="format"]', 'all');
    await waitCards(page, 5);
    // 並び替え：名前順
    await page.selectOption('[data-role="sort"]', 'name');
    const names = await page.locator(`${CARD} .asset-cap b`).allTextContents();
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'ja')));
    // 検索に一致しないと空表示
    await page.fill('[data-role="search"]', 'zzzzzz');
    assert.match(await page.textContent('[data-feature="assetLibrary"] .lib-body'), /条件に一致する素材はありません/);
  });
});

test('display preferences persist in bai.studio.lib.v1', async () => {
  await withApp(seedLibrary(), async ({ server, page }) => {
    await open08(page, server);
    await waitCards(page, 5);
    await page.click('[data-role="view-list"]');
    await page.selectOption('[data-role="sort"]', 'format');
    await page.waitForSelector('[data-feature="assetLibrary"] table.asset-table');
    assert.equal(await page.locator('table.asset-table tbody tr').count(), 5);
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('bai.studio.lib.v1')));
    assert.equal(saved.view, 'list');
    assert.equal(saved.sort, 'format');
    await page.reload();
    await page.waitForSelector('table.asset-table tbody tr');
    assert.equal(await page.inputValue('[data-role="sort"]'), 'format');
  });
});

test('detail shows registration facts', async () => {
  await withApp(seedLibrary(), async ({ server, page }) => {
    await open08(page, server);
    await waitCards(page, 5);
    assert.match(await page.textContent('[data-feature="assetDetail"]'), /素材を選択してください/);
    await page.click(`${CARD}[data-asset-id="integrated:${SEED_STORED_MODEL}"]`);
    const fact = (key) => page.textContent(`[data-feature="assetDetail"] [data-key="${key}"]`);
    assert.equal(await fact('name'), 'seed-model.glb');
    assert.equal(await fact('format'), 'GLB');
    assert.equal(await fact('category'), 'キャラクター');
    assert.equal(await fact('source'), 'GLB / VRM 登録');
    assert.equal(await fact('id'), `integrated:${SEED_STORED_MODEL}`);
    assert.equal(await fact('file'), 'あり');
    assert.equal(await fact('stored'), SEED_STORED_MODEL);
    assert.equal(await fact('author'), '未記録');
    assert.match(page.url(), /[?&]asset=integrated%3Aaaaaaaaaaaaaaaaaaaaa\.glb/);
    // 再読込しても同じものが選ばれている
    await page.reload();
    await waitCards(page, 5);
    assert.equal(await page.getAttribute(`${CARD}[data-asset-id="integrated:${SEED_STORED_MODEL}"]`, 'aria-selected'), 'true');
    assert.equal(await fact('name'), 'seed-model.glb');
    // ファイルなし
    await page.click(`${CARD}[data-available="false"]`);
    assert.equal(await fact('file'), 'なし（再登録してください）');
    // FBX は保存名の行が無い
    await page.click(`${CARD}[data-asset-id^="fbx:"]`);
    assert.equal(await fact('source'), 'FBX登録（モーション）');
    assert.equal(await page.locator('[data-feature="assetDetail"] [data-key="stored"]').count(), 0);
    // 削除ボタンは置かない
    assert.equal(await page.locator('[data-feature="assetDetail"] button:has-text("削除")').count(), 0);
    await shot(page, 'scr08-detail.jpg');
  });
});

test('import dialog opens from nav query and clears it', async () => {
  await withApp({}, async ({ server, page }) => {
    await page.goto(`${server.base}/workspace/23`);
    await page.waitForSelector('#main');
    let loads = 0;
    page.on('load', () => { loads += 1; });
    await page.click('#main button:has-text("素材を取り込む")');
    await page.waitForSelector('[role="dialog"] [data-role="import-files"]');
    assert.match(await page.textContent('[role="dialog"]'), /素材を取り込む/);
    assert.match(new URL(page.url()).pathname, /\/workspace\/08$/);
    assert.doesNotMatch(page.url(), /import=1/);
    assert.equal(loads, 0, 'no full page reload');
    // 戻る・再読込でダイアログが再び開かない
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForSelector('[data-feature="assetLibrary"]');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
    // 直接 URL で来ても開き、URL から消える
    await page.goto(`${server.base}/workspace/08?import=1`);
    await page.waitForSelector('[role="dialog"] [data-role="import-files"]');
    assert.doesNotMatch(page.url(), /import=1/);
  });
});

test('import GLB and VRM', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    await pickFiles(page, [{ name: 'a.glb', buffer: GLB }]);
    assert.equal(await page.inputValue('[role="dialog"] li[data-name="a.glb"] select[data-role="kind"]'), 'motion', 'GLB defaults to motion');
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'a.glb', /^完了$/);
    const stored = `${sha20(GLB)}.glb`;
    assert.ok(exists(server, `integrated_v02/assets/${stored}`), 'file saved under the temp data dir');
    let idx = readJson(server, 'integrated_v02/user_assets.json');
    assert.equal(idx.length, 1);
    assert.equal(idx[0].name, 'a.glb');
    assert.equal(idx[0].kind, 'motion');
    // 一覧に出て選ばれる
    await waitCards(page, 1);
    assert.equal(await page.getAttribute(`${CARD}[data-asset-id="integrated:${stored}"]`, 'aria-selected'), 'true');
    assert.match(page.url(), /asset=integrated/);
    assert.match(await page.textContent('#toasts'), /登録しました：a\.glb/);
    await shot(page, 'scr08-import-done.jpg');

    // 同じバイト列を b.glb・モデルとして → 再分類の確認
    await pickFiles(page, [{ name: 'b.glb', buffer: GLB }]);
    await setKind(page, 'b.glb', 'model');
    await page.click('[role="dialog"] [data-role="import-go"]');
    await page.waitForSelector('[role="dialog"] [data-role="conflicts"]');
    const text = await page.textContent('[role="dialog"] [data-role="conflicts"]');
    assert.match(text, /同じ内容の素材『a\.glb』（モーション）が登録済みです/);
    assert.match(text, /名前と種類が『b\.glb』（モデル）に置き換わります/);
    assert.equal(await page.locator('[role="dialog"] [data-role="conflict-skip"]').count(), 0, 'only one file: no partial option');
    await page.click('[role="dialog"] [data-role="conflict-all"]');
    await waitRow(page, 'b.glb', /^完了$/);
    idx = readJson(server, 'integrated_v02/user_assets.json');
    assert.equal(idx.length, 1);
    assert.equal(idx[0].name, 'b.glb');
    assert.equal(idx[0].kind, 'model');
    assert.equal(idx[0].filename, stored);

    // 同じ名前・同じ種類の再登録は確認なし
    await pickFiles(page, [{ name: 'b.glb', buffer: GLB }]);
    await setKind(page, 'b.glb', 'model');
    await page.click('[role="dialog"] [data-role="import-go"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-feature="importQueue"] tbody tr[data-name="b.glb"]').length === 2);
    assert.equal(await page.locator('[data-role="conflicts"]').count(), 0);
  });
});

test('same bytes as VRM do not conflict with GLB', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    await pickFiles(page, [{ name: 'a.glb', buffer: GLB }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'a.glb', /^完了$/);
    await pickFiles(page, [{ name: 'c.vrm', buffer: GLB }]);
    assert.equal(await page.locator('[role="dialog"] li[data-name="c.vrm"] select').count(), 0, 'VRM has no kind choice');
    assert.match(await page.textContent('[role="dialog"] li[data-name="c.vrm"]'), /モデル（固定）/);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'c.vrm', /^完了$/);
    assert.equal(await page.locator('[data-role="conflicts"]').count(), 0);
    const idx = readJson(server, 'integrated_v02/user_assets.json');
    assert.deepEqual(idx.map((x) => x.filename).sort(), [`${sha20(GLB)}.glb`, `${sha20(GLB)}.vrm`]);
    assert.equal(idx.find((x) => x.filename.endsWith('.vrm')).kind, 'model');
  });
});

test('multiple files import sequentially', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    const log = [];
    page.on('request', (r) => { if (/\/api\/(integrated-v02\/upload|mmd-upload)/.test(r.url())) log.push({ kind: 'start', url: r.url() }); });
    page.on('requestfinished', (r) => { if (/\/api\/(integrated-v02\/upload|mmd-upload)/.test(r.url())) log.push({ kind: 'end', url: r.url() }); });
    await pickFiles(page, [{ name: 'm.glb', buffer: GLB }, { name: 'dance.vmd', buffer: VMD }]);
    assert.equal(await page.locator('[role="dialog"] li.imp-row').count(), 2);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'm.glb', /^完了$/);
    await waitRow(page, 'dance.vmd', /^完了$/);
    assert.equal(await page.locator(QROW).count(), 2);
    const seq = log.map((e) => `${e.kind}:${e.url.includes('integrated') ? 'glb' : 'vmd'}`);
    assert.deepEqual(seq, ['start:glb', 'end:glb', 'start:vmd', 'end:vmd'], 'one at a time, in order');
    assert.ok(exists(server, 'mmd/vmd/dance.vmd'));
    assert.match(await page.textContent('#toasts'), /2件を登録しました（失敗 0件）/);
  });
});

test('batch with two FBX for the same model slot is rejected', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    await pickFiles(page, [{ name: 'x.fbx', buffer: rand(64) }, { name: 'y.fbx', buffer: rand(64, 9) }]);
    await setKind(page, 'x.fbx', 'modelA');
    await setKind(page, 'y.fbx', 'modelA');
    assert.equal(await page.locator('[role="dialog"] [data-role="batch-error"]').count(), 2);
    assert.match(await page.textContent('[role="dialog"]'), /1回の取り込みで同じ登録先に置けるのは1つです/);
    assert.equal(await page.isDisabled('[role="dialog"] [data-role="import-go"]'), true);
    await setKind(page, 'y.fbx', 'modelB');
    assert.equal(await page.isDisabled('[role="dialog"] [data-role="import-go"]'), false);
    // 種類の選択の横に「置き換え」の説明が常に出る
    assert.match(await page.textContent('[role="dialog"] li[data-name="x.fbx"] [data-role="fbx-hint"]'), /元のファイルが削除されます/);
  });
});

test('import PMX ZIP checks server version first', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    const order = [];
    page.on('request', (r) => { const m = r.url().match(/\/api\/(server-version|pmx-zip-upload)/); if (m) order.push(m[1]); });
    await pickFiles(page, [{ name: 'pack.zip', buffer: ZIP }]);
    assert.equal(await page.inputValue('[role="dialog"] li[data-name="pack.zip"] select[data-role="kind"]'), 'A');
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'pack.zip', /^完了$/);
    assert.ok(order.indexOf('server-version') >= 0 && order.indexOf('server-version') < order.indexOf('pmx-zip-upload'), `order: ${order}`);
    assert.match(await page.textContent('#toasts'), /登録完了：test\.pmx、素材2件/);
    const meta = readJson(server, 'mmd_assets.json');
    assert.ok(meta.A.some((e) => e.name === 'test.pmx'));
    assert.ok(exists(server, 'mmd/A/test.pmx'));
    assert.ok(exists(server, 'mmd/A/tex/a.png'), 'folder structure kept');
    await waitCards(page, 1);
    assert.equal(await page.getAttribute(`${CARD}[data-asset-id="mmd:A:test.pmx"]`, 'aria-selected'), 'true');
    assert.equal(await page.textContent('[data-feature="assetDetail"] [data-key="source"]'), 'MMD スロットA');
  });
});

test('PMX ZIP is blocked when the server is too old', async () => {
  await withApp({}, async ({ server, page }) => {
    await page.route('**/api/server-version', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '0.9.0', features: [] }) }));
    await open08(page, server);
    const uploads = [];
    page.on('request', (r) => { if (/pmx-zip-upload/.test(r.url())) uploads.push(r.url()); });
    await pickFiles(page, [{ name: 'pack.zip', buffer: ZIP }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'pack.zip', /失敗：サーバーが PMX ZIP 登録に対応していません（現在のバージョン：0\.9\.0）。/);
    assert.equal(uploads.length, 0);
  });
});

test('VMD overwrite requires confirmation', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    let posts = 0;
    page.on('request', (r) => { if (/\/api\/mmd-upload/.test(r.url())) posts += 1; });
    await pickFiles(page, [{ name: 'dance.vmd', buffer: VMD }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'dance.vmd', /^完了$/);
    assert.equal(posts, 1);
    // 2回目：確認が出る → キャンセルなら送られない
    await pickFiles(page, [{ name: 'dance.vmd', buffer: VMD }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await page.waitForSelector('[role="dialog"] [data-role="conflicts"]');
    assert.match(await page.textContent('[role="dialog"]'), /同じ名前の VMD『dance\.vmd』があります。上書きすると元の内容は戻せません。/);
    await page.click('[role="dialog"] [data-role="conflict-cancel"]');
    await page.waitForTimeout(300);
    assert.equal(posts, 1, 'cancel sends nothing');
    assert.equal(await page.locator(QROW).count(), 1);
    // 続けるなら送られる
    await pickFiles(page, [{ name: 'dance.vmd', buffer: VMD }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await page.click('[role="dialog"] [data-role="conflict-all"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-feature="importQueue"] tbody tr[data-name="dance.vmd"]').length === 2);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-feature="importQueue"] tbody tr [data-role="status"]')].every((e) => /^完了$/.test(e.textContent || '')));
    assert.equal(posts, 2);
  });
});

test('continue without the conflicting files sends only the others', async () => {
  await withApp(seedLibrary(), async ({ server, page }) => {
    await open08(page, server);
    await waitCards(page, 5);
    const posts = [];
    page.on('request', (r) => { if (/\/api\/mmd-upload/.test(r.url())) posts.push(decodeURIComponent(r.url().split('name=')[1])); });
    await pickFiles(page, [{ name: 'seed.vmd', buffer: VMD }, { name: 'fresh.vmd', buffer: VMD }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await page.waitForSelector('[role="dialog"] [data-role="conflicts"]');
    assert.match(await page.textContent('[role="dialog"] [data-role="conflicts"]'), /seed\.vmd/);
    assert.doesNotMatch(await page.textContent('[role="dialog"] [data-role="conflicts"]'), /fresh\.vmd/);
    await page.click('[role="dialog"] [data-role="conflict-skip"]');
    await waitRow(page, 'fresh.vmd', /^完了$/);
    assert.match(await rowStatus(page, 'seed.vmd'), /スキップ（確認で除外）/);
    assert.deepEqual(posts, ['fresh.vmd']);
  });
});

// Opus レビュー：確認はダイアログの時点の一覧で行うので、送る直前にも最新の一覧で求め直す（了承していない上書き・再分類を送らない）。
test('same bytes twice in one import: the second is stopped before sending, and retry asks first', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    let posts = 0;
    page.on('request', (r) => { if (/\/api\/integrated-v02\/upload/.test(r.url())) posts += 1; });
    await pickFiles(page, [{ name: 'a.glb', buffer: GLB }, { name: 'b.glb', buffer: GLB }]);
    await setKind(page, 'b.glb', 'model');
    await page.click('[role="dialog"] [data-role="import-go"]');
    // どちらもまだ登録されていないので、ダイアログの時点では確認が出ない
    await waitRow(page, 'a.glb', /^完了$/);
    await waitRow(page, 'b.glb', /失敗：確認の後に登録済みの素材が変わったため、送りませんでした：同じ内容の素材『a\.glb』（モーション）が登録済みです/);
    assert.equal(posts, 1, 'the second file is not sent');
    let idx = readJson(server, 'integrated_v02/user_assets.json');
    assert.deepEqual(idx.map((x) => [x.name, x.kind]), [['a.glb', 'motion']], 'a.glb is not silently reclassified');
    // ［もう一度］では確認が出て、了承すれば送られる
    await page.click(`${QROW}[data-name="b.glb"] [data-role="row-retry"]`);
    await page.waitForSelector('[role="dialog"] [data-role="conflicts"]');
    assert.match(await page.textContent('[role="dialog"] [data-role="conflicts"]'), /名前と種類が『b\.glb』（モデル）に置き換わります/);
    await page.click('[role="dialog"] [data-role="conflict-all"]');
    await waitRow(page, 'b.glb', /^完了$/);
    assert.equal(posts, 2);
    idx = readJson(server, 'integrated_v02/user_assets.json');
    assert.deepEqual(idx.map((x) => [x.name, x.kind]), [['b.glb', 'model']]);
  });
});

test('a file queued behind the same name is rechecked when its turn comes', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    const posts = [];
    const held = [];
    await page.route('**/api/mmd-upload**', (r) => { posts.push(r.request().url()); if (posts.length === 1) held.push(r); else r.continue(); });
    await pickFiles(page, [{ name: 'dance.vmd', buffer: VMD }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'dance.vmd', /送信中|サーバーで処理中/);
    // 1件目の送信中に、同じ名前をもう一度選ぶ（まだ一覧に無いので、ダイアログの時点では確認が出ない）
    await pickFiles(page, [{ name: 'dance.vmd', buffer: rand(VMD.length, 3) }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-feature="importQueue"] tbody tr[data-name="dance.vmd"]').length === 2);
    assert.equal(await page.locator('[data-role="conflicts"]').count(), 0);
    await held[0].continue();
    await page.waitForFunction(() => {
      const s = [...document.querySelectorAll('[data-feature="importQueue"] tbody tr[data-name="dance.vmd"] [data-role="status"]')].map((e) => e.textContent || '');
      return s.length === 2 && s.some((t) => /^完了$/.test(t)) && s.some((t) => /失敗：確認の後に登録済みの素材が変わったため、送りませんでした：同じ名前の VMD『dance\.vmd』があります/.test(t));
    }, null, { timeout: 10000 });
    assert.equal(posts.length, 1, 'the second file is not sent');
    assert.deepEqual(fs.readFileSync(path.join(server.dataDir, 'mmd/vmd/dance.vmd')), VMD, 'the first upload is kept');
    await page.unroute('**/api/mmd-upload**');
  });
});

test('FBX same-name overwrite requires confirmation', async () => {
  await withApp(seedLibrary(), async ({ server, page }) => {
    await open08(page, server);
    await waitCards(page, 5);
    let posts = 0;
    page.on('request', (r) => { if (/\/api\/upload\?/.test(r.url())) posts += 1; });
    // 中身はランダム（解析より前に確認が出るので、正しい FBX は要らない）
    await pickFiles(page, [{ name: 'walk.fbx', buffer: rand(128) }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await page.waitForSelector('[role="dialog"] [data-role="conflicts"]');
    assert.match(await page.textContent('[role="dialog"] [data-role="conflicts"]'), /同じ名前の FBX『walk\.fbx』（モーション）があります。上書きすると元の内容は戻せません。/);
    await page.click('[role="dialog"] [data-role="conflict-cancel"]');
    await page.waitForTimeout(300);
    assert.equal(posts, 0);
    assert.equal(await page.locator(QROW).count(), 0);
  });
});

test('FBX model replacement warns before parsing', async () => {
  const oldId = fbxId('modelA', 'oldmodel.fbx');
  const seed = seedLibrary({
    'manifest.json': JSON.stringify({ files: [{ id: oldId, name: 'oldmodel.fbx', kind: 'modelA', size: 100 }], mapping: {} }),
    [`files/${oldId}.fbx`]: rand(100),
  });
  await withApp(seed, async ({ server, page }) => {
    await open08(page, server);
    await page.waitForSelector(`${CARD}[data-asset-id="fbx:${oldId}"]`);
    let posts = 0;
    page.on('request', (r) => { if (/\/api\/upload\?/.test(r.url())) posts += 1; });
    await pickFiles(page, [{ name: 'newmodel.fbx', buffer: rand(128) }]);
    await setKind(page, 'newmodel.fbx', 'modelA');
    await page.click('[role="dialog"] [data-role="import-go"]');
    await page.waitForSelector('[role="dialog"] [data-role="conflicts"]');
    const text = await page.textContent('[role="dialog"] [data-role="conflicts"]');
    assert.match(text, /oldmodel\.fbx/);
    assert.match(text, /元のファイルが削除されます/);
    await page.click('[role="dialog"] [data-role="conflict-cancel"]');
    await page.waitForTimeout(300);
    assert.equal(posts, 0);
    assert.ok(exists(server, `files/${oldId}.fbx`), 'the old file is still there');
  });
});

test('FBX is validated before upload', skip3dOpts(), async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    let posts = 0;
    page.on('request', (r) => { if (/\/api\/upload\?/.test(r.url())) posts += 1; });
    await pickFiles(page, [{ name: 'bad.fbx', buffer: rand(256) }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'bad.fbx', /失敗：FBX として読み込めません/, 15000);
    assert.equal(posts, 0);
    assert.equal(fs.readdirSync(path.join(server.dataDir, 'files')).length, 0);
  });
});

function skip3dOpts() { return harness.skip3d(); }

test('import FBX motion succeeds', skip3dOpts(), async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    await pickFiles(page, [{ name: 'dance.fbx', buffer: FBX_MOTION }]);
    assert.equal(await page.inputValue('[role="dialog"] li[data-name="dance.fbx"] select[data-role="kind"]'), 'motions');
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'dance.fbx', /^完了$/, 15000);
    const id = fbxId('motions', 'dance.fbx');
    assert.ok(exists(server, `files/${id}.fbx`));
    assert.equal(readJson(server, 'manifest.json').files[0].kind, 'motions');
    await waitCards(page, 1);
    assert.equal(await page.getAttribute(`${CARD}[data-asset-id="fbx:${id}"]`, 'aria-selected'), 'true');
    assert.equal(await page.textContent('[data-feature="assetDetail"] [data-key="category"]'), 'モーション');
  });
});

test('import FBX model replaces the old model after confirmation', skip3dOpts(), async () => {
  const oldId = fbxId('modelA', 'oldmodel.fbx');
  const seed = {
    'manifest.json': JSON.stringify({ files: [{ id: oldId, name: 'oldmodel.fbx', kind: 'modelA', size: 100 }], mapping: {} }),
    [`files/${oldId}.fbx`]: rand(100),
  };
  await withApp(seed, async ({ server, page }) => {
    await open08(page, server);
    await waitCards(page, 1);
    await pickFiles(page, [{ name: 'newmodel.fbx', buffer: FBX_MODEL }]);
    await setKind(page, 'newmodel.fbx', 'modelA');
    await page.click('[role="dialog"] [data-role="import-go"]');
    await page.click('[role="dialog"] [data-role="conflict-all"]');
    await waitRow(page, 'newmodel.fbx', /^完了$/, 15000);
    const newId = fbxId('modelA', 'newmodel.fbx');
    assert.ok(exists(server, `files/${newId}.fbx`));
    assert.equal(exists(server, `files/${oldId}.fbx`), false, 'the replaced model file is deleted by the server');
    await page.waitForFunction((n) => document.querySelectorAll('[data-feature="assetLibrary"] .asset').length === n, 1);
    assert.equal(await page.locator(`${CARD}[data-asset-id="fbx:${oldId}"]`).count(), 0);
    assert.equal(await page.getAttribute(`${CARD}[data-asset-id="fbx:${newId}"]`, 'aria-selected'), 'true');
  });
});

test('FBX without animation is refused as a motion', skip3dOpts(), async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    let posts = 0;
    page.on('request', (r) => { if (/\/api\/upload\?/.test(r.url())) posts += 1; });
    await pickFiles(page, [{ name: 'still.fbx', buffer: FBX_MODEL }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'still.fbx', /失敗：still\.fbx にアニメーションがありません/, 15000);
    assert.equal(posts, 0);
  });
});

test('server rejection is shown, and retry works', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    let reject = true;
    await page.route('**/api/integrated-v02/upload**', (r) => {
      if (reject) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'GLB/VRM形式として認識できません' }) });
      return r.continue();
    });
    await pickFiles(page, [{ name: 'a.glb', buffer: GLB }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'a.glb', /失敗：受け付けられませんでした：GLB\/VRM形式として認識できません/);
    assert.equal(await page.locator(`${QROW} [data-role="row-retry"]`).count(), 1);
    reject = false;
    await page.click(`${QROW} [data-role="row-retry"]`);
    await waitRow(page, 'a.glb', /^完了$/);
    assert.ok(exists(server, `integrated_v02/assets/${sha20(GLB)}.glb`));
    // 一覧から消しても、サーバーのファイルは消えない
    await page.click(`${QROW} [data-role="row-remove"]`);
    assert.equal(await page.locator(QROW).count(), 0);
    assert.ok(exists(server, `integrated_v02/assets/${sha20(GLB)}.glb`));
  }, { errors: [/400|Bad Request/] });
});

test('PMX ZIP rejection from the server is shown as is', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    // PMX が入っていない ZIP（空に近い）→ サーバーが 400「PMX ZIP rejected: …」
    const emptyZip = Buffer.from('504b0506' + '00'.repeat(18), 'hex');
    await pickFiles(page, [{ name: 'empty.zip', buffer: emptyZip }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'empty.zip', /失敗：受け付けられませんでした：PMX ZIP rejected:/);
  }, { errors: [/400|Bad Request/] });
});

test('queue can cancel a waiting row and an uploading row', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    const held = [];
    await page.route('**/api/mmd-upload**', (r) => { held.push(r); });
    await pickFiles(page, [{ name: 'first.vmd', buffer: VMD }, { name: 'second.vmd', buffer: VMD }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'first.vmd', /送信中|サーバーで処理中/);
    assert.match(await rowStatus(page, 'second.vmd'), /待機中/);
    await page.click(`${QROW}[data-name="second.vmd"] [data-role="row-cancel"]`);
    assert.match(await rowStatus(page, 'second.vmd'), /取り消し/);
    assert.match(await rowStatus(page, 'first.vmd'), /送信中 0%/, 'held at the start of the upload');
    await page.click(`${QROW}[data-name="first.vmd"] [data-role="row-cancel"]`);
    await waitRow(page, 'first.vmd', /取り消し/);
    await page.unroute('**/api/mmd-upload**');
  });
});

test('home shows only assets imported in this page', async () => {
  await withApp(seedLibrary(), async ({ server, page }) => {
    // 登録済みの素材が5件あっても、このページで取り込むまでは空表示
    await page.goto(`${server.base}/workspace/01`);
    await page.waitForSelector('[data-feature="recentImports"]');
    assert.match(await page.textContent('[data-feature="recentImports"]'), /このページではまだ素材を取り込んでいません。/);
    assert.equal(await page.locator('[data-feature="recentImports"] .media-card').count(), 0);
    // クライアント側の移動で素材管理へ（ストアを保つ）
    await page.click('#nav a[data-route="08"]');
    await waitCards(page, 5);
    await pickFiles(page, [{ name: 'fresh.vmd', buffer: VMD }]);
    await page.click('[role="dialog"] [data-role="import-go"]');
    await waitRow(page, 'fresh.vmd', /^完了$/);
    await page.click('#nav a[data-route="01"]');
    await page.waitForSelector('[data-feature="recentImports"] .media-card');
    assert.equal(await page.locator('[data-feature="recentImports"] .media-card').count(), 1);
    assert.match(await page.textContent('[data-feature="recentImports"]'), /fresh\.vmd/);
    assert.doesNotMatch(await page.textContent('[data-feature="recentImports"]'), /seed\.vmd/);
    await shot(page, 'scr01-recent.jpg');
    // 押すと素材管理で開く
    await page.click('[data-feature="recentImports"] .media-card');
    await page.waitForSelector('[data-feature="assetLibrary"]');
    assert.match(page.url(), /asset=mmd%3Avmd%3Afresh\.vmd/);
  });
});

test('mock-only controls explain themselves', async () => {
  await withApp(seedLibrary(), async ({ server, page }) => {
    await open08(page, server);
    await waitCards(page, 5);
    const dialog = async (re) => {
      await page.waitForSelector('[role="dialog"]');
      assert.match(await page.textContent('[role="dialog"]'), re);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    };
    await page.click(`${CARD} .fav >> nth=0`);
    await dialog(/NF-004/);
    await page.click('[data-feature="assetCategories"] li:has-text("桜コレクション")');
    await dialog(/NF-004/);
    await page.click('[data-feature="assetCategories"] li:has-text("お気に入り")');
    await dialog(/NF-004/);
    await page.click('[data-feature="assetLibrary"] [data-source="cloud"]');
    await dialog(/NF-013/);
    await page.click('[data-feature="assetLibrary"] [data-source="local"]');
    await dialog(/NF-004/);
    await page.click('[data-feature="assetLibrary"] button:has-text("一括タグ付け")');
    await dialog(/NF-004/);
    await page.click(`${CARD} >> nth=0`);
    await page.click('[data-feature="assetDetail"] button:has-text("タグを追加")');
    await dialog(/NF-004/);
    await page.click('[data-feature="assetDetail"] button:has-text("シーンで使う")');
    await dialog(/NF-014/);
    await page.click('.screen-head button:has-text("一括インポート")');
    await dialog(/複数ファイルの取り込みは［素材を取り込む…］でできます/);
    // nothing was saved on the server
    assert.equal(fs.existsSync(path.join(server.dataDir, 'favorites.json')), false);
    // 並び替えはツールにない（中央のバーだけ）
    assert.equal(await page.locator('.screen-head select').count(), 0);
  });
});

test('sample assets are gone from SCR-08 and SCR-23 links to the dialog', async () => {
  await withApp({}, async ({ server, page }) => {
    await open08(page, server);
    await page.waitForSelector('[data-role="empty-all"]');
    assert.match(await page.textContent('[data-role="empty-all"]'), /まだ素材がありません。/);
    await page.click('[data-role="empty-all"] button');
    await page.waitForSelector('[role="dialog"] [data-role="import-files"]');
    await page.keyboard.press('Escape');
    const text = await page.textContent('#main');
    for (const sample of ['夜の神社', '桜の参道', '和風小物セット', 'サンプル素材']) assert.doesNotMatch(text, new RegExp(sample));
    assert.equal(await page.locator('#main img[src*="/studio/assets/samples/"]').count(), 0);
    await shot(page, 'scr08-empty.jpg');
  });
});

test('offline shows 未接続 with a retry', async () => {
  await withApp({}, async ({ server, page }) => {
    await page.route('**/api/assets', (r) => r.abort());
    await page.goto(`${server.base}/workspace/08`);
    await page.waitForSelector('[data-feature="assetLibrary"] .state-box[data-kind="offline"]');
    assert.match(await page.textContent('[data-feature="assetLibrary"] .state-box'), /未接続/);
    await page.unroute('**/api/assets');
    await page.click('[data-feature="assetLibrary"] .state-box button');
    await page.waitForSelector('[data-role="empty-all"]');
  }, { errors: [/ERR_FAILED|Failed to load resource/] });
});
