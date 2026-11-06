'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');

const root = path.resolve(__dirname, '..');
const names = [
  'bai_studio_render_capabilities', 'bai_studio_render_range_get',
  'bai_studio_render_range_set', 'bai_studio_render_name_preview',
  'bai_studio_render_jobs_list', 'bai_studio_render_job_get',
  'bai_studio_render_job_start', 'bai_studio_render_restore',
  'bai_studio_render_file_link',
];
async function json(response, expected = 200) {
  const body = await response.text();
  assert.equal(response.status, expected, body);
  return JSON.parse(body);
}
function stdio(base, method, params = {}) {
  const req = { jsonrpc: '2.0', id: 1, method, params };
  const run = spawnSync(process.env.PYTHON || 'python', [path.join(root, 'mcp_server.py')], {
    input: JSON.stringify(req) + '\n', encoding: 'utf8', timeout: 30000,
    env: { ...process.env, MIXAMO_VIEWER_URL: base, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(run.status, 0, run.stderr);
  const response = JSON.parse(run.stdout.trim());
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  return response.result;
}
function standard(base, name, args = {}) {
  const response = stdio(base, 'tools/call', { name, arguments: args });
  assert.equal(response.isError, undefined, JSON.stringify(response));
  return JSON.parse(response.content[0].text);
}
async function web(page, name, args = {}) {
  const response = await page.evaluate(async input => {
    const tool = window.__mcpTools.find(row => row.name === input.name);
    if (!tool) throw Error('WebMCP tool missing: ' + input.name);
    return tool.execute(input.args);
  }, { name, args });
  assert.equal(response.isError, undefined, JSON.stringify(response));
  return JSON.parse(response.content[0].text);
}
async function waitJob(base, id) {
  const deadline = Date.now() + 60000;
  let job;
  do {
    await new Promise(resolve => setTimeout(resolve, 350));
    job = await json(await fetch(base + '/api/studio/v05/render/jobs?id=' + id));
  } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
  assert.equal(job.status, 'succeeded', job.error);
  return job;
}

test('standard MCP and WebMCP render the same saved project and retain both MP4 versions', async () => {
  const server = await harness.startServer({ port: 8997 });
  let browser, page;
  try {
    const listed = stdio(server.base, 'tools/list').tools;
    for (const name of names) assert.equal(listed.filter(tool => tool.name === name).length, 1, name);
    const caps = standard(server.base, names[0]);
    assert.equal(caps.available, true, caps.reason);
    const image = await json(await fetch(server.base + '/api/library-assets/upload?kind=image&name=mcp-render.webp', {
      method: 'POST', body: fs.readFileSync(path.join(root, 'studio', 'v05', 'assets', 'render-sakura.webp')),
    }));
    const project = await json(await fetch(server.base + '/api/studio/v05/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'MCP完成MP4', kind: 'empty' }),
    }));
    const id = project.project.id;
    const placed = await json(await fetch(server.base + '/api/studio/v05/arrangement/place', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, asset_id: image.item.id,
        track: 'image', start: 0, duration: 1, revision: 0 }),
    }));

    assert.match(fs.readFileSync(path.join(root, 'studio', 'v05', 'index.html'), 'utf8'),
      /<script src="\.\.\/\.\.\/webmcp\.js"><\/script>/);
    browser = await server.launchBrowser();
    page = await server.newPage(browser);
    // v0.5と同じURL階層に軽量ページを置き、WebMCPの通信経路だけを隔離して試す。
    await page.route('**/studio/v05/mcp-probe.html', route => route.fulfill({
      status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>',
    }));
    await page.goto(server.base + '/studio/v05/mcp-probe.html');
    await page.evaluate(() => {
      window.__mcpTools = [];
      Object.defineProperty(document, 'modelContext', {
        configurable: true,
        value: { registerTool: async tool => { window.__mcpTools.push(tool); } },
      });
    });
    await page.addScriptTag({ path: path.join(root, 'webmcp.js') });
    await page.waitForFunction(count => window.__mcpTools?.length >= count, names.length);
    assert.equal(await page.evaluate(() => window.__mcpTools.every(t => t.name.startsWith('bai_studio_'))), true);
    for (const name of names) {
      assert.equal(await page.evaluate(n => window.__mcpTools.filter(t => t.name === n).length, name), 1, name);
    }
    const range0 = await web(page, names[1], { project_id: id });
    assert.equal(range0.revision, 0);
    assert.equal((await web(page, names[0])).available, caps.available);
    const range = await web(page, names[2], {
      project_id: id, revision: range0.revision, arrangement_revision: placed.revision,
      in_frame: 0, out_frame: 0,
    });
    assert.equal(range.frame_count, 1);
    assert.deepEqual(standard(server.base, names[1], { project_id: id }), range);
    const preview = await web(page, names[3], { project_id: id, name: 'MCP完成物' });
    assert.equal(preview.exists, false);
    const body = { project_id: id, range_revision: range.revision,
      arrangement_revision: placed.revision, resolution: '720p', name: 'MCP完成物' };
    const first = standard(server.base, names[6], body);
    await waitJob(server.base, first.id);
    assert.equal((await web(page, names[5], { job_id: first.id })).status, 'succeeded');
    const firstLink = await web(page, names[8], { job_id: first.id });
    assert.equal(firstLink.url, '/api/studio/v05/render/file?id=' + first.id);
    const firstFile = await fetch(server.base + firstLink.url);
    assert.equal(firstFile.status, 200);
    const firstBytes = Buffer.from(await firstFile.arrayBuffer());
    assert.equal(firstBytes.toString('ascii', 4, 8), 'ftyp');

    const replacePreview = standard(server.base, names[3], { project_id: id, name: 'MCP完成物' });
    assert.equal(replacePreview.current_job_id, first.id);
    const replacement = await web(page, names[6], {
      ...body, collision_mode: 'replace', replace_job_id: first.id,
    });
    await waitJob(server.base, replacement.id);
    const jobs = standard(server.base, names[4], { project_id: id }).jobs;
    assert.equal(jobs.find(job => job.id === first.id).delivery_state, 'archived');
    assert.equal(jobs.find(job => job.id === replacement.id).delivery_state, 'current');
    const oldLink = standard(server.base, names[8], { job_id: first.id });
    const kept = Buffer.from(await (await fetch(oldLink.url)).arrayBuffer());
    assert.deepEqual(kept, firstBytes);

    const now = standard(server.base, names[3], { project_id: id, name: 'MCP完成物' });
    const restored = standard(server.base, names[7], {
      project_id: id, name: now.requested_name, job_id: first.id,
      revision: now.revision, current_job_id: now.current_job_id,
    });
    assert.equal(restored.current_job_id, first.id);
    const after = await web(page, names[4], { project_id: id });
    assert.equal(after.jobs.find(job => job.id === first.id).delivery_state, 'current');
    assert.equal(after.jobs.find(job => job.id === replacement.id).delivery_state, 'archived');
    const reread = Buffer.from(await (await fetch(server.base + firstLink.url)).arrayBuffer());
    assert.deepEqual(reread, firstBytes);
    harness.assertNoErrors(page);
  } finally {
    await page?.close(); await browser?.close(); await server.stop();
  }
});
