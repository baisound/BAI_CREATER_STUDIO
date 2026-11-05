'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');
const sourceRoot = process.env.BAI_REAL_MMD_DATA;
const indexPath = sourceRoot && path.join(sourceRoot, 'library_assets', 'index.json');
const available = indexPath && fs.existsSync(indexPath);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 32 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr.toString()); return r.stdout;
}
function pcm(file) {
  const b = ffmpeg(['-i', file, '-map', '0:a:0', '-ar', '8000', '-ac', '1', '-f', 's16le', 'pipe:1']);
  return Array.from({ length: b.length / 2 }, (_, i) => b.readInt16LE(i * 2));
}
async function json(response, status = 200) {
  const text = await response.text(); assert.equal(response.status, status, text); return JSON.parse(text);
}
const post = (s, route, body) => fetch(s.base + route, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function sample(a, i) {
  if (i < 0 || i + 1 >= a.length) return 0;
  const lo = Math.floor(i), t = i - lo; return a[lo] * (1 - t) + a[lo + 1] * t;
}
function correlation(expected, output, outputStart, fps) {
  const limit = Math.ceil(8000 / fps * 2); let best = { lag: 0, correlation: -1 };
  for (let lag = -limit; lag <= limit; lag++) {
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < expected.length; i += 4) {
      const a = expected[i], b = output[outputStart + i + lag] || 0;
      dot += a * b; aa += a * a; bb += b * b;
    }
    const c = dot / Math.sqrt(aa * bb || 1);
    if (c > best.correlation) best = { lag, correlation: c };
  }
  return best;
}

test('real-source video/audio copies mix 44.1/48kHz with trims and nonzero In at 24/29.97/60fps',
  { skip: !available && 'BAI_REAL_MMD_DATA is required', timeout: 600000 }, async () => {
    const indexBytes = fs.readFileSync(indexPath), index = JSON.parse(indexBytes);
    const videoEntry = index.items.find(x => x.id === 'library:e1d28fe47744328e3d66fe54');
    const audioEntry = index.items.find(x => x.id === 'library:fd895f1ca8efd8b2bfbe0f43');
    assert.ok(videoEntry && audioEntry);
    const originalVideo = path.join(sourceRoot, 'library_assets', 'files', videoEntry.filename);
    const originalAudio = path.join(sourceRoot, 'library_assets', 'files', audioEntry.filename);
    const before = [originalVideo, originalAudio, indexPath].map(p => sha(fs.readFileSync(p)));
    assert.equal(before[0], videoEntry.sha256);
    assert.equal(before[1], audioEntry.sha256);
    const server = await harness.startServer({ port: 8994 });
    try {
      // The registered video has no audio. Mux a copy with real-song audio;
      // this is a controlled derivative, not evidence of an original embedded track.
      const videoPath = path.join(server.dataDir, 'mixed-input.mp4');
      const audioPath = path.join(server.dataDir, 'mixed-input.wav');
      ffmpeg(['-stream_loop', '-1', '-i', originalVideo, '-ss', '10', '-i', originalAudio,
        '-map', '0:v:0', '-map', '1:a:0', '-t', '15', '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-y', videoPath]);
      ffmpeg(['-ss', '40', '-i', originalAudio, '-t', '15', '-ar', '48000', '-ac', '2', '-y', audioPath]);
      for (const [file, rate] of [[videoPath, '44100'], [audioPath, '48000']]) {
        const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'json', file]);
        assert.equal(probe.status, 0, probe.stderr.toString());
        assert.equal(JSON.parse(probe.stdout).streams[0].sample_rate, rate);
      }
      const vpcm = pcm(videoPath), apcm = pcm(audioPath);
      const videoBytes = fs.readFileSync(videoPath), audioBytes = fs.readFileSync(audioPath);
      const upload = async (kind, name, bytes) => json(await fetch(
        `${server.base}/api/library-assets/upload?kind=${kind}&name=${name}`, { method: 'POST', body: bytes }));
      const video = await upload('video', 'mixed-input.mp4', videoBytes);
      const audio = await upload('audio', 'mixed-input.wav', audioBytes);
      const glb = await upload('stage', 'mixed-prop.glb', fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic_test_model.glb')));
      const background = await upload('image', 'mixed-background.webp', fs.readFileSync(path.join(__dirname, '..', 'studio', 'assets', 'samples', 'viewport-shrine.webp')));
      for (const fps of [24, 29.97, 60]) {
        const p = await json(await post(server, '/api/studio/v05/projects', { name: `混合${fps}fps隔離試験`, kind: 'empty' }));
        const id = p.project.id;
        await json(await post(server, '/api/studio/v05/project/fps', { project_id: id, fps }));
        const placed = await json(await post(server, '/api/studio/v05/arrangement/place', {
          project_id: id, asset_id: video.item.id, track: 'video', start: 0.37, duration: 10, revision: 0 }));
        const v = await json(await post(server, '/api/studio/v05/arrangement/clip/edit', {
          project_id: id, clip_id: placed.clip.id, revision: placed.revision, action: 'update',
          track: 'video', lane: 1, start: 0.37, duration: 10, source_start: 1.1 }));
        const placedAudio = await json(await post(server, '/api/studio/v05/arrangement/place', {
          project_id: id, asset_id: audio.item.id, track: 'audio', start: 1.13, duration: 8.6, revision: v.revision }));
        const a = await json(await post(server, '/api/studio/v05/arrangement/clip/edit', {
          project_id: id, clip_id: placedAudio.clip.id, revision: placedAudio.revision, action: 'update',
          track: 'audio', lane: 1, start: 1.13, duration: 8.6, source_start: 2.2 }));
        const finalArrangement = await json(await post(server, '/api/studio/v05/arrangement/place', {
          project_id: id, asset_id: background.item.id, track: 'image', start: 0, duration: 12, revision: a.revision }));
        const saved = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
        assert.equal(saved.clips.find(c => c.id === placed.clip.id).source_start, 1.1);
        assert.equal(saved.clips.find(c => c.id === placedAudio.clip.id).source_start, 2.2);
        const scene = await json(await post(server, '/api/studio/v05/scene/instances', {
          project_id: id, action: 'add', revision: 0, asset_id: glb.item.id,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }));
        const startFrame = Math.ceil(0.5 * fps), outFrame = Math.ceil(11.5 * fps) - 1;
        const range = await json(await post(server, '/api/studio/v05/timeline/range', {
          project_id: id, revision: 0, arrangement_revision: finalArrangement.revision, in_frame: startFrame, out_frame: outFrame }));
        assert.equal(range.fps, fps);
        const started = await json(await post(server, '/api/studio/v05/render/jobs', {
          project_id: id, arrangement_revision: finalArrangement.revision, scene_revision: scene.revision,
          range_revision: range.revision, resolution: '720p' }), 202);
        let job; const deadline = Date.now() + 180000;
        do {
          await new Promise(r => setTimeout(r, 500));
          job = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${started.id}`));
        } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
        assert.equal(job.status, 'succeeded', job.error);
        assert.equal(job.probe.frames, outFrame - startFrame + 1);
        for (const [asset, bytes] of [[video, videoBytes], [audio, audioBytes]])
          assert.ok(job.inputs.some(x => x.asset_id === asset.item.id && x.sha256 === sha(bytes)));
        const outputPath = path.join(server.dataDir, `mixed-${fps}.mp4`);
        fs.writeFileSync(outputPath, Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer()));
        const output = pcm(outputPath), results = [];
        for (const projectTime of [0.7, 1.6, 4, 8.9, 10]) {
          const outputStart = Math.round((projectTime - startFrame / fps) * 8000);
          const expected = Array.from({ length: 2400 }, (_, i) => {
            const t = startFrame / fps + (outputStart + i) / 8000;
            return (t >= 0.37 && t < 10.37 ? sample(vpcm, (1.1 + t - 0.37) * 8000) : 0) +
              (t >= 1.13 && t < 9.73 ? sample(apcm, (2.2 + t - 1.13) * 8000) : 0);
          });
          const result = correlation(expected, output, outputStart, fps);
          assert.ok(result.correlation > 0.97 && Math.abs(result.lag) <= 8000 / fps,
            JSON.stringify({ fps, projectTime, ...result })); results.push({ projectTime, ...result });
        }
        const silent = Math.round((10.8 - startFrame / fps) * 8000);
        const rms = Math.sqrt(output.slice(silent, silent + 1600).reduce((sum, x) => sum + x * x, 0) / 1600);
        assert.ok(rms < 80, `audio continues after both clips: ${rms}`);
        console.log(JSON.stringify({ fps, frames: job.probe.frames, results, silentRms: rms }));
      }
    } finally {
      await server.stop();
      assert.deepEqual([originalVideo, originalAudio, indexPath].map(p => sha(fs.readFileSync(p))), before);
    }
  });
