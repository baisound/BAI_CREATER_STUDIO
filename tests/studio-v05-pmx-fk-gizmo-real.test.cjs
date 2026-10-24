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

test('real PMX 3D rotation handle previews a bone and saves through the FK key',
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
      assert.ok(delta(preview.bones['頭'].quaternion,restored.bones['頭'].quaternion)<1e-5);
      harness.assertNoErrors(page);
      console.log(JSON.stringify({head_delta:delta(baseline.bones['頭'].quaternion,preview.bones['頭'].quaternion),
        renderer:(await page.evaluate(()=>window.BAIStudioMultiScenePreview.status())).renderer,
        model_sha256:originals[0],motion_sha256:originals[1]}));
    }finally{
      await page?.close();await browser?.close();await server.stop();
      assert.deepEqual([digest(modelPath),digest(motionPath)],originals);
    }
  });
