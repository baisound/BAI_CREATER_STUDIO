'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const harness = require('./helpers/studio-harness.cjs');

function zipEntry(buf, wanted) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0, n = buf.readUInt16LE(eocd + 10); i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const name = buf.toString('utf8', p + 46, p + 46 + nl), local = buf.readUInt32LE(p + 42);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const raw = buf.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    }
    p += 46 + nl + el + cl;
  }
  throw Error(`missing ZIP entry: ${wanted}`);
}

function testWav() {
  const samples = 8000, data = Buffer.alloc(samples * 2), head = Buffer.alloc(44);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i * Math.PI / 16) * 5000), i * 2);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(8000, 24); head.writeUInt32LE(16000, 28); head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

test('music and dance placement survives reload', async () => {
  const browser = await harness.launchBrowser();
  const server = await harness.startServer({ port: 8802 });
  let page;
  try {
    const upload = await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=sync_test.wav`, { method: 'POST', body: testWav() });
    if (upload.status !== 200) assert.fail(await upload.text());
    const id = (await upload.json()).item.id;
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/10`);
    await page.waitForFunction(() => document.querySelectorAll('[data-role="dance-audio"] option').length > 1);
    await page.selectOption('[data-role="dance-audio"]', id);
    await page.waitForFunction(() => document.querySelector('[data-role="dance-status"]')?.textContent.includes('配置しました'));
    assert.ok(await page.locator('[data-role="dance-audio-block"] canvas').count());
    await page.fill('[data-role="dance-start-frame"]', '30');
    await page.locator('[data-role="dance-start-frame"]').dispatchEvent('change');
    await page.click('[data-role="dance-source-next"]');
    await page.click('[data-role="dance-save"]');
    await page.waitForFunction(() => document.querySelector('[data-role="dance-save-status"]')?.textContent.includes('保存しました'));
    const saved = await (await fetch(`${server.base}/api/music-dance/project`)).json();
    assert.equal(saved.project.audio_id, id);
    assert.equal(saved.project.audio_start_frame, 30);
    assert.equal(saved.project.audio_source_frame, 1);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-role="dance-audio"]')?.value.startsWith('library:'));
    assert.equal(await page.inputValue('[data-role="dance-start-frame"]'), '30');
    assert.equal(await page.inputValue('[data-role="dance-source-frame"]'), '1');
    await page.fill('[data-role="dance-head"]', '30');
    await page.locator('[data-role="dance-head"]').dispatchEvent('input');
    await page.click('[data-role="dance-play"]');
    await page.waitForFunction(() => Number(document.querySelector('[data-role="dance-head"]')?.value) >= 35, null, { timeout: 5000 });
    assert.match(await page.textContent('[data-role="dance-source-times"]'), /音楽 [0-9.]+ 秒/);
    await page.click('[data-role="dance-pause"]');
    await page.goto(`${server.base}/workspace/08?asset=${encodeURIComponent(id)}`);
    await page.waitForFunction(() => document.querySelector('[data-role="use-in-dance"]'));
    await page.click('[data-role="use-in-dance"]');
    await page.waitForFunction(() => location.pathname.endsWith('/10'));
    await page.waitForFunction((expected) => document.querySelector('[data-role="dance-audio"]')?.value === expected, id);
    assert.equal(await page.inputValue('[data-role="dance-audio"]'), id);
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await server.stop(); await browser.close(); }
});

test('registered VMD and FBX dance choices preserve placement and explain model compatibility', async () => {
  const zip = fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal_pmx.zip'));
  const pmx = zipEntry(zip, 'model/test.pmx'), texture = zipEntry(zip, 'model/tex/a.png');
  const vmd = fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal.vmd'));
  const fbx = fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal_motion.fbx'));
  const glb = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb'));
  const server = await harness.startServer({ port: 8804, seed: {
    'mmd_assets.json': JSON.stringify({ A: [{ name: 'test.pmx', size: pmx.length }, { name: 'tex/a.png', size: texture.length }], B: [], vmd: [{ name: 'minimal.vmd', size: vmd.length }] }),
    'mmd/A/test.pmx': pmx, 'mmd/A/tex/a.png': texture, 'mmd/vmd/minimal.vmd': vmd,
    'manifest.json': JSON.stringify({ files: [{ id: 'f-dance', name: 'minimal_motion.fbx', kind: 'motions', size: fbx.length }], mapping: {} }),
    'files/f-dance.fbx': fbx,
    'integrated_v02/assets/test-model.glb': glb,
    'integrated_v02/user_assets.json': JSON.stringify([{ id: 'test-model', name: 'test-model.glb', filename: 'test-model.glb', kind: 'model', bytes: glb.length }]),
  } });
  const browser = await harness.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/10`);
    await page.waitForFunction(() => document.querySelector('[data-role="dance-motion"]')?.options.length === 3);
    const values = await page.locator('[data-role="dance-motion"] option').evaluateAll((els) => els.map((el) => el.value));
    assert.deepEqual(values.sort(), ['', 'fbx:f-dance', 'mmd:vmd:minimal.vmd']);
    await page.selectOption('[data-role="dance-model"]', 'mmd:A:test.pmx');
    await page.selectOption('[data-role="dance-motion"]', 'mmd:vmd:minimal.vmd');
    await page.waitForFunction(() => document.querySelector('[data-role="dance-pose-status"]')?.textContent.includes('VMDプレビュー中'));
    await page.fill('[data-role="dance-head"]', '15');
    await page.locator('[data-role="dance-head"]').dispatchEvent('input');
    await page.click('[data-role="dance-save"]');
    await page.waitForFunction(() => document.querySelector('[data-role="dance-save-status"]')?.textContent.includes('保存しました'));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-role="dance-pose-status"]')?.textContent.includes('VMDプレビュー中'));
    assert.equal(await page.inputValue('[data-role="dance-motion"]'), 'mmd:vmd:minimal.vmd');
    assert.equal(await page.inputValue('[data-role="dance-head"]'), '15');
    await page.selectOption('[data-role="dance-model"]', 'integrated:test-model.glb');
    await page.waitForFunction(() => document.querySelector('[data-role="dance-pose-status"]')?.textContent.includes('VMDはPMXモデルで再生できます'));
    await page.selectOption('[data-role="dance-motion"]', 'fbx:f-dance');
    await page.waitForFunction(() => document.querySelector('[data-role="dance-pose-status"]')?.textContent.includes('人体骨対応は不足'));
    assert.equal(await page.inputValue('[data-role="dance-motion"]'), 'fbx:f-dance');
    await page.goto(`${server.base}/workspace/08?asset=${encodeURIComponent('mmd:vmd:minimal.vmd')}`);
    await page.waitForSelector('[data-role="use-in-dance"]');
    await page.click('[data-role="use-in-dance"]');
    await page.waitForFunction(() => location.pathname.endsWith('/10') && document.querySelector('[data-role="dance-motion"]')?.value === 'mmd:vmd:minimal.vmd');
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await server.stop(); await browser.close(); }
});

const realFbx = process.env.BAI_REAL_DANCE_FBX;
const realFbxTargetPmx = process.env.BAI_REAL_DANCE_FBX_TARGET_PMX;
const realVmd = process.env.BAI_REAL_DANCE_VMD;
test('registered humanoid FBX animates a PMX model at two dance frames', { skip: realFbx && realFbxTargetPmx ? false : 'set BAI_REAL_DANCE_FBX and BAI_REAL_DANCE_FBX_TARGET_PMX' }, async () => {
  const motionBytes = fs.readFileSync(realFbx);
  const originalHash = crypto.createHash('sha256').update(motionBytes).digest('hex');
  const pmxHash = crypto.createHash('sha256').update(fs.readFileSync(realFbxTargetPmx)).digest('hex');
  const vmdHash = realVmd ? crypto.createHash('sha256').update(fs.readFileSync(realVmd)).digest('hex') : null;
  const pmxRoot = path.dirname(realFbxTargetPmx), pmxName = path.basename(realFbxTargetPmx);
  const entries = [];
  const seed = {
    'manifest.json': JSON.stringify({ files: [{ id: 'real-fbx-dance', name: 'registered-dance.fbx', kind: 'motions', size: motionBytes.length }], mapping: {} }),
    'files/real-fbx-dance.fbx': motionBytes,
  };
  const visit = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else { const name = path.relative(pmxRoot, file).replaceAll('\\', '/'); seed[`mmd/A/${name}`] = fs.readFileSync(file); entries.push({ name, size: fs.statSync(file).size }); }
  } };
  visit(pmxRoot);
  if (realVmd) seed['mmd/vmd/registered.vmd'] = fs.readFileSync(realVmd);
  seed['mmd_assets.json'] = JSON.stringify({ A: entries, B: [], vmd: realVmd ? [{ name: 'registered.vmd', size: fs.statSync(realVmd).size }] : [] });
  const server = await harness.startServer({ port: 8805, seed });
  const browser = await harness.launchBrowser();
  let page;
  try {
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/10`);
    await page.waitForFunction(() => !!document.querySelector('[data-role="dance-motion"] option[value="fbx:real-fbx-dance"]'));
    await page.selectOption('[data-role="dance-model"]', `mmd:A:${pmxName}`);
    await page.selectOption('[data-role="dance-motion"]', 'fbx:real-fbx-dance');
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-role="dance-pose-status"]');
      return status?.textContent.includes('プレビュー中') || status?.dataset.kind === 'error';
    }, null, { timeout: 30000 });
    assert.match(await page.textContent('[data-role="dance-pose-status"]'), /\d+本の骨で .*プレビュー中/);
    assert.equal(await page.inputValue('[data-role="dance-motion"]'), 'fbx:real-fbx-dance');
    const canvas = page.locator('[data-role="dance-viewport"] canvas').first();
    await page.fill('[data-role="dance-head"]', '0'); await page.locator('[data-role="dance-head"]').dispatchEvent('input');
    await page.waitForTimeout(150);
    const first = crypto.createHash('sha256').update(await canvas.screenshot()).digest('hex');
    await page.fill('[data-role="dance-head"]', '15'); await page.locator('[data-role="dance-head"]').dispatchEvent('input');
    await page.waitForTimeout(150);
    const second = crypto.createHash('sha256').update(await canvas.screenshot()).digest('hex');
    assert.notEqual(second, first, 'FBX pose changes the loaded PMX preview between frames');
    await page.click('[data-role="dance-save"]');
    await page.waitForFunction(() => document.querySelector('[data-role="dance-save-status"]')?.textContent.includes('保存しました'));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-role="dance-motion"]')?.value === 'fbx:real-fbx-dance');
    await page.waitForFunction(() => document.querySelector('[data-role="dance-pose-status"]')?.textContent.includes('プレビュー中'));
    if (realVmd) {
      await page.selectOption('[data-role="dance-motion"]', 'mmd:vmd:registered.vmd');
      await page.waitForFunction(() => {
        const status = document.querySelector('[data-role="dance-pose-status"]');
        return status?.textContent.includes('VMDプレビュー中') || status?.dataset.kind === 'error';
      }, null, { timeout: 60000 });
      assert.match(await page.textContent('[data-role="dance-pose-status"]'), /VMDプレビュー中/);
      await page.fill('[data-role="dance-head"]', '30'); await page.locator('[data-role="dance-head"]').dispatchEvent('input');
      assert.match(await page.textContent('[data-role="dance-source-times"]'), /ダンス [0-9.]+ 秒/);
      await page.click('[data-role="dance-save"]');
      await page.waitForFunction(() => document.querySelector('[data-role="dance-save-status"]')?.textContent.includes('保存しました'));
      await page.reload();
      await page.waitForFunction(() => document.querySelector('[data-role="dance-motion"]')?.value === 'mmd:vmd:registered.vmd');
      await page.waitForFunction(() => document.querySelector('[data-role="dance-pose-status"]')?.textContent.includes('VMDプレビュー中'), null, { timeout: 60000 });
    }
    harness.assertNoErrors(page);
  } finally { await page?.context().close(); await server.stop(); await browser.close(); }
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(realFbx)).digest('hex'), originalHash);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(realFbxTargetPmx)).digest('hex'), pmxHash);
  if (realVmd) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(realVmd)).digest('hex'), vmdHash);
});

// Optional local proof with owner-provided files. Only temporary copies are served;
// paths and originals are not written to Git or changed by the test.
const realPmx = process.env.BAI_REAL_DANCE_PMX;
const realGlb = process.env.BAI_REAL_DANCE_GLB;
const realAudio = process.env.BAI_REAL_DANCE_AUDIO;
test('real PMX and GLB dance preview', { skip: realPmx && realGlb ? false : 'set BAI_REAL_DANCE_PMX and BAI_REAL_DANCE_GLB' }, async () => {
  const browser = await harness.launchBrowser();
  const pmxName = path.basename(realPmx);
  const glbName = 'local_dance.glb';
  const seed = {
    [`mmd/A/${pmxName}`]: fs.readFileSync(realPmx),
    [`integrated_v02/assets/${glbName}`]: fs.readFileSync(realGlb),
    'integrated_v02/user_assets.json': JSON.stringify([{ id: 'local-test-dance', name: 'Local dance', filename: glbName, kind: 'motion', bytes: fs.statSync(realGlb).size }]),
  };
  const mmdEntries = [{ name: pmxName, size: fs.statSync(realPmx).size }];
  const textures = path.join(path.dirname(realPmx), 'tex');
  if (fs.existsSync(textures)) {
    const visit = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else { const name = path.relative(path.dirname(realPmx), file).replaceAll('\\', '/'); seed[`mmd/A/${name}`] = fs.readFileSync(file); mmdEntries.push({ name, size: fs.statSync(file).size }); }
    } };
    visit(textures);
  }
  seed['mmd_assets.json'] = JSON.stringify({ A: mmdEntries });
  const server = await harness.startServer({ port: 8803, seed });
  let page;
  try {
    const beforeHashes = [realPmx, realGlb, realAudio].filter(Boolean).map(p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
    let audioId = '';
    if (realAudio) {
      const upload = await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=${encodeURIComponent(path.basename(realAudio))}`, { method: 'POST', body: fs.readFileSync(realAudio) });
      if (upload.status !== 200) assert.fail(await upload.text());
      audioId = (await upload.json()).item.id;
    }
    page = await server.newPage(browser);
    await page.goto(`${server.base}/workspace/10`);
    await page.waitForFunction(() => document.querySelectorAll('[data-role="dance-model"] option').length > 1);
    await page.selectOption('[data-role="dance-model"]', `mmd:A:${pmxName}`);
    await page.selectOption('[data-role="dance-motion"]', `integrated:${glbName}`);
    if (audioId) {
      await page.selectOption('[data-role="dance-audio"]', audioId);
      await page.waitForFunction(() => document.querySelector('[data-role="dance-status"]')?.textContent.includes('配置しました'), null, { timeout: 60000 });
      assert.ok(await page.locator('[data-role="dance-audio-block"] canvas').count());
    }
    await page.waitForFunction(() => document.querySelector('[data-role="dance-pose-status"]')?.textContent.includes('骨で'), null, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('[data-role="dance-physics-status"]')?.textContent.includes('動的剛体'), null, { timeout: 60000 });
    assert.match(await page.textContent('[data-role="dance-physics-status"]'), /動的剛体 \d+、ジョイント \d+/);
    const pose = await page.textContent('[data-role="dance-pose-status"]');
    assert.match(pose, /[2-9][0-9]本の骨/);
    if (audioId) {
      for (const f of [0, 4000, 8200]) {
        await page.fill('[data-role="dance-head"]', String(f));
        await page.locator('[data-role="dance-head"]').dispatchEvent('input');
        await page.waitForFunction((expected) => document.querySelector('[data-role="dance-head-label"]')?.textContent.includes(`F ${expected} /`), f);
        assert.match(await page.textContent('[data-role="dance-source-times"]'), /音楽 [0-9.]+ 秒/);
      }
      await page.click('[data-role="dance-save"]');
      await page.waitForFunction(() => document.querySelector('[data-role="dance-save-status"]')?.textContent.includes('保存しました'));
      await page.reload();
      await page.waitForFunction((expected) => document.querySelector('[data-role="dance-audio"]')?.value === expected, audioId);
      assert.equal(await page.inputValue('[data-role="dance-model"]'), `mmd:A:${pmxName}`);
      assert.equal(await page.inputValue('[data-role="dance-motion"]'), `integrated:${glbName}`);
      await page.waitForFunction(() => document.querySelector('[data-role="dance-physics-status"]')?.textContent.includes('動的剛体'), null, { timeout: 60000 });
    }
    const shotDir = process.env.REAL_DANCE_SHOTS;
    if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, 'pmx-glb-sync-frame000.png') }); }
    await page.fill('[data-role="dance-head"]', '300');
    await page.locator('[data-role="dance-head"]').dispatchEvent('input');
    await page.waitForFunction(() => document.querySelector('[data-role="dance-head-label"]')?.textContent.includes('F 300'));
    assert.ok(await page.locator('[data-role="dance-viewport"] canvas').count());
    if (shotDir) {
      await page.screenshot({ path: path.join(shotDir, 'pmx-glb-sync-frame300.png') });
    }
    await page.locator('[data-role="dance-physics"]').uncheck();
    if (shotDir) await page.screenshot({ path: path.join(shotDir, 'pmx-glb-sync-frame300-no-physics.png') });
    await page.selectOption('[data-role="dance-model"]', '');
    await page.waitForTimeout(500);
    harness.assertNoErrors(page);
    const afterHashes = [realPmx, realGlb, realAudio].filter(Boolean).map(p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
    assert.deepEqual(afterHashes, beforeHashes, 'owner media must stay byte-identical');
  } finally { await page?.context().close(); await server.stop(); await browser.close(); }
});
