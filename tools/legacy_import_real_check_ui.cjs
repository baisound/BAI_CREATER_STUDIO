'use strict';
// WP-L9 の画面部分。tools/legacy_import_real_check.py が起動した隔離サーバーに対し、
// v0.5（③）の作品カードから取込ダイアログを開き、曲とダンス・旧タイムライン編集にチェックを入れて取り込む。
// ダイアログ・タイムライン・3D場面の画像を保存し、最後の行に結果の JSON を出す。データは隔離サーバーの複製だけを触る。
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const threeDir = path.join(root, 'node_modules', 'three');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };

async function main() {
  const config = JSON.parse(process.argv[2] || '{}');
  for (const key of ['base', 'projectId', 'projectName', 'out', 'chromium']) if (!config[key]) throw Error(`設定に ${key} がありません`);
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js'))) throw Error('node_modules/three がありません（npm ci を実行してください）');
  const args = config.realGpu ? ['--use-angle=d3d11', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
  const browser = await chromium.launch({ executablePath: config.chromium, args });
  const shots = [];
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(String(error)));
    // 画面は three.js を CDN から読む。隔離確認ではリポジトリの node_modules から返す。
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.1\/(.*)/, route => {
      const match = route.request().url().match(/three@0\.160\.1\/([^?#]*)/);
      const candidate = match && path.resolve(threeDir, match[1]);
      if (!candidate || !candidate.startsWith(threeDir + path.sep) || !fs.existsSync(candidate)) return route.abort();
      return route.fulfill({ status: 200, contentType: mime[path.extname(candidate)] || 'application/octet-stream',
        body: fs.readFileSync(candidate), headers: { 'access-control-allow-origin': '*' } });
    });
    const shot = async (name, target = page) => { const file = path.join(config.out, name); await target.screenshot({ path: file }); shots.push(name); };
    const api = async route => { const res = await fetch(config.base + route); if (!res.ok) throw Error(`${route}: HTTP ${res.status}`); return res.json(); };

    // WP-L8a §6.0：取込の前に、同じ隔離サーバー（旧保存の複製）の② SCR-06 で、旧の置き方の外接箱を測る
    const legacyWorkspace = config.legacyStageAsset ?? null;
    await page.goto(`${config.base}/workspace/06`);
    await page.waitForSelector('[data-feature="sceneViewport"]');
    await page.waitForFunction(() => window.baiStudio.project.getState().status === 'ready' && window.baiStudio.assets.getState().status === 'ready',
      null, { timeout: 60000 });
    if (legacyWorkspace) {
      await page.waitForFunction(() => Boolean(window.baiStudio.viewport.getState().stage?.assetId), null, { timeout: 180000 });
    }
    await page.waitForTimeout(500);
    const scr06State = await page.evaluate(() => window.baiStudio.viewport.getState());
    const scr06 = { stageAssetId: scr06State.stage?.assetId || null, characterAssetId: scr06State.character?.assetId || null,
      bounds: scr06State.bounds };
    await shot('00_scr06_legacy.png');

    await page.goto(`${config.base}/studio/v05/index.html`);
    await page.evaluate(() => window.baiGo('projects'));
    const card = page.locator('#baiProjectList .baiCard', { has: page.locator('h3', { hasText: config.projectName }) });
    const dialog = page.locator('#v188LegacyImport');
    const settle = () => page.waitForFunction(() => !document.querySelector('#v188LegacyImport [role="status"]')?.textContent.includes('読み込み中') &&
      !document.querySelector('#v188LegacyImport')?.textContent.includes('読み込み中です'));
    await card.locator('[data-v05-legacy-import]').click();
    await dialog.waitFor({ state: 'visible' });
    await settle();
    await shot('01_dialog_preview.png');
    for (const include of ['music_dance', 'timeline_editor']) {
      const box = dialog.locator(`input[data-include="${include}"]`);
      if (await box.isEnabled()) {
        await box.check();
        await page.waitForFunction(name => document.querySelector(`#v188LegacyImport input[data-include="${name}"]`)?.checked, include);
        await settle();
      }
    }
    await dialog.locator('[data-role="details"] summary').click();
    await shot('02_dialog_details_with_options.png');
    await dialog.locator('.v188-buttons button.primary').click();
    await dialog.locator('[data-act="confirm-apply"]').click();
    await page.waitForFunction(() => /^取り込みました/.test(document.querySelector('#v188LegacyImport [role="status"]')?.textContent || ''), null, { timeout: 180000 });
    const status = (await dialog.locator('[role="status"]').innerText()).trim();
    await shot('03_dialog_applied.png');
    await dialog.locator('[data-act="close"]').click();

    // 編集画面：タイムライン（曲・ダンスの開始時刻）
    const clips = (await api(`/api/studio/v05/arrangement?id=${config.projectId}`)).clips;
    const instances = (await api(`/api/studio/v05/scene/instances?id=${config.projectId}`)).instances;
    // 編集画面はタイムラインの行まで写るよう、画面を広げる（取込ダイアログは設計どおり 1280×720 で確認済み）
    await page.setViewportSize({ width: 1600, height: 1400 });
    await card.locator('[data-openproject]').click();
    await page.waitForFunction(count => document.querySelectorAll('#v07timeline [data-clip-id]').length === count, clips.length, { timeout: 60000 });
    const timelineClips = await page.locator('#v07timeline [data-clip-id]').count();
    // タイムライン欄は高さ固定（275px）なので、撮影の間だけ隔離ブラウザーの表示で広げる（データは変えない）
    await page.evaluate(() => { const main = document.querySelector('.main'); if (main) main.dataset.v188Rows = main.style.gridTemplateRows, main.style.gridTemplateRows = 'minmax(300px,1fr) 760px'; });
    await page.locator('#v07timeline [data-clip-id]').first().scrollIntoViewIfNeeded();
    await shot('04_timeline.png');
    const placedClips = await page.evaluate(() => [...document.querySelectorAll('#v07timeline [data-clip-id]')].map(node => node.textContent.trim().slice(0, 60)));
    await page.evaluate(() => { const main = document.querySelector('.main'); if (main) main.style.gridTemplateRows = main.dataset.v188Rows || ''; });

    // 3D場面。動作は、計画で ready の数だけ読まれるか、理由が出るまで待つ（待ち切れなければその状態を記録する）
    const plan = await api(`/api/studio/v05/scene/multi-motion-plan?id=${config.projectId}`);
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(count => window.BAIStudioMultiScenePreview?.status().loaded === count, instances.length, { timeout: 240000 });
    let motionWait = 'loaded';
    try {
      await page.waitForFunction(ready => { const m = window.BAIStudioMultiScenePreview.status().motion;
        return m && (m.loadedClips.length >= ready || m.issues.length > 0); }, plan.ready_count, { timeout: 180000 });
    } catch { motionWait = 'timeout'; }
    await page.waitForTimeout(1500);
    const scene = await page.evaluate(() => window.BAIStudioMultiScenePreview.status());
    // 各インスタンスの読込後の外接箱（見た目の大きさの差を数で残す。設計 §2.3、WP-L8a）
    const bounds = await page.evaluate(rows => rows.map(row => {
      const probe = window.BAIStudioMultiScenePreview.frameProbe(row.id);
      return { asset_id: row.asset_id, size: probe?.root?.size || null, min: probe?.root?.min || null, max: probe?.root?.max || null };
    }), instances.map(row => ({ id: row.id, asset_id: row.asset_id })));
    // WP-L8a §6.4：役割ごとのインスタンスと、S1（曲とダンスのモデル）の床の高さ
    const record = (await api(`/api/studio/v05/project/legacy-import?id=${config.projectId}`)).record;
    const roleIds = Object.fromEntries(record.steps.filter(step => step.kind === 'scene_add' && step.instance_id).map(step => [step.role, step.instance_id]));
    const s1 = instances.find(row => !row.asset_id.startsWith('library:') && row.id !== roleIds.character) || null;
    const l8aProbe = await page.evaluate(({ rows, stageId, s1Id }) => {
      const P = window.BAIStudioMultiScenePreview;
      const probes = Object.fromEntries(rows.map(row => { const f = P.frameProbe(row.id);
        return [row.id, f && { asset_id: row.asset_id, units: row.units ?? null, root: f.root, precise: f.precise, camera: f.camera }]; }));
      let floor = null;
      const box = s1Id && probes[s1Id]?.precise;
      if (box && stageId && typeof P.floorProbe === 'function') {
        floor = P.floorProbe(stageId, box.min.map((v, i) => (v + box.max[i]) / 2));
      }
      return { probes, floor };
    }, { rows: instances.map(row => ({ id: row.id, asset_id: row.asset_id, units: row.units })), stageId: roleIds.stage || null, s1Id: s1?.id || null });
    l8aProbe.roles = roleIds;
    l8aProbe.s1 = s1?.id || null;
    await shot('05_scene_3d.png');
    // キャラクターに注目した画像（ステージの外殻に隠れていないかを見る）
    const character = instances.find(row => !row.asset_id.startsWith('library:'));
    if (character) {
      await page.locator('#v58-multi-preview select').first().selectOption(character.id).catch(() => {});
      await page.locator('#v58-multi-preview button', { hasText: '選択モデルに注目' }).click().catch(() => {});
      await page.waitForTimeout(800);
      await shot('06_scene_3d_focus_character.png');
    }
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    });
    process.stdout.write(JSON.stringify({ status, timelineClips, sceneLoaded: scene.loaded, motionLoaded: scene.motion?.loadedClips?.length ?? null,
      motionIssues: scene.motion?.issues || [], motionWait, planReady: plan.ready_count,
      planRows: (plan.rows || []).map(row => ({ clip: row.clip_id, status: row.status, reason: row.reason || null })),
      placedClips, bounds, scr06, l8aProbe, renderer, shots, pageErrors: errors }) + '\n');
  } finally {
    await browser.close();
  }
}
main().catch(error => { process.stderr.write(String(error?.stack || error) + '\n'); process.exitCode = 1; });
