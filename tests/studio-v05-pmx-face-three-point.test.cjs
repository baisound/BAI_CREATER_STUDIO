'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const harness=require('./helpers/studio-harness.cjs');

const root=process.env.BAI_REAL_MMD_DATA;
const pmx='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const vmd='狐面物理確認用_頭振り_F000-0300.vmd';
const available=root&&fs.existsSync(path.join(root,'mmd','A',pmx))&&fs.existsSync(path.join(root,'mmd','vmd',vmd));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function json(response,status=200){const body=await response.text();assert.equal(response.status,status,body);return JSON.parse(body);}
async function waitJob(base,id){
  const until=Date.now()+180000;
  let job;
  do{await new Promise(resolve=>setTimeout(resolve,500));
    job=await json(await fetch(`${base}/api/studio/v05/render/jobs?id=${id}`));
  }while(['queued','running'].includes(job.status)&&Date.now()<until);
  assert.equal(job.status,'succeeded',job.error);
  return job;
}
function rawFrame(mp4){
  const run=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-frames:v','1',
    '-vf','scale=640:360','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],
  {input:mp4,maxBuffer:2*1024*1024});
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.length,640*360*3);
  return run.stdout;
}
function centerFace(bytes){
  const run=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-frames:v','1',
    '-vf','crop=iw*0.25:ih*0.65:iw*0.37:ih*0.05,scale=320:280',
    '-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{input:bytes,maxBuffer:1024*1024});
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.length,320*280*3);
  return run.stdout;
}
function changed(before,after){
  assert.equal(before.length,after.length);
  let count=0;
  for(let i=0;i<before.length;i+=3)
    if(Math.max(...[0,1,2].map(j=>Math.abs(before[i+j]-after[i+j])))>5)count++;
  return count;
}

test('real PMX expression and mouth keys survive F0, middle, tail, reload and MP4',
  {skip:!available&&'BAI_REAL_MMD_DATA に実PMX/VMDがありません'},async()=>{
  const modelPath=path.join(root,'mmd','A',pmx),motionPath=path.join(root,'mmd','vmd',vmd);
  const sourceHash={pmx:sha(modelPath),vmd:sha(motionPath)};
  const meta=JSON.parse(fs.readFileSync(path.join(root,'mmd_assets.json'),'utf8'));
  const entries=meta.A.filter(entry=>entry.name===pmx||entry.name.startsWith('tex/'));
  const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[{name:vmd,size:fs.statSync(motionPath).size}]})};
  for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(path.join(root,'mmd','A',...entry.name.split('/')));
  seed[`mmd/vmd/${vmd}`]=fs.readFileSync(motionPath);
  const server=await harness.startServer({port:8916,seed});
  let browser,page;
  try{
    const project=await json(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'PMX表情口三時点隔離',kind:'empty'})}));
    const id=project.project.id;
    let scene=await json(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,action:'add',revision:0,
        asset_id:`mmd:A:${pmx}`,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
    const instanceId=scene.instances[0].id;
    const placed=await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,asset_id:`mmd:vmd:${vmd}`,
        track:'motion',start:0,duration:10,revision:0})}));
    const assigned=await json(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,clip_id:placed.clip.id,
        revision:placed.revision,instance_id:instanceId})}));
    browser=await server.launchBrowser();page=await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    const loaded=()=>page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
    await loaded();
    async function compositeFace(){
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'composite-face-check'));
      await page.waitForTimeout(250);
      const canvas=await page.locator('#v58-canvas canvas').boundingBox();
      const panel=await page.locator('#v58-multi-preview').boundingBox();
      assert.ok(canvas&&panel&&panel.x>canvas.x+canvas.width*.59,
        `顔の中央領域に操作パネルが重なっています: ${JSON.stringify({canvas,panel})}`);
      return await page.locator('#v58-canvas canvas').screenshot();
    }
    const compositeBefore=await compositeFace();
    await page.getByRole('button',{name:'単独画面で表示'}).click();
    await page.getByRole('button',{name:'同じ画面に重ねる'}).waitFor();
    await loaded();
    const names=await page.evaluate(target=>Object.keys(window.BAIStudioMultiScenePreview.morphProbe(target).morphs),instanceId);
    assert.ok(names.includes('まばたき')&&names.includes('あ'),'実PMXの目・口モーフが必要です');
    async function preview(seconds){
      await page.evaluate(t=>window.BAIStudioTimeline.seek(t,'face-three-point'),seconds);
      await page.waitForTimeout(250);
      return {face:await page.evaluate(target=>window.BAIStudioMultiScenePreview.morphProbe(target).morphs,instanceId),
        pose:await page.evaluate(target=>window.BAIStudioMultiScenePreview.poseProbe(target,['頭']),instanceId),
        pixels:await page.locator('#v58-canvas canvas').screenshot()};
    }
    const points=[{seconds:0,frame:0,eye:1,mouth:0},{seconds:4,frame:120,eye:0,mouth:1},
      {seconds:9,frame:270,eye:1,mouth:0}];
    const baseline=[];
    for(const point of points)baseline.push(await preview(point.seconds));
    let rangeRevision=0;
    async function renderAt(frame,sceneRevision){
      const range=await json(await fetch(`${server.base}/api/studio/v05/timeline/range`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,revision:rangeRevision,
          arrangement_revision:assigned.revision,in_frame:frame,out_frame:frame})}));
      rangeRevision=range.revision;
      const start=await json(await fetch(`${server.base}/api/studio/v05/render/jobs`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,
          arrangement_revision:assigned.revision,range_revision:rangeRevision,
          scene_revision:sceneRevision,resolution:'720p'})}),202);
      const job=await waitJob(server.base,start.id);
      assert.equal(job.probe.frames,1);
      assert.equal(job.scene_capture.motion_clips,1);
      assert.ok(job.inputs.some(row=>row.asset_id===`mmd:A:${pmx}`&&row.sha256===sourceHash.pmx));
      assert.ok(job.inputs.some(row=>row.asset_id===`mmd:vmd:${vmd}`&&row.sha256===sourceHash.vmd));
      const movie=Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${start.id}`)).arrayBuffer());
      return {pixels:rawFrame(movie),renderer:job.scene_capture.renderer};
    }
    const plain=[];
    for(const point of points)plain.push(await renderAt(point.frame,scene.revision));
    const set=async(morph_name,time,value,track)=>{
      scene=await json(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,action:'face-set',
          revision:scene.revision,face_key:{instance_id:instanceId,morph_name,time,value,track}})}));
    };
    for(const point of points){
      await set('まばたき',point.seconds,point.eye,'expression');
      await set('あ',point.seconds,point.mouth,'lip');
    }
    assert.equal(scene.face_keys.length,6);
    const stored=await json(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${id}`));
    assert.equal(stored.revision,scene.revision);
    assert.deepEqual(stored.face_keys.map(key=>[key.morph_name,key.time,key.value,key.track]),
      points.flatMap(point=>[['まばたき',point.seconds,point.eye,'expression'],
        ['あ',point.seconds,point.mouth,'lip']]).sort((a,b)=>a[0].localeCompare(b[0],'ja')||a[1]-b[1]));
    await page.reload();await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();await page.locator('#v70sceneOpen').click();await loaded();
    const compositeAfter=await compositeFace();
    await page.getByRole('button',{name:'単独画面で表示'}).click();
    await page.getByRole('button',{name:'同じ画面に重ねる'}).waitFor();await loaded();
    const keyed=[];
    for(const point of points){
      const sample=await preview(point.seconds);
      assert.equal(sample.face['まばたき'],point.eye);
      assert.equal(sample.face['あ'],point.mouth);
      keyed.push(sample);
    }
    const video=[];
    for(const point of points)video.push(await renderAt(point.frame,scene.revision));
    const previewChanges=points.map((point,i)=>changed(rawFrame(baseline[i].pixels),rawFrame(keyed[i].pixels)));
    const movieChanges=points.map((point,i)=>changed(plain[i].pixels,video[i].pixels));
    const compositeFacePixels=changed(centerFace(compositeBefore),centerFace(compositeAfter));
    assert.ok(compositeFacePixels>2,`F120の合成画面で顔が確認できません: ${compositeFacePixels}`);
    for(const [index,point] of points.entries()){
      assert.ok(previewChanges[index]>2,`F${point.frame} preview did not change: ${previewChanges[index]}`);
      assert.ok(movieChanges[index]>2,`F${point.frame} MP4 did not change: ${movieChanges[index]}`);
      assert.deepEqual(baseline[index].pose.bones['頭'],keyed[index].pose.bones['頭'],
        `F${point.frame} body VMD pose changed`);
    }
    console.log(JSON.stringify({sourceHash,revision:scene.revision,previewChanges,movieChanges,
      compositeFacePixels,renderer:video.map(item=>item.renderer),points:points.map(point=>point.frame)}));
    harness.assertNoErrors(page);
  }finally{
    await page?.close();await browser?.close();await server.stop();
    assert.equal(sha(modelPath),sourceHash.pmx,'PMX original changed');
    assert.equal(sha(motionPath),sourceHash.vmd,'VMD original changed');
  }
});

