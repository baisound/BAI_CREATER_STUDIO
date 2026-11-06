'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function run(command, args) {
  const r = spawnSync(command, args, { maxBuffer: 32 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr.toString()); return r.stdout;
}
const ff = args => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
async function json(r, status = 200) {
  const text = await r.text(); assert.equal(r.status, status, text); return JSON.parse(text);
}
const post = (s, route, b) => fetch(s.base + route, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
function grayFrames(file) {
  return ff(['-i', file, '-an', '-vf', 'scale=1:1', '-pix_fmt', 'gray', '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1']);
}
function pts(file) {
  return JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames',
    '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', file])).frames.map(f => +f.best_effort_timestamp_time);
}
function at(times, values, seconds) {
  let i = 0; while (i + 1 < times.length && times[i + 1] <= seconds + 1e-6) i++;
  return values[i];
}
function pcm(file) {
  const bytes = ff(['-i', file, '-vn', '-ar', '8000', '-ac', '1', '-f', 's16le', 'pipe:1']);
  return Array.from({ length: bytes.length / 2 }, (_, i) => bytes.readInt16LE(i * 2));
}
function audioLag(source, output, sourceOffset, seconds, fps) {
  const outStart = Math.round(seconds * 8000), inputStart = (seconds + sourceOffset) * 8000;
  let best = { lag: 0, correlation: -1 };
  for (let lag = -Math.ceil(16000 / fps); lag <= Math.ceil(16000 / fps); lag++) {
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < 1600; i += 4) {
      const pos = inputStart + i, lo = Math.floor(pos), fraction = pos - lo;
      const a = (source[lo] || 0) * (1 - fraction) + (source[lo + 1] || 0) * fraction;
      const b = output[outStart + i + lag] || 0;
      dot += a * b; aa += a * a; bb += b * b;
    }
    const correlation = dot / Math.sqrt(aa * bb || 1);
    if (correlation > best.correlation) best = { lag, correlation };
  }
  return best;
}

test('WebM/OGV registration and VFR timestamp trims survive saved preview and MP4', { timeout: 240000 }, async () => {
  const server = await harness.startServer({ port: 9003 });
  let browser, page;
  try {
    browser = await server.launchBrowser(); page = await server.newPage(browser);
    page.on('requestfailed', request => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') console.log('Request failed:', request.url(), request.failure()?.errorText);
    });
    const observations = [];
    for (const [ext, codec, audio, vfr, fps] of [
      ['mp4', 'libx264', 'aac', true, 24], ['webm', 'libvpx-vp9', 'libopus', true, 29.97],
      ['mp4', 'libx264', 'aac', true, 60], ['ogv', 'libtheora', 'libvorbis', false, 30],
    ]) {
      const input = path.join(server.dataDir, `clock.${ext}`);
      // Alternate bright/dark every 400 ms. VFR gaps alternate 50/350 ms.
      // Classify the pixels so this clock test is independent of colour-range conversion.
      ff(['-f', 'lavfi', '-i', 'nullsrc=s=160x90:r=20:d=4', '-f', 'lavfi', '-i', 'aevalsrc=0.15*sin(2*PI*(317*t+173*t*t)):s=48000:d=4',
        '-vf', "geq=lum='if(mod(floor(N/8),2),210,40)+2*mod(N,8)':cb=128:cr=128" + (vfr ? ",select='eq(mod(n,8),0)+eq(mod(n,8),1)'" : ''),
        '-fps_mode', vfr ? 'vfr' : 'cfr', '-c:v', codec, '-c:a', audio, '-y', input]);
      const bytes = fs.readFileSync(input), hash = sha(bytes), times = pts(input), levels = grayFrames(input);
      assert.equal(times.length, levels.length);
      if (vfr) {
        const intervals = times.slice(1).map((x, i) => x - times[i]);
        assert.ok(Math.max(...intervals) > 0.3 && Math.min(...intervals) < 0.06, 'fixture must really be VFR');
      }
      const asset = await json(await fetch(`${server.base}/api/library-assets/upload?kind=video&name=clock.${ext}`, { method: 'POST', body: bytes }));
      const source = `${server.base}/api/library-assets/file/${encodeURIComponent(asset.item.id)}`;
      const range = await fetch(source, { headers: { Range: 'bytes=0-63' } });
      assert.equal(range.status, 206); assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 64));
      const project = await json(await post(server, '/api/studio/v05/projects', { name: `時刻既知${ext} ${fps}fps`, kind: 'empty' }));
      const id = project.project.id, sourceStart = 0.11, start = 0.37, duration = 3.2;
      const inFrame = Math.ceil((start + 0.1) * fps), frameCount = Math.round(2.8 * fps);
      await json(await post(server, '/api/studio/v05/project/fps', { project_id: id, fps }));
      const p = await json(await post(server, '/api/studio/v05/arrangement/place', {
        project_id: id, asset_id: asset.item.id, track: 'video', start, duration, revision: 0 }));
      assert.ok(p.clip.source_duration > 3.5 && p.clip.source_duration <= 4.1);
      const a = await json(await post(server, '/api/studio/v05/arrangement/clip/edit', {
        project_id: id, clip_id: p.clip.id, revision: p.revision, action: 'update',
        start, duration, track: 'video', lane: 1, source_start: sourceStart }));
      const saved = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
      assert.equal(saved.clips[0].source_start, sourceStart);
      assert.equal(saved.clips[0].source_has_audio, true);
      const rejected = await json(await post(server, '/api/studio/v05/arrangement/clip/edit', {
        project_id: id, clip_id: p.clip.id, revision: a.revision, action: 'update',
        start, duration, track: 'video', lane: 1, source_start: 4 }), 400);
      assert.match(rejected.error, /source media duration/);
      assert.deepEqual(await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`)), saved);
      await page.goto(server.base + '/studio/v05/index.html');
      await page.locator('#v06project').selectOption(id);
      await page.waitForFunction(id => window.BAIStudioMediaPreviewV68?.status().ready && window.BAIStudioMediaPreviewV68.status().projectId === id, id);
      await page.locator('#nav [data-workspace="edit"]').click();
      const video = page.locator('#v68layers video');
      await page.waitForFunction(() => { const v = document.querySelector('#v68layers video'); return v?.readyState >= 2 || v?.error; });
      const error = await video.evaluate(v => v.error?.code || 0);
      const videoWidth = await video.evaluate(v => v.videoWidth);
      if (error || !videoWidth) {
        assert.match(await page.locator('#v68status').textContent(), /再生できません/);
        assert.equal(await video.isVisible(), false);
        assert.equal(await page.locator('#v68play').isDisabled(), true);
      } else {
        for (const secondsInProject of [0.5, 1, 2.4, 3.3]) {
          const frame = Math.round(secondsInProject * fps);
          await page.locator('#v68frame').fill(String(frame)); await page.locator('#v68seek').click();
          const seconds = sourceStart + frame / fps - start;
          await page.waitForFunction(t => { const v = document.querySelector('#v68layers video'); return !v.seeking && Math.abs(v.currentTime - t) < 0.035; }, seconds);
          const level = await video.evaluate(v => { const c = document.createElement('canvas'); c.width = c.height = 1;
            const ctx = c.getContext('2d'); ctx.drawImage(v, 0, 0, 1, 1); return ctx.getImageData(0, 0, 1, 1).data[0]; });
          assert.equal(level > 128, at(times, levels, seconds) > 128, `${ext} preview F${frame}: ${level}`);
        }
        await page.locator('#v68play').click();
        await page.waitForFunction(() => document.querySelector('#v68layers video').currentTime > 3.24);
        await page.locator('#v68stop').click();
      }
      await page.reload(); await page.locator('#v06project').selectOption(id);
      await page.waitForFunction(id => window.BAIStudioMediaPreviewV68?.status().ready && window.BAIStudioMediaPreviewV68.status().projectId === id, id);
      if (error || !videoWidth) {
        await page.waitForFunction(() => /再生できません/.test(document.querySelector('#v68status').textContent));
        assert.equal(await page.locator('#v68play').isDisabled(), true);
      }
      const r = await json(await post(server, '/api/studio/v05/timeline/range', {
        project_id: id, revision: 0, arrangement_revision: a.revision, in_frame: inFrame, out_frame: inFrame + frameCount - 1 }));
      const started = await json(await post(server, '/api/studio/v05/render/jobs', {
        project_id: id, range_revision: r.revision, arrangement_revision: a.revision, resolution: '720p' }), 202);
      let job; const deadline = Date.now() + 60000;
      do { await new Promise(r => setTimeout(r, 200)); job = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${started.id}`)); }
      while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
      assert.equal(job.status, 'succeeded', job.error); assert.equal(job.probe.frames, frameCount);
      const output = path.join(server.dataDir, `output-${ext}.mp4`);
      fs.writeFileSync(output, Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer()));
      const actual = grayFrames(output); assert.equal(actual.length, frameCount);
      // Allow one output frame of quantization, rather than shifting the source clock to its next VFR frame.
      for (let frame = 0; frame < frameCount; frame++) {
        const seconds = sourceStart + (frame + inFrame) / fps - start;
        const acceptable = [-1, 0, 1].map(offset => at(times, levels, seconds + offset / fps));
        assert.ok(acceptable.some(level => (actual[frame] > 128) === (level > 128)),
          `${ext} MP4 F${frame}: ${actual[frame]} expected ${acceptable} at source ${seconds}`);
      }
      const sourcePcm = pcm(input), outputPcm = pcm(output);
      const audioResults = [0.1, 1.1, 2.4].map(seconds => audioLag(sourcePcm, outputPcm, sourceStart + inFrame / fps - start, seconds, fps));
      for (const result of audioResults) {
        assert.ok(Math.abs(result.lag) <= 8000 / fps && result.correlation > 0.98, JSON.stringify({ ext, fps, result }));
      }
      assert.equal(sha(fs.readFileSync(input)), hash);
      assert.equal(sha(Buffer.from(await (await fetch(source)).arrayBuffer())), hash);
      observations.push({ ext, vfr, fps, inputFrames: times.length, browserError: error, videoWidth, outputFrames: actual.length, audioResults, sha256: hash });
    }
    harness.assertNoErrors(page); console.log(JSON.stringify(observations));
  } finally { await page?.close(); await browser?.close(); await server.stop(); }
});
