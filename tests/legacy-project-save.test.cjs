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

    await page.click('#project-save');
    await page.waitForFunction(() => /保存済み/.test(document.getElementById('project-info').textContent), null, { timeout: 10000 });

    // 外部（MCP 相当）からの更新。同期の基準（/api/sync の revision）が取れてから送る。
    await page.waitForResponse((r) => r.url().includes('/api/sync') && r.ok());
    const syncedUi = page.waitForFunction(() => /MCPから更新を同期しました/.test(document.getElementById('project-info').textContent), null, { timeout: 15000 });
    // C9：版の取り直し（B-2）の応答を待つ。登録は同期の表示を待つ前に行う。
    const refetched = page.waitForResponse((r) => r.url().includes('/api/project?envelope=1') && r.ok(), { timeout: 15000 });
    const external = { schema: 1, timeline: [{ name: 'external-step' }], history: [{ label: 'external', at: new Date().toISOString(), timeline: [{ name: 'external-step' }], selected: 1, playbackSpeed: 1 }], cursor: 0, playbackSpeed: 1 };
    const res = await fetch(`${server.base}/api/project`, { method: 'POST', body: JSON.stringify(external) });
    assert.equal(res.status, 200);
    await syncedUi;
    await refetched;
    // 応答が返った後の .then(...) でクライアントの版が更新されるまで、マイクロタスクを1回回す
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));

    await page.click('#project-save');
    await page.waitForFunction(() => /保存済み/.test(document.getElementById('project-info').textContent), null, { timeout: 10000 });
    assert.deepEqual(failures, [], `旧画面が alert を出しました: ${failures.join(' / ')}`);
    harness.assertNoErrors(page);
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }
});
