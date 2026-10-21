// ⑤ フォーク（studio/js/motion/patterns.fork.js）と旧画面 index.html の照合（P2 設計 §2.5 O-⑤-1・(g)、WP-05c）。ブラウザー不要。
// 旧画面から表・関数を正規表現で取り出して実行し、新しい写しと同じ入力で比べる。旧画面は変えない。
// 05d 以降のフォーク（chain.fork.js ほか）の照合は、それぞれの WP でこのファイルに足す。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROWS, NAMES, KEYWORDS, norm, patternDuration, motionKeys, isAvailable } from '../studio/js/motion/patterns.fork.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

/** 正規表現で1か所だけ取り出す（無い・複数なら失敗。旧画面の書き方が変わったことに気づくため）。 */
function grab(re, what) {
  const all = [...HTML.matchAll(re)];
  assert.equal(all.length, 1, `index.html から ${what} を1か所だけ取り出せません（${all.length}か所）。旧画面の書き方が変わった可能性があります`);
  return all[0][1];
}
const evalJs = (src) => new Function(`return (${src})`)();

const LEGACY_ROWS = JSON.parse(grab(/^const rows=(\[[^\n]*?\}\]);let current=/gm, '82パターン表（rows）'));

test('ROWS equals the legacy table (index.html:80)', () => {
  assert.equal(LEGACY_ROWS.length, 82);
  assert.deepEqual(ROWS, LEGACY_ROWS);
  assert.deepEqual(ROWS.map((r) => r.id), Array.from({ length: 82 }, (_, i) => i + 1), '番号は 1〜82 の連番');
  for (const r of ROWS) assert.ok(r.steps.length > 0 && r.steps.every((s) => typeof s === 'string' && s), `steps: ${r.id}`);
});

test('NAMES and KEYWORDS equal the legacy tables (index.html:81・242)', () => {
  assert.deepEqual(NAMES, evalJs(grab(/^const names=(\{[^\n]*\});\r?$/gm, '技名（names）')));
  assert.deepEqual(KEYWORDS, evalJs(grab(/^const keywords=(\{[^\n]*?\});/gm, '検索語（keywords）')));
});

test('norm behaves like the legacy normalizer (index.html:229)', () => {
  const legacy = evalJs(grab(/const norm=(x=>x\.toLowerCase\(\)[^;]*);/g, '正規化（norm）'));
  const samples = [...ROWS.flatMap((r) => [...r.steps, `${r.mixamo}.fbx`, r.title]), 'A B-C_d.FBX', 'Ｔｅｓｔ.fbx', '', '日本語.fbx', '  x.fbx  '];
  for (const s of samples) assert.equal(norm(s), legacy(s), JSON.stringify(s));
});

test('patternDuration follows the legacy duration rule (index.html:92)', () => {
  const src = grab(/duration=(r\.duration\?\?Math\.max\(2\.6, ?\(r\.seq\.split\('\|'\)\[0\]\.split\(','\)\.length\)\*1\.05\+\.8\))/g, '尺の規則');
  const legacy = new Function('r', `return ${src}`);
  for (const r of ROWS) assert.equal(patternDuration(r), legacy(r), `row ${r.id}`);
  assert.equal(ROWS.filter((r) => 'duration' in r).length, 32, '登録FBX由来の行は元の尺を持つ');
  // 持たない行は式で決まる（例：seq が1語なら max(2.6, 1.05+.8)）
  assert.equal(patternDuration({ seq: 'jab' }), 2.6);
  assert.equal(patternDuration({ seq: 'a,b,c,d' }), 4 * 1.05 + 0.8);
  assert.equal(patternDuration({ seq: 'a,b|c,d,e,f,g,h', duration: 7 }), 7);
});

test('isAvailable equals the legacy motionAvailability (index.html:233) for many registrations', () => {
  const src = grab(/window\.motionAvailability=(row=>row\.steps\.length>0&&row\.steps\.every\(step=>Boolean\(clips\.get\(manual\[step\]\)\|\|choose\(step\)\)\))/g, '実FBXの有無（motionAvailability）');
  const make = (clips, manual) => new Function('clips', 'manual', 'choose', `return ${src}`)(clips, manual, (name) => clips.get(norm(name)) || null);
  const allSteps = [...new Set(ROWS.flatMap((r) => r.steps))];
  // 決まった乱数で、登録の組み合わせをたくさん作る
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let crowns = 0;
  for (let trial = 0; trial < 60; trial++) {
    const registered = allSteps.filter(() => rnd() < (trial % 3 === 0 ? 0.95 : 0.3));
    const clips = new Map(registered.map((n) => [norm(n), { clip: n }]));
    clips.set('__model0', { clip: 'model' });
    const manual = {};
    for (const s of allSteps) if (rnd() < 0.1) manual[s] = rnd() < 0.5 ? norm(registered[Math.floor(rnd() * registered.length)] || 'zz') : 'not-registered';
    const manifest = { files: [...registered.map((n) => ({ id: n, name: `${n}.fbx`, kind: 'motions' })), { id: 'm', name: 'Model.fbx', kind: 'modelA' }] };
    const legacy = make(clips, manual);
    const keys = motionKeys(manifest);
    for (const r of ROWS) {
      const want = legacy(r);
      assert.equal(isAvailable(r, keys, manual), want, `trial ${trial} row ${r.id}`);
      if (want) crowns++;
    }
  }
  assert.ok(crowns > 100, `👑になる行が十分に試された: ${crowns}`);
});

test('motionKeys skips models and normalizes motion names (index.html:236)', () => {
  const keys = motionKeys({ files: [
    { id: '1', name: 'Boxing Leading Hand Jab.fbx', kind: 'motions' },
    { id: '2', name: 'Back Hand Cross.FBX', kind: 'modelA' },
    { id: '3', name: 'Some Model.fbx', kind: 'modelB' },
    { id: '4', name: 'Kip Up.fbx' },
    { id: '5' },
    null,
  ] });
  assert.deepEqual([...keys].sort(), ['boxingleadinghandjab', 'kipup']);
  assert.equal(motionKeys(null).size, 0);
  assert.equal(motionKeys({}).size, 0);
  const row = ROWS[0];
  assert.equal(isAvailable(row, keys, {}), true);
  assert.equal(isAvailable({ steps: [] }, keys, {}), false, '手順が空の行は👑にならない');
  assert.equal(isAvailable(ROWS[1], keys, {}), false, 'モデルとして登録されたものは数えない');
  assert.equal(isAvailable(ROWS[1], keys, { 'Back Hand Cross': 'kipup' }), true, '手動の対応は登録済みのキーを指すときだけ');
  assert.equal(isAvailable(ROWS[1], keys, { 'Back Hand Cross': 'nothing' }), false);
});
