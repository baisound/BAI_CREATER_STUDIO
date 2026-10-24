'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');
const source=process.env.BAI_REAL_MMD_DATA;
const model='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motion='狐面物理確認用_頭振り_F000-0300.vmd';
const modelPath=source&&path.join(source,'mmd','A',model);
const motionPath=source&&path.join(source,'mmd','vmd',motion);
const exists=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const world=bone=>bone.world.slice(12,15);
const gap=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
async function ok(response){const body=await response.text();if(response.status!==200)throw Error(body);return JSON.parse(body);}
test('real PMX native CCD keeps ankle while FK thigh twist changes knee direction',
  {skip:!exists&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:240000},async()=>{
  const hashBefore=[digest(modelPath),digest(motionPath)];
  const metadata=JSON.parse(fs.readFileSync(path.join(source,'mmd_assets.json'),'utf8'));
  const entries=metadata.A.filter(e=>e.name===model||e.name.startsWith('tex/'));
  const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[{name:motion,size:fs.statSync(motionPath).size}]})};
  for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(path.join(source,'mmd','A',...entry.name.split('/')));
  seed[`mmd/vmd/${motion}`]=fs.readFileSync(motionPath);
  const server=await harness.startServer({port:8898,seed});let browser,page;
  try{
    const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'膝ポールCCD検証',kind:'empty'})}));
    const id=project.project.id;
    const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,action:'add',revision:0,asset_id:`mmd:A:${model}`,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
    const instanceId=scene.instances[0].id;
    const placed=await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,asset_id:`mmd:vmd:${motion}`,track:'motion',start:0,duration:10,revision:0})}));
    await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,clip_id:placed.clip.id,revision:placed.revision,instance_id:instanceId})}));
    browser=await server.launchBrowser();page=await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
    await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
    await page.locator('#v106-fk-frame').fill('240');
    await page.locator('#v106-fk-frame').dispatchEvent('change');
    await page.locator('#v106-fk-bone').selectOption('左足');
    await page.locator('#v111-fk-gizmo-goto').click();
    const pose=()=>page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,['左足','左ひざ','左足首','左足ＩＫ','右足首']),instanceId);
    const baseline=await pose();
    const results=[];
    for(const y of [-20,20]){
      await page.locator('#v106-fk-y').fill(String(y));
      await page.locator('#v106-fk-preview').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('仮補正を表示中'));
      const current=await pose();
      results.push({y,knee:world(current.bones['左ひざ']),ankle:world(current.bones['左足首']),
        knee_delta:gap(world(baseline.bones['左ひざ']),world(current.bones['左ひざ'])),
        ankle_delta:gap(world(baseline.bones['左足首']),world(current.bones['左足首'])),
        ankle_target_error:gap(world(current.bones['左足首']),world(current.bones['左足ＩＫ'])),
        right_delta:gap(world(baseline.bones['右足首']),world(current.bones['右足首']))});
      await page.locator('#v106-fk-cancel').click();
    }
    assert.ok(results.every(item=>item.knee_delta>0.005));
    assert.ok(results.every(item=>item.ankle_delta<0.001));
    assert.ok(results.every(item=>item.ankle_target_error<0.001));
    assert.ok(results.every(item=>item.right_delta<1e-5));
    assert.ok(gap(results[0].knee,results[1].knee)>0.01);
    assert.equal((await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`))).revision,0);
    harness.assertNoErrors(page);
    process.stdout.write(JSON.stringify({baseline:{knee:world(baseline.bones['左ひざ']),ankle:world(baseline.bones['左足首'])},results},null,2)+'\n');
    await page.locator('#v106-fk-y').fill('20');
    await page.locator('#v106-fk-preview').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('仮補正を表示中'));
    await page.locator('#v106-fk-save').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
    const saved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`));
    assert.equal(saved.revision,1);
    assert.ok(saved.layers[0].keys.some(key=>key.bone==='左足'&&key.frame===240));
    await page.locator('#v116-vmd-candidate-create').click();
    await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-download')?.hidden===false||
      document.querySelector('#v116-vmd-candidate-status')?.textContent?.includes('不可'),null,{timeout:120000});
    const candidateStatus=await page.locator('#v116-vmd-candidate-status').textContent();
    assert.match(candidateStatus,/実PMX往復の確認前/);
    await page.locator('#v120-vmd-candidate-validate').click();
    await page.waitForFunction(()=>/実PMX検査合格|実PMX検査不合格|実PMX検査を完了できません/.test(
      document.querySelector('#v116-vmd-candidate-status')?.textContent||''),null,{timeout:160000});
    const validationStatus=await page.locator('#v116-vmd-candidate-status').textContent();
    assert.match(validationStatus,/実PMX検査合格（物理OFF）/);
    process.stdout.write(JSON.stringify({validationStatus})+'\n');
    await page.locator('#v114-ik-select').selectOption('左足ＩＫ');
    assert.equal(await page.locator('#v128-knee-pole-choose').isDisabled(),false);
    await page.locator('#v128-knee-pole-choose').click();
    assert.equal(await page.locator('#v106-fk-bone').inputValue(),'左足');
    assert.equal(await page.locator('#v113-fk-gizmo-mode').inputValue(),'pole');
    await page.locator('#v111-fk-gizmo-toggle').click();
    const handle=await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().gizmo);
    assert.equal(handle.poleKnee,'左ひざ');
    assert.ok(gap(handle.handleWorld,handle.poleKneeWorld)<1e-6);
    await page.locator('#v110-bone-tree').evaluate(el=>el.open=true);
    await page.locator('#v110-bone-search').fill('左ひざ');
    await page.waitForFunction(()=>{
      const marker=document.querySelector('#v110-bone-overlay button[data-bone="左ひざ"]');
      return marker&&!marker.hidden&&marker.dataset.projectedX;
    });
    const screen=await page.evaluate(()=>{
      const marker=document.querySelector('#v110-bone-overlay button[data-bone="左ひざ"]');
      const canvas=document.querySelector('#v58-canvas').getBoundingClientRect();
      const panel=document.querySelector('#v58-multi-preview').getBoundingClientRect();
      document.querySelector('#v110-bone-overlay').style.display='none';
      return {x:canvas.left+Number(marker.dataset.projectedX),
        y:canvas.top+Number(marker.dataset.projectedY),
        panel:{left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom}};
    });
    const poleBefore=await pose();
    let poleAfter=null;
    for(const [dx,dy] of [[25,0],[0,-25],[-25,0],[0,25],[45,0],[0,-45]]){
      const x=screen.x+dx,y=screen.y+dy;
      if(x>=screen.panel.left&&x<=screen.panel.right&&
         y>=screen.panel.top&&y<=screen.panel.bottom)continue;
      await page.mouse.move(x,y);await page.mouse.down();
      await page.mouse.move(x+35,y+24,{steps:12});await page.mouse.up();
      await page.waitForTimeout(160);
      if((await page.locator('#v111-fk-gizmo-status').textContent()).includes('膝方向を仮表示中')){
        poleAfter=await pose();break;
      }
    }
    assert.ok(poleAfter,'real knee pole handle must create a pose preview');
    assert.ok(gap(world(poleBefore.bones['左ひざ']),world(poleAfter.bones['左ひざ']))>0.001);
    assert.ok(gap(world(poleBefore.bones['左足首']),world(poleAfter.bones['左足首']))<0.001);
    assert.ok(gap(world(poleBefore.bones['右足首']),world(poleAfter.bones['右足首']))<1e-4);
    console.log(JSON.stringify({pointer_knee_delta:gap(world(poleBefore.bones['左ひざ']),
      world(poleAfter.bones['左ひざ'])),pointer_ankle_delta:gap(world(poleBefore.bones['左足首']),
      world(poleAfter.bones['左足首']))}));
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('破棄しました'));
    assert.ok(gap(world(poleBefore.bones['左ひざ']),world((await pose()).bones['左ひざ']))<1e-5);
    assert.equal((await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`))).revision,1);
    let savedPolePose=null;
    for(const [dx,dy] of [[25,0],[0,-25],[-25,0],[0,25],[45,0],[0,-45]]){
      const x=screen.x+dx,y=screen.y+dy;
      if(x>=screen.panel.left&&x<=screen.panel.right&&
         y>=screen.panel.top&&y<=screen.panel.bottom)continue;
      await page.mouse.move(x,y);await page.mouse.down();
      await page.mouse.move(x+35,y+24,{steps:12});await page.mouse.up();
      await page.waitForTimeout(160);
      if((await page.locator('#v111-fk-gizmo-status').textContent()).includes('膝方向を仮表示中')){
        savedPolePose=await pose();break;
      }
    }
    assert.ok(savedPolePose,'second real pole drag must create a savable preview');
    await page.locator('#v106-fk-save').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
    const savedPole=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`));
    assert.equal(savedPole.revision,2);
    assert.ok(gap(world(savedPolePose.bones['左ひざ']),world((await pose()).bones['左ひざ']))<1e-5);
    await page.locator('#v111-fk-gizmo-toggle').click();
    await page.locator('#v106-fk-undo').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('戻しました'));
    assert.ok(gap(world(poleBefore.bones['左ひざ']),world((await pose()).bones['左ひざ']))<1e-5);
    await page.locator('#v106-fk-redo').click();
    await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('やり直しました'));
    assert.ok(gap(world(savedPolePose.bones['左ひざ']),world((await pose()).bones['左ひざ']))<1e-5);
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
    await page.reload();
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
    await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'pole-reload'));
    assert.ok(gap(world(savedPolePose.bones['左ひざ']),world((await pose()).bones['左ひざ']))<1e-5);
    await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
    await page.locator('#v116-vmd-candidate-create').click();
    await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-download')?.hidden===false||
      document.querySelector('#v116-vmd-candidate-status')?.textContent?.includes('不可'),null,{timeout:120000});
    assert.match(await page.locator('#v116-vmd-candidate-status').textContent(),/実PMX往復の確認前/);
    await page.locator('#v120-vmd-candidate-validate').click();
    await page.waitForFunction(()=>/実PMX検査合格|実PMX検査不合格|実PMX検査を完了できません/.test(
      document.querySelector('#v116-vmd-candidate-status')?.textContent||''),null,{timeout:160000});
    const poleValidation=await page.locator('#v116-vmd-candidate-status').textContent();
    assert.match(poleValidation,/実PMX検査合格（物理OFF）/);
    console.log(JSON.stringify({poleValidation}));
    harness.assertNoErrors(page);
  }finally{
    await page?.close();await browser?.close();await server.stop();
    assert.deepEqual([digest(modelPath),digest(motionPath)],hashBefore);
  }
});
