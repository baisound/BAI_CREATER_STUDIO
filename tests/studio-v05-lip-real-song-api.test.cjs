'use strict';
// Owner song inputs are copied into an isolated server; no source asset is modified.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const dataRoot=process.env.BAI_REAL_MMD_DATA;
const srtPath=process.env.BAI_REAL_LIP_SRT;
const vmdPath=process.env.BAI_REAL_LIP_VMD;
const modelName='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const modelPath=dataRoot&&path.join(dataRoot,'mmd','A',modelName);
const available=[modelPath,srtPath,vmdPath].every(p=>p&&fs.existsSync(p));
async function json(response,status=200){const raw=await response.text();assert.equal(response.status,status,raw);return JSON.parse(raw);}
const post=(server,route,body)=>fetch(server.base+route,{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('real vocal SRT stays unconfirmed while matching long VMD is assigned to an isolated PMX',
  {skip:!available&&'BAI_REAL_MMD_DATA, BAI_REAL_LIP_SRT, BAI_REAL_LIP_VMD が必要'},async()=>{
  const model=fs.readFileSync(modelPath),srt=fs.readFileSync(srtPath),vmd=fs.readFileSync(vmdPath);
  const original={model:sha(model),srt:sha(srt),vmd:sha(vmd)};
  const vmdName=path.basename(vmdPath);
  const server=await harness.startServer({port:8960,seed:{
    'mmd_assets.json':JSON.stringify({A:[{name:modelName,size:model.length}],B:[],
      vmd:[{name:vmdName,size:vmd.length}]}),
    [`mmd/A/${modelName}`]:model,[`mmd/vmd/${vmdName}`]:vmd}});
  try{
    const projectId=(await json(await post(server,'/api/studio/v05/projects',
      {name:'実曲LIP入力隔離',kind:'empty'}))).project.id;
    const assetId=`mmd:A:${modelName}`;
    const scene=await json(await post(server,'/api/studio/v05/scene/instances',{
      project_id:projectId,action:'add',revision:0,asset_id:assetId,
      transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}}));
    const instanceId=scene.instances[0].id;
    const analysis=await json(await fetch(`${server.base}/api/studio/v05/pmx/morph-analysis?asset_id=${encodeURIComponent(assetId)}`));
    const entry={morph_id:analysis.morphs.find(row=>row.name==='あ').id,morph_name:'あ',weight:.8};
    const map=await json(await post(server,'/api/studio/v05/pmx/morph-map',{
      project_id:projectId,revision:0,action:'set',model_asset_id:assetId,
      model_hash:analysis.modelHash,analysis_hash:analysis.analysisHash,
      entries:{A:entry,I:entry,U:entry,E:entry,O:entry,Closed:null,Rest:null},confirmed:true}));
    const query=new URLSearchParams({project_id:projectId,revision:'0',name:path.basename(srtPath),encoding:'utf-8-bom'});
    const sourceState=await json(await fetch(`${server.base}/api/studio/v05/srt/import?${query}`,{
      method:'POST',headers:{'Content-Type':'application/octet-stream'},body:srt}));
    assert.equal(sourceState.sources.length,1);
    const source=sourceState.sources[0];
    assert.equal(source.entries.length,54);
    assert.equal(source.entries.at(-1).endMs,228365);
    assert.equal(source.sha256,original.srt);
    assert.equal(source.sourceStatus,'valid');
    const persisted=await json(await fetch(`${server.base}/api/studio/v05/srt/sources?project_id=${projectId}`));
    assert.equal(persisted.sources[0].sha256,original.srt);
    assert.equal(persisted.sources[0].entries.length,54);
    const candidate=await json(await fetch(`${server.base}/api/studio/v05/lip/candidates?`+
      new URLSearchParams({project_id:projectId,source_id:source.id,srt_index:'1'})));
    assert.equal(candidate.status,'unresolved');
    assert.deepEqual(candidate.segments,[]);
    const readings=await json(await fetch(`${server.base}/api/studio/v05/lip/readings?project_id=${projectId}`));
    const drafts=await json(await fetch(`${server.base}/api/studio/v05/lip/drafts?project_id=${projectId}`));
    const rejected=await json(await post(server,'/api/studio/v05/lip/vmd-candidate',{
      project_id:projectId,source_id:source.id,model_asset_id:assetId,
      source_revision:sourceState.revision,reading_revision:readings.revision,
      draft_revision:drafts.revision,map_revision:map.revision,dry_run:true}),422);
    assert.equal(rejected.issues.length,54,JSON.stringify(rejected.issues.slice(0,5)));
    assert.ok(rejected.issues.every(row=>row.code==='reading_missing'));
    const placed=await json(await post(server,'/api/studio/v05/arrangement/place',{
      project_id:projectId,asset_id:`mmd:vmd:${vmdName}`,track:'motion',start:0,duration:230,revision:0}));
    await json(await post(server,'/api/studio/v05/scene/motion-target',{
      project_id:projectId,clip_id:placed.clip.id,revision:placed.revision,instance_id:instanceId}));
    const plan=await json(await fetch(`${server.base}/api/studio/v05/scene/multi-motion-plan?id=${projectId}`));
    assert.equal(plan.rows.length,1);
    assert.equal(plan.rows[0].status,'ready');
    assert.equal(plan.rows[0].motion_format,'VMD');
    assert.equal(sha(fs.readFileSync(path.join(server.dataDir,'mmd','A',modelName))),original.model);
    assert.equal(sha(fs.readFileSync(path.join(server.dataDir,'mmd','vmd',vmdName))),original.vmd);
    assert.equal(sha(fs.readFileSync(path.join(server.dataDir,'studio_v05_srt_sources',projectId,
      'sources',original.srt+'.srt'))),original.srt);
    console.log(JSON.stringify({sourceHash:original.srt,vmdHash:original.vmd,
      modelHash:original.model,cues:source.entries.length,lastMs:source.entries.at(-1).endMs,
      motionStatus:plan.rows[0].status,unconfirmedIssues:rejected.issues.length}));
  }finally{
    await server.stop();
    assert.equal(sha(fs.readFileSync(modelPath)),original.model);
    assert.equal(sha(fs.readFileSync(srtPath)),original.srt);
    assert.equal(sha(fs.readFileSync(vmdPath)),original.vmd);
  }
});
