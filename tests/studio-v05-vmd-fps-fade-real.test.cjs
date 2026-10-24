'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const harness=require('./helpers/studio-harness.cjs');

const sourceRoot=process.env.BAI_REAL_MMD_DATA;
const modelName='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motionName='狐面物理確認用_頭振り_F000-0300.vmd';
const candidateName='MOTION010-24fps-fade-candidate.vmd';
const modelPath=sourceRoot&&path.join(sourceRoot,'mmd','A',modelName);
const motionPath=sourceRoot&&path.join(sourceRoot,'mmd','vmd',motionName);
const exists=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function ok(response){const body=await response.text();assert.equal(response.status,200,body);return JSON.parse(body);}

test('24 fps faded FK correction and VMD candidate agree on real PMX',
  {skip:!exists&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:180000},async()=>{
    const originals=[digest(modelPath),digest(motionPath)];
    const key=(frame,x)=>({frame,bone:'頭',position:[x,0,0],rotation:[0,0,0,1]});
    const keys=[key(0,0),key(120,0.01),key(238,0)];
    const layer={instance_id:'model-1',clip_id:'clip-1',fps:24,start:0,duration:10,
      weight:1,muted:false,start_frame:48,end_frame:192,fade_in_frames:24,
      fade_out_frames:24,keys};
    const script=[
      'import json,sys',
      'from pathlib import Path',
      'from studio_v05_vmd_temporal import temporal_replacements',
      'from studio_v05_vmd_rewrite import rewrite_bone_section',
      'raw=Path(sys.argv[1]).read_bytes()',
      'samples,report=temporal_replacements(raw,[json.loads(sys.argv[2])],instance_id="model-1",clip_id="clip-1")',
      'sys.stdout.buffer.write(rewrite_bone_section(raw,samples)[0])',
    ].join('\n');
    const baked=spawnSync('python',['-c',script,motionPath,JSON.stringify(layer)],{
      cwd:path.resolve(__dirname,'..'),maxBuffer:2*1024*1024});
    assert.equal(baked.status,0,baked.stderr.toString());
    const metadata=JSON.parse(fs.readFileSync(path.join(sourceRoot,'mmd_assets.json'),'utf8'));
    const entries=metadata.A.filter(e=>e.name===modelName||e.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[
      {name:motionName,size:fs.statSync(motionPath).size},
      {name:candidateName,size:baked.stdout.length}]})};
    for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(path.join(sourceRoot,'mmd','A',...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    seed[`mmd/vmd/${candidateName}`]=baked.stdout;
    const server=await harness.startServer({port:8899,seed});
    let browser,page;
    try{
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'MOTION010 24fps前後なじませ',kind:'empty'})}));
      const projectId=project.project.id;
      await ok(await fetch(`${server.base}/api/studio/v05/project/fps`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,fps:24})}));
      const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          action:'add',revision:0,asset_id:`mmd:A:${modelName}`,
          transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
      const instanceId=scene.instances[0].id;
      const place=async(name,start,revision)=>ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          asset_id:`mmd:vmd:${name}`,track:'motion',start,duration:10,revision})}));
      const original=await place(motionName,0,0);
      const candidate=await place(candidateName,10,original.revision);
      for(const [index,row] of [original,candidate].entries())await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          clip_id:row.clip.id,revision:candidate.revision+index,instance_id:instanceId})}));
      let revision=0;
      for(const saved of keys){
        await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
            revision,action:'set',instance_id:instanceId,clip_id:original.clip.id,key:saved})}));
        revision++;
      }
      const inspected=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision,action:'layer-update',instance_id:instanceId,clip_id:original.clip.id,
          layer_id:inspected.layers[0].id,
          settings:{start_frame:48,end_frame:192,fade_in_frames:24,fade_out_frames:24}})}));
      revision++;
      const response=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision,instance_id:instanceId,clip_id:original.clip.id,mode:'legacy_sparse'})}));
      assert.equal(response.sampling_report.checked_project_frames,240);
      assert.ok(response.sampling_report.max_position_error<1e-3);
      assert.ok(response.sampling_report.max_angle_error_degrees<0.01);
      assert.deepEqual(Buffer.from(await (await fetch(server.base+response.download_url)).arrayBuffer()),baked.stdout);
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===2,
        null,{timeout:120000});
      const result=await page.evaluate(instanceId=>{
        const diff=(a,b)=>Math.max(...a.map((value,index)=>Math.abs(value-b[index])));
        let maxWorldPosition=0,maxRotation=0,worst=-1;
        const timeline=window.BAIStudioTimeline,preview=window.BAIStudioMultiScenePreview;
        // The shared camera sequence fixture ends at F300. Keep the scene
        // integration probe inside it; the independent PMX check below covers all 240 F.
        for(let frame=0;frame<60;frame++){
          timeline.seek(frame/24,'vmd-24fps-source');
          const source=preview.poseProbe(instanceId,['頭']);
          timeline.seek(10+frame/24,'vmd-24fps-candidate');
          const candidate=preview.poseProbe(instanceId,['頭']);
          const position=diff(source.bones['頭'].world.slice(12,15),candidate.bones['頭'].world.slice(12,15));
          const rotation=diff(source.bones['頭'].quaternion,candidate.bones['頭'].quaternion);
          if(Math.max(position,rotation)>Math.max(maxWorldPosition,maxRotation))worst=frame;
          maxWorldPosition=Math.max(maxWorldPosition,position);maxRotation=Math.max(maxRotation,rotation);
        }
        return {maxWorldPosition,maxRotation,worst,renderer:preview.status().renderer};
      },instanceId);
      console.log(JSON.stringify(result));
      assert.ok(result.maxWorldPosition<1e-3,`world position mismatch at ${result.worst}`);
      assert.ok(result.maxRotation<2e-4,`rotation mismatch at ${result.worst}`);
      const roundTrip=await page.evaluate(async({projectId,response})=>{
        const {loadLibs}=await import('/studio/js/viewport/model-loader.js');
        const {validatePmxVmdCandidate}=await import('/studio/v05/js/pmx-vmd-candidate-validation-v120.js');
        const [scene,plan,edits]=await Promise.all([
          fetch(`/api/studio/v05/scene/instances?id=${projectId}`).then(r=>r.json()),
          fetch(`/api/studio/v05/scene/multi-motion-plan?id=${projectId}`).then(r=>r.json()),
          fetch(`/api/studio/v05/motion-edits?id=${projectId}`).then(r=>r.json())]);
        const row=plan.rows.find(item=>item.clip_id===response.clip_id);
        const instance=scene.instances.find(item=>item.id===response.instance_id);
        const args={libs:await loadLibs(),modelAsset:instance.asset,
          motionAsset:row.motion_asset,row,layers:edits.layers.filter(item=>
            item.instance_id===response.instance_id&&item.clip_id===response.clip_id),
          candidate:response,fps:24,isCurrent:()=>true};
        const good=await validatePmxVmdCandidate(args);
        let badHash='';
        try{await validatePmxVmdCandidate({...args,candidate:{...response,output_sha256:'0'.repeat(64)}});}
        catch(error){badHash=String(error.message||error);}
        return {good,badHash};
      },{projectId,response});
      assert.equal(roundTrip.good.checkedFrames,240);
      assert.equal(roundTrip.good.checkedVmdFrames,301);
      assert.ok(roundTrip.good.bones>20);
      assert.equal(roundTrip.good.passed,true,JSON.stringify(roundTrip.good));
      assert.match(roundTrip.badHash,/内容が変わりました/);
      console.log('all-bone round trip',JSON.stringify(roundTrip.good));
      await page.locator('#v106-fk-edit').evaluate(el=>{el.open=true;});
      await page.locator('#v106-fk-frame').fill('100');
      await page.locator('#v106-fk-frame').dispatchEvent('change');
      await page.locator('#v143-vmd-export-range').selectOption('legacy_sparse');
      await page.locator('#v116-vmd-candidate-create').click();
      await page.locator('#v116-vmd-candidate-download').waitFor({state:'visible'});
      await page.locator('#v120-vmd-candidate-validate').click();
      await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-status')?.textContent
        ?.includes('実PMX検査合格'),null,{timeout:120000});
      assert.match(await page.locator('#v116-vmd-candidate-status').innerText(),/作品240F＋VMD301F × \d+骨/);
      assert.match(await page.locator('#v116-vmd-candidate-status').innerText(),/物理OFF/);
      assert.deepEqual([digest(modelPath),digest(motionPath)],originals);
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
