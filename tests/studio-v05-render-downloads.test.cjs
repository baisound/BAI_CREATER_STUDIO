'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const harness = require('./helpers/studio-harness.cjs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function json(r, expected = 200) {
  const text = await r.text(); assert.equal(r.status, expected, text); return JSON.parse(text);
}
const post = (s, route, body) => fetch(s.base + route, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function waitJob(server, id) {
  let job; const deadline = Date.now() + 60000;
  do { await new Promise(r => setTimeout(r, 100)); job = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${id}`)); }
  while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
  assert.equal(job.status, 'succeeded', job.error); return job;
}
async function downloadAndCheck(page, row, server, job, expectedName) {
  const pending = page.waitForEvent('download');
  await row.locator('a[data-action="download"]').click();
  const download = await pending;
  assert.equal(download.suggestedFilename(), expectedName);
  const saved = path.join(server.dataDir, `download-${job.id}.mp4`);
  await download.saveAs(saved);
  assert.equal(await download.failure(), null);
  assert.equal(sha(fs.readFileSync(saved)), job.sha256);
}

test('completed MP4s download from the list, survive reload/preparation errors and paginate without mixing projects',
  { timeout: 180000 }, async () => {
    let server;
    for (let port = 9101; port <= 9110; port++) {
      try { server = await harness.startServer({ port }); break; }
      catch (error) { if (!String(error).includes('既に使われています')) throw error; }
    }
    assert.ok(server, 'An unused isolated port is required; existing servers must remain untouched');
    let browser, page;
    try {
      const image = await json(await fetch(server.base + '/api/library-assets/upload?kind=image&name=background.webp', {
        method: 'POST', body: fs.readFileSync(path.join(__dirname, '../studio/v05/assets/render-sakura.webp')) }));
      const create = async name => {
        const p = await json(await post(server, '/api/studio/v05/projects', { name, kind: 'empty' }));
        const id = p.project.id;
        const a = await json(await post(server, '/api/studio/v05/arrangement/place', {
          project_id: id, asset_id: image.item.id, track: 'image', start: 0, duration: 1, revision: 0 }));
        const r = await json(await post(server, '/api/studio/v05/timeline/range', {
          project_id: id, revision: 0, arrangement_revision: a.revision, in_frame: 0, out_frame: 2 }));
        return { id, body: { project_id: id, range_revision: r.revision, arrangement_revision: a.revision, resolution: '720p' } };
      };
      const a = await create('ダウンロード作品A'), b = await create('ダウンロード作品B');
      browser = await server.launchBrowser(); page = await server.newPage(browser, { acceptDownloads: true });
      await page.goto(server.base + '/studio/v05/index.html');
      await page.locator('#v06project').selectOption(a.id);
      await page.locator('#nav [data-workspace="export"]').click();
      await page.waitForFunction(() => !document.querySelector('#baiAddRender').disabled);
      await page.locator('#v69name').fill('完成動画A');
      await page.locator('#baiAddRender').click();
      await page.waitForSelector('#v69completed a[data-action="download"]', { timeout: 60000 });
      const listed = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${a.id}`));
      const original = listed.jobs.find(j => j.status === 'succeeded'); assert.ok(original);
      await downloadAndCheck(page, page.locator(`.v69job[data-job-id="${original.id}"]`), server, original, '完成動画A.mp4');
      const replacement = await json(await post(server, '/api/studio/v05/render/jobs', {
        ...a.body, name: '完成動画A', collision_mode: 'replace', replace_job_id: original.id }), 202);
      const current = await waitJob(server, replacement.id);
      const other = await json(await post(server, '/api/studio/v05/render/jobs', { ...b.body, name: '別の作品B' }), 202);
      const otherDone = await waitJob(server, other.id);
      await page.locator('#v69refreshHistory').click();
      await page.waitForSelector(`.v69job[data-job-id="${original.id}"] button:has-text("この旧版を復元")`);
      await downloadAndCheck(page, page.locator(`.v69job[data-job-id="${original.id}"]`), server, original,
        `完成動画A-旧版-${original.id.slice(0, 8)}.mp4`);
      await page.reload(); await page.locator('#v06project').selectOption(a.id);
      await page.locator('#nav [data-workspace="export"]').click();
      await page.waitForSelector(`.v69job[data-job-id="${current.id}"] a[data-action="download"]`);
      assert.equal(await page.locator(`.v69job[data-job-id="${other.id}"]`).count(), 0);
      await page.locator('#v69historyProject').selectOption(b.id);
      await page.waitForSelector(`.v69job[data-job-id="${other.id}"] a[data-action="download"]`);
      assert.equal(await page.locator(`.v69job[data-job-id="${original.id}"]`).count(), 0);
      await downloadAndCheck(page, page.locator(`.v69job[data-job-id="${other.id}"]`), server, otherDone, '別の作品B.mp4');
      // Legacy saved-history fixtures reuse a verified MP4, rather than encoding 23 identical jobs.
      const root = path.join(server.dataDir, 'studio_v05_media_renders');
      let missingId;
      for (let i = 0; i < 23; i++) {
        const id = crypto.randomBytes(16).toString('hex');
        fs.writeFileSync(path.join(root, 'jobs', id + '.json'), JSON.stringify({ ...original,
          id, download_name: null, created_at: original.created_at - 60 * (i + 1), completed_at: original.completed_at - 60 * (i + 1) }));
        if (i < 22) fs.copyFileSync(path.join(root, 'files', original.id + '.mp4'), path.join(root, 'files', id + '.mp4'));
        else missingId = id;
      }
      const first = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${a.id}&completed=1`));
      assert.equal(first.total, 25); assert.equal(first.jobs.length, 20); assert.equal(first.has_more, true);
      const second = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${a.id}&completed=1&offset=20`));
      assert.equal(second.jobs.length, 5); assert.equal(second.has_more, false);
      assert.equal(new Set([...first.jobs, ...second.jobs].map(j => j.id)).size, 25);
      for (const query of ['offset=-1', 'limit=0', 'limit=101', 'completed=invalid']) {
        await json(await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${a.id}&${query}`), 400);
      }
      await page.locator('#v69historyProject').selectOption(a.id);
      await page.waitForFunction(() => document.querySelectorAll('#v69completed .v69job').length === 20);
      await page.getByRole('button', { name: '次の20件', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('#v69completed .v69job').length === 5);
      const missing = page.locator(`.v69job[data-job-id="${missingId}"]`);
      assert.match(await missing.textContent(), /完成ファイルが見つからない/);
      assert.equal(await missing.locator('a').count(), 0);
      await page.getByRole('button', { name: '前の20件', exact: true }).click();
      await page.waitForSelector(`.v69job[data-job-id="${current.id}"] a[data-action="download"]`);
      await page.route('**/api/studio/v05/render/capabilities', route => route.fulfill({
        status: 503, contentType: 'application/json', body: JSON.stringify({ error: '試験用: 新規出力の準備不可' }) }));
      await page.reload(); await page.locator('#v06project').selectOption(a.id);
      await page.locator('#nav [data-workspace="export"]').click();
      await page.waitForFunction(() => document.querySelector('#v69status').textContent.includes('書き出し準備に失敗'));
      assert.equal(await page.locator('#baiAddRender').isDisabled(), true);
      await page.waitForSelector(`.v69job[data-job-id="${current.id}"] a[data-action="download"]`);
      await downloadAndCheck(page, page.locator(`.v69job[data-job-id="${current.id}"]`), server, current, '完成動画A.mp4');
      await page.setViewportSize({ width: 390, height: 844 });
      const link = page.locator(`.v69job[data-job-id="${current.id}"] a[data-action="download"]`);
      await link.scrollIntoViewIfNeeded(); const box = await link.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
      const unavailable = /console: Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/;
      assert.ok(page.__monitor.errors.filter(e => unavailable.test(e)).length > 0);
      harness.expectErrors(page, [unavailable]); harness.assertNoErrors(page);
      if (process.env.BAI_RENDER_DOWNLOAD_SHOTS) {
        await page.unroute('**/api/studio/v05/render/capabilities');
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.reload(); await page.locator('#v06project').selectOption(a.id);
        await page.locator('#nav [data-workspace="export"]').click();
        await page.waitForSelector(`.v69job[data-job-id="${current.id}"] a[data-action="download"]`);
        fs.mkdirSync(process.env.BAI_RENDER_DOWNLOAD_SHOTS, { recursive: true });
        await page.locator('#v69historyCard').screenshot({ path: path.join(process.env.BAI_RENDER_DOWNLOAD_SHOTS, 'completed-downloads.png') });
        harness.assertNoErrors(page);
      }
      console.log(JSON.stringify({ actualDownloads: 4, matchingHashes: true, completedHistory: 25,
        pageSizes: [20, 5], oldVersion: true, worksWithoutNewRender: true, narrowWidth: 390 }));
    } finally { await page?.close(); await browser?.close(); await server.stop(); }
  });
