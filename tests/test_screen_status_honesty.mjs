// 状態バッジの正直さの検査（P2 設計 §1.13、WP-00c）。
// - status:'real' の区画（パネル・カード・節）には evidence か shell が必須。evidence のファイルとテスト名が実在する。
// - screens.js の import 先は ./samples.js だけ（機能モジュールを import しない）。
// - @ts-nocheck は *.fork.js にしか無い。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENS } from '../studio/js/screens.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCREENS_SRC = fs.readFileSync(path.join(root, 'studio/js/screens.js'), 'utf8');

/** status:'real' を持つオブジェクトをすべて集める（パネル・カード・節・左右の一覧・下部）。 */
function collectReal(node, trail, out) {
  if (Array.isArray(node)) { node.forEach((x, i) => collectReal(x, `${trail}[${i}]`, out)); return; }
  if (node && typeof node === 'object') {
    if (node.status === 'real') out.push({ trail, node });
    for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') collectReal(v, `${trail}.${k}`, out);
  }
}
const reals = [];
for (const s of SCREENS) collectReal(s, `SCR-${s.id}`, reals);

test('real regions are all found (same count as the source)', () => {
  const inSource = (SCREENS_SRC.match(/status: *'real'/g) || []).length;
  assert.equal(reals.length, inSource, 'every status:real in screens.js is reachable from SCREENS');
  assert.ok(reals.length >= 20);
});

test('every real region has evidence that exists', () => {
  for (const { trail, node } of reals) {
    assert.equal(typeof node.evidence, 'string', `${trail} (${node.name || node.title}) has no evidence`);
    const [file, name, ...rest] = node.evidence.split('::');
    assert.equal(rest.length, 0, `${trail}: evidence must be '<file>::<test name>'`);
    assert.ok(file && name, `${trail}: evidence format`);
    const abs = path.join(root, file);
    assert.ok(fs.existsSync(abs), `${trail}: ${file} does not exist`);
    const text = fs.readFileSync(abs, 'utf8');
    assert.ok(text.includes(name), `${trail}: test name "${name}" not found in ${file}`);
    assert.ok(/\.(cjs|mjs)$/.test(file), `${trail}: evidence must be a node test file`);
  }
});

test('shell regions point at tests/studio-ui.test.cjs', () => {
  const shells = reals.filter((r) => r.node.shell === true);
  assert.ok(shells.length >= 8);
  for (const { trail, node } of shells) assert.ok(String(node.evidence).startsWith('tests/studio-ui.test.cjs::'), `${trail}: shell evidence`);
  // shell は real 以外には付けない
  const stack = [SCREENS];
  while (stack.length) {
    const n = stack.pop();
    if (Array.isArray(n)) { stack.push(...n); continue; }
    if (n && typeof n === 'object') {
      if (n.shell !== undefined) assert.equal(n.status, 'real', 'shell is only for real regions');
      for (const v of Object.values(n)) if (v && typeof v === 'object') stack.push(v);
    }
  }
});

test('screens.js imports only samples.js', () => {
  const imports = [...SCREENS_SRC.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./samples.js']);
});

test('@ts-nocheck appears only in *.fork.js', () => {
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs|ts)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('@ts-nocheck')) found.push(path.relative(root, p));
    }
  };
  walk(path.join(root, 'studio'));
  for (const f of found) assert.ok(/\.fork\.js$/.test(f), `${f} must not use @ts-nocheck`);
  // 写したコード（フォーク）は設計 §1.8 の3つだけ
  const allowed = new Set(['studio/js/viewport/normalize.fork.js', 'studio/js/motion/patterns.fork.js', 'studio/js/motion/chain.fork.js']);
  for (const f of found) assert.ok(allowed.has(f.replace(/\\/g, '/')), `${f} is not an allowed fork`);
});

test('regions are marked consistently in the shell source', () => {
  // 薄い表示は status だけから決める。別の印（data-dim を直に付ける等）を作っていない。
  const files = ['studio/js/app.js', 'studio/js/ui.js'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const direct = [...src.matchAll(/data-dim|dataset\.dim\s*=|dim:\s*'1'/g)].length;
    if (f.endsWith('app.js')) assert.equal(direct, 0, 'app.js must use region() only');
  }
  const ui = fs.readFileSync(path.join(root, 'studio/js/ui.js'), 'utf8');
  assert.match(ui, /el\.dataset\.dim = '1'/);
});
