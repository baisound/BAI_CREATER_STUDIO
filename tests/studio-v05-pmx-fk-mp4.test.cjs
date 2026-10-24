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
const modelPath=sourceRoot&&path.join(sourceRoot,'mmd','A',modelName);
const motionPath=sourceRoot&&path.join(sourceRoot,'mmd','vmd',motionName);
const available=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function json(reply,status=200){const body=await reply.text();assert.equal(reply.status,status,body);return JSON.parse(body);}
async function waitJob(base,id){
  const deadline=Date.now()+180000;
  let job;
  do{
    await new Promise(resolve=>setTimeout(resolve,500));
    job=await json(await fetch(`${base}/api/studio/v05/render/jobs?id=${id}`));
  }while(['queued','running'].includes(job.status)&&Date.now()<deadline);
  assert.equal(job.status,'succeeded',job.error);
  return job;
}
function firstFrame(mp4){
  const run=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0',
    '-ss','0.01','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],
  {input:mp4,maxBuffer:4*1024*1024});
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.length,1280*720*3);
  return run.stdout;
}
function changedPixels(a,b){
  assert.equal(a.length,b.length);
  let count=0;
  for(let i=0;i<a.length;i+=3){
    if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>5)count++;
  }
  return count;
}
function quatDelta(a,b){return Math.max(...a.map((value,index)=>Math.abs(value-b[index])));}

test('saved PMX FK correction changes real encoded MP4 pixels and weight zero restores source pose',
  {skip:!available&&'BAI_REAL_MMD_DATA に実PMX/VMDがありません',timeout:360000},async()=>{
    const original={model:hash(fs.readFileSync(modelPath)),motion:hash(fs.readFileSync(motionPath))};
    const metadata=JSON.parse(fs.readFileSync(path.join(sourceRoot,'mmd_assets.json'),'utf8'));
    const entries=metadata.A.filter(entry=>entry.name===modelName||entry.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],
      vmd:[{name:motionName,size:fs.statSync(motionPath).size}]})};
    for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(path.join(sourceRoot,'mmd','A',...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    const server=await harness.startServer({port:8911,seed});
    let browser,page;
    try{
      const project=await json(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'PMX FK完成MP4画素照合',kind:'empty'})}));
      const projectId=project.project.id;
      const scene=await json(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,action:'add',revision:0,
          asset_id:`mmd:A:${modelName}`,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
      const instanceId=scene.instances[0].id;
      const placed=await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,asset_id:`mmd:vmd:${motionName}`,
          track:'motion',start:0,duration:10,revision:0})}));
      const assigned=await json(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,clip_id:placed.clip.id,
          revision:placed.revision,instance_id:instanceId})}));
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(projectId);
      await page.waitForFunction(()=>typeof window.BAIStudioMultiScenePreview?.open==='function');
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.open());
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().loaded===1,null,{timeout:120000});
      const cameraPose=await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().camera);
      assert.ok(cameraPose?.position?.length===3&&cameraPose?.target?.length===3);
      await page.close();await browser.close();page=null;browser=null;
      const camera=await json(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,action:'camera',revision:scene.revision,
          camera:cameraPose})}));
      assert.deepEqual(camera.camera.position,cameraPose.position.map(value=>Number(value.toFixed(6))));
      const range=await json(await fetch(`${server.base}/api/studio/v05/timeline/range`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,revision:0,arrangement_revision:assigned.revision,
          in_frame:240,out_frame:242})}));
      async function render(){
        const started=await json(await fetch(`${server.base}/api/studio/v05/render/jobs`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({project_id:projectId,arrangement_revision:assigned.revision,
            range_revision:range.revision,scene_revision:camera.revision,resolution:'720p'})}),202);
        const job=await waitJob(server.base,started.id);
        assert.equal(job.scene_capture.frames,3);
        assert.equal(job.scene_capture.motion_clips,1);
        const mp4=Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
        return {job,mp4,pixels:firstFrame(mp4)};
      }
      const baseline=await render();
      assert.equal(baseline.job.scene_capture.motion_edits_revision,0);
      const repeated=await render();
      assert.equal(repeated.job.scene_capture.motion_edits_revision,0);
      const repeatPixels=changedPixels(baseline.pixels,repeated.pixels);
      const key={frame:240,bone:'頭',rotation:[0,Math.sin(Math.PI/8),0,Math.cos(Math.PI/8)]};
      const saved=await json(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,revision:0,action:'set',
          instance_id:instanceId,clip_id:placed.clip.id,key})}));
      assert.equal(saved.layers[0].keys[0].frame,240);
      const corrected=await render();
      assert.equal(corrected.job.scene_capture.motion_edits_revision,1);
      const headBase=baseline.job.scene_capture.pose_sample.bones['頭'];
      const headCorrected=corrected.job.scene_capture.pose_sample.bones['頭'];
      const centerBase=baseline.job.scene_capture.pose_sample.bones['センター'];
      const centerCorrected=corrected.job.scene_capture.pose_sample.bones['センター'];
      const headDifference=quatDelta(headBase.quaternion,headCorrected.quaternion);
      const centerDifference=quatDelta(centerBase.quaternion,centerCorrected.quaternion);
      const correctedPixels=changedPixels(baseline.pixels,corrected.pixels);
      assert.ok(headDifference>0.1,`保存FKが描画時の頭骨へ適用されません (${headDifference})`);
      assert.ok(centerDifference<1e-5,`無関係のセンター骨が変わりました (${centerDifference})`);
      assert.ok(correctedPixels>Math.max(200,repeatPixels*2),
        `保存FKの画素差が同条件の再出力差を超えません (${correctedPixels}/${repeatPixels})`);
      const zero=await json(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,revision:saved.revision,action:'layer-update',
          instance_id:instanceId,clip_id:placed.clip.id,layer_id:saved.layers[0].id,
          settings:{weight:0}})}));
      assert.equal(zero.layers[0].weight,0);
      const restored=await render();
      assert.equal(restored.job.scene_capture.motion_edits_revision,2);
      const zeroHead=restored.job.scene_capture.pose_sample.bones['頭'];
      const zeroDifference=quatDelta(headBase.quaternion,zeroHead.quaternion);
      const zeroPixels=changedPixels(baseline.pixels,restored.pixels);
      assert.ok(zeroDifference<1e-5,`重み0で頭骨が元姿勢へ戻りません (${zeroDifference})`);
      assert.ok(zeroPixels<=Math.max(repeatPixels*2,correctedPixels/3),
        `重み0の画素差が再出力の揺れより大きく、補正差と分離できません (${zeroPixels}/${repeatPixels}/${correctedPixels})`);
      const firstReread=Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${baseline.job.id}`)).arrayBuffer());
      assert.equal(hash(firstReread),hash(baseline.mp4),'後続ジョブが元MP4を上書きしていない');
      console.log(JSON.stringify({model_sha256:original.model,motion_sha256:original.motion,
        headDifference,centerDifference,zeroDifference,repeatPixels,correctedPixels,zeroPixels,
        baseline_renderer:baseline.job.scene_capture.renderer,
        corrected_renderer:corrected.job.scene_capture.renderer}));
    }finally{
      await page?.close();await browser?.close();
      await server.stop();
      assert.equal(hash(fs.readFileSync(modelPath)),original.model);
      assert.equal(hash(fs.readFileSync(motionPath)),original.motion);
    }
  });
