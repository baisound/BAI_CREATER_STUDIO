'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');

const sourceRoot = process.env.BAI_REAL_MMD_DATA;
const modelName = 'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motionName = '狐面物理確認用_頭振り_F000-0300.vmd';
const exists = sourceRoot && fs.existsSync(path.join(sourceRoot, 'mmd', 'A', modelName)) &&
  fs.existsSync(path.join(sourceRoot, 'mmd', 'vmd', motionName));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function ok(response) { const body = await response.text(); assert.equal(response.status, 200, body); return JSON.parse(body); }

test('real PMX and VMD change saved-scene pose and pixels at F0/F120', {skip: !exists && 'BAI_REAL_MMD_DATA に実素材がありません'}, async () => {
  const modelPath = path.join(sourceRoot, 'mmd', 'A', modelName);
  const motionPath = path.join(sourceRoot, 'mmd', 'vmd', motionName);
  const original = {model: digest(modelPath), motion: digest(motionPath)};
  const sourceMeta = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'mmd_assets.json'), 'utf8'));
  const entries = sourceMeta.A.filter(entry => entry.name === modelName || entry.name.startsWith('tex/'));
  const seed = {'mmd_assets.json': JSON.stringify({A: entries, B: [], vmd: [{name: motionName, size: fs.statSync(motionPath).size}]})};
  for (const entry of entries) {
    const file = path.join(sourceRoot, 'mmd', 'A', ...entry.name.split('/'));
    assert.ok(fs.existsSync(file), `登録テクスチャがありません: ${entry.name}`);
    seed[`mmd/A/${entry.name}`] = fs.readFileSync(file);
  }
  seed[`mmd/vmd/${motionName}`] = fs.readFileSync(motionPath);
  const server = await harness.startServer({port: 8894, seed});
  let browser, page;
  try {
    const project = await ok(await fetch(`${server.base}/api/studio/v05/projects`, {method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'実PMX・VMDの隔離変形',kind:'empty'})}));
    const id = project.project.id;
    const scene = await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`, {method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({project_id:id,action:'add',revision:0,
        asset_id:`mmd:A:${modelName}`,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
    const instanceId = scene.instances[0].id;
    const placed = await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`, {method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({project_id:id,asset_id:`mmd:vmd:${motionName}`,
        track:'motion',start:0,duration:10,revision:0})}));
    await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`, {method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({project_id:id,clip_id:placed.clip.id,
        revision:placed.revision,instance_id:instanceId})}));
    browser = await server.launchBrowser(); page = await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(() => window.BAIStudioMultiScenePreview?.status().loaded === 1 &&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length === 1, null, {timeout: 120000});
    const morphs = await page.evaluate(instanceId => window.BAIStudioMultiScenePreview.morphProbe(instanceId), instanceId);
    assert.ok(morphs && Object.keys(morphs.morphs).length > 0, '実PMXのモーフ名を取得できません');
    const names = ['センター','上半身','首','頭','右腕','左腕'];
    const read = async frame => {
      await page.evaluate(frame => window.BAIStudioTimeline.seek(frame / 30, 'real-pmx-test'), frame);
      await page.waitForTimeout(250);
      return {pose: await page.evaluate(([instanceId,names]) => window.BAIStudioMultiScenePreview.poseProbe(instanceId,names), [instanceId,names]),
        frame: await page.evaluate(instanceId => window.BAIStudioMultiScenePreview.frameProbe(instanceId), instanceId),
        pixels: await page.locator('#v58-canvas canvas').screenshot()};
    };
    const at0 = await read(0), at120 = await read(120);
    assert.ok(Object.hasOwn(morphs.morphs,'まばたき'));
    await page.locator('#v96-face-name').selectOption('まばたき');
    await page.locator('#v96-face-time').fill('0');
    await page.locator('#v96-face-save').click();
    await page.waitForFunction(() => document.querySelector('#v96-face-saved')?.options.length === 2);
    await page.locator('#v96-face-time').fill('4');
    await page.locator('#v98-face-track').selectOption('lip');
    await page.locator('#v96-face-value').evaluate(el => {
      el.value = '1'; el.dispatchEvent(new Event('input', {bubbles:true}));
    });
    await page.locator('#v96-face-save').click();
    await page.waitForFunction(() => document.querySelector('#v96-face-saved')?.options.length === 3);
    const storedFace = await ok(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${id}`));
    assert.deepEqual(storedFace.face_keys.map(x=>[x.morph_name,x.time,x.value]),
      [['まばたき',0,0],['まばたき',4,1]]);
    await page.evaluate(() => window.BAIStudioTimeline.seek(2, 'face-key-test'));
    await page.waitForTimeout(250);
    const half = await page.evaluate(instanceId =>
      window.BAIStudioMultiScenePreview.morphProbe(instanceId).morphs['まばたき'],instanceId);
    assert.ok(Math.abs(half-.5)<.001, `表情キー補間は${half}`);
    const keyed120 = await read(120);
    const beforeFace=rawPng(at120.pixels),afterFace=rawPng(keyed120.pixels);
    let facePreviewPixels=0;
    for(let i=0;i<beforeFace.length;i+=3)
      if(Math.max(...[0,1,2].map(j=>Math.abs(beforeFace[i+j]-afterFace[i+j])))>5)facePreviewPixels++;
    assert.ok(facePreviewPixels>2,`表情キーがプレビュー実画素を変えません (${facePreviewPixels})`);
    assert.equal(await page.evaluate(instanceId =>
      window.BAIStudioMultiScenePreview.morphProbe(instanceId).morphs['まばたき'],instanceId),1);
    assert.ok(at0.frame?.precise?.size.every(n => Number.isFinite(n) && n > 0 && n < 100));
    assert.ok(at0.frame.camera.every(n => Number.isFinite(n) && Math.abs(n) < 100));
    const poseDelta = (a,b) => Math.max(...a.quaternion.map((n,i) => Math.abs(n-b.quaternion[i])),
      ...a.position.map((n,i) => Math.abs(n-b.position[i])));
    const changed = names.filter(name => at0.pose.bones[name] && at120.pose.bones[name] &&
      poseDelta(at0.pose.bones[name],at120.pose.bones[name]) > 1e-3);
    assert.ok(changed.length > 0, `F0/F120で骨が変わりません: ${JSON.stringify({at0:at0.pose,at120:at120.pose})}`);
    assert.notEqual(crypto.createHash('sha256').update(at0.pixels).digest('hex'),
      crypto.createHash('sha256').update(at120.pixels).digest('hex'), 'F0/F120画面が同じです');
    await page.reload();
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(() => window.BAIStudioMultiScenePreview?.status().loaded === 1 &&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length === 1, null, {timeout: 120000});
    const restored = await read(120);
    assert.equal(await page.evaluate(instanceId =>
      window.BAIStudioMultiScenePreview.morphProbe(instanceId).morphs['まばたき'],instanceId),1);
    const lipMarker=page.locator('#v07timeline [data-track="lip"] .v98-face-marker');
    const expressionMarker=page.locator('#v07timeline [data-track="expression"] .v98-face-marker');
    await lipMarker.waitFor({state:'visible'});
    assert.equal(await expressionMarker.count(),1);
    assert.equal(await lipMarker.getAttribute('data-face-time'),'4');
    await lipMarker.scrollIntoViewIfNeeded();
    const markerBox=await lipMarker.boundingBox();
    assert.ok(markerBox);
    await page.mouse.move(markerBox.x+10,markerBox.y+10);
    await page.mouse.down();
    await page.mouse.move(markerBox.x+34,markerBox.y+10,{steps:5});
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#v07timeline [data-track="lip"] .v98-face-marker[data-face-time="5"]'));
    const movedFace=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${id}`));
    assert.deepEqual(movedFace.face_keys.map(x=>[x.time,x.track]),[[0,'expression'],[5,'lip']]);
    await page.locator('#v07timeline [data-track="lip"] .v98-face-marker').click();
    await page.waitForFunction(() => document.querySelector('#v96-face-time')?.value==='5');
    assert.equal(await page.locator('#v98-face-track').inputValue(),'lip');
    const at150=await read(150);
    assert.equal(await page.evaluate(instanceId =>
      window.BAIStudioMultiScenePreview.morphProbe(instanceId).morphs['まばたき'],instanceId),1);
    await page.locator('#v99FaceUndo').click();
    await page.waitForFunction(() => document.querySelector('#v07timeline [data-track="lip"] .v98-face-marker[data-face-time="4"]'));
    let undone=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${id}`));
    assert.deepEqual(undone.face_keys.map(x=>x.time),[0,4]);
    await page.locator('#v99FaceRedo').click();
    await page.waitForFunction(() => document.querySelector('#v07timeline [data-track="lip"] .v98-face-marker[data-face-time="5"]'));
    const redone=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${id}`));
    assert.deepEqual(redone.face_keys.map(x=>x.time),[0,5]);
    await page.waitForFunction(() => !document.querySelector('#v99-face-undo')?.disabled);
    await page.locator('#v99-face-undo').click();
    await page.waitForFunction(() => document.querySelector('#v07timeline [data-track="lip"] .v98-face-marker[data-face-time="4"]'));
    await page.locator('#v99-face-redo').click();
    await page.waitForFunction(() => document.querySelector('#v07timeline [data-track="lip"] .v98-face-marker[data-face-time="5"]'));
    const redoneFromPreview=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${id}`));
    assert.deepEqual(redoneFromPreview.face_keys.map(x=>x.time),[0,5]);
    assert.ok(poseDelta(at120.pose.bones[changed[0]],restored.pose.bones[changed[0]]) < 1e-4,
      '保存再読込後のF120姿勢が変わりました');
    console.log(JSON.stringify({model_sha256:original.model,motion_sha256:original.motion,changedBones:changed,
      morphNames:Object.keys(morphs.morphs).slice(0,60),morphCount:Object.keys(morphs.morphs).length,
      headDelta:poseDelta(at0.pose.bones[changed[0]],at120.pose.bones[changed[0]]),
      renderer:at0.frame.renderer,canvas:at0.frame.canvas,frame0:at0.frame.precise.size,frame120:at120.frame.precise.size,
      faceKeyRevision:storedFace.revision,faceMoveRevision:movedFace.revision,
      faceUndoRevision:undone.revision,faceRedoRevision:redone.revision,
      previewRedoRevision:redoneFromPreview.revision,
      facePreviewPixels,faceAt150:at150.frame?.precise?.size}));
    harness.assertNoErrors(page);
  } finally {
    await page?.close(); await browser?.close(); await server.stop();
    assert.equal(digest(modelPath), original.model, 'PMX原本が変わりました');
    assert.equal(digest(motionPath), original.motion, 'VMD原本が変わりました');
  }
});

function rawPng(bytes){
  const run=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0',
    '-frames:v','1','-vf','scale=160:90','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],
    {input:bytes,maxBuffer:1024*1024});
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.length,160*90*3);
  return run.stdout;
}
