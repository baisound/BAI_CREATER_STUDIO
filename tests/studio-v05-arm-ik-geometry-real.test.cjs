'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const source=process.env.BAI_REAL_MMD_DATA;
const bank=process.env.BAI_TEST_MMD_BANK||'A';
const model=process.env.BAI_TEST_MMD_MODEL||'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motion='狐面物理確認用_頭振り_F000-0300.vmd';
const modelPath=source&&path.join(source,'mmd',bank,model);
const motionPath=source&&path.join(source,'mmd','vmd',motion);
const exists=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));
async function ok(response){
  const body=await response.text();
  if(response.status!==200)throw Error(body);
  return JSON.parse(body);
}

test('real PMX arm chains solve, preview, handle, edit mode, save and roundtrip on both sides',
  {skip:!exists&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:300000},async()=>{
  const before=[digest(modelPath),digest(motionPath)];
  const metadata=JSON.parse(fs.readFileSync(path.join(source,'mmd_assets.json'),'utf8'));
  assert.ok(['A','B'].includes(bank));
  const entries=metadata[bank].filter(entry=>entry.name===model||entry.name.startsWith('tex/'));
  assert.ok(entries.some(entry=>entry.name===model));
  const seed={'mmd_assets.json':JSON.stringify({A:bank==='A'?entries:[],B:bank==='B'?entries:[],
    vmd:[{name:motion,size:fs.statSync(motionPath).size}]})};
  for(const entry of entries)seed[`mmd/${bank}/${entry.name}`]=fs.readFileSync(
    path.join(source,'mmd',bank,...entry.name.split('/')));
  seed[`mmd/vmd/${motion}`]=fs.readFileSync(motionPath);
  const server=await harness.startServer({port:8899,seed});
  let browser,page;
  try{
    const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'腕IK幾何検証',kind:'empty'})}));
    const id=project.project.id;
    const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:id,action:'add',revision:0,asset_id:`mmd:${bank}:${model}`,
        transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
    const instanceId=scene.instances[0].id;
    const placed=await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:id,asset_id:`mmd:vmd:${motion}`,
        track:'motion',start:0,duration:10,revision:0})}));
    await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:id,clip_id:placed.clip.id,
        revision:placed.revision,instance_id:instanceId})}));
    browser=await server.launchBrowser();page=await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
      null,{timeout:120000});
    await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'arm-geometry'));
    const names=['左腕','左腕捩','左ひじ','左手捩','左手首',
      '右腕','右腕捩','右ひじ','右手捩','右手首'];
    const pose=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,input.names),{instanceId,names});
    const unchangedBefore=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['頭','上半身']),{instanceId});
    const position=name=>pose.bones[name].world.slice(12,15);
    const measured={};
    for(const side of ['左','右']){
      const shoulder=position(side+'腕'),elbow=position(side+'ひじ'),wrist=position(side+'手首');
      const upper=distance(shoulder,elbow),lower=distance(elbow,wrist);
      const direct=distance(shoulder,wrist),straightGap=upper+lower-direct;
      const axis=wrist.map((value,index)=>(value-shoulder[index])/direct);
      const along=elbow.reduce((sum,value,index)=>sum+(value-shoulder[index])*axis[index],0);
      const radial=distance(elbow,shoulder.map((value,index)=>value+along*axis[index]));
      const inner=direct-0.04;
      const circleX=(upper*upper-lower*lower+inner*inner)/(2*inner);
      const inwardCircleRadius=Math.sqrt(Math.max(0,upper*upper-circleX*circleX));
      measured[side]={upper,lower,direct,straightGap,radial,inwardCircleRadius,
        twistBeforeElbow:distance(position(side+'腕捩'),elbow),
        twistBeforeWrist:distance(position(side+'手捩'),wrist)};
      console.log(JSON.stringify({bank,model,side,armGeometry:measured[side]}));
      assert.ok(upper>0.15&&lower>0.15);
      assert.ok(straightGap>=-1e-6&&straightGap<upper+lower);
      assert.ok(inwardCircleRadius>0.001);
      if(model.startsWith('Baisound-New-')){
        assert.ok(straightGap<1e-4);
        assert.ok(radial<0.001);
      }
      assert.ok(measured[side].twistBeforeElbow>0.02);
      assert.ok(measured[side].twistBeforeWrist>0.02);
    }
    console.log(JSON.stringify(measured));
    for(const side of ['左','右']){
      const shoulder=position(side+'腕'),elbow=position(side+'ひじ'),wrist=position(side+'手首');
      const direct=distance(shoulder,wrist);
      const target=shoulder.map((value,index)=>value+(wrist[index]-value)*(direct-0.04)/direct);
      const fallbackPole=[shoulder[0],shoulder[1],shoulder[2]+(side==='左'?1:-1)];
      const solved=await page.evaluate(async input=>{
        const {solveArmGeometry}=await import('/studio/v05/js/arm-ik-geometry-v134.mjs');
        return solveArmGeometry(input);
      },{shoulder,elbow,wrist,target,fallbackPole});
      assert.equal(solved.poleSource,
        measured[side].radial<=Math.max(1e-5,measured[side].upper*0.01)?'fallback':'current');
      assert.ok(distance(solved.wristTarget,target)<1e-8);
      assert.ok(Math.abs(distance(solved.elbowTarget,shoulder)-solved.upper)<1e-8);
      assert.ok(Math.abs(distance(solved.elbowTarget,solved.wristTarget)-solved.lower)<1e-8);
    }
    const armProbes={};
    for(const side of ['左','右']){
      const shoulder=position(side+'腕'),wrist=position(side+'手首');
      const direct=distance(shoulder,wrist);
      const target=shoulder.map((value,index)=>value+(wrist[index]-value)*(direct-0.04)/direct);
      armProbes[side]=await page.evaluate(input=>
        window.BAIStudioMultiScenePreview.armIkProbe(input.instanceId,input.side,
          input.target,input.fallbackPole),
      {instanceId,side,target,fallbackPole:[shoulder[0],shoulder[1],
        shoulder[2]+(side==='左'?1:-1)]});
      assert.equal(armProbes[side].frame,240);
      assert.ok(armProbes[side].residual<1e-3);
      assert.ok(armProbes[side].elbowResidual<1e-3);
      assert.ok(armProbes[side].restoreDifference<1e-8);
      assert.ok(armProbes[side].keys.every(key=>key.rotation.every(Number.isFinite)));
    }
    const leftInput={instanceId,side:'左',target:armProbes['左'].wristTarget,
      fallbackPole:[position('左腕')[0],position('左腕')[1],position('左腕')[2]+1]};
    const preview=await page.evaluate(input=>window.BAIStudioMultiScenePreview.armIkPreview(
      input.instanceId,input.side,input.target,input.fallbackPole),leftInput);
    assert.ok(preview.residual<1e-3);
    assert.ok(preview.unrelatedDrift<1e-4);
    const previewPose=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左手首']),{instanceId});
    assert.ok(distance(previewPose.bones['左手首'].world.slice(12,15),
      armProbes['左'].wristTarget)<1e-3);
    await page.keyboard.press('Escape');
    const cancelled=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左手首']),{instanceId});
    assert.ok(distance(cancelled.bones['左手首'].world.slice(12,15),position('左手首'))<1e-8);
    const endpoint=`${server.base}/api/studio/v05/motion-edits`;
    assert.equal((await ok(await fetch(`${endpoint}?id=${id}`))).revision,0);
    const post=body=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:id,...(!['undo','redo'].includes(body.action)?
        {instance_id:instanceId,clip_id:placed.clip.id}:{}),...body})});
    const head={frame:240,bone:'頭',rotation:[0,0,0,1]};
    const first=await ok(await post({revision:0,action:'set',key:head}));
    assert.equal(first.revision,1);
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
      null,{timeout:120000});
    await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'arm-pair-preview-save'));
    const secondPreview=await page.evaluate(input=>window.BAIStudioMultiScenePreview.armIkPreview(
      input.instanceId,input.side,input.target,input.fallbackPole),leftInput);
    assert.ok(secondPreview.residual<1e-3);
    await page.locator('#v106-fk-save').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent
      ?.includes('腕・ひじの2キーを1回の操作として保存しました'));
    const paired=await ok(await fetch(`${endpoint}?id=${id}`));
    assert.equal(paired.revision,2);
    assert.deepEqual(paired.layers[0].keys.map(key=>key.bone),['左ひじ','左腕','頭']);
    const rightPair=await ok(await post({revision:2,action:'arm-set',keys:armProbes['右'].keys}));
    assert.equal(rightPair.revision,3);
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
    try{
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
        null,{timeout:120000});
    }catch(error){
      console.log(JSON.stringify({refreshStatus:await page.evaluate(()=>({
        scene:window.BAIStudioMultiScenePreview?.status(),
        progress:document.querySelector('#v58-progress')?.textContent,
        motion:document.querySelector('#v59-motion-status')?.textContent})),
      browserErrors:page.__monitor?.errors}));
      throw error;
    }
    await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'arm-local-rotation'));
    const edited=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,input.names),{instanceId,names:[...names,'頭','上半身']});
    for(const side of ['左','右']){
      const actual=edited.bones[side+'手首'].world.slice(12,15);
      console.log(`${side} 腕IK: 直接残差=${armProbes[side].residual}, `+
        `保存再評価残差=${distance(actual,armProbes[side].wristTarget)}, `+
        `復元差=${armProbes[side].restoreDifference}`);
      assert.ok(distance(actual,armProbes[side].wristTarget)<1e-3,
        `${side}手首の付与後残差 ${distance(actual,armProbes[side].wristTarget)}`);
    }
    for(const name of ['頭','上半身']){
      const original=unchangedBefore.bones[name],current=edited.bones[name];
      assert.ok(original&&current);
      assert.ok(distance(original.world.slice(12,15),current.world.slice(12,15))<1e-4);
      assert.ok(original.world.every((value,index)=>Math.abs(value-current.world[index])<1e-4));
    }
    const invalid=await post({revision:3,action:'arm-set',keys:[
      armProbes['左'].keys[0],{...armProbes['左'].keys[1],frame:241}]});
    assert.equal(invalid.status,422);
    assert.equal((await ok(await fetch(`${endpoint}?id=${id}`))).revision,3);
    const undo=await ok(await post({revision:3,action:'undo'}));
    assert.equal(undo.revision,4);
    assert.deepEqual(undo.layers[0].keys.map(key=>key.bone),['左ひじ','左腕','頭']);
    const redo=await ok(await post({revision:4,action:'redo'}));
    assert.equal(redo.revision,5);
    assert.deepEqual(redo.layers[0].keys.map(key=>key.bone),
      ['右ひじ','右腕','左ひじ','左腕','頭']);
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
      null,{timeout:120000});
    await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
    await page.locator('#v106-fk-frame').fill('240');
    await page.locator('#v106-fk-frame').dispatchEvent('change');
    await page.locator('#v111-fk-gizmo-goto').click();
    await page.locator('#v137-arm-side').selectOption('左');
    assert.equal(await page.locator('#v137-arm-hand').isDisabled(),false);
    await page.locator('#v137-arm-hand').click();
    assert.equal(await page.locator('#v113-fk-gizmo-mode').inputValue(),'arm-hand');
    await page.locator('#v111-fk-gizmo-toggle').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().gizmo?.armSide==='左');
    const handHandle=await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().gizmo);
    assert.ok(distance(handHandle.handleWorld,handHandle.armWristWorld)<1e-6);
    await page.locator('#v110-bone-tree').evaluate(el=>el.open=true);
    await page.locator('#v110-bone-search').fill('左手首');
    await page.waitForFunction(()=>{
      const marker=document.querySelector('#v110-bone-overlay button[data-bone="左手首"]');
      return marker&&!marker.hidden&&marker.dataset.projectedX;
    });
    const handScreen=await page.evaluate(()=>{
      const marker=document.querySelector('#v110-bone-overlay button[data-bone="左手首"]');
      const canvas=document.querySelector('#v58-canvas').getBoundingClientRect();
      document.querySelector('#v110-bone-overlay').style.display='none';
      return {x:canvas.left+Number(marker.dataset.projectedX),
        y:canvas.top+Number(marker.dataset.projectedY)};
    });
    const handBefore=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左ひじ','左手首','右手首']),{instanceId});
    let handAfter=null;
    for(const [dx,dy,mx,my] of [[25,0,35,24],[0,-25,35,24],[-25,0,-35,24],
      [0,25,-35,-24],[45,0,-35,24],[0,-45,35,24]]){
      await page.mouse.move(handScreen.x+dx,handScreen.y+dy);await page.mouse.down();
      await page.mouse.move(handScreen.x+dx+mx,handScreen.y+dy+my,{steps:12});
      await page.mouse.up();await page.waitForTimeout(180);
      const handleStatus=await page.locator('#v111-fk-gizmo-status').textContent();
      console.log(JSON.stringify({armPointerAttempt:[dx,dy,mx,my],handleStatus,
        fkStatus:await page.locator('#v106-fk-status').textContent()}));
      if(handleStatus.includes('腕IKを仮表示中')){
        handAfter=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
          input.instanceId,['左ひじ','左手首','右手首']),{instanceId});break;
      }
    }
    assert.ok(handAfter,'実ポインタの手先ハンドルで2キー仮表示が必要');
    assert.ok(distance(handBefore.bones['左手首'].world.slice(12,15),
      handAfter.bones['左手首'].world.slice(12,15))>1e-4);
    assert.ok(distance(handBefore.bones['右手首'].world.slice(12,15),
      handAfter.bones['右手首'].world.slice(12,15))<1e-4);
    assert.equal((await ok(await fetch(`${endpoint}?id=${id}`))).revision,5);
    await page.keyboard.press('Escape');
    const handCancelled=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左手首']),{instanceId});
    assert.ok(distance(handBefore.bones['左手首'].world.slice(12,15),
      handCancelled.bones['左手首'].world.slice(12,15))<1e-5);
    await page.mouse.move(handScreen.x+25,handScreen.y);
    await page.mouse.down();
    await page.mouse.move(handScreen.x+60,handScreen.y+24,{steps:12});
    await page.mouse.up();
    await page.waitForFunction(()=>document.querySelector('#v111-fk-gizmo-status')?.textContent
      ?.includes('腕IKを仮表示中'));
    const handSavedPose=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左ひじ','左手首','右手首']),{instanceId});
    await page.locator('#v106-fk-save').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent
      ?.includes('腕・ひじの2キーを1回の操作として保存しました'));
    assert.equal((await ok(await fetch(`${endpoint}?id=${id}`))).revision,6);
    await page.locator('#v106-fk-undo').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('戻しました'));
    const handUndone=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左手首']),{instanceId});
    assert.ok(distance(handBefore.bones['左手首'].world.slice(12,15),
      handUndone.bones['左手首'].world.slice(12,15))<1e-5);
    await page.locator('#v106-fk-redo').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('やり直しました'));
    const handRedone=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左手首']),{instanceId});
    assert.ok(distance(handSavedPose.bones['左手首'].world.slice(12,15),
      handRedone.bones['左手首'].world.slice(12,15))<1e-5);
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
      null,{timeout:120000});
    await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'arm-hand-reload'));
    const handReloaded=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左手首']),{instanceId});
    assert.ok(distance(handSavedPose.bones['左手首'].world.slice(12,15),
      handReloaded.bones['左手首'].world.slice(12,15))<1e-5);
    const bentPreview=await page.evaluate(input=>window.BAIStudioMultiScenePreview.armIkPreview(
      input.instanceId,input.side,input.target,input.fallbackPole),leftInput);
    assert.ok(bentPreview.residual<1e-3);
    await page.locator('#v106-fk-save').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent
      ?.includes('腕・ひじの2キーを1回の操作として保存しました'));
    assert.equal((await ok(await fetch(`${endpoint}?id=${id}`))).revision,9);
    await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
    await page.locator('#v106-fk-frame').fill('240');
    await page.locator('#v106-fk-frame').dispatchEvent('change');
    await page.locator('#v111-fk-gizmo-goto').click();
    await page.locator('#v137-arm-side').selectOption('左');
    assert.equal(await page.locator('#v137-arm-elbow').isDisabled(),false);
    await page.locator('#v137-arm-elbow').click();
    assert.equal(await page.locator('#v113-fk-gizmo-mode').inputValue(),'arm-elbow');
    await page.locator('#v111-fk-gizmo-toggle').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().gizmo?.armElbowWorld);
    const elbowHandle=await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().gizmo);
    assert.ok(distance(elbowHandle.handleWorld,elbowHandle.armElbowWorld)<1e-6);
    await page.locator('#v110-bone-tree').evaluate(el=>el.open=true);
    await page.locator('#v110-bone-search').fill('左ひじ');
    await page.waitForFunction(()=>{
      const marker=document.querySelector('#v110-bone-overlay button[data-bone="左ひじ"]');
      return marker&&!marker.hidden&&marker.dataset.projectedX;
    });
    const elbowScreen=await page.evaluate(()=>{
      const marker=document.querySelector('#v110-bone-overlay button[data-bone="左ひじ"]');
      const canvas=document.querySelector('#v58-canvas').getBoundingClientRect();
      document.querySelector('#v110-bone-overlay').style.display='none';
      return {x:canvas.left+Number(marker.dataset.projectedX),
        y:canvas.top+Number(marker.dataset.projectedY)};
    });
    const elbowBefore=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左ひじ','左手首','右手首']),{instanceId});
    let elbowAfter=null;
    for(const [dx,dy,mx,my] of [[25,0,35,24],[0,-25,35,24],[-25,0,-35,24],
      [0,25,-35,-24],[45,0,-35,24],[0,-45,35,24]]){
      await page.mouse.move(elbowScreen.x+dx,elbowScreen.y+dy);await page.mouse.down();
      await page.mouse.move(elbowScreen.x+dx+mx,elbowScreen.y+dy+my,{steps:12});
      await page.mouse.up();await page.waitForTimeout(180);
      const status=await page.locator('#v111-fk-gizmo-status').textContent();
      console.log(JSON.stringify({elbowPointerAttempt:[dx,dy,mx,my],status}));
      if(status.includes('腕IKを仮表示中')){
        elbowAfter=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
          input.instanceId,['左ひじ','左手首','右手首']),{instanceId});break;
      }
    }
    assert.ok(elbowAfter,'実ポインタのひじハンドルで2キー仮表示が必要');
    assert.ok(distance(elbowBefore.bones['左ひじ'].world.slice(12,15),
      elbowAfter.bones['左ひじ'].world.slice(12,15))>1e-3);
    assert.ok(distance(elbowBefore.bones['左手首'].world.slice(12,15),
      elbowAfter.bones['左手首'].world.slice(12,15))<1e-3);
    assert.ok(distance(elbowBefore.bones['右手首'].world.slice(12,15),
      elbowAfter.bones['右手首'].world.slice(12,15))<1e-4);
    assert.equal((await ok(await fetch(`${endpoint}?id=${id}`))).revision,9);
    await page.locator('#v106-fk-save').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent
      ?.includes('腕・ひじの2キーを1回の操作として保存しました'));
    assert.equal((await ok(await fetch(`${endpoint}?id=${id}`))).revision,10);
    await page.locator('#v106-fk-undo').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('戻しました'));
    const elbowUndone=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左ひじ','左手首']),{instanceId});
    assert.ok(distance(elbowBefore.bones['左ひじ'].world.slice(12,15),
      elbowUndone.bones['左ひじ'].world.slice(12,15))<1e-5);
    await page.locator('#v106-fk-redo').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('やり直しました'));
    const elbowRedone=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左ひじ','左手首']),{instanceId});
    assert.ok(distance(elbowAfter.bones['左ひじ'].world.slice(12,15),
      elbowRedone.bones['左ひじ'].world.slice(12,15))<1e-5);
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
      null,{timeout:120000});
    await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'arm-elbow-reload'));
    const elbowReloaded=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左ひじ','左手首']),{instanceId});
    assert.ok(distance(elbowAfter.bones['左ひじ'].world.slice(12,15),
      elbowReloaded.bones['左ひじ'].world.slice(12,15))<1e-5);
    assert.ok(distance(elbowAfter.bones['左手首'].world.slice(12,15),
      elbowReloaded.bones['左手首'].world.slice(12,15))<1e-5);
    await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
    await page.locator('#v106-fk-frame').fill('240');
    await page.locator('#v106-fk-frame').dispatchEvent('change');
    await page.locator('#v111-fk-gizmo-goto').click();
    await page.locator('#v137-arm-side').selectOption('右');
    await page.locator('#v137-arm-hand').click();
    await page.locator('#v111-fk-gizmo-toggle').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().gizmo?.armSide==='右');
    const rightBefore=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左手首','右ひじ','右手首']),{instanceId});
    async function dragArmMarker(name){
      await page.locator('#v110-bone-tree').evaluate(el=>el.open=true);
      await page.locator('#v110-bone-search').fill(name);
      await page.waitForFunction(bone=>{
        const marker=document.querySelector(`#v110-bone-overlay button[data-bone="${bone}"]`);
        return marker&&!marker.hidden&&marker.dataset.projectedX;
      },name);
      const screen=await page.evaluate(bone=>{
        const overlay=document.querySelector('#v110-bone-overlay');overlay.style.display='';
        const marker=overlay.querySelector(`button[data-bone="${bone}"]`);
        const canvas=document.querySelector('#v58-canvas').getBoundingClientRect();
        const point={x:canvas.left+Number(marker.dataset.projectedX),
          y:canvas.top+Number(marker.dataset.projectedY)};
        overlay.style.display='none';return point;
      },name);
      for(const [dx,dy,mx,my] of [[25,0,35,24],[0,-25,35,24],[-25,0,-35,24],
        [0,25,-35,-24],[45,0,-35,24],[0,-45,35,24]]){
        await page.mouse.move(screen.x+dx,screen.y+dy);await page.mouse.down();
        await page.mouse.move(screen.x+dx+mx,screen.y+dy+my,{steps:12});
        await page.mouse.up();await page.waitForTimeout(180);
        const status=await page.locator('#v111-fk-gizmo-status').textContent();
        console.log(JSON.stringify({rightArmPointer:name,attempt:[dx,dy,mx,my],status,
          fkStatus:await page.locator('#v106-fk-status').textContent()}));
        if(status.includes('腕IKを仮表示中'))return status;
      }
      return null;
    }
    assert.ok(await dragArmMarker('右手首'),'右手先の実ポインタ操作');
    const rightHandAfter=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左手首','右ひじ','右手首']),{instanceId});
    assert.ok(distance(rightBefore.bones['右手首'].world.slice(12,15),
      rightHandAfter.bones['右手首'].world.slice(12,15))>1e-4);
    assert.ok(distance(rightBefore.bones['左手首'].world.slice(12,15),
      rightHandAfter.bones['左手首'].world.slice(12,15))<1e-4);
    await page.keyboard.press('Escape');
    const rightCancelled=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['右手首']),{instanceId});
    assert.ok(distance(rightBefore.bones['右手首'].world.slice(12,15),
      rightCancelled.bones['右手首'].world.slice(12,15))<1e-5);
    await page.locator('#v137-arm-elbow').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().gizmo?.armElbowWorld);
    assert.ok(await dragArmMarker('右ひじ'),'右ひじの実ポインタ操作');
    const rightElbowAfter=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,['左手首','右ひじ','右手首']),{instanceId});
    assert.ok(distance(rightBefore.bones['右ひじ'].world.slice(12,15),
      rightElbowAfter.bones['右ひじ'].world.slice(12,15))>1e-3);
    assert.ok(distance(rightBefore.bones['右手首'].world.slice(12,15),
      rightElbowAfter.bones['右手首'].world.slice(12,15))<1e-3);
    assert.ok(distance(rightBefore.bones['左手首'].world.slice(12,15),
      rightElbowAfter.bones['左手首'].world.slice(12,15))<1e-4);
    await page.keyboard.press('Escape');
    assert.equal((await ok(await fetch(`${endpoint}?id=${id}`))).revision,12);
    await page.locator('#v111-fk-gizmo-toggle').click();
    const allPose=()=>page.evaluate(instanceId=>{
      const names=[...document.querySelector('#v106-fk-bone').options].map(option=>option.value)
        .filter(Boolean),bones={};
      for(let offset=0;offset<names.length;offset+=16)
        Object.assign(bones,window.BAIStudioMultiScenePreview.poseProbe(
          instanceId,names.slice(offset,offset+16)).bones);
      return bones;
    },instanceId);
    const modeBaseline=await ok(await fetch(`${endpoint}?id=${id}`));
    const poseBaseline=await allPose();
    assert.ok(Object.keys(poseBaseline).length>=200);
    async function switchArmMode(limb,mode,revision){
      await page.locator('#v123-limb').selectOption(limb);
      await page.locator('#v123-limb-mode-select').selectOption(mode);
      await page.locator('#v123-limb-mode-save').click();
      await page.waitForFunction(revision=>{
        const status=document.querySelector('#v123-limb-mode-status')?.textContent||'';
        return /姿勢差|切替失敗/.test(status)&&
          document.querySelector('#v123-limb-mode-save')?.disabled===false;
      },revision);
      assert.match(await page.locator('#v123-limb-mode-status').textContent(),/姿勢差/);
      const stored=await ok(await fetch(`${endpoint}?id=${id}`));
      assert.equal(stored.revision,revision);
      assert.equal(stored.fk_ik_modes[instanceId][limb],mode);
      assert.deepEqual(stored.layers,modeBaseline.layers);
      assert.equal(stored.can_undo,modeBaseline.can_undo);
      assert.equal(stored.can_redo,modeBaseline.can_redo);
      const poseNow=await allPose();
      assert.deepEqual(Object.keys(poseNow),Object.keys(poseBaseline));
      let maxDifference=0;
      for(const name of Object.keys(poseBaseline))
        for(let index=0;index<16;index++)maxDifference=Math.max(maxDifference,
          Math.abs(poseNow[name].world[index]-poseBaseline[name].world[index]));
      assert.ok(maxDifference<1e-4,`${limb} ${mode}: all-bone world matrix difference ${maxDifference}`);
      assert.equal(await page.locator('#v106-fk-bone').inputValue(),
        limb==='left_arm'?'左腕':'右腕');
      assert.equal(await page.locator('#v113-fk-gizmo-mode').inputValue(),
        mode==='IK'?'arm-hand':'rotate');
      if(mode==='IK'){
        await page.locator('#v111-fk-gizmo-toggle').click();
        await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().gizmo?.armWristWorld);
        const snap=await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().gizmo);
        assert.ok(distance(snap.handleWorld,snap.armWristWorld)<1e-6);
        await page.locator('#v111-fk-gizmo-toggle').click();
      }
      console.log(JSON.stringify({bank,model,limb,mode,maxDifference}));
    }
    await switchArmMode('left_arm','IK',13);
    await switchArmMode('right_arm','IK',14);
    await page.reload();
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
      null,{timeout:120000});
    await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'arm-mode-reload'));
    await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
    await page.locator('#v106-fk-frame').fill('240');
    await page.locator('#v106-fk-frame').dispatchEvent('change');
    for(const limb of ['left_arm','right_arm']){
      await page.locator('#v123-limb').selectOption(limb);
      assert.equal(await page.locator('#v123-limb-mode-select').inputValue(),'IK');
    }
    const reloadedModes=await ok(await fetch(`${endpoint}?id=${id}`));
    assert.equal(reloadedModes.revision,14);
    assert.deepEqual(reloadedModes.layers,modeBaseline.layers);
    await switchArmMode('left_arm','FK',15);
    await switchArmMode('right_arm','FK',16);
    await page.locator('#v116-vmd-candidate-create').click();
    await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-download')?.hidden===false||
      document.querySelector('#v116-vmd-candidate-status')?.textContent?.includes('不可'),
      null,{timeout:120000});
    assert.match(await page.locator('#v116-vmd-candidate-status').textContent(),/実PMX往復の確認前/);
    await page.locator('#v120-vmd-candidate-validate').click();
    await page.waitForFunction(()=>/実PMX検査合格|実PMX検査不合格|実PMX検査を完了できません/.test(
      document.querySelector('#v116-vmd-candidate-status')?.textContent||''),
      null,{timeout:160000});
    const armValidation=await page.locator('#v116-vmd-candidate-status').textContent();
    console.log(JSON.stringify({armValidation}));
    assert.match(armValidation,/実PMX検査合格（物理OFF）/);
    harness.assertNoErrors(page);
  }finally{
    await page?.close();await browser?.close();await server.stop();
    assert.deepEqual([digest(modelPath),digest(motionPath)],before);
  }
});
