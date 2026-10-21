'use strict';
// 旧画面の保存の回帰テスト（P2-WP-00b。設計 P2 §2.2(g)）。
// 隔離ハーネス（BAI_DATA_DIR の一時データ）でサーバーを起動する。実 data/ は読み書きしない。
// - B-1/B-2：旧 index.html の［保存］が成功し、外部の変更を取り込んだ後でも続けて成功する。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.P2_LEGACY_PORT || 8790);
const exe = harness.chromiumPath();
const chromiumSkip = exe && !fs.existsSync(exe) ? { skip: 'chromium not available' } : {};

test('legacy index.html: save works, and again after an external sync (B-1, B-2)', { ...harness.skip3d(), ...chromiumSkip }, async () => {
  const server = await harness.startServer({ port: PORT });
  let browser;
  try {
    browser = await server.launchBrowser();
    const page = await server.newPage(browser);
    const failures = [];
    // 旧画面は失敗を alert で出す。出たらテストを失敗にする（C9 の前提）。
    page.on('dialog', (d) => { failures.push(d.message()); d.dismiss(); });
    await page.goto(`${server.base}/index.html`);
    await page.waitForFunction(() => /件の履歴/.test(document.getElementById('project-info')?.textContent || ''), null, { timeout: 15000 });
    // #project-info の表示の履歴を残す。旧画面は自分の保存でも /api/sync の版が進む（server.py の sync_bump）ため、
    // 次の同期の確認（約1.2秒ごと）で「MCPから更新を同期しました」に書き換わる。「保存済み」は数十ミリ秒で消えることがあるので、
    // 今の表示ではなく、表示の履歴に出たかを確かめる（今の表示を待つと、取りこぼして時間切れになることがあった）。
    await page.evaluate(() => {
      const el = document.getElementById('project-info');
      window.__projectInfoLog = [];
      new MutationObserver(() => window.__projectInfoLog.push(el.textContent || '')).observe(el, { childList: true, characterData: true, subtree: true });
    });
    const shownSince = (start, re) => page.waitForFunction(({ from, src }) => window.__projectInfoLog.slice(from).some((t) => new RegExp(src).test(t)), { from: start, src: re.source }, { timeout: 10000 });
    const logLength = () => page.evaluate(() => window.__projectInfoLog.length);
    const saveOnce = async () => {
      const from = await logLength();
      const posted = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/project', { timeout: 10000 });
      const alerted = page.waitForEvent('dialog', { timeout: 10000 }).then((d) => d.message(), () => null);
      await page.click('#project-save');
      // 旧画面は送る前に失敗すると alert を出す（B-2 が壊れると「保存元の版を取得できません」）。POST の応答か alert の早い方を見る。
      const first = await Promise.race([posted.then((r) => ({ status: r.status() })), alerted.then((m) => (m === null ? new Promise(() => {}) : { alert: m }))]);
      assert.equal(first.alert, undefined, `旧画面が alert を出しました: ${first.alert}`);
      assert.equal(first.status, 200, '保存の POST が成功する');
      await shownSince(from, /保存済み/);
    };

    await saveOnce();

    // 外部（MCP 相当）からの更新。同期の基準（/api/sync の revision）が取れてから送る。
    await page.waitForResponse((r) => r.url().includes('/api/sync') && r.ok());
    // C9：版の取り直し（B-2）の応答を待つ。外部の内容を返した取り直しだけを数える（自分の保存の反映と区別する）。登録は送信の前に行う。
    const refetched = page.waitForResponse(async (r) => {
      if (!r.url().includes('/api/project?envelope=1') || !r.ok()) return false;
      try { return (await r.json()).project?.timeline?.[0]?.name === 'external-step'; } catch { return false; }
    }, { timeout: 15000 });
    const external = { schema: 1, timeline: [{ name: 'external-step' }], history: [{ label: 'external', at: new Date().toISOString(), timeline: [{ name: 'external-step' }], selected: 1, playbackSpeed: 1 }], cursor: 0, playbackSpeed: 1 };
    const res = await fetch(`${server.base}/api/project`, { method: 'POST', body: JSON.stringify(external) });
    assert.equal(res.status, 200);
    // 外部の内容が画面に取り込まれた（「MCPから更新を同期しました」の文言は自分の保存の反映でも出るので、中身で確かめる）
    await page.waitForFunction(() => /external-step/.test(document.getElementById('chain-list')?.textContent || ''), null, { timeout: 15000 });
    await refetched.catch((e) => { throw new Error(`B-2：外部同期の後に版（/api/project?envelope=1）を取り直していません（${e.message}）`); });
    // 応答が返った後の .then(...) でクライアントの版が更新されるまで、マイクロタスクを1回回す
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));

    await saveOnce();
    assert.deepEqual(failures, [], `旧画面が alert を出しました: ${failures.join(' / ')}`);
    harness.assertNoErrors(page);
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }
});

// B-3（CAM-G06 の一部）：壊れたカメラ保存データのとき、旧 camera.html は黙って既定値を編集せず、エラーを出して止まる。
test('legacy camera.html: broken camera_project.json shows an error and is never overwritten (B-3)', { ...harness.skip3d(), ...chromiumSkip }, async () => {
  const BROKEN = '{"broken":';
  const server = await harness.startServer({ port: PORT + 1, seed: { 'camera_project.json': BROKEN } });
  let browser;
  try {
    browser = await server.launchBrowser();
    // 保存を押すと本文が空になり 413、読込は 422 になるのでコンソールのエラーを許可する（3-m3）
    const page = await server.newPage(browser, { expectErrors: [/413/, /422/, /camera_project/] });
    await page.goto(`${server.base}/camera.html`);
    await page.waitForFunction(() => /読み込みエラー/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
    const text = await page.textContent('#status');
    assert.match(text, /カメラ保存データ（camera_project\.json）を読めません/);
    await page.click('#save');
    await page.waitForFunction(() => /保存失敗/.test(document.getElementById('status').textContent), null, { timeout: 10000 });
    assert.equal(fs.readFileSync(`${server.dataDir}/camera_project.json`, 'utf8'), BROKEN);
    const backups = fs.readdirSync(server.dataDir).filter((f) => /^camera_project\.invalid-[0-9a-f]{8}-\d{8}T\d{6}Z\.json$/.test(f));
    assert.equal(backups.length, 1);
    harness.assertNoErrors(page);
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }
});
