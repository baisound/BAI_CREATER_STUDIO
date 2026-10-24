'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const root=process.env.BAI_REAL_MMD_DATA;
const modelName='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motionName='神っぽいな.vmd';
const modelPath=root&&path.join(root,'mmd','A',modelName);
const motionPath=root&&path.join(root,'mmd','vmd',motionName);
const available=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const difference=(a,b)=>Math.max(...a.map((value,index)=>Math.abs(value-b[index])));
async function ok(reply){const raw=await reply.text();assert.equal(reply.status,200,raw);return JSON.parse(raw);}

test('real 203s VMD FK correction at 90s previews, saves, and reloads',
  {skip:!available&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:180000},async()=>{
    const originals=[digest(modelPath),digest(motionPath)];
    const metadata=JSON.parse(fs.readFileSync(path.join(root,'mmd_assets.json'),'utf8'));
    const entries=metadata.A.filter(entry=>entry.name===modelName||entry.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[
      {name:motionName,size:fs.statSync(motionPath).size}]}),
      'camera_project.json':JSON.stringify({schema:1,fps:30,duration:12000,keys:[
        {frame:0,position:[0,1.6,5],target:[0,1,0],fov:40}]})};
    for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(
      path.join(root,'mmd','A',...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    const server=await harness.startServer({port:8911,seed});
    let browser,page;
    const badResponses=[];
    try{
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'MOTION010 90秒補正実試験',kind:'empty'})}));
      const id=project.project.id;
      const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,action:'add',revision:0,asset_id:`mmd:A:${modelName}`,
          transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
      const instance=scene.instances[0].id;
      const placed=await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,asset_id:`mmd:vmd:${motionName}`,track:'motion',start:0,
          duration:200,revision:0})}));
      await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,clip_id:placed.clip.id,revision:placed.revision,instance_id:instance})}));
      browser=await server.launchBrowser();page=await server.newPage(browser);
      page.on('response',reply=>{
        if(reply.status()>=400)badResponses.push(`${reply.status()} ${reply.url()}`);
      });
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(id);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
        null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.locator('#v106-fk-frame').fill('5400');
      await page.locator('#v106-fk-frame').dispatchEvent('change');
      await page.locator('#v106-fk-bone').selectOption('頭');
      await page.evaluate(()=>window.BAIStudioMediaPreviewV68.seek(5400));
      await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68?.status().frame===5400);
      const pose=()=>page.evaluate(instanceId=>window.BAIStudioMultiScenePreview.poseProbe(
        instanceId,['頭','センター']),instance);
      const baseline=await pose();
      await page.locator('#v106-fk-y').fill('12');
      await page.locator('#v112-fk-position-x').fill('0.15');
      await page.locator('#v106-fk-preview').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('仮補正を表示中'));
      const previewed=await pose();
      assert.ok(difference(baseline.bones['頭'].quaternion,previewed.bones['頭'].quaternion)>0.01);
      assert.ok(difference(baseline.bones['頭'].position,previewed.bones['頭'].position)>0.1);
      assert.ok(difference(baseline.bones['センター'].quaternion,previewed.bones['センター'].quaternion)<1e-5);
      assert.ok(difference(baseline.bones['センター'].position,previewed.bones['センター'].position)<1e-5);
      await page.locator('#v106-fk-cancel').click();
      const cancelled=await pose();
      assert.ok(difference(baseline.bones['頭'].quaternion,cancelled.bones['頭'].quaternion)<1e-5);
      assert.ok(difference(baseline.bones['頭'].position,cancelled.bones['頭'].position)<1e-5);
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
      const saved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`));
      assert.equal(saved.revision,1);
      assert.equal(saved.layers[0].keys[0].frame,5400);
      assert.equal(saved.layers[0].keys[0].bone,'頭');
      assert.deepEqual(saved.layers[0].keys[0].position,[0.15,0,0]);
      assert.equal(saved.layers[0].model_sha256,originals[0]);
      assert.equal(saved.layers[0].motion_sha256,originals[1]);
      const corrected=await pose();
      assert.ok(difference(previewed.bones['頭'].quaternion,corrected.bones['頭'].quaternion)<1e-5);
      assert.ok(difference(previewed.bones['頭'].position,corrected.bones['頭'].position)<1e-5);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
      await page.reload();
      await page.locator('#v06project').selectOption(id);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.waitForFunction(()=>document.querySelector('#v70sceneOpen'),null,{timeout:30000});
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
        null,{timeout:120000});
      await page.evaluate(()=>window.BAIStudioMediaPreviewV68.seek(5400));
      const restored=await pose();
      assert.ok(difference(corrected.bones['頭'].quaternion,restored.bones['頭'].quaternion)<1e-5);
      assert.ok(difference(corrected.bones['頭'].position,restored.bones['頭'].position)<1e-5);
      assert.deepEqual([digest(modelPath),digest(motionPath)],originals);
      assert.deepEqual(badResponses,[]);
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
