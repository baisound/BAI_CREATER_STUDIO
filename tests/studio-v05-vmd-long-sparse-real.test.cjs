'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const root=process.env.BAI_REAL_MMD_DATA;
const primaryModel='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motionName='神っぽいな.vmd';
const motionPath=root&&path.join(root,'mmd','vmd',motionName);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function ok(reply){const body=await reply.text();assert.equal(reply.status,200,body);return JSON.parse(body);}

for(const variant of [
  {duration:100,bone:'頭',angle:12,port:8912},
  {duration:204,bone:'頭',angle:12,port:8913,ui:true},
  {duration:204,bone:'髪_16-03',angle:12,begin:5338,end:5464,port:8914},
  {duration:204,bone:'頭',angle:8,begin:5338,end:5666,port:8915},
  {duration:204,bone:'頭',angle:8,begin:5334,end:5666,
    fadeIn:4,fadeOut:4,port:8916},
  {duration:204,bone:'頭',angle:8,begin:5334,end:5666,
    fadeIn:4,fadeOut:4,category:'B',model:'avatar-front-garment-v04.pmx',
    bones:246,port:8917},
  {duration:204,bone:'頭',angle:12,fps:24,port:8918},
  {duration:204,bone:'頭',angle:12,fps:24000/1001,port:8919},
])test(
  `real moving 203s VMD sparse ${variant.begin?`bounded ${variant.bone} fade ${variant.fadeIn||0}/${variant.fadeOut||0}`:'constant head'} candidate matches ${variant.category||'A'} PMX for ${variant.duration}s at ${variant.fps||60}fps`,
  {skip:!(root&&fs.existsSync(path.join(root,'mmd',variant.category||'A',variant.model||primaryModel))&&
    motionPath&&fs.existsSync(motionPath))&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:360000},async()=>{
    const {duration}=variant,interval=Boolean(variant.begin),fps=variant.fps||60;
    const category=variant.category||'A',modelName=variant.model||primaryModel;
    const modelPath=path.join(root,'mmd',category,modelName);
    const originals=[digest(modelPath),digest(motionPath)];
    const metadata=JSON.parse(fs.readFileSync(path.join(root,'mmd_assets.json'),'utf8'));
    const entries=metadata[category].filter(entry=>entry.name===modelName||entry.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:category==='A'?entries:[],
      B:category==='B'?entries:[],vmd:[
      {name:motionName,size:fs.statSync(motionPath).size}]}),
      'camera_project.json':JSON.stringify({schema:1,fps:30,duration:12000,keys:[
        {frame:0,position:[0,1.6,5],target:[0,1,0],fov:40}]})};
    for(const entry of entries)seed[`mmd/${category}/${entry.name}`]=fs.readFileSync(
      path.join(root,'mmd',category,...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    const server=await harness.startServer({port:variant.port,seed});
    let browser,page;
    try{
      const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:`MOTION010 長尺${interval?'区間':'一定'}補正候補実試験`,kind:'empty'})}));
      const id=project.project.id;
      if(fps!==60)await ok(await fetch(`${server.base}/api/studio/v05/project/fps`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:id,fps})}));
      const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,action:'add',revision:0,asset_id:`mmd:${category}:${modelName}`,
          transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
      const instance=scene.instances[0].id;
      const placed=await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,asset_id:`mmd:vmd:${motionName}`,track:'motion',start:0,
          duration,revision:0})}));
      await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,clip_id:placed.clip.id,revision:placed.revision,instance_id:instance})}));
      const angle=variant.angle*Math.PI/180;
      const saved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,revision:0,action:'set',instance_id:instance,clip_id:placed.clip.id,
          key:{frame:Math.round(90*fps),bone:variant.bone,position:[0.15,0,0],
            rotation:[0,Math.sin(angle/2),0,Math.cos(angle/2)]}})}));
      assert.equal(saved.revision,1);
      const edits=interval?await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,revision:saved.revision,action:'layer-update',instance_id:instance,
          clip_id:placed.clip.id,layer_id:saved.layers[0].id,settings:{
            start_frame:variant.begin,end_frame:variant.end,
            fade_in_frames:variant.fadeIn||0,
            fade_out_frames:variant.fadeOut||0}})})):saved;
      const candidate=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project_id:id,revision:edits.revision,instance_id:instance,
          clip_id:placed.clip.id,mode:'legacy_sparse'})}));
      assert.equal(candidate.status,'candidate_requires_real_pmx_validation');
      assert.equal(candidate.export_mode,'legacy_sparse');
      assert.equal(candidate.source_motion_sha256,originals[1]);
      assert.equal(candidate.model_sha256,originals[0]);
      if(interval){
        assert.equal(candidate.replaced_bone_keys>0,variant.bone==='頭');
        assert.ok(candidate.added_bone_keys>0);
        assert.equal(candidate.sampling_report.checked_project_frames,
          Math.ceil(duration*fps-1e-7));
        assert.ok(candidate.sampling_report.max_position_error<1e-3);
        assert.ok(candidate.sampling_report.max_angle_error_degrees<0.01);
      }else{
        assert.ok(candidate.replaced_bone_keys>0);
        assert.equal(candidate.added_bone_keys,0);
      }
      assert.equal(candidate.registered_asset,false);
      assert.equal(candidate.placed_in_project,false);
      const downloaded=Buffer.from(await (await fetch(server.base+candidate.download_url)).arrayBuffer());
      assert.equal(crypto.createHash('sha256').update(downloaded).digest('hex'),candidate.output_sha256);
      assert.deepEqual(downloaded.subarray(-candidate.suffix_bytes),
        fs.readFileSync(motionPath).subarray(-candidate.suffix_bytes));
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      const report=await page.evaluate(async({id,instance,candidate,fps})=>{
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
          candidate,fps,isCurrent:()=>true});
      },{id,instance,candidate,fps});
      console.log(JSON.stringify({longSparseCandidate:report}));
      assert.equal(report.checkedFrames,Math.ceil(duration*fps-1e-7));
      assert.equal(report.checkedVmdFrames,duration*30+(interval?1:0));
      assert.equal(report.bones,variant.bones||201);
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
      if(variant.ui){
        await page.reload();
        await page.locator('#v06project').selectOption(id);
        await page.locator('#nav [data-workspace="edit"]').click();
        await page.locator('#v70sceneOpen').click();
        await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&
          window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
          null,{timeout:120000});
        await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
        await page.locator('#v106-fk-frame').fill('5400');
        await page.locator('#v106-fk-frame').dispatchEvent('change');
        await page.locator('#v106-fk-bone').selectOption('頭');
        await page.evaluate(()=>window.BAIStudioMediaPreviewV68.seek(5400));
        await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68?.status().frame===5400);
        await page.locator('#v106-fk-y').fill('10');
        await page.locator('#v112-fk-position-x').fill('0.12');
        await page.locator('#v106-fk-save').click();
        await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('保存しました'));
        const uiSaved=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`));
        assert.equal(uiSaved.revision,edits.revision+1);
        assert.equal(uiSaved.layers[0].keys[0].frame,5400);
        assert.deepEqual(uiSaved.layers[0].keys[0].position,[0.12,0,0]);
        await page.locator('#v143-vmd-export-range').selectOption('legacy_sparse');
        assert.equal(await page.locator('#v116-vmd-candidate-create').isDisabled(),false);
        await page.locator('#v116-vmd-candidate-create').click();
        await page.locator('#v116-vmd-candidate-download').waitFor({state:'visible'});
        assert.equal(await page.locator('#v141-vmd-candidate-adopt').isDisabled(),true);
        await page.locator('#v120-vmd-candidate-validate').click();
        await page.waitForFunction(()=>!document.querySelector('#v141-vmd-candidate-adopt')?.disabled,
          null,{timeout:180000});
        assert.match(await page.locator('#v116-vmd-candidate-status').textContent(),
          /作品12240F＋VMD6120F × 201骨/);
        await page.locator('#v141-vmd-candidate-adopt').click();
        await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-status')?.textContent?.includes('配置しました'),
          null,{timeout:120000});
        const uiPlaced=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
        assert.match(uiPlaced.clips.find(item=>item.id===placed.clip.id).asset_id,
          /^mmd:vmd:MOTION010-[0-9a-f-]+\.vmd$/);
        assert.equal(await page.locator('#v141-vmd-candidate-restore').isHidden(),false);
        await page.locator('#v141-vmd-candidate-restore').click();
        await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-status')?.textContent?.includes('元VMDを同じクリップへ戻しました'),
          null,{timeout:120000});
        const uiRestored=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
        assert.equal(uiRestored.clips.find(item=>item.id===placed.clip.id).asset_id,
          `mmd:vmd:${motionName}`);
        await page.locator('#v106-fk-start').fill('5338');
        await page.locator('#v106-fk-end').fill('5464');
        await page.locator('#v106-fk-fade-in').fill('2');
        await page.locator('#v106-fk-fade-out').fill('2');
        await page.locator('#v106-fk-layer-save').click();
        await page.waitForFunction(()=>document.querySelector('#v106-fk-status')?.textContent?.includes('FKレイヤーを保存しました'));
        const intervalEdits=await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`));
        assert.equal(intervalEdits.revision,uiSaved.revision+1);
        assert.equal(intervalEdits.layers[0].start_frame,5338);
        assert.equal(intervalEdits.layers[0].end_frame,5464);
        const candidateFolder=path.join(server.dataDir,'studio_v05_vmd_candidates',id);
        const beforeReject=fs.readdirSync(candidateFolder).sort().map(name=>[name,digest(path.join(candidateFolder,name))]);
        await page.locator('#v143-vmd-export-range').selectOption('interval');
        harness.expectErrors(page,[/Failed to load resource: the server responded with a status of 422/]);
        await page.locator('#v116-vmd-candidate-create').click();
        await page.waitForFunction(()=>document.querySelector('#v116-vmd-candidate-status')?.textContent?.startsWith('候補作成不可:'),
          null,{timeout:120000});
        assert.match(await page.locator('#v116-vmd-candidate-status').textContent(),
          /Interval-only VMD pose error exceeds limit/);
        assert.equal(await page.locator('#v116-vmd-candidate-download').isHidden(),true);
        assert.equal(await page.locator('#v141-vmd-candidate-adopt').isDisabled(),true);
        assert.deepEqual(fs.readdirSync(candidateFolder).sort().map(name=>
          [name,digest(path.join(candidateFolder,name))]),beforeReject);
        assert.equal((await ok(await fetch(`${server.base}/api/studio/v05/motion-edits?id=${id}`))).revision,
          intervalEdits.revision);
        const afterReject=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
        assert.equal(afterReject.clips.find(item=>item.id===placed.clip.id).asset_id,
          `mmd:vmd:${motionName}`);
        assert.equal(digest(modelPath),originals[0]);
        assert.equal(digest(motionPath),originals[1]);
      }
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
