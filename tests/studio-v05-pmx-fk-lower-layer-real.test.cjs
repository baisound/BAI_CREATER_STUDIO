'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const root=process.env.BAI_REAL_MMD_DATA;
const motionName='狐面物理確認用_頭振り_F000-0300.vmd';
const motionPath=root&&path.join(root,'mmd','vmd',motionName);
const models=[
  {collection:'A',name:'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx',port:8908},
  {collection:'B',name:'avatar-front-garment-v04.pmx',port:8909}
];
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function ok(reply){const body=await reply.text();assert.equal(reply.status,200,body);return JSON.parse(body);}
const difference=(a,b)=>Math.max(...a.map((value,index)=>Math.abs(value-b[index])));

for(const {collection,name:modelName,port} of models){
  const modelPath=root&&path.join(root,'mmd',collection,modelName);
  const available=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
test(`lower FK layer head rotation is inverted through an active upper correction: ${modelName}`,
  {skip:!available&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:180000},async()=>{
    const originals=[digest(modelPath),digest(motionPath)];
    const metadata=JSON.parse(fs.readFileSync(path.join(root,'mmd_assets.json'),'utf8'));
    const entries=metadata[collection].filter(entry=>entry.name===modelName||entry.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:collection==='A'?entries:[],
      B:collection==='B'?entries:[],vmd:[
      {name:motionName,size:fs.statSync(motionPath).size}]})};
    for(const entry of entries)seed[`mmd/${collection}/${entry.name}`]=fs.readFileSync(
      path.join(root,'mmd',collection,...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    const server=await harness.startServer({port,seed});
    let browser,page;
    try{
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'MOTION010 下位層FK逆算',kind:'empty'})}));
      const id=project.project.id;
      const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,action:'add',revision:0,asset_id:`mmd:${collection}:${modelName}`,
          transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
      const instance=scene.instances[0].id;
      const placed=await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,asset_id:`mmd:vmd:${motionName}`,track:'motion',start:0,duration:10,revision:0})}));
      const clip=placed.clip.id;
      await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,clip_id:clip,revision:placed.revision,instance_id:instance})}));
      async function mutate(revision,action,fields){
        return ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            project_id:id,revision,action,instance_id:instance,clip_id:clip,...fields})}));
      }
      const lower=await mutate(0,'set',{key:{frame:240,bone:'頭',
        rotation:[0,0,0,1],position:[0.02,0,0]}});
      const lowerId=lower.layers[0].id;
      const created=await mutate(lower.revision,'layer-create',{settings:{name:'上段頭補正'}});
      const upperId=created.layers[1].id;
      const upperRotation=[0,Math.sin(0.1),0,Math.cos(0.1)];
      const stacked=await mutate(created.revision,'set',{layer_id:upperId,key:{
        frame:240,bone:'頭',rotation:upperRotation,position:[0.01,0,0]}});
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
      await page.locator('#v146-fk-layer-select').selectOption(lowerId);
      await page.waitForFunction(()=>!document.querySelector('#v111-fk-gizmo-toggle')?.disabled);
      const pose=()=>page.evaluate(instanceId=>window.BAIStudioMultiScenePreview.poseProbe(
        instanceId,['頭','センター']),instance);
      const baseline=await pose();
      await page.locator('#v111-fk-gizmo-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#v111-fk-gizmo-toggle')?.getAttribute('aria-pressed')==='true',
        null,{timeout:10000});
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
        await page.mouse.up();await page.waitForTimeout(120);
        previewed=(await page.locator('#v111-fk-gizmo-status').textContent()).includes('回転を仮表示中');
        if(previewed)break;
      }
      assert.equal(previewed,true,'lower layer rotation must preview under a nonidentity upper quaternion');
      const during=await pose();
      assert.ok(difference(baseline.bones['頭'].quaternion,during.bones['頭'].quaternion)>0.01);
      assert.ok(difference(baseline.bones['頭'].position,during.bones['頭'].position)<1e-4);
      assert.ok(difference(baseline.bones['センター'].position,during.bones['センター'].position)<1e-5);
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
      const saved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`));
      assert.equal(saved.revision,stacked.revision+1);
      assert.deepEqual(saved.layers[1].keys,stacked.layers[1].keys);
      assert.ok(difference(saved.layers[0].keys[0].rotation,[0,0,0,1])>0.01);
      assert.deepEqual(saved.layers[0].keys[0].position,[0.02,0,0]);
      await page.locator('#v113-fk-gizmo-mode').selectOption('translate');
      await page.waitForFunction(()=>document.querySelector('#v111-fk-gizmo-toggle')?.textContent?.includes('位置'));
      const movedOrigin=await page.evaluate(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="頭"]');
        const canvas=document.querySelector('#v58-canvas').getBoundingClientRect();
        return {x:canvas.left+Number(marker.dataset.projectedX),
          y:canvas.top+Number(marker.dataset.projectedY)};
      });
      let translated=false;
      for(const [dx,dy] of [[0,0],[25,0],[0,-25],[-25,0],[0,25],[45,0],[0,-45],[-45,0]]){
        await page.mouse.move(movedOrigin.x+dx,movedOrigin.y+dy);
        await page.mouse.down();
        await page.mouse.move(movedOrigin.x+dx+25,movedOrigin.y+dy+20,{steps:12});
        await page.mouse.up();await page.waitForTimeout(120);
        translated=(await page.locator('#v111-fk-gizmo-status').textContent()).includes('位置を仮表示中');
        if(translated)break;
      }
      assert.equal(translated,true,'lower layer translation must preview under upper position');
      const translatedPose=await pose();
      assert.ok(difference(during.bones['頭'].position,translatedPose.bones['頭'].position)>0.02);
      assert.ok(difference(during.bones['頭'].quaternion,translatedPose.bones['頭'].quaternion)<1e-4);
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
      const savedBoth=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`));
      assert.deepEqual(savedBoth.layers[1].keys,stacked.layers[1].keys);
      assert.ok(difference(savedBoth.layers[0].keys[0].position,[0.02,0,0])>0.02);
      assert.ok(difference(savedBoth.layers[0].keys[0].rotation,saved.layers[0].keys[0].rotation)<1e-5);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
      await page.reload();
      await page.locator('#v06project').selectOption(id);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
        null,{timeout:120000});
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'lower-fk-reload'));
      const restored=await pose();
      assert.ok(difference(translatedPose.bones['頭'].quaternion,restored.bones['頭'].quaternion)<1e-5);
      assert.ok(difference(translatedPose.bones['頭'].position,restored.bones['頭'].position)<1e-5);
      await mutate(savedBoth.revision,'set',{layer_id:upperId,key:{frame:240,bone:'センター',
        rotation:[0,0,0,1],position:[0.01,0,0]}});
      await page.reload();
      await page.locator('#v06project').selectOption(id);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
        null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.locator('#v106-fk-frame').fill('240');
      await page.locator('#v106-fk-frame').dispatchEvent('change');
      await page.locator('#v106-fk-bone').selectOption('頭');
      await page.locator('#v146-fk-layer-select').selectOption(lowerId);
      await page.waitForFunction(()=>document.querySelector('#v111-fk-gizmo-toggle')?.disabled);
      assert.match(await page.locator('#v111-fk-gizmo-status').textContent(),/上位層に別の骨のキー/);
      assert.deepEqual([digest(modelPath),digest(motionPath)],originals);
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
}
