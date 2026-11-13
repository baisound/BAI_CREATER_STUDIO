'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const h=require('./helpers/studio-harness.cjs'),source=process.env.BAI_REAL_MMD_DATA;
const pmx='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx',body=process.env.BAI_REAL_TIMELINE_BODY||'狐面物理確認用_頭振り_F000-0300.vmd',camera='キラメキのシンフォニー-カメラ.vmd';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function json(r,status=200){const t=await r.text();assert.equal(r.status,status,t);return JSON.parse(t);}
test('実PMX/頭振りVMD/カメラVMDと表情クリップが同じタイムラインから実GPU/MP4へ接続する',{skip:!source&&'BAI_REAL_MMD_DATA required',timeout:240000},async()=>{
 const meta=JSON.parse(fs.readFileSync(path.join(source,'mmd_assets.json'))),seed={},protectedFiles=[];
 const entries=meta.A.filter(a=>a.name===pmx||a.name.startsWith('tex/'));
 for(const a of entries){const p=path.join(source,'mmd/A',a.name),b=fs.readFileSync(p);seed['mmd/A/'+a.name]=b;protectedFiles.push({path:p,sha256:sha(b)});}
 for(const name of [body,camera]){const p=path.join(source,'mmd/vmd',name),b=fs.readFileSync(p);seed['mmd/vmd/'+name]=b;protectedFiles.push({path:p,sha256:sha(b)});}
 const generated=spawnSync('python',['-X','utf8','-c',"from tests.test_v05_timeline_effects import face_vmd; import base64; print(base64.b64encode(face_vmd('まばたき')).decode())"],{encoding:'utf8',windowsHide:true});assert.equal(generated.status,0,generated.stderr);
 seed['mmd/vmd/blink.vmd']=Buffer.from(generated.stdout.trim(),'base64');
 seed['mmd_assets.json']=JSON.stringify({A:entries,B:[],vmd:[body,camera,'blink.vmd'].map(name=>({name,size:seed['mmd/vmd/'+name].length}))});
 const s=await h.startServer({port:9297,seed}),out=path.resolve(__dirname,'../qa/timeline-scene-20261113/real');fs.mkdirSync(out,{recursive:true});let browser,page;const report={source_hashes:protectedFiles,cases:[],errors:[]};
 const post=(route,b,status=200)=>fetch(s.base+'/api/studio/v05/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>json(r,status));
 try{
  const pid=(await post('projects',{name:'実PMXとカメラの配置連動',kind:'empty'})).project.id;await post('project/fps',{project_id:pid,fps:30});let revision=0;
  const place=async(asset_id,track,start,duration)=>{const r=await post('arrangement/place',{project_id:pid,asset_id,track,start,duration,revision});revision=r.revision;return r.clip;};
  const model=await place('mmd:A:'+pmx,'model',.25,5.5),rid='timeline:'+model.id,motion=await place('mmd:vmd:'+body,'motion',.5,5),face=await place('mmd:vmd:blink.vmd','expression',.5,5);await place('mmd:vmd:'+camera,'camera',.5,5);
  for(const c of [motion,face]){const r=await post('scene/motion-target',{project_id:pid,clip_id:c.id,instance_id:rid,revision});revision=r.revision;}
  const scene=await json(await fetch(s.base+'/api/studio/v05/scene/instances?id='+pid));assert.equal(scene.camera,null);assert.ok(scene.timeline_effects.every(r=>r.status==='ready'),JSON.stringify(scene.timeline_effects));
  browser=await require('playwright').chromium.launch({executablePath:h.chromiumPath(),args:process.env.BAI_REAL_GPU==='1'?['--use-angle=d3d11','--ignore-gpu-blocklist']:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox']});page=await s.newPage(browser);page.on('pageerror',e=>report.errors.push(e.stack));
  await page.goto(s.base+'/studio/v05/index.html');await page.locator('#uiMainNav [data-workspace=edit]').click();
  const ready=()=>page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&window.BAIStudioMultiScenePreview.status().motion?.loadedClips.length===1,null,{timeout:120000});await ready();
  report.gpu=await h.webglRenderer(page);if(process.env.BAI_REAL_GPU==='1')assert.equal(report.gpu.gpuVerified,true);
  const sample=async frame=>{await page.evaluate(f=>window.BAIStudioMediaPreviewV68.seek(f),frame);return page.evaluate(rid=>{const a=window.BAIStudioMultiScenePreview;return {state:a.status(),pose:a.poseProbe(rid,['頭']),morph:a.morphProbe(rid)};},rid);};
  const first=await sample(30),later=await sample(150);assert.equal(first.state.timelineIssue,null);assert.equal(later.state.timelineIssue,null);assert.ok(Math.max(...first.pose.bones['頭'].quaternion.map((v,i)=>Math.abs(v-later.pose.bones['頭'].quaternion[i])))>.01);assert.notDeepEqual(first.state.camera,later.state.camera);assert.ok(first.morph.morphs['まばたき']>.99);
  const shots=path.resolve(__dirname,'../../test-temp/timeline-scene-real');fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'real-timeline.png')});
  // Reload while the camera clip is active; leaving it must restore auto framing.
  await page.reload();await page.locator('#uiMainNav [data-workspace=edit]').click();await ready();const again=await sample(150);assert.deepEqual(again.pose,later.pose);assert.deepEqual(again.morph,later.morph);const outside=await sample(0);assert.equal(outside.state.activeCameraClip,null);assert.equal(outside.state.cameraProjection,'perspective');assert.equal(outside.state.timelineModels[0].visible,false);assert.notDeepEqual(outside.state.camera,later.state.camera);
  report.cases.push('実登録PMX/頭振り/カメラの原本を隔離複製し、派生モデルの骨・まばたき・カメラが同じ作品時刻で変化。カメラ作動中の再読込から自動構図へ復帰');
  const range=await post('timeline/range',{project_id:pid,revision:0,arrangement_revision:revision,in_frame:150,out_frame:152});let job=await post('render/jobs',{project_id:pid,arrangement_revision:revision,scene_revision:scene.revision,range_revision:range.revision,resolution:'720p',name:'実3D連動'},202);
  const deadline=Date.now()+120000;while(['queued','running'].includes(job.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,400));job=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,3);
  const bytes=Buffer.from(await(await fetch(s.base+'/api/studio/v05/render/file?id='+job.id)).arrayBuffer());const raw=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{input:bytes,maxBuffer:4e6,windowsHide:true});assert.equal(raw.status,0,raw.stderr.toString());let pixels=0;for(let i=0;i<raw.stdout.length;i+=3)if(Math.max(raw.stdout[i],raw.stdout[i+1],raw.stdout[i+2])>24)pixels++;assert.ok(pixels>200,'実PMXのMP4画素がありません');report.render={frames:job.probe.frames,nonblack_pixels:pixels,input_hashes:job.inputs.map(i=>({asset_id:i.asset_id,sha256:i.sha256}))};
  for(const f of protectedFiles)assert.equal(sha(fs.readFileSync(f.path)),f.sha256);assert.deepEqual(report.errors,[]);report.cases.push('実カメラ/表情/動きを含む3F MP4のモデル実画素・入力ハッシュ、Owner原本ハッシュ不変');report.status='passed';
 }catch(e){report.status='failed';report.error=e.stack;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw e;}finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();await s.stop();}
});
