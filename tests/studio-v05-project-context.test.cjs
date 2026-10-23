'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/studio-harness.cjs');

const IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');
let server, browser, firstId, secondId;
async function request(path, options) {
  const response = await fetch(server.base + path, options);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}
async function createProject(name, assetId, duration) {
  const result = await request('/api/studio/v05/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, kind: 'empty' }),
  });
  const id = result.project.id;
  const arrangement = await request(`/api/studio/v05/arrangement?id=${encodeURIComponent(id)}`);
  await request('/api/studio/v05/arrangement/place', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: id, asset_id: assetId, track: 'image',
      start: 0, duration, revision: arrangement.revision }),
  });
  return id;
}

test.before(async () => {
  server = await harness.startServer({ port: 8887 });
  const asset = await request('/api/library-assets/upload?kind=image&name=project-context.png', {
    method: 'POST', body: IMAGE, headers: { 'Content-Type': 'image/png' },
  });
  firstId = await createProject('作品A 2秒', asset.item.id, 2);
  secondId = await createProject('作品B 5秒', asset.item.id, 5);
  browser = await server.launchBrowser();
});

test.after(async () => {
  await browser?.close();
  await server?.stop();
});

test('home card, saved timeline, output range and reload keep one project ID', async () => {
  const page = await server.newPage(browser);
  try {
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.waitForFunction(() => document.querySelectorAll('#baiProjectList [data-project]').length === 2);
    await page.waitForFunction((id) => document.querySelector('#v06project')?.value === id, firstId);
    await page.evaluate(() => window.baiGo('projects'));
    await page.locator('#baiProjectList [data-project]').filter({ hasText: '作品B 5秒' }).locator('[data-openproject]').click();
    await page.waitForFunction((id) => document.querySelector('#v06project')?.value === id &&
      window.BAIStudioPersistedSeek?.status()?.projectId === id &&
      window.BAIStudioRenderRange?.status()?.project_id === id, secondId);
    assert.equal((await request(`/api/studio/v05/timeline/range?id=${encodeURIComponent(secondId)}`)).final_frame, 299);
    await page.evaluate(() => window.baiGo('output'));
    await page.waitForFunction(() => document.querySelector('#v66OutputRange')?.textContent.includes('作品B 5秒'));
    assert.match(await page.locator('#v66OutputRange').textContent(), /F 0〜299/);

    await page.reload();
    await page.waitForFunction((id) => document.querySelector('#v06project')?.value === id &&
      document.querySelector('#baiProjectList [aria-current="true"]')?.textContent.includes('作品B 5秒'), secondId);
    await page.evaluate(() => window.baiGo('edit'));
    await page.locator('#v06project').selectOption(firstId);
    await page.waitForFunction((id) => document.querySelector('#baiProjectList [aria-current="true"]')?.textContent.includes('作品A 2秒') &&
      window.BAIStudioRenderRange?.status()?.project_id === id, firstId);
    assert.equal(await page.locator('#v06project').inputValue(), firstId);
    assert.equal(await page.evaluate(() => localStorage.getItem('bai.v05.activeProjectId.v1')), firstId);
    harness.assertNoErrors(page);
  } finally {
    await page.context().close();
  }
});

test('a delayed old arrangement cannot overwrite a newly selected project', async () => {
  const page = await server.newPage(browser);
  try {
    await page.route(`**/api/studio/v05/arrangement?id=${encodeURIComponent(firstId)}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.waitForFunction(() => document.querySelectorAll('#baiProjectList [data-project]').length === 2);
    await page.evaluate(() => window.baiGo('projects'));
    await page.locator('#baiProjectList [data-project]').filter({ hasText: '作品B 5秒' }).locator('[data-openproject]').click();
    await page.waitForFunction((id) => window.BAIStudioPersistedSeek?.status()?.projectId === id &&
      window.BAIStudioRenderRange?.status()?.project_id === id, secondId);
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('#v06project').inputValue(), secondId);
    assert.equal((await page.evaluate(() => window.BAIStudioPersistedSeek.status())).projectId, secondId);
    assert.equal((await page.evaluate(() => window.BAIStudioRenderRange.status())).final_frame, 299);
    harness.assertNoErrors(page);
  } finally {
    await page.context().close();
  }
});

test('a newly created project becomes the active saved timeline project', async () => {
  const page = await server.newPage(browser);
  try {
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.evaluate(() => window.baiGo('projects'));
    await page.locator('#bai-projects [data-action="newProject"]').click();
    await page.locator('#baiNewName').fill('作品C 新規');
    await page.locator('#baiDialogOK').click();
    await page.waitForFunction(() => document.querySelector('#baiProjectList [aria-current="true"]')?.textContent.includes('作品C 新規'));
    const id = await page.evaluate(() => localStorage.getItem('bai.v05.activeProjectId.v1'));
    assert.ok(id);
    await page.waitForFunction((expected) => document.querySelector('#v06project')?.value === expected &&
      window.BAIStudioRenderRange?.status()?.project_id === expected, id);
    assert.equal((await request(`/api/studio/v05/timeline/range?id=${encodeURIComponent(id)}`)).has_clips, false);
    harness.assertNoErrors(page);
  } finally {
    await page.context().close();
  }
});
