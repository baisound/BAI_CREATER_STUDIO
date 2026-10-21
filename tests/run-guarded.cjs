'use strict';
// 実データ保護つきの node テスト実行（P2-WP-00a-2、設計 P2 §4.1「実データの保護」）。
// 使い方: node tests/run-guarded.cjs <ファイルまたはグロブ>...
// - リポジトリの data/ 全体（logs/ を含む）と exports/ の「相対パス＋内容の sha256」を1回だけ計算し、
//   テストの実行後にもう一度計算して比べる。違えば変わったパスを出して失敗にする。
// - グロブは自分で展開する（Windows の cmd は展開しない）。一致が0件の引数はエラー。
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function globToRegExp(seg) {
  const esc = seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  return new RegExp(`^${esc}$`);
}
/** `*` と `?` を含むパスを展開する（区切りは / と \）。含まなければそのまま返す。 */
function expand(pattern) {
  const parts = pattern.replace(/\\/g, '/').split('/').filter((p) => p !== '');
  let bases = [pattern.startsWith('/') ? '/' : ''];
  for (const part of parts) {
    const next = [];
    for (const b of bases) {
      const dir = b === '' ? '.' : b;
      if (/[*?]/.test(part)) {
        let names = [];
        try { names = fs.readdirSync(path.resolve(root, dir)); } catch { /* なし */ }
        const re = globToRegExp(part);
        for (const n of names.sort()) if (re.test(n)) next.push(b === '' ? n : path.posix.join(b, n));
      } else {
        const cand = b === '' ? part : path.posix.join(b, part);
        if (fs.existsSync(path.resolve(root, cand))) next.push(cand);
      }
    }
    bases = next;
  }
  return bases.filter((f) => fs.statSync(path.resolve(root, f)).isFile());
}

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else if (e.isFile()) out.push(f);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}
/** 相対パス → sha256。ディレクトリが無ければ null（「無い」ことを記録する）。 */
function snapshot(name) {
  const dir = path.join(root, name);
  if (!fs.existsSync(dir)) return null;
  const map = {};
  for (const f of listFiles(dir)) {
    map[`${name}/${path.relative(dir, f).replace(/\\/g, '/')}`] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  }
  return map;
}
function diff(before, after, name) {
  if (before === null && after === null) return [];
  if (before === null) return [`${name}/ が作られました`];
  if (after === null) return [`${name}/ が無くなりました`];
  const changed = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[k] !== after[k]) changed.push(`${k}（${before[k] === undefined ? '追加' : after[k] === undefined ? '削除' : '変更'}）`);
  }
  return changed;
}
function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(500, () => { s.destroy(); resolve(false); });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('使い方: node tests/run-guarded.cjs <ファイルまたはグロブ>...'); return 2; }
  const files = [];
  for (const a of args) {
    const found = expand(a);
    if (!found.length) { console.error(`[run-guarded] エラー: 一致するファイルがありません: ${a}`); return 2; }
    for (const f of found) if (!files.includes(f)) files.push(f);
  }
  if (await portOpen(8765)) {
    console.warn('[run-guarded] 警告: 開発用サーバー（127.0.0.1:8765）が動いています。実データに書き込むとハッシュの確認が失敗します');
  }
  const before = { data: snapshot('data'), exports: snapshot('exports') };
  // Windows の長いブラウザ総当たりでソケット不足になる環境だけ、明示的に1へ下げられる。
  // 既定2は P2 設計 §4.3 のまま。
  const concurrency = Number(process.env.BAI_TEST_CONCURRENCY || 2);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    console.error('[run-guarded] BAI_TEST_CONCURRENCY は 1〜8 の整数にしてください');
    return 2;
  }
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', `--test-concurrency=${concurrency}`, ...files], { cwd: root, stdio: 'inherit' });
    child.on('exit', (c, sig) => resolve(c === null ? 1 : c));
    child.on('error', (e) => { console.error(e); resolve(1); });
  });
  const after = { data: snapshot('data'), exports: snapshot('exports') };
  const changed = [...diff(before.data, after.data, 'data'), ...diff(before.exports, after.exports, 'exports')];
  if (changed.length) {
    console.error('[run-guarded] 失敗: 実データが変わりました:\n  ' + changed.join('\n  '));
    return 1;
  }
  console.log(`[run-guarded] 実データのハッシュは前後で一致しました（data: ${before.data ? Object.keys(before.data).length + ' ファイル' : '無し'}、exports: ${before.exports ? Object.keys(before.exports).length + ' ファイル' : '無し'}）`);
  return code;
}
main().then((c) => process.exit(c));
