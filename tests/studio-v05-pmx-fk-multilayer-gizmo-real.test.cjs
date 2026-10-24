'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const root=process.env.BAI_REAL_MMD_DATA;
const modelName='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motionName='狐面物理確認用_頭振り_F000-0300.vmd';
const modelPath=root&&path.join(root,'mmd','A',modelName);
const motionPath=root&&path.join(root,'mmd','vmd',motionName);
const available=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function ok(response){const raw=await response.text();assert.equal(response.status,200,raw);return JSON.parse(raw);}
const difference=(a,b)=>Math.max(...a.map((value,index)=>Math.abs(value-b[index])));

test('real PMX gizmo edits the selected upper layer over a saved lower pose',
  {skip:!available&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:180000},async()=>{
    const originals=[digest(modelPath),digest(motionPath)];
    const metadata=JSON.parse(fs.readFileSync(path.join(root,'mmd_assets.json'),'utf8'));
    const entries=metadata.A.filter(entry=>entry.name===modelName||entry.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[
      {name:motionName,size:fs.statSync(motionPath).size}]})};
    for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(
      path.join(root,'mmd','A',...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    const server=await harness.startServer({port:8907,seed});
    let browser,page;
    try{
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'MOTION010 重畳3D骨操作',kind:'empty'})}));
      const id=project.project.id;
      const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,action:'add',revision:0,asset_id:`mmd:A:${modelName}`,
          transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
      const instance=scene.instances[0].id;
      const placement=await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,asset_id:`mmd:vmd:${motionName}`,track:'motion',start:0,duration:10,revision:0})}));
      const clip=placement.clip.id;
      await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,clip_id:clip,revision:placement.revision,instance_id:instance})}));
      async function mutate(revision,action,fields){
        return ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            project_id:id,revision,action,instance_id:instance,clip_id:clip,...fields})}));
      }
      const lower=await mutate(0,'set',{key:{frame:240,bone:'頭',
        rotation:[0,0,0,1],position:[0.02,0,0]}});
      const lowerId=lower.layers[0].id;
      const lowerArm=await mutate(lower.revision,'arm-set',{layer_id:lowerId,keys:[
        {frame:240,bone:'左腕',rotation:[0,Math.sin(0.03),0,Math.cos(0.03)]},
        {frame:240,bone:'左ひじ',rotation:[0,0,0,1]}
      ]});
      const created=await mutate(lowerArm.revision,'layer-create',{settings:{name:'上段3D補正'}});
      const upperId=created.layers[1].id;
      const stacked=await mutate(created.revision,'set',{layer_id:upperId,key:{
        frame:240,bone:'頭',rotation:[0,0,0,1],position:[0.01,0,0]}});
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(id);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
        null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.locator('#v106-fk-frame').fill('240');
      await page.locator('#v106-fk-frame').dispatchEvent('change');
      await page.locator('#v106-fk-bone').selectOption('頭');
      await page.locator('#v111-fk-gizmo-goto').click();
      await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68?.status().frame===240);
      const pose=()=>page.evaluate(instanceId=>window.BAIStudioMultiScenePreview.poseProbe(
        instanceId,['頭','センター']),instance);
      const baseline=await pose();
      await page.locator('#v146-fk-layer-select').selectOption(lowerId);
      assert.equal(await page.locator('#v111-fk-gizmo-toggle').isDisabled(),false);
      await page.locator('#v106-fk-bone').selectOption('左足ＩＫ');
      assert.equal(await page.locator('#v111-fk-gizmo-toggle').isDisabled(),true);
      await page.locator('#v106-fk-bone').selectOption('頭');
      await page.locator('#v146-fk-layer-select').selectOption(upperId);
      await page.waitForFunction(()=>!document.querySelector('#v111-fk-gizmo-toggle')?.disabled);
      await page.locator('#v111-fk-gizmo-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#v111-fk-gizmo-toggle')?.getAttribute('aria-pressed')==='true',
        null,{timeout:10000});
      const pressed=await page.locator('#v111-fk-gizmo-toggle').getAttribute('aria-pressed');
      assert.equal(pressed,'true',JSON.stringify({
        status:await page.locator('#v111-fk-gizmo-status').textContent(),
        fk:await page.locator('#v106-fk-status').textContent(),
        selected:await page.locator('#v146-fk-layer-select').inputValue(),
        bone:await page.locator('#v106-fk-bone').inputValue()}));
      const origin=await page.evaluate(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="頭"]');
        const canvas=document.querySelector('#v58-canvas').getBoundingClientRect();
        return {x:canvas.left+Number(marker.dataset.projectedX),
          y:canvas.top+Number(marker.dataset.projectedY)};
      });
      let previewed=false;
      for(const [dx,dy] of [[36,0],[0,36],[-36,0],[0,-36],[52,0],[0,52]]){
        await page.mouse.move(origin.x+dx,origin.y+dy);
        await page.mouse.down();
        await page.mouse.move(origin.x+dx+35,origin.y+dy+28,{steps:12});
        await page.mouse.up();
        await page.waitForTimeout(120);
        previewed=(await page.locator('#v111-fk-gizmo-status').textContent()).includes('回転を仮表示中');
        if(previewed)break;
      }
      assert.equal(previewed,true,'upper layer rotation handle must preview');
      const during=await pose();
      assert.ok(difference(baseline.bones['頭'].quaternion,during.bones['頭'].quaternion)>0.01);
      assert.ok(difference(baseline.bones['頭'].position,during.bones['頭'].position)<1e-4);
      assert.ok(difference(baseline.bones['センター'].position,during.bones['センター'].position)<1e-5);
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
      const saved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`));
      assert.equal(saved.revision,stacked.revision+1);
      assert.deepEqual(saved.layers[0].keys,stacked.layers[0].keys);
      assert.ok(difference(saved.layers[1].keys[0].rotation,[0,0,0,1])>0.01);
      assert.ok(difference(saved.layers[1].keys[0].position,[0.01,0,0])<1e-5);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
      await page.reload();
      await page.locator('#v06project').selectOption(id);
      await page.locator('#nav [data-workspace="edit"]').click();
      try{
        await page.locator('#v70sceneOpen').waitFor({timeout:15000});
      }catch(error){
        const state=await page.evaluate(()=>({url:location.href,readyState:document.readyState,
          transport:Boolean(document.querySelector('#v68transport')),
          panel:Boolean(document.querySelector('#v58-multi-preview')),
          canvas:Boolean(document.querySelector('#v58-canvas')),
          sceneBridge:Boolean(window.BAIStudioMediaPreviewV68),
          scene:Boolean(window.BAIStudioMultiScenePreview)}));
        console.error(JSON.stringify({reloadUiState:state,pageErrors:page.__monitor.errors}));
        throw error;
      }
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
        null,{timeout:120000});
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'gizmo-reload'));
      const restored=await pose();
      assert.ok(difference(during.bones['頭'].quaternion,restored.bones['頭'].quaternion)<1e-5);
      assert.ok(difference(during.bones['頭'].position,restored.bones['頭'].position)<1e-5);
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.locator('#v146-fk-layer-select').selectOption(upperId);
      await page.locator('#v106-fk-frame').fill('240');
      await page.locator('#v106-fk-frame').dispatchEvent('change');
      await page.locator('#v111-fk-gizmo-goto').click();
      await page.locator('#v137-arm-side').selectOption('左');
      assert.equal(await page.locator('#v137-arm-hand').isDisabled(),false);
      const armPose=()=>page.evaluate(instanceId=>window.BAIStudioMultiScenePreview.poseProbe(
        instanceId,['左腕','左ひじ','左手首','右手首','頭','上半身']),instance);
      const armBefore=await armPose();
      await page.locator('#v137-arm-hand').click();
      await page.locator('#v111-fk-gizmo-toggle').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().gizmo?.armSide==='左');
      await page.locator('#v110-bone-tree').evaluate(el=>el.open=true);
      await page.locator('#v110-bone-search').fill('左手首');
      await page.waitForFunction(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="左手首"]');
        return marker&&!marker.hidden&&marker.dataset.projectedX;
      });
      const handle=await page.evaluate(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="左手首"]');
        const canvas=document.querySelector('#v58-canvas').getBoundingClientRect();
        document.querySelector('#v110-bone-overlay').style.display='none';
        return {x:canvas.left+Number(marker.dataset.projectedX),
          y:canvas.top+Number(marker.dataset.projectedY)};
      });
      let armPreview=false;
      for(const [dx,dy,mx,my] of [[25,0,35,24],[0,-25,35,24],[-25,0,-35,24],
        [0,25,-35,-24],[45,0,-35,24],[0,-45,35,24]]){
        await page.mouse.move(handle.x+dx,handle.y+dy);
        await page.mouse.down();
        await page.mouse.move(handle.x+dx+mx,handle.y+dy+my,{steps:12});
        await page.mouse.up();await page.waitForTimeout(180);
        armPreview=(await page.locator('#v111-fk-gizmo-status').textContent()).includes('腕IKを仮表示中');
        if(armPreview)break;
      }
      assert.equal(armPreview,true,'upper arm handle must preview over lower arm layer');
      const armDuring=await armPose();
      const world=bone=>bone.world.slice(12,15);
      const length=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));
      assert.ok(length(world(armBefore.bones['左手首']),world(armDuring.bones['左手首']))>1e-4);
      assert.ok(length(world(armBefore.bones['右手首']),world(armDuring.bones['右手首']))<1e-4);
      assert.ok(length(world(armBefore.bones['頭']),world(armDuring.bones['頭']))<1e-4);
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('腕・ひじの2キーを1回の操作として保存しました'));
      const armSaved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`));
      assert.deepEqual(armSaved.layers[0].keys,stacked.layers[0].keys);
      assert.deepEqual(armSaved.layers[1].keys.map(key=>key.bone),['左ひじ','左腕','頭']);
      await page.locator('#v106-fk-undo').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('戻しました'));
      const undone=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`));
      assert.deepEqual(undone.layers[0].keys,stacked.layers[0].keys);
      assert.deepEqual(undone.layers[1].keys.map(key=>key.bone),['頭']);
      await page.locator('#v106-fk-redo').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('やり直しました'));
      const redone=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`));
      assert.deepEqual(redone.layers[0].keys,stacked.layers[0].keys);
      assert.deepEqual(redone.layers[1].keys,armSaved.layers[1].keys);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
      await page.reload();
      await page.locator('#v06project').selectOption(id);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
        null,{timeout:120000});
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'arm-layer-reload'));
      const armRestored=await armPose();
      assert.ok(length(world(armDuring.bones['左手首']),world(armRestored.bones['左手首']))<1e-5);
      assert.deepEqual([digest(modelPath),digest(motionPath)],originals);
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
