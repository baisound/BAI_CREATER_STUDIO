'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');
const root = process.env.BAI_REAL_MMD_DATA;
const nativeVideo = process.env.BAI_NATIVE_MIXED_VIDEO;
const indexPath = root && path.join(root, 'library_assets', 'index.json');
const available = indexPath && fs.existsSync(indexPath) && (!nativeVideo || fs.existsSync(nativeVideo));
const rate = 8000;
const fpsValues = (process.env.BAI_LONG_MIXED_FPS || '24,29.97,60').split(',').map(Number);
assert.ok(fpsValues.length && fpsValues.every(x => [24, 29.97, 60].includes(x)));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
async function digestFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function ffmpeg(args, maxBuffer = 64 * 1024 * 1024) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer });
  assert.equal(r.status, 0, r.stderr.toString()); return r.stdout;
}
function pcm(file) {
  const b = ffmpeg(['-i', file, '-map', '0:a:0', '-ar', String(rate), '-ac', '1', '-f', 's16le', 'pipe:1']);
  return Int16Array.from({ length: b.length / 2 }, (_, i) => b.readInt16LE(i * 2));
}
async function json(response, status = 200) {
  const text = await response.text(); assert.equal(response.status, status, text); return JSON.parse(text);
}
const post = (s, route, body) => fetch(s.base + route, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function sample(a, at) {
  if (at < 0 || at + 1 >= a.length) return 0;
  const lo = Math.floor(at), t = at - lo; return a[lo] * (1 - t) + a[lo + 1] * t;
}
function correlate(expected, output, offset, fps) {
  let best = { lag: 0, correlation: -1 };
  const limit = Math.ceil(rate / fps * 2);
  for (let lag = -limit; lag <= limit; lag++) {
    let aa = 0, bb = 0, dot = 0;
    for (let i = 0; i < expected.length; i += 8) {
      const a = expected[i], b = output[offset + i + lag] || 0;
      aa += a * a; bb += b * b; dot += a * b;
    }
    const correlation = dot / Math.sqrt(aa * bb || 1);
    if (correlation > best.correlation) best = { lag, correlation };
  }
  return best;
}
const round = x => Math.round(x * 1e6) / 1e6;

test(`${nativeVideo ? 'native embedded audio' : 'derived embedded song'} and split independent song keep 230s timeline clocks at multiple fps`,
  { skip: !available && 'BAI_REAL_MMD_DATA is required', timeout: 1800000 }, async () => {
    const index = JSON.parse(fs.readFileSync(indexPath));
    const ids = ['library:e1d28fe47744328e3d66fe54', 'library:fd895f1ca8efd8b2bfbe0f43', 'library:3be86086c554aeafc86fc914'];
    const entries = ids.map(id => index.items.find(x => x.id === id));
    assert.ok(entries.every(Boolean));
    const originals = entries.map(e => path.join(root, 'library_assets', 'files', e.filename));
    const protectedFiles = [...originals, indexPath, ...(nativeVideo ? [nativeVideo] : [])];
    const before = await Promise.all(protectedFiles.map(digestFile));
    assert.deepEqual(before.slice(0, 3), entries.map(e => e.sha256));
    const server = await harness.startServer({ port: Number(process.env.BAI_LONG_MIXED_PORT || 8995) });
    let browser, page;
    try {
      const caps = await json(await fetch(`${server.base}/api/studio/v05/render/capabilities`));
      assert.equal(caps.available, true, caps.reason);
      assert.ok(['-/filter_complex', '-filter_complex_script'].includes(caps.filter_complex_option));
      const videoPath = nativeVideo || path.join(server.dataDir, 'derived-long-embedded.mp4');
      const audioPath = path.join(server.dataDir, 'derived-long-independent.wav');
      // The registered video is silent. This derivative is explicitly distinct
      // from testing a source video that already contains its original audio.
      if (!nativeVideo) ffmpeg(['-stream_loop', '-1', '-i', originals[0], '-ss', '10', '-i', originals[1],
        '-map', '0:v:0', '-map', '1:a:0', '-t', '218', '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-y', videoPath]);
      ffmpeg(['-ss', '30', '-i', originals[2], '-t', '225', '-ar', '48000', '-ac', '2', '-y', audioPath]);
      const vpcm = pcm(videoPath), apcm = pcm(audioPath);
      assert.ok(vpcm.length >= 210 * rate && apcm.length >= 225 * rate);
      const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0',
        '-show_entries', 'stream=sample_rate:format=duration', '-of', 'json', videoPath]);
      assert.equal(probe.status, 0, probe.stderr.toString());
      const videoInfo = JSON.parse(probe.stdout);
      const videoDuration = Math.min(215.15, round(Number(videoInfo.format.duration) - 1.15));
      const videoBytes = fs.readFileSync(videoPath), audioBytes = fs.readFileSync(audioPath);
      const upload = async (kind, name, bytes) => json(await fetch(
        `${server.base}/api/library-assets/upload?kind=${kind}&name=${name}`, { method: 'POST', body: bytes }));
      const video = await upload('video', nativeVideo ? 'native-long-embedded.mp4' : 'derived-long-embedded.mp4', videoBytes);
      const audio = await upload('audio', 'derived-long-independent.wav', audioBytes);
      const image = await upload('image', 'long-background.webp', fs.readFileSync(path.join(__dirname, '..', 'studio', 'assets', 'samples', 'viewport-shrine.webp')));
      if (process.env.BAI_LONG_MIXED_API_ONLY !== '1') {
        browser = await server.launchBrowser(); page = await server.newPage(browser);
      }
      for (const fps of fpsValues) {
        const project = await json(await post(server, '/api/studio/v05/projects', { name: `長尺混合${fps}fps隔離`, kind: 'empty' }));
        const id = project.project.id;
        await json(await post(server, '/api/studio/v05/project/fps', { project_id: id, fps }));
        const placedV = await json(await post(server, '/api/studio/v05/arrangement/place', {
          project_id: id, asset_id: video.item.id, track: 'video', start: 1.37, duration: videoDuration, revision: 0 }));
        const editedV = await json(await post(server, '/api/studio/v05/arrangement/clip/edit', {
          project_id: id, clip_id: placedV.clip.id, revision: placedV.revision, action: 'update',
          track: 'video', lane: 1, start: 1.37, duration: videoDuration, source_start: 1.1 }));
        const placedA = await json(await post(server, '/api/studio/v05/arrangement/place', {
          project_id: id, asset_id: audio.item.id, track: 'audio', start: 3.13, duration: 221.36, revision: editedV.revision }));
        const editedA = await json(await post(server, '/api/studio/v05/arrangement/clip/edit', {
          project_id: id, clip_id: placedA.clip.id, revision: placedA.revision, action: 'update',
          track: 'audio', lane: 1, start: 3.13, duration: 221.36, source_start: 2.2 }));
        const split = await json(await post(server, '/api/studio/v05/arrangement/clip/split', {
          project_id: id, clip_id: placedA.clip.id, revision: editedA.revision, split_at: 123.57 }));
        const right = split.right;
        assert.ok(right);
        assert.equal(round(right.source_start), 122.64);
        const moved = await json(await post(server, '/api/studio/v05/arrangement/clip/edit', {
          project_id: id, clip_id: right.id, revision: split.revision, action: 'update',
          track: 'audio', lane: 1, start: 125.8, duration: right.duration, source_start: right.source_start }));
        const arrangement = await json(await post(server, '/api/studio/v05/arrangement/place', {
          project_id: id, asset_id: image.item.id, track: 'image', start: 0, duration: 232, revision: moved.revision }));
        const saved = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
        const clips = saved.clips.filter(c => ['video', 'audio'].includes(c.category));
        assert.deepEqual(clips.map(c => [round(c.start), round(c.duration), round(c.source_start)]),
          [[1.37, videoDuration, 1.1], [3.13, 120.44, 2.2], [125.8, 100.92, 122.64]]);
        if (page) {
          await page.goto(`${server.base}/studio/v05/index.html`);
          await page.locator('#v06project').selectOption(id);
          await page.reload(); await page.locator('#v06project').selectOption(id);
          await page.locator('#nav [data-workspace="edit"]').click();
          await page.waitForFunction(id => window.BAIStudioMediaPreviewV68?.status().projectId === id &&
            window.BAIStudioMediaPreviewV68.status().ready && window.BAIStudioMediaPreviewV68.status().mediaCount === 4, id);
          await page.waitForFunction(() => [...document.querySelectorAll('#v68layers video,#v68layers audio')].every(e => e.readyState >= 1));
          for (const second of [2, 115, 124.2, 126.4, 218, 228]) {
            const frame = Math.round(second * fps), time = frame / fps;
            await page.evaluate(f => window.BAIStudioMediaPreviewV68.seek(f), frame);
            for (const clip of clips.filter(c => time >= c.start && time < c.start + c.duration)) {
              const expected = clip.source_start + time - clip.start;
              await page.waitForFunction(({ category, expected, tolerance }) =>
                [...document.querySelectorAll(`#v68layers ${category}`)].some(e => Math.abs(e.currentTime - expected) <= tolerance),
                { category: clip.category, expected, tolerance: 1 / fps + 0.005 });
            }
          }
          harness.assertNoErrors(page);
        }
        const inFrame = Math.ceil(0.5 * fps), outFrame = Math.ceil(230 * fps) - 1;
        const range = await json(await post(server, '/api/studio/v05/timeline/range', {
          project_id: id, revision: 0, arrangement_revision: arrangement.revision, in_frame: inFrame, out_frame: outFrame }));
        const started = await json(await post(server, '/api/studio/v05/render/jobs', {
          project_id: id, arrangement_revision: arrangement.revision, range_revision: range.revision, resolution: '720p' }), 202);
        let job; const deadline = Date.now() + 600000;
        do {
          await new Promise(r => setTimeout(r, 700));
          job = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${started.id}`));
        } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
        assert.equal(job.status, 'succeeded', job.error);
        assert.equal(job.probe.frames, outFrame - inFrame + 1);
        assert.equal(job.probe.video_codec, 'h264'); assert.equal(job.probe.audio_codec, 'aac');
        for (const [asset, bytes] of [[video, videoBytes], [audio, audioBytes]])
          assert.ok(job.inputs.some(x => x.asset_id === asset.item.id && x.sha256 === sha(bytes)));
        const outputPath = path.join(server.dataDir, `long-mixed-${fps}.mp4`);
        fs.writeFileSync(outputPath, Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer()));
        const output = pcm(outputPath), results = [];
        assert.ok(output.length >= Math.floor(job.frame_count / fps * rate) - Math.ceil(rate / fps));
        const boundaries = clips.flatMap(c => [c.start, c.start + c.duration]);
        const times = [...new Set([...Array.from({ length: 113 }, (_, i) => 2 + i * 2), 3.6, 123.1, 124.2, 126.4, 216.9, 225.9])]
          .filter(t => boundaries.every(b => Math.abs(t - b) > 0.35));
        for (const time of times) {
          const offset = Math.round((time - inFrame / fps) * rate);
          const expected = Float64Array.from({ length: 1600 }, (_, i) => {
            const t = inFrame / fps + (offset + i) / rate;
            return clips.reduce((sum, c) => sum + (t >= c.start && t < c.start + c.duration
              ? sample(c.category === 'video' ? vpcm : apcm, (c.source_start + t - c.start) * rate) : 0), 0);
          });
          const referenceRms = Math.sqrt(expected.reduce((sum, x) => sum + x * x, 0) / expected.length);
          if (referenceRms < 20) {
            // A quiet native intro cannot provide a measurable correlation lag.
            const quiet = output.slice(offset, offset + expected.length);
            assert.equal(quiet.length, expected.length);
            const rms = Math.sqrt(quiet.reduce((sum, x) => sum + x * x, 0) / quiet.length);
            assert.ok(rms < 80, `unexpected audio in quiet source window ${time}: ${rms}`);
            results.push({ time, quietRms: rms });
            continue;
          }
          const result = correlate(expected, output, offset, fps);
          assert.ok(result.correlation > 0.97 && Math.abs(result.lag) <= rate / fps,
            JSON.stringify({ fps, time, ...result })); results.push({ time, ...result });
        }
        const silentRms = [0.8, 227.3, 229].map(time => {
          const offset = Math.round((time - inFrame / fps) * rate), window = output.slice(offset, offset + 1600);
          assert.equal(window.length, 1600);
          const rms = Math.sqrt(window.reduce((sum, x) => sum + x * x, 0) / window.length);
          assert.ok(rms < 80, `unexpected audio at ${time}s: ${rms}`); return rms;
        });
        const audible = results.filter(r => Number.isFinite(r.correlation));
        assert.ok(audible.length > times.length / 2);
        console.log(JSON.stringify({ fps, frames: job.probe.frames, duration: job.probe.duration_seconds,
          inputKind: nativeVideo ? 'native_embedded_audio' : 'derived_embedded_song',
          embeddedSampleRate: videoInfo.streams[0].sample_rate, videoDuration,
          windows: results.length, audibleWindows: audible.length,
          minCorrelation: Math.min(...audible.map(r => r.correlation)),
          maxLagSamples: Math.max(...audible.map(r => Math.abs(r.lag))), silentRms,
          splitGap: results.filter(r => r.time > 123.57 && r.time < 125.8),
          previewVerified: Boolean(page), filterComplexOption: caps.filter_complex_option, projectId: id }));
      }
    } finally {
      await page?.close(); await browser?.close(); await server.stop();
      assert.deepEqual(await Promise.all(protectedFiles.map(digestFile)), before);
    }
  });
