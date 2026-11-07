'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const harness = require('./helpers/studio-harness.cjs');
const root = path.resolve(__dirname, '..');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function json(response) { const text = await response.text(); assert.equal(response.status, 200, text); return JSON.parse(text); }
function value(response, error = false) {
  if (typeof response === 'string') response = JSON.parse(response);
  assert.equal(response.isError === true, error, JSON.stringify(response));
  return error ? response : JSON.parse(response.content[0].text);
}
function ff(args, input) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { input, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString()); return result.stdout;
}
function color(bytes, expected) {
  const rgb = ff(['-i', 'pipe:0', '-vf', 'format=rgb24,crop=2:2:iw/2:ih/2', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], bytes);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(rgb[c] - expected[c]) < 8, `RGB ${[...rgb.subarray(0,3)]} expected ${expected}`);
}
async function scenario(native) {
  const server = await harness.startServer({ port: native ? 9131 : 9130 });
  const transport = new StdioClientTransport({ command: process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    args: ['-B', path.join(root, 'mcp_server.py')], cwd: root,
    env: { ...process.env, MIXAMO_VIEWER_URL: server.base, PYTHONUTF8: '0', PYTHONIOENCODING: 'cp932' }, stderr: 'pipe' });
  const client = new Client({ name: 'bai-stable-image-lanes', version: '1.0.0' });
  const sdkRaw = (name, args = {}) => client.callTool({ name, arguments: args });
  const sdk = async (name, args = {}) => value(await sdkRaw(name, args));
  let browser, page, stderr = '';
  transport.stderr?.on('data', bytes => { stderr += bytes; });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    const layoutSchema = tools.find(t => t.name === 'bai_studio_track_layout_set').inputSchema;
    assert.deepEqual(layoutSchema.properties.action.enum, ['update', 'add_image_lane', 'remove_image_lane', 'add_video_lane', 'remove_video_lane', 'add_audio_lane', 'remove_audio_lane', 'add_music_lane', 'remove_music_lane']);
    assert.deepEqual(layoutSchema.required, ['project_id', 'revision']);
    const id = (await sdk('bai_studio_project_create', { name: '画像行の保存と重ね順', kind: 'empty' })).project.id;
    await sdk('bai_studio_project_fps_set', { project_id: id, fps: 30 });
    let call = sdk, raw = sdkRaw;
    if (native) {
      browser = await require('playwright').chromium.launch({ executablePath: harness.chromiumPath(),
        args: ['--enable-features=WebMCPTesting', '--no-sandbox'] });
      page = await server.newPage(browser);
      await page.goto(server.base + '/studio/v05/index.html');
      await page.locator('#v06project').selectOption(id);
      await page.waitForFunction(() => { const d = window.mixamoWebMcpDiagnostics; return d && d.registered.length + d.errors.length === d.tools.length; });
      assert.equal(await page.evaluate(() => String(document.modelContext?.registerTool).includes('[native code]')), true);
      assert.deepEqual(await page.evaluate(() => window.mixamoWebMcpDiagnostics.errors), []);
      const nativeSchema = await page.evaluate(async () => (await document.modelContext.getTools()).find(t => t.name === 'bai_studio_track_layout_set').inputSchema);
      assert.deepEqual(nativeSchema, layoutSchema);
      raw = (name, args = {}) => page.evaluate(async ({ name, args }) => {
        const tool = (await document.modelContext.getTools()).find(t => t.name === name);
        return document.modelContext.executeTool(tool, args);
      }, { name, args });
      call = async (name, args = {}) => value(await raw(name, args));
    }
    const get = () => sdk('bai_studio_track_layout_get', { project_id: id });
    const set = (revision, extra) => call('bai_studio_track_layout_set', { project_id: id, revision, ...extra });
    let layout = await get();
    // Existing callers without action still update order/heights.
    layout = await set(layout.revision, { order: [...layout.order].reverse(), heights: { image: 72 } });
    const order = layout.order;
    layout = await set(layout.revision, { action: 'update', order, heights: layout.heights });
    layout = await set(layout.revision, { action: 'add_image_lane' });
    layout = await set(layout.revision, { action: 'add_image_lane' });
    assert.deepEqual(layout.image_lane_ids, [1, 2, 3]);
    const protectedImages = [];
    for (const [name, color] of [['red', 'red'], ['green', 'lime']]) {
      const file = path.join(server.dataDir, name + '.png');
      ff(['-f', 'lavfi', '-i', `color=c=${color}:s=320x180:d=1`, '-frames:v', '1', '-y', file]);
      const bytes = fs.readFileSync(file);
      const item = (await json(await fetch(`${server.base}/api/library-assets/upload?kind=image&name=${name}.png`, { method: 'POST', body: bytes }))).item;
      protectedImages.push({ file, sha: hash(bytes), item });
    }
    let arrangement = await sdk('bai_studio_clip_place', { project_id: id, revision: 0, asset_id: protectedImages[0].item.id, track: 'image', lane: 1, start: 0, duration: 2 });
    arrangement = await call('bai_studio_clip_place', { project_id: id, revision: arrangement.revision, asset_id: protectedImages[1].item.id, track: 'image', lane: 2, start: 0.5, duration: 1 });
    const foreground = arrangement.clip;
    arrangement = await call('bai_studio_clip_edit', { project_id: id, revision: arrangement.revision, clip_id: foreground.id,
      action: 'update', track: 'image', lane: 3, start: 0.5, duration: 1 });
    const savedClips = (await sdk('bai_studio_arrangement_get', { project_id: id })).clips;
    layout = await set(layout.revision, { action: 'remove_image_lane', lane: 2 });
    layout = await set(layout.revision, { action: 'add_image_lane' });
    assert.deepEqual(layout.image_lane_ids, [1, 3, 4]); assert.equal(layout.next_image_lane_id, 5);
    assert.equal(layout.heights.image, 72); assert.deepEqual(layout.order, order);
    assert.deepEqual(await get(), layout);
    // Occupied rows, deleted IDs, stale revisions and unknown actions never alter state.
    const reject = async extra => {
      value(await raw('bai_studio_track_layout_set', { project_id: id, revision: layout.revision, ...extra }), true);
      assert.deepEqual(await get(), layout);
      assert.deepEqual((await sdk('bai_studio_arrangement_get', { project_id: id })).clips, savedClips);
    };
    await reject({ action: 'remove_image_lane', lane: 3 });
    await reject({ action: 'remove_image_lane', lane: 2 });
    await reject({ action: 'add_image_lane', revision: layout.revision - 1 });
    // SDK validates the action enum before sending; test the server path too.
    value(await sdkRaw('bai_studio_track_layout_set', { project_id: id, revision: layout.revision, action: 'unknown' }), true);
    assert.deepEqual(await get(), layout);
    value(await sdkRaw('bai_studio_clip_edit', { project_id: id, revision: arrangement.revision, clip_id: foreground.id,
      action: 'update', track: 'image', lane: 2, start: 0.5, duration: 1 }), true);
    assert.deepEqual((await sdk('bai_studio_arrangement_get', { project_id: id })).clips, savedClips);
    if (page) {
      await page.reload(); await page.locator('#v06project').selectOption(id);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v07timeline [data-track="image"][data-lane="4"]').waitFor();
      assert.equal(await page.locator('#v07timeline [data-track="image"][data-lane="2"]').count(), 0);
      await page.waitForFunction(id => window.BAIStudioMediaPreviewV68?.status().ready && window.BAIStudioMediaPreviewV68.status().projectId === id, id);
      for (const [frame, expected] of [[0, [253,0,0]], [15, [0,254,0]], [30, [0,254,0]], [45, [253,0,0]], [59, [253,0,0]]]) {
        await page.locator('#v68frame').fill(String(frame)); await page.locator('#v68seek').click();
        await page.waitForFunction(f => window.BAIStudioMediaPreviewV68.status().frame === f, frame);
        color(await page.locator('#v68layers').screenshot(), expected);
      }
      const bad = /console: Failed to load resource: the server responded with a status of 400 \(Bad Request\)$/;
      const stale = /console: Failed to load resource: the server responded with a status of 409 \(Conflict\)$/;
      assert.equal(page.__monitor.errors.filter(e => bad.test(e)).length, 2);
      assert.equal(page.__monitor.errors.filter(e => stale.test(e)).length, 1);
      harness.expectErrors(page, [bad, stale]); harness.assertNoErrors(page);
    }
    let range = await sdk('bai_studio_render_range_get', { project_id: id });
    range = await call('bai_studio_render_range_set', { project_id: id, revision: range.revision, arrangement_revision: arrangement.revision, in_frame: 0, out_frame: 59 });
    const started = await call('bai_studio_render_job_start', { project_id: id, arrangement_revision: arrangement.revision, range_revision: range.revision, resolution: '720p', name: '行の重なり' });
    let job; const deadline = Date.now() + 120000;
    do { await new Promise(r => setTimeout(r, 200)); job = await sdk('bai_studio_render_job_get', { job_id: started.id }); }
    while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
    assert.equal(job.status, 'succeeded', job.error); assert.equal(job.probe.frames, 60);
    const link = await sdk('bai_studio_render_file_link', { job_id: job.id });
    const bytes = Buffer.from(await (await fetch(new URL(link.url, server.base))).arrayBuffer());
    assert.equal(hash(bytes), job.sha256);
    const mp4 = path.join(server.dataDir, 'finished.mp4'); fs.writeFileSync(mp4, bytes);
    for (const [frame, expected] of [[0, [253,0,0]], [15, [0,254,0]], [30, [0,254,0]], [45, [253,0,0]], [59, [253,0,0]]]) {
      const png = ff(['-i', mp4, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']);
      color(png, expected);
    }
    const emptyId = (await sdk('bai_studio_project_create', { name: '最後の行の保持', kind: 'empty' })).project.id;
    value(await sdkRaw('bai_studio_track_layout_set', { project_id: emptyId, revision: 0, action: 'remove_image_lane', lane: 1 }), true);
    assert.deepEqual((await sdk('bai_studio_track_layout_get', { project_id: emptyId })).image_lane_ids, [1]);
    for (const image of protectedImages) {
      assert.equal(hash(fs.readFileSync(image.file)), image.sha);
      assert.equal(hash(Buffer.from(await (await fetch(`${server.base}/api/library-assets/file/${encodeURIComponent(image.item.id)}`)).arrayBuffer())), image.sha);
    }
    assert.equal(stderr, '');
    console.log(JSON.stringify({ native, sdkTools: tools.length, imageLaneIds: layout.image_lane_ids, nextLaneId: 5,
      frames: job.probe.frames, verifiedColors: 5, savedClipValuesPreserved: true, rejectedWritesPreserved: true, hashesUnchanged: true }));
  } finally { await client.close(); await page?.close(); await browser?.close(); await server.stop(); }
}
test('official MCP SDK preserves stable image lanes and rendered overlap after empty row removal', { timeout: 180000 }, () => scenario(false));
test('native WebMCP shares saved image lanes, UI preview and MP4 with the official SDK',
  { skip: process.env.BAI_NATIVE_WEBMCP !== '1' && 'Opt in with BAI_NATIVE_WEBMCP=1 and supported Chrome', timeout: 180000 }, () => scenario(true));
