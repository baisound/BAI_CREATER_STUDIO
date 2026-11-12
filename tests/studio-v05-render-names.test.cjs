'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const harness = require('./helpers/studio-harness.cjs');

async function json(response, expected = 200) {
  const body = await response.text();
  assert.equal(response.status, expected, body);
  return JSON.parse(body);
}
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function waitJob(base, id) {
  let job;
  const deadline = Date.now() + 60000;
  do {
    await new Promise(resolve => setTimeout(resolve, 350));
    job = await json(await fetch(`${base}/api/studio/v05/render/jobs?id=${id}`));
  } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
  assert.equal(job.status, 'succeeded', job.error);
  return job;
}

test('same named MP4 proposes a version and explicit replacement keeps a restorable old file', async () => {
  const server = await harness.startServer({ port: 8994 });
  let browser, page;
  try {
    const image = await json(await fetch(`${server.base}/api/library-assets/upload?kind=image&name=version.webp`, {
      method: 'POST', body: fs.readFileSync(path.join(__dirname, '..', 'studio', 'v05', 'assets', 'render-sakura.webp')),
    }));
    const project = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '完成物の版管理検査', kind: 'empty' }),
    }));
    const id = project.project.id;
    const placed = await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: image.item.id,
        track: 'image', start: 0, duration: 1, revision: 0 }),
    }));
    const body = { project_id: id, range_revision: 0,
      arrangement_revision: placed.revision, resolution: '720p' };
    const nameInfo = async name => json(await fetch(`${server.base}/api/studio/v05/render/name?project_id=${id}&name=${encodeURIComponent(name)}`));
    const start = async extra => json(await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, ...extra }),
    }), 202);
    const original = await start({ name: '作品', collision_mode: 'version' });
    const originalDone = await waitJob(server.base, original.id);
    assert.equal(originalDone.download_name, '作品.mp4');
    const originalBytes = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${original.id}`)).arrayBuffer());
    const firstPreview = await nameInfo('作品.mp4');
    assert.equal(firstPreview.exists, true);
    assert.equal(firstPreview.current_job_id, original.id);
    assert.equal(firstPreview.suggested_name, '作品-v02.mp4');
    const version = await start({ name: '作品', collision_mode: 'version' });
    const versionDone = await waitJob(server.base, version.id);
    assert.equal(versionDone.download_name, '作品-v02.mp4');
    const stale = await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, name: '作品', collision_mode: 'replace', replace_job_id: '0'.repeat(32) }),
    });
    assert.equal(stale.status, 409);
    const replacement = await start({ name: '作品', collision_mode: 'replace', replace_job_id: original.id });
    const replacementDone = await waitJob(server.base, replacement.id);
    assert.equal(replacementDone.download_name, '作品.mp4');
    const after = await nameInfo('作品.mp4');
    assert.equal(after.current_job_id, replacement.id);
    const listed = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${id}`));
    assert.equal(listed.jobs.find(job => job.id === original.id).delivery_state, 'archived');
    assert.equal(listed.jobs.find(job => job.id === replacement.id).delivery_state, 'current');
    assert.equal(listed.jobs.find(job => job.id === version.id).delivery_state, 'current');
    const keptOriginal = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${original.id}`)).arrayBuffer());
    assert.equal(sha(keptOriginal), sha(originalBytes));
    const badName = await fetch(`${server.base}/api/studio/v05/render/name?project_id=${id}&name=${encodeURIComponent('../escape')}`);
    assert.equal(badName.status, 400);
    browser = await server.launchBrowser();
    page = await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#nav [data-workspace="edit"]').click();await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="export"]').click();
    await page.locator('#v69name').fill('作品');
    await page.locator('#v69name').press('Tab');
    await page.waitForFunction(() => document.querySelector('#v69nameHint')?.textContent.includes('作品-v03.mp4'));
    assert.equal(await page.locator('#v69nameMode option[value="replace"]').isDisabled(), false);
    const archived = page.locator('.v69job').filter({ hasText: '作品.mp4（旧版）' });
    page.once('dialog', dialog => dialog.accept());
    await archived.getByRole('button', { name: 'この旧版を復元' }).click();
    await page.waitForFunction(() => document.querySelector('#v69status')?.textContent.includes('旧版を復元しました'));
    const restored = await nameInfo('作品.mp4');
    assert.equal(restored.current_job_id, original.id);
    const restoredList = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${id}`));
    assert.equal(restoredList.jobs.find(job => job.id === replacement.id).delivery_state, 'archived');
    assert.equal(restoredList.jobs.find(job => job.id === original.id).delivery_state, 'current');
    await page.locator('#v69nameMode').selectOption('replace');
    const beforeUiReplaceCount = restoredList.jobs.length;
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#baiAddRender').click();
    await page.waitForFunction(() => document.querySelector('#v69status')?.textContent.includes('置換を取りやめました'));
    assert.equal((await json(await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${id}`))).jobs.length,
      beforeUiReplaceCount);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#baiAddRender').click();
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('#baiRenderQueue .v69job');
      return rows.length > 3 && document.querySelector('#v69status')?.textContent.includes('完成');
    }, null, { timeout: 30000 });
    const uiReplaced = await nameInfo('作品.mp4');
    assert.notEqual(uiReplaced.current_job_id, original.id);
    assert.equal((await json(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${uiReplaced.current_job_id}`))).status,
      'succeeded');
    const staleRestore = await fetch(`${server.base}/api/studio/v05/render/restore`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, name: '作品.mp4', job_id: replacement.id,
        revision: after.revision, current_job_id: replacement.id }),
    });
    assert.equal(staleRestore.status, 409);
    const reread = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${original.id}`)).arrayBuffer());
    assert.equal(sha(reread), sha(originalBytes));
  } finally { await page?.close(); await browser?.close(); await server.stop(); }
});
