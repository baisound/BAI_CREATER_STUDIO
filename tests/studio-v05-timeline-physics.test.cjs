'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const h=require('./helpers/studio-harness.cjs');
async function j(r,status=200){const text=await r.text();assert.equal(r.status,status,text);return JSON.parse(text);}
const post=(s,route,body,status=200)=>fetch(s.base+'/api/studio/v05/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>j(r,status));
test('saved PMX physics: fixed-time seek/reload and real MP4 frames, old OFF state preserved',{timeout:240000},async()=>{
 const fixture=spawnSync(h.python,['-X','utf8','-c',"import runpy,json,base64,contextlib,io;from tools.make_test_pmx import build_pmx;b=io.StringIO();\nwith contextlib.redirect_stdout(b):runpy.run_module('tests.helpers.timeline-scene-fixture',run_name='__main__')\nx=json.loads(b.getvalue());x['seed']['mmd/A/timeline.pmx']=base64.b64encode(build_pmx(physics=True)).decode();print(json.dumps(x))"],{encoding:'utf8',windowsHide:true});assert.equal(fixture.status,0,fixture.stderr);
 const input=JSON.parse(fixture.stdout),seed=Object.fromEntries(Object.entries(input.seed).map(([name,raw])=>[name,Buffer.from(raw,'base64')]));
 const s=await h.startServer({port:8933,seed});let browser,page;const out=path.resolve('../test-temp/timeline-physics');fs.mkdirSync(out,{recursive:true});
 try{
  const pid=(await post(s,'projects',{name:'物理の同時刻確認',kind:'empty'})).project.id;await post(s,'project/fps',{project_id:pid,fps:30});
  let ar=await post(s,'arrangement/place',{project_id:pid,revision:0,asset_id:'mmd:A:timeline.pmx',track:'model',start:.25,duration:1.5});const rid='timeline:'+ar.clip.id;
  ar=await post(s,'arrangement/place',{project_id:pid,revision:ar.revision,asset_id:'mmd:vmd:body.vmd',track:'motion',start:.25,duration:1.5});ar=await post(s,'scene/motion-target',{project_id:pid,revision:ar.revision,clip_id:ar.clip.id,instance_id:rid});
  let scene=await post(s,'scene/instances',{project_id:pid,revision:0,action:'camera',camera:{position:[0,.04,.64],target:[0,.04,0],fov:45}});
  browser=await require('playwright').chromium.launch({executablePath:h.chromiumPath(),args:['--enable-features=WebMCP,WebMCPTesting','--no-sandbox']});page=await s.newPage(browser);
  await page.goto(s.base+'/studio/v05/index.html?scene_capture=1');await page.locator('#uiMainNav [data-workspace=edit]').click();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready);
  const before=await page.evaluate(({rid})=>{const api=window.BAIStudioMultiScenePreview;api.captureFrame(18,30,320,180);return {physics:api.status().physics,pose:api.poseProbe(rid,['髪1'])};},{rid});assert.equal(before.physics.state,'off');
  scene=await post(s,'scene/instances',{project_id:pid,revision:scene.revision,action:'physics',instance_id:rid,physics_enabled:true});
  await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
  const state=await page.evaluate(()=>window.BAIStudioMultiScenePreview.status());assert.equal(state.ready,true,JSON.stringify(state));assert.equal(state.physics.state,'ready');
  const sample=async frame=>page.evaluate(({rid,frame})=>{const api=window.BAIStudioMultiScenePreview;const png=api.captureFrame(frame,30,320,180);return {png,pose:api.poseProbe(rid,['髪1','センター'])};},{rid,frame});
  const expected=new Map();for(const frame of [0,8,18,30,45,53])expected.set(frame,await sample(frame));
  assert.notDeepEqual(expected.get(18).pose.bones['髪1'].quaternion,before.pose.bones['髪1'].quaternion,'real Ammo changes secondary-bone rotation');
  for(const frame of [45,18,8,30,0,18])assert.deepEqual(await sample(frame),expected.get(frame),'reverse/repeated seek uses the same immutable physics cache');
  await page.reload();await page.locator('#uiMainNav [data-workspace=edit]').click();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready);
  const restored=await sample(18);assert.deepEqual(restored,expected.get(18),'reloaded independent Ammo world produces same cache sample');
  const range=await post(s,'timeline/range',{project_id:pid,revision:0,arrangement_revision:ar.revision,in_frame:8,out_frame:52});
  let job=await post(s,'render/jobs',{project_id:pid,range_revision:range.revision,arrangement_revision:ar.revision,scene_revision:scene.revision,resolution:'720p',name:'物理あり非0In'},202);
  const end=Date.now()+120000;while(['queued','running'].includes(job.status)&&Date.now()<end){await new Promise(r=>setTimeout(r,300));job=await j(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,45);
  const mp4=Buffer.from(await(await fetch(s.base+'/api/studio/v05/render/file?id='+job.id)).arrayBuffer());fs.writeFileSync(path.join(out,'physics.mp4'),mp4);
  const decode=(bytes,args=[])=>{const r=spawnSync('ffmpeg',['-v','error','-i','pipe:0',...args,'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{input:bytes,maxBuffer:40e6,windowsHide:true});assert.equal(r.status,0,r.stderr.toString());return r.stdout;};
  const movie=decode(mp4,['-vf','scale=320:180']);assert.equal(movie.length,45*320*180*4);
  for(const frame of [8,18,30,45]){const png=decode(Buffer.from(expected.get(frame).png.split(',')[1],'base64')),actual=movie.subarray((frame-8)*320*180*4,(frame-7)*320*180*4);let error=0,visible=0;for(let i=0;i<png.length;i+=4){const alpha=png[i+3]/255;visible+=alpha>.5;for(let c=0;c<3;c++)error+=Math.abs(actual[i+c]-png[i+c]*alpha);}assert.ok(visible>20);assert.ok(error/(320*180*3)<4,'physics preview/MP4 pixels F'+frame);}
  const standard=(name,args)=>{const r=spawnSync(h.python,['-X','utf8','mcp_server.py'],{input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})+'\n',encoding:'utf8',windowsHide:true,env:{...process.env,MIXAMO_VIEWER_URL:s.base}});assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout).result;assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);};
  scene=standard('bai_studio_scene_instances_mutate',{project_id:pid,action:'physics',revision:scene.revision,instance_id:rid,physics_enabled:false});assert.equal(scene.physics[rid].enabled,false);
  let native=await page.evaluate(async input=>{const tool=(await document.modelContext.getTools()).find(t=>t.name==='bai_studio_scene_instances_mutate');return document.modelContext.executeTool(tool,input);},{project_id:pid,action:'physics',revision:scene.revision,instance_id:rid,physics_enabled:true});if(typeof native==='string')native=JSON.parse(native);assert.ok(!native.isError,JSON.stringify(native));scene=JSON.parse(native.content[0].text);assert.equal(scene.physics[rid].enabled,true);
  await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());assert.deepEqual(await sample(18),expected.get(18));

  // Own-write notifications must invalidate even when the editor already holds that revision.
  for(const name of ['bai:v106-fk-saved','bai:v96-face-saved','bai:v61-transform-saved','bai:v199-lip-adoption-changed']){
   await page.evaluate(({pid,name})=>window.dispatchEvent(new CustomEvent(name,{detail:{projectId:pid,revision:0}})),{pid,name});
   assert.equal(await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().ready),false);
   await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready);assert.deepEqual(await sample(18),expected.get(18));
  }
  // Static PMX has no evaluator callback: reprepare must start from rest, not the last cached pose.
  ar=await j(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid));ar=await post(s,'arrangement/clip/edit',{project_id:pid,revision:ar.revision,action:'delete',clip_id:ar.clips.find(c=>c.track==='motion').id});
  await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());const staticFirst=await sample(18);
  await sample(45);await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());assert.deepEqual(await sample(18),staticFirst);
  assert.deepEqual(await page.evaluate(({rid})=>{const api=window.BAIStudioMultiScenePreview;return {png:api.captureFrame(36,60,320,180),pose:api.poseProbe(rid,['髪1','センター'])};},{rid}),staticFirst);
  scene=await j(await fetch(s.base+'/api/studio/v05/scene/instances?id='+pid));scene=await post(s,'scene/instances',{project_id:pid,revision:scene.revision,action:'add',asset_id:'mmd:A:timeline.pmx',transform:{position:[.1,0,0],rotation:[0,0,0],scale:[1,1,1]}});const second=scene.instances.find(r=>r.id!==rid).id;
  scene=await post(s,'scene/instances',{project_id:pid,revision:scene.revision,action:'physics',instance_id:second,physics_enabled:true});await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());assert.equal(await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().physics.models),2);
  const multi=await sample(18);await sample(45);await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());assert.deepEqual(await sample(18),multi);
  scene=await post(s,'scene/instances',{project_id:pid,revision:scene.revision,action:'remove',instance_id:second});await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
  // Manual UI saves exactly the same per-model setting; failure never publishes a partial scene.
  await page.evaluate(()=>window.BAIStudioMultiScenePreview.openPhysicsSettings());await page.getByLabel('表示対象モデル',{exact:true}).selectOption(rid);await page.locator('#v58-physics-off').click();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready&&document.getElementById('v58-physics-status').textContent==='物理OFF（保存済み）');assert.equal((await j(await fetch(s.base+'/api/studio/v05/scene/instances?id='+pid))).physics[rid].enabled,false);
  await page.locator('#v58-physics-enabled').check();assert.match(await page.locator('#v58-physics-status').innerText(),/未保存/);await page.locator('#v58-physics-save').click();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready&&window.BAIStudioMultiScenePreview.status().physics.models===1);
  await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready);const pictures=path.resolve(process.env.BAI_PHYSICS_PICTURES||'studio/v05/reviews/timeline-physics-20261114');fs.mkdirSync(pictures,{recursive:true});await page.locator('#v58-physics-controls summary').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(pictures,'physics-1440.png')});await page.setViewportSize({width:1024,height:768});await page.locator('#v58-physics-controls summary').scrollIntoViewIfNeeded();assert.ok(await page.locator('#v58-physics-controls').evaluate(el=>el.scrollWidth<=el.clientWidth+2));await page.screenshot({path:path.join(pictures,'physics-1024.png')});await page.setViewportSize({width:1440,height:900});
  await page.locator('#v58-physics-controls').evaluate(el=>{el.style.outline='2px solid #ffd45a';const mark=document.createElement('b');mark.textContent='① 対象PMXの物理設定・保存・再準備';mark.style.color='#ffd45a';el.prepend(mark);});await page.screenshot({path:path.join(pictures,'physics-marked.png')});
  ar=await j(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid));const modelClip=ar.clips[0].id;ar=await post(s,'arrangement/clip/edit',{project_id:pid,revision:ar.revision,action:'update',clip_id:modelClip,start:0,duration:300,track:'model'});
  const rebuilding=page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());await page.locator('#v58-physics-cancel').click();await rebuilding;assert.equal(await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().physics.state),'cancelled');assert.equal(await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().ready),false);
  ar=await post(s,'arrangement/clip/edit',{project_id:pid,revision:ar.revision,action:'update',clip_id:modelClip,start:0,duration:601,track:'model'});await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());assert.equal(await page.evaluate(()=>window.BAIStudioMultiScenePreview.status().physics.state),'failed');assert.match(await page.locator('#v58-physics-status').innerText(),/600秒/);await page.locator('#v58-physics-off').click();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready);
  await page.locator('#v58-physics-enabled').check();await page.locator('#v58-physics-save').click();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().physics.state==='failed');assert.equal(await page.evaluate(()=>document.activeElement.id),'v58-physics-status');await page.locator('#v58-physics-off').click();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready);

  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'passed',physics:state.physics,mp4_frames:45},null,2));h.assertNoErrors(page);
 }catch(error){await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
 finally{await browser?.close();await s.stop();}
});
