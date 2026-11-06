'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const harness = require('./helpers/studio-harness.cjs');
const root = path.resolve(__dirname, '..');
async function digestFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function json(response, status = 200) {
  const text = await response.text(); assert.equal(response.status, status, text); return JSON.parse(text);
}
function result(value, allowError = false) {
  const response = typeof value === 'string' ? JSON.parse(value) : value;
  if (!allowError) assert.notEqual(response.isError, true, JSON.stringify(response));
  return allowError ? response : JSON.parse(response.content[0].text);
}
async function fileDigest(base, link) {
  const response = await fetch(new URL(link.url, base)); assert.equal(response.status, 200);
  const hash = crypto.createHash('sha256'); let bytes = 0, header;
  for await (const chunk of response.body) { header ||= Buffer.from(chunk).subarray(0, 12); hash.update(chunk); bytes += chunk.length; }
  assert.equal(header.toString('ascii', 4, 8), 'ftyp');
  return { bytes, sha256: hash.digest('hex') };
}
async function waitJob(call, id) {
  let job; const deadline = Date.now() + 600000;
  do {
    await new Promise(r => setTimeout(r, 500));
    job = await call('bai_studio_render_job_get', { job_id: id });
  } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
  assert.equal(job.status, 'succeeded', job.error); return job;
}
async function scenario({ native, long }) {
  const protectedFiles = [];
  let before;
  const server = await harness.startServer({ port: native ? 9005 : process.platform === 'win32' ? 9004 : 9006 });
  const transport = new StdioClientTransport({ command: process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    args: ['-B', path.join(root, 'mcp_server.py')], cwd: root,
    // MCP is UTF-8 even when a Windows client starts Python in its local codec.
    env: { ...process.env, MIXAMO_VIEWER_URL: server.base, PYTHONUTF8: '0', PYTHONIOENCODING: 'cp932' }, stderr: 'pipe' });
  const client = new Client({ name: 'bai-output-acceptance', version: '1.0.0' });
  let browser, page, stderr = '';
  transport.stderr?.on('data', b => { stderr += b; });
  const standard = async (name, args = {}) => result(await client.callTool({ name, arguments: args }));
  const standardRaw = async (name, args) => result(await client.callTool({ name, arguments: args }), true);
  let web = standard, webRaw = standardRaw;
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().name, 'mixamo-fighting-viewer');
    assert.ok(client.getServerCapabilities().tools);
    const listed = (await client.listTools()).tools;
    const edit = listed.find(t => t.name === 'bai_studio_clip_edit');
    assert.ok(edit.inputSchema.properties.source_start, 'official MCP schema must expose original media start');
    assert.ok(edit.inputSchema.properties.lane, 'official MCP schema must expose image lane');
    assert.ok(listed.find(t => t.name === 'bai_studio_clip_place').inputSchema.properties.lane);
    assert.equal(listed.find(t => t.name === 'bai_studio_render_jobs_list').inputSchema.properties.completed_only.type, 'boolean');
    const caps = await standard('bai_studio_render_capabilities'); assert.equal(caps.available, true, caps.reason);
    const upload = async (kind, name, file) => json(await fetch(`${server.base}/api/library-assets/upload?kind=${kind}&name=${name}`,
      { method: 'POST', body: fs.readFileSync(file) }));
    const image = await upload('image', 'mcp-background.webp', path.join(root, 'studio/v05/assets/render-sakura.webp'));
    const project = await standard('bai_studio_project_create', { name: '公式MCPと日本語版管理', kind: 'empty' });
    assert.equal(project.project.name, '公式MCPと日本語版管理');
    const id = project.project.id, fps = long ? 29.97 : 30;
    await standard('bai_studio_project_fps_set', { project_id: id, fps });
    let revision = 0, videoClip;
    if (long) {
      const videoPath = process.env.BAI_NATIVE_MIXED_VIDEO, sourceRoot = process.env.BAI_REAL_MMD_DATA;
      assert.ok(videoPath && sourceRoot, 'long MCP test requires verified native video and registered WAV');
      const indexPath = path.join(sourceRoot, 'library_assets/index.json');
      const entry = JSON.parse(fs.readFileSync(indexPath)).items.find(e => e.id === 'library:3be86086c554aeafc86fc914');
      const audioPath = path.join(sourceRoot, 'library_assets/files', entry.filename);
      protectedFiles.push(videoPath, audioPath, indexPath);
      before = await Promise.all(protectedFiles.map(digestFile));
      assert.equal(before[0], 'c895d1da79dfddb4c93210b778b74d727be225ac5c07a2c5d6c5a399093f89d6');
      assert.equal(before[1], entry.sha256);
      const video = await upload('video', 'native-mcp.mp4', videoPath);
      const audio = await upload('audio', 'independent-mcp.wav', audioPath);
      const placed = await standard('bai_studio_clip_place', { project_id: id, asset_id: video.item.id,
        track: 'video', lane: 1, start: 1.37, duration: 212.85, revision });
      videoClip = placed.clip;
      const edited = await standard('bai_studio_clip_edit', { project_id: id, clip_id: videoClip.id,
        revision: placed.revision, action: 'update', track: 'video', lane: 1, start: 1.37, duration: 212.85, source_start: 0.75 });
      const placedAudio = await standard('bai_studio_clip_place', { project_id: id, asset_id: audio.item.id,
        track: 'audio', lane: 1, start: 3.13, duration: 221.36, revision: edited.revision });
      const editedAudio = await standard('bai_studio_clip_edit', { project_id: id, clip_id: placedAudio.clip.id,
        revision: placedAudio.revision, action: 'update', track: 'audio', lane: 1, start: 3.13, duration: 221.36, source_start: 2.2 });
      revision = editedAudio.revision;
    }
    const placedImage = await standard('bai_studio_clip_place', { project_id: id, asset_id: image.item.id,
      track: 'image', lane: 1, start: 0, duration: long ? 232 : 1, revision });
    revision = placedImage.revision;
    if (native) {
      browser = await require('playwright').chromium.launch({ executablePath: harness.chromiumPath(),
        args: ['--enable-features=WebMCPTesting', '--no-sandbox'] });
      page = await server.newPage(browser);
      await page.goto(server.base + '/studio/v05/index.html');
      await page.locator('#v06project').selectOption(id);
      assert.equal(await page.evaluate(() => String(document.modelContext?.registerTool).includes('[native code]')), true);
      await page.waitForFunction(() => { const d = window.mixamoWebMcpDiagnostics;
        return d && d.registered.length + d.errors.length === d.tools.length; });
      const diagnostics = await page.evaluate(() => ({ supported: window.mixamoWebMcpDiagnostics.supported,
        registered: window.mixamoWebMcpDiagnostics.registered, errors: window.mixamoWebMcpDiagnostics.errors }));
      assert.equal(diagnostics.supported, true); assert.deepEqual(diagnostics.errors, []);
      assert.equal(diagnostics.registered.length, 64);
      assert.equal(new Set(diagnostics.registered).size, 64);
      const nativeSchema = await page.evaluate(async () => (await document.modelContext.getTools())
        .find(t => t.name === 'bai_studio_clip_edit').inputSchema);
      assert.ok(nativeSchema.properties.source_start); assert.ok(nativeSchema.properties.lane);
      const callNative = (name, args) => page.evaluate(async ({ name, args }) => {
        const tool = (await document.modelContext.getTools()).find(t => t.name === name);
        if (!tool) throw Error('native tool missing: ' + name);
        return document.modelContext.executeTool(tool, args);
      }, { name, args });
      web = async (name, args = {}) => result(await callNative(name, args));
      webRaw = async (name, args) => result(await callNative(name, args), true);
      assert.deepEqual(await web('bai_studio_project_fps_get', { project_id: id }),
        await standard('bai_studio_project_fps_get', { project_id: id }));
    }
    if (videoClip) {
      const editBody = { project_id: id, clip_id: videoClip.id, revision, action: 'update',
        track: 'video', lane: 1, start: 1.37, duration: 212.85, source_start: 1.1 };
      revision = (await web('bai_studio_clip_edit', editBody)).revision;
      const saved = await standard('bai_studio_arrangement_get', { project_id: id });
      assert.equal(saved.clips.find(c => c.id === videoClip.id).source_start, 1.1);
      const rejected = await webRaw('bai_studio_clip_edit', { ...editBody, revision, source_start: 99999 });
      assert.equal(rejected.isError, true);
      assert.deepEqual(await standard('bai_studio_arrangement_get', { project_id: id }), saved);
      if (page) {
        await page.reload(); await page.locator('#v06project').selectOption(id);
        await page.locator('#nav [data-workspace="edit"]').click();
        await page.locator(`#v07timeline [data-clip-id="${videoClip.id}"]`).dblclick({ position: { x: 8, y: 8 } });
        assert.equal(await page.locator('#v78SourceStart').inputValue(), '1.1');
        await page.locator('#v08dialog button[value="cancel"]').click();
      }
    }
    let range = await standard('bai_studio_render_range_get', { project_id: id });
    const saveRange = async (call, start, end) => { range = await call('bai_studio_render_range_set', {
      project_id: id, revision: range.revision, arrangement_revision: revision, in_frame: start, out_frame: end }); };
    await saveRange(web, long ? 15 : 0, long ? 6893 : 2);
    const name = '日本語 完成版';
    const body = () => ({ project_id: id, arrangement_revision: revision, range_revision: range.revision,
      resolution: '720p', name });
    const first = await standard('bai_studio_render_job_start', body());
    assert.equal(first.download_name, name + '.mp4');
    const completed = await waitJob(web, first.id);
    assert.equal(completed.probe.frames, long ? 6879 : 3);
    const firstLink = await web('bai_studio_render_file_link', { job_id: first.id });
    const firstDigest = await fileDigest(server.base, firstLink);
    assert.deepEqual(firstDigest, { bytes: completed.bytes, sha256: completed.sha256 });
    if (long) assert.ok(completed.bytes > 5 * 1024 * 1024);
    const versionPreview = await web('bai_studio_render_name_preview', { project_id: id, name });
    assert.equal(versionPreview.current_job_id, first.id);
    await saveRange(standard, long ? 30 : 0, long ? 329 : 0);
    const version = await web('bai_studio_render_job_start', body());
    await waitJob(standard, version.id);
    assert.equal(version.download_name, versionPreview.suggested_name);
    assert.notEqual(version.download_name, first.download_name);
    await saveRange(web, long ? 600 : 0, long ? 1199 : 1);
    const replacement = await standard('bai_studio_render_job_start', {
      ...body(), collision_mode: 'replace', replace_job_id: first.id });
    const replaced = await waitJob(web, replacement.id);
    assert.notEqual(replaced.sha256, completed.sha256);
    const stale = await webRaw('bai_studio_render_job_start', { ...body(), collision_mode: 'replace', replace_job_id: first.id });
    assert.equal(stale.isError, true); assert.match(stale.content[0].text, /409|変わりました/);
    const now = await standard('bai_studio_render_name_preview', { project_id: id, name });
    assert.equal(now.current_job_id, replacement.id);
    const restoreBody = { project_id: id, name: now.requested_name, job_id: first.id,
      revision: now.revision, current_job_id: now.current_job_id };
    assert.equal((await web('bai_studio_render_restore', restoreBody)).current_job_id, first.id);
    const staleRestore = await standardRaw('bai_studio_render_restore', restoreBody);
    assert.equal(staleRestore.isError, true);
    const jobs = (await standard('bai_studio_render_jobs_list', { project_id: id })).jobs;
    assert.equal(jobs.length, 3);
    const completedPage = await standard('bai_studio_render_jobs_list', {
      project_id: id, completed_only: true, limit: 1, offset: 1 });
    assert.equal(completedPage.total, 3);
    assert.equal(completedPage.jobs.length, 1);
    assert.equal(completedPage.jobs[0].id, jobs[1].id);
    assert.equal(completedPage.jobs[0].file_available, true);
    for (const [job, state] of [[first, 'current'], [version, 'current'], [replacement, 'archived']])
      assert.equal(jobs.find(j => j.id === job.id).delivery_state, state);
    assert.deepEqual(await fileDigest(server.base, await standard('bai_studio_render_file_link', { job_id: first.id })), firstDigest);
    for (const id of [version.id, replacement.id]) {
      const saved = jobs.find(j => j.id === id);
      assert.deepEqual(await fileDigest(server.base, await web('bai_studio_render_file_link', { job_id: id })),
        { bytes: saved.bytes, sha256: saved.sha256 });
    }
    if (page) {
      await page.reload(); await page.locator('#v06project').selectOption(project.project.id);
      await page.locator('#nav [data-workspace="export"]').click();
      await page.waitForFunction(() => document.querySelectorAll('#baiRenderQueue .v69job').length === 3);
      assert.equal(await page.locator('#baiRenderQueue .v69job').filter({ hasText: '（旧版）' }).count(), 1);
      // These exact two rejected calls were asserted above and must not hide
      // unrelated browser errors or extra failing requests.
      const badWindow = /console: Failed to load resource: the server responded with a status of 400 \(Bad Request\)$/;
      const staleWrite = /console: Failed to load resource: the server responded with a status of 409 \(Conflict\)$/;
      assert.equal(page.__monitor.errors.filter(e => badWindow.test(e)).length, 1);
      assert.equal(page.__monitor.errors.filter(e => staleWrite.test(e)).length, 1);
      harness.expectErrors(page, [badWindow, staleWrite]);
      harness.assertNoErrors(page);
    }
    assert.equal(stderr, '');
    console.log(JSON.stringify({ native, long, sdk: '2.4.0', tools: listed.length,
      nativeTools: native ? 64 : null, frames: completed.probe.frames, bytes: completed.bytes,
      versions: 3, restoredOriginal: true, staleRejected: true, projectId: id }));
  } finally {
    await client.close(); await page?.close(); await browser?.close(); await server.stop();
    if (before) assert.deepEqual(await Promise.all(protectedFiles.map(digestFile)), before);
  }
}
test('official MCP SDK stdio preserves Japanese names and immutable finished versions',
  { timeout: 900000 }, () => scenario({ native: false, long: process.env.BAI_SDK_MCP_LONG === '1' }));
test('native WebMCP and official MCP SDK render and restore the same saved project',
  { skip: process.env.BAI_NATIVE_WEBMCP !== '1' && 'Opt in with BAI_NATIVE_WEBMCP=1 and supported Chrome', timeout: 900000 },
  () => scenario({ native: true, long: true }));
