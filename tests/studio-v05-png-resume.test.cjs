'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
const h=require('./helpers/studio-harness.cjs'),root=path.resolve(__dirname,'..'),out=process.env.BAI_RESUME_OUTPUT||path.join(root,'../test-temp/png-resume');
const apiOnly=process.env.BAI_RESUME_API_ONLY==='1';
function py(code,args=[]){const p=spawnSync(process.env.PYTHON||(process.platform==='win32'?'python':'python3'),['-X','utf8','-c',code,...args],{encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(p.status,0,p.stderr);return p.stdout;}
async function json(r,expected=200){const b=await r.text();assert.equal(r.status,expected,b);return JSON.parse(b);}
function value(r){if(typeof r==='string')r=JSON.parse(r);assert.notEqual(r.isError,true,JSON.stringify(r));return JSON.parse(r.content[0].text);}
test('real failed PNG prefix resumes through SDK/native/UI; exact PNG/WAV and saved-state refusals',{timeout:300000},async()=>{
 fs.mkdirSync(out,{recursive:true});const s=await h.startServer({port:Number(process.env.BAI_RESUME_PORT||9282)}),client=new Client({name:'png-resume',version:'1'});let browser,page;
 const get=u=>fetch(s.base+'/api/studio/v05/'+u).then(json),post=(u,b,n=200)=>fetch(s.base+'/api/studio/v05/'+u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>json(r,n));
 const wait=async id=>{let j;const deadline=Date.now()+180000;do{await new Promise(r=>setTimeout(r,150));j=await get('render/jobs?id='+id);}while(['queued','running'].includes(j.status)&&Date.now()<deadline);assert.equal(j.status,'succeeded',j.error);return j;};
 const fail=(mode,args)=>{const p=spawnSync(process.env.PYTHON||(process.platform==='win32'?'python':'python3'),['-X','utf8',path.join(root,'tests/helpers/png-resume-fault.py'),mode,JSON.stringify(args)],{cwd:root,env:{...process.env,BAI_DATA_DIR:s.dataDir,BAI_RESUME_SERVER_PORT:new URL(s.base).port},encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(p.status,0,p.stderr);const j=JSON.parse(p.stdout.trim().split(/\r?\n/).at(-1));assert.equal(j.status,'failed',JSON.stringify(j));return j;};
 try{
  const image=path.join(out,'alpha.png'),wav=path.join(out,'input.wav');
  py("import sys,wave,math;from PIL import Image;im=Image.new('RGBA',(1280,720),(0,0,0,0));im.paste((200,80,40,128),(300,200,600,500));im.save(sys.argv[1]);a=wave.open(sys.argv[2],'wb');a.setparams((2,3,48000,0,'NONE','not compressed'));a.writeframes(b''.join(int(3000000*math.sin(2*math.pi*500*n/48000)).to_bytes(3,'little',signed=True)*2 for n in range(48000)));a.close()",[image,wav]);
  const upload=async(file,kind)=>(await json(await fetch(s.base+'/api/library-assets/upload?kind='+kind+'&name='+path.basename(file),{method:'POST',body:fs.readFileSync(file)}))).item.id;
  const iid=await upload(image,'image'),aid=await upload(wav,'audio'),pid=(await post('projects',{name:'連番からの再開',kind:'empty'})).project.id;
  await post('project/fps',{project_id:pid,fps:29.97});let arr=await post('arrangement/place',{project_id:pid,revision:0,asset_id:iid,track:'image',start:0,duration:1});arr=await post('arrangement/place',{project_id:pid,revision:arr.revision,asset_id:aid,track:'audio',start:0,duration:1});
  const range=await post('timeline/range',{project_id:pid,revision:0,arrangement_revision:arr.revision,in_frame:7,out_frame:12}),settings=await post('render/settings',{project_id:pid,revision:0,preset:'png_rgba_zip',background:{kind:'transparent',color:'#000000'}});
  const args={project_id:pid,range_revision:range.revision,arrangement_revision:arr.revision,resolution:'720p',preset:'png_rgba_zip',settings_revision:settings.revision,name:'連番の確認'};
  const normal=await wait((await post('render/jobs',args,202)).id);const normalFile=path.join(out,'normal.zip');fs.writeFileSync(normalFile,Buffer.from(await (await fetch(s.base+'/api/studio/v05/render/file?id='+normal.id)).arrayBuffer()));
  await client.connect(new StdioClientTransport({command:process.env.PYTHON||(process.platform==='win32'?'python':'python3'),args:['-B',path.join(root,'mcp_server.py')],cwd:root,env:{...process.env,MIXAMO_VIEWER_URL:s.base},stderr:'pipe'}));const sdk=(name,args)=>client.callTool({name,arguments:args}).then(value);
  const short=fail('short',args);assert.equal(short.verified_frames,2);assert.equal(short.resume_available,true);
  const cpDir=path.join(s.dataDir,'studio_v05_media_renders/checkpoints',short.id),before=new Map(fs.readdirSync(cpDir).map(n=>[n,fs.readFileSync(path.join(cpDir,n))]));
  // Simulate a server restart with the last durable prefix and an unrecorded tail.
  const jobFile=path.join(s.dataDir,'studio_v05_media_renders/jobs',short.id+'.json'),record=JSON.parse(fs.readFileSync(jobFile));record.status='running';record.verified_frames=0;fs.writeFileSync(jobFile,JSON.stringify(record));fs.writeFileSync(path.join(cpDir,'frame_000003.png'),'unrecorded crash tail');
  await s.crash();await s.restart();const restored=await get('render/jobs?id='+short.id);assert.equal(restored.status,'interrupted');assert.equal(restored.verified_frames,2);
  const launched=await sdk('bai_studio_render_job_start',{...args,resume_job_id:short.id});fs.writeFileSync(path.join(out,'launched.json'),JSON.stringify({base:s.base,launched,dataDir:s.dataDir}));const resumed=await wait(launched.id);assert.equal(resumed.reused_frames,2);
  for(const [n,b] of before)assert.deepEqual(fs.readFileSync(path.join(cpDir,n)),b,'old checkpoint must stay immutable');
  const resumedFile=path.join(out,'resumed.zip');fs.writeFileSync(resumedFile,Buffer.from(await (await fetch(s.base+'/api/studio/v05/render/file?id='+resumed.id)).arrayBuffer()));
  const measurements=JSON.parse(py("import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);r=zipfile.ZipFile(sys.argv[2]);m=json.loads(r.read('manifest.json'));names=[x['file'] for x in m['frames']]+['audio.wav'];assert all(z.read(n)==r.read(n) for n in names);assert len(m['frames'])==6;print(json.dumps({'frames':len(m['frames']),'all_png_and_wav_bytes_equal':True,'audio':m['audio'],'start':m['range_start_frame']}))",[normalFile,resumedFile]));
  const full=fail('package',args);assert.equal(full.verified_frames,6);const repack=await wait((await post('render/jobs',{...args,resume_job_id:full.id},202)).id);assert.equal(repack.reused_frames,6);
  // Same-sized tamper, other project and changed resolution never start a new job.
  await post('render/jobs',{...args,resume_job_id:short.id,resolution:'1080p'},409);
  const p2=(await post('projects',{name:'別作品',kind:'empty'})).project.id;await post('render/jobs',{...args,project_id:p2,resume_job_id:short.id},409);
  const first=path.join(cpDir,'frame_000001.png'),bytes=fs.readFileSync(first);fs.writeFileSync(first,Buffer.concat([Buffer.from('X'),bytes.subarray(1)]));await post('render/jobs',{...args,resume_job_id:short.id},409);fs.writeFileSync(first,bytes);
  if(!apiOnly){
   browser=await require('playwright').chromium.launch({executablePath:h.chromiumPath(),args:['--enable-features=WebMCP,WebMCPTesting','--no-sandbox']});page=await s.newPage(browser,{viewport:{width:1440,height:900},expectErrors:[/409 \(Conflict\)/]});await page.goto(s.base+'/studio/v05/index.html');await page.getByRole('button',{name:'制作',exact:true}).click();await page.locator('#v06project').selectOption(pid);await page.getByRole('button',{name:'書き出し',exact:true}).click();await page.waitForFunction(()=>document.getElementById('v69settingsStatus')?.textContent.includes('保存済み'));
   const resumeButton=page.locator(`.v69job[data-job-id="${short.id}"] [data-action=resume]`);await resumeButton.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'resume-1440.png')});
   await page.evaluate(id=>{const row=document.querySelector(`.v69job[data-job-id="${id}"]`);for(const [target,label] of [[row.querySelector('.v69resumeNote'),'① 保持した検証済み枚数'],[row.querySelector('[data-action=resume]'),'② 続きから再開']]){const r=target.getBoundingClientRect(),e=document.createElement('div');e.dataset.resumeMarker='true';e.style.cssText=`position:fixed;z-index:99999;pointer-events:none;border:2px solid #ffdc54;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;box-sizing:border-box`;const t=document.createElement('span');t.textContent=label;t.style.cssText='position:absolute;right:0;bottom:100%;background:#ffdc54;color:#101820;font:700 13px sans-serif;white-space:nowrap';e.append(t);document.body.append(e);}},short.id);
   await page.screenshot({path:path.join(out,'resume-marked.png')});await page.locator('[data-resume-marker]').evaluateAll(es=>es.forEach(e=>e.remove()));
   await resumeButton.press('Enter');await page.waitForFunction(()=>document.getElementById('v69status').textContent.includes('完成・再読込'),null,{timeout:180000});assert.match(await page.locator('#baiRenderQueue').innerText(),/検証済み2枚を再利用/);assert.equal(await page.evaluate(()=>Boolean(document.activeElement.closest('.v69job'))),true,'resume focuses the new job and retains it through completion');
   await h.waitForAsync(page,async()=>Boolean(document.modelContext&&(await document.modelContext.getTools()).some(t=>t.name==='bai_studio_render_job_start')));assert.equal(await page.evaluate(()=>String(document.modelContext.registerTool).includes('[native code]')),true);
   const native=value(await page.evaluate(async a=>document.modelContext.executeTool((await document.modelContext.getTools()).find(t=>t.name==='bai_studio_render_job_start'),a),{...args,resume_job_id:full.id}));assert.equal((await wait(native.id)).reused_frames,6);
   await page.locator('#v69refreshHistory').click();
   await page.waitForFunction(id=>document.querySelector(`.v69job[data-job-id="${id}"]`)?.dataset.status==='succeeded',native.id);
   for(const [width,height] of [[1024,768],[600,720]]){await page.setViewportSize({width,height});const b=page.locator(`.v69job[data-job-id="${short.id}"] [data-action=resume]`);await b.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'resume-'+width+'.png')});assert.equal(await b.isVisible(),true);}
   const summary=page.locator('#v69attempts > summary');await summary.press('Enter');assert.equal(await page.locator('#v69attempts').getAttribute('open'),null);await Promise.all([page.waitForResponse(r=>r.url().includes('/render/jobs?')&&r.url().includes('completed=1')),page.locator('#v69refreshHistory').click()]);assert.equal(await page.locator('#v69attempts').getAttribute('open'),null,'history refresh preserves collapsed attempts');
   h.assertNoErrors(page);
  }
  // The verified original 3D capture is reused as well as the PNG prefix.
  const stage=await upload(path.join(__dirname,'fixtures/synthetic_test_model.glb'),'stage');
  const p3=(await post('projects',{name:'3D連番からの再開',kind:'empty'})).project.id;
  await post('project/fps',{project_id:p3,fps:29.97});
  const a3=await post('arrangement/place',{project_id:p3,revision:0,asset_id:aid,track:'audio',start:0,duration:1});
  const sc3=await post('scene/instances',{project_id:p3,revision:0,action:'add',asset_id:stage,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}});
  const r3=await post('timeline/range',{project_id:p3,revision:0,arrangement_revision:a3.revision,in_frame:7,out_frame:9});
  const c3=await post('render/settings',{project_id:p3,revision:0,preset:'png_rgba_zip',background:{kind:'transparent',color:'#000000'}});
  const args3={project_id:p3,range_revision:r3.revision,arrangement_revision:a3.revision,scene_revision:sc3.revision,resolution:'720p',preset:'png_rgba_zip',settings_revision:c3.revision};
  const failed3=fail('short',args3);assert.equal(failed3.verified_frames,2);assert.equal(failed3.scene_capture.frames,3);
  const resumed3=await wait((await post('render/jobs',{...args3,resume_job_id:failed3.id},202)).id);
  assert.equal(resumed3.reused_frames,2);assert.equal(resumed3.reused_scene_capture,true);assert.equal(resumed3.scene_capture.intermediate_sha256,failed3.scene_capture.intermediate_sha256);assert.equal(resumed3.scene_capture.frames,3);assert.equal(resumed3.probe.frames,3);assert.equal(resumed3.scene_capture.renderer,failed3.scene_capture.renderer);
  fs.writeFileSync(path.join(out,'scene-resumed.zip'),Buffer.from(await (await fetch(s.base+'/api/studio/v05/render/file?id='+resumed3.id)).arrayBuffer()));
  // A saved settings revision change refuses the old prefix even with matching new arguments.
  const changed=await post('render/settings',{project_id:pid,revision:settings.revision,preset:'png_rgba_zip',background:{kind:'solid',color:'#00ff00'}});await post('render/jobs',{...args,settings_revision:changed.revision,resume_job_id:full.id},409);
  assert.deepEqual(Buffer.from(await (await fetch(s.base+'/api/studio/v05/render/file?id='+normal.id)).arrayBuffer()),fs.readFileSync(normalFile));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'PASS',ui_native:!apiOnly,reused_frames:resumed.reused_frames,full_repack:repack.reused_frames,source_checkpoint_immutable:true,scene:{reused_frames:resumed3.reused_frames,retained_capture_frames:resumed3.scene_capture.frames,renderer:resumed3.scene_capture.renderer},measurements,refusals:['tamper','other project','resolution','settings revision'],restart:'durable two-frame prefix only'},null,2));
 }catch(e){fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'FAIL',error:e.message}));if(page)await page.screenshot({path:path.join(out,'failure.png')});throw e;}finally{await page?.close();await browser?.close();await client.close();await s.stop();}
});
