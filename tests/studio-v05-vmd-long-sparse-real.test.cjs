'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const root=process.env.BAI_REAL_MMD_DATA;
const modelName='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motionName='神っぽいな.vmd';
const modelPath=root&&path.join(root,'mmd','A',modelName);
const motionPath=root&&path.join(root,'mmd','vmd',motionName);
const available=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function ok(reply){const body=await reply.text();assert.equal(reply.status,200,body);return JSON.parse(body);}

for(const duration of [100,204])test(`real moving 203s VMD sparse constant FK candidate matches PMX for ${duration}s`,
  {skip:!available&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:360000},async()=>{
    const originals=[digest(modelPath),digest(motionPath)];
    const metadata=JSON.parse(fs.readFileSync(path.join(root,'mmd_assets.json'),'utf8'));
    const entries=metadata.A.filter(entry=>entry.name===modelName||entry.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[
      {name:motionName,size:fs.statSync(motionPath).size}]})};
    for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(
      path.join(root,'mmd','A',...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    const server=await harness.startServer({port:duration===100?8912:8913,seed});
    let browser,page;
    try{
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'MOTION010 長尺一定補正候補実試験',kind:'empty'})}));
      const id=project.project.id;
      const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,action:'add',revision:0,asset_id:`mmd:A:${modelName}`,
          transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
      const instance=scene.instances[0].id;
      const placed=await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,asset_id:`mmd:vmd:${motionName}`,track:'motion',start:0,
          duration,revision:0})}));
      await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,clip_id:placed.clip.id,revision:placed.revision,instance_id:instance})}));
      const angle=12*Math.PI/180;
      const saved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,revision:0,action:'set',instance_id:instance,clip_id:placed.clip.id,
          key:{frame:5400,bone:'頭',position:[0.15,0,0],
            rotation:[0,Math.sin(angle/2),0,Math.cos(angle/2)]}})}));
      assert.equal(saved.revision,1);
      const candidate=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,revision:saved.revision,instance_id:instance,
          clip_id:placed.clip.id,mode:'legacy_sparse'})}));
      assert.equal(candidate.status,'candidate_requires_real_pmx_validation');
      assert.equal(candidate.export_mode,'legacy_sparse');
      assert.equal(candidate.source_motion_sha256,originals[1]);
      assert.equal(candidate.model_sha256,originals[0]);
      assert.ok(candidate.replaced_bone_keys>0);
      assert.equal(candidate.added_bone_keys,0);
      assert.equal(candidate.registered_asset,false);
      assert.equal(candidate.placed_in_project,false);
      const downloaded=Buffer.from(await (await fetch(server.base+candidate.download_url)).arrayBuffer());
      assert.equal(crypto.createHash('sha256').update(downloaded).digest('hex'),candidate.output_sha256);
      assert.deepEqual(downloaded.subarray(-candidate.suffix_bytes),
        fs.readFileSync(motionPath).subarray(-candidate.suffix_bytes));
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      const report=await page.evaluate(async({id,instance,candidate})=>{
        const {loadLibs}=await import('/studio/js/viewport/model-loader.js');
        const {validatePmxVmdCandidate}=await import('/studio/v05/js/pmx-vmd-candidate-validation-v120.js');
        const [scene,plan,edits]=await Promise.all([
          fetch(`/api/studio/v05/scene/instances?id=${id}`).then(r=>r.json()),
          fetch(`/api/studio/v05/scene/multi-motion-plan?id=${id}`).then(r=>r.json()),
          fetch(`/api/studio/v05/motion-edits?id=${id}`).then(r=>r.json())]);
        const row=plan.rows.find(item=>item.clip_id===candidate.clip_id);
        const model=scene.instances.find(item=>item.id===instance);
        return validatePmxVmdCandidate({libs:await loadLibs(),modelAsset:model.asset,
          motionAsset:row.motion_asset,row,layers:edits.layers.filter(item=>
            item.instance_id===instance&&item.clip_id===candidate.clip_id),
          candidate,fps:60,isCurrent:()=>true});
      },{id,instance,candidate});
      console.log(JSON.stringify({longSparseCandidate:report}));
      assert.equal(report.checkedFrames,duration*60);
      assert.equal(report.checkedVmdFrames,duration*30);
      assert.equal(report.bones,201);
      assert.equal(report.passed,true,JSON.stringify(report));
      const plan=await ok(await fetch(`${server.base}/api/studio/v05/scene/multi-motion-plan?id=${id}`));
      const adopted=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate/adopt`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,candidate_id:candidate.candidate_id,
          edit_revision:candidate.revision,arrangement_revision:plan.arrangement_revision,
          scene_revision:plan.scene_revision,report})}));
      assert.match(adopted.asset_id,/^mmd:vmd:MOTION010-[0-9a-f-]+\.vmd$/);
      const placement=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
      const current=placement.clips.find(row=>row.id===placed.clip.id);
      assert.equal(current.asset_id,adopted.asset_id);
      assert.equal(current.start,0);
      assert.equal(current.duration,duration);
      assert.equal(current.motion010_source_asset_id,`mmd:vmd:${motionName}`);
      assert.equal(digest(path.join(server.dataDir,'mmd','vmd',
        adopted.asset_id.slice('mmd:vmd:'.length))),candidate.output_sha256);
      const restored=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate/restore`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,clip_id:placed.clip.id,arrangement_revision:placement.revision})}));
      assert.equal(restored.asset_id,`mmd:vmd:${motionName}`);
      const afterRestore=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
      const originalClip=afterRestore.clips.find(row=>row.id===placed.clip.id);
      assert.equal(originalClip.asset_id,`mmd:vmd:${motionName}`);
      assert.equal(originalClip.start,0);
      assert.equal(originalClip.duration,duration);
      assert.equal(digest(modelPath),originals[0]);
      assert.equal(digest(motionPath),originals[1]);
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
