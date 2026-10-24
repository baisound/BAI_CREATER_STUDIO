'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const sourceRoot=process.env.BAI_REAL_MMD_DATA;
const modelName='avatar-front-garment-v04.pmx';
const originalName='狐面物理確認用_頭振り_F000-0300.vmd';
const modelPath=sourceRoot&&path.join(sourceRoot,'mmd','B',modelName);
const originalPath=sourceRoot&&path.join(sourceRoot,'mmd','vmd',originalName);
const available=modelPath&&originalPath&&fs.existsSync(modelPath)&&fs.existsSync(originalPath);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function ok(reply){const body=await reply.text();assert.equal(reply.status,200,body);return JSON.parse(body);}

function staticHeadVmd(original){
  const count=original.readUInt32LE(50),suffix=original.subarray(54+count*111);
  const bone=original.subarray(54,69),interpolation=original.subarray(54+47,54+111);
  const output=Buffer.alloc(54+4*111+suffix.length);
  original.copy(output,0,0,50);output.writeUInt32LE(4,50);
  for(const [index,frame] of [0,90,240,300].entries()){
    const offset=54+index*111;
    bone.copy(output,offset);output.writeUInt32LE(frame,offset+15);
    output.writeFloatLE(1,offset+15+4+6*4);
    interpolation.copy(output,offset+47);
  }
  suffix.copy(output,54+4*111);
  return output;
}

for(const variant of ['static','moving'])test(variant==='static'?
  'default dense VMD validates the static source through its PMX tail':
  'default dense VMD rejects the moving source at the Three.js boundary preflight',
  {skip:!available&&'BAI_REAL_MMD_DATA に別PMXとVMDがありません',timeout:240000},async()=>{
    const originals=[digest(modelPath),digest(originalPath)];
    const name=`MOTION010-full-${variant}-source.vmd`;
    const source=variant==='static'?staticHeadVmd(fs.readFileSync(originalPath)):
      fs.readFileSync(originalPath);
    const metadata=JSON.parse(fs.readFileSync(path.join(sourceRoot,'mmd_assets.json'),'utf8'));
    const entries=metadata.B.filter(row=>row.name===modelName||row.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:[],B:entries,vmd:[{name,size:source.length}]})};
    for(const entry of entries)seed[`mmd/B/${entry.name}`]=fs.readFileSync(
      path.join(sourceRoot,'mmd','B',...entry.name.split('/')));
    seed[`mmd/vmd/${name}`]=source;
    const server=await harness.startServer({port:variant==='static'?8907:8908,seed});
    let browser,page;
    try{
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'MOTION010 全フレーム長尺元VMD',kind:'empty'})}));
      const projectId=project.project.id,fps=30;
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
          project_id:projectId,asset_id:`mmd:vmd:${name}`,
          track:'motion',start:0,duration:5,revision:0})}));
      await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,clip_id:placed.clip.id,revision:placed.revision,
          instance_id:instanceId})}));
      const saved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:0,action:'set',instance_id:instanceId,
          clip_id:placed.clip.id,key:{frame:60,bone:'頭',position:[0.01,0,0],
            rotation:[0,0,0,1]}})}));
      const reply=await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,revision:saved.revision,
          instance_id:instanceId,clip_id:placed.clip.id})});
      if(variant==='moving'){
        assert.equal(reply.status,422);
        assert.match(await reply.text(),/three_boundary_worst_angle_vmd_frame.*120/);
        const arrangement=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${projectId}`));
        assert.equal(arrangement.clips[0].asset_id,`mmd:vmd:${name}`);
        assert.deepEqual([digest(modelPath),digest(originalPath)],originals);
        return;
      }
      const candidate=await ok(reply);
      assert.equal(candidate.export_mode,'whole');
      assert.equal(candidate.sampling_report.mode,'whole');
      assert.equal(candidate.sampling_report.vmd_frame_span,301);
      assert.equal(candidate.sampling_report.clip_end_vmd_frame,150);
      assert.equal(candidate.sampling_report.checked_source_tail_vmd_frames,151);
      const output=Buffer.from(await (await fetch(server.base+candidate.download_url)).arrayBuffer());
      const count=output.readUInt32LE(50),sourceCount=source.readUInt32LE(50),frames=new Set();
      let tailRecord;
      for(let i=0;i<count;i++){
        const record=output.subarray(54+i*111,54+(i+1)*111);
        const frame=record.readUInt32LE(15);
        frames.add(frame);if(frame===300)tailRecord=record;
      }
      assert.deepEqual(frames,new Set(Array.from({length:301},(_,i)=>i)));
      assert.deepEqual(output.subarray(54+count*111),source.subarray(54+sourceCount*111));
      assert.deepEqual(tailRecord,source.subarray(54+(sourceCount-1)*111,54+sourceCount*111));

      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(projectId);
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.locator('#v70sceneOpen').click();
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
        null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      assert.equal(await page.locator('#v143-vmd-export-range').inputValue(),'whole');
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
      console.log(`dense ${variant} source tail PMX round trip`,JSON.stringify(report));
      assert.equal(report.passed,true,JSON.stringify(report));
      assert.equal(report.checkedFrames,150);
      assert.equal(report.checkedVmdFrames,301);
      assert.ok(report.bones>200);
      const plan=await ok(await fetch(`${server.base}/api/studio/v05/scene/multi-motion-plan?id=${projectId}`));
      const adoption=await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate/adopt`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,candidate_id:candidate.candidate_id,
          edit_revision:saved.revision,arrangement_revision:plan.arrangement_revision,
          scene_revision:plan.scene_revision,report})});
      const adopted=await ok(adoption);
      const arrangement=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${projectId}`));
      assert.equal(arrangement.clips[0].asset_id,adopted.asset_id);
      await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate/restore`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:projectId,clip_id:placed.clip.id,
          arrangement_revision:arrangement.revision})}));
      assert.deepEqual([digest(modelPath),digest(originalPath)],originals);
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
