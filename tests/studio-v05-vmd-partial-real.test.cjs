'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const sourceRoot=process.env.BAI_REAL_MMD_DATA;
const modelName='avatar-front-garment-v04.pmx';
const originalVmdName='狐面物理確認用_頭振り_F000-0300.vmd';
const syntheticName='MOTION010-partial-source.vmd';
const modelPath=sourceRoot&&path.join(sourceRoot,'mmd','B',modelName);
const originalVmdPath=sourceRoot&&path.join(sourceRoot,'mmd','vmd',originalVmdName);
const available=modelPath&&originalVmdPath&&fs.existsSync(modelPath)&&fs.existsSync(originalVmdPath);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const digest=file=>hash(fs.readFileSync(file));
async function ok(reply,status=200){const body=await reply.text();assert.equal(reply.status,status,body);return JSON.parse(body);}

function staticHeadVmd(original){
  const count=original.readUInt32LE(50),suffix=original.subarray(54+count*111);
  const bone=original.subarray(54,69),interpolation=original.subarray(54+47,54+111);
  const frames=[0,300];
  const size=54+frames.length*111+suffix.length,output=Buffer.alloc(size);
  original.copy(output,0,0,50);
  output.writeUInt32LE(frames.length,50);
  for(const [index,frame] of frames.entries()){
    const offset=54+index*111;
    bone.copy(output,offset);
    output.writeUInt32LE(frame,offset+15);
    output.writeFloatLE(1,offset+15+4+6*4);
    interpolation.copy(output,offset+47);
  }
  suffix.copy(output,54+frames.length*111);
  return output;
}

function outsideRecords(bytes,intervals){
  const count=bytes.readUInt32LE(50),result=new Map();
  for(let i=0;i<count;i++){
    const record=bytes.subarray(54+i*111,54+(i+1)*111);
    const frame=record.readUInt32LE(15);
    if(!intervals.some(([start,end])=>start<=frame&&frame<end))
      result.set(frame,record.toString('hex'));
  }
  return Object.fromEntries(result);
}

test('24fps two-layer interval VMD preserves gap bytes and validates on real PMX',
  {skip:!available&&'BAI_REAL_MMD_DATA に別PMXとVMDがありません',timeout:240000},async()=>{
    const originals=[digest(modelPath),digest(originalVmdPath)];
    const source=staticHeadVmd(fs.readFileSync(originalVmdPath));
    const metadata=JSON.parse(fs.readFileSync(path.join(sourceRoot,'mmd_assets.json'),'utf8'));
    const entries=metadata.B.filter(row=>row.name===modelName||row.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:[],B:entries,vmd:[
      {name:syntheticName,size:source.length}]})};
    for(const entry of entries)seed[`mmd/B/${entry.name}`]=fs.readFileSync(
      path.join(sourceRoot,'mmd','B',...entry.name.split('/')));
    seed[`mmd/vmd/${syntheticName}`]=source;
    const server=await harness.startServer({port:8906,seed});
    let browser,page;
    try{
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'MOTION010 修正区間のみ別PMX24fps',kind:'empty'})}));
      const projectId=project.project.id,fps=24;
      await ok(await fetch(`${server.base}/api/studio/v05/project/fps`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,fps})}));
      const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,action:'add',revision:0,asset_id:`mmd:B:${modelName}`,
          transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
      const instanceId=scene.instances[0].id;
      const placed=await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,asset_id:`mmd:vmd:${syntheticName}`,
          track:'motion',start:0,duration:10,revision:0})}));
      await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,clip_id:placed.clip.id,revision:placed.revision,
          instance_id:instanceId})}));
      const saved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:0,action:'set',instance_id:instanceId,
          clip_id:placed.clip.id,key:{frame:96,bone:'頭',position:[0.01,0,0],
            rotation:[0,0,0,1]}})}));
      const edited=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:saved.revision,action:'layer-update',
          instance_id:instanceId,clip_id:placed.clip.id,layer_id:saved.layers[0].id,
          settings:{start_frame:72,end_frame:120,fade_in_frames:12,fade_out_frames:12}})}));
      const added=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:edited.revision,action:'layer-create',
          instance_id:instanceId,clip_id:placed.clip.id,
          settings:{name:'後半の頭補正',start_frame:144,end_frame:192,
            fade_in_frames:12,fade_out_frames:12}})}));
      assert.equal(added.layers.length,2);
      const secondId=added.layers[1].id;
      const untargeted=await fetch(`${server.base}/api/studio/v05/motion-edits`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:added.revision,action:'set',
          instance_id:instanceId,clip_id:placed.clip.id,
          key:{frame:168,bone:'頭',position:[0.01,0,0],rotation:[0,0,0,1]}})});
      assert.equal(untargeted.status,422);
      const combined=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:added.revision,action:'set',
          instance_id:instanceId,clip_id:placed.clip.id,layer_id:secondId,
          key:{frame:168,bone:'頭',position:[0.01,0,0],rotation:[0,0,0,1]}})}));
      assert.equal(combined.layers[0].keys.length,1);
      assert.equal(combined.layers[1].keys.length,1);
      const denseDefault=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:combined.revision,instance_id:instanceId,
          clip_id:placed.clip.id})}));
      assert.equal(denseDefault.export_mode,'whole');
      assert.equal(denseDefault.sampling_report.vmd_frame_span,301);
      const legacy=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:combined.revision,instance_id:instanceId,
          clip_id:placed.clip.id,mode:'legacy_sparse'})}));
      assert.equal(legacy.export_mode,'legacy_sparse');
      const invalidMode=await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:combined.revision,instance_id:instanceId,
          clip_id:placed.clip.id,mode:'unsafe'})});
      assert.equal(invalidMode.status,422);
      const candidate=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:combined.revision,instance_id:instanceId,
          clip_id:placed.clip.id,mode:'interval'})}));
      assert.equal(candidate.export_mode,'interval');
      assert.equal(candidate.sampling_report.start_vmd_frame,90);
      assert.equal(candidate.sampling_report.end_vmd_frame,240);
      assert.equal(candidate.sampling_report.missing_boundary_keys,4);
      assert.deepEqual(candidate.sampling_report.intervals,[[90,150],[180,240]]);
      assert.equal(candidate.sampling_report.vmd_frame_span,301);
      const output=Buffer.from(await (await fetch(server.base+candidate.download_url)).arrayBuffer());
      assert.deepEqual(outsideRecords(output,[[90,150],[180,240]]),
        outsideRecords(source,[[90,150],[180,240]]));
      const originalCount=source.readUInt32LE(50),outputCount=output.readUInt32LE(50);
      assert.deepEqual(output.subarray(54+outputCount*111),source.subarray(54+originalCount*111));
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
        null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'partial-ui'));
      await page.locator('#v146-fk-layer-select').selectOption(saved.layers[0].id);
      await page.locator(`.v106-fk-marker[data-fk-layer="${secondId}"]`).first().click();
      await page.waitForFunction(id=>document.querySelector('#v146-fk-layer-select')?.value===id,
        secondId,{timeout:10000});
      await page.locator('#v146-fk-layer-select').selectOption(secondId);
      assert.equal(await page.locator('#v146-fk-layer-name').inputValue(),'後半の頭補正');
      assert.equal(await page.locator('#v106-fk-start').inputValue(),'144');
      assert.match(await page.locator('#v106-fk-saved').textContent(),/F168 頭/);
      await page.locator('#v143-vmd-export-range').selectOption('interval');
      await page.locator('#v116-vmd-candidate-create').click();
      await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-status')?.textContent?.includes('区間外の原キー'),
        null,{timeout:30000});
      assert.match(await page.locator('#v116-vmd-candidate-status').textContent(),/F90〜149、F180〜239/);
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
      console.log('interval 24fps other-PMX round trip',JSON.stringify(report));
      assert.equal(report.passed,true,JSON.stringify(report));
      assert.equal(report.checkedFrames,240);
      assert.equal(report.checkedVmdFrames,301);
      assert.ok(report.bones>200);
      const plan=await ok(await fetch(`${server.base}/api/studio/v05/scene/multi-motion-plan?id=${projectId}`));
      const adopted=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate/adopt`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,candidate_id:candidate.candidate_id,
          edit_revision:combined.revision,arrangement_revision:plan.arrangement_revision,
          scene_revision:plan.scene_revision,report})}));
      const arrangement=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${projectId}`));
      assert.equal(arrangement.clips[0].asset_id,adopted.asset_id);
      assert.equal(arrangement.clips[0].start,0);
      assert.equal(arrangement.clips[0].duration,10);
      await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate/restore`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,clip_id:placed.clip.id,
          arrangement_revision:arrangement.revision})}));
      const restored=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${projectId}`));
      assert.equal(restored.clips[0].asset_id,`mmd:vmd:${syntheticName}`);
      await page.locator('#v146-fk-layer-select').selectOption(secondId);
      await page.locator('#v106-fk-saved').selectOption(JSON.stringify([168,'頭']));
      await page.locator('#v112-fk-position-x').fill('0.012');
      await page.locator('#v106-fk-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('FKキーを作品に保存'),
        null,{timeout:10000});
      const afterKeyEdit=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(afterKeyEdit.layers[0].keys[0].position[0],0.01);
      assert.equal(afterKeyEdit.layers[1].keys[0].position[0],0.012);
      await page.locator('#v146-fk-layer-create').click();
      await page.waitForFunction(()=>document.querySelector('#v146-fk-layer-select')?.options.length===4,
        null,{timeout:10000});
      const thirdId=await page.locator('#v146-fk-layer-select').inputValue();
      const afterCreate=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(afterCreate.layers.length,3);
      assert.equal(afterCreate.layers[2].id,thirdId);
      await page.locator('#v146-fk-layer-name').fill('画面で追加した補正');
      await page.locator('#v106-fk-start').fill('24');
      await page.locator('#v106-fk-end').fill('72');
      await page.locator('#v106-fk-layer-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('レイヤーを保存'),
        null,{timeout:10000});
      const afterUpdate=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(afterUpdate.layers[2].name,'画面で追加した補正');
      assert.equal(afterUpdate.layers[2].start_frame,24);
      assert.equal(afterUpdate.layers[2].end_frame,72);
      await page.locator('#v146-fk-layer-delete').click();
      await page.waitForFunction(()=>document.querySelector('#v146-fk-layer-select')?.options.length===3,
        null,{timeout:10000});
      const afterDelete=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.equal(afterDelete.layers.length,2);
      await page.evaluate(()=>window.BAIStudioTimeline.seek(7,'solo-ui'));
      const shown=()=>page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,['頭']),instanceId);
      const combinedPose=await shown();
      await page.locator('#v146-fk-layer-select').selectOption(saved.layers[0].id);
      await page.locator('#v148-fk-solo').check();
      await page.locator('#v106-fk-layer-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('レイヤーを保存'));
      const firstSolo=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.deepEqual(firstSolo.layers.map(layer=>Boolean(layer.solo)),[true,false]);
      const firstPose=await shown();
      assert.ok(Math.abs(firstPose.bones['頭'].position[0]-combinedPose.bones['頭'].position[0])>0.005);
      const soloCandidate=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:firstSolo.revision,instance_id:instanceId,
          clip_id:placed.clip.id,mode:'interval'})}));
      assert.deepEqual(soloCandidate.sampling_report.intervals,[[90,150]]);
      await page.locator('#v146-fk-layer-select').selectOption(secondId);
      await page.locator('#v148-fk-solo').check();
      await page.locator('#v106-fk-layer-save').click();
      await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('レイヤーを保存'));
      const secondSolo=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${projectId}`));
      assert.deepEqual(secondSolo.layers.map(layer=>Boolean(layer.solo)),[false,true]);
      const secondPose=await shown();
      assert.ok(Math.abs(secondPose.bones['頭'].position[0]-combinedPose.bones['頭'].position[0])<0.001);
      assert.equal(digest(path.join(server.dataDir,'mmd','vmd',syntheticName)),hash(source));
      assert.deepEqual([digest(modelPath),digest(originalVmdPath)],originals);
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
