'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),h=require('./helpers/studio-harness.cjs');
const addonZip=process.env.BAI_CINEMA_ADDON_ZIP,blender=process.env.MIXAMO_BLENDER;
const stage=path.resolve(__dirname,'../../test-temp/blender-camera-fixture/stage.glb');
const out=path.resolve(__dirname,'../../test-temp/cinemaoperator-browser');
async function json(response,status=200){const raw=await response.text();assert.equal(response.status,status,raw);return JSON.parse(raw);}
function standard(base,name,args){const p=spawnSync(h.python,['-X','utf8','mcp_server.py'],{input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})+'\n',encoding:'utf8',maxBuffer:3e6,windowsHide:true,env:{...process.env,MIXAMO_VIEWER_URL:base}});assert.equal(p.status,0,p.stderr);const result=JSON.parse(p.stdout).result;assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
async function web(page,name,args){let result=await page.evaluate(async({name,args})=>document.modelContext.executeTool((await document.modelContext.getTools()).find(t=>t.name===name),args),{name,args});if(typeof result==='string')result=JSON.parse(result);assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
function decode(bytes,args=[]){const p=spawnSync('ffmpeg',['-v','error','-i','pipe:0',...args,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{input:bytes,maxBuffer:80e6,windowsHide:true});assert.equal(p.status,0,p.stderr.toString());return p.stdout;}
function masks(raw){const w=1280,height=720;return [0,1,2].map(c=>{let count=0,x=0,y=0;for(let i=0;i<w*height;i++)if(raw[i*3+c]>90&&[0,1,2].filter(k=>k!==c).every(k=>raw[i*3+c]>1.5*raw[i*3+k])){count++;x+=i%w;y+=Math.floor(i/w);}assert.ok(count>10,'generated color landmarks visible');return [x/count/w,y/count/height];});}
test('real CinemaOperator ZIP -> UI register/scene copy -> native Bake -> candidate/adoption/MP4 and MCP',
 {skip:(!addonZip||!blender||!fs.existsSync(stage))&&'BAI_CINEMA_ADDON_ZIP/MIXAMO_BLENDER/generated stage required',timeout:360000},async()=>{
 fs.mkdirSync(out,{recursive:true});const archive=fs.readFileSync(addonZip),hash=crypto.createHash('sha256').update(archive).digest('hex');const report={status:'running',cases:[]};
 const s=await h.startServer({port:8923});let browser,page;
 const post=(route,body,status=200)=>fetch(s.base+'/api/studio/v05/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>json(r,status));
 try{
  const id=(await post('projects',{name:'CinemaOperator連携の検証',kind:'empty'})).project.id;
  const asset=(await json(await fetch(s.base+'/api/library-assets/upload?kind=stage&name=generated-stage.glb',{method:'POST',body:fs.readFileSync(stage)}))).item;
  let scene=await post('scene/instances',{project_id:id,action:'add',revision:0,asset_id:asset.id,transform:{position:[.7,.1,-.2],rotation:[10,20,15],scale:[.8,.9,1.1]}});
  const placed=await post('arrangement/place',{project_id:id,revision:0,asset_id:asset.id,track:'model',start:.25,duration:.5});
  const baseline=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+id));
  browser=await require('playwright').chromium.launch({executablePath:h.chromiumPath(),args:['--enable-features=WebMCP,WebMCPTesting','--no-sandbox']});page=await s.newPage(browser);
  await page.goto(s.base+'/studio/v05/index.html');await page.locator('#v06project').selectOption(id,{force:true});await page.getByRole('button',{name:'制作',exact:true}).click();await page.getByRole('button',{name:'カメラ・演出',exact:true}).click();await page.locator('#co-tab-addon').click();
  const chooser=page.waitForEvent('filechooser');await page.locator('#co-inspect').click();await(await chooser).setFiles(addonZip);
  await page.waitForFunction(()=>!document.getElementById('co-inspected').hidden&&!document.getElementById('co-inner').disabled);
  assert.match(await page.locator('#co-inner').innerText(),/Release_DocsRev1.zip/);assert.equal(await page.locator('#co-inner').evaluate(e=>e===document.activeElement),true);
  await page.locator('#co-register').click();await page.waitForFunction(()=>document.getElementById('co-support').textContent.startsWith('登録済み・CinemaOperator連携'));
  const aid=await page.locator('#co-addon').inputValue();assert.equal(await page.locator('#co-open').isDisabled(),true);
  const inspected=standard(s.base,'bai_studio_blender_addon_inspect',{archive_base64:archive.toString('base64')});assert.equal(inspected.choices[0].id,aid);
  const registered=await web(page,'bai_studio_blender_addon_register',{archive_base64:archive.toString('base64'),member:inspected.choices[0].member});assert.equal(registered.id,aid);
  assert.equal((await web(page,'bai_studio_blender_addon_open',{session_id:'not-a-session'})).requires_local_action,true);
  assert.equal(standard(s.base,'bai_studio_blender_addon_open',{session_id:'not-a-session'}).requires_local_action,true);
  assert.equal(standard(s.base,'bai_studio_blender_addons_list',{project_id:id}).addons[0].id,aid);
  await page.locator('#co-prepare').click();await page.waitForFunction(()=>document.getElementById('co-status').textContent.startsWith('準備済み'),null,{timeout:120000});
  const sid=await page.locator('#co-session').inputValue();assert.ok(sid);assert.equal(await page.locator('#co-ack').evaluate(e=>e===document.activeElement),true);
  assert.match(await page.locator('#co-session-info').innerText(),new RegExp(sid.slice(0,8)));
  await page.screenshot({path:path.join(out,'addon-1440.png')});await page.setViewportSize({width:1024,height:768});assert.ok(await page.locator('#cinemaoperator-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+2));await page.screenshot({path:path.join(out,'addon-1024.png')});await page.setViewportSize({width:1440,height:900});
  await page.setViewportSize({width:1440,height:1080});await page.locator('#co-inspect').scrollIntoViewIfNeeded();
  await page.evaluate(()=>{
    for(const [selector,label] of [['#co-inspect','1'],['#co-prepare','2'],['#co-open','3'],['#co-return','4']]){
      const r=document.querySelector(selector).getBoundingClientRect(),box=document.createElement('div');box.dataset.coMark='';Object.assign(box.style,{position:'fixed',pointerEvents:'none',zIndex:99999,left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px',border:'2px solid #ffd45a',boxSizing:'border-box'});
      const badge=document.createElement('b');badge.textContent=label;Object.assign(badge.style,{position:'absolute',left:0,top:'-17px',background:'#ffd45a',color:'#111',fontSize:'14px',lineHeight:'18px',padding:'0 5px'});box.append(badge);document.body.append(box);
    }
  });await page.screenshot({path:path.join(out,'addon-marked.png')});await page.locator('[data-co-mark]').evaluateAll(els=>els.forEach(el=>el.remove()));await page.setViewportSize({width:1440,height:900});
  assert.deepEqual(await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+id)),baseline);
  const folder=path.join(s.dataDir,'studio_v05_blender_sessions',sid);
  const stdCopy=standard(s.base,'bai_studio_blender_addon_prepare',{project_id:id,addon_id:aid,start_frame:0,end_frame:59});assert.notEqual(stdCopy.id,sid);
  const webCopy=await web(page,'bai_studio_blender_addon_prepare',{project_id:id,addon_id:aid,start_frame:0,end_frame:59});assert.notEqual(webCopy.id,stdCopy.id);
  await page.locator('#co-reload').click();await page.waitForFunction(()=>document.getElementById('co-session').options.length===4);const labels=await page.locator('#co-session option').allTextContents();assert.equal(new Set(labels).size,4);await page.locator('#co-session').selectOption(sid);
  const empty=await post('blender-addons/import-bake',{session_id:sid},422);assert.equal(empty.error_code,'bake_missing');
  assert.equal((await post('blender-addons/open',{session_id:sid,acknowledged:true})).requires_local_action,true);
  const extract=spawnSync(h.python,['-X','utf8','-c',"import sys;from pathlib import Path;from bai_studio.v05.timeline.blender_addons import archive;z=archive(Path(sys.argv[1]).read_bytes());out=Path(sys.argv[2]);[(out/f.filename).parent.mkdir(parents=True,exist_ok=True) or (out/f.filename).write_bytes(z.read(f)) for f in z.infolist() if not f.is_dir()]",path.join(s.dataDir,'studio_v05_blender_addons',aid,'addon.zip'),path.join(folder,'addons')],{encoding:'utf8',windowsHide:true});assert.equal(extract.status,0,extract.stderr);
  const env={...process.env,BAI_CINEMA_SESSION:folder,BAI_CINEMA_EXPORTER:path.resolve('tools/export_blender_camera.py'),BLENDER_USER_CONFIG:path.join(folder,'profile/config'),BLENDER_USER_SCRIPTS:path.join(folder,'profile/scripts')};
  const baked=spawnSync(blender,['--background','--factory-startup','--disable-autoexec',path.join(folder,'work.blend'),'--python-exit-code','1','--python',path.resolve('tools/cinemaoperator_bootstrap.py'),'--python',path.resolve('tests/helpers/cinemaoperator_bake_fixture.py')],{encoding:'utf8',timeout:120000,maxBuffer:4e6,windowsHide:true,env});
  fs.writeFileSync(path.join(out,'native-bake.log'),baked.stdout+'\n'+baked.stderr);assert.equal(baked.status,0,(baked.stdout+baked.stderr).slice(-5000));
  const probes=JSON.parse(fs.readFileSync(path.join(folder,'fixture-probe.json'),'utf8'));assert.ok(probes[1].visible_meshes>probes[0].visible_meshes);assert.equal(probes.at(-1).visible_meshes,probes[0].visible_meshes);
  const standardCandidate=standard(s.base,'bai_studio_blender_addon_import_bake',{session_id:sid});const webCandidate=await web(page,'bai_studio_blender_addon_import_bake',{session_id:sid});assert.equal(standardCandidate.id,webCandidate.id);
  await page.locator('#co-return').click();await page.waitForFunction(()=>!document.getElementById('blender-camera-import').hidden&&document.getElementById('bc-candidate').value);
  assert.equal(await page.locator('#bc-go').evaluate(e=>e===document.activeElement),true);
  const cid=await page.locator('#bc-candidate').inputValue();const candidate=await json(await fetch(s.base+'/api/studio/v05/blender-camera?'+new URLSearchParams({project_id:id,candidate_id:cid})));
  assert.equal(candidate.provenance.addon_id,aid);assert.equal(candidate.unit_scale,1);assert.equal(candidate.source_start_frame,1);
  if(process.env.BAI_CINEMA_PROGRAM==='1'){assert.equal(candidate.camera_count,2);assert.deepEqual(candidate.track.cuts.map(c=>c.source_frame),[1,31]);}
  assert.match(await page.locator('#bc-snapshot').innerText(),/Blender送信日時/);
  await page.locator('#bc-go').click();await page.waitForFunction(()=>window.BAIStudioBlenderCamera.state().compared);
  await page.setViewportSize({width:1024,height:768});assert.ok(await page.locator('#blender-camera-import').evaluate(el=>el.scrollWidth<=el.clientWidth+2));await page.screenshot({path:path.join(out,'candidate-1024.png')});await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:path.join(out,'candidate.png')});
  await page.locator('#bc-adopt').click();await page.waitForFunction(()=>document.getElementById('bc-status').textContent.startsWith('配置済み'));
  let arranged=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+id));assert.equal(arranged.revision,2);
  const range=await post('timeline/range',{project_id:id,revision:0,arrangement_revision:arranged.revision,in_frame:0,out_frame:59});
  let job=await post('render/jobs',{project_id:id,range_revision:range.revision,arrangement_revision:arranged.revision,scene_revision:scene.revision,resolution:'720p',name:'CinemaOperator生成検証'},202);
  const deadline=Date.now()+180000;while(['queued','running'].includes(job.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,400));job=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,60);
  const mp4=Buffer.from(await(await fetch(s.base+'/api/studio/v05/render/file?id='+job.id)).arrayBuffer());fs.writeFileSync(path.join(out,'camera.mp4'),mp4);
  const frames=probes.map(p=>p.frame-1);const movie=decode(mp4,['-vf',`select='${frames.map(f=>`eq(n,${f})`).join('+')}',setpts=N/60/TB`]);report.pixelComparisons=[];
  for(const [i,frame] of frames.entries()){
    const actual=masks(movie.subarray(i*1280*720*3,(i+1)*1280*720*3));const reference=fs.readFileSync(path.join(folder,`reference-${frame}.png`));fs.writeFileSync(path.join(out,`reference-${frame}.png`),reference);const expected=masks(decode(reference));
    const error=Math.max(...actual.flatMap((p,j)=>p.map((n,k)=>Math.abs(n-expected[j][k]))));assert.ok(error<.01,'real Blender/MP4 landmarks '+frame+': '+error);report.pixelComparisons.push({frame,error});
  }
  await page.reload();await page.getByRole('button',{name:'制作',exact:true}).click();await page.getByRole('button',{name:'カメラ・演出',exact:true}).click();await page.locator('#co-tab-addon').click();await page.locator('#co-session').selectOption(sid);
  assert.equal(await page.locator('#co-addon').inputValue(),aid);assert.equal(await page.locator('#co-ack').isChecked(),false);
  // Old shooting context must refuse after candidate generation and adoption.
  const stale=await post('blender-addons/import-bake',{session_id:sid},409);assert.equal(stale.error_code,'project_revision_conflict');
  const rejected=await post('blender-addons/remove',{addon_id:aid},409);assert.equal(rejected.error_code,'addon_in_use');
  const nativeList=await web(page,'bai_studio_blender_addons_list',{project_id:id});assert.ok(nativeList.sessions.some(copy=>copy.id===sid));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(addonZip)).digest('hex'),hash);
  h.assertNoErrors(page);report.status='passed';report.gpu=await h.webglRenderer(page);report.cases=['manual distribution ZIP selection/registration and focus','static GLB normalization/transforms and half-open timeline visibility in real Blender','native addon Bake/current-memory snapshot/B1 comparison/adoption/60F MP4','stdio/native WebMCP listing and execution refusal','reload, missing Bake, linked version removal, stale source context refusal, source ZIP unchanged'];
 }catch(error){report.status='failed';report.error=error.stack;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
 finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));await browser?.close();await s.stop();}
});
