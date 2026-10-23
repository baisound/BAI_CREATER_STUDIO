'use strict';
// Private worker for the bounded v0.5 3D MP4 preset. The Python job owns this
// process and its temporary frame directory; no browser state is modified.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const root = path.resolve(__dirname, '..');
const threeDir = path.join(root, 'node_modules', 'three');
const required = ['projectId', 'sceneRevision', 'arrangementRevision', 'rangeRevision',
  'startFrame', 'frameCount', 'fps', 'width', 'height', 'port', 'directory', 'manifest'];

function chromePath() {
  const candidates = [process.env.CHROMIUM_PATH, process.env.CHROMIUM,
    process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '',
    process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : ''];
  return candidates.find(candidate => candidate && fs.existsSync(candidate));
}

async function main() {
  if (process.argv.length !== 3) throw Error('One private job configuration path is required');
  const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (required.some(key => !Object.hasOwn(config, key)) ||
      !Number.isInteger(config.port) || config.port < 1 || config.port > 65535 ||
      !Number.isInteger(config.startFrame) || config.startFrame < 0 ||
      !Number.isInteger(config.frameCount) || config.frameCount < 1 || config.frameCount > 300 ||
      !Number.isFinite(config.fps) || config.fps < 1 || config.fps > 240 ||
      !Number.isInteger(config.width) || !Number.isInteger(config.height) ||
      config.width !== 1280 || config.height !== 720 ||
      !['sceneRevision', 'arrangementRevision', 'rangeRevision'].every(key =>
        Number.isInteger(config[key]) && config[key] >= 0) ||
      typeof config.projectId !== 'string' || !config.projectId)
    throw Error('Invalid private scene capture configuration');
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js')))
    throw Error('Local Three.js dependency is missing');
  const executablePath = chromePath();
  if (!executablePath) throw Error('Chrome/Edge executable is missing');
  const browser = await chromium.launch({ executablePath, headless: true,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(45000);
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.1\/(.*)/, route => {
      const match = route.request().url().match(/three@0\.160\.1\/([^?#]*)/);
      if (!match) return route.abort();
      const candidate = path.resolve(threeDir, match[1]);
      if (!candidate.startsWith(threeDir + path.sep) || !fs.existsSync(candidate)) return route.abort();
      return route.fulfill({ status: 200, contentType: mime[path.extname(candidate)] || 'application/octet-stream',
        body: fs.readFileSync(candidate), headers: { 'access-control-allow-origin': '*' } });
    });
    const origin = `http://127.0.0.1:${config.port}`;
    await page.goto(`${origin}/studio/v05/index.html?scene_capture=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(id => [...document.querySelector('#v06project')?.options || []]
      .some(option => option.value === id), config.projectId);
    await page.locator('#v06project').selectOption(config.projectId);
    await page.waitForFunction(() => typeof window.BAIStudioMultiScenePreview?.open === 'function');
    await page.evaluate(() => window.BAIStudioMultiScenePreview.open({ composite: true }));
    await page.waitForFunction(id => {
      const scene = window.BAIStudioMultiScenePreview?.status?.();
      return scene?.opened && scene.composite && scene.projectId === id && scene.loaded > 0;
    }, config.projectId);
    const check = async () => page.evaluate(async expected => {
      const encoded = encodeURIComponent(expected.projectId);
      const urls = [`/api/studio/v05/scene/instances?id=${encoded}`,
        `/api/studio/v05/arrangement?id=${encoded}`,
        `/api/studio/v05/timeline/range?id=${encoded}`,
        `/api/studio/v05/scene/multi-motion-plan?id=${encoded}`];
      const replies = await Promise.all(urls.map(url => fetch(url, { cache: 'no-store' })));
      if (replies.some(reply => !reply.ok)) throw Error('Saved scene changed during capture');
      const [scene, arrangement, range, motionPlan] = await Promise.all(replies.map(reply => reply.json()));
      if (scene.revision !== expected.sceneRevision ||
          arrangement.revision !== expected.arrangementRevision ||
          range.revision !== expected.rangeRevision ||
          range.fps !== expected.fps || range.range_start_frame !== expected.startFrame ||
          range.frame_count !== expected.frameCount)
        throw Error('Saved scene or timeline changed during capture');
      const status = window.BAIStudioMultiScenePreview.status();
      if (status.loaded !== scene.instances.length ||
          status.motion?.issues?.length ||
          status.motion?.loadedClips?.length !== motionPlan.ready_count ||
          status.motion?.projectId !== expected.projectId)
        throw Error('A saved 3D model or motion could not be loaded');
      return { renderer: status.renderer, loaded: status.loaded,
        sampleInstanceId: scene.instances.find(row => row.visible)?.id || null,
        motionClips: status.motion?.loadedClips?.length || 0 };
    }, config);
    const checked = await check();
    fs.mkdirSync(config.directory, { recursive: true });
    const hashes = [];
    let totalBytes = 0;
    let poseSample = null;
    const crypto = require('node:crypto');
    for (let index = 0; index < config.frameCount; index++) {
      const frame = config.startFrame + index;
      const url = await page.evaluate(({ frame, fps, width, height }) =>
        window.BAIStudioMultiScenePreview.captureFrame(frame, fps, width, height),
      { frame, fps: config.fps, width: config.width, height: config.height });
      if (!url.startsWith('data:image/png;base64,')) throw Error(`Invalid PNG at F${frame}`);
      const buffer = Buffer.from(url.slice('data:image/png;base64,'.length), 'base64');
      if (buffer.length < 100 || buffer.length > 8 * 1024 * 1024 ||
          buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
          buffer.readUInt32BE(16) !== config.width || buffer.readUInt32BE(20) !== config.height)
        throw Error(`Wrong capture pixels at F${frame}`);
      totalBytes += buffer.length;
      if (totalBytes > 256 * 1024 * 1024)
        throw Error('The bounded 3D frame cache exceeded 256 MiB');
      const name = `frame_${String(index + 1).padStart(6, '0')}.png`;
      fs.writeFileSync(path.join(config.directory, name), buffer, { flag: 'wx' });
      hashes.push(crypto.createHash('sha256').update(buffer).digest('hex'));
      if (index === 0 && checked.sampleInstanceId) {
        poseSample = await page.evaluate(({ instanceId, frame }) => {
          const probe = window.BAIStudioMultiScenePreview.poseProbe(instanceId,
            ['頭', '首', 'センター', 'Head', 'Neck', 'Hips']);
          return { frame, bones: Object.fromEntries(Object.entries(probe?.bones || {}).map(([name, bone]) =>
            [name, { position: bone.position, quaternion: bone.quaternion }])) };
        }, { instanceId: checked.sampleInstanceId, frame });
      }
    }
    await check();
    const manifest = { project_id: config.projectId, scene_revision: config.sceneRevision,
      arrangement_revision: config.arrangementRevision, range_revision: config.rangeRevision,
      start_frame: config.startFrame, frame_count: config.frameCount,
      width: config.width, height: config.height, fps: config.fps,
      renderer: checked.renderer, loaded: checked.loaded, motion_clips: checked.motionClips,
      frame_sha256: hashes, captured_bytes: totalBytes, pose_sample: poseSample };
    fs.writeFileSync(config.manifest, JSON.stringify(manifest), { flag: 'wx' });
    process.stdout.write(JSON.stringify({ frames: hashes.length, renderer: checked.renderer }) + '\n');
  } finally { await browser.close(); }
}
main().catch(error => { process.stderr.write(String(error?.stack || error) + '\n'); process.exitCode = 1; });
