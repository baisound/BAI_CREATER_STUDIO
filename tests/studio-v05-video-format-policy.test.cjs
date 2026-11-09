'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const harness = require('./helpers/studio-harness.cjs');
const root = path.resolve(__dirname, '..'), apiOnly = process.env.BAI_VIDEO_API_ONLY === '1';
const out = process.env.BAI_VIDEO_OUT, real = process.env.BAI_REAL_MMD_DATA;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function command(name, args) {
  const r = spawnSync(name, args, { maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr.toString()); return r.stdout;
}
const ff = args => command('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
function value(r) {
  if (typeof r === 'string') r = JSON.parse(r);
  assert.notEqual(r.isError, true, JSON.stringify(r)); return JSON.parse(r.content[0].text);
}
async function setup() {
  if (out) fs.mkdirSync(out, { recursive: true });
  const server = await harness.startServer({ port: apiOnly ? 9237 : 9236 });
  const client = new Client({ name: 'video-format-policy', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.platform === 'win32' ? 'python' : 'python3', args: ['-B', path.join(root, 'mcp_server.py')], cwd: root, env: { ...process.env, MIXAMO_VIEWER_URL: server.base }, stderr: 'pipe' }));
  const raw = (name, args = {}) => client.callTool({ name, arguments: args });
  const sdk = async (name, args = {}) => value(await raw(name, args));
  let browser, page;
  if (!apiOnly) {
    browser = await require('playwright').chromium.launch({ executablePath: harness.chromiumPath(), args: ['--enable-features=WebMCPTesting'] });
    page = await server.newPage(browser); await page.goto(server.base + '/studio/v05/index.html');
    await page.waitForFunction(() => window.mixamoWebMcpDiagnostics?.registered.includes('bai_studio_clip_place'));
    assert.equal(await page.evaluate(() => String(document.modelContext.registerTool).includes('[native code]')), true);
  }
  const nativeRaw = (name, args) => page ? page.evaluate(async ({ name, args }) => document.modelContext.executeTool((await document.modelContext.getTools()).find(t => t.name === name), args), { name, args }) : raw(name, args);
  return { server, page, raw, sdk, nativeRaw, web: async (name, args) => value(await nativeRaw(name, args)), async close(check = true) { if (check && page) harness.assertNoErrors(page); await client.close(); await page?.close(); await browser?.close(); await server.stop(); } };
}
async function upload(s, file) {
  const r = await fetch(s.server.base + '/api/library-assets/upload?kind=video&name=' + encodeURIComponent(path.basename(file)), { method: 'POST', body: fs.readFileSync(file) });
  assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).item;
}
async function movie(s, id, a, first, last, name) {
  const prev = await s.sdk('bai_studio_render_range_get', { project_id: id });
  const range = await s.sdk('bai_studio_render_range_set', { project_id: id, revision: prev.revision, arrangement_revision: a.revision, in_frame: first, out_frame: last });
  const args = { project_id: id, arrangement_revision: a.revision, range_revision: range.revision, resolution: '720p', name };
  const started = await s.web('bai_studio_render_job_start', args); let job;
  const end = Date.now() + 180000;
  do { await new Promise(r => setTimeout(r, 150)); job = await s.sdk('bai_studio_render_job_get', { job_id: started.id }); } while (['queued', 'running'].includes(job.status) && Date.now() < end);
  assert.equal(job.status, 'succeeded', job.error); assert.equal(job.probe.frames, last - first + 1);
  assert.equal(job.audio_bitrate, 320000, 'new format evidence must use the current AAC target');
  const bytes = Buffer.from(await (await fetch(s.server.base + '/api/studio/v05/render/file?id=' + job.id)).arrayBuffer()); assert.equal(sha(bytes), job.sha256);
  const file = path.join(s.server.dataDir, name + '.mp4'); fs.writeFileSync(file, bytes);
  if (out) { fs.mkdirSync(out, { recursive: true }); fs.copyFileSync(file, path.join(out, name + '.mp4')); }
  return { job, file, args };
}
const gray = file => ff(['-i', file, '-an', '-vf', 'scale=1:1', '-pix_fmt', 'gray', '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1']);
const pts = file => JSON.parse(command('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', file])).frames.map(f => +f.best_effort_timestamp_time);
function at(times, levels, t) { let i = 0; while (i + 1 < times.length && times[i + 1] <= t + 1e-6) i++; return levels[i]; }
const pcm = file => ff(['-i', file, '-vn', '-ar', '8000', '-ac', '1', '-f', 's16le', 'pipe:1']);
function lag(source, output, sourceTime, outputTime) {
  let best = { lag: 0, correlation: -1 };
  for (let shift = -267; shift <= 267; shift++) {
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < 1600; i += 4) { const a = source.readInt16LE((Math.round(sourceTime * 8000) + i) * 2), b = output.readInt16LE((Math.round(outputTime * 8000) + i + shift) * 2); dot += a * b; aa += a * a; bb += b * b; }
    const correlation = dot / Math.sqrt(aa * bb || 1); if (correlation > best.correlation) best = { lag: shift, correlation };
  }
  return best;
}
function save(name, data) { if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, 2)); } }

test('existing MP4 and new MP4/WebM/OGV retain saved source windows in one project', { skip: !real && 'BAI_REAL_MMD_DATA required', timeout: 600000 }, async () => {
  const s = await setup();
  try {
    const indexFile = path.join(real, 'library_assets/index.json'), indexBytes = fs.readFileSync(indexFile);
    const entry = JSON.parse(indexBytes).items.find(i => i.kind === 'video' && i.name === 'Kenney Platformer Demo'); assert.ok(entry);
    const original = path.join(real, 'library_assets/files', entry.filename), hash = sha(fs.readFileSync(original)); assert.equal(hash, entry.sha256);
    const library = path.join(s.server.dataDir, 'library_assets'); fs.mkdirSync(path.join(library, 'files'), { recursive: true });
    fs.copyFileSync(original, path.join(library, 'files', entry.filename)); fs.writeFileSync(path.join(library, 'index.json'), JSON.stringify({ schema: 1, items: [entry] }));
    const rows = [];
    for (const [ext, vc, ac, vfr] of [['mp4', 'libx264', 'aac', false], ['webm', 'libvpx-vp9', 'libopus', true], ['ogv', 'libtheora', 'libvorbis', false]]) {
      const file = path.join(s.server.dataDir, 'clock.' + ext);
      ff(['-f', 'lavfi', '-i', 'nullsrc=s=160x90:r=20:d=3', '-f', 'lavfi', '-i', 'aevalsrc=0.15*sin(2*PI*(317*t+173*t*t)):s=48000:d=3', '-vf', "geq=lum='if(mod(floor(N/8),2),210,40)+2*mod(N,8)':cb=128:cr=128" + (vfr ? ",select='eq(mod(n,8),0)+eq(mod(n,8),1)'" : ''), '-fps_mode', vfr ? 'vfr' : 'cfr', '-c:v', vc, '-c:a', ac, '-y', file]);
      const times = pts(file), levels = gray(file); assert.equal(times.length, levels.length);
      if (vfr) { const steps = times.slice(1).map((v, i) => v - times[i]); assert.ok(Math.max(...steps) > .3 && Math.min(...steps) < .06); }
      rows.push({ ext, file, times, levels, hash: sha(fs.readFileSync(file)) });
    }
    if (s.page) {
      await s.page.locator('[data-page="library"]').click(); await s.page.locator('#baiImport').click(); await s.page.locator('#baiUploadKind').selectOption('video');
      await s.page.locator('#baiUploadFiles').setInputFiles(rows.map(r => r.file)); await s.page.locator('#baiUploadSubmit').click();
      await s.page.waitForFunction(() => document.querySelector('#baiAssetDetail')?.textContent.includes('登録 3/3件'));
      await s.page.locator('[data-video-output-status="supported"]').waitFor({ state: 'visible' });
      const inventory = (await (await fetch(s.server.base + '/api/assets')).json()).items;
      for (const row of rows) row.item = inventory.find(i => i.originalName === path.basename(row.file));
      await s.page.screenshot({ path: path.join(out || s.server.dataDir, 'video-formats-supported.png') });
    } else for (const row of rows) row.item = await upload(s, row.file);
    const id = (await s.sdk('bai_studio_project_create', { name: '既存動画と3形式', kind: 'empty' })).project.id;
    await s.sdk('bai_studio_project_fps_set', { project_id: id, fps: 30 }); let a = { revision: 0 };
    const all = [{ item: entry, file: original, hash }, ...rows];
    for (let i = 0; i < all.length; i++) {
      a = await s.web('bai_studio_clip_place', { project_id: id, revision: a.revision, asset_id: all[i].item.id, track: 'video', start: i * 2 + .25, duration: 1 });
      a = await s.sdk('bai_studio_clip_edit', { project_id: id, revision: a.revision, clip_id: a.clip.id, action: 'update', track: 'video', start: i * 2, duration: 1.5, source_start: .25 });
      assert.equal(a.clip.source_start, .25); assert.equal(a.clip.source_duration >= 2.8, true);
    }
    const saved = (await s.sdk('bai_studio_arrangement_get', { project_id: id })).clips;
    const full = await movie(s, id, a, 0, 224, 'video-formats-full'), cut = await movie(s, id, a, 9, 223, 'video-formats-cut');
    const output = gray(full.file), cropped = gray(cut.file), outputPcm = pcm(full.file), checks = [];
    assert.equal(output.length, 225); assert.equal(cropped.length, 215);
    for (let f = 9; f <= 223; f++) assert.equal(output[f] > 128, cropped[f - 9] > 128, 'non-zero In F' + f);
    for (let i = 1; i < all.length; i++) {
      const row = all[i], start = i * 60;
      for (let f = 0; f < 45; f++) assert.ok([-1, 0, 1].some(offset => (at(row.times, row.levels, .25 + (f + offset) / 30) > 128) === (output[start + f] > 128)), row.ext + ' F' + f);
      if (i < all.length - 1) for (const f of [45, 46, 59]) assert.ok(output[start + f] < 8, row.ext + ' end gap F' + f);
      const sourcePcm = pcm(row.file), audio = [.4, .9].map(t => lag(sourcePcm, outputPcm, .25 + t, i * 2 + t));
      for (const r of audio) assert.ok(Math.abs(r.lag) <= 8000 / 30 && r.correlation > .98, JSON.stringify({ ext: row.ext, ...r }));
      checks.push({ format: row.ext, audio, browser: null });
    }
    if (s.page) {
      await s.page.goto(s.server.base + '/studio/v05/index.html'); await s.page.locator('#v06project').selectOption(id); await s.page.locator('#nav [data-workspace="edit"]').click();
      await s.page.waitForFunction(id => window.BAIStudioMediaPreviewV68?.status().ready && window.BAIStudioMediaPreviewV68.status().projectId === id, id);
      await s.page.waitForFunction(() => [...document.querySelectorAll('#v68layers video')].every(v => v.readyState >= 2 || v.error));
      for (let i = 0; i < all.length; i++) {
        const video = s.page.locator('#v68layers video').nth(i), dims = await video.evaluate(v => ({ width: v.videoWidth, error: v.error?.code || 0 }));
        if (i) checks[i - 1].browser = dims;
        if (!dims.width || dims.error) { assert.match(await s.page.locator('#v68status').innerText(), /再生できません/); continue; }
        for (const f of [i * 60 + 15, i * 60 + 44]) {
          await s.page.locator('#v68frame').fill(String(f)); await s.page.locator('#v68seek').click();
          await s.page.waitForFunction(({ i, t }) => { const v = document.querySelectorAll('#v68layers video')[i]; return !v.seeking && Math.abs(v.currentTime - t) < .035; }, { i, t: .25 + (f - i * 60) / 30 });
          const level = await video.evaluate(v => { const c = document.createElement('canvas'); c.width = c.height = 1; const ctx = c.getContext('2d'); ctx.drawImage(v, 0, 0, 1, 1); return ctx.getImageData(0, 0, 1, 1).data[0]; });
          assert.equal(level > 128, output[f] > 128, 'preview F' + f);
        }
      }
      await s.page.reload(); await s.page.locator('#v06project').selectOption(id);
      await s.page.waitForFunction(id => window.BAIStudioMediaPreviewV68?.status().projectId === id, id);
    }
    assert.deepEqual((await s.sdk('bai_studio_arrangement_get', { project_id: id })).clips, saved);
    for (const row of all) {
      assert.equal(sha(fs.readFileSync(row.file)), row.hash);
      assert.equal(sha(Buffer.from(await (await fetch(s.server.base + '/api/library-assets/file/' + encodeURIComponent(row.item.id))).arrayBuffer())), row.hash);
    }
    assert.deepEqual(fs.readFileSync(indexFile), indexBytes);
    save(`video-formats-${apiOnly ? 'linux' : 'chrome'}.json`, { apiOnly, audioBitrate: full.job.audio_bitrate, outputs: [full, cut].map(m => ({ frames: m.job.probe.frames, audioBitrate: m.job.audio_bitrate, sha256: m.job.sha256 })), existingId: entry.id, existingHash: hash, inputHashes: all.map(r => ({ id: r.item.id, hash: r.hash })), savedClips: saved, fullFrames: 225, cutFrames: 215, checks, originalsUnchanged: true, registeredBytesUnchanged: true });
    await s.close();
  } catch (e) { await s.close(false); throw e; }
});

test('audio-only containers and legacy MOV refuse without altering saved work or completed output', { timeout: 300000 }, async () => {
  const s = await setup();
  try {
    const goodFile = path.join(s.server.dataDir, 'good.mp4'); ff(['-f', 'lavfi', '-i', 'color=red:s=160x90:r=30:d=2', '-c:v', 'libx264', '-y', goodFile]);
    const good = await upload(s, goodFile), bad = [];
    for (const [ext, ac] of [['mp4', 'aac'], ['webm', 'libopus'], ['ogv', 'libvorbis']]) {
      const file = path.join(s.server.dataDir, 'audio-only.' + ext); ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', ac, '-y', file]);
      bad.push(await upload(s, file));
    }
    const cover = path.join(s.server.dataDir, 'cover.jpg'), coverAudio = path.join(s.server.dataDir, 'cover-audio.mp4');
    ff(['-f', 'lavfi', '-i', 'color=blue:s=160x90', '-frames:v', '1', '-y', cover]);
    ff(['-i', path.join(s.server.dataDir, 'audio-only.mp4'), '-i', cover, '-map', '0:a', '-map', '1:v', '-c:a', 'copy', '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic', '-y', coverAudio]);
    const coverProbe = JSON.parse(command('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', coverAudio]));
    assert.equal(coverProbe.streams.find(x => x.codec_type === 'video').disposition.attached_pic, 1);
    bad.push(await upload(s, coverAudio));
    const movFile = path.join(s.server.dataDir, 'legacy.mov'); ff(['-i', goodFile, '-c', 'copy', '-y', movFile]);
    const rejectedUpload = await fetch(s.server.base + '/api/library-assets/upload?kind=video&name=legacy.mov', { method: 'POST', body: fs.readFileSync(movFile) }); assert.equal(rejectedUpload.status, 400);
    const library = path.join(s.server.dataDir, 'library_assets'), indexFile = path.join(library, 'index.json'), index = JSON.parse(fs.readFileSync(indexFile)), hash = sha(fs.readFileSync(movFile));
    const mov = { id: 'library:' + hash.slice(0, 24), name: 'legacy-mov', source: 'library', kind: 'video', format: 'MOV', filename: hash + '.mov', originalName: 'legacy.mov', bytes: fs.statSync(movFile).size, sha256: hash, mime: 'video/quicktime' };
    fs.copyFileSync(movFile, path.join(library, 'files', mov.filename)); index.items.push(mov); fs.writeFileSync(indexFile, JSON.stringify(index)); const indexBytes = fs.readFileSync(indexFile);
    const cap = await (await fetch(s.server.base + '/api/studio/v05/assets/capabilities')).json(); assert.deepEqual(cap.mp4_video_formats, ['mp4', 'ogv', 'webm']); assert.equal(cap.upload_formats.mov, undefined);
    const id = (await s.sdk('bai_studio_project_create', { name: '動画の拒否と完成物保持', kind: 'empty' })).project.id;
    let a = await s.sdk('bai_studio_clip_place', { project_id: id, revision: 0, asset_id: good.id, track: 'video', start: 0, duration: 1 });
    const old = await movie(s, id, a, 0, 59, 'preserved-video-output'), saved = await s.sdk('bai_studio_arrangement_get', { project_id: id }), refusals = [];
    if (s.page) harness.expectErrors(s.page, [/status of 422/]);
    if (s.page) {
      await s.page.goto(s.server.base + '/studio/v05/index.html'); await s.page.locator('#v06project').selectOption(id);
      await s.page.locator('[data-page="library"]').click(); await s.page.locator(`[data-library-id="${bad[0].id}"]`).click(); await s.page.locator('#baiPlaceSelected').click();
      await s.page.waitForFunction(() => document.querySelector('#v06status').textContent.includes('タイムラインに配置する素材'));
      await s.page.locator('#v06duration').fill('1'); await s.page.locator('#v06place').click();
      await s.page.waitForFunction(() => /配置失敗.*映像トラックが見つかりません/.test(document.querySelector('#v06status').textContent));
      assert.deepEqual(await s.sdk('bai_studio_arrangement_get', { project_id: id }), saved);
      await s.page.screenshot({ path: path.join(out || s.server.dataDir, 'video-no-picture-refusal.png') });
    }
    for (let i = 0; i < bad.length; i++) {
      const args = { project_id: id, revision: a.revision, asset_id: bad[i].id, track: 'video', start: 1, duration: 1 };
      const response = await (i % 2 ? s.nativeRaw : s.raw)('bai_studio_clip_place', args), failure = typeof response === 'string' ? JSON.parse(response) : response;
      assert.equal(failure.isError, true); assert.match(JSON.stringify(failure), /映像トラックが見つかりません/);
      assert.deepEqual(await s.sdk('bai_studio_arrangement_get', { project_id: id }), saved);
      // Simulate an already-saved legacy clip to verify the render boundary too.
      const arrangementFile = path.join(s.server.dataDir, 'studio_v05_arrangements', id + '.json'), bytes = fs.readFileSync(arrangementFile), legacy = JSON.parse(bytes);
      legacy.clips[0].asset_id = bad[i].id; legacy.clips[0].name = bad[i].name; fs.writeFileSync(arrangementFile, JSON.stringify(legacy));
      const result = await s.raw('bai_studio_render_job_start', old.args); assert.equal(result.isError, true); assert.match(JSON.stringify(result), /映像トラックが見つかりません/);
      assert.equal(JSON.parse(fs.readFileSync(arrangementFile)).clips[0].asset_id, bad[i].id); fs.writeFileSync(arrangementFile, bytes);
      refusals.push({ format: bad[i].format, placementRefused: true, renderRefused: true });
    }
    a = await s.sdk('bai_studio_clip_place', { project_id: id, revision: a.revision, asset_id: mov.id, track: 'video', start: 1, duration: 1 });
    const placed = (await s.sdk('bai_studio_arrangement_get', { project_id: id })).clips;
    const range = await s.sdk('bai_studio_render_range_set', { project_id: id, revision: old.args.range_revision, arrangement_revision: a.revision, in_frame: 0, out_frame: 119 });
    const raw = await s.nativeRaw('bai_studio_render_job_start', { ...old.args, arrangement_revision: a.revision, range_revision: range.revision }); const failure = typeof raw === 'string' ? JSON.parse(raw) : raw;
    assert.equal(failure.isError, true); assert.match(JSON.stringify(failure), /動画形式.*MP4.*未対応.*MP4.*OGV.*WEBM/);
    assert.deepEqual((await s.sdk('bai_studio_arrangement_get', { project_id: id })).clips, placed);
    assert.equal(sha(Buffer.from(await (await fetch(s.server.base + '/api/studio/v05/render/file?id=' + old.job.id)).arrayBuffer())), old.job.sha256);
    if (s.page) {
      await s.page.goto(s.server.base + '/studio/v05/index.html'); await s.page.locator('[data-page="library"]').click(); await s.page.locator(`[data-library-id="${mov.id}"]`).click();
      await s.page.locator('[data-video-output-status="unsupported"]').waitFor({ state: 'visible' });
      assert.match(await s.page.locator('[data-video-output-status="unsupported"]').innerText(), /未対応/);
      await s.page.screenshot({ path: path.join(out || s.server.dataDir, 'video-formats-unsupported.png') });
      const legacyCap = { ...cap }; delete legacyCap.mp4_video_formats;
      await s.page.route('**/api/studio/v05/assets/capabilities', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(legacyCap) }));
      await s.page.reload(); await s.page.locator('[data-page="library"]').click(); await s.page.locator(`[data-library-id="${good.id}"]`).click();
      await s.page.locator('[data-video-output-status="unknown"]').waitFor({ state: 'visible' }); assert.equal(await s.page.locator('#baiLibraryGrid [data-library-id]').count(), 6);
    }
    assert.deepEqual(fs.readFileSync(indexFile), indexBytes);
    save(`video-refusals-${apiOnly ? 'linux' : 'chrome'}.json`, { apiOnly, cap, refusals, legacyMovRenderRefused: true, legacyMovUploadRefused: true, indexUnchanged: true, oldOutputHash: old.job.sha256, completedOutputUnchanged: true });
    await s.close();
  } catch (e) { await s.close(false); throw e; }
});
