'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/studio-harness.cjs');

const IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');
function wav() {
  const samples = 16000, data = Buffer.alloc(samples * 2), head = Buffer.alloc(44);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i * Math.PI / 16) * 5000), i * 2);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(8000, 24);
  head.writeUInt32LE(16000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
async function json(response) { assert.equal(response.status, 200); return response.json(); }

test('saved v0.5 image, WAV and MP4 clips share the selected project frame in real preview', async () => {
  const server = await harness.startServer({ port: 8891 });
  let browser, page;
  try {
    const image = await json(await fetch(`${server.base}/api/library-assets/upload?kind=image&name=frame.png`, {
      method: 'POST', body: IMAGE,
    }));
    const audio = await json(await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=tone.wav`, {
      method: 'POST', body: wav(),
    }));
    const video = await json(await fetch(`${server.base}/api/library-assets/upload?kind=video&name=motion.mp4`, {
      method: 'POST', body: fs.readFileSync(path.join(__dirname, 'fixtures', 'media_preview.mp4')),
    }));
    const project = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '実メディア時刻試験', kind: 'empty' }),
    }));
    const id = project.project.id;
    const emptyProject = await json(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '別の空作品', kind: 'empty' }),
    }));
    const place = async (assetId, track, start, duration, revision) => json(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: assetId, track, start, duration, revision }),
    }));
    const first = await place(image.item.id, 'image', 0, 3, 0);
    const second = await place(audio.item.id, 'audio', 1, 2, first.revision);
    await place(video.item.id, 'video', 3, 2, second.revision);
    browser = await server.launchBrowser();
    page = await server.newPage(browser);
    const response = await page.goto(`${server.base}/studio/v05/index.html`);
    assert.equal(response.status(), 200);
    await page.locator('#v06project').selectOption(id);
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68?.status().ready &&
      window.BAIStudioMediaPreviewV68.status().projectId === document.querySelector('#v06project').value);
    await page.locator('#nav [data-workspace="edit"]').click();
    assert.equal(await page.locator('#v68stage').isVisible(), true);
    await page.waitForFunction(() => document.querySelector('#v68layers img')?.naturalWidth === 1);
    assert.equal(await page.locator('#v68layers img').isVisible(), true);
    assert.equal(await page.locator('#v68layers audio').count(), 1);
    assert.equal((await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).mediaCount, 3);
    await page.locator('#v68frame').fill('60');
    await page.locator('#v68seek').click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68.status().frame === 60);
    await page.waitForFunction(async projectId => {
      const response = await fetch(`/api/studio/v05/playhead?id=${encodeURIComponent(projectId)}`);
      return response.ok && (await response.json()).seconds === 1;
    }, id);
    const saved = await json(await fetch(`${server.base}/api/studio/v05/playhead?id=${encodeURIComponent(id)}`));
    assert.equal(saved.seconds, 1);
    await page.locator('#v68play').click();
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68.status().frame > 66);
    assert.equal(await page.locator('#v68layers audio').evaluate(element => element.paused), false);
    await page.locator('#v68pause').click();
    const paused = (await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).frame;
    await page.waitForTimeout(150);
    assert.equal((await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).frame, paused);
    await page.locator('#v68frame').fill('180');
    await page.locator('#v68seek').click();
    await page.waitForFunction(() => document.querySelector('#v68layers video')?.readyState >= 2 &&
      window.BAIStudioMediaPreviewV68.status().frame === 180);
    assert.equal(await page.locator('#v68layers img').isVisible(), false);
    assert.equal(await page.locator('#v68layers video').isVisible(), true);
    await page.locator('#v68play').click();
    await page.waitForFunction(() => document.querySelector('#v68layers video')?.currentTime > 0.1);
    await page.locator('#v68pause').click();
    const videoPaused = (await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).frame;
    await page.reload();
    await page.locator('#v06project').selectOption(id);
    await page.waitForFunction(() => window.BAIStudioMediaPreviewV68?.status().ready &&
      window.BAIStudioMediaPreviewV68.status().projectId === document.querySelector('#v06project').value);
    await page.locator('#nav [data-workspace="edit"]').click();
    assert.ok((await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).frame >= videoPaused - 1);
    await page.locator('#v06project').selectOption(emptyProject.project.id);
    await page.waitForFunction(projectId => window.BAIStudioMediaPreviewV68.status().ready &&
      window.BAIStudioMediaPreviewV68.status().projectId === projectId, emptyProject.project.id);
    assert.equal((await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).mediaCount, 0);
    assert.equal(await page.locator('#v68stage').isVisible(), false);
    await page.locator('#v06project').selectOption(id);
    await page.waitForFunction(projectId => window.BAIStudioMediaPreviewV68.status().ready &&
      window.BAIStudioMediaPreviewV68.status().projectId === projectId, id);
    assert.equal((await page.evaluate(() => window.BAIStudioMediaPreviewV68.status())).mediaCount, 3);
  } finally { await page?.close(); await browser?.close(); await server.stop(); }
});
