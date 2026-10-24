const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const data=process.env.BAI_REAL_MMD_DATA;
const blender=process.env.MIXAMO_BLENDER;
const enabled=!!data&&!!blender;
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function json(response){const body=await response.json();assert.equal(response.ok,true,JSON.stringify(body));return body}
function alterGlb(input,change){
 const copy=Buffer.from(input),length=copy.readUInt32LE(12);
 const doc=JSON.parse(copy.subarray(20,20+length).toString('utf8'));
 change(doc);
 const edited=Buffer.from(JSON.stringify(doc),'utf8');
 assert.ok(edited.length<=length);
 copy.fill(0x20,20,20+length);edited.copy(copy,20);
 return copy;
}
function changedMotionSample(input){
 const copy=Buffer.from(input),jsonLength=copy.readUInt32LE(12);
 const doc=JSON.parse(copy.subarray(20,20+jsonLength).toString('utf8'));
 const animation=doc.animations[0],sampler=animation.samplers[animation.channels[0].sampler];
 const accessor=doc.accessors[sampler.output],view=doc.bufferViews[accessor.bufferView];
 const offset=20+jsonLength+8+(view.byteOffset||0)+(accessor.byteOffset||0);
 const old=copy.readFloatLE(offset);copy.writeFloatLE(old+0.001,offset);
 return copy;
}

test('実GLBを実PMX向けVMDへ別名変換し、同じ作品に配置・再読込する',
 {skip:enabled?false:'BAI_REAL_MMD_DATA と MIXAMO_BLENDER が必要',timeout:720000},async()=>{
 const source=path.join(data,'integrated_v02','assets','cef762b38713abf09354.glb');
 const modelName=fs.readdirSync(path.join(data,'mmd','A')).find(x=>x.endsWith('.pmx'));
 assert.ok(modelName);
 const pmx=path.join(data,'mmd','A',modelName);
 const before={source:sha(source),pmx:sha(pmx)};
 const all=JSON.parse(fs.readFileSync(path.join(data,'mmd_assets.json'),'utf8'));
 const entries=all.A.filter(x=>x.name===modelName||x.name.startsWith('tex/'));
 const glb=fs.readFileSync(source);
 const sameSkeleton=changedMotionSample(glb);
 assert.notEqual(crypto.createHash('sha256').update(sameSkeleton).digest('hex'),before.source);
 const staticGlb=alterGlb(glb,doc=>{doc.animations=[]});
 const shortGlb=alterGlb(glb,doc=>{doc.skins[0].joints=doc.skins[0].joints.slice(0,10)});
 const seed={
  'integrated_v02/catalog.json':JSON.stringify({schema:1,motions:[],models:[]}),
  'integrated_v02/user_assets.json':JSON.stringify([
   {id:'real-motion',name:'実GLBダンス',filename:path.basename(source),kind:'motion',bytes:glb.length},
   {id:'same-skeleton',name:'同じ骨構成のGLB',filename:'same-skeleton.glb',kind:'motion',bytes:sameSkeleton.length},
   {id:'static-motion',name:'無動作GLB',filename:'static.glb',kind:'motion',bytes:staticGlb.length},
   {id:'short-motion',name:'骨不足GLB',filename:'short.glb',kind:'motion',bytes:shortGlb.length}]),
  'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[]})
 };
 seed['integrated_v02/assets/'+path.basename(source)]=glb;
 seed['integrated_v02/assets/same-skeleton.glb']=sameSkeleton;
 seed['integrated_v02/assets/static.glb']=staticGlb;
 seed['integrated_v02/assets/short.glb']=shortGlb;
 for(const entry of entries)seed['mmd/A/'+entry.name]=fs.readFileSync(path.join(data,'mmd','A',...entry.name.split('/')));
 const server=await harness.startServer({port:8897,seed});let browser,page;
 try{
  const project=await json(await fetch(server.base+'/api/studio/v05/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'GLB VMD実変換検査',kind:'empty'})}));
  const projectId=project.project.id;
  const scene=await json(await fetch(server.base+'/api/studio/v05/scene/instances',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,action:'add',revision:0,asset_id:'mmd:A:'+modelName,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
  const rejected=await fetch(server.base+'/api/studio/v05/motion/glb-vmd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,source_asset_id:'integrated:not-registered.glb',instance_id:scene.instances[0].id})});
  assert.equal(rejected.status,400);
  for(const filename of ['static.glb','short.glb']){
   const invalid=await fetch(server.base+'/api/studio/v05/motion/glb-vmd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,source_asset_id:'integrated:'+filename,instance_id:scene.instances[0].id})});
   assert.equal(invalid.status,400,filename);
  }
  const vmdFolder=path.join(server.dataDir,'mmd','vmd');
  assert.equal(fs.existsSync(vmdFolder)?fs.readdirSync(vmdFolder).length:0,0);
  browser=await server.launchBrowser();page=await server.newPage(browser);
  await page.goto(server.base+'/studio/v05/index.html');
  await page.locator('#nav [data-workspace="edit"]').click();
  await page.locator('#v06project').selectOption(projectId);
  await page.locator('#v102-glb-vmd > summary').click();
  await page.waitForFunction(()=>document.querySelector('#v102-glb-vmd [data-source]')?.options.length>0&&document.querySelector('#v102-glb-vmd [data-target]')?.options.length>0&&document.querySelector('#v102-glb-vmd [data-convert]')?.disabled===false,null,{timeout:30000});
  assert.equal(await page.locator('#v102-glb-vmd [data-source]').inputValue(),'integrated:'+path.basename(source));
  assert.equal(await page.locator('#v102-glb-vmd [data-target]').inputValue(),scene.instances[0].id);
  const sourceId='integrated:'+path.basename(source),targetId='mmd:A:'+modelName;
  await page.locator('#v102-glb-vmd [data-map] > summary').click();
  const finger=page.locator('#v102-glb-vmd [data-map-rows] select[data-bone="左人指１"]');
  assert.equal(await finger.inputValue(),'LeftHandIndex1');
  await finger.selectOption('LeftHandIndex2');
  await page.locator('#v102-glb-vmd [data-map-save]').click();
  await page.waitForFunction(()=>document.querySelector('#v102-glb-vmd [data-map-status]')?.textContent.includes('保存版 1'),null,{timeout:15000});
  const profile=await json(await fetch(server.base+'/api/studio/v05/motion/glb-vmd/map?source_id='+encodeURIComponent(sourceId)+'&target_id='+encodeURIComponent(targetId)));
  assert.equal(profile.revision,1);
  assert.equal(profile.overrides['左人指１'],'LeftHandIndex2');
  const reused=await json(await fetch(server.base+'/api/studio/v05/motion/glb-vmd/map?source_id='+encodeURIComponent('integrated:same-skeleton.glb')+'&target_id='+encodeURIComponent(targetId)));
  assert.equal(reused.revision,1);
  assert.equal(reused.profile_key,profile.profile_key);
  const stale=await fetch(server.base+'/api/studio/v05/motion/glb-vmd/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_asset_id:sourceId,target_asset_id:targetId,revision:0,overrides:{}})});
  assert.equal(stale.status,409);
  const unknownBone=await fetch(server.base+'/api/studio/v05/motion/glb-vmd/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_asset_id:sourceId,target_asset_id:targetId,revision:1,overrides:{'左人指１':'NoSuchBone'}})});
  assert.equal(unknownBone.status,400);
  const staleConversion=await fetch(server.base+'/api/studio/v05/motion/glb-vmd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,source_asset_id:sourceId,instance_id:scene.instances[0].id,profile_revision:0})});
  assert.equal(staleConversion.status,409);
  await page.locator('#v102-glb-vmd [data-convert]').click();
  await page.waitForFunction(()=>document.querySelector('#v102-glb-vmd [data-status]')?.textContent.includes('別名VMDを同じ作品へ配置しました'),null,{timeout:650000});
  const status=await page.locator('#v102-glb-vmd [data-status]').textContent();
  const assetId=status.match(/mmd:vmd:glb_v05_[a-f0-9]{32}\.vmd/)?.[0];
  assert.ok(assetId,status);
  const registered=path.join(server.dataDir,'mmd','vmd',assetId.split(':')[2]);
  assert.ok(fs.statSync(registered).size>1000);
  assert.ok(fs.readFileSync(registered).subarray(0,30).toString('ascii').startsWith('Vocaloid Motion Data 0002'));
  const arrangement=await json(await fetch(server.base+'/api/studio/v05/arrangement?id='+encodeURIComponent(projectId)));
  assert.equal(arrangement.clips.length,1);
  assert.equal(arrangement.clips[0].asset_id,assetId);
  assert.equal(arrangement.clips[0].target_scene_instance_id,scene.instances[0].id);
  assert.ok(arrangement.clips[0].duration>59&&arrangement.clips[0].duration<61);
  await page.reload();
  await page.locator('#nav [data-workspace="edit"]').click();
  await page.locator('#v06project').selectOption(projectId);
  await page.locator('#v102-glb-vmd > summary').click();
  await page.waitForFunction(()=>document.querySelector('#v102-glb-vmd [data-map-rows] select[data-bone="左人指１"]')?.value==='LeftHandIndex2',null,{timeout:30000});
  await page.locator('#v70sceneOpen').click();
  await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
  const instanceId=scene.instances[0].id;
  await page.evaluate(()=>window.BAIStudioTimeline.seek(1,'glb-vmd-real-test'));
  const at1=await page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,['センター','上半身','左腕','右腕','左足D','右足D']),instanceId);
  await page.evaluate(()=>window.BAIStudioTimeline.seek(0,'glb-vmd-real-test'));
  const at0=await page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,['センター','上半身','左腕','右腕','左足D','右足D']),instanceId);
  assert.notDeepEqual(at1.bones['左腕'].quaternion,at0.bones['左腕'].quaternion);
  assert.notDeepEqual(at1.bones['右足D'].quaternion,at0.bones['右足D'].quaternion);
  const beforeFoot=await page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,['左つま先','右つま先']),instanceId);
  await page.locator('#v105-foot-qa > summary').click();
  await page.locator('#v105-foot-run').click();
  await page.waitForFunction(()=>document.querySelector('#v105-foot-status')?.textContent.includes('両足補正の競合'),null,{timeout:120000});
  const footReport=JSON.parse(await page.locator('#v105-foot-details').textContent());
  assert.equal(footReport.clipId,arrangement.clips[0].id);
  assert.ok(footReport.samplesPerFoot>=30);
  assert.equal(footReport.groundY,0);
  assert.ok(footReport.heightRange.left[0]<=footReport.heightRange.left[1]);
  assert.equal(footReport.left.modified_source,false);
  assert.equal(footReport.right.modified_source,false);
  const afterFoot=await page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,['左つま先','右つま先']),instanceId);
  assert.deepEqual(afterFoot.bones,beforeFoot.bones);
  await page.evaluate(()=>window.BAIStudioTimeline.seek(30,'glb-vmd-foot-qa-test'));
  const before30=await page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,['左つま先','右つま先']),instanceId);
  assert.notDeepEqual(before30.bones,beforeFoot.bones);
  await page.locator('#v105-foot-run').click();
  await page.waitForFunction(()=>document.querySelector('#v105-foot-status')?.textContent.includes('両足補正の競合'),null,{timeout:120000});
  const footReport30=JSON.parse(await page.locator('#v105-foot-details').textContent());
  assert.ok(Math.abs(footReport30.startFrame-30*footReport30.fps)<=1);
  assert.ok(footReport30.samplesPerFoot>=30);
  assert.ok(footReport30.heightRange.right[0]<=footReport30.heightRange.right[1]);
  assert.equal(footReport30.left.modified_source,false);
  const after30=await page.evaluate(id=>window.BAIStudioMultiScenePreview.poseProbe(id,['左つま先','右つま先']),instanceId);
  assert.deepEqual(after30.bones,before30.bones);
  const entry=JSON.parse(fs.readFileSync(path.join(server.dataDir,'mmd_assets.json'),'utf8')).vmd.find(x=>x.name===path.basename(registered));
  assert.equal(entry.sha256,sha(registered));
  assert.equal(entry.review_status,'needs_visual_validation');
  assert.equal(entry.mapping_revision,1);
  assert.equal(entry.mapping_profile_key,profile.profile_key);
  assert.deepEqual({source:sha(source),pmx:sha(pmx)},before);
  console.log('GLB_VMD_REAL',JSON.stringify({assetId,bytes:fs.statSync(registered).size,source_sha256:before.source,target_sha256:before.pmx,vmd_sha256:entry.sha256,clip_duration:arrangement.clips[0].duration,foot_qa:{at0:{samples:footReport.samplesPerFoot,heightRange:footReport.heightRange,left_contact:footReport.left.contact_intervals.length,right_contact:footReport.right.contact_intervals.length,left_drift:footReport.left.drift_frames.length,right_drift:footReport.right.drift_frames.length,left_penetration:footReport.left.penetrations.length,right_penetration:footReport.right.penetrations.length,conflict:footReport.conflictFrames.length},at30:{samples:footReport30.samplesPerFoot,heightRange:footReport30.heightRange,left_contact:footReport30.left.contact_intervals.length,right_contact:footReport30.right.contact_intervals.length,left_drift:footReport30.left.drift_frames.length,right_drift:footReport30.right.drift_frames.length,left_penetration:footReport30.left.penetrations.length,right_penetration:footReport30.right.penetrations.length,conflict:footReport30.conflictFrames.length}}}));
 }finally{await page?.close();await browser?.close();await server.stop()}
});
