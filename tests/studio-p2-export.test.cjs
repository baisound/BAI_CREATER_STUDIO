'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.P2_EXPORT_PORT || 8795);
const NAME = 'Boxing Leading Hand Jab';
const combo = {
  schema: 1, title: 'VMD用', timeline: [{ name: NAME }], selected: 1, playbackSpeed: 1,
  updatedAt: '2026-10-22T00:00:00.000Z', cursor: 0,
  history: [{ label: '初期状態', at: '2026-10-22T00:00:00.000Z', timeline: [{ name: NAME }], selected: 1, playbackSpeed: 1 }],
};

test('SCR-23 creates a VMD job without writing exports in the test', async () => {
  const server = await harness.startServer({ port: PORT, seed: {
    'project_state.json': JSON.stringify(combo),
    'manifest.json': JSON.stringify({ files: [{ id: 'motion-1', name: `${NAME}.fbx`, kind: 'motions' }], mapping: {} }),
    'files/motion-1.fbx': fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal_motion.fbx')),
  } });
  const browser = await server.launchBrowser();
  const page = await server.newPage(browser, { expectErrors: [/Failed to load resource: the server responded with a status of 503/] });
  const jobs = [], runs = [];
  try {
    // どちらもexports/へ書く実API。page.routeを先に登録してサーバーへ送らない。
    await page.route('**/api/export-vmd-job', async (route) => {
      jobs.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, job: 'exports/vmd_conversion_job.json' }) });
    });
    await page.route('**/api/run-vmd-conversion', async (route) => {
      runs.push(route.request().postDataJSON());
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Blender executable not found; set MIXAMO_BLENDER' }) });
    });
    await page.goto(`${server.base}/workspace/23`);
    await page.waitForSelector('[data-feature="exportPanel"]');
    await page.waitForFunction(() => document.querySelector('[data-role="vmd-combination"]')?.textContent.includes('1手順'));
    await page.waitForFunction(() => document.querySelector('[data-role="vmd-map-status"]')?.textContent.includes('既定のボーン対応表'));
    assert.equal(await page.isDisabled('[data-role="vmd-run"]'), true, 'ジョブを作る前に実行しない');
    await page.click('[data-role="vmd-job"]');
    await page.waitForFunction(() => document.querySelector('[data-role="vmd-job-status"]')?.textContent.includes('作成済み'));
    assert.equal(jobs.length, 1);
    assert.deepEqual(jobs[0].names, [`${NAME}.fbx`]);
    assert.equal(jobs[0].scale, 1);
    assert.equal(jobs[0].bone_map['mixamorig:Hips'], 'センター');
    assert.equal(await page.isDisabled('[data-role="vmd-run"]'), false);
    await page.selectOption('[data-role="vmd-slot"]', 'B');
    await page.click('[data-role="vmd-run"]');
    assert.equal(runs.length, 0, '確認前にはBlender実行要求を送らない');
    await page.click('[role="dialog"] [data-role="confirm-ok"]');
    await page.waitForFunction(() => document.querySelector('[data-role="vmd-run-status"]')?.textContent.includes('Blender executable not found'));
    assert.deepEqual(runs, [{ confirm: true, slot: 'B' }]);
    assert.equal(fs.existsSync(path.join(server.dataDir, 'conversion_status.json')), false, '503のスタブは実サーバーを書かない');
    await page.fill('[data-role="vmd-bone-map"]', '{bad json');
    assert.equal(await page.isDisabled('[data-role="vmd-run"]'), true, '対応表を変えたらジョブを作り直す');
    await page.click('[data-role="vmd-job"]');
    await page.waitForFunction(() => document.querySelector('[data-role="vmd-job-status"]')?.textContent.includes('JSONを読み取れません'));
    assert.equal(jobs.length, 1, '不正な対応表をサーバーへ送らない');
    await page.fill('[data-role="vmd-bone-map"]', '{"mixamorig:Hips":"センター"}');
    await page.click('[data-role="vmd-map-save"]');
    await page.waitForFunction(() => document.querySelector('[data-role="vmd-map-status"]')?.textContent.includes('保存しました'));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(server.dataDir, 'conversion_map.json'), 'utf8')), { 'mixamorig:Hips': 'センター' });
    await page.evaluate(() => window.baiStudio.navigate('13'));
    await page.click('.screen-head [data-act="nav"]');
    await page.waitForFunction(() => location.pathname.endsWith('/23'));
    assert.deepEqual(JSON.parse(await page.inputValue('[data-role="vmd-bone-map"]')), { 'mixamorig:Hips': 'センター' });
    assert.match(await page.textContent('[data-role="vmd-run-status"]'), /Blender executable not found/, '画面を離れても変換結果を保持');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-role="vmd-map-status"]')?.textContent.includes('保存済み'));
    assert.deepEqual(JSON.parse(await page.inputValue('[data-role="vmd-bone-map"]')), { 'mixamorig:Hips': 'センター' });
    harness.assertNoErrors(page);
  } finally { await page.context().close(); await browser.close(); await server.stop(); }
});

test('Blender status keeps polling after leaving SCR-23 and reports measured elapsed time', async () => {
  const server = await harness.startServer({ port: PORT + 1, seed: {
    'project_state.json': JSON.stringify(combo),
    'manifest.json': JSON.stringify({ files: [{ id: 'motion-1', name: `${NAME}.fbx`, kind: 'motions' }], mapping: {} }),
    'files/motion-1.fbx': fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal_motion.fbx')),
  } });
  const browser = await server.launchBrowser();
  const page = await server.newPage(browser);
  let running = false, finished = false, polls = 0;
  let started = 0;
  try {
    await page.route('**/api/export-vmd-job', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"job":"exports/vmd_conversion_job.json"}' }));
    await page.route('**/api/run-vmd-conversion', async (route) => {
      running = true; started = Date.now() / 1000;
      await new Promise((resolve) => setTimeout(resolve, 3500));
      finished = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"succeeded","name":"chain_motion.vmd","bytes":321}' });
    });
    await page.route('**/api/conversion-status', (route) => {
      polls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(finished
        ? { status: 'succeeded', name: 'chain_motion.vmd' }
        : running ? { status: 'running', started } : { status: 'idle' }) });
    });
    await page.goto(`${server.base}/workspace/23`);
    await page.waitForFunction(() => document.querySelector('[data-role="vmd-map-status"]')?.textContent.includes('既定のボーン対応表'));
    await page.click('[data-role="vmd-job"]');
    await page.waitForFunction(() => document.querySelector('[data-role="vmd-job-status"]')?.textContent.includes('作成済み'));
    await page.click('[data-role="vmd-run"]');
    await page.click('[role="dialog"] [data-role="confirm-ok"]');
    await page.evaluate(() => window.baiStudio.navigate('05'));
    await page.waitForFunction(() => location.pathname.endsWith('/05'));
    await page.waitForTimeout(1250);
    assert.ok(polls >= 2, 'SCR-23を離れても1秒間隔の状態取得を続ける');
    await page.evaluate(() => window.baiStudio.navigate('23'));
    await page.waitForFunction(() => /経過 [1-9]\d* 秒/.test(document.querySelector('[data-role="vmd-server-status"]')?.textContent || ''));
    await page.waitForFunction(() => document.querySelector('[data-role="vmd-run-status"]')?.textContent.includes('VMD変換完了'));
    await page.waitForFunction(() => document.querySelector('[data-role="vmd-server-status"]')?.textContent.includes('サーバー上の変換結果：成功'));
    assert.match(await page.textContent('[data-role="vmd-server-status"]'), /サーバー上の変換結果：成功/);
    harness.assertNoErrors(page);
  } finally { await page.context().close(); await browser.close(); await server.stop(); }
});
