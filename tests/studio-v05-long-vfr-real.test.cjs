'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const harness = require('./helpers/studio-harness.cjs');
const root = path.resolve(__dirname, '..'), data = process.env.BAI_REAL_MMD_DATA;
const nativeVideo = process.env.BAI_NATIVE_MIXED_VIDEO, suppliedVfr = process.env.BAI_VFR_INPUT;
const out = process.env.BAI_VFR_OUT, apiOnly = process.env.BAI_VFR_API_ONLY === '1';
const webm = process.env.BAI_LONG_VIDEO_FORMAT === 'webm';
const caseName = webm ? 'long-webm' : 'long-vfr';
const fps = 29.97, rate = 8000, width = 32, height = 18, frameBytes = width * height * 3;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const b of fs.createReadStream(file)) hash.update(b);
  return hash.digest('hex');
}
function command(name, args, maxBuffer = 64 * 1024 * 1024) {
  const r = spawnSync(name, args, { maxBuffer, timeout: 240000 });
  assert.equal(r.status, 0, r.error?.message || r.stderr.toString()); return r.stdout;
}
const ff = args => command('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
function pts(file) {
  return JSON.parse(command('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames',
    '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', file])).frames.map(f => +f.best_effort_timestamp_time);
}
function packets(file) {
  // Hash each encoded AAC packet, including priming, and keep its exact clock.
  return JSON.parse(command('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_packets',
    '-show_data_hash', 'sha256', '-show_entries', 'packet=pts,dts,duration,size,data_hash', '-of', 'json', file])).packets;
}
const pixels = file => ff(['-i', file, '-an', '-vf', `scale=${width}:${height}:flags=area`,
  '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1']);
function pcm(file) {
  const b = ff(['-i', file, '-map', '0:a:0', '-ar', String(rate), '-ac', '1', '-f', 's16le', 'pipe:1']);
  return Int16Array.from({ length: b.length / 2 }, (_, i) => b.readInt16LE(i * 2));
}
function value(r) {
  if (typeof r === 'string') r = JSON.parse(r);
  assert.notEqual(r.isError, true, JSON.stringify(r)); return JSON.parse(r.content[0].text);
}
function heldFrame(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (times[mid] <= t + 1e-6) lo = mid + 1; else hi = mid; }
  return Math.max(0, lo - 1);
}
function sourceCandidates(times, t, tolerance = 1 / fps) {
  // Some VFR intervals (33.333ms) are shorter than one output frame
  // (33.367ms). Sampling only t and t±1F can skip a valid held frame.
  const first = heldFrame(times, t - tolerance), last = heldFrame(times, t + tolerance);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}
function mae(a, start, b, offset) {
  let sum = 0; for (let i = 0; i < frameBytes; i++) sum += Math.abs(a[start + i] - b[offset + i]);
  return sum / frameBytes;
}
function sample(a, pos) {
  const lo = Math.floor(pos), fraction = pos - lo;
  return lo < 0 || lo + 1 >= a.length ? 0 : a[lo] * (1 - fraction) + a[lo + 1] * fraction;
}
function correlate(expected, actual, offset) {
  let best = { lag: 0, correlation: -1 };
  for (let lag = -Math.ceil(2 * rate / fps); lag <= Math.ceil(2 * rate / fps); lag++) {
    let aa = 0, bb = 0, dot = 0;
    for (let i = 0; i < expected.length; i += 8) {
      const a = expected[i], b = actual[offset + i + lag]; assert.ok(Number.isFinite(b));
      aa += a * a; bb += b * b; dot += a * b;
    }
    const correlation = dot / Math.sqrt(aa * bb || 1);
    if (correlation > best.correlation) best = { lag, correlation, gain: dot / (aa || 1) };
  }
  return best;
}
const round = n => Math.round(n * 1e6) / 1e6;

test(`long real-video-derived ${webm ? 'VP9/Opus WebM' : 'VFR MP4 with original AAC'} retains split source windows and saved output clocks`,
  { skip: (!data || !nativeVideo) && 'BAI_REAL_MMD_DATA and BAI_NATIVE_MIXED_VIDEO required', timeout: 1200000 }, async () => {
    const report = { status: 'in_progress', apiOnly, fps, audioBitrate: 320000, inputKind: 'real_CFR_video_derived_VFR_not_native_VFR',
      format: webm ? 'WebM_VP9_Opus' : 'MP4_H264_AAC_copy',
      observations: {}, unverified: ['native-recorded VFR', 'other codecs/fps', 'Linux browser', 'subjective audio quality'] };
    const save = () => { if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, caseName + '.json'), JSON.stringify(report, null, 2)); } };
    const indexFile = path.join(data, 'library_assets/index.json'), indexBytes = fs.readFileSync(indexFile);
    const song = JSON.parse(indexBytes).items.find(i => i.sha256 === '201f379be031b89245b4c5dbca039c1b29adb85d80307cb91e08dee66ccfdd0c');
    assert.ok(song, 'the previously verified independent real song must exist');
    const songFile = path.join(data, 'library_assets/files', song.filename);
    const protectedFiles = [nativeVideo, songFile, indexFile, ...(suppliedVfr ? [suppliedVfr] : []),
      ...(process.env.BAI_VFR_PREVIOUS_OUTPUT ? [process.env.BAI_VFR_PREVIOUS_OUTPUT] : [])];
    const before = await Promise.all(protectedFiles.map(digest));
    assert.equal(before[0], 'c895d1da79dfddb4c93210b778b74d727be225ac5c07a2c5d6c5a399093f89d6');
    assert.equal(before[1], song.sha256);
    const server = await harness.startServer({ port: apiOnly ? 9241 : 9240 });
    const client = new Client({ name: 'long-vfr-source-window-acceptance', version: '1' });
    let browser, page;
    try {
      await client.connect(new StdioClientTransport({ command: process.platform === 'win32' ? 'python' : 'python3',
        args: ['-B', path.join(root, 'mcp_server.py')], cwd: root, env: { ...process.env, MIXAMO_VIEWER_URL: server.base }, stderr: 'pipe' }));
      const raw = (name, args = {}) => client.callTool({ name, arguments: args });
      const sdk = async (name, args = {}) => value(await raw(name, args));
      if (!apiOnly) {
        browser = await require('playwright').chromium.launch({ executablePath: harness.chromiumPath(),
          args: ['--enable-features=WebMCPTesting', '--autoplay-policy=no-user-gesture-required'] });
        page = await server.newPage(browser); await page.goto(server.base + '/studio/v05/index.html');
        await page.waitForFunction(() => window.mixamoWebMcpDiagnostics?.registered.includes('bai_studio_clip_split'));
        assert.equal(await page.evaluate(() => String(document.modelContext.registerTool).includes('[native code]')), true);
        report.browserVersion = browser.version();
      }
      const web = async (name, args = {}) => page ? value(await page.evaluate(async ({ name, args }) =>
        document.modelContext.executeTool((await document.modelContext.getTools()).find(t => t.name === name), args), { name, args })) : sdk(name, args);
      const caps = await sdk('bai_studio_render_capabilities'); assert.equal(caps.audio_bitrate, 320000); assert.equal(caps.available, true);
      report.filterComplexOption = caps.filter_complex_option;
      report.ffmpeg = command('ffmpeg', ['-version']).toString().split('\n')[0].trim();
      const vfr = suppliedVfr || path.join(server.dataDir, `real-derived-${caseName}.${webm ? 'webm' : 'mp4'}`);
      if (!suppliedVfr) ff(['-i', nativeVideo, '-map', '0:v:0', '-map', '0:a:0', '-vf', "select='eq(mod(n,12),0)+eq(mod(n,12),1)+eq(n,6419)'",
        '-fps_mode', 'vfr', ...(webm ? ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '6', '-crf', '24', '-b:v', '0', '-c:a', 'libopus', '-b:a', '192k'] :
          ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'copy']), '-y', vfr]);
      const originalPackets = packets(nativeVideo), vfrPackets = packets(vfr);
      assert.equal(originalPackets.length, 10033);
      if (!webm) assert.deepEqual(vfrPackets, originalPackets, 'AAC packet payloads/PTS/DTS/duration must be unchanged');
      const streams = JSON.parse(command('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', vfr])).streams;
      assert.equal(streams.find(s => s.codec_type === 'video').codec_name, webm ? 'vp9' : 'h264');
      assert.equal(streams.find(s => s.codec_type === 'audio').codec_name, webm ? 'opus' : 'aac');
      const times = pts(vfr), intervals = times.slice(1).map((t, i) => round(t - times[i]));
      assert.ok(times.length > 1000 && Math.min(...intervals) < .04 && Math.max(...intervals) > .35, 'all actual PTS must demonstrate VFR');
      if (webm) {
        const selected = pts(nativeVideo).filter((_, i) => i % 12 === 0 || i % 12 === 1 || i === 6419);
        assert.equal(times.length, selected.length);
        const maxPtsDifference = Math.max(...times.map((t, i) => Math.abs(t - selected[i])));
        // WebM uses millisecond timestamps. Opus encoder delay is represented
        // separately by negative audio packet PTS, not by shifting video time.
        assert.ok(maxPtsDifference <= .001, `WebM video PTS difference ${maxPtsDifference}`);
        const originalPcm = pcm(nativeVideo), opusPcm = pcm(vfr), checks = [];
        for (let t = 1; t < 213; t += 2) {
          const offset = t * rate, expected = originalPcm.slice(offset, offset + 1600);
          const rms = Math.sqrt(expected.reduce((s, n) => s + n * n, 0) / expected.length);
          if (rms < 20) {
            const quiet = opusPcm.slice(offset, offset + expected.length);
            assert.equal(quiet.length, expected.length);
            const quietRms = Math.sqrt(quiet.reduce((s, n) => s + n * n, 0) / quiet.length);
            assert.ok(quietRms < 80); checks.push({ time: t, quietRms });
          } else {
            const r = correlate(expected, opusPcm, offset);
            assert.ok(r.correlation > .97 && Math.abs(r.lag) <= rate / fps, JSON.stringify({ inputTime: t, ...r }));
            checks.push({ time: t, ...r });
          }
        }
        report.opusConversion = { maxVideoPtsDifferenceSeconds: maxPtsDifference, sampleRate: rate, windowSamples: 1600,
          checks, packetCopyRequired: false, streams: streams.map(({ codec_type, codec_name, time_base, start_time, duration }) => ({ codec_type, codec_name, time_base, start_time, duration })) };
      }
      const videoHash = await digest(vfr), sourcePixels = pixels(vfr); assert.equal(sourcePixels.length, times.length * frameBytes);
      report.input = { sourceSha256: before[0], vfrSha256: videoHash, vfrBytes: fs.statSync(vfr).size, frames: times.length,
        firstPts: times[0], lastPts: times.at(-1), minInterval: Math.min(...intervals), maxInterval: Math.max(...intervals),
        pts: times, audioPackets: vfrPackets.length, ...(!webm ? { aacPackets: vfrPackets.length } : {}),
        aacPayloadAndClockUnchanged: !webm, packetSignature: sha(Buffer.from(JSON.stringify(vfrPackets))) };
      save();
      if (out && !suppliedVfr) fs.copyFileSync(vfr, path.join(out, path.basename(vfr)));
      const upload = async (kind, name, file) => {
        const r = await fetch(server.base + '/api/library-assets/upload?kind=' + kind + '&name=' + name, { method: 'POST', body: fs.readFileSync(file) });
        assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).item;
      };
      const blue = path.join(server.dataDir, 'blue.png'); ff(['-f', 'lavfi', '-i', 'color=blue:s=160x90', '-frames:v', '1', '-y', blue]);
      const video = await upload('video', `${caseName}.${webm ? 'webm' : 'mp4'}`, vfr), audio = await upload('audio', 'independent-real.wav', songFile), image = await upload('image', 'blue.png', blue);
      const id = (await sdk('bai_studio_project_create', { name: '長尺VFR 元区間と分割境界', kind: 'empty' })).project.id;
      await sdk('bai_studio_project_fps_set', { project_id: id, fps });
      let a = await sdk('bai_studio_clip_place', { project_id: id, revision: 0, asset_id: image.id, track: 'image', start: 0, duration: 232 });
      async function render(first, last, name) {
        const previous = await sdk('bai_studio_render_range_get', { project_id: id });
        const range = await sdk('bai_studio_render_range_set', { project_id: id, revision: previous.revision, arrangement_revision: a.revision, in_frame: first, out_frame: last });
        const started = await web('bai_studio_render_job_start', { project_id: id, arrangement_revision: a.revision, range_revision: range.revision, resolution: '720p', name });
        let job; const deadline = Date.now() + 600000;
        do { await new Promise(r => setTimeout(r, 300)); job = await sdk('bai_studio_render_job_get', { job_id: started.id }); } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
        assert.equal(job.status, 'succeeded', job.error); assert.equal(job.probe.frames, last - first + 1); assert.equal(job.audio_bitrate, 320000);
        const bytes = Buffer.from(await (await fetch(server.base + '/api/studio/v05/render/file?id=' + job.id)).arrayBuffer()); assert.equal(sha(bytes), job.sha256);
        const file = path.join(server.dataDir, name + '.mp4'); fs.writeFileSync(file, bytes); return { job, file };
      }
      const old = await render(0, 4, 'preserved-before-long-vfr');
      a = await web('bai_studio_clip_place', { project_id: id, revision: a.revision, asset_id: video.id, track: 'video', start: 1.37, duration: 212.85 });
      const videoId = a.clip.id;
      a = await sdk('bai_studio_clip_edit', { project_id: id, revision: a.revision, clip_id: videoId, action: 'update', track: 'video', start: 1.37, duration: 212.85, source_start: 1.1 });
      const vs = await web('bai_studio_clip_split', { project_id: id, revision: a.revision, clip_id: videoId, split_at: 113.57 });
      assert.equal(round(vs.right.source_start), 113.3);
      a = await sdk('bai_studio_clip_edit', { project_id: id, revision: vs.revision, clip_id: vs.right.id, action: 'update', track: 'video', start: 115.8, duration: vs.right.duration, source_start: vs.right.source_start });
      a = await sdk('bai_studio_clip_place', { project_id: id, revision: a.revision, asset_id: audio.id, track: 'audio', start: 3.13, duration: 221.36 });
      const audioId = a.clip.id;
      a = await web('bai_studio_clip_edit', { project_id: id, revision: a.revision, clip_id: audioId, action: 'update', track: 'audio', start: 3.13, duration: 221.36, source_start: 32.2 });
      const as = await sdk('bai_studio_clip_split', { project_id: id, revision: a.revision, clip_id: audioId, split_at: 123.57 });
      a = await web('bai_studio_clip_edit', { project_id: id, revision: as.revision, clip_id: as.right.id, action: 'update', track: 'audio', start: 125.8, duration: as.right.duration, source_start: as.right.source_start });
      const saved = await sdk('bai_studio_arrangement_get', { project_id: id });
      const clips = saved.clips.filter(c => c.category !== 'image');
      assert.deepEqual(clips.map(c => [c.category, round(c.start), round(c.duration), round(c.source_start)]),
        [['video', 1.37, 112.2, 1.1], ['video', 115.8, 100.65, 113.3], ['audio', 3.13, 120.44, 32.2], ['audio', 125.8, 100.92, 152.64]]);
      const bad = await raw('bai_studio_clip_edit', { project_id: id, revision: a.revision, clip_id: vs.right.id, action: 'update', track: 'video', start: 115.8, duration: vs.right.duration, source_start: 214 });
      assert.equal(bad.isError, true); assert.deepEqual(await sdk('bai_studio_arrangement_get', { project_id: id }), saved);
      report.savedClips = saved.clips; report.sourceOverflowRefusedWithoutSaving = true;
      report.preview = [];
      if (page) {
        await page.reload(); await page.locator('#v06project').selectOption(id); await page.locator('#nav [data-workspace="edit"]').click();
        await page.waitForFunction(id => { const s = window.BAIStudioMediaPreviewV68?.status(); return s?.projectId === id && s.ready && s.mediaCount === 5; }, id);
        await page.waitForFunction(() => { const es = [...document.querySelectorAll('#v68layers video,#v68layers audio')]; return es.length === 4 && es.every(e => e.readyState >= 1); });
        for (const second of [1.5, 40, 113.4, 114.5, 115.9, 124.2, 126.4, 200, 216.2, 228]) {
          const frame = Math.round(second * fps), t = frame / fps;
          await page.evaluate(f => window.BAIStudioMediaPreviewV68.seek(f), frame);
          for (const c of clips.filter(c => t >= c.start && t < c.start + c.duration)) {
            const target = c.source_start + t - c.start;
            await page.waitForFunction(({ kind, target }) => [...document.querySelectorAll('#v68layers ' + kind)].some(e => !e.seeking && e.readyState >= 2 && Math.abs(e.currentTime - target) <= 1 / 29.97), { kind: c.category, target });
          }
          const visible = clips.find(c => c.category === 'video' && t >= c.start && t < c.start + c.duration);
          if (visible) {
            const sample = await page.locator('#v68layers video').evaluateAll((es, { w, h }) => {
              const v = es.find(e => !e.hidden); if (!v) return null;
              // Read native pixels, then box-average. Canvas's default small
              // drawImage uses a different sampling kernel from FFmpeg area.
              const canvas = document.createElement('canvas'); canvas.width = v.videoWidth; canvas.height = v.videoHeight;
              const ctx = canvas.getContext('2d'); ctx.drawImage(v, 0, 0);
              const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data, result = [];
              for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const sum = [0, 0, 0]; let count = 0;
                for (let yy = Math.floor(y * canvas.height / h); yy < Math.floor((y + 1) * canvas.height / h); yy++)
                  for (let xx = Math.floor(x * canvas.width / w); xx < Math.floor((x + 1) * canvas.width / w); xx++) {
                    const at = (yy * canvas.width + xx) * 4; for (let c = 0; c < 3; c++) sum[c] += rgba[at + c]; count++;
                  }
                result.push(...sum.map(n => Math.round(n / count)));
              }
              return result;
            }, { w: width, h: height });
            assert.ok(sample); const sourceTime = visible.source_start + t - visible.start;
            const error = Math.min(...sourceCandidates(times, sourceTime).map(i => mae(Buffer.from(sample), 0, sourcePixels, i * frameBytes)));
            const observation = { frame, time: t, sourceTime, mae: error };
            if (error >= 8) {
              const closest = times.map((pts, i) => ({ pts, mae: mae(Buffer.from(sample), 0, sourcePixels, i * frameBytes) })).sort((a, b) => a.mae - b.mae).slice(0, 3);
              observation.closestSourceFrames = closest;
            }
            report.preview.push(observation); save();
            assert.ok(error < 8, JSON.stringify(observation));
          } else report.preview.push({ frame, time: t, videoInactive: true });
        }
        // Confirm real playback progresses after a seek; this is not a speaker recording.
        await page.evaluate(() => window.BAIStudioMediaPreviewV68.seek(Math.round(200 * 29.97)));
        await page.locator('#v68play').click();
        await page.waitForFunction(() => window.BAIStudioMediaPreviewV68.status().frame > Math.round(200 * 29.97) + 3);
        await page.locator('#v68pause').click(); harness.assertNoErrors(page);
      }
      save();
      const first = 15, last = Math.ceil(230 * fps) - 1;
      const completed = await render(first, last, 'long-vfr-split-nonzero-in');
      assert.equal(completed.job.probe.frames, 6879);
      if (out) fs.copyFileSync(completed.file, path.join(out, caseName + '-split-nonzero-in.mp4'));
      const outputPixels = pixels(completed.file), background = pixels(blue);
      assert.equal(background.length, frameBytes); assert.equal(outputPixels.length, completed.job.probe.frames * frameBytes);
      const videos = clips.filter(c => c.category === 'video');
      function ref(t) {
        const c = videos.find(c => t >= c.start && t < c.start + c.duration);
        return c ? { bytes: sourcePixels, offset: heldFrame(times, c.source_start + t - c.start) * frameBytes } : { bytes: background, offset: 0 };
      }
      function references(t) {
        const lo = t - 1 / fps, hi = t + 1 / fps, result = [ref(lo), ref(hi)];
        for (const c of videos) {
          const first = Math.max(lo, c.start), last = Math.min(hi, c.start + c.duration - 1e-9);
          if (first > last) continue;
          const from = heldFrame(times, c.source_start + first - c.start), to = heldFrame(times, c.source_start + last - c.start);
          for (let i = from; i <= to; i++) result.push({ bytes: sourcePixels, offset: i * frameBytes });
        }
        return result;
      }
      const visual = []; let maxError = 0, negativeControlDistinguishable = 0;
      for (let f = 0; f < completed.job.probe.frames; f++) {
        const t = (first + f) / fps;
        const errors = references(t).map(r => mae(outputPixels, f * frameBytes, r.bytes, r.offset));
        const error = Math.min(...errors); maxError = Math.max(maxError, error);
        assert.ok(error < 8, JSON.stringify({ outputFrame: f, time: t, error, errors }));
        if (f % 30 === 0 || [1.37, 113.57, 115.8, 216.45].some(b => Math.abs(t - b) < .11)) visual.push({ frame: f, time: t, mae: error });
        if (f % 30 === 0) { const wrong = ref(t + .4); if (mae(outputPixels, f * frameBytes, wrong.bytes, wrong.offset) > 8) negativeControlDistinguishable++; }
      }
      assert.ok(negativeControlDistinguishable > 10, 'real-frame signatures must distinguish a 400ms wrong clock at multiple times');
      report.observations.video = { width, height, comparedAllFrames: 6879, toleranceFrames: 1, maxMae: maxError, limitMae: 8, negativeControlDistinguishable, representativeChecks: visual };
      save();
      const vp = pcm(vfr), ap = pcm(songFile), actual = pcm(completed.file);
      assert.ok(actual.length >= Math.floor(completed.job.probe.frames / fps * rate) - Math.ceil(rate / fps));
      const boundaries = clips.flatMap(c => [c.start, c.start + c.duration]);
      const checks = [...new Set([...Array.from({ length: 113 }, (_, i) => 2 + 2 * i), ...boundaries.flatMap(t => [-.25, -.05, 0, .05, .4].map(d => round(t + d)))])]
        .filter(t => t > first / fps + .1 && t + .25 < last / fps).sort((a, b) => a - b);
      const audioChecks = [];
      for (const t of checks) {
        const offset = Math.round((t - first / fps) * rate), n = 1600;
        const expected = Float64Array.from({ length: n }, (_, i) => {
          const time = first / fps + (offset + i) / rate;
          return clips.reduce((sum, c) => sum + (time >= c.start && time < c.start + c.duration ? sample(c.category === 'video' ? vp : ap, (c.source_start + time - c.start) * rate) : 0), 0);
        });
        const rms = Math.sqrt(expected.reduce((s, x) => s + x * x, 0) / n);
        if (rms < 20) {
          const window = actual.slice(offset, offset + n); assert.equal(window.length, n);
          const quietRms = Math.sqrt(window.reduce((s, x) => s + x * x, 0) / n); assert.ok(quietRms < 80, JSON.stringify({ t, quietRms }));
          audioChecks.push({ time: t, quietRms });
        } else {
          const r = correlate(expected, actual, offset);
          assert.ok(r.correlation > .97 && Math.abs(r.lag) <= rate / fps, JSON.stringify({ t, ...r })); audioChecks.push({ time: t, ...r });
        }
      }
      report.observations.audio = { sampleRate: rate, windowSamples: 1600, toleranceFrames: 1, checks: audioChecks };
      const oldBytes = Buffer.from(await (await fetch(server.base + '/api/studio/v05/render/file?id=' + old.job.id)).arrayBuffer());
      assert.equal(sha(oldBytes), old.job.sha256); assert.deepEqual((await sdk('bai_studio_arrangement_get', { project_id: id })).clips, saved.clips);
      assert.deepEqual(await Promise.all(protectedFiles.map(digest)), before);
      for (const [item, hash] of [[video, videoHash], [audio, song.sha256]]) {
        assert.equal(sha(Buffer.from(await (await fetch(server.base + '/api/library-assets/file/' + encodeURIComponent(item.id))).arrayBuffer())), hash);
        assert.ok(completed.job.inputs.some(i => i.asset_id === item.id && i.sha256 === hash));
      }
      report.completed = { frames: completed.job.probe.frames, duration: completed.job.probe.duration_seconds, sha256: completed.job.sha256,
        audioBitrate: completed.job.audio_bitrate, preservedOldOutputSha256: old.job.sha256 };
      report.inputsIndexPreviousOutputUnchanged = true; report.registeredBytesUnchanged = true; report.status = 'passed'; save();
      console.log(JSON.stringify({ frames: report.completed.frames, videoMaxMae: maxError, pcmWindows: audioChecks.length,
        maxLag: Math.max(...audioChecks.filter(r => Number.isFinite(r.lag)).map(r => Math.abs(r.lag))), apiOnly, sourcesPreserved: true, aacPacketCopy: !webm }));
    } catch (e) { report.status = 'failed'; report.error = e.stack; save(); throw e; }
    finally {
      await client.close(); await page?.close(); await browser?.close(); await server.stop();
      assert.deepEqual(await Promise.all(protectedFiles.map(digest)), before);
    }
  });
