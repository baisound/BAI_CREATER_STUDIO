// 完了ゲート（P2 設計 §1.13）：screens.js の `evidence` に書かれたテストファイルを全部実行する。
// 使い方: node tools/run_evidence_tests.mjs
// 実データ保護つきの tests/run-guarded.cjs に渡すだけの小さなスクリプト。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENS } from '../studio/js/screens.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = new Set();
const walk = (n) => {
  if (Array.isArray(n)) { n.forEach(walk); return; }
  if (n && typeof n === 'object') {
    if (n.status === 'real' && typeof n.evidence === 'string') files.add(n.evidence.split('::')[0]);
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v);
  }
};
walk(SCREENS);
const list = [...files].sort();
if (!list.length) { console.error('evidence のあるテストファイルがありません'); process.exit(1); }
console.log(`evidence のテストファイル ${list.length} 件:\n  ${list.join('\n  ')}`);
const r = spawnSync(process.execPath, [path.join(root, 'tests', 'run-guarded.cjs'), ...list], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
