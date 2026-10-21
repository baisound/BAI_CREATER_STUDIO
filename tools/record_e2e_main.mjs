// 通し確認（tests/studio-p2-e2e-main.test.cjs）の結果を台帳 docs/roadmap/P2_PORT_STATUS.json の
// e2e_main に書く（設計 P2 §2.9 (b)）。手で書かない。
// 使い方: node tools/record_e2e_main.mjs [--results <json>] [--status <json>]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** S1 から切れ目なく pass が続いた最後の手順。skip のうち「既存機能なし」「後段」は飛ばして続ける。
 *  WP 未着手による skip と fail は切れ目。1つも無ければ null。 */
export function furthestStep(steps) {
  let furthest = null;
  for (const s of steps) {
    if (s.result === 'pass') furthest = s.id;
    else if (s.result === 'skip' && (s.kind === 'no_existing' || s.kind === 'later_phase')) continue;
    else break;
  }
  return furthest;
}

export function buildRecord(results, commit, checkedAt) {
  const steps = results.steps.map((s) => ({ id: s.id, result: s.result, reason: s.reason || '' }));
  return { furthest_step: furthestStep(results.steps), steps, commit, checked_at: checkedAt || results.checked_at };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resultsPath = arg('--results', process.env.P2_E2E_RESULT || path.join(root, 'test-results', 'e2e_main.json'));
  const statusPath = arg('--status', path.join(root, 'docs', 'roadmap', 'P2_PORT_STATUS.json'));
  if (!fs.existsSync(resultsPath)) { console.error(`結果ファイルがありません: ${resultsPath}（先に test:p2-e2e のテストを実行する）`); process.exit(2); }
  if (!fs.existsSync(statusPath)) { console.error(`台帳がありません: ${statusPath}（P2-WP-00c で新設。それまでは --status で書き先を指定できる）`); process.exit(2); }
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  let commit = 'unknown';
  try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim(); } catch { /* git なし */ }
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  status.e2e_main = buildRecord(results, commit);
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n');
  console.log(`e2e_main を記録しました: furthest_step=${status.e2e_main.furthest_step}（${statusPath}）`);
}
