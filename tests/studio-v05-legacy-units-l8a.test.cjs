'use strict';
// WP-L8a：取込で置いたキャラクター・ステージの大きさが、旧画面（② SCR-06・① camera.html）と一致するか
// （設計 docs/roadmap/WP_L8A_VISUAL_SCALE_DETAILED_DESIGN_20261104_JA.md §6.3）。
// 各ケースは測るだけを行って measured にため、全部を測ってから L8A_RESULT の1行を出し、最後にまとめて判定する。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');
const seed = require('./helpers/legacy-import-seed.cjs');
const { boxGlb } = require('./helpers/box-glb.cjs');

const REQUIRE_3D = process.env.BAI_REQUIRE_3D === '1';
const REQUIRE_REAL = process.env.BAI_REQUIRE_REAL === '1';
const fixtures = path.join(__dirname, 'fixtures');
const LEGACY_TAG = '（旧の大きさ）';
const LEGACY_HINT = '旧画面と同じ大きさで置いています（旧保存の取込で置いたもの）';
const PAGE = { viewport: { width: 1280, height: 720 }, expectErrors: [/unknown char code \d+\./] };

const CHAR_GLB = 'cccccccccccccccccccc.glb';
const SKIN_GLB = 'kkkkkkkkkkkkkkkkkkkk.glb';

// ---- 数の道具 ------------------------------------------------------------------------------
const diag = box => Math.hypot(...box.max.map((v, i) => v - box.min[i]));
const corners = box => [0, 1, 2, 3, 4, 5, 6, 7].map(k => [k & 1 ? box.max[0] : box.min[0], k & 2 ? box.max[1] : box.min[1], k & 4 ? box.max[2] : box.min[2]]);
/** p から外接箱の角までの最大の距離を s で割った値（§6.6）。 */
const rpOverS = (box, p, s) => Math.max(...corners(box).map(c => Math.hypot(...c.map((v, i) => v - p[i])))) / s;
const epsilon = (box, rps) => 0.00001 * (1 + diag(box) + rps);
const maxDiff = (a, b) => Math.max(...a.min.map((v, i) => Math.abs(v - b.min[i])), ...a.max.map((v, i) => Math.abs(v - b.max[i])));
const union = boxes => ({ min: [0, 1, 2].map(i => Math.min(...boxes.map(b => b.min[i]))), max: [0, 1, 2].map(i => Math.max(...boxes.map(b => b.max[i]))) });
const plain = box => box && { min: box.min.map(Number), max: box.max.map(Number) };

// ---- 旧保存を書く ---------------------------------------------------------------------------
function writeLegacy(dataDir, key, workspace) {
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  write('project_state.json', { schema: 1, timeline: [], history: [], cursor: -1, title: `L8a-${key}` });
  write('project_state.workspace.json', { frame: 0, clip: null, ...workspace });
  write('camera_project.json', { schema: 1, fps: 30, duration: 300, keys: [{ frame: 0, position: [0, 1.6, 5], target: [0, 1, 0], fov: 40 }] });
  fs.rmSync(path.join(dataDir, 'music_dance_project.json'), { force: true });
}

async function api(base, route, init) { return seed.ok(await fetch(base + route, init)); }

/** 旧保存を書いて作品を作り、取り込む。記録の手順と M3 の codes を返す。 */
async function importCase(server, key, workspace) {
  writeLegacy(server.dataDir, key, workspace);
  const id = await seed.createProjectWithSnapshot(server.base, `L8a-${key}`);
  const preview = await api(server.base, `/api/studio/v05/project/legacy-import-preview?id=${id}`);
  assert.ok(preview.ok, JSON.stringify(preview.reject));
  await seed.ok(await seed.post(server.base, '/api/studio/v05/project/legacy-import/apply',
    { id, expected: preview.expected, include: [], fps_policy: 'keep_if_same', confirm: true }));
  const record = (await api(server.base, `/api/studio/v05/project/legacy-import?id=${id}`)).record;
  const roles = Object.fromEntries(record.steps.filter(s => s.kind === 'scene_add').map(s => [s.role, s.instance_id]));
  const m3 = preview.items.find(item => item.id === 'M3');
  return { id, roles, m3Codes: m3 ? m3.codes : null };
}

/** ③で作品の3D場面を開き、インスタンスごとの frameProbe・選択欄・床を読む。 */
async function measureV05(page, server, id, name, floorStage) {
  await page.goto(`${server.base}/studio/v05/index.html`);
  await page.evaluate(() => window.baiGo('projects'));
  const card = page.locator('#baiProjectList .baiCard', { has: page.locator('h3', { hasText: name }) });
  await card.locator('[data-openproject]').click();
  await page.waitForFunction(pid => document.querySelector('#v06project')?.value === pid, id);
  const scene = await api(server.base, `/api/studio/v05/scene/instances?id=${id}`);
  await page.locator('#v70sceneOpen').click();
  await page.waitForFunction(count => window.BAIStudioMultiScenePreview?.status().loaded === count, scene.instances.length, { timeout: 240000 });
  const probes = await page.evaluate(ids => Object.fromEntries(ids.map(iid => [iid, window.BAIStudioMultiScenePreview.frameProbe(iid)])),
    scene.instances.map(row => row.id));
  const options = await page.locator('#v58-multi-preview select').first().evaluate(select =>
    [...select.options].map(o => ({ value: o.value, text: o.textContent, title: o.title })));
  const floor = floorStage ? await page.evaluate(stageId => {
    const fn = window.BAIStudioMultiScenePreview.floorProbe;
    return typeof fn === 'function' ? fn(stageId, [-2, 10, -12]) : null;
  }, floorStage) : null;
  return { instances: scene.instances, probes, options, floor };
}

/** ② SCR-06 の viewport の外接箱。 */
async function measureScr06(page, server, { stage, character }) {
  await page.goto(`${server.base}/workspace/06`);
  await page.waitForSelector('[data-feature="sceneViewport"]');
  await page.waitForFunction(() => window.baiStudio.project.getState().status === 'ready' && window.baiStudio.assets.getState().status === 'ready',
    null, { timeout: 60000 });
  if (stage) await page.waitForFunction(x => window.baiStudio.viewport.getState().stage?.assetId === x, stage, { timeout: 120000 });
  if (character) await page.waitForFunction(x => window.baiStudio.viewport.getState().character?.assetId === x, character, { timeout: 120000 });
  await page.waitForTimeout(300);
  return plain(await page.evaluate(() => window.baiStudio.viewport.getState().bounds));
}

/** ① camera.html で旧保存を復元し、頂点から測ったモデルの外接箱の最後の値。 */
async function measureCamera(page, server) {
  await page.goto(`${server.base}/camera.html`);
  await page.evaluate(() => {
    window.__l8aBounds = null;
    window.addEventListener('bai-camera-model-bounds', e => { if (e.detail?.source === 'model') window.__l8aBounds = e.detail; });
  });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#bundle-load').click();
  await page.waitForFunction(() => /復元しました/.test(document.querySelector('#bundle-status')?.textContent || ''), null, { timeout: 120000 });
  await page.waitForFunction(() => window.__l8aBounds, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  return plain(await page.evaluate(() => window.__l8aBounds));
}

function pair(name, legacy, v05, eps) {
  const diff = legacy && v05 ? maxDiff(legacy, v05) : null;
  return { name, legacy, v05, eps, max_abs_diff: diff, pass: diff !== null && diff <= eps };
}

test('L8a: imported character and stage match legacy SCR-06 and camera.html (cases S/G/K/P/F/A and control)',
  { ...(REQUIRE_3D ? {} : harness.skip3d()), timeout: 900000 }, async () => {
    if (REQUIRE_3D) assert.ok(harness.haveThree(), 'BAI_REQUIRE_3D=1 なのに node_modules/three がありません');
    const boxChar = boxGlb([0.5, 0.1, -0.2], [1.1, 1.7, 0.2]);
    const skin = fs.readFileSync(path.join(fixtures, 'synthetic_test_model.glb'));
    const fbx = fs.readFileSync(path.join(fixtures, 'minimal_model.fbx'));
    const server = await harness.startServer({ port: 8944, seed: {
      [`integrated_v02/assets/${CHAR_GLB}`]: boxChar,
      [`integrated_v02/assets/${SKIN_GLB}`]: skin,
      'integrated_v02/user_assets.json': JSON.stringify([
        { id: 'user-cccccccccccccccccccc', name: 'box_char.glb', filename: CHAR_GLB, kind: 'model', bytes: boxChar.length },
        { id: 'user-kkkkkkkkkkkkkkkkkkkk', name: 'skin_char.glb', filename: SKIN_GLB, kind: 'model', bytes: skin.length }]),
      'manifest.json': JSON.stringify({ files: [{ id: 'f-model', name: 'model.fbx', kind: 'modelA', size: fbx.length }], mapping: {} }),
      'files/f-model.fbx': fbx,
    } });
    let browser;
    const pages = [];
    try {
      const stage = await api(server.base, '/api/library-assets/upload?kind=stage&name=box_stage.glb', { method: 'POST', body: boxGlb([2, -0.5, -5], [12, 3.5, 1]) });
      const stageId = stage.item.id;
      await api(server.base, '/api/pmx-zip-upload?slot=A&name=minimal_pmx.zip', { method: 'POST', body: fs.readFileSync(path.join(fixtures, 'minimal_pmx.zip')) });
      const inventory = await api(server.base, '/api/assets');
      const pmxId = inventory.items.find(item => item.format === 'PMX').id;
      const charId = `integrated:${CHAR_GLB}`, skinId = `integrated:${SKIN_GLB}`;
      assert.ok(inventory.items.some(i => i.id === charId) && inventory.items.some(i => i.id === skinId) && inventory.items.some(i => i.id === 'fbx:f-model'));
      browser = await server.launchBrowser();
      const page = await server.newPage(browser, PAGE);
      pages.push(page);

      const stageT = { asset: stageId, position: [1, 0, -2], rotation: [0, 90, 0], scale: 1.5 };
      const cases = [
        { key: 'S', ws: { asset: '', stage: stageT }, char: null, camera: false },
        { key: 'G', ws: { asset: CHAR_GLB, character: { position: [0.5, 0, 1], rotation: [0, 0, 0], scale: 1.25 }, stage: stageT }, char: charId, camera: true },
        { key: 'K', ws: { asset: SKIN_GLB, character: { position: [0.5, 0, 1], rotation: [0, 90, 0], scale: 1.5 } }, char: skinId, camera: true },
        { key: 'P', ws: { asset: pmxId, character: { position: [-1, 0, 0.5], rotation: [0, 30, 0], scale: 1.2 } }, char: pmxId, camera: true },
        { key: 'F', ws: { asset: 'fbx:f-model', character: { position: [0, 0, 0], rotation: [0, -45, 0], scale: 2 } }, char: 'fbx:f-model', camera: true },
        { key: 'A', ws: { asset: CHAR_GLB }, char: charId, camera: true },
      ];
      const measured = [];
      for (const c of cases) {
        const imported = await importCase(server, c.key, c.ws);
        const hasStage = Boolean(c.ws.stage);
        const v05 = await measureV05(page, server, imported.id, `L8a-${c.key}`, hasStage ? imported.roles.stage : null);
        const scr06 = await measureScr06(page, server, { stage: hasStage ? stageId : null, character: c.char });
        const camera = c.camera ? await measureCamera(page, server) : null;
        const checks = [];
        for (const [role, iid] of Object.entries(imported.roles)) {
          const row = v05.instances.find(r => r.id === iid);
          checks.push({ name: `${role}.units`, ok: row?.units === 'legacy', detail: row?.units ?? null });
          const option = v05.options.find(o => o.value === iid);
          checks.push({ name: `${role}.option`, ok: option?.text === iid + LEGACY_TAG && option?.title === LEGACY_HINT, detail: option || null });
        }
        if (c.char) {
          const expected = c.key === 'A' ? ['UNIT_SEMANTICS_DIFFER'] : [];
          checks.push({ name: 'M3.codes', ok: JSON.stringify(imported.m3Codes) === JSON.stringify(expected), detail: imported.m3Codes });
        }
        const probe = role => imported.roles[role] && v05.probes[imported.roles[role]];
        const pairs = [];
        if (c.key === 'S') {
          const st = probe('stage');
          pairs.push(pair('S ステージ（SCR-06）', scr06, plain(st?.root), scr06 && epsilon(scr06, rpOverS(scr06, stageT.position, stageT.scale))));
        }
        if (c.char && c.key !== 'A') {
          const ch = probe('character');
          const p = c.ws.character.position, s = c.ws.character.scale;
          pairs.push(pair(`${c.key} キャラクター（camera.html）`, camera, plain(ch?.precise), camera && epsilon(camera, rpOverS(camera, p, s))));
        }
        if (c.key === 'G') {
          const st = probe('stage'), ch = probe('character');
          const both = st && ch ? union([plain(st.root), plain(ch.root)]) : null;
          const rps = scr06 && Math.max(rpOverS(scr06, stageT.position, stageT.scale), rpOverS(scr06, c.ws.character.position, c.ws.character.scale));
          pairs.push(pair('G 場面全体（SCR-06）', scr06, both, scr06 && epsilon(scr06, rps)));
        }
        if (c.key === 'A') {
          const ch = probe('character');
          pairs.push(pair('A キャラクター（SCR-06、既定の配置）', scr06, plain(ch?.root), scr06 && epsilon(scr06, rpOverS(scr06, [0, 0, 0], 1))));
        }
        measured.push({ key: c.key, id: imported.id, roles: imported.roles, m3Codes: imported.m3Codes, scr06, camera,
          floor: v05.floor, pairs, checks });
      }

      // 対照（印なしで同じ値を置く）。旧保存はケース S に戻す
      writeLegacy(server.dataDir, 'S', cases[0].ws);
      const controlId = await seed.createProjectWithSnapshot(server.base, 'L8a-control');
      const empty = await api(server.base, `/api/studio/v05/scene/instances?id=${controlId}`);
      const control = { emptyBefore: empty.instances.length === 0 };
      const added1 = await seed.ok(await seed.post(server.base, '/api/studio/v05/scene/instances', { project_id: controlId, action: 'add', revision: empty.revision,
        asset_id: stageId, transform: { position: [1, 0, -2], rotation: [0, 90, 0], scale: [1.5, 1.5, 1.5] } }));
      await seed.ok(await seed.post(server.base, '/api/studio/v05/scene/instances', { project_id: controlId, action: 'add', revision: added1.revision,
        asset_id: charId, transform: { position: [0.5, 0, 1], rotation: [0, 0, 0], scale: [1.25, 1.25, 1.25] } }));
      const cv = await measureV05(page, server, controlId, 'L8a-control', null);
      const cStage = cv.instances.find(r => r.asset_id === stageId), cChar = cv.instances.find(r => r.asset_id === charId);
      control.stage = plain(cv.probes[cStage.id].root);
      control.character = plain(cv.probes[cChar.id].precise);
      const S = measured.find(m => m.key === 'S'), G = measured.find(m => m.key === 'G');
      const epsS = S.pairs[0].eps, epsGc = G.pairs[0].eps;
      control.stageDiffFromLegacy = S.scr06 ? maxDiff(control.stage, S.scr06) : null;
      control.characterDiffFromLegacy = G.camera ? maxDiff(control.character, G.camera) : null;
      control.stageMatchesFormula = maxDiff(control.stage, { min: [-1.25, 0, -5.75], max: [3.25, 3, 1.75] }) <= epsS;
      control.characterMatchesFormula = maxDiff(control.character, { min: [0.03125, 0, 0.6875], max: [0.96875, 2.5, 1.3125] }) <= epsGc;
      control.stageSensitive = control.stageDiffFromLegacy !== null && control.stageDiffFromLegacy >= 100 * epsS;
      control.characterSensitive = control.characterDiffFromLegacy !== null && control.characterDiffFromLegacy >= 100 * epsGc;

      // 旧の基準画面そのものが、手で計算した値と合うか（§6.3 の表）
      const hand = [
        ['S', 'scr06', { min: [-6.5, -0.75, -20], max: [2.5, 5.25, -5] }, 0.000330],
        ['G', 'camera', { min: [1.125, 0.125, 0.75], max: [1.875, 2.125, 1.25] }, 0.0000523],
        ['G', 'scr06', { min: [-6.5, -0.75, -20], max: [2.5, 5.25, 1.25] }, 0.000383],
        ['K', 'camera', { min: [0.275, 0, 0.625], max: [0.725, 3, 1.375] }, 0.0000615],
        ['F', 'camera', { min: [0, 0, 0], max: [0.0141421, 0.02, 0.0141421] }, 0.0000104],
      ].map(([key, field, expected, eps]) => {
        const value = measured.find(m => m.key === key)[field];
        const diff = value ? maxDiff(value, expected) : null;
        return { key, field, expected, value, eps, diff, pass: diff !== null && diff <= eps };
      });
      const floors = ['S', 'G'].map(key => {
        const m = measured.find(x => x.key === key);
        const y = m.floor?.y ?? null;
        return { key, y, pass: y !== null && Math.abs(y - 5.25) <= epsS };
      });

      process.stdout.write('L8A_RESULT ' + JSON.stringify({ measured, control, hand, floors }) + '\n');

      for (const m of measured) {
        for (const p of m.pairs) assert.ok(p.pass, `${p.name}: 差 ${p.max_abs_diff} > ε ${p.eps}`);
        for (const c of m.checks) assert.ok(c.ok, `${m.key} ${c.name}: ${JSON.stringify(c.detail)}`);
      }
      for (const h of hand) assert.ok(h.pass, `基準の画面 ${h.key} ${h.field}: 差 ${h.diff} > ${h.eps}`);
      for (const f of floors) assert.ok(f.pass, `ステージの床 ${f.key}: ${f.y}`);
      assert.ok(control.emptyBefore, '対照の作品が空ではありません');
      assert.ok(control.stageMatchesFormula && control.characterMatchesFormula, `対照の③の値が計算上の値と違います: ${JSON.stringify(control)}`);
      assert.ok(control.stageSensitive && control.characterSensitive, `対照の差が 100ε 未満です: ${JSON.stringify(control)}`);
      for (const p of pages) harness.assertNoErrors(p);
    } finally {
      for (const p of pages) await p.close().catch(() => {});
      await browser?.close();
      await server.stop();
    }
  });

// ---- 実素材のケース R（所有者のPCで必須） -------------------------------------------------------
const sourceRoot = process.env.BAI_REAL_MMD_DATA;
const realModel = 'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const realPath = sourceRoot && path.join(sourceRoot, 'mmd', 'A', realModel);
const realAvailable = Boolean(realPath && fs.existsSync(realPath));

test('L8a case R: imported real PMX matches camera.html',
  { ...(REQUIRE_REAL || realAvailable ? {} : { skip: 'BAI_REAL_MMD_DATA に実PMXがありません' }),
    ...(REQUIRE_3D ? {} : harness.skip3d()), timeout: 600000 }, async () => {
    if (REQUIRE_3D) assert.ok(harness.haveThree(), 'BAI_REQUIRE_3D=1 なのに node_modules/three がありません');
    assert.ok(realAvailable, 'BAI_REQUIRE_REAL=1 なのに BAI_REAL_MMD_DATA に実PMXがありません');
    const meta = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'mmd_assets.json'), 'utf8'));
    const entries = meta.A.filter(row => row.name === realModel || row.name.startsWith('tex/'));
    const files = { 'mmd_assets.json': JSON.stringify({ A: entries, B: [], vmd: [] }) };
    for (const row of entries) files[`mmd/A/${row.name}`] = fs.readFileSync(path.join(sourceRoot, 'mmd', 'A', ...row.name.split('/')));
    const server = await harness.startServer({ port: 8945, seed: files });
    let browser, page;
    try {
      const pmxId = (await api(server.base, '/api/assets')).items.find(item => item.format === 'PMX').id;
      browser = process.env.BAI_REAL_GPU === '1'
        ? await require('playwright').chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
        : await server.launchBrowser();
      page = await server.newPage(browser, PAGE);
      const character = { position: [0.3, 0, -0.4], rotation: [0, 20, 0], scale: 1.1 };
      const imported = await importCase(server, 'R', { asset: pmxId, character });
      const v05 = await measureV05(page, server, imported.id, 'L8a-R', null);
      const camera = await measureCamera(page, server);
      const precise = plain(v05.probes[imported.roles.character]?.precise);
      const units = v05.instances.find(r => r.id === imported.roles.character)?.units ?? null;
      const result = pair('R 実PMX（camera.html）', camera, precise, camera && epsilon(camera, rpOverS(camera, character.position, character.scale)));
      process.stdout.write('L8A_REAL_RESULT ' + JSON.stringify({ ...result, units, renderer: (await harness.webglRenderer(page)).renderer }) + '\n');
      assert.equal(units, 'legacy');
      assert.ok(result.pass, `実PMX: 差 ${result.max_abs_diff} > ε ${result.eps}`);
      harness.assertNoErrors(page);
    } finally {
      await page?.close(); await browser?.close(); await server.stop();
    }
  });
