'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');

function wav() {
  const samples = 16000, data = Buffer.alloc(samples * 4), head = Buffer.alloc(44);
  for (let i = 0; i < samples; i++) {
    const sample = Math.round(Math.sin(i * Math.PI / 16) * 5000);
    data.writeInt16LE(sample, i * 4); data.writeInt16LE(sample, i * 4 + 2);
  }
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(8000, 24);
  head.writeUInt32LE(32000, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
async function ok(response, expected = 200) { const body = await response.text(); assert.equal(response.status, expected, body); return JSON.parse(body); }

test('v0.5 saved In/Out exports real H.264/AAC MP4 and rejects omitted 3D', async () => {
  const server = await harness.startServer({ port: 8892 });
  let browser, page;
  try {
    const caps = await ok(await fetch(`${server.base}/api/studio/v05/render/capabilities`));
    assert.equal(caps.available, true, caps.reason);
    const image = await ok(await fetch(`${server.base}/api/library-assets/upload?kind=image&name=still.webp`, {
      method: 'POST', body: fs.readFileSync(path.join(__dirname, '..', 'studio', 'v05', 'assets', 'render-sakura.webp')),
    }));
    const audio = await ok(await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=tone.wav`, { method: 'POST', body: wav() }));
    const video = await ok(await fetch(`${server.base}/api/library-assets/upload?kind=video&name=motion.mp4`, {
      method: 'POST', body: fs.readFileSync(path.join(__dirname, 'fixtures', 'media_preview.mp4')),
    }));
    const project = await ok(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '実MP4試験', kind: 'empty' }),
    }));
    const id = project.project.id;
    const place = async (assetId, track, start, duration, revision) => ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: assetId, track, start, duration, revision }),
    }));
    const first = await place(image.item.id, 'image', 0, 2, 0);
    const second = await place(video.item.id, 'video', 1, 1, first.revision);
    const third = await place(audio.item.id, 'audio', 1, 1, second.revision);
    const range = await ok(await fetch(`${server.base}/api/studio/v05/timeline/range`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, revision: 0, arrangement_revision: third.revision,
        in_frame: 30, out_frame: 89 }),
    }));
    assert.equal(range.frame_count, 60);
    const body = { project_id: id, range_revision: range.revision,
      arrangement_revision: third.revision, resolution: '720p' };
    const wrong = await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, arrangement_revision: 0 }),
    });
    assert.equal(wrong.status, 409);
    const started = await ok(await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), 202);
    assert.equal(started.frame_count, 60);
    const deadline = Date.now() + 60000;
    let job;
    do {
      await new Promise(resolve => setTimeout(resolve, 350));
      job = await ok(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${started.id}`));
    } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
    assert.equal(job.status, 'succeeded', job.error);
    assert.equal(job.probe.frames, 60);
    assert.equal(job.probe.video_codec, 'h264');
    assert.equal(job.probe.audio_codec, 'aac');
    assert.equal(job.probe.width, 1280);
    const file = await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`);
    assert.equal(file.status, 200);
    assert.match(file.headers.get('content-type'), /video\/mp4/);
    const output = Buffer.from(await file.arrayBuffer());
    assert.ok(output.length > 1000);
    assert.equal(output.toString('ascii', 4, 8), 'ftyp');
    const decode = (args) => {
      const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...args],
        { input: output, maxBuffer: 8 * 1024 * 1024 });
      assert.equal(result.status, 0, result.stderr.toString());
      return result.stdout;
    };
    const frame = (seconds) => decode(['-ss', String(seconds), '-frames:v', '1', '-vf', 'scale=64:36',
      '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
    const firstFrame = frame(0.1), laterFrame = frame(0.75);
    assert.equal(firstFrame.length, 64 * 36 * 3);
    assert.equal(laterFrame.length, firstFrame.length);
    assert.notEqual(Buffer.compare(firstFrame, laterFrame), 0, 'saved image should change to the video clip');
    const audioRms = (seconds) => {
      const pcm = decode(['-ss', String(seconds), '-t', '0.1', '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1']);
      let sum = 0;
      for (let i = 0; i + 1 < pcm.length; i += 2) { const v = pcm.readInt16LE(i); sum += v * v; }
      return Math.sqrt(sum / Math.max(1, pcm.length / 2));
    };
    assert.ok(audioRms(0.1) < 80, 'audio must be silent before the saved clip start');
    assert.ok(audioRms(0.75) > 200, 'saved audio must be audible inside the clip');
    const listed = await ok(await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${id}`));
    assert.equal(listed.jobs[0].id, started.id);
    browser = await server.launchBrowser();
    page = await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="export"]').click();
    await page.waitForFunction(() => !document.querySelector('#baiAddRender')?.disabled);
    await page.locator('#v69result').waitFor({ state: 'visible' });
    assert.match(await page.locator('#v69video').getAttribute('src'), new RegExp(started.id));
    await page.locator('#baiAddRender').click();
    try {
      await page.waitForFunction(() => document.querySelectorAll('#baiRenderQueue .v69job').length >= 2 &&
        document.querySelector('#v69status')?.textContent.includes('完成'), null, { timeout: 15000 });
    } catch (error) {
      const ui = await page.evaluate(() => ({ status: document.querySelector('#v69status')?.textContent,
        queue: document.querySelector('#baiRenderQueue')?.textContent, disabled: document.querySelector('#baiAddRender')?.disabled }));
      const api = await (await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${id}`)).json();
      throw new Error(`${error.message}: ${JSON.stringify({ ui, jobs: api.jobs?.map(job => ({ id: job.id, status: job.status, error: job.error })) })}`);
    }
    const secondJobs = await ok(await fetch(`${server.base}/api/studio/v05/render/jobs?project_id=${id}`));
    assert.equal(secondJobs.jobs.filter(job => job.status === 'succeeded').length, 2);
    assert.notEqual(secondJobs.jobs[0].id, started.id);
    await page.reload();
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="export"]').click();
    await page.locator('#v69result').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#v69download').getAttribute('download') !== null, true);

    const glb = await ok(await fetch(`${server.base}/api/library-assets/upload?kind=stage&name=model.glb`, {
      method: 'POST', body: fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb')),
    }));
    const after = await place(glb.item.id, 'model', 0, 2, third.revision);
    const rejected = await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, arrangement_revision: after.revision }),
    });
    assert.equal(rejected.status, 422);
    assert.match((await rejected.json()).error, /3D/);
    const reread = await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`);
    assert.equal(reread.status, 200);
    assert.equal(Buffer.compare(Buffer.from(await reread.arrayBuffer()), output), 0);

    const withAudio = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i',
      path.join(__dirname, 'fixtures', 'media_preview.mp4'), '-f', 'lavfi', '-i',
      'sine=frequency=400:duration=2', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
      '-c:a', 'aac', '-shortest', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'],
    { maxBuffer: 16 * 1024 * 1024 });
    assert.equal(withAudio.status, 0, withAudio.stderr.toString());
    const audioVideo = await ok(await fetch(`${server.base}/api/library-assets/upload?kind=video&name=embedded.mp4`, {
      method: 'POST', body: withAudio.stdout,
    }));
    const secondProject = await ok(await fetch(`${server.base}/api/studio/v05/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '動画内音声検査', kind: 'empty' }),
    }));
    const secondId = secondProject.project.id;
    const embedded = await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: secondId, asset_id: audioVideo.item.id,
        track: 'video', start: 0, duration: 1, revision: 0 }),
    }));
    const omittedAudio = await fetch(`${server.base}/api/studio/v05/render/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: secondId, arrangement_revision: embedded.revision,
        range_revision: 0, resolution: '720p' }),
    });
    assert.equal(omittedAudio.status, 422);
    assert.match((await omittedAudio.json()).error, /動画内音声/);
  } finally { await page?.close(); await browser?.close(); await server.stop(); }
});
