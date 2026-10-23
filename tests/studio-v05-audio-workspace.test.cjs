'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/studio-harness.cjs');

function wav() {
  const samples = 24000, data = Buffer.alloc(samples * 2), head = Buffer.alloc(44);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i * Math.PI / 16) * 5000), i * 2);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(8000, 24);
  head.writeUInt32LE(16000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

test('v0.5 audio page plays actual WAV, shows its waveform, and saves the shared placement', async () => {
  const server = await harness.startServer({ port: 8885 });
  let browser, page;
  try {
    const upload = await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=v05_audio.wav`, {
      method: 'POST', body: wav(),
    });
    assert.equal(upload.status, 200);
    const id = (await upload.json()).item.id;
    const initial = await (await fetch(`${server.base}/api/music-dance/project`)).json();
    const preserved = { ...initial.project, model_id: 'integrated:untouched-model',
      motion_id: 'library:untouched-motion', motion_start_frame: 42 };
    const seed = await fetch(`${server.base}/api/music-dance/project`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': initial.revision },
      body: JSON.stringify(preserved),
    });
    assert.equal(seed.status, 200);
    browser = await server.launchBrowser();
    page = await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('[data-page="audio"]').click();
    await page.waitForFunction(() => document.querySelector('#baiAudioSelect')?.options.length > 1);
    assert.equal(await page.locator('#baiEq').count(), 0);
    assert.equal(await page.locator('#baiMixer').count(), 0);
    await page.locator('#baiAudioSelect').selectOption(id);
    await page.locator('#baiAudioWaves canvas').waitFor();
    assert.match(await page.locator('#baiAudioStatus').textContent(), /実音声と波形/);
    await page.locator('#baiAudioForward').click();
    assert.equal(await page.locator('#baiAudioFrame').inputValue(), '1');
    await page.locator('#baiAudioFastForward').click();
    assert.equal(await page.locator('#baiAudioFrame').inputValue(), '31');
    await page.locator('#baiAudioRewind').click();
    assert.equal(await page.locator('#baiAudioFrame').inputValue(), '1');
    await page.locator('#baiAudioBack').click();
    assert.equal(await page.locator('#baiAudioFrame').inputValue(), '0');
    await page.locator('#baiAudioPlay').click();
    await page.waitForFunction(() => Number(document.querySelector('#baiAudioFrame')?.value) > 5);
    assert.equal(await page.locator('#baiAudioPause').isDisabled(), false);
    await page.locator('#baiAudioPause').click();
    const paused = Number(await page.locator('#baiAudioFrame').inputValue());
    await page.waitForTimeout(150);
    assert.equal(Number(await page.locator('#baiAudioFrame').inputValue()), paused);
    await page.locator('#baiAudioStop').click();
    assert.equal(await page.locator('#baiAudioFrame').inputValue(), '0');
    await page.locator('#baiAudioStart').fill('30');
    await page.locator('#baiAudioStart').dispatchEvent('change');
    await page.locator('#baiAudioSource').fill('2');
    await page.locator('#baiAudioSource').dispatchEvent('change');
    await page.locator('#baiAudioSave').click();
    await page.waitForFunction(() => document.querySelector('#baiAudioStatus')?.textContent.includes('保存しました'));
    const result = await (await fetch(`${server.base}/api/music-dance/project`)).json();
    assert.equal(result.project.audio_id, id);
    assert.equal(result.project.audio_start_frame, 30);
    assert.equal(result.project.audio_source_frame, 2);
    assert.equal(result.project.model_id, preserved.model_id);
    assert.equal(result.project.motion_id, preserved.motion_id);
    assert.equal(result.project.motion_start_frame, 42);
    await page.reload();
    await page.locator('[data-page="audio"]').click();
    await page.waitForFunction((expected) => document.querySelector('#baiAudioSelect')?.value === expected, id);
    assert.equal(await page.locator('#baiAudioStart').inputValue(), '30');
    assert.equal(await page.locator('#baiAudioSource').inputValue(), '2');
    await page.locator('#baiAudioWaves canvas').waitFor();
    const latest = await (await fetch(`${server.base}/api/music-dance/project`)).json();
    const elsewhere = { ...latest.project, audio_start_frame: 45 };
    const externalSave = await fetch(`${server.base}/api/music-dance/project`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': latest.revision },
      body: JSON.stringify(elsewhere),
    });
    assert.equal(externalSave.status, 200);
    harness.expectErrors(page, [/Failed to load resource:.*409 \(Conflict\)/]);
    await page.locator('#baiAudioStart').fill('60');
    await page.locator('#baiAudioStart').dispatchEvent('change');
    await page.locator('#baiAudioSave').click();
    await page.waitForFunction(() => document.querySelector('#baiAudioStatus')?.textContent.includes('別画面で配置が変更'));
    const protectedProject = await (await fetch(`${server.base}/api/music-dance/project`)).json();
    assert.equal(protectedProject.project.audio_start_frame, 45);
    await page.locator('#baiAudioReload').click();
    await page.waitForFunction(() => document.querySelector('#baiAudioStart')?.value === '45');
    harness.assertNoErrors(page);
  } finally {
    await page?.context().close();
    await browser?.close();
    await server.stop();
  }
});
