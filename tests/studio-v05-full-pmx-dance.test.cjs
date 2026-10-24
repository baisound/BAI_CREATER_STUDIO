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
const motionName='キラメキのシンフォニー1005.vmd';
const available=sourceRoot&&fs.existsSync(path.join(sourceRoot,'mmd','A',modelName))&&
  fs.existsSync(path.join(sourceRoot,'mmd','vmd',motionName));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function json(response,status=200){const body=await response.text();assert.equal(response.status,status,body);return JSON.parse(body);}
const transform={position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
function delta(a,b){return Math.max(...a.quaternion.map((v,i)=>Math.abs(v-b.quaternion[i])),
  ...a.position.map((v,i)=>Math.abs(v-b.position[i])));}
async function waitJob(base,id){
  const deadline=Date.now()+180000;
  let job;
  do{await new Promise(resolve=>setTimeout(resolve,500));
    job=await json(await fetch(`${base}/api/studio/v05/render/jobs?id=${id}`));
  }while(['queued','running'].includes(job.status)&&Date.now()<deadline);
  assert.equal(job.status,'succeeded',job.error);
  return job;
}
function pixels(mp4){
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0',
    '-ss','0.01','-frames:v','1','-vf','scale=1280:720','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],
  {input:mp4,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stderr.toString());
  assert.equal(result.stdout.length,1280*720*3);
  return result.stdout;
}

test('full PMX dance VMD and face keys share saved project time',
  {skip:!available&&'BAI_REAL_MMD_DATA に全身PMX/VMDがありません'},async()=>{
  const modelPath=path.join(sourceRoot,'mmd','A',modelName);
  const motionPath=path.join(sourceRoot,'mmd','vmd',motionName);
  const before={model:sha(modelPath),motion:sha(motionPath)};
  const sourceMeta=JSON.parse(fs.readFileSync(path.join(sourceRoot,'mmd_assets.json'),'utf8'));
  const entries=sourceMeta.A.filter(row=>row.name===modelName||row.name.startsWith('tex/'));
  const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[{name:motionName,size:fs.statSync(motionPath).size}]})};
  for(const row of entries){const source=path.join(sourceRoot,'mmd','A',...row.name.split('/'));
    assert.ok(fs.existsSync(source),`missing ${row.name}`);seed[`mmd/A/${row.name}`]=fs.readFileSync(source);}
  seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
  const server=await harness.startServer({port:8895,seed});
  let browser,page;
  const httpErrors=[];
  const consoleErrors=[],pageErrors=[];
  try{
    const project=await json(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'実PMX全身ダンス隔離',kind:'empty'})}));
    const id=project.project.id;
    const scene=await json(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,action:'add',revision:0,
        asset_id:`mmd:A:${modelName}`,transform})}));
    const instanceId=scene.instances[0].id;
    const placed=await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,
        asset_id:`mmd:vmd:${motionName}`,track:'motion',start:0,duration:184.5,revision:0})}));
    const assigned=await json(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,
        clip_id:placed.clip.id,revision:placed.revision,instance_id:instanceId})}));
    browser=await server.launchBrowser();page=await server.newPage(browser);
    page.on('response',response=>{if(response.status()>=400)httpErrors.push({status:response.status(),url:response.url()});});
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    page.on('pageerror',error=>pageErrors.push(String(error)));
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:180000});
    const names=['センター','上半身','頭','右腕','左腕','右足','左足'];
    async function sample(seconds){
      await page.evaluate(t=>window.BAIStudioTimeline.seek(t,'full-dance-test'),seconds);
      await page.waitForTimeout(250);
      return {pose:await page.evaluate(([target,bones])=>window.BAIStudioMultiScenePreview.poseProbe(target,bones),[instanceId,names]),
        face:await page.evaluate(target=>window.BAIStudioMultiScenePreview.morphProbe(target),instanceId),
        frame:await page.evaluate(target=>window.BAIStudioMultiScenePreview.frameProbe(target),instanceId)};
    }
    const at0=await sample(0),at4=await sample(4);
    await page.waitForFunction(()=>window.BAIStudioCameraV29Runtime?.status()?.frame===240&&
      window.BAIStudioCameraV29Runtime?.status()?.sampleFrame===120);
    const cameraAt4=await page.evaluate(()=>window.BAIStudioCameraV29Runtime.status());
    assert.equal(cameraAt4.cameraFps,30);
    assert.equal(cameraAt4.heldAtEnd,false);
    const exactCamera=await json(await fetch(
      `${server.base}/api/camera/sequence/evaluate?seconds=4&overflow=hold`));
    assert.equal(exactCamera.frame,120);
    assert.equal(exactCamera.requested_frame,120);
    assert.deepEqual(cameraAt4.pose,exactCamera.pose);
    const at90=await sample(90);
    await page.waitForFunction(()=>window.BAIStudioCameraV29Runtime?.status()?.frame===5400&&
      window.BAIStudioCameraV29Runtime?.status()?.heldAtEnd===true);
    const cameraTail=await page.evaluate(()=>window.BAIStudioCameraV29Runtime.status());
    assert.equal(cameraTail.sampleFrame,300);
    assert.equal(cameraTail.requestedCameraFrame,2700);
    assert.equal(cameraTail.cameraFps,30);
    const strictCamera=await fetch(`${server.base}/api/camera/sequence/evaluate?frame=5400`);
    assert.equal(strictCamera.status,400,'既存APIの範囲外判定を保つ');
    const heldCamera=await json(await fetch(
      `${server.base}/api/camera/sequence/evaluate?seconds=90&overflow=hold`));
    assert.equal(heldCamera.frame,300);
    assert.equal(heldCamera.requested_frame,2700);
    assert.equal(heldCamera.requested_seconds,90);
    assert.equal(heldCamera.camera_fps,30);
    assert.equal(heldCamera.held_at_end,true);
    const changed=names.filter(name=>at0.pose.bones[name]&&at4.pose.bones[name]&&
      delta(at0.pose.bones[name],at4.pose.bones[name])>1e-3);
    assert.ok(changed.some(name=>!['頭','首'].includes(name)),`全身骨の変形差がありません: ${changed}`);
    assert.ok(names.some(name=>at4.pose.bones[name]&&at90.pose.bones[name]&&
      delta(at4.pose.bones[name],at90.pose.bones[name])>1e-3),'長尺中間の姿勢差がありません');
    assert.equal(at4.frame.renderer.length>0,true);
    assert.ok(Object.hasOwn(at4.face.morphs,'まばたき'));
    const range=await json(await fetch(`${server.base}/api/studio/v05/timeline/range`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,revision:0,
        arrangement_revision:assigned.revision,in_frame:240,out_frame:242})}));
    async function render(revision){
      const started=await json(await fetch(`${server.base}/api/studio/v05/render/jobs`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,
          arrangement_revision:assigned.revision,range_revision:range.revision,
          scene_revision:revision,resolution:'720p'})}),202);
      const job=await waitJob(server.base,started.id);
      const mp4=Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
      return {job,pixels:pixels(mp4)};
    }
    const plainMovie=await render(scene.revision);
    assert.equal(plainMovie.job.probe.frames,3);
    assert.equal(plainMovie.job.scene_capture.motion_clips,1);
    assert.ok(plainMovie.job.inputs.some(x=>x.asset_id===`mmd:vmd:${motionName}`&&x.sha256===before.motion));
    const key=async(time,value,revision)=>json(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,
        action:'face-set',revision,face_key:{instance_id:instanceId,morph_name:'まばたき',time,value,track:'expression'}})}));
    await key(0,0,scene.revision);
    const keyed=await key(4,1,scene.revision+1);
    const faceMovie=await render(keyed.revision);
    let facePixels=0;
    for(let i=0;i<plainMovie.pixels.length;i+=3)
      if(Math.max(...[0,1,2].map(j=>Math.abs(plainMovie.pixels[i+j]-faceMovie.pixels[i+j])))>5)facePixels++;
    assert.ok(facePixels>100,`全身ダンスMP4へ表情キーが反映されません (${facePixels})`);
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:180000});
    const synced=await sample(4);
    assert.equal(synced.face.morphs['まばたき'],1);
    assert.ok(delta(at4.pose.bones[changed[0]],synced.pose.bones[changed[0]])<1e-3,
      '表情キー保存が全身動作を変えました');
    await page.reload();await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:180000});
    const restored=await sample(4);
    assert.equal(restored.face.morphs['まばたき'],1);
    assert.ok(delta(synced.pose.bones[changed[0]],restored.pose.bones[changed[0]])<1e-3);
    const saved=await json(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${id}`));
    assert.equal(saved.revision,keyed.revision);
    assert.equal(saved.face_keys.length,2);
    assert.deepEqual(pageErrors,[],'ブラウザーで未処理の例外が出ました');
    assert.deepEqual(httpErrors,[],'旧カメラの終端を超えた画面シークでもHTTP失敗は出さない');
    assert.ok(consoleErrors.every(message=>/^unknown char code \d+\.$/.test(message)),
      `想定外のconsoleエラー: ${consoleErrors.join(' / ')}`);
    console.log(JSON.stringify({pmx_sha256:before.model,vmd_sha256:before.motion,
      changedBones:changed,modelCount:saved.instances.length,motionClips:1,faceKeyRevision:keyed.revision,
      longPoseDelta:delta(at4.pose.bones[changed[0]],at90.pose.bones[changed[0]]),renderer:at4.frame.renderer,
      cameraAt4:{frame:cameraAt4.frame,sampleFrame:cameraAt4.sampleFrame,
        cameraFps:cameraAt4.cameraFps},
      cameraTail:{frame:cameraTail.frame,sampleFrame:cameraTail.sampleFrame,
        requestedCameraFrame:cameraTail.requestedCameraFrame,heldAtEnd:cameraTail.heldAtEnd},
      httpErrors,
      parserWarnings:consoleErrors.filter(x=>x.startsWith('unknown char code')).length,
      outputFrames:faceMovie.job.probe.frames,mp4Renderer:faceMovie.job.scene_capture.renderer,facePixels}));
  }finally{
    await page?.close();await browser?.close();await server.stop();
    assert.equal(sha(modelPath),before.model,'PMX source changed');
    assert.equal(sha(motionPath),before.motion,'VMD source changed');
  }
});
