'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const sourceRoot=process.env.BAI_REAL_MMD_DATA;
const modelName='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motionName='狐面物理確認用_頭振り_F000-0300.vmd';
const modelPath=sourceRoot&&path.join(sourceRoot,'mmd','A',modelName);
const motionPath=sourceRoot&&path.join(sourceRoot,'mmd','vmd',motionName);
const exists=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function ok(response){const body=await response.text();assert.equal(response.status,200,body);return JSON.parse(body);}
const delta=(a,b)=>Math.max(...a.map((n,i)=>Math.abs(n-b[i])));

test('real PMX 3D rotation and translation handles preserve both FK channels',
  {skip:!exists&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:180000},async()=>{
    const originals=[digest(modelPath),digest(motionPath)];
    const metadata=JSON.parse(fs.readFileSync(path.join(sourceRoot,'mmd_assets.json'),'utf8'));
    const entries=metadata.A.filter(e=>e.name===modelName||e.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[{name:motionName,size:fs.statSync(motionPath).size}]})};
    for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(path.join(sourceRoot,'mmd','A',...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    const server=await harness.startServer({port:8897,seed});
    let browser,page;
    try{
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'PMX3D骨回転実試験',kind:'empty'})}));
      const projectId=project.project.id;
      const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          action:'add',revision:0,asset_id:`mmd:A:${modelName}`,
          transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
      const instanceId=scene.instances[0].id;
      const placement=await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          asset_id:`mmd:vmd:${motionName}`,track:'motion',start:0,duration:10,revision:0})}));
      await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          clip_id:placement.clip.id,revision:placement.revision,instance_id:instanceId})}));
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.locator('#v106-fk-frame').fill('240');
      await page.locator('#v106-fk-frame').dispatchEvent('change');
      await page.locator('#v106-fk-bone').selectOption('頭');
      assert.equal(await page.locator('#v111-fk-gizmo-toggle').isDisabled(),true);
      await page.locator('#v111-fk-gizmo-goto').click();
      await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68?.status().frame===240);
      await page.waitForFunction(()=>!document.querySelector('#v111-fk-gizmo-toggle')?.disabled);
      const pose=()=>page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,['頭','センター']),instanceId);
      const baseline=await pose();
      await page.locator('#v111-fk-gizmo-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#v111-fk-gizmo-toggle')?.getAttribute('aria-pressed')==='true'||
        document.querySelector('#v106-fk-status')?.textContent,{},{timeout:15000});
      assert.equal(await page.locator('#v111-fk-gizmo-toggle').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#v61-transform-editor').isVisible(),false);
      await page.waitForFunction(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="頭"]');
        return marker?.dataset.projectedX&&marker?.dataset.projectedY;
      });
      const position=await page.evaluate(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="頭"]');
        const canvas=document.querySelector('#v58-canvas').getBoundingClientRect();
        const panel=document.querySelector('#v58-multi-preview').getBoundingClientRect();
        return {x:canvas.left+Number(marker.dataset.projectedX),y:canvas.top+Number(marker.dataset.projectedY),
          panel:{left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom}};
      });
      assert.ok(position.x<position.panel.left||position.x>position.panel.right||
        position.y<position.panel.top||position.y>position.panel.bottom,'bone handle is not covered by edit panel');
      console.log(JSON.stringify({gizmo_origin:position}));
      await page.mouse.move(position.x+36,position.y);
      await page.mouse.down();
      await page.mouse.move(position.x+62,position.y+20,{steps:8});
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await page.waitForTimeout(100);
      assert.ok(delta(baseline.bones['頭'].quaternion,(await pose()).bones['頭'].quaternion)<1e-5);
      assert.equal((await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`))).revision,0);
      let previewed=false;
      for(const [dx,dy] of [[36,0],[0,36],[-36,0],[0,-36],[52,0],[0,52]]){
        await page.mouse.move(position.x+dx,position.y+dy);
        await page.mouse.down();
        await page.mouse.move(position.x+dx+35,position.y+dy+28,{steps:12});
        await page.mouse.up();
        await page.waitForTimeout(120);
        previewed=(await page.locator('#v106-fk-status').textContent()).includes('仮補正を表示中');
        if(previewed)break;
      }
      assert.equal(previewed,true,'rotation ring drag must create an unsaved preview');
      const preview=await pose();
      assert.ok(delta(baseline.bones['頭'].quaternion,preview.bones['頭'].quaternion)>0.01);
      assert.ok(delta(baseline.bones['センター'].quaternion,preview.bones['センター'].quaternion)<1e-5);
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
      const saved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(saved.layers[0].keys[0].bone,'頭');
      assert.equal(saved.layers[0].keys[0].frame,240);
      assert.equal(saved.layers[0].model_sha256,originals[0]);
      assert.equal(saved.layers[0].motion_sha256,originals[1]);
      const rotated=await pose();
      await page.locator('#v113-fk-gizmo-mode').selectOption('translate');
      await page.waitForFunction(()=>document.querySelector('#v111-fk-gizmo-toggle')?.textContent?.includes('位置'));
      let cancelledTranslation=false;
      for(const [dx,dy] of [[0,0],[25,0],[0,-25],[-25,0],[0,25],[45,0],[0,-45],[-45,0]]){
        await page.mouse.move(position.x+dx,position.y+dy);
        await page.mouse.down();
        const active=await page.locator('#v113-fk-gizmo-mode').isDisabled();
        if(active){
          await page.mouse.move(position.x+dx+25,position.y+dy+20,{steps:12});
          await page.keyboard.press('Escape');
          await page.mouse.up();cancelledTranslation=true;break;
        }
        await page.mouse.up();
      }
      assert.equal(cancelledTranslation,true,'translation handle must accept a drag for cancellation');
      assert.ok(delta(rotated.bones['頭'].position,(await pose()).bones['頭'].position)<1e-5);
      assert.equal((await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`))).revision,1);
      let translated=false;
      for(const [dx,dy] of [[0,0],[25,0],[0,-25],[-25,0],[0,25],[45,0],[0,-45],[-45,0]]){
        await page.mouse.move(position.x+dx,position.y+dy);
        await page.mouse.down();
        await page.mouse.move(position.x+dx+25,position.y+dy+20,{steps:12});
        await page.mouse.up();
        await page.waitForTimeout(120);
        translated=(await page.locator('#v111-fk-gizmo-status').textContent()).includes('位置を仮表示中');
        if(translated)break;
      }
      assert.equal(translated,true,'translation handle drag must create an unsaved preview');
      const translatedPose=await pose();
      assert.ok(delta(rotated.bones['頭'].position,translatedPose.bones['頭'].position)>0.02);
      assert.ok(delta(rotated.bones['頭'].quaternion,translatedPose.bones['頭'].quaternion)<1e-4);
      assert.ok(delta(rotated.bones['センター'].position,translatedPose.bones['センター'].position)<1e-5);
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
      const savedWithPosition=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(savedWithPosition.revision,2);
      assert.equal(savedWithPosition.layers[0].keys.length,1);
      assert.ok(delta(savedWithPosition.layers[0].keys[0].position,[0,0,0])>0.02);
      assert.ok(delta(saved.layers[0].keys[0].rotation,savedWithPosition.layers[0].keys[0].rotation)<1e-4);
      await page.locator('#v113-fk-gizmo-mode').selectOption('rotate');
      await page.waitForFunction(()=>document.querySelector('#v111-fk-gizmo-toggle')?.textContent?.includes('回転'));
      const movedOrigin=await page.evaluate(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="頭"]');
        const canvas=document.querySelector('#v58-canvas').getBoundingClientRect();
        return {x:canvas.left+Number(marker.dataset.projectedX),
          y:canvas.top+Number(marker.dataset.projectedY)};
      });
      let rotatedAgain=false;
      for(const [dx,dy] of [[36,0],[0,36],[-36,0],[0,-36],[52,0],[0,52]]){
        await page.mouse.move(movedOrigin.x+dx,movedOrigin.y+dy);
        await page.mouse.down();
        await page.mouse.move(movedOrigin.x+dx+35,movedOrigin.y+dy+28,{steps:12});
        await page.mouse.up();
        await page.waitForTimeout(120);
        rotatedAgain=(await page.locator('#v111-fk-gizmo-status').textContent()).includes('回転を仮表示中');
        if(rotatedAgain)break;
      }
      assert.equal(rotatedAgain,true,'rotation drag must preserve the saved position channel');
      const finalPreview=await pose();
      assert.ok(delta(translatedPose.bones['頭'].position,finalPreview.bones['頭'].position)<1e-4);
      assert.ok(delta(translatedPose.bones['頭'].quaternion,finalPreview.bones['頭'].quaternion)>0.01);
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
      const savedBoth=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(savedBoth.revision,3);
      assert.ok(delta(savedBoth.layers[0].keys[0].position,savedWithPosition.layers[0].keys[0].position)<1e-5);
      await page.locator('#v111-fk-gizmo-toggle').click();
      assert.equal(await page.locator('#v61-transform-editor').isVisible(),true);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
      await page.reload();
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'gizmo-reload'));
      const restored=await pose();
      assert.ok(delta(finalPreview.bones['頭'].quaternion,restored.bones['頭'].quaternion)<1e-5);
      assert.ok(delta(finalPreview.bones['頭'].position,restored.bones['頭'].position)<1e-5);
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.locator('#v106-fk-frame').fill('240');
      await page.locator('#v106-fk-frame').dispatchEvent('change');
      await page.waitForFunction(()=>document.querySelector('#v114-ik-select')?.options.length===5);
      await page.locator('#v114-ik-select').selectOption('左足ＩＫ');
      await page.locator('#v114-ik-choose').click();
      assert.equal(await page.locator('#v106-fk-bone').inputValue(),'左足ＩＫ');
      assert.equal(await page.locator('#v113-fk-gizmo-mode').inputValue(),'translate');
      assert.equal(await page.locator('#v111-fk-gizmo-toggle').isDisabled(),false);
      await page.locator('#v111-fk-gizmo-toggle').click();
      assert.equal(await page.locator('#v111-fk-gizmo-toggle').getAttribute('aria-pressed'),'true');
      const footHandle=await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().gizmo);
      assert.equal(footHandle.bone,'左足ＩＫ');
      assert.equal(footHandle.effector,'左足首');
      assert.ok(delta(footHandle.handleWorld,footHandle.effectorWorld)<1e-6,
        'IK handle must start at the evaluated ankle, including the current VMD pose');
      await page.locator('#v111-fk-gizmo-toggle').click();
      const footPose=()=>page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,
        ['左足ＩＫ','左足首','右足首']),instanceId);
      const feetBefore=await footPose();
      const world=bone=>bone.world.slice(12,15);
      await page.locator('#v112-fk-position-x').fill('5');
      await page.locator('#v106-fk-preview').click();
      await page.waitForFunction(()=>document.querySelector('#v111-fk-ik-reach')?.textContent?.includes('目標に一致していません'));
      const farPose=await footPose();
      const farReach=Math.hypot(...world(farPose.bones['左足ＩＫ'])
        .map((value,index)=>value-world(farPose.bones['左足首'])[index]));
      assert.ok(farReach>0.001,'far IK target should expose a real unsolved distance');
      assert.match(await page.locator('#v111-fk-ik-reach').textContent(),
        new RegExp(`位置差: ${farReach.toFixed(4)} シーン単位`));
      await page.locator('#v106-fk-cancel').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('破棄しました'));
      assert.ok(delta(world(feetBefore.bones['左足首']),world((await footPose()).bones['左足首']))<1e-5);
      assert.match(await page.locator('#v111-fk-ik-reach').textContent(),/目標付近にあります/);
      console.log(JSON.stringify({far_ik_reach_error:farReach}));
      await page.locator('#v112-fk-position-x').fill('0.3');
      await page.locator('#v106-fk-preview').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('仮補正を表示中'));
      const feetAfter=await footPose();
      assert.ok(delta(feetBefore.bones['左足ＩＫ'].position,feetAfter.bones['左足ＩＫ'].position)>0.29);
      assert.ok(delta(world(feetBefore.bones['左足ＩＫ']),world(feetAfter.bones['左足ＩＫ']))>0.02);
      assert.ok(delta(world(feetBefore.bones['左足首']),world(feetAfter.bones['左足首']))>0.02,
        'the real PMX IK effector must follow its target');
      assert.ok(delta(world(feetAfter.bones['左足ＩＫ']),world(feetAfter.bones['左足首']))<1e-3);
      assert.ok(delta(world(feetBefore.bones['右足首']),world(feetAfter.bones['右足首']))<1e-4);
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
      const savedFoot=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(savedFoot.revision,4);
      assert.ok(savedFoot.layers[0].keys.some(key=>key.bone==='左足ＩＫ'&&key.frame===240));
      await page.locator('#v111-fk-gizmo-toggle').click();
      const correctedHandle=await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().gizmo);
      assert.ok(delta(correctedHandle.targetWorld,correctedHandle.effectorWorld)>1e-4,
        'corrected target and evaluated ankle must be visibly different for the snap check');
      assert.ok(delta(correctedHandle.handleWorld,correctedHandle.effectorWorld)<1e-6,
        'handle must re-snap to the corrected ankle rather than the IK target');
      await page.locator('#v113-fk-gizmo-mode').selectOption('rotate');
      const ikRotationHandle=await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().gizmo);
      assert.ok(delta(ikRotationHandle.handleWorld,ikRotationHandle.targetWorld)<1e-6,
        'rotation mode must attach to the real IK target bone');
      await page.locator('#v113-fk-gizmo-mode').selectOption('translate');
      const resnappedHandle=await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().gizmo);
      assert.ok(delta(resnappedHandle.handleWorld,resnappedHandle.effectorWorld)<1e-6,
        'returning to translation must re-snap to the ankle');
      await page.locator('#v110-bone-tree').evaluate(el=>el.open=true);
      await page.locator('#v110-bone-search').fill('左足首');
      await page.waitForFunction(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="左足首"]');
        return marker&&!marker.hidden&&marker.dataset.projectedX;
      });
      const ankleScreen=await page.evaluate(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="左足首"]');
        const canvas=document.querySelector('#v58-canvas').getBoundingClientRect();
        const panel=document.querySelector('#v58-multi-preview').getBoundingClientRect();
        document.querySelector('#v110-bone-overlay').style.display='none';
        return {x:canvas.left+Number(marker.dataset.projectedX),
          y:canvas.top+Number(marker.dataset.projectedY),panel:{left:panel.left,right:panel.right,
            top:panel.top,bottom:panel.bottom}};
      });
      const footDragBefore=await footPose();
      let footDragged=false;
      for(const [dx,dy] of [[25,0],[0,-25],[-25,0],[0,25],[45,0],[0,-45]]){
        const x=ankleScreen.x+dx,y=ankleScreen.y+dy;
        if(x>=ankleScreen.panel.left&&x<=ankleScreen.panel.right&&
           y>=ankleScreen.panel.top&&y<=ankleScreen.panel.bottom)continue;
        await page.mouse.move(x,y);await page.mouse.down();
        await page.mouse.move(x+35,y+24,{steps:12});await page.mouse.up();
        await page.waitForTimeout(120);
        footDragged=(await page.locator('#v111-fk-gizmo-status').textContent()).includes('位置を仮表示中');
        if(footDragged)break;
      }
      assert.equal(footDragged,true,'ankle-snapped IK handle must accept a real pointer drag');
      const footDragAfter=await footPose();
      assert.ok(delta(world(footDragBefore.bones['左足ＩＫ']),world(footDragAfter.bones['左足ＩＫ']))>0.005);
      assert.ok(delta(world(footDragBefore.bones['左足首']),world(footDragAfter.bones['左足首']))>0.005);
      assert.ok(delta(world(footDragBefore.bones['右足首']),world(footDragAfter.bones['右足首']))<1e-4);
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('破棄しました'));
      const footDragRestored=await footPose();
      const cancelDelta=delta(world(footDragBefore.bones['左足首']),world(footDragRestored.bones['左足首']));
      assert.ok(cancelDelta<1e-5,`Escape must restore the saved ankle, delta ${cancelDelta}`);
      assert.equal((await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`))).revision,4);
      await page.locator('#v111-fk-gizmo-toggle').click();
      for(const seconds of [0,4,4,2,4]){
        await page.evaluate(t=>window.BAIStudioTimeline.seek(t,'ik-round-trip'),seconds);
        if(seconds===4){
          const replayed=await footPose();
          assert.ok(delta(world(feetAfter.bones['左足首']),world(replayed.bones['左足首']))<1e-5,
            'foot IK correction must not accumulate across seeks');
        }
      }
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
      await page.reload();
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
      await page.waitForFunction(()=>document.querySelector('#v106-fk-saved')?.options.length===3,
        null,{timeout:30000});
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'ik-reload'));
      const feetReloaded=await footPose();
      console.log(JSON.stringify({ik_reload_before:world(feetAfter.bones['左足首']),
        ik_reload_after:world(feetReloaded.bones['左足首'])}));
      assert.ok(delta(world(feetAfter.bones['左足首']),world(feetReloaded.bones['左足首']))<1e-5);
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.locator('#v106-fk-frame').fill('240');
      await page.locator('#v106-fk-frame').dispatchEvent('change');
      const beforeModes=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      const beforeModePose=await page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,
        ['頭','センター','左足','左足ＩＫ','左足首','右足首']),instanceId);
      await page.locator('#v123-limb-mode-select').selectOption('FK');
      await page.locator('#v123-limb-mode-save').click();
      await page.waitForFunction(()=>/姿勢差|切替失敗/.test(document.querySelector('#v123-limb-mode-status')?.textContent||''));
      assert.match(await page.locator('#v123-limb-mode-status').textContent(),/姿勢差/);
      const fkModes=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(fkModes.fk_ik_modes[instanceId].left_leg,'FK');
      assert.equal(fkModes.revision,beforeModes.revision+1);
      assert.deepEqual(fkModes.layers,beforeModes.layers);
      assert.equal(fkModes.can_undo,beforeModes.can_undo);
      assert.equal(await page.locator('#v106-fk-bone').inputValue(),'左足');
      for(const name of Object.keys(beforeModePose.bones)){
        const after=(await page.evaluate(([id,bone])=>window.BAIStudioMultiScenePreview.poseProbe(id,[bone]),
          [instanceId,name])).bones[name];
        assert.ok(delta(beforeModePose.bones[name].world,after.world)<1e-4,
          `${name} world pose changed on FK mode selection`);
      }
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
      await page.reload();
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'mode-reload'));
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      assert.equal(await page.locator('#v123-limb-mode-select').inputValue(),'FK');
      await page.locator('#v123-limb-mode-select').selectOption('IK');
      await page.locator('#v123-limb-mode-save').click();
      await page.waitForFunction(()=>/姿勢差|切替失敗/.test(document.querySelector('#v123-limb-mode-status')?.textContent||''));
      assert.match(await page.locator('#v123-limb-mode-status').textContent(),/姿勢差/);
      const ikModes=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(ikModes.fk_ik_modes[instanceId].left_leg,'IK');
      assert.equal(ikModes.revision,fkModes.revision+1);
      assert.deepEqual(ikModes.layers,beforeModes.layers);
      assert.equal(ikModes.can_undo,beforeModes.can_undo);
      assert.equal(await page.locator('#v106-fk-bone').inputValue(),'左足ＩＫ');
      await page.locator('#v106-fk-frame').fill('240');
      await page.locator('#v106-fk-frame').dispatchEvent('change');
      await page.locator('#v111-fk-gizmo-goto').click();
      await page.waitForFunction(()=>!document.querySelector('#v111-fk-gizmo-toggle')?.disabled);
      await page.locator('#v111-fk-gizmo-toggle').click();
      await page.locator('#v110-bone-tree').evaluate(el=>el.open=true);
      await page.locator('#v110-bone-search').fill('左足首');
      await page.waitForFunction(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="左足首"]');
        return marker&&!marker.hidden&&marker.dataset.projectedX;
      });
      const saveDragScreen=await page.evaluate(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="左足首"]');
        const canvas=document.querySelector('#v58-canvas').getBoundingClientRect();
        const panel=document.querySelector('#v58-multi-preview').getBoundingClientRect();
        document.querySelector('#v110-bone-overlay').style.display='none';
        return {x:canvas.left+Number(marker.dataset.projectedX),
          y:canvas.top+Number(marker.dataset.projectedY),panel:{left:panel.left,right:panel.right,
            top:panel.top,bottom:panel.bottom}};
      });
      const pointerBefore=await footPose();
      let pointerPreview=null;
      for(const [dx,dy] of [[25,0],[0,-25],[-25,0],[0,25],[45,0],[0,-45]]){
        const x=saveDragScreen.x+dx,y=saveDragScreen.y+dy;
        if(x>=saveDragScreen.panel.left&&x<=saveDragScreen.panel.right&&
           y>=saveDragScreen.panel.top&&y<=saveDragScreen.panel.bottom)continue;
        await page.mouse.move(x,y);await page.mouse.down();
        await page.mouse.move(x+35,y+24,{steps:12});await page.mouse.up();
        await page.waitForTimeout(120);
        const current=await footPose();
        if(delta(world(pointerBefore.bones['左足首']),world(current.bones['左足首']))>0.005){
          pointerPreview=current;break;
        }
      }
      assert.ok(pointerPreview,'a real ankle handle drag must produce a correction preview');
      assert.ok(delta(world(pointerBefore.bones['左足ＩＫ']),world(pointerPreview.bones['左足ＩＫ']))>0.005);
      assert.ok(delta(world(pointerBefore.bones['右足首']),world(pointerPreview.bones['右足首']))<1e-4);
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
      const pointerSaved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(pointerSaved.revision,ikModes.revision+1);
      assert.equal(pointerSaved.fk_ik_modes[instanceId].left_leg,'IK');
      const findFootKey=data=>data.layers.flatMap(layer=>layer.keys)
        .find(key=>key.frame===240&&key.bone==='左足ＩＫ');
      assert.notDeepEqual(findFootKey(pointerSaved),findFootKey(ikModes));
      assert.ok(delta(world(pointerPreview.bones['左足首']),world((await footPose()).bones['左足首']))<1e-5);
      await page.locator('#v111-fk-gizmo-toggle').click();
      await page.locator('#v106-fk-undo').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('戻しました'));
      const pointerUndone=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(pointerUndone.revision,pointerSaved.revision+1);
      assert.deepEqual(pointerUndone.layers,ikModes.layers);
      assert.equal(pointerUndone.fk_ik_modes[instanceId].left_leg,'IK');
      assert.ok(delta(world(pointerBefore.bones['左足首']),world((await footPose()).bones['左足首']))<1e-5);
      await page.locator('#v106-fk-redo').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('やり直しました'));
      const pointerRedone=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(pointerRedone.revision,pointerUndone.revision+1);
      assert.deepEqual(pointerRedone.layers,pointerSaved.layers);
      assert.ok(delta(world(pointerPreview.bones['左足首']),world((await footPose()).bones['左足首']))<1e-5);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
      await page.reload();
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'pointer-reload'));
      assert.ok(delta(world(pointerPreview.bones['左足首']),world((await footPose()).bones['左足首']))<1e-5);
      harness.assertNoErrors(page);
      console.log(JSON.stringify({head_rotation_delta:delta(baseline.bones['頭'].quaternion,preview.bones['頭'].quaternion),
        head_position_delta:delta(rotated.bones['頭'].position,translatedPose.bones['頭'].position),
        left_ankle_delta:delta(world(feetBefore.bones['左足首']),world(feetAfter.bones['左足首'])),
        ik_target_error:delta(world(feetAfter.bones['左足ＩＫ']),world(feetAfter.bones['左足首'])),
        renderer:(await page.evaluate(()=>window.BAIStudioMultiScenePreview.status())).renderer,
        model_sha256:originals[0],motion_sha256:originals[1]}));
    }finally{
      await page?.close();await browser?.close();await server.stop();
      assert.deepEqual([digest(modelPath),digest(motionPath)],originals);
    }
  });
