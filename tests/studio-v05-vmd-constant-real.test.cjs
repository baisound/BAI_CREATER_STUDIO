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
const candidateName='MOTION010-constant-candidate.vmd';
const temporalName='MOTION010-temporal-candidate.vmd';
const footName='MOTION010-foot-ik-candidate.vmd';
const modelPath=sourceRoot&&path.join(sourceRoot,'mmd','A',modelName);
const motionPath=sourceRoot&&path.join(sourceRoot,'mmd','vmd',motionName);
const exists=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function ok(response){const body=await response.text();assert.equal(response.status,200,body);return JSON.parse(body);}
async function waitJob(base,id){
  const deadline=Date.now()+180000;
  let job;
  do{
    await new Promise(resolve=>setTimeout(resolve,500));
    job=await ok(await fetch(`${base}/api/studio/v05/render/jobs?id=${id}`));
  }while(['queued','running'].includes(job.status)&&Date.now()<deadline);
  assert.equal(job.status,'succeeded',job.error);
  return job;
}

test('constant and temporal FK candidates agree with real PMX preview',
  {skip:!exists&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:300000},async()=>{
    const originals=[digest(modelPath),digest(motionPath)];
    const angle=0.2;
    const savedKey={frame:240,bone:'頭',position:[0.3,0,0],
      rotation:[0,Math.sin(angle/2),0,Math.cos(angle/2)]};
    const layer={instance_id:'model-1',clip_id:'clip-1',fps:60,start:0,duration:10,
      weight:1,muted:false,keys:[savedKey]};
    const python=[
      'import json,sys',
      'from pathlib import Path',
      'from studio_v05_vmd_constant import constant_replacements',
      'from studio_v05_vmd_rewrite import rewrite_bone_section',
      'raw=Path(sys.argv[1]).read_bytes()',
      'layer=json.loads(sys.argv[2])',
      'samples=constant_replacements(raw,[layer],instance_id="model-1",clip_id="clip-1")',
      'sys.stdout.buffer.write(rewrite_bone_section(raw,samples)[0])',
    ].join('\n');
    const baked=spawnSync('python',['-c',python,motionPath,JSON.stringify(layer)],{
      cwd:path.resolve(__dirname,'..'),maxBuffer:2*1024*1024});
    assert.equal(baked.status,0,baked.stderr.toString());
    assert.ok(baked.stdout.length>1000);
    const temporalKey=(frame,x)=>({frame,bone:'頭',position:[x,0,0],rotation:[0,0,0,1]});
    const temporalKeys=[temporalKey(0,0),temporalKey(300,0.01),temporalKey(598,0)];
    const footKey={frame:240,bone:'左足ＩＫ',position:[0.3,0,0],rotation:[0,0,0,1]};
    const temporalLayer={...layer,keys:temporalKeys};
    const temporalPython=[
      'import json,sys',
      'from pathlib import Path',
      'from studio_v05_vmd_temporal import temporal_replacements',
      'from studio_v05_vmd_rewrite import rewrite_bone_section',
      'raw=Path(sys.argv[1]).read_bytes()',
      'samples,report=temporal_replacements(raw,[json.loads(sys.argv[2])],instance_id="model-1",clip_id="clip-1")',
      'sys.stdout.buffer.write(rewrite_bone_section(raw,samples)[0])',
    ].join('\n');
    const temporalBaked=spawnSync('python',['-c',temporalPython,motionPath,JSON.stringify(temporalLayer)],{
      cwd:path.resolve(__dirname,'..'),maxBuffer:2*1024*1024});
    assert.equal(temporalBaked.status,0,temporalBaked.stderr.toString());
    const footBaked=spawnSync('python',['-c',temporalPython,motionPath,
      JSON.stringify({...temporalLayer,keys:[...temporalKeys,footKey]})],{
      cwd:path.resolve(__dirname,'..'),maxBuffer:2*1024*1024});
    assert.equal(footBaked.status,0,footBaked.stderr.toString());
    const metadata=JSON.parse(fs.readFileSync(path.join(sourceRoot,'mmd_assets.json'),'utf8'));
    const entries=metadata.A.filter(e=>e.name===modelName||e.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[
      {name:motionName,size:fs.statSync(motionPath).size},
      {name:candidateName,size:baked.stdout.length},
      {name:temporalName,size:temporalBaked.stdout.length},
      {name:footName,size:footBaked.stdout.length}]})};
    for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(path.join(sourceRoot,'mmd','A',...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    seed[`mmd/vmd/${candidateName}`]=baked.stdout;
    seed[`mmd/vmd/${temporalName}`]=temporalBaked.stdout;
    seed[`mmd/vmd/${footName}`]=footBaked.stdout;
    const server=await harness.startServer({port:8898,seed});
    let browser,page;
    try{
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'MOTION010一定補正VMD実PMX照合',kind:'empty'})}));
      const projectId=project.project.id;
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
      const temporal=await place(temporalName,20,candidate.revision);
      const foot=await place(footName,30,temporal.revision);
      for(const [index,row] of [original,candidate,temporal,foot].entries())await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          clip_id:row.clip.id,revision:foot.revision+index,
          instance_id:instanceId})}));
      await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,revision:0,
          action:'set',instance_id:instanceId,clip_id:original.clip.id,key:savedKey})}));
      const candidateResponse=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision:1,instance_id:instanceId,clip_id:original.clip.id,mode:'legacy_sparse'})}));
      assert.equal(candidateResponse.status,'candidate_requires_real_pmx_validation');
      assert.equal(candidateResponse.registered_asset,false);
      assert.equal(candidateResponse.placed_in_project,false);
      const candidateDownload=await fetch(server.base+candidateResponse.download_url);
      assert.equal(candidateDownload.status,200);
      const candidateBytes=Buffer.from(await candidateDownload.arrayBuffer());
      assert.equal(crypto.createHash('sha256').update(candidateBytes).digest('hex'),candidateResponse.output_sha256);
      assert.equal(candidateBytes.length,baked.stdout.length);
      const stale=await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision:0,instance_id:instanceId,clip_id:original.clip.id})});
      assert.equal(stale.status,409);
      const invalidDownload=await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate/file?project_id=${projectId}&candidate_id=../bad`);
      assert.equal(invalidDownload.status,422);
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===4,
        null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'vmd-candidate-ui'));
      await page.locator('#v143-vmd-export-range').selectOption('legacy_sparse');
      assert.equal(await page.locator('#v116-vmd-candidate-create').isDisabled(),false);
      await page.locator('#v116-vmd-candidate-create').click();
      await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-download')?.hidden===false);
      assert.match(await page.locator('#v116-vmd-candidate-status').textContent(),/実PMX往復の確認前/);
      const result=await page.evaluate(instanceId=>{
        const diff=(a,b)=>Math.max(...a.map((value,index)=>Math.abs(value-b[index])));
        let maxPosition=0,maxRotation=0,worst=-1;
        const timeline=window.BAIStudioTimeline,preview=window.BAIStudioMultiScenePreview;
        for(let frame=0;frame<300;frame++){
          timeline.seek(frame/30,'vmd-source');
          const source=preview.poseProbe(instanceId,['頭','センター']);
          timeline.seek(10+frame/30,'vmd-candidate');
          const candidate=preview.poseProbe(instanceId,['頭','センター']);
          const position=diff(source.bones['頭'].position,candidate.bones['頭'].position);
          const rotation=diff(source.bones['頭'].quaternion,candidate.bones['頭'].quaternion);
          if(Math.max(position,rotation)>Math.max(maxPosition,maxRotation))worst=frame;
          maxPosition=Math.max(maxPosition,position);maxRotation=Math.max(maxRotation,rotation);
        }
        return {maxPosition,maxRotation,worst,renderer:preview.status().renderer};
      },instanceId);
      console.log(JSON.stringify(result));
      assert.ok(result.maxPosition<1e-3,`position mismatch at ${result.worst}`);
      assert.ok(result.maxRotation<2e-4,`rotation mismatch at ${result.worst}`);
      await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,revision:1,
          action:'set',instance_id:instanceId,clip_id:original.clip.id,
          key:{...savedKey,frame:300,position:[0.4,0,0]}})}));
      const varying=await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision:2,instance_id:instanceId,clip_id:original.clip.id,mode:'legacy_sparse'})});
      assert.equal(varying.status,422,'time-varying corrections must not be silently baked as constant');
      let revision=2;
      const edit=async(action,key)=>{
        await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
            revision,action,instance_id:instanceId,clip_id:original.clip.id,key})}));
        revision++;
      };
      await edit('remove',savedKey);
      await edit('remove',{...savedKey,frame:300,position:[0.4,0,0]});
      for(const key of temporalKeys)await edit('set',key);
      assert.equal(revision,7);
      const temporalEdits=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.deepEqual(temporalEdits.layers[0].keys.map(key=>key.frame),[0,300,598]);
      const temporalResponse=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision,instance_id:instanceId,clip_id:original.clip.id,mode:'legacy_sparse'})}));
      assert.equal(temporalResponse.sampling_report.checked_project_frames,600);
      assert.ok(temporalResponse.sampling_report.max_position_error<1e-3);
      assert.ok(temporalResponse.sampling_report.max_angle_error_degrees<0.01);
      const downloaded=Buffer.from(await (await fetch(server.base+temporalResponse.download_url)).arrayBuffer());
      assert.deepEqual(downloaded,temporalBaked.stdout);
      await page.reload();
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===4,
        null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'vmd-temporal-ui'));
      await page.locator('#v143-vmd-export-range').selectOption('legacy_sparse');
      await page.locator('#v116-vmd-candidate-create').click();
      await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-status')?.textContent?.includes('作品600F'));
      assert.match(await page.locator('#v116-vmd-candidate-status').textContent(),/実PMX往復の確認前/);
      const temporalResult=await page.evaluate(instanceId=>{
        const diff=(a,b)=>Math.max(...a.map((value,index)=>Math.abs(value-b[index])));
        let maxPosition=0,maxRotation=0,worst=-1;
        const timeline=window.BAIStudioTimeline,preview=window.BAIStudioMultiScenePreview;
        for(let frame=0;frame<600;frame++){
          timeline.seek(frame/60,'vmd-temporal-source');
          const source=preview.poseProbe(instanceId,['頭','センター']);
          timeline.seek(20+frame/60,'vmd-temporal-candidate');
          const candidate=preview.poseProbe(instanceId,['頭','センター']);
          const position=diff(source.bones['頭'].position,candidate.bones['頭'].position);
          const rotation=diff(source.bones['頭'].quaternion,candidate.bones['頭'].quaternion);
          if(Math.max(position,rotation)>Math.max(maxPosition,maxRotation))worst=frame;
          maxPosition=Math.max(maxPosition,position);maxRotation=Math.max(maxRotation,rotation);
        }
        return {maxPosition,maxRotation,worst,renderer:preview.status().renderer};
      },instanceId);
      console.log(JSON.stringify({temporalResult}));
      assert.ok(temporalResult.maxPosition<1e-3,`temporal position mismatch at ${temporalResult.worst}`);
      assert.ok(temporalResult.maxRotation<2e-4,`temporal rotation mismatch at ${temporalResult.worst}`);
      await edit('set',footKey);
      const footResponse=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision,instance_id:instanceId,clip_id:original.clip.id,mode:'legacy_sparse'})}));
      assert.ok(footResponse.sampling_report.max_position_error<1e-3);
      assert.deepEqual(Buffer.from(await (await fetch(server.base+footResponse.download_url)).arrayBuffer()),footBaked.stdout);
      await page.reload();
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().loaded===1&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===4,
        null,{timeout:120000});
      const footResult=await page.evaluate(instanceId=>{
        const names=['左足ＩＫ','左足首','右足首'];
        const diff=(a,b)=>Math.max(...a.map((value,index)=>Math.abs(value-b[index])));
        const maximum=Object.fromEntries(names.map(name=>[name,0]));
        let worst=-1;
        const timeline=window.BAIStudioTimeline,preview=window.BAIStudioMultiScenePreview;
        for(let frame=0;frame<600;frame++){
          timeline.seek(frame/60,'vmd-foot-source');
          const source=preview.poseProbe(instanceId,names);
          timeline.seek(30+frame/60,'vmd-foot-candidate');
          const candidate=preview.poseProbe(instanceId,names);
          for(const name of names){
            const error=diff(source.bones[name].world.slice(12,15),candidate.bones[name].world.slice(12,15));
            if(error>maximum[name]){maximum[name]=error;worst=frame;}
          }
        }
        return {maximum,worst,renderer:preview.status().renderer};
      },instanceId);
      console.log(JSON.stringify({footResult}));
      assert.ok(footResult.maximum['左足ＩＫ']<1e-3,`IK target mismatch at ${footResult.worst}`);
      assert.ok(footResult.maximum['左足首']<1e-3,`IK ankle mismatch at ${footResult.worst}`);
      assert.ok(footResult.maximum['右足首']<1e-4,`unmodified ankle mismatch at ${footResult.worst}`);
      const fullSkeleton=await page.evaluate(async({projectId,footResponse})=>{
        const {loadLibs}=await import('/studio/js/viewport/model-loader.js');
        const {validatePmxVmdCandidate}=await import('/studio/v05/js/pmx-vmd-candidate-validation-v120.js');
        const [scene,plan,edits]=await Promise.all([
          fetch(`/api/studio/v05/scene/instances?id=${projectId}`).then(r=>r.json()),
          fetch(`/api/studio/v05/scene/multi-motion-plan?id=${projectId}`).then(r=>r.json()),
          fetch(`/api/studio/v05/motion-edits?id=${projectId}`).then(r=>r.json())]);
        const row=plan.rows.find(item=>item.clip_id===footResponse.clip_id);
        const instance=scene.instances.find(item=>item.id===footResponse.instance_id);
        return validatePmxVmdCandidate({libs:await loadLibs(),modelAsset:instance.asset,
          motionAsset:row.motion_asset,row,layers:edits.layers.filter(item=>
            item.instance_id===footResponse.instance_id&&item.clip_id===footResponse.clip_id),
          candidate:footResponse,fps:60,isCurrent:()=>true});
      },{projectId,footResponse});
      console.log('foot IK all-bone round trip',JSON.stringify(fullSkeleton));
      assert.equal(fullSkeleton.checkedFrames,600);
      assert.equal(fullSkeleton.checkedVmdFrames,300);
      assert.equal(fullSkeleton.passed,true,JSON.stringify(fullSkeleton));
      const adoptionPlan=await ok(await fetch(`${server.base}/api/studio/v05/scene/multi-motion-plan?id=${projectId}`));
      const rejected=await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate/adopt`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,candidate_id:footResponse.candidate_id,
          edit_revision:footResponse.revision,arrangement_revision:adoptionPlan.arrangement_revision,
          scene_revision:adoptionPlan.scene_revision,report:{...fullSkeleton,passed:false}})});
      assert.equal(rejected.status,422);
      const adopted=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate/adopt`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,candidate_id:footResponse.candidate_id,
          edit_revision:footResponse.revision,arrangement_revision:adoptionPlan.arrangement_revision,
          scene_revision:adoptionPlan.scene_revision,report:fullSkeleton})}));
      assert.match(adopted.asset_id,/^mmd:vmd:MOTION010-[0-9a-f-]+\.vmd$/);
      const placed=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${projectId}`));
      const placedClip=placed.clips.find(item=>item.id===original.clip.id);
      assert.equal(placedClip.asset_id,adopted.asset_id);
      assert.equal(placedClip.start,0);assert.equal(placedClip.duration,10);
      assert.equal(placedClip.motion010_source_asset_id,`mmd:vmd:${motionName}`);
      const registered=await ok(await fetch(`${server.base}/api/assets`));
      assert.ok(registered.items.some(item=>item.id===adopted.asset_id&&item.available));
      const adoptedName=adopted.asset_id.slice('mmd:vmd:'.length);
      assert.equal(digest(path.join(server.dataDir,'mmd','vmd',adoptedName)),footResponse.output_sha256);
      const exportRange=await ok(await fetch(`${server.base}/api/studio/v05/timeline/range`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:0,arrangement_revision:placed.revision,
          in_frame:240,out_frame:242})}));
      const started=await fetch(`${server.base}/api/studio/v05/render/jobs`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,arrangement_revision:placed.revision,
          range_revision:exportRange.revision,scene_revision:adoptionPlan.scene_revision,
          resolution:'720p'})});
      const startedBody=await started.text();
      assert.equal(started.status,202,startedBody);
      const job=await waitJob(server.base,JSON.parse(startedBody).id);
      assert.equal(job.scene_capture.motion_clips,4);
      assert.ok(job.inputs.some(item=>item.asset_id===adopted.asset_id&&
        item.sha256===footResponse.output_sha256));
      const mp4=await fetch(`${server.base}/api/studio/v05/render/file?id=${job.id}`);
      assert.equal(mp4.status,200);
      assert.ok((await mp4.arrayBuffer()).byteLength>1000);
      await page.reload();
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===4,
        null,{timeout:120000});
      const bakedPose=await page.evaluate(instanceId=>{
        const timeline=window.BAIStudioTimeline,preview=window.BAIStudioMultiScenePreview;
        timeline.seek(4,'adopted');
        const adopted=preview.poseProbe(instanceId,['頭','左足首']);
        timeline.seek(34,'reference');
        const reference=preview.poseProbe(instanceId,['頭','左足首']);
        return Math.max(...['頭','左足首'].flatMap(name=>adopted.bones[name].world.map(
          (value,index)=>Math.abs(value-reference.bones[name].world[index]))));
      },instanceId);
      assert.ok(bakedPose<1e-3,`placed VMD playback differs from validated candidate: ${bakedPose}`);
      const restored=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate/restore`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,clip_id:original.clip.id,arrangement_revision:placed.revision})}));
      assert.equal(restored.asset_id,`mmd:vmd:${motionName}`);
      const afterRestore=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${projectId}`));
      assert.equal(afterRestore.clips.find(item=>item.id===original.clip.id).asset_id,`mmd:vmd:${motionName}`);
      assert.equal(digest(path.join(server.dataDir,'mmd','vmd',adoptedName)),footResponse.output_sha256);
      await page.reload();
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===4,
        null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'adoption-ui'));
      await page.locator('#v143-vmd-export-range').selectOption('legacy_sparse');
      await page.locator('#v116-vmd-candidate-create').click();
      await page.locator('#v116-vmd-candidate-download').waitFor({state:'visible'});
      assert.equal(await page.locator('#v141-vmd-candidate-adopt').isDisabled(),true);
      await page.locator('#v120-vmd-candidate-validate').click();
      await page.waitForFunction(()=>!document.querySelector('#v141-vmd-candidate-adopt')?.disabled,
        null,{timeout:160000});
      await page.locator('#v141-vmd-candidate-adopt').click();
      await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-status')?.textContent?.includes('配置しました'),
        null,{timeout:120000});
      assert.equal(await page.locator('#v141-vmd-candidate-restore').isHidden(),false);
      await page.locator('#v141-vmd-candidate-restore').click();
      await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-status')?.textContent?.includes('元VMDを同じクリップへ戻しました'),
        null,{timeout:120000});
      const uiRestored=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${projectId}`));
      assert.equal(uiRestored.clips.find(item=>item.id===original.clip.id).asset_id,`mmd:vmd:${motionName}`);
      assert.deepEqual([digest(modelPath),digest(motionPath)],originals);
      assert.equal(baked.stdout.slice(-29).toString('hex'),fs.readFileSync(motionPath).slice(-29).toString('hex'));
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
