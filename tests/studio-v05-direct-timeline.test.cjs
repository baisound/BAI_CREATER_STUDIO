'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

async function json(response) { assert.equal(response.status, 200); return response.json(); }

test('drag registered image to saved timeline, move/resize, add lane, then reload', async () => {
  const server = await harness.startServer({ port: 8896 });
  let browser, page;
  try {
    const image = await json(await fetch(`${server.base}/api/library-assets/upload?kind=image&name=platformer.webp`, {
      method: 'POST', body: fs.readFileSync(path.join(__dirname, '..', 'studio', 'assets', 'samples', 'viewport-shrine.webp')),
    }));
    const project = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '画像タイムライン試験', kind: 'empty' }),
    }));
    const id = project.project.id;
    browser = await server.launchBrowser();
    page = await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v06cat').selectOption('image');
    await page.waitForFunction(() => document.querySelector('#v06results [draggable="true"]'));
    assert.equal(await page.locator('#v77TimelineShell #v07timeline').count(), 1);
    const source = page.locator('#v06results [draggable="true"]').first();
    const lane1 = page.locator('#v07timeline [data-track="image"][data-lane="1"]');
    await source.dragTo(lane1, { targetPosition: { x: 120, y: 15 } });
    await page.waitForFunction(() => document.querySelectorAll('#v07timeline [data-track="image"][data-lane="1"] [data-clip-id]').length === 1);
    let data = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    assert.equal(data.clips.length, 1);
    assert.equal(data.clips[0].lane, 1);
    assert.equal(data.clips[0].start, 5);
    const clip = page.locator(`#v07timeline [data-clip-id="${data.clips[0].id}"]`);
    await clip.scrollIntoViewIfNeeded();
    let rect = await clip.boundingBox();
    await page.mouse.move(rect.x + rect.width - 4, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width - 4 + 72, rect.y + rect.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(async projectId => (await (await fetch(`/api/studio/v05/arrangement?id=${projectId}`)).json()).clips[0].duration >= 7.9, id);
    await page.waitForFunction(() => document.querySelector('#v07timeline [data-clip-id]')?.title.includes('13秒'));
    data = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    assert.equal(data.clips[0].duration, 8);
    rect = await clip.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 48, rect.y + rect.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(async projectId => (await (await fetch(`/api/studio/v05/arrangement?id=${projectId}`)).json()).clips[0].start >= 6.9, id);
    await page.waitForFunction(() => Number(document.querySelector('#v07timeline [data-clip-id]')?.title.match(/\/ ([\d.]+)秒/)?.[1]) >= 6.9);
    await source.dragTo(lane1, { targetPosition: { x: 480, y: 15 } });
    await page.waitForFunction(async projectId => (await (await fetch(`/api/studio/v05/arrangement?id=${projectId}`)).json()).clips.length === 2, id);
    await page.getByRole('button', { name: '＋ 画像トラック' }).click();
    const lane2 = page.locator('#v07timeline [data-track="image"][data-lane="2"]');
    await lane2.waitFor();
    await source.dragTo(lane2, { targetPosition: { x: 0, y: 15 } });
    await page.waitForFunction(async projectId => (await (await fetch(`/api/studio/v05/arrangement?id=${projectId}`)).json()).clips.length === 3, id);
    await page.reload();
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await lane2.waitFor();
    data = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    assert.deepEqual(data.clips.map(c => c.lane).sort(), [1, 1, 2]);
    const firstImage = data.clips.find(c => c.lane === 1 && c.duration === 8);
    const gapImage = data.clips.find(c => c.lane === 1 && c.duration === 5);
    assert.ok(firstImage.start >= 6.9 && firstImage.start <= 7.2);
    assert.equal(firstImage.duration, 8);
    assert.equal(gapImage.start, 20);
    assert.ok(gapImage.start > firstImage.start + firstImage.duration);
    assert.equal((await json(await fetch(`${server.base}/api/studio/v05/timeline/layout?id=${id}`))).image_lanes, 2);
    await page.waitForFunction(projectId => window.BAIStudioMediaPreviewV68?.status().ready &&
      window.BAIStudioMediaPreviewV68.status().projectId === projectId &&
      window.BAIStudioMediaPreviewV68.status().mediaCount === 3, id);
    assert.equal(await page.locator('#v68layers img').count(), 3);
    await page.getByRole('button', { name: '＋ 画像トラック' }).click();
    await page.locator('#v07timeline [data-track="image"][data-lane="3"]').waitFor();
    const lane2Clip = data.clips.find(c => c.lane === 2);
    await page.locator(`#v07timeline [data-clip-id="${lane2Clip.id}"]`).dblclick();
    await page.locator('#v77EditLane').selectOption('3');
    await page.locator('#v08save').click();
    await page.waitForFunction(async projectId => (await (await fetch(`/api/studio/v05/arrangement?id=${projectId}`)).json()).clips.some(c => c.lane === 3), id);
    await page.locator('#v80RemoveLane').selectOption('2');
    await page.getByRole('button', { name: '空の画像行を削除' }).click();
    await page.waitForFunction(() => !document.querySelector('#v07timeline [data-track="image"][data-lane="2"]'));
    assert.equal(await page.locator('#v07timeline [data-track="image"][data-lane="3"]').count(), 1);
    await page.getByRole('button', { name: '＋ 画像トラック' }).click();
    await page.locator('#v07timeline [data-track="image"][data-lane="4"]').waitFor();
    await page.reload();
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    const layout = await json(await fetch(`${server.base}/api/studio/v05/timeline/layout?id=${id}`));
    assert.deepEqual(layout.image_lane_ids, [1, 3, 4]);
    assert.equal(layout.next_image_lane_id, 5);
    assert.deepEqual((await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`))).clips.map(c => c.lane).sort(), [1, 1, 3]);
  } finally { await page?.close(); await browser?.close(); await server.stop(); }
});
