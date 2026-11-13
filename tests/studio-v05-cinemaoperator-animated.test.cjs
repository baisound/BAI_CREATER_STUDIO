'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),h=require('./helpers/studio-harness.cjs');
const blender=process.env.MIXAMO_BLENDER,zip=process.env.BAI_CINEMA_ADDON_ZIP;
const out=path.resolve(process.env.BAI_CINEMA_ANIMATED_OUTPUT||'../test-temp/cinemaoperator-animated');
async function json(r,status=200){const text=await r.text();assert.equal(r.status,status,text);return JSON.parse(text);}
async function post(s,route,body,status=200){return json(await fetch(s.base+'/api/studio/v05/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),status);}
function standard(base,name,args){const r=spawnSync(h.python,['-X','utf8','mcp_server.py'],{input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})+'\n',encoding:'utf8',maxBuffer:3e6,windowsHide:true,env:{...process.env,MIXAMO_VIEWER_URL:base}});assert.equal(r.status,0,r.stderr);const reply=JSON.parse(r.stdout).result;assert.ok(!reply.isError,JSON.stringify(reply));return JSON.parse(reply.content[0].text);}
async function web(page,name,args){let r=await page.evaluate(async({name,args})=>document.modelContext.executeTool((await document.modelContext.getTools()).find(t=>t.name===name),args),{name,args});if(typeof r==='string')r=JSON.parse(r);assert.ok(!r.isError,JSON.stringify(r));return JSON.parse(r.content[0].text);}
test('PMX motion/face/lip evaluated movie -> real CinemaOperator Bake -> B1/MP4, immutable dependencies',
 {skip:(!blender||!zip)&&'real Blender/addon required',timeout:480000},async()=>{
 const generated=spawnSync(h.python,['-X','utf8','-m','tests.helpers.timeline-scene-fixture'],{encoding:'utf8',windowsHide:true});assert.equal(generated.status,0,generated.stderr);
 const input=JSON.parse(generated.stdout),seed=Object.fromEntries(Object.entries(input.seed).map(([key,value])=>[key,Buffer.from(value,'base64')]));
 const s=await h.startServer({port:Number(process.env.BAI_CINEMA_TEST_PORT)||8925,seed});fs.mkdirSync(out,{recursive:true});let browser,page;const report={status:'running'};
 try{
  const pid=(await post(s,'projects',{name:'PMX撮影コピーの検証',kind:'empty'})).project.id;
  await post(s,'project/fps',{project_id:pid,fps:30});let arranged={revision:0};
  const place=async(asset,track,start,duration)=>{arranged=await post(s,'arrangement/place',{project_id:pid,revision:arranged.revision,asset_id:asset,track,start,duration});return arranged.clip;};
  const model=await place('mmd:A:timeline.pmx','model',.25,1.5),rid='timeline:'+model.id;
  const motion=await place('mmd:vmd:body.vmd','motion',.25,1.5),face=await place('mmd:vmd:face.vmd','expression',.5,.5),lip=await place('mmd:vmd:lip.vmd','lip',1,.5);
  for(const clip of [motion,face,lip])arranged=await post(s,'scene/motion-target',{project_id:pid,revision:arranged.revision,clip_id:clip.id,instance_id:rid});
  const scene=await post(s,'scene/instances',{project_id:pid,action:'camera',revision:0,camera:{position:[0,.04,.64],target:[0,.04,0],fov:45}});
  const inspected=await json(await fetch(s.base+'/api/studio/v05/blender-addons/inspect',{method:'POST',body:fs.readFileSync(zip)}));
  const addon=await json(await fetch(s.base+'/api/studio/v05/blender-addons/register?'+new URLSearchParams({member:inspected.choices[0].member}),{method:'POST',body:fs.readFileSync(zip)}));
  const baseline=JSON.parse(JSON.stringify(await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid))));
  browser=await require('playwright').chromium.launch({executablePath:h.chromiumPath(),args:['--enable-features=WebMCP,WebMCPTesting','--no-sandbox']});page=await s.newPage(browser);
  await page.goto(s.base+'/studio/v05/index.html');await page.locator('#v06project').selectOption(pid,{force:true});
  await page.getByRole('button',{name:'制作',exact:true}).click();await page.getByRole('button',{name:'カメラ・演出',exact:true}).click();await page.locator('#co-tab-addon').click();
  await page.waitForFunction(()=>document.getElementById('co-addon').value);await page.locator('#co-end').fill('59');
  await page.locator('#co-prepare').click();await page.waitForFunction(()=>document.getElementById('co-progress').textContent.includes('形状を準備中'));
  await page.waitForFunction(()=>!document.getElementById('co-prepare').disabled,null,{timeout:150000});
  assert.match(await page.locator('#co-status').innerText(),/^準備済み/);const sid=await page.locator('#co-session').inputValue();assert.ok(sid);
  const folder=path.join(s.dataDir,'studio_v05_blender_sessions',sid),m=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8')),movie=JSON.parse(fs.readFileSync(path.join(folder,'geometry.json'),'utf8'));
  assert.equal(m.capture_mode,'evaluated');assert.equal(movie.frame_count,60);assert.equal(movie.meshes.length,1);
  assert.equal(await page.locator('#co-ack').evaluate(e=>document.activeElement===e),true);
  await page.screenshot({path:path.join(out,'scene-copy-1440.png')});await page.setViewportSize({width:1024,height:768});assert.ok(await page.locator('#cinemaoperator-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+2));await page.screenshot({path:path.join(out,'scene-copy-1024.png')});await page.setViewportSize({width:1440,height:900});
  // Absolute-time sampling agrees for full and nonzero-start subranges.
  const std=standard(s.base,'bai_studio_blender_addon_prepare',{project_id:pid,addon_id:addon.id,start_frame:9,end_frame:38});
  const webCopy=await web(page,'bai_studio_blender_addon_prepare',{project_id:pid,addon_id:addon.id,start_frame:9,end_frame:38});
  const row=movie.meshes[0],raw=fs.readFileSync(path.join(folder,row.file));
  for(const copy of [std,webCopy]){
   const dir=path.join(s.dataDir,'studio_v05_blender_sessions',copy.id),sub=JSON.parse(fs.readFileSync(path.join(dir,'geometry.json'),'utf8')).meshes[0],buf=fs.readFileSync(path.join(dir,sub.file));
   for(let f=9;f<=38;f++)assert.deepEqual(buf.subarray(8+30*4+(f-9)*sub.count*12,8+30*4+(f-8)*sub.count*12),raw.subarray(8+60*4+f*row.count*12,8+60*4+(f+1)*row.count*12));
  }
  assert.deepEqual(await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid)),baseline);
  const extract=spawnSync(h.python,['-X','utf8','-c',"import sys;from pathlib import Path;from bai_studio.v05.timeline.blender_addons import archive;z=archive(Path(sys.argv[1]).read_bytes());out=Path(sys.argv[2]);[(out/f.filename).parent.mkdir(parents=True,exist_ok=True) or (out/f.filename).write_bytes(z.read(f)) for f in z.infolist() if not f.is_dir()]",path.join(s.dataDir,'studio_v05_blender_addons',addon.id,'addon.zip'),path.join(folder,'addons')],{encoding:'utf8',windowsHide:true});assert.equal(extract.status,0,extract.stderr);
  const baked=spawnSync(blender,['--background','--factory-startup','--disable-autoexec',path.join(folder,'work.blend'),'--python-exit-code','1','--python',path.resolve('tools/cinemaoperator_bootstrap.py'),'--python',path.resolve('tests/helpers/cinemaoperator_cached_bake.py')],{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4e6,env:{...process.env,BAI_CINEMA_SESSION:folder,BAI_CINEMA_EXPORTER:path.resolve('tools/export_blender_camera.py'),BLENDER_USER_CONFIG:path.join(folder,'profile/config'),BLENDER_USER_SCRIPTS:path.join(folder,'profile/scripts')}});
  fs.writeFileSync(path.join(out,'blender-bake.log'),baked.stdout+'\n'+baked.stderr);assert.equal(baked.status,0,(baked.stdout+baked.stderr).slice(-5500));
  const probes=JSON.parse(fs.readFileSync(path.join(folder,'geometry-probe.json'),'utf8'));
  for(const probe of probes){const index=probe.frame-1,offset=8+60*4+index*row.count*12;assert.equal(probe.visible,row.states[index].visible);if(probe.visible)for(let v=0;v<row.count;v++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(probe.vertices[v][axis]-raw.readFloatBE(offset+(v*3+axis)*4))<1e-6,'Blender MDD time/vertex correspondence');}
  assert.deepEqual(probes[2],probes.at(-1));
  assert.notDeepEqual(probes[2].vertices,probes[3].vertices,'body/face/lip change the evaluated geometry');
  // Same scene revisions are insufficient: texture, expression and voice settings also matter.
  for(const filename of ['mmd/vmd/face.vmd','mmd/A/tex/a.png','studio_v05_lip_adoptions/'+pid+'.json','studio_v05_motion_edits/'+pid+'.json']){
   const file=path.join(s.dataDir,filename),old=fs.existsSync(file)?fs.readFileSync(file):null;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,old?Buffer.concat([old,Buffer.from(' ')]):'{}');
   const refused=await post(s,'blender-addons/import-bake',{session_id:sid},409);assert.equal(refused.error_code,'project_revision_conflict');
   if(old)fs.writeFileSync(file,old);else fs.unlinkSync(file);
  }
  const stdCandidate=standard(s.base,'bai_studio_blender_addon_import_bake',{session_id:sid});const webCandidate=await web(page,'bai_studio_blender_addon_import_bake',{session_id:sid});assert.equal(stdCandidate.id,webCandidate.id);
  await page.locator('#co-session').selectOption(sid);await page.locator('#co-return').click();await page.waitForFunction(()=>!document.getElementById('blender-camera-import').hidden&&document.getElementById('bc-candidate').value);
  await page.locator('#bc-go').click();await page.waitForFunction(()=>window.BAIStudioBlenderCamera.state().compared);
  await page.screenshot({path:path.join(out,'compare.png')});await page.locator('#bc-adopt').click();await page.waitForFunction(()=>document.getElementById('bc-status').textContent.startsWith('配置済み'));
  arranged=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid));const range=await post(s,'timeline/range',{project_id:pid,revision:0,arrangement_revision:arranged.revision,in_frame:0,out_frame:59});
  let job=await post(s,'render/jobs',{project_id:pid,range_revision:range.revision,arrangement_revision:arranged.revision,scene_revision:scene.revision,resolution:'720p',name:'PMXの撮影コピー往復'},202);
  const deadline=Date.now()+180000;while(['queued','running'].includes(job.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,300));job=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,60);
  fs.writeFileSync(path.join(out,'pmx-camera.mp4'),Buffer.from(await(await fetch(s.base+'/api/studio/v05/render/file?id='+job.id)).arrayBuffer()));
  // Fractional FPS and nonzero beginning, through the native cache modifier.
  const fractional=(await post(s,'projects',{name:'29.97fps撮影コピー',kind:'empty'})).project.id;
  await post(s,'project/fps',{project_id:fractional,fps:29.97});
  await post(s,'arrangement/place',{project_id:fractional,revision:0,asset_id:'mmd:A:timeline.pmx',track:'model',start:0,duration:2});
  const fraction=await post(s,'blender-addons/prepare',{project_id:fractional,addon_id:addon.id,start_frame:9,end_frame:38});
  const fractionManifest=JSON.parse(fs.readFileSync(path.join(s.dataDir,'studio_v05_blender_sessions',fraction.id,'manifest.json'),'utf8'));assert.equal(fractionManifest.fps,29.97);assert.equal(fractionManifest.start_frame,9);
  report.status='passed';report.vertex_probes=probes;report.mp4_frames=60;report.case_count=movie.frame_count;report.renderer=movie.renderer;
  fs.writeFileSync(path.join(out,'private-state.json'),JSON.stringify({data:s.dataDir,pid,folder,session:sid,addon:addon.id}));h.assertNoErrors(page);
 }catch(e){report.status='failed';report.error=e.stack;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));await browser?.close();await s.stop();}
});
