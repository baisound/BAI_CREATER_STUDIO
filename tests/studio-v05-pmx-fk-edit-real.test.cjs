'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const harness = require('./helpers/studio-harness.cjs');

const sourceRoot = process.env.BAI_REAL_MMD_DATA;
const modelName = 'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motionName = '狐面物理確認用_頭振り_F000-0300.vmd';
const modelPath = sourceRoot && path.join(sourceRoot, 'mmd', 'A', modelName);
const motionPath = sourceRoot && path.join(sourceRoot, 'mmd', 'vmd', motionName);
const exists = modelPath && motionPath && fs.existsSync(modelPath) && fs.existsSync(motionPath);
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function ok(response) { const body=await response.text();assert.equal(response.status,200,body);return JSON.parse(body); }
const maxDelta = (a,b) => Math.max(...a.map((n,i)=>Math.abs(n-b[i])));

test('real PMX FK correction previews, saves, reloads and undo/redoes without changing sources',
  {skip: !exists && 'BAI_REAL_MMD_DATA に実素材がありません', timeout: 180000}, async () => {
    const originals = [digest(modelPath),digest(motionPath)];
    const metadata = JSON.parse(fs.readFileSync(path.join(sourceRoot,'mmd_assets.json'),'utf8'));
    const entries = metadata.A.filter(e => e.name === modelName || e.name.startsWith('tex/'));
    const seed = {'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[{name:motionName,size:fs.statSync(motionPath).size}]})};
    for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(path.join(sourceRoot,'mmd','A',...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    const server=await harness.startServer({port:8896,seed});
    let browser,page;
    try{
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'PMX FK補正実試験',kind:'empty'})}));
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
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.locator('#v106-fk-frame').fill('240');
      await page.locator('#v106-fk-frame').dispatchEvent('change');
      await page.locator('#v106-fk-bone').selectOption('頭');
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'fk-test'));
      await page.waitForTimeout(200);
      const pose=()=>page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,['頭','センター']),instanceId);
      const baseline=await pose();
      const boneTree=page.locator('#v110-bone-tree');
      await boneTree.evaluate(el=>el.open=true);
      await page.locator('#v110-bone-search').fill('センター');
      await page.locator('#v110-bone-list button[data-bone="センター"]').click();
      assert.equal(await page.locator('#v106-fk-bone').inputValue(),'センター');
      assert.ok(maxDelta(baseline.bones['頭'].quaternion,(await pose()).bones['頭'].quaternion)<1e-5);
      await page.locator('#v110-bone-search').fill('頭');
      await page.waitForFunction(()=>{
        const marker=document.querySelector('#v110-bone-overlay button[data-bone="頭"]');
        return marker&&!marker.hidden;
      });
      await page.locator('#v110-bone-overlay button[data-bone="頭"]').click();
      assert.equal(await page.locator('#v106-fk-bone').inputValue(),'頭');
      assert.ok(maxDelta(baseline.bones['頭'].quaternion,(await pose()).bones['頭'].quaternion)<1e-5);
      await page.locator('#v106-fk-y').fill('15');
      await page.locator('#v106-fk-preview').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('仮補正を表示中'));
      const previewed=await pose();
      assert.ok(maxDelta(baseline.bones['頭'].quaternion,previewed.bones['頭'].quaternion)>0.01);
      assert.ok(maxDelta(baseline.bones['センター'].quaternion,previewed.bones['センター'].quaternion)<1e-5);
      await page.locator('#v106-fk-cancel').click();
      const cancelled=await pose();
      assert.ok(maxDelta(baseline.bones['頭'].quaternion,cancelled.bones['頭'].quaternion)<1e-5);
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
      const saved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(saved.revision,1);assert.equal(saved.layers.length,1);
      assert.equal(saved.layers[0].keys[0].frame,240);
      assert.equal(saved.layers[0].keys[0].bone,'頭');
      assert.equal(saved.layers[0].model_sha256,originals[0]);
      assert.equal(saved.layers[0].motion_sha256,originals[1]);
      const corrected=await pose();
      assert.ok(maxDelta(baseline.bones['頭'].quaternion,corrected.bones['頭'].quaternion)>0.01);
      const stale=await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision:0,action:'undo'})});
      assert.equal(stale.status,409);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
      await page.reload();
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.waitForFunction(()=>document.querySelector('#v70sceneOpen'),null,{timeout:10000})
        .catch(error=>{throw new Error(`Scene bridge missing after reload: ${error.message}; browser errors: ${page.__monitor.errors.join(' | ')}`);});
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.waitForFunction(()=>document.querySelector('#v106-fk-saved')?.options.length===2,
        null,{timeout:30000});
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'fk-reload'));
      await page.waitForTimeout(200);
      const restored=await pose();
      assert.ok(maxDelta(corrected.bones['頭'].quaternion,restored.bones['頭'].quaternion)<1e-5);
      await page.locator('#v106-fk-undo').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('戻しました'));
      const undone=await pose();
      assert.ok(maxDelta(baseline.bones['頭'].quaternion,undone.bones['頭'].quaternion)<1e-5);
      await page.locator('#v106-fk-redo').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('やり直しました'));
      const redone=await pose();
      assert.ok(maxDelta(corrected.bones['頭'].quaternion,redone.bones['頭'].quaternion)<1e-5);
      const final=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(final.revision,3);assert.equal(final.layers[0].keys.length,1);
      await page.waitForFunction(()=>document.querySelectorAll('#v07timeline .v106-fk-marker').length===1);
      assert.equal(await page.locator('#v07timeline .v106-fk-marker').getAttribute('data-fk-frame'),'240');
      assert.ok(fs.existsSync(path.join(server.dataDir,'studio_v05_motion_edits',projectId+'.json')));
      const invalidBone=await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision:3,action:'set',instance_id:instanceId,clip_id:placement.clip.id,
          key:{...final.layers[0].keys[0],bone:'存在しない骨'}})});
      assert.equal(invalidBone.status,422);
      const invalidFrame=await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision:3,action:'set',instance_id:instanceId,clip_id:placement.clip.id,
          key:{...final.layers[0].keys[0],frame:601}})});
      assert.equal(invalidFrame.status,422);
      assert.equal((await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`))).revision,3);
      const post=body=>fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      let editRevision=3;
      const settings={project_id:projectId,action:'layer-update',instance_id:instanceId,
        clip_id:placement.clip.id,layer_id:final.layers[0].id};
      let updated=await ok(await post({...settings,revision:editRevision,settings:{weight:0.5,
        start_frame:230,end_frame:270,fade_in_frames:5,fade_out_frames:5}}));
      editRevision=updated.revision;
      assert.equal(updated.layers[0].weight,0.5);
      assert.equal(updated.layers[0].start_frame,230);
      const invalidInterval=await post({...settings,revision:editRevision,
        settings:{start_frame:275,end_frame:270}});
      assert.equal(invalidInterval.status,422);
      assert.equal((await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`))).revision,editRevision);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'fk-half'));
      const half=await pose();
      const fullDelta=maxDelta(baseline.bones['頭'].quaternion,corrected.bones['頭'].quaternion);
      const halfDelta=maxDelta(baseline.bones['頭'].quaternion,half.bones['頭'].quaternion);
      assert.ok(halfDelta>0.005&&halfDelta<fullDelta);
      await page.evaluate(()=>window.BAIStudioTimeline.seek(230/60,'fk-fade-start'));
      const fadeStart=await pose();
      await page.evaluate(()=>window.BAIStudioTimeline.seek(232/60,'fk-fade-mid'));
      const fadeMid=await pose();
      updated=await ok(await post({...settings,revision:editRevision,settings:{muted:true}}));
      editRevision=updated.revision;
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'fk-muted'));
      assert.ok(maxDelta(baseline.bones['頭'].quaternion,(await pose()).bones['頭'].quaternion)<1e-5);
      await page.evaluate(()=>window.BAIStudioTimeline.seek(230/60,'fk-muted-fade-start'));
      assert.ok(maxDelta(fadeStart.bones['頭'].quaternion,(await pose()).bones['頭'].quaternion)<1e-5);
      await page.evaluate(()=>window.BAIStudioTimeline.seek(232/60,'fk-muted-fade-mid'));
      assert.ok(maxDelta(fadeMid.bones['頭'].quaternion,(await pose()).bones['頭'].quaternion)>0.001);
      await page.evaluate(()=>window.BAIStudioTimeline.seek(3,'fk-muted-outside'));
      const mutedAtThree=await pose();
      updated=await ok(await post({...settings,revision:editRevision,settings:{muted:false,weight:1}}));
      editRevision=updated.revision;
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
      await page.evaluate(()=>window.BAIStudioTimeline.seek(3,'fk-outside'));
      const outside=await pose();
      assert.ok(maxDelta(outside.bones['頭'].quaternion,mutedAtThree.bones['頭'].quaternion)<1e-5);
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'fk-inside'));
      assert.ok(maxDelta(baseline.bones['頭'].quaternion,(await pose()).bones['頭'].quaternion)>0.01);
      updated=await ok(await post({...settings,revision:editRevision,settings:{
        start_frame:0,end_frame:600,fade_in_frames:0,fade_out_frames:0}}));
      editRevision=updated.revision;
      updated=await ok(await post({project_id:projectId,revision:editRevision,action:'move',
        instance_id:instanceId,clip_id:placement.clip.id,key:final.layers[0].keys[0],to_frame:241}));
      editRevision=updated.revision;
      assert.equal(updated.layers[0].keys[0].frame,241);
      await page.evaluate(()=>window.BAIStudioV05Arrangement.refreshTimeline());
      await page.waitForFunction(()=>document.querySelector('#v07timeline .v106-fk-marker')?.dataset.fkFrame==='241');
      updated=await ok(await post({project_id:projectId,revision:editRevision,action:'undo'}));
      editRevision=updated.revision;
      assert.equal(updated.layers[0].keys[0].frame,240);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
      await page.evaluate(()=>window.BAIStudioV05Arrangement.refreshTimeline());
      await page.waitForFunction(()=>document.querySelector('#v07timeline .v106-fk-marker')?.dataset.fkFrame==='240');
      await page.locator('#v07timeline .v106-fk-marker').press('ArrowRight');
      await page.waitForFunction(()=>{
        const frame=document.querySelector('#v07timeline .v106-fk-marker')?.dataset.fkFrame;
        return frame&&frame!=='240';
      });
      updated=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.ok(updated.layers[0].keys[0].frame>240&&updated.layers[0].keys[0].frame<600);
      editRevision=updated.revision;
      updated=await ok(await post({project_id:projectId,revision:editRevision,action:'undo'}));
      editRevision=updated.revision;
      assert.equal(updated.layers[0].keys[0].frame,240);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.open({composite:true}));
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'fk-layer-ui'));
      await page.locator('#v106-fk-weight').fill('25');
      await page.locator('#v106-fk-layer-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('レイヤーを保存しました'));
      updated=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(updated.layers[0].weight,0.25);
      editRevision=updated.revision;
      await page.locator('#v106-fk-weight').fill('100');
      await page.locator('#v106-fk-status').evaluate(el=>el.textContent='');
      await page.locator('#v106-fk-layer-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('レイヤーを保存しました'));
      updated=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(updated.layers[0].weight,1);
      editRevision=updated.revision;
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.close());
      await page.goto(`${server.base}/studio/v05/index.html?scene_capture=1`);
      await page.locator('#v06project').selectOption(projectId);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.open({composite:true}));
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
      assert.equal(await page.locator('#v110-bone-tree').count(),0);
      assert.equal(await page.locator('#v110-bone-overlay').count(),0);
      await page.waitForFunction(()=>document.querySelector('#v106-fk-saved')?.options.length===2,
        null,{timeout:30000});
      const capture=await page.evaluate(id=>{
        const png=window.BAIStudioMultiScenePreview.captureFrame(240,60,320,180);
        return {prefix:png.slice(0,22),length:png.length,
          pose:window.BAIStudioMultiScenePreview.poseProbe(id,['頭'])};
      },instanceId);
      assert.equal(capture.prefix,'data:image/png;base64,');
      assert.ok(capture.length>1000);
      assert.ok(maxDelta(corrected.bones['頭'].quaternion,capture.pose.bones['頭'].quaternion)<1e-5);
      const other=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'別作品のFK分離',kind:'empty'})}));
      const otherEdits=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${other.project.id}`));
      assert.equal(otherEdits.layers.length,0);
      const currentScene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${projectId}`));
      const lockedScene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision:currentScene.revision,action:'update',instance_id:instanceId,locked:true})}));
      const lockedWrite=await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision:editRevision,action:'set',instance_id:instanceId,clip_id:placement.clip.id,
          key:final.layers[0].keys[0]})});
      assert.equal(lockedWrite.status,409);
      await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision:lockedScene.revision,action:'update',instance_id:instanceId,locked:false})}));
      fs.appendFileSync(path.join(server.dataDir,'mmd','A',modelName),Buffer.from([0]));
      const staleSource=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(staleSource.layers[0].disabled,true);
      assert.match(staleSource.issues[0].reason,/changed/);
      const changedSourceWrite=await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision:editRevision,action:'set',instance_id:instanceId,clip_id:placement.clip.id,
          key:final.layers[0].keys[0]})});
      assert.equal(changedSourceWrite.status,409);
      console.log(JSON.stringify({model_sha256:originals[0],motion_sha256:originals[1],
        head_delta:maxDelta(baseline.bones['頭'].quaternion,corrected.bones['頭'].quaternion),
        center_delta:maxDelta(baseline.bones['センター'].quaternion,corrected.bones['センター'].quaternion),
        revision:final.revision,capture_png_chars:capture.length,
        renderer:(await page.evaluate(()=>window.BAIStudioMultiScenePreview.status())).renderer}));
      harness.assertNoErrors(page);
    }finally{
      await page?.close();await browser?.close();await server.stop();
      assert.deepEqual([digest(modelPath),digest(motionPath)],originals);
    }
  });
