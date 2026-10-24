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
const modelPath=sourceRoot&&path.join(sourceRoot,'mmd','A',modelName);
const motionPath=sourceRoot&&path.join(sourceRoot,'mmd','vmd',motionName);
const exists=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function ok(response){const body=await response.text();assert.equal(response.status,200,body);return JSON.parse(body);}

test('constant FK layer and distinct VMD agree on real PMX at every VMD frame',
  {skip:!exists&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:180000},async()=>{
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
    const metadata=JSON.parse(fs.readFileSync(path.join(sourceRoot,'mmd_assets.json'),'utf8'));
    const entries=metadata.A.filter(e=>e.name===modelName||e.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[
      {name:motionName,size:fs.statSync(motionPath).size},
      {name:candidateName,size:baked.stdout.length}]})};
    for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(path.join(sourceRoot,'mmd','A',...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`]=fs.readFileSync(motionPath);
    seed[`mmd/vmd/${candidateName}`]=baked.stdout;
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
      for(const row of [original,candidate])await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          clip_id:row.clip.id,revision:row===original?candidate.revision:candidate.revision+1,
          instance_id:instanceId})}));
      await ok(await fetch(`${server.base}/api/studio/v05/motion-edits`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,revision:0,
          action:'set',instance_id:instanceId,clip_id:original.clip.id,key:savedKey})}));
      const candidateResponse=await ok(await fetch(`${server.base}/api/studio/v05/motion/vmd-candidate`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
          revision:1,instance_id:instanceId,clip_id:original.clip.id})}));
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
        window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===2,
        null,{timeout:120000});
      await page.locator('#v106-fk-edit').evaluate(el=>el.open=true);
      await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'vmd-candidate-ui'));
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
          revision:2,instance_id:instanceId,clip_id:original.clip.id})});
      assert.equal(varying.status,422,'time-varying corrections must not be silently baked as constant');
      assert.deepEqual([digest(modelPath),digest(motionPath)],originals);
      assert.equal(baked.stdout.slice(-29).toString('hex'),fs.readFileSync(motionPath).slice(-29).toString('hex'));
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
