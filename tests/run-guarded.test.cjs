'use strict';
// tests/run-guarded.cjs 自身のテスト。実リポジトリの data/ には触れず、一時ディレクトリに複製して確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cleanEnv = { ...process.env };
delete cleanEnv.NODE_TEST_CONTEXT; // 外側の node --test の文脈を引き継ぐと、内側の --test が普通に動かない
const script = path.join(__dirname, 'run-guarded.cjs');

function makeRepo(testBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bai-guard-'));
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.mkdirSync(path.join(dir, 'data', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data', 'a.json'), '{}');
  fs.copyFileSync(script, path.join(dir, 'tests', 'run-guarded.cjs'));
  fs.writeFileSync(path.join(dir, 'tests', 'x.test.cjs'), `require('node:test')('x', () => { ${testBody} });`);
  return dir;
}
const run = (dir, ...args) => spawnSync(process.execPath, [path.join(dir, 'tests', 'run-guarded.cjs'), ...args], { cwd: dir, encoding: 'utf8', env: cleanEnv });
const rm = (dir) => fs.rmSync(dir, { recursive: true, force: true });

test('実データが変わらなければ合格し、グロブを自分で展開する', () => {
  const dir = makeRepo('');
  try {
    const r = run(dir, 'tests/*.test.cjs');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /ハッシュは前後で一致/);
    assert.match(r.stdout, /# pass 1/);
  } finally { rm(dir); }
});

test('data/ の変更・追加・削除と exports/ の作成を検出して失敗にする', () => {
  const dir = makeRepo(`
    const fs = require('node:fs'); const p = require('node:path'); const r = p.resolve(__dirname, '..');
    fs.writeFileSync(p.join(r, 'data', 'a.json'), '{"x":1}');
    fs.writeFileSync(p.join(r, 'data', 'logs', 'new.jsonl'), 'x');
    fs.mkdirSync(p.join(r, 'exports')); fs.writeFileSync(p.join(r, 'exports', 'o.vmd'), 'x');`);
  try {
    const r = run(dir, 'tests/x.test.cjs');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /data\/a\.json（変更）/);
    assert.match(r.stderr, /data\/logs\/new\.jsonl（追加）/);
    assert.match(r.stderr, /exports\/ が作られました/);
  } finally { rm(dir); }
});

test('一致が0件の引数と、引数なしはエラー', () => {
  const dir = makeRepo('');
  try {
    const none = run(dir, 'tests/*.nothing.cjs');
    assert.equal(none.status, 2);
    assert.match(none.stderr, /一致するファイルがありません/);
    assert.equal(run(dir).status, 2);
  } finally { rm(dir); }
});

test('テストが失敗したら、ハッシュが一致していても失敗の終了コードを返す', () => {
  const dir = makeRepo('throw new Error("boom")');
  try { assert.notEqual(run(dir, 'tests/x.test.cjs').status, 0); } finally { rm(dir); }
});
