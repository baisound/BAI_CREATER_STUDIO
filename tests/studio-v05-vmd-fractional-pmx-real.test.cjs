'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const sourceRoot=process.env.BAI_REAL_MMD_DATA;
const modelName='avatar-front-garment-v04.pmx';
const motionName='狐面物理確認用_頭振り_F000-0300.vmd';
const modelPath=sourceRoot&&path.join(sourceRoot,'mmd','B',modelName);
const motionPath=sourceRoot&&path.join(sourceRoot,'mmd','vmd',motionName);
const exists=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function ok(response){const body=await response.text();assert.equal(response.status,200,body);return JSON.parse(body);}

test('24000/1001 fps candidate agrees with a second real PMX across all bones',
  {skip:!exists&&'BAI_REAL_MMD_DATA に別PMXと実VMDがありません',timeout:180000},async()=>{
    const originals=[digest(modelPath),digest(motionPath)];
    const meta=JSON.parse(fs.readFileSync(path.join(sourceRoot,'mmd_assets.json'),'utf8'));
    const entries=meta.B.filter(row=>row.name===modelName||row.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:[],B:entries,vmd:[
      {name:motionName,size:fs.statSync(motionPath).size}]})};
    for(const entry of entries)seed[`mmd/B/${entry.name}`]=fs.readFileSync(path.join(sourceRoot,'mmd','B',...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    const server=await harness.startServer({port:8901,seed});
    let browser,page;
    try{
      const fps=24000/1001;
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'MOTION010 分数FPSと別PMX',kind:'empty'})}));
      const projectId=project.project.id;
      await ok(await fetch(`${server.base}/api/studio/v05/project/fps`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,fps})}));
      const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          action:'add',revision:0,asset_id:`mmd:B:${modelName}`,
          transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
      const instanceId=scene.instances[0].id;
      const placed=await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          asset_id:`mmd:vmd:${motionName}`,track:'motion',start:0,duration:10,revision:0})}));
      await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          clip_id:placed.clip.id,revision:placed.revision,instance_id:instanceId})}));
      let revision=0;
      for(const [frame,x] of [[0,0],[120,0.01],[238,0]]){
        await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
            revision,action:'set',instance_id:instanceId,clip_id:placed.clip.id,
            key:{frame,bone:'頭',position:[x,0,0],rotation:[0,0,0,1]}})}));
        revision++;
      }
      const edits=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision,action:'layer-update',instance_id:instanceId,clip_id:placed.clip.id,
          layer_id:edits.layers[0].id,
          settings:{start_frame:48,end_frame:192,fade_in_frames:24,fade_out_frames:24}})}));
      revision++;
      const candidate=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision,instance_id:instanceId,clip_id:placed.clip.id})}));
      assert.ok(candidate.replaced_bone_keys+candidate.added_bone_keys>0);
      assert.equal(candidate.sampling_report.checked_project_frames,240);
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      const report=await page.evaluate(async({projectId,candidate,fps})=>{
        const {loadLibs}=await import('/studio/js/viewport/model-loader.js');
        const {validatePmxVmdCandidate}=await import('/studio/v05/js/pmx-vmd-candidate-validation-v120.js');
        const [scene,plan,edits]=await Promise.all([
          fetch(`/api/studio/v05/scene/instances?id=${projectId}`).then(r=>r.json()),
          fetch(`/api/studio/v05/scene/multi-motion-plan?id=${projectId}`).then(r=>r.json()),
          fetch(`/api/studio/v05/motion-edits?id=${projectId}`).then(r=>r.json())]);
        const row=plan.rows.find(item=>item.clip_id===candidate.clip_id);
        const instance=scene.instances.find(item=>item.id===candidate.instance_id);
        return validatePmxVmdCandidate({libs:await loadLibs(),modelAsset:instance.asset,
          motionAsset:row.motion_asset,row,layers:edits.layers.filter(item=>
            item.instance_id===candidate.instance_id&&item.clip_id===candidate.clip_id),
          candidate,fps,isCurrent:()=>true});
      },{projectId,candidate,fps});
      console.log('fractional second-PMX round trip',JSON.stringify(report));
      assert.equal(report.checkedFrames,240);
      assert.equal(report.checkedVmdFrames,300);
      assert.ok(report.bones>200);
      assert.equal(report.passed,true,JSON.stringify(report));
      assert.deepEqual([digest(modelPath),digest(motionPath)],originals);
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
