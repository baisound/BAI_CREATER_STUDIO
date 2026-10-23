'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/studio-harness.cjs');

const IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');
let server, browser, projectId;

async function request(path, options) {
  const response = await fetch(server.base + path, options);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

test.before(async () => {
  server = await harness.startServer({ port: 8886 });
  const asset = await request('/api/library-assets/upload?kind=image&name=range.png', {
    method: 'POST', body: IMAGE, headers: { 'Content-Type': 'image/png' },
  });
  const project = await request('/api/studio/v05/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'In Out 隔離確認', kind: 'empty' }),
  });
  projectId = project.id || project.project?.id;
  assert.ok(projectId);
  const arrangement = await request(`/api/studio/v05/arrangement?id=${encodeURIComponent(projectId)}`);
  await request('/api/studio/v05/arrangement/place', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, asset_id: asset.item.id, track: 'image',
      start: 0, duration: 5, revision: arrangement.revision }),
  });
  browser = await server.launchBrowser();
});

test.after(async () => {
  await browser?.close();
  await server?.stop();
});

test('saved timeline In/Out survives reload and output shows the exact frame range', async () => {
  const page = await server.newPage(browser);
  try {
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.waitForFunction((id) => document.querySelector('#v06project')?.value === id, projectId);
    await page.waitForFunction(() => window.BAIStudioRenderRange?.status()?.final_frame === 299);
    assert.match(await page.locator('#v66RangeStatus').textContent(), /既定/);
    assert.equal(await page.locator('#baiAddRender').isDisabled(), true);

    await page.evaluate(() => window.baiGo('edit'));
    const time = page.locator('#v07timeline input[aria-label="再生位置 秒"]');
    await time.fill('0.5');
    await page.locator('#v07timeline button').filter({ hasText: '指定秒へ移動' }).click();
    await page.waitForFunction(() => window.BAIStudioPersistedSeek?.status()?.seconds === 0.5);
    await page.locator('#v66SetIn').click();
    await page.waitForFunction(() => window.BAIStudioRenderRange?.status()?.in_frame === 30);

    await page.locator('#v07timeline input[aria-label="再生位置 秒"]').fill('1.5');
    await page.locator('#v07timeline button').filter({ hasText: '指定秒へ移動' }).click();
    await page.waitForFunction(() => window.BAIStudioPersistedSeek?.status()?.seconds === 1.5);
    await page.locator('#v66SetOut').click();
    await page.waitForFunction(() => window.BAIStudioRenderRange?.status()?.out_frame === 90);
    const saved = await request(`/api/studio/v05/timeline/range?id=${encodeURIComponent(projectId)}`);
    assert.equal(saved.range_start_frame, 30);
    assert.equal(saved.range_end_exclusive, 91);
    assert.equal(saved.frame_count, 61);

    await page.evaluate(() => window.baiGo('output'));
    await page.waitForFunction(() => document.querySelector('#v66OutputRange')?.textContent.includes('F 30〜90'));
    assert.match(await page.locator('#v66OutputRange').textContent(), /F 30〜90（61フレーム、終了境界 91）/);
    const contract = await page.evaluate(() => window.BAIStudioRenderRange.jobRange());
    assert.deepEqual(contract, { projectId, arrangementRevision: saved.arrangement_revision,
      rangeStartFrame: 30, rangeEndExclusive: 91, fpsNum: 60, fpsDen: 1 });

    await page.reload();
    await page.waitForFunction(() => window.BAIStudioRenderRange?.status()?.out_frame === 90);
    assert.equal((await request(`/api/studio/v05/timeline/range?id=${encodeURIComponent(projectId)}`)).in_frame, 30);
    await page.evaluate(() => window.baiGo('edit'));
    await page.locator('#v66Clear').click();
    await page.waitForFunction(() => window.BAIStudioRenderRange?.status()?.out_frame === null);
    const reset = await request(`/api/studio/v05/timeline/range?id=${encodeURIComponent(projectId)}`);
    assert.equal(reset.range_start_frame, 0);
    assert.equal(reset.range_end_exclusive, 300);
    harness.assertNoErrors(page);
  } finally {
    await page.context().close();
  }
});
