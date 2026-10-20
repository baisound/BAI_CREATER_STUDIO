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
  { id: 'S1', title: 'VRM/PMX の読込', kind: 'pending_wp', reason: 'WP-03・WP-04 が未着手' },
  { id: 'S2', title: 'ステージの配置', kind: 'pending_wp', reason: 'WP-04 が未着手' },
  { id: 'S3', title: 'カメラの設定', kind: 'pending_wp', reason: 'WP-06b・WP-06c が未着手' },
  { id: 'S4', title: 'BGM（歌の音声）の配置', kind: 'no_existing', reason: '既存機能なし（音声の登録 API・タイムラインの音声トラックが旧画面に無い。Q4 で所有者が決める）' },
  { id: 'S5', title: 'VMD/FBX の設置', kind: 'pending_wp', reason: 'WP-05 が未着手' },
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
  fs.writeFileSync(RESULT, JSON.stringify({ steps: results, checked_at: new Date().toISOString() }, null, 1) + '\n');
});

for (const step of STEPS) {
  const name = `${step.id} ${step.title}`;
  if (!step.run) {
    results.push({ id: step.id, result: 'skip', reason: step.reason, kind: step.kind });
    test(name, { skip: step.reason }, () => {});
    continue;
  }
  test(name, async () => {
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
