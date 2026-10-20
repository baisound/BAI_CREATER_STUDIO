'use strict';
// 共通ハーネス（tests/helpers/studio-harness.cjs）自身のテスト（P2-WP-00a-2）。
// 一時ディレクトリの後始末、隔離の外へ書く API の遮断、エラー監視、three の skip を確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.HARNESS_TEST_PORT || 8785);

test('一時データで起動し、stop() でサーバーを止めて一時ディレクトリを消す（ログを開いたままでも）', async () => {
  const server = await harness.startServer({ port: PORT, seed: { 'sub/a.txt': 'hello', 'bin.dat': Buffer.from([1, 2, 3]) } });
  const dir = server.dataDir;
  assert.ok(dir.startsWith(os.tmpdir()) && path.basename(dir).startsWith('bai-p2-'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'integrated_v02', 'catalog.json'), 'utf8')), { models: [], motions: [] });
  assert.equal(fs.readFileSync(path.join(dir, 'sub', 'a.txt'), 'utf8'), 'hello');
  assert.deepEqual([...fs.readFileSync(path.join(dir, 'bin.dat'))], [1, 2, 3]);
  // サーバーが一時ディレクトリのログを開いている
  assert.ok(fs.existsSync(path.join(dir, 'logs', 'server.jsonl')), 'ログは一時ディレクトリに作られる');
  await server.stop();
  assert.equal(fs.existsSync(dir), false, '一時ディレクトリが残っている');
  await assert.rejects(fetch(`${server.base}/api/server-version`), 'サーバーが止まっていない');
  await server.stop(); // 2回呼んでも安全
});

test('起動に失敗しても一時ディレクトリを残さない / 使用中のポートは中止する', async () => {
  const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('bai-p2-')).length;
  const server = await harness.startServer({ port: PORT });
  try {
    await assert.rejects(harness.startServer({ port: PORT }), /既に使われています/);
    await assert.rejects(harness.startServer({ port: PORT + 100, seed: { '../escape.txt': 'x' } }), /dataDir の外/);
  } finally { await server.stop(); }
  const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('bai-p2-')).length;
  assert.equal(after, before, 'bai-p2-* が残っている');
});

test('KEEP_TEST_DATA=1 なら残す', async () => {
  process.env.KEEP_TEST_DATA = '1';
  let dir;
  try {
    const server = await harness.startServer({ port: PORT });
    dir = server.dataDir;
    await server.stop();
    assert.ok(fs.existsSync(dir));
  } finally { delete process.env.KEEP_TEST_DATA; if (dir) assert.ok(harness.removeDir(dir)); }
});

test('削除できないときは removeDir が false を返す（呼び出し側が警告を出す）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bai-p2-stuck-'));
  const original = fs.rmSync;
  fs.rmSync = () => {};
  try { assert.equal(harness.removeDir(dir), false); } finally { fs.rmSync = original; }
  assert.equal(harness.removeDir(dir), true);
  assert.equal(fs.existsSync(dir), false);
});

test('隔離の外へ書く API への要求は遮断して失敗にする / expectErrors で許可したエラーは通す', async () => {
  const server = await harness.startServer({ port: PORT });
  const browser = await server.launchBrowser();
  try {
    const exportsDir = path.join(harness.root, 'exports');
    const existed = fs.existsSync(exportsDir);
    const page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/01`);
    await page.evaluate((b) => fetch(`${b}/api/export-vmd-job`, { method: 'POST', body: '{}' }).catch(() => 'blocked'), server.base);
    assert.throws(() => harness.assertNoErrors(page), /遮断しました.*export-vmd-job/);
    assert.equal(fs.existsSync(exportsDir), existed, 'exports/ に触れた');

    // テストが route で受け止めた要求は遮断されない
    const stubbed = await server.newPage(browser, { expectErrors: [/503/] });
    await stubbed.route(/\/api\/run-vmd-conversion/, (r) => r.fulfill({ status: 503, body: '{"error":"no blender"}' }));
    await stubbed.goto(`${server.base}/workspace/01`);
    const status = await stubbed.evaluate((b) => fetch(`${b}/api/run-vmd-conversion`, { method: 'POST', body: '{}' }).then((r) => r.status), server.base);
    assert.equal(status, 503);
    harness.assertNoErrors(stubbed);

    // 404 のコンソールエラー：許可が無ければ失敗、許可すれば通る
    const strict = await server.newPage(browser);
    const lenient = await server.newPage(browser);
    harness.expectErrors(lenient, [/404/]);
    for (const p of [strict, lenient]) {
      await p.goto(`${server.base}/workspace/01`);
      await p.evaluate((b) => { const i = new Image(); i.src = `${b}/no-such-file.png`; return new Promise((r) => { i.onerror = r; i.onload = r; }); }, server.base);
    }
    assert.throws(() => harness.assertNoErrors(strict), /404/);
    harness.assertNoErrors(lenient);
  } finally { await browser.close(); await server.stop(); }
});

test('three が無いとき skip3d は理由付きの skip になる', () => {
  const saved = process.env.THREE_DIR;
  process.env.THREE_DIR = path.join(os.tmpdir(), 'no-such-three-dir');
  try {
    assert.equal(harness.haveThree(), false);
    assert.deepEqual(harness.skip3d(), { skip: 'three.js がローカルにありません（npm ci）' });
  } finally { if (saved === undefined) delete process.env.THREE_DIR; else process.env.THREE_DIR = saved; }
});
