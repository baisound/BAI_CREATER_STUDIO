// P2-WP-08a：手動IKポーズ補助のフォーク（pose-ik.fork.js）とモデル（pose-ik-model.js）を、旧 pose_ik_ui.js の実コードと照合する。ブラウザー不要。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { TEMPLATE, LIMBS, VIEW, sx, sy, pointerToTarget, clampFrame, svgParts } from '../studio/js/pose/pose-ik.fork.js';
import { canonicalPose, initialPose, createPoseIkModel } from '../studio/js/pose/pose-ik-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacy = fs.readFileSync(path.join(root, 'pose_ik_ui.js'), 'utf8');
const solved = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'pose_ik_template_solved.json'), 'utf8'));

test('TEMPLATE equals the legacy template literal and is deeply frozen', () => {
  const src = legacy.match(/const template=(\{.*\});\n/)?.[1];
  assert.ok(src, '旧 pose_ik_ui.js の template が見つかる');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(TEMPLATE)), JSON.parse(JSON.stringify(vm.runInNewContext(`(${src})`))));
  assert.ok(Object.isFrozen(TEMPLATE) && Object.isFrozen(TEMPLATE.limbs.rightArm) && Object.isFrozen(TEMPLATE.limbs.rightArm.target));
  assert.deepEqual(LIMBS.map((l) => l[0]), ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']);
  assert.deepEqual({ ...VIEW }, { width: 300, height: 260 });
});

test('sx, sy and pointerToTarget match the legacy expressions on 25 grid points', () => {
  const sxsy = legacy.match(/const (sx=x=>[^;]+);/)?.[1];
  const moveSrc = legacy.match(/function move\(e\)\{(.*?)calculate\(\)\}/s)?.[1];
  assert.ok(sxsy && moveSrc);
  const old = vm.runInNewContext(`const ${sxsy}; ({sx, sy})`);
  const rect = { left: 12, top: 30, width: 460, height: 398.67 };
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const x = -1.5 + i * 0.75, y = -0.2 + j * 0.55;
      assert.equal(sx(x), old.sx(x));
      assert.equal(sy(y), old.sy(y));
      const e = { clientX: rect.left + i * 111.3 + 7, clientY: rect.top + j * 97.9 + 3 };
      const ctx = { data: { limbs: { rightArm: {} } }, active: 'rightArm', svg: { getBoundingClientRect: () => rect } };
      vm.runInNewContext(`const svg=ctx.svg;const data=ctx.data;const active=ctx.active;${moveSrc}`, { ctx, e });
      assert.deepEqual(pointerToTarget(e.clientX, e.clientY, rect), [...ctx.data.limbs.rightArm.target]);
    }
  }
});

/** 旧 pose_ik_ui.js をそのまま動かし、描画された SVG 文字列（innerHTML）を返す。solveResponse は /api/pose/solve の応答。 */
async function legacyInnerHtml(solveResponse) {
  const el = () => ({ value: '', onchange: null, onclick: null, addEventListener() {}, setPointerCapture() {}, textContent: '', innerHTML: '' });
  const els = new Map();
  const document = { getElementById: (id) => { if (!els.has(id)) els.set(id, el()); return els.get(id); } };
  const fetch = async (url) => ({ ok: true, status: 200, json: async () => (url === '/api/pose/last' ? { schema: 1, frame: 0, limbs: {} } : solveResponse) });
  const sandbox = { document, fetch, structuredClone, window: {}, Object, Math, Number, JSON, Error };
  vm.runInNewContext(legacy, sandbox);
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  return els.get('pose-ik-svg').innerHTML;
}

/** `<tag a="1" b="2"/>` の並びを [{tag, attrs}] にする。 */
function parseSvg(html) {
  return [...html.matchAll(/<(\w+)([^>]*?)\/>/g)].map((m) => ({ tag: m[1], attrs: Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])) }));
}
const GEOMETRY = ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'width', 'height', 'd', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'data-limb'];

function assertMatchesLegacy(legacyHtml, parts) {
  const old = parseSvg(legacyHtml);
  assert.ok(old.length >= 5 + 3 * 4, `旧の部品が十分ある（${old.length}）`);
  assert.equal(parts.length, old.length, '部品の数');
  parts.forEach((p, i) => {
    assert.equal(p.tag, old[i].tag, `${i} 番目のタグ`);
    for (const key of GEOMETRY) {
      const want = old[i].attrs[key];
      const got = key === 'data-limb' ? p.limb : p.attrs[key];
      if (want === undefined) { assert.equal(got === undefined, true, `${i} 番目に ${key} は無い`); continue; }
      assert.equal(String(got), want, `${i} 番目の ${key}`);
    }
  });
}

test('svgParts matches the SVG the legacy script draws for the solved template', async () => {
  const html = await legacyInnerHtml(solved);
  const parts = svgParts(structuredClone(TEMPLATE), solved, 'rightArm');
  assertMatchesLegacy(html, parts);
  assert.equal(parts.filter((p) => p.limb).length, 4);
  assert.equal(parts.filter((p) => p.cls === 'pose-handle is-active').length, 1);
  assert.equal(parts.find((p) => p.cls === 'pose-handle is-active').limb, 'rightArm');
  assert.equal(parts.filter((p) => p.cls === 'pose-unreachable').length, 0);
});

test('svgParts draws the dashed requested circle for an unreachable limb like the legacy script', async () => {
  const far = structuredClone(solved);
  far.limbs.rightArm.reachable = false;
  far.limbs.rightArm.requested = [1.32, 2];
  const data = structuredClone(TEMPLATE);
  data.limbs.rightArm.target = [1.32, 2];
  const html = await legacyInnerHtml(far);
  // 旧は data が template のままなので、ハンドルの位置は template の目標。こちらも同じ data で比べる
  const parts = svgParts(structuredClone(TEMPLATE), far, 'rightArm');
  assertMatchesLegacy(html, parts);
  const dashed = parts.filter((p) => p.cls === 'pose-unreachable');
  assert.equal(dashed.length, 1);
  assert.equal(dashed[0].attrs['stroke-dasharray'], '4 3');
  assert.equal(dashed[0].attrs.cx, sx(1.32));
  assert.equal(dashed[0].attrs.cy, sy(2));
  assert.equal(svgParts(data, far, 'leftArm').filter((p) => p.cls === 'pose-handle is-active').length, 1);
});

test('clampFrame, initialPose and canonicalPose', () => {
  assert.equal(clampFrame(-3), 0);
  assert.equal(clampFrame(12.5), 13);
  assert.equal(clampFrame(12.7), 13);
  assert.equal(clampFrame('abc'), 0);
  assert.equal(clampFrame(2e6), 1000000);
  assert.equal(clampFrame('40'), 40);
  for (const last of [{ schema: 1, frame: 0, limbs: {} }, { schema: 1, frame: 0 }, null, undefined, { limbs: [] }]) {
    assert.deepStrictEqual(initialPose(last), JSON.parse(JSON.stringify(TEMPLATE)));
  }
  const saved = structuredClone(TEMPLATE);
  saved.limbs.rightArm.target = [0.9, 1.3];
  saved.frame = 7;
  assert.deepStrictEqual(initialPose(saved), saved);
  assert.notEqual(initialPose(saved), saved);
  assert.equal(canonicalPose({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 3 } }), canonicalPose({ a: { c: 3, d: [2, { y: 2, z: 1 }] }, b: 1 }));
  assert.notEqual(canonicalPose({ a: [1, 2] }), canonicalPose({ a: [2, 1] }));
});

/** 手で解決できる Promise。 */
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const ok = (data) => ({ ok: true, data });
const tick = () => new Promise((r) => setImmediate(r));

function harness({ last = ok({ schema: 1, frame: 0, limbs: {} }), solveFn, saveFn, kept = null } = {}) {
  const calls = { solve: [], save: [], load: 0 };
  const changes = [];
  const model = createPoseIkModel({
    solve: (d) => { calls.solve.push(structuredClone(d)); return solveFn ? solveFn(d) : Promise.resolve(ok({ limbs: { rightArm: { reachable: true }, leftArm: { reachable: false } } })); },
    save: (d) => { calls.save.push(structuredClone(d)); return saveFn ? saveFn(d) : Promise.resolve(ok({ ok: true })); },
    load: () => { calls.load++; return Promise.resolve(typeof last === 'function' ? last() : last); },
    onChange: (s) => changes.push(s.status),
    kept,
  });
  return { model, calls, changes };
}

test('model: moves during a solve are coalesced into one follow-up with the last value', async () => {
  const gates = [];
  const { model, calls } = harness({ solveFn: () => { const d = deferred(); gates.push(d); return d.promise; } });
  const init = model.init();
  await tick();
  gates[0].resolve(ok({ limbs: { rightArm: { reachable: true } } }));
  await init;
  assert.equal(calls.solve.length, 1);
  const a = model.setTarget('rightArm', [0.1, 0.1]);
  await tick();
  assert.equal(model.getState().busy, true);
  model.setTarget('rightArm', [0.2, 0.2]);
  model.setTarget('rightArm', [0.3, 0.3]);
  assert.equal(calls.solve.length, 2, '計算中は増えない');
  gates[1].resolve(ok({ limbs: { rightArm: { reachable: true } } }));
  await tick(); await tick();
  assert.equal(calls.solve.length, 3, '1 回目 + 最初の動き + 最後の動き');
  assert.deepEqual(calls.solve[2].limbs.rightArm.target, [0.3, 0.3]);
  gates[2].resolve(ok({ limbs: { rightArm: { reachable: false } } }));
  await a;
  const s = model.getState();
  assert.equal(s.busy, false);
  assert.equal(s.queued, false);
  assert.equal(s.status, '目標が届かないため、到達可能な位置に補正しました');
});

test('model: init uses the saved pose, reports solve errors, and falls back to TEMPLATE when load fails', async () => {
  const saved = structuredClone(TEMPLATE);
  saved.limbs.rightArm.target = [0.9, 1.3];
  const a = harness({ last: ok(saved) });
  await a.model.init();
  assert.deepStrictEqual(a.calls.solve[0], saved);
  assert.equal(a.model.getState().loaded, true);
  assert.equal(a.model.getState().synced, canonicalPose(saved));
  assert.equal(a.model.getState().status, 'IK計算済み（元モーション未変更）');

  const b = harness({ last: { ok: false, message: 'x' } });
  await b.model.init();
  assert.deepStrictEqual(b.calls.solve[0], JSON.parse(JSON.stringify(TEMPLATE)));
  assert.equal(b.model.getState().synced, null);

  const c = harness({ solveFn: async () => ({ ok: false, message: '汎用', serverMessage: 'invalid lengths or bend' }) });
  await c.model.init();
  assert.equal(c.model.getState().status, 'IK計算失敗：invalid lengths or bend');
  assert.equal(c.model.getState().statusKind, 'error');
  assert.equal(c.model.getState().loaded, true);
});

test('model: save stops on an external change and does not post', async () => {
  let latest = ok(structuredClone(TEMPLATE));
  const h = harness({ last: () => latest });
  await h.model.init();
  h.model.setFrame(12.7);
  assert.equal(h.model.getState().data.frame, 13);
  latest = ok({ ...structuredClone(TEMPLATE), frame: 99 });
  await h.model.save();
  assert.equal(h.calls.save.length, 0);
  assert.equal(h.model.getState().conflict, true);
  assert.match(h.model.getState().status, /外部（旧画面・MCP）でIK設定が変わっています/);
  // 上書きは比べずに保存する
  await h.model.overwrite();
  assert.equal(h.calls.save.length, 1);
  assert.equal(h.calls.save[0].frame, 13);
  assert.equal(h.model.getState().conflict, false);
  assert.equal(h.model.getState().status, '補正設定を保存しました。元素材は変更していません。');
  // 保存後は synced が新しくなり、次の保存は GET の内容が同じなら通る
  latest = ok(structuredClone(h.calls.save[0]));
  await h.model.save();
  assert.equal(h.calls.save.length, 2);
});

test('model: reloadDiscard takes the file content and clears the conflict', async () => {
  let latest = ok(structuredClone(TEMPLATE));
  const h = harness({ last: () => latest });
  await h.model.init();
  latest = ok({ schema: 1, frame: 5, limbs: { leftLeg: structuredClone(TEMPLATE.limbs.leftLeg) } });
  await h.model.save();
  assert.equal(h.model.getState().conflict, true);
  await h.model.reloadDiscard();
  assert.equal(h.model.getState().conflict, false);
  assert.equal(h.model.getState().data.frame, 5);
  assert.deepEqual(h.calls.solve.at(-1).limbs, { leftLeg: TEMPLATE.limbs.leftLeg });
  assert.equal(h.model.getState().synced, canonicalPose(latest.data));
});

test('model: save without a synced baseline (load failed at start) posts without comparing; failures are reported', async () => {
  const h = harness({ last: { ok: false, message: 'x' }, saveFn: async () => ({ ok: false, message: '汎用', serverMessage: 'frame out of bounds' }) });
  await h.model.init();
  const loads = h.calls.load;
  await h.model.save();
  assert.equal(h.calls.load, loads, '比べる読み込みはしない');
  assert.equal(h.calls.save.length, 1);
  assert.equal(h.model.getState().status, '保存失敗：frame out of bounds');
  assert.equal(h.model.getState().saving, false);
});

test('model: reset restores TEMPLATE without saving, and setData loads an unsaved pose with a message', async () => {
  const h = harness();
  await h.model.init();
  await h.model.setTarget('rightArm', [1, 1]);
  await h.model.reset();
  assert.deepStrictEqual(h.calls.solve.at(-1), JSON.parse(JSON.stringify(TEMPLATE)));
  assert.equal(h.calls.save.length, 0);
  const pose = structuredClone(TEMPLATE);
  pose.limbs.rightArm.target = [0.8, 1.29];
  await h.model.setData(pose, '未保存の提案');
  assert.deepStrictEqual(h.calls.solve.at(-1), pose);
  assert.equal(h.model.getState().status, '未保存の提案');
  assert.equal(h.calls.save.length, 0);
});

test('model: kept state skips the file read, and nothing is reported after dispose', async () => {
  const keptPose = structuredClone(TEMPLATE);
  keptPose.limbs.leftArm.target = [-1, 1];
  const h = harness({ kept: { data: keptPose, synced: 'S', active: 'leftArm' } });
  await h.model.init();
  assert.equal(h.calls.load, 0);
  assert.deepStrictEqual(h.calls.solve[0], keptPose);
  assert.equal(h.model.getState().active, 'leftArm');
  assert.equal(h.model.getState().synced, 'S');

  const gate = deferred();
  const d = harness({ solveFn: () => gate.promise });
  const init = d.model.init();
  await tick();
  const seen = d.changes.length;
  d.model.dispose();
  gate.resolve(ok({ limbs: {} }));
  await init;
  await tick();
  assert.equal(d.changes.length, seen, 'dispose の後は onChange を呼ばない');
});
