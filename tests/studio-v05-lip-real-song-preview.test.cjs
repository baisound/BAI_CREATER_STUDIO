'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const harness=require('./helpers/studio-harness.cjs');
const root=process.env.BAI_REAL_MMD_DATA;
const motionPath=process.env.BAI_REAL_LIP_VMD;
const modelName='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const modelPath=root&&path.join(root,'mmd','A',modelName);
const available=Boolean(modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const digest=file=>sha(fs.readFileSync(file));
async function json(response,status=200){const raw=await response.text();assert.equal(response.status,status,raw);return JSON.parse(raw);}
const post=(server,route,body)=>fetch(server.base+route,{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function delta(a,b){return Math.max(...a.quaternion.map((v,i)=>Math.abs(v-b.quaternion[i])),
  ...a.position.map((v,i)=>Math.abs(v-b.position[i])));}
async function waitJob(base,id){
  const deadline=Date.now()+420000;
  let job,phase;
  do{await new Promise(resolve=>setTimeout(resolve,500));
    job=await json(await fetch(`${base}/api/studio/v05/render/jobs?id=${id}`));
    if(job.phase!==phase){phase=job.phase;console.log(JSON.stringify({jobStatus:job.status,phase}));}
  }while(['queued','running'].includes(job.status)&&Date.now()<deadline);
  assert.equal(job.status,'succeeded',JSON.stringify({status:job.status,phase:job.phase,error:job.error}));
  return job;
}
function moviePixels(mp4){
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0',
    '-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],
    {input:mp4,maxBuffer:16*1024*1024});
  assert.equal(result.status,0,result.stderr.toString());
  assert.equal(result.stdout.length,1280*720*3);
  return result.stdout;
}
test('real song VMD drives real PMX pose and mouth in browser and a short MP4',
  {skip:!available&&'BAI_REAL_MMD_DATA と BAI_REAL_LIP_VMD が必要'},async()=>{
  const sourceHashes={model:digest(modelPath),motion:digest(motionPath)};
  const motionName=path.basename(motionPath);
  const meta=JSON.parse(fs.readFileSync(path.join(root,'mmd_assets.json'),'utf8'));
  const entries=meta.A.filter(row=>row.name===modelName||row.name.startsWith('tex/'));
  assert.ok(entries.length>1);
  const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[{
    name:motionName,size:fs.statSync(motionPath).size}]})};
  for(const row of entries){const file=path.join(root,'mmd','A',...row.name.split('/'));
    assert.ok(fs.existsSync(file),`missing texture: ${row.name}`);
    seed[`mmd/A/${row.name}`]=fs.readFileSync(file);
  }
  seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
  const server=await harness.startServer({port:8961,seed});
  let browser,page;
  const errors=[];
  try{
    const project=await json(await post(server,'/api/studio/v05/projects',{
      name:'実曲VMD表示隔離',kind:'empty'}));
    const id=project.project.id;
    const scene=await json(await post(server,'/api/studio/v05/scene/instances',{
      project_id:id,action:'add',revision:0,asset_id:`mmd:A:${modelName}`,
      transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}}));
    const instanceId=scene.instances[0].id;
    const placed=await json(await post(server,'/api/studio/v05/arrangement/place',{
      project_id:id,asset_id:`mmd:vmd:${motionName}`,track:'motion',start:0,duration:230,revision:0}));
    const assigned=await json(await post(server,'/api/studio/v05/scene/motion-target',{
      project_id:id,clip_id:placed.clip.id,revision:placed.revision,instance_id:instanceId}));
    browser=await server.launchBrowser();page=await server.newPage(browser);
    page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:180000});
    const names=['センター','上半身','頭','右腕','左腕','右足','左足'];
    const sample=async seconds=>{
      await page.evaluate(t=>window.BAIStudioTimeline.seek(t,'real-song-vmd-test'),seconds);
      await page.waitForTimeout(300);
      return {pose:await page.evaluate(([target,bones])=>window.BAIStudioMultiScenePreview.poseProbe(target,bones),[instanceId,names]),
        mouth:await page.evaluate(target=>window.BAIStudioMultiScenePreview.morphProbe(target),instanceId),
        frame:await page.evaluate(target=>window.BAIStudioMultiScenePreview.frameProbe(target),instanceId),
        pixels:await page.locator('#v58-canvas canvas').screenshot()};
    };
    const at0=await sample(0),at4=await sample(4),at90=await sample(90);
    assert.ok(at0.frame.renderer);
    const changed=names.filter(name=>at0.pose.bones[name]&&at4.pose.bones[name]&&
      delta(at0.pose.bones[name],at4.pose.bones[name])>1e-3);
    assert.ok(changed.length>0,`F0/F120 bone pose unchanged: ${JSON.stringify({at0:at0.pose,at4:at4.pose})}`);
    assert.notEqual(sha(at0.pixels),sha(at4.pixels));
    assert.ok(Object.hasOwn(at4.mouth.morphs,'あ'));
    assert.ok(at90.mouth.morphs['あ']>at0.mouth.morphs['あ']+1e-4,
      '実VMDの口形が0秒から90秒で変化しません');
    console.log(JSON.stringify({previewReady:true,changedBones:changed,renderer:at4.frame.renderer,
      mouth0:at0.mouth.morphs['あ'],mouth4:at4.mouth.morphs['あ'],mouth90:at90.mouth.morphs['あ']}));
    const range=await json(await post(server,'/api/studio/v05/timeline/range',{
      project_id:id,revision:0,arrangement_revision:assigned.revision,in_frame:240,out_frame:240}));
    const started=await json(await post(server,'/api/studio/v05/render/jobs',{
      project_id:id,arrangement_revision:assigned.revision,range_revision:range.revision,
      scene_revision:scene.revision,resolution:'720p'}),202);
    const job=await waitJob(server.base,started.id);
    assert.equal(job.probe.frames,1);
    assert.equal(job.scene_capture.motion_clips,1);
    assert.ok(job.inputs.some(row=>row.asset_id===`mmd:vmd:${motionName}`&&row.sha256===sourceHashes.motion));
    const mp4=Buffer.from(await(await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
    const decoded=moviePixels(mp4);
    assert.equal(decoded.length,1280*720*3);
    let visiblePixels=0;
    for(let i=0;i<decoded.length;i+=3)
      if(Math.max(decoded[i],decoded[i+1],decoded[i+2])>32)visiblePixels++;
    assert.ok(visiblePixels>1000,`MP4 frame appears empty: ${visiblePixels} visible pixels`);
    assert.ok(job.scene_capture.pose_sample?.bones?.['頭']);
    const restored=await json(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${id}`));
    assert.equal(restored.instances.length,1);
    assert.deepEqual(errors,[]);
    assert.equal(digest(path.join(server.dataDir,'mmd','A',modelName)),sourceHashes.model);
    assert.equal(digest(path.join(server.dataDir,'mmd','vmd',motionName)),sourceHashes.motion);
    console.log(JSON.stringify({modelHash:sourceHashes.model,motionHash:sourceHashes.motion,
      textureEntries:entries.length,changedBones:changed,
      mouth0:at0.mouth.morphs['あ'],mouth4:at4.mouth.morphs['あ'],mouth90:at90.mouth.morphs['あ'],
      renderer:at4.frame.renderer,mp4Frames:job.probe.frames,mp4Bytes:mp4.length,visiblePixels,
      probe:job.probe}));
  }finally{await page?.close();await browser?.close();await server.stop();
    assert.equal(digest(modelPath),sourceHashes.model,'PMX source changed');
    assert.equal(digest(motionPath),sourceHashes.motion,'VMD source changed');}
});
