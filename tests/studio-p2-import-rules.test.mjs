// ③ 取り込み規則・素材一覧の分類の単体テスト（P2 設計 §2.3(g)、WP-02・WP-03）。ブラウザー不要。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyImport, conflictOf, batchErrors, batchErrorRows, fbxIdFor, sha256Hex, integratedStoredName, IMPORT_ACCEPT, MAX_UPLOAD_BYTES } from '../studio/js/features/import-rules.js';
import { categoryOf, sourceLabel, filterAssets, countByCategory, formatsOf, ASSET_CATS } from '../studio/js/features/assets-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------- classifyImport */

test('classifyImport: the six rows of the table', () => {
  const glb = classifyImport('a.glb', 10);
  assert.equal(glb.ok, true);
  assert.equal(glb.route, 'integrated');
  assert.equal(glb.defaultKind, 'motion');
  assert.deepEqual(glb.kinds.map((k) => k.value), ['motion', 'model']);

  const vrm = classifyImport('b.VRM', 10);
  assert.equal(vrm.route, 'integrated');
  assert.equal(vrm.defaultKind, 'model');
  assert.deepEqual(vrm.kinds, []);

  const zip = classifyImport('pack.zip', 10);
  assert.equal(zip.route, 'pmxZip');
  assert.equal(zip.defaultKind, 'A');
  assert.deepEqual(zip.kinds.map((k) => k.value), ['A', 'B']);

  const vmd = classifyImport('dance.vmd', 10);
  assert.equal(vmd.route, 'vmd');
  assert.deepEqual(vmd.kinds, []);

  const fbx = classifyImport('walk.fbx', 10);
  assert.equal(fbx.route, 'fbx');
  assert.equal(fbx.defaultKind, 'motions');
  assert.deepEqual(fbx.kinds.map((k) => k.value), ['motions', 'modelA', 'modelB']);

  const other = classifyImport('x.png', 10);
  assert.equal(other.ok, false);
  assert.match(other.error, /この形式には対応していません（GLB・VRM・PMX ZIP・VMD・FBX）。/);
  assert.equal(classifyImport('noext', 10).ok, false);
  assert.equal(IMPORT_ACCEPT, '.glb,.vrm,.zip,.vmd,.fbx');
});

test('classifyImport: size limits and empty files', () => {
  assert.equal(classifyImport('a.glb', MAX_UPLOAD_BYTES).ok, true);
  const big = classifyImport('a.glb', MAX_UPLOAD_BYTES + 1);
  assert.equal(big.ok, false);
  assert.equal(big.error, '400MB を超えるファイルは登録できません。');
  const empty = classifyImport('a.vmd', 0);
  assert.equal(empty.ok, false);
  assert.equal(empty.error, '空のファイルです。');
});

test('classifyImport: name checks (length counts code points, slashes, leading dot)', () => {
  // GLB/VRM：サーバーの正規表現は `[^/\\\x00]{1,180}\.(glb|vrm)`（拡張子の前の部分が180文字まで）
  assert.equal(classifyImport(`${'a'.repeat(180)}.glb`, 1).ok, true);
  assert.equal(classifyImport(`${'a'.repeat(181)}.glb`, 1).ok, false);
  // 絵文字は UTF-16 では2単位だが、コードポイントでは1文字（Python の len と同じ）
  assert.equal(classifyImport(`${'😀'.repeat(180)}.glb`, 1).ok, true);
  assert.equal(classifyImport(`${'😀'.repeat(181)}.glb`, 1).ok, false);
  // VMD：名前全体が180文字まで、FBX：250文字まで
  assert.equal(classifyImport(`${'😀'.repeat(176)}.vmd`, 1).ok, true);
  assert.equal(classifyImport(`${'😀'.repeat(177)}.vmd`, 1).ok, false);
  assert.equal(classifyImport(`${'a'.repeat(246)}.fbx`, 1).ok, true);   // 250
  assert.equal(classifyImport(`${'a'.repeat(247)}.fbx`, 1).ok, false);  // 251
  assert.equal(classifyImport(`${'😀'.repeat(246)}.fbx`, 1).ok, true);
  assert.equal(classifyImport('a/b.vmd', 1).ok, false);
  assert.equal(classifyImport('a\\b.vmd', 1).ok, false);
  assert.equal(classifyImport('.hidden.vmd', 1).ok, false);
  assert.equal(classifyImport('a/b.glb', 1).ok, false);
  assert.equal(classifyImport('.glb', 1).ok, false);
});

test('classifyImport: a % in a GLB/VRM name warns (the server decodes twice), FBX/VMD do not', () => {
  const glb = classifyImport('a%41.glb', 1);
  assert.equal(glb.ok, true);
  assert.deepEqual(glb.warnings, ['名前に % が含まれているため、登録される名前が変わることがあります']);
  assert.deepEqual(classifyImport('a%41.vrm', 1).warnings.length, 1);
  assert.deepEqual(classifyImport('a%41.vmd', 1).warnings, []);
  assert.deepEqual(classifyImport('a%41.fbx', 1).warnings, []);
  assert.deepEqual(classifyImport('plain.glb', 1).warnings, []);
});

test('MAX_UPLOAD_BYTES equals the server MAX_SIZE', () => {
  assert.equal(MAX_UPLOAD_BYTES, 400 * 1024 * 1024);
  const src = fs.readFileSync(path.join(root, 'server.py'), 'utf8');
  assert.match(src, /MAX_SIZE=400\*1024\*1024/);
});

/* ---------------------------------------------------------------- fbxIdFor */

test('fbxIdFor matches Python hashlib.sha256(kind + NUL + name).hexdigest()[:24]', async () => {
  // 期待値は Python で求めたもの（hashlib.sha256((kind+'\0'+name).encode()).hexdigest()[:24]）
  assert.equal(await fbxIdFor('motions', 'a.fbx'), 'd1a20d7b74e42e66e200e389');
  assert.equal(await fbxIdFor('modelA', '日本語.fbx'), '72c2909f7d8b5ddf9f7fab9a');
  assert.equal(await fbxIdFor('modelB', 'x y.fbx'), '1360bb790e3d3e44733c915b');
});

test('integratedStoredName: first 20 hex + lower-case extension', async () => {
  const hex = await sha256Hex(new TextEncoder().encode('abc').buffer);
  assert.equal(hex, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(integratedStoredName(hex, 'X.GLB'), 'ba7816bf8f01cfea4141.glb');
  assert.equal(integratedStoredName(hex, 'y.vrm'), 'ba7816bf8f01cfea4141.vrm');
});

/* ---------------------------------------------------------------- conflictOf */

const ITEMS = [
  { id: 'mmd:vmd:dance.vmd', name: 'dance.vmd', format: 'VMD', kind: 'vmd', source: 'mmd', available: true },
  { id: 'mmd:A:test.pmx', name: 'test.pmx', format: 'PMX', kind: 'A', source: 'mmd', available: true },
  { id: 'fbx:d1a20d7b74e42e66e200e389', name: 'a.fbx', format: 'FBX', kind: 'motions', source: 'fbx', available: true },
  { id: 'fbx:72c2909f7d8b5ddf9f7fab9a', name: '日本語.fbx', format: 'FBX', kind: 'modelA', source: 'fbx', available: true },
  { id: 'integrated:ba7816bf8f01cfea4141.glb', name: 'old.glb', format: 'GLB', kind: 'motion', source: 'integrated', filename: 'ba7816bf8f01cfea4141.glb', available: true },
];
const SHA = 'ba7816bf8f01cfea4141';

test('conflictOf: VMD with the same name overwrites', () => {
  const c = conflictOf({ name: 'dance.vmd', route: 'vmd', kind: '' }, ITEMS);
  assert.equal(c.kind, 'overwrite');
  assert.match(c.message, /同じ名前の VMD『dance\.vmd』があります。上書きすると元の内容は戻せません。/);
  assert.equal(conflictOf({ name: 'other.vmd', route: 'vmd', kind: '' }, ITEMS), null);
});

test('conflictOf: VMD that differs only in letter case overwrites on Windows (Opus review)', () => {
  // VMD は名前のままファイルに保存される。Windows（大文字・小文字を区別しない）では Dance.vmd が dance.vmd を上書きする。
  const c = conflictOf({ name: 'Dance.VMD', route: 'vmd', kind: '' }, ITEMS);
  assert.equal(c.kind, 'overwrite');
  assert.match(c.message, /大文字・小文字だけが違う VMD『dance\.vmd』があります。Windows では同じファイルとして上書きされ、元の内容は戻せません。/);
  // PMX スロットの同じ名前は VMD とは別のフォルダー
  assert.equal(conflictOf({ name: 'test.pmx.vmd', route: 'vmd', kind: '' }, ITEMS), null);
});

test('conflictOf: FBX same name/kind overwrites; modelA/B with another name replaces the old model', () => {
  const same = conflictOf({ name: 'a.fbx', route: 'fbx', kind: 'motions' }, ITEMS, { fbxId: 'd1a20d7b74e42e66e200e389' });
  assert.equal(same.kind, 'overwrite');
  assert.match(same.message, /同じ名前の FBX『a\.fbx』（モーション）があります。上書きすると元の内容は戻せません。/);
  // 同じ名前でも種類が違えば id が違う → 衝突しない
  assert.equal(conflictOf({ name: 'a.fbx', route: 'fbx', kind: 'motions' }, ITEMS, { fbxId: 'ffffffffffffffffffffffff' }), null);
  const rep = conflictOf({ name: 'new.fbx', route: 'fbx', kind: 'modelA' }, ITEMS, { fbxId: '000000000000000000000000' });
  assert.equal(rep.kind, 'replaceModel');
  assert.match(rep.message, /モデルAの現在の FBX『日本語\.fbx』は登録が外れ、元のファイルが削除されます。/);
  // modelB は空き → 衝突なし。motions は別名なら衝突なし
  assert.equal(conflictOf({ name: 'new.fbx', route: 'fbx', kind: 'modelB' }, ITEMS, { fbxId: '000000000000000000000001' }), null);
  assert.equal(conflictOf({ name: 'new.fbx', route: 'fbx', kind: 'motions' }, ITEMS, { fbxId: '000000000000000000000002' }), null);
  // 同じ名前・同じ枠なら置き換えではなく上書き（id が同じ＝元のファイルは削除されない）
  assert.equal(conflictOf({ name: '日本語.fbx', route: 'fbx', kind: 'modelA' }, ITEMS, { fbxId: '72c2909f7d8b5ddf9f7fab9a' }).kind, 'overwrite');
});

test('conflictOf: PMX ZIP into a slot that already has a PMX', () => {
  const c = conflictOf({ name: 'p.zip', route: 'pmxZip', kind: 'A' }, ITEMS);
  assert.equal(c.kind, 'slotOverwrite');
  assert.match(c.message, /モデルAには既に PMX が登録されています。ZIP の中と同じパスのファイルは上書きされます（他のファイルは残ります）。/);
  assert.equal(conflictOf({ name: 'p.zip', route: 'pmxZip', kind: 'B' }, ITEMS), null);
  // テクスチャだけがあるスロットは PMX ではない
  const tex = [{ id: 'mmd:B:t.png', name: 't.png', format: 'PNG', kind: 'B', source: 'mmd', available: true }];
  assert.equal(conflictOf({ name: 'p.zip', route: 'pmxZip', kind: 'B' }, tex), null);
});

test('conflictOf: GLB/VRM with the same bytes reclassifies only when name or kind differs', () => {
  const rec = conflictOf({ name: 'b.glb', route: 'integrated', kind: 'model' }, ITEMS, { contentSha20: SHA });
  assert.equal(rec.kind, 'reclassify');
  assert.match(rec.message, /同じ内容の素材『old\.glb』（モーション）が登録済みです。続けると、名前と種類が『b\.glb』（モデル）に置き換わります（ファイルは同じものです）。/);
  // 名前だけ違う
  assert.equal(conflictOf({ name: 'c.glb', route: 'integrated', kind: 'motion' }, ITEMS, { contentSha20: SHA }).kind, 'reclassify');
  // 名前も種類も同じ名前・同じ種類の GLB は確認なし（結果が変わらない）
  assert.equal(conflictOf({ name: 'old.glb', route: 'integrated', kind: 'motion' }, ITEMS, { contentSha20: SHA }), null);
  // 拡張子が違えば保存名が違う → 衝突しない
  assert.equal(conflictOf({ name: 'c.vrm', route: 'integrated', kind: 'model' }, ITEMS, { contentSha20: SHA }), null);
  // 別の中身は衝突しない
  assert.equal(conflictOf({ name: 'b.glb', route: 'integrated', kind: 'model' }, ITEMS, { contentSha20: '00000000000000000000' }), null);
});

/* ---------------------------------------------------------------- batchErrors */

test('batchErrors: the five kinds of contradictions within one import', () => {
  const E = (name, route, kind) => ({ name, route, kind });
  assert.deepEqual(batchErrors([E('a.fbx', 'fbx', 'modelA'), E('b.fbx', 'fbx', 'modelB')]), []);
  assert.equal(batchErrors([E('a.fbx', 'fbx', 'modelA'), E('b.fbx', 'fbx', 'modelA')]).length, 2);
  assert.equal(batchErrors([E('a.fbx', 'fbx', 'modelB'), E('b.fbx', 'fbx', 'modelB')]).length, 2);
  assert.equal(batchErrors([E('a.zip', 'pmxZip', 'A'), E('b.zip', 'pmxZip', 'A')]).length, 2);
  assert.deepEqual(batchErrors([E('a.zip', 'pmxZip', 'A'), E('b.zip', 'pmxZip', 'B')]), []);
  assert.equal(batchErrors([E('x.vmd', 'vmd', ''), E('x.vmd', 'vmd', '')]).length, 2);
  assert.deepEqual(batchErrors([E('x.vmd', 'vmd', ''), E('y.vmd', 'vmd', '')]), []);
  assert.equal(batchErrors([E('x.vmd', 'vmd', ''), E('X.VMD', 'vmd', '')]).length, 2, 'letter case only: the same file on Windows');
  assert.equal(batchErrors([E('w.fbx', 'fbx', 'motions'), E('w.fbx', 'fbx', 'motions')]).length, 2);
  assert.deepEqual(batchErrors([E('w.fbx', 'fbx', 'motions'), E('v.fbx', 'fbx', 'motions')]), []);
  const rows = batchErrorRows([E('a.fbx', 'fbx', 'modelA'), E('c.vmd', 'vmd', ''), E('b.fbx', 'fbx', 'modelA')]);
  assert.deepEqual(rows.map(Boolean), [true, false, true]);
  assert.match(rows[0], /1回の取り込みで同じ登録先に置けるのは1つです/);
});

/* ---------------------------------------------------------------- assets-model */

const LIST = [
  { id: 'fbx:1', name: 'walk.fbx', format: 'FBX', kind: 'motions', source: 'fbx', available: true },
  { id: 'fbx:2', name: 'Girl.fbx', format: 'FBX', kind: 'modelA', source: 'fbx', available: true },
  { id: 'integrated:x.glb', name: 'box.glb', format: 'GLB', kind: 'model', source: 'integrated', filename: 'x.glb', available: true },
  { id: 'integrated:y.glb', name: 'spin.glb', format: 'GLB', kind: 'motion', source: 'integrated', filename: 'y.glb', available: false },
  { id: 'mmd:A:m.pmx', name: 'm.pmx', format: 'PMX', kind: 'A', source: 'mmd', available: true },
  { id: 'mmd:vmd:d.vmd', name: 'd.vmd', format: 'VMD', kind: 'vmd', source: 'mmd', available: true },
];

test('categoryOf / sourceLabel by table', () => {
  assert.deepEqual(LIST.map(categoryOf), ['motion', 'char', 'char', 'motion', 'char', 'motion']);
  assert.deepEqual(LIST.map(sourceLabel), ['FBX登録（モーション）', 'FBX登録（モデルA）', 'GLB / VRM 登録', 'GLB / VRM 登録', 'MMD スロットA', 'MMD VMD']);
  assert.equal(sourceLabel({ source: 'fbx', kind: 'modelB' }), 'FBX登録（モデルB）');
  assert.equal(sourceLabel({ source: 'mmd', kind: 'B' }), 'MMD スロットB');
});

test('filterAssets: category, query, format, sort', () => {
  assert.equal(filterAssets(LIST, { cat: 'all' }).length, 6);
  assert.deepEqual(filterAssets(LIST, { cat: 'char' }).map((i) => i.name), ['Girl.fbx', 'box.glb', 'm.pmx']);
  assert.equal(filterAssets(LIST, { cat: 'motion' }).length, 3);
  assert.equal(filterAssets(LIST, { cat: 'stage' }).length, 0);
  assert.equal(filterAssets(LIST, { cat: 'fav' }).length, 0);
  assert.deepEqual(filterAssets(LIST, { q: 'GIRL' }).map((i) => i.name), ['Girl.fbx']);
  assert.deepEqual(filterAssets(LIST, { fmt: 'VMD' }).map((i) => i.name), ['d.vmd']);
  assert.deepEqual(filterAssets(LIST, { fmt: 'GLB', q: 'spin' }).map((i) => i.name), ['spin.glb']);
  assert.deepEqual(filterAssets(LIST, { sort: 'api' }).map((i) => i.id), LIST.map((i) => i.id));
  assert.deepEqual(filterAssets(LIST, { sort: 'name' }).map((i) => i.name), ['box.glb', 'd.vmd', 'Girl.fbx', 'm.pmx', 'spin.glb', 'walk.fbx']);
  assert.deepEqual(filterAssets(LIST, { sort: 'format' }).map((i) => i.format), ['FBX', 'FBX', 'GLB', 'GLB', 'PMX', 'VMD']);
  assert.deepEqual(LIST.map((i) => i.id), ['fbx:1', 'fbx:2', 'integrated:x.glb', 'integrated:y.glb', 'mmd:A:m.pmx', 'mmd:vmd:d.vmd'], 'the input is not mutated');
});

test('countByCategory / formatsOf / ASSET_CATS', () => {
  assert.deepEqual(countByCategory(LIST), { all: 6, char: 3, motion: 3, stage: 0, prop: 0, mat: 0, fx: 0, audio: 0, video: 0, image: 0 });
  assert.deepEqual(formatsOf(LIST), ['FBX', 'GLB', 'PMX', 'VMD']);
  assert.deepEqual(formatsOf([]), []);
  assert.equal(ASSET_CATS.find((c) => c.id === 'motion').label, 'モーション');
  assert.deepEqual(ASSET_CATS.map((c) => c.id), ['char', 'stage', 'prop', 'mat', 'fx', 'audio', 'video', 'image', 'motion']);
});

test('samples.js no longer carries ASSET_CATS (moved to assets-model.js)', () => {
  const src = fs.readFileSync(path.join(root, 'studio/js/samples.js'), 'utf8');
  assert.doesNotMatch(src, /export const ASSET_CATS/);
});
