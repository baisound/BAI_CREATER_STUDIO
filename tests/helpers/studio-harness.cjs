'use strict';
// 共通テストハーネス（P2-WP-00a-2、設計 P2 §4.1 / §1.14）。
// - 一時データディレクトリ（BAI_DATA_DIR）でサーバーを別プロセス起動し、実 data/ に触れない。
// - Chromium（SwiftShader）の起動、three.js の CDN 振替、エラー監視、隔離の外へ書く API の遮断。
// - 後始末：サーバーを止めてから一時ディレクトリを必ず消す。消せなければ警告を出す。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

// ---- 一時ディレクトリの後始末（失敗しても警告を出し、プロセス終了時にもう一度試す） ----
const liveDirs = new Set();
function removeDir(dir) {
  for (let i = 0; i < 6; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 下で存在を確かめる */ }
    if (!fs.existsSync(dir)) return true;
    // Windows ではプロセス終了直後にファイルが解放されるまで少し待つ
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * (i + 1));
  }
  return false;
}
function cleanupAll() {
  for (const dir of [...liveDirs]) {
    if (removeDir(dir)) liveDirs.delete(dir);
    else console.warn(`[harness] 警告: 一時ディレクトリを削除できませんでした。手で消してください: ${dir}`);
  }
}
const liveChildren = new Set();
process.on('exit', () => { for (const c of liveChildren) { try { c.kill(); } catch { /* 既に終了 */ } } cleanupAll(); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanupAll(); process.exit(1); });

// ---- three.js ----
function threeDir() { return process.env.THREE_DIR || path.join(root, 'node_modules', 'three'); }
function haveThree() { return fs.existsSync(path.join(threeDir(), 'build', 'three.module.js')); }
const THREE_SKIP_REASON = 'three.js がローカルにありません（npm ci）';
/** 3D を使うテストの skip オプション：`test('…', skip3d(), fn)`。skip でなければ false を返す。 */
function skip3d() { return haveThree() ? {} : { skip: THREE_SKIP_REASON }; }
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
async function routeThree(target) {
  if (!haveThree()) return;
  await target.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.1\/(.*)/, (route) => {
    const rel = route.request().url().match(/three@0\.160\.1\/([^?#]*)/)[1];
    const f = path.join(threeDir(), rel);
    if (!f.startsWith(threeDir()) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({
      status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream',
      body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*' },
    });
  });
}

// ---- Chromium ----
function chromiumPath() {
  const fallback = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return process.env.CHROMIUM_PATH || process.env.CHROMIUM || (fs.existsSync(fallback) ? fallback : undefined);
}
const CHROMIUM_ARGS = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'];
async function launchBrowser() {
  const { chromium } = require('playwright');
  return chromium.launch({ executablePath: chromiumPath(), args: CHROMIUM_ARGS });
}
/** WEBGL_debug_renderer_info の文字列。SwiftShader/llvmpipe なら gpu 未検証。 */
async function webglRenderer(page) {
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  return { renderer, gpuVerified: !!renderer && !/swiftshader|llvmpipe|software/i.test(renderer) };
}

// ---- エラー監視 ----
const GUARDED_POSTS = /\/api\/(export-vmd-job|run-vmd-conversion)(\?|$)/; // 隔離の外（BASE/exports/）へ書く API（C1）
/** page に許可するエラーを登録する（正規表現の配列）。 */
function expectErrors(page, patterns) {
  page.__monitor.allowed.push(...patterns);
}
/** テストの最後に呼ぶ。許可されていないエラーと、遮断した要求が0件であることを確かめる。 */
function assertNoErrors(page) {
  const m = page.__monitor;
  const bad = m.errors.filter((e) => !m.allowed.some((re) => re.test(e)));
  const problems = [...bad, ...m.blocked.map((u) => `隔離の外へ書く API への要求を遮断しました: ${u}`)];
  if (problems.length) throw new Error(`ブラウザーのエラー ${problems.length} 件:\n${problems.join('\n')}`);
}

// ---- ポートの排他（並列実行の衝突防止） ----
// run-guarded は node --test を並列（既定2）で動かす。別のテストファイルが同じ番号のポートを
// 同時に使うと、後から来た側が「既に使われています」で失敗するか、起動に失敗した直後に相手の
// サーバーへ繋がってしまう。ポートごとのロックファイルを OS の一時フォルダに作り、持ち主の
// テストが stop() するまで待つ（実データを使う開発サーバーの検出は従来どおり、ロック取得後に行う）。
const heldLocks = new Set();
function lockPath(port) { return path.join(os.tmpdir(), `bai-studio-harness-port-${port}.lock`); }
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
async function acquirePortLock(port, timeoutMs = Number(process.env.BAI_TEST_PORT_WAIT_MS || 900000)) {
  const file = lockPath(port);
  const start = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      heldLocks.add(file);
      return () => { if (heldLocks.delete(file)) { try { fs.unlinkSync(file); } catch { /* 既に無い */ } } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    let owner = NaN;
    try { owner = Number(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (owner === process.pid && heldLocks.has(file)) throw new Error(`ポート ${port} は既に使われています（同じテストファイルの別のサーバー）`);
    if (!pidAlive(owner)) { try { fs.unlinkSync(file); } catch { /* 他が先に消した */ } continue; }
    if (Date.now() - start > timeoutMs) throw new Error(`ポート ${port} のロックを ${timeoutMs}ms 待っても取得できません（持ち主 pid ${owner}）`);
    await new Promise((r) => setTimeout(r, 250));
  }
}
function releaseAllLocks() { for (const file of [...heldLocks]) { heldLocks.delete(file); try { fs.unlinkSync(file); } catch { /* 既に無い */ } } }
process.on('exit', releaseAllLocks);

// ---- サーバー ----
async function waitForServer(base, child, exited, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (exited.done) throw new Error(`サーバーが起動前に終了しました (code ${exited.code})\n${exited.stderr()}`);
    try { const r = await fetch(`${base}/api/server-version`); if (r.ok) return; } catch { /* まだ */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`サーバーが ${timeoutMs}ms 以内に起動しませんでした\n${exited.stderr()}`);
}

async function startServer({ port, seed = {} } = {}) {
  if (!port) throw new Error('startServer: port が必要です');
  const base = `http://127.0.0.1:${port}`;
  const releaseLock = await acquirePortLock(port);
  // 他のサーバー（実 data/ を使うもの）に繋がらないよう、使用中なら止める
  try {
    await fetch(`${base}/api/server-version`);
    releaseLock();
    throw new Error(`ポート ${port} は既に使われています。別のサーバーが応答しており、実データに書き込む恐れがあるため中止します`);
  } catch (e) { if (/既に使われて/.test(e.message)) throw e; }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bai-p2-'));
  liveDirs.add(dataDir);
  let child;
  const exited = { done: false, code: null, chunks: [], stderr() { return Buffer.concat(this.chunks).toString('utf8').slice(-2000); } };
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    if (child && !exited.done) {
      const gone = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
      if (!exited.done) child.kill('SIGKILL');
    }
    releaseLock();
    if (process.env.KEEP_TEST_DATA === '1') {
      liveDirs.delete(dataDir);
      console.log(`[harness] KEEP_TEST_DATA=1: 一時データを残しました: ${dataDir}`);
      return;
    }
    if (removeDir(dataDir)) liveDirs.delete(dataDir);
    else console.warn(`[harness] 警告: 一時ディレクトリを削除できませんでした。手で消してください: ${dataDir}`);
  }
  async function launch() {
    exited.done = false; exited.code = null; exited.chunks = [];
    child = spawn(python, ['server.py', String(port)], {
      cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, BAI_DATA_DIR: dataDir },
    });
    child.stderr.on('data', (d) => exited.chunks.push(d));
    liveChildren.add(child);
    child.on('exit', (code) => { exited.done = true; exited.code = code; liveChildren.delete(child); });
    child.on('error', (e) => { exited.done = true; exited.chunks.push(Buffer.from(String(e))); });
    await waitForServer(base, child, exited);
  }
  async function crash() {
    if (!child || exited.done) return;
    const gone = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGKILL');
    await gone;
  }
  async function restart() {
    if (!exited.done) throw new Error('Crash the owned test server before restarting');
    await launch();
  }
  try {
    fs.mkdirSync(path.join(dataDir, 'integrated_v02'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'integrated_v02', 'catalog.json'), JSON.stringify({ models: [], motions: [] }));
    for (const [rel, content] of Object.entries(seed)) {
      const f = path.join(dataDir, rel);
      if (!path.resolve(f).startsWith(path.resolve(dataDir) + path.sep)) throw new Error(`seed のパスが dataDir の外です: ${rel}`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, content);
    }
    await launch();
  } catch (e) {
    await stop();
    throw e;
  }

  async function newPage(browser, { expectErrors: allowed = [], viewport = { width: 1440, height: 900 }, ...ctxOpts } = {}) {
    const context = await browser.newContext({ viewport, ...ctxOpts });
    const monitor = { errors: [], allowed: [...allowed], blocked: [] };
    // 最初に登録する＝最後の受け手（page.route とテストの context.route が先に処理する）
    await context.route(GUARDED_POSTS, (route) => { monitor.blocked.push(route.request().url()); route.abort(); });
    await routeThree(context);
    const page = await context.newPage();
    page.__monitor = monitor;
    page.on('pageerror', (e) => monitor.errors.push(`${page.url()} ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') monitor.errors.push(`${page.url()} console: ${m.text()}`); });
    return page;
  }

  return { base, dataDir, stop, crash, restart, launchBrowser, newPage };
}

module.exports = {
  startServer, expectErrors, assertNoErrors, launchBrowser, webglRenderer, chromiumPath, routeThree,
  haveThree, threeDir, skip3d, THREE_SKIP_REASON, GUARDED_POSTS, removeDir, root, python,
};
