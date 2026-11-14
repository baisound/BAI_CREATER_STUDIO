'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
const h=require('./helpers/studio-harness.cjs'),root=path.resolve(__dirname,'..');
const output=process.env.BAI_PNG_OUTPUT||path.join(root,'../test-temp/png-sequence'),apiOnly=process.env.BAI_PNG_API_ONLY==='1';
function py(code,args=[]){const p=spawnSync(process.env.PYTHON||(process.platform==='win32'?'python':'python3'),['-X','utf8','-c',code,...args],{encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(p.status,0,p.stderr);return p.stdout;}
async function json(r,status=200){const b=await r.text();assert.equal(r.status,status,b);return JSON.parse(b);}
function value(r){if(typeof r==='string')r=JSON.parse(r);assert.notEqual(r.isError,true,JSON.stringify(r));return JSON.parse(r.content[0].text);}
test('saved PNG/background choices through UI/SDK/native; real ZIP RGBA/sample bounds/versions and MP4 retention',{timeout:300000},async()=>{
 fs.mkdirSync(output,{recursive:true});const s=await h.startServer({port:Number(process.env.BAI_PNG_PORT||9280)}),client=new Client({name:'png-sequence',version:'1'});let browser,page;
 const get=u=>fetch(s.base+'/api/studio/v05/'+u).then(json),post=(u,b,status)=>fetch(s.base+'/api/studio/v05/'+u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>json(r,status));
 try{
  const file=path.join(output,'alpha.png'),wav=path.join(output,'input.wav');
  py("from PIL import Image;import sys,wave,struct,math; im=Image.new('RGBA',(1280,720),(0,0,0,0));im.paste((200,80,40,128),(300,200,600,500));im.paste((10,210,90,255),(600,200,900,500));im.save(sys.argv[1]);a=wave.open(sys.argv[2],'wb');a.setparams((2,3,48000,0,'NONE','not compressed'));a.writeframes(b''.join(int(3000000*math.sin(2*math.pi*500*n/48000)).to_bytes(3,'little',signed=True)*2 for n in range(48000)));a.close()",[file,wav]);
  const upload=async(file,kind)=>(await json(await fetch(s.base+'/api/library-assets/upload?kind='+kind+'&name='+path.basename(file),{method:'POST',body:fs.readFileSync(file)}))).item.id;
  const image=await upload(file,'image'),audio=await upload(wav,'audio');
  const pid=(await post('projects',{name:'透過連番の確認',kind:'empty'})).project.id;
  await post('project/fps',{project_id:pid,fps:29.97});
  let arr=await post('arrangement/place',{project_id:pid,revision:0,asset_id:image,track:'image',start:0,duration:1});
  arr=await post('arrangement/place',{project_id:pid,revision:arr.revision,asset_id:audio,track:'audio',start:0,duration:1});
  const range=await post('timeline/range',{project_id:pid,revision:0,arrangement_revision:arr.revision,in_frame:7,out_frame:9});
  await client.connect(new StdioClientTransport({command:process.env.PYTHON||(process.platform==='win32'?'python':'python3'),args:['-B',path.join(root,'mcp_server.py')],cwd:root,env:{...process.env,MIXAMO_VIEWER_URL:s.base},stderr:'pipe'}));
  const sdk=(name,args={})=>client.callTool({name,arguments:args}).then(value);
  const old=await sdk('bai_studio_render_settings_get',{project_id:pid});assert.equal(old.revision,0);
  let settings=await sdk('bai_studio_render_settings_save',{project_id:pid,revision:0,preset:'png_rgba_zip',background:{kind:'transparent',color:'#000000'}});
  const wait=async id=>{const until=Date.now()+180000;let j;do{await new Promise(r=>setTimeout(r,200));j=await get('render/jobs?id='+id);}while(['queued','running'].includes(j.status)&&Date.now()<until);assert.equal(j.status,'succeeded',j.error);return j;};
  const args={project_id:pid,range_revision:range.revision,arrangement_revision:arr.revision,resolution:'720p',name:'確認'};
  const mp4=await wait((await sdk('bai_studio_render_job_start',args)).id),mp4Bytes=Buffer.from(await (await fetch(s.base+'/api/studio/v05/render/file?id='+mp4.id)).arrayBuffer());assert.equal(mp4Bytes.toString('ascii',4,8),'ftyp');
  if(!apiOnly){
   const baseline=spawnSync('git',['show','5b52bcdd98cf62393cf960279beff2b848490fbd:studio/v05/js/render-job-v69.js'],{cwd:root});assert.equal(baseline.status,0);
   browser=await require('playwright').chromium.launch({executablePath:h.chromiumPath(),args:['--enable-features=WebMCP,WebMCPTesting','--no-sandbox']});page=await s.newPage(browser,{viewport:{width:1440,height:900}});
   await page.route('**/studio/v05/js/render-job-v69.js',route=>route.fulfill({contentType:'text/javascript',body:baseline.stdout}));
   await page.goto(s.base+'/studio/v05/index.html');await page.getByRole('button',{name:'制作',exact:true}).click();await page.locator('#v06project').selectOption(pid);await page.getByRole('button',{name:'書き出し',exact:true}).click();await page.waitForFunction(()=>document.getElementById('v69status').textContent.includes('別名で書き出せます'));
   await page.screenshot({path:path.join(output,'before.png')});await page.close();await browser.close();page=browser=null;
  }
  const started=await sdk('bai_studio_render_job_start',{...args,preset:'png_rgba_zip',settings_revision:settings.revision});
  const job=await wait(started.id),res=await fetch(s.base+'/api/studio/v05/render/file?id='+job.id);assert.match(res.headers.get('content-type'),/zip/);
  const archive=path.join(output,'sequence.zip');fs.writeFileSync(archive,Buffer.from(await res.arrayBuffer()));
  const measured=JSON.parse(py("import sys,zipfile,json,io,wave;from PIL import Image;z=zipfile.ZipFile(sys.argv[1]);m=json.loads(z.read('manifest.json'));im=Image.open(io.BytesIO(z.read(m['frames'][0]['file'])));a=wave.open(io.BytesIO(z.read('audio.wav')));print(json.dumps({'count':len(m['frames']),'start':m['range_start_frame'],'fps':m['fps'],'alpha_mode':m['alpha_mode'],'clear':im.getpixel((20,20)),'half':im.getpixel((400,300)),'opaque':im.getpixel((700,300)),'samples':a.getnframes(),'start_sample':m['audio']['project_start_sample'],'end_sample':m['audio']['project_end_sample_exclusive']}))",[archive]));
  assert.equal(measured.count,3);assert.equal(measured.start,7);assert.equal(measured.alpha_mode,'straight');assert.equal(measured.clear[3],0);assert.deepEqual(measured.half,[200,80,40,128]);assert.deepEqual(measured.opaque,[10,210,90,255]);assert.equal(measured.samples,measured.end_sample-measured.start_sample);
  // The separate WAV begins at the exact saved project sample, without AAC loss.
  py("import sys,zipfile,io,wave;z=zipfile.ZipFile(sys.argv[1]);import json;m=json.loads(z.read('manifest.json'));a=wave.open(io.BytesIO(z.read('audio.wav')));b=wave.open(sys.argv[2]);b.setpos(m['audio']['project_start_sample']);assert a.readframes(a.getnframes())==b.readframes(m['audio']['samples'])",[archive,wav]);
  assert.equal((await get('render/name?project_id='+pid+'&name=確認&preset=png_rgba_zip')).current_job_id,job.id);
  assert.equal((await get('render/name?project_id='+pid+'&name=確認&preset=mp4_h264_aac')).current_job_id,mp4.id);
  await post('render/jobs',{...args,preset:'png_rgba_zip',settings_revision:0},409);
  const second=await wait((await sdk('bai_studio_render_job_start',{...args,preset:'png_rgba_zip',settings_revision:settings.revision,collision_mode:'replace',replace_job_id:job.id})).id);
  const name=await sdk('bai_studio_render_name_preview',{project_id:pid,name:'確認.zip',preset:'png_rgba_zip'});
  await sdk('bai_studio_render_restore',{project_id:pid,name:'確認.zip',job_id:job.id,revision:name.revision,current_job_id:second.id});
  assert.deepEqual(Buffer.from(await (await fetch(s.base+'/api/studio/v05/render/file?id='+mp4.id)).arrayBuffer()),mp4Bytes);
  // A generated translucent GLB is rendered by the real saved-scene capture worker.
  const original=fs.readFileSync(path.join(__dirname,'fixtures/synthetic_test_model.glb')),len=original.readUInt32LE(12),gltf=JSON.parse(original.subarray(20,20+len));
  for(const mat of gltf.materials){mat.alphaMode='BLEND';mat.pbrMetallicRoughness.baseColorFactor=[.8,.1,.2,.5];}
  const doc=Buffer.from(JSON.stringify(gltf)),padding=Buffer.alloc(Math.ceil(doc.length/4)*4,32);doc.copy(padding);const tail=original.subarray(20+len),glb=Buffer.alloc(20+padding.length+tail.length);original.copy(glb,0,0,20);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(padding.length,12);padding.copy(glb,20);tail.copy(glb,20+padding.length);
  const model=(await json(await fetch(s.base+'/api/library-assets/upload?kind=stage&name=alpha-model.glb',{method:'POST',body:glb}))).item.id;
  const p3=(await post('projects',{name:'3D透過の確認',kind:'empty'})).project.id;
  await post('project/fps',{project_id:p3,fps:29.97});
  const a3=await post('arrangement/place',{project_id:p3,revision:0,asset_id:audio,track:'audio',start:0,duration:1});
  const sc3=await post('scene/instances',{project_id:p3,revision:0,action:'add',asset_id:model,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}});
  const r3=await post('timeline/range',{project_id:p3,revision:0,arrangement_revision:a3.revision,in_frame:7,out_frame:9});
  const c3=await sdk('bai_studio_render_settings_save',{project_id:p3,revision:0,preset:'png_rgba_zip',background:{kind:'transparent',color:'#000000'}});
  const j3=await wait((await sdk('bai_studio_render_job_start',{project_id:p3,range_revision:r3.revision,arrangement_revision:a3.revision,scene_revision:sc3.revision,resolution:'720p',preset:'png_rgba_zip',settings_revision:c3.revision,name:'3D透過'})).id);
  assert.equal(j3.scene_capture.frames,3);assert.equal(j3.probe.alpha_min,0);assert.ok(j3.probe.alpha_max>0&&j3.probe.alpha_max<255);fs.writeFileSync(path.join(output,'scene.zip'),Buffer.from(await (await fetch(s.base+'/api/studio/v05/render/file?id='+j3.id)).arrayBuffer()));
  for(const fps of [24,60]){
   const p=(await post('projects',{name:'無音1F-'+fps,kind:'empty'})).project.id;await post('project/fps',{project_id:p,fps});const a=await post('arrangement/place',{project_id:p,revision:0,asset_id:image,track:'image',start:0,duration:1});const r=await post('timeline/range',{project_id:p,revision:0,arrangement_revision:a.revision,in_frame:7,out_frame:7});const c=await sdk('bai_studio_render_settings_save',{project_id:p,revision:0,preset:'png_rgba_zip',background:{kind:'transparent',color:'#000000'}});
   const j=await wait((await sdk('bai_studio_render_job_start',{project_id:p,range_revision:r.revision,arrangement_revision:a.revision,resolution:'720p',preset:'png_rgba_zip',settings_revision:c.revision})).id);assert.equal(j.probe.frames,1);assert.equal(j.probe.audio_samples,48000/fps);
   const silent=path.join(output,'silent-'+fps+'.zip');fs.writeFileSync(silent,Buffer.from(await (await fetch(s.base+'/api/studio/v05/render/file?id='+j.id)).arrayBuffer()));py("import sys,zipfile,wave,io;z=zipfile.ZipFile(sys.argv[1]);a=wave.open(io.BytesIO(z.read('audio.wav')));assert not any(a.readframes(a.getnframes()))",[silent]);
  }
  if(!apiOnly){
   browser=await require('playwright').chromium.launch({executablePath:h.chromiumPath(),args:['--enable-features=WebMCP,WebMCPTesting','--no-sandbox']});page=await s.newPage(browser,{viewport:{width:1440,height:900},expectErrors:[/409 \(Conflict\)/,/422 \(Unprocessable/ ]});await page.goto(s.base+'/studio/v05/index.html');await page.getByRole('button',{name:'制作',exact:true}).click();await page.locator('#v06project').selectOption(pid);await page.getByRole('button',{name:'書き出し',exact:true}).click();
   await page.waitForFunction(()=>document.getElementById('v69settingsStatus').textContent.includes('保存済み'));
   assert.equal(await page.locator('#baiOutputFormat').inputValue(),'png_rgba_zip');
   assert.equal(await page.evaluate(()=>String(document.modelContext.registerTool).includes('[native code]')),true);
   const native=async(name,args={})=>{await h.waitForAsync(page,async expected=>Boolean(document.modelContext&&(await document.modelContext.getTools()).some(t=>t.name===expected)),name);return page.evaluate(async({name,args})=>document.modelContext.executeTool((await document.modelContext.getTools()).find(t=>t.name===name),args),{name,args}).then(value);};
   assert.deepEqual(await native('bai_studio_render_settings_get',{project_id:pid}),settings);
   await page.locator('#v69background').selectOption('solid');await page.locator('#v69backgroundColor').fill('bad');await page.locator('#v69background').selectOption('transparent');assert.equal(await page.locator('#v69backgroundColor').isEnabled(),true);await page.locator('#v69backgroundColor').fill('#000000');
   await page.locator('#baiOutputFormat').selectOption('mp4_h264_aac');await page.waitForFunction(()=>document.getElementById('v69settingsStatus').textContent.includes('透過できません'));assert.equal(await page.locator('#baiAddRender').isDisabled(),true);
   await page.locator('#v69background').selectOption('solid');await page.locator('#v69backgroundColor').fill('#00ff00');await page.locator('#v69saveSettings').press('Enter');await page.waitForFunction(()=>document.getElementById('v69settingsStatus').textContent==='形式・背景：保存済み');
   await page.waitForFunction(()=>document.activeElement.id==='baiOutputFormat');await page.locator('#v69reloadSettings').press('Enter');await page.waitForFunction(()=>document.activeElement.id==='baiOutputFormat');
   await page.reload();await page.getByRole('button',{name:'書き出し',exact:true}).click();await page.waitForFunction(()=>document.getElementById('v69backgroundColor').value==='#00ff00');
   settings=await native('bai_studio_render_settings_get',{project_id:pid});assert.equal(settings.preset,'mp4_h264_aac');
   const green=await wait((await native('bai_studio_render_job_start',{...args,preset:'mp4_h264_aac',settings_revision:settings.revision})).id);
   const greenFile=path.join(output,'green.mp4');fs.writeFileSync(greenFile,Buffer.from(await (await fetch(s.base+'/api/studio/v05/render/file?id='+green.id)).arrayBuffer()));
   const greenPixels=spawnSync('ffmpeg',['-v','error','-i',greenFile,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{maxBuffer:8*1024*1024});assert.equal(greenPixels.status,0);assert.ok(greenPixels.stdout[0]<4&&greenPixels.stdout[1]>250&&greenPixels.stdout[2]<4,'saved green background must reach actual MP4');
   await page.locator('#baiOutputFormat').selectOption('png_rgba_zip');await page.locator('#v69background').selectOption('transparent');await page.locator('#v69saveSettings').click();await page.waitForFunction(()=>document.getElementById('v69settingsStatus').textContent==='形式・背景：保存済み');
   await page.screenshot({path:path.join(output,'settings-1440.png')});
   await page.locator('#baiAddRender').click();await page.waitForFunction(()=>document.getElementById('v69status').textContent.includes('完成・再読込'),null,{timeout:120000});
   assert.equal(await page.locator('#v69video').isVisible(),false);assert.match(await page.locator('#v69resultInfo').innerText(),/straight/);
   await page.waitForFunction(()=>document.getElementById('v69pngPreview')?.complete&&document.getElementById('v69pngPreview').naturalWidth===1280);
   await page.screenshot({path:path.join(output,'completed-1440.png')});
   await page.evaluate(()=>{for(const [id,label] of [['v69exportOptions','① 背景と保存'],['baiAddRender','② 連番を書き出す'],['v69download','③ ZIPを受け取る']]){const r=document.getElementById(id).getBoundingClientRect(),e=document.createElement('div');e.dataset.reviewMarker='true';e.setAttribute('aria-hidden','true');e.style.cssText=`position:fixed;z-index:99999;pointer-events:none;border:2px solid #ffdc54;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;box-sizing:border-box`;const t=document.createElement('span');t.textContent=label;t.style.cssText='position:absolute;left:0;bottom:100%;background:#ffdc54;color:#101820;font:700 13px sans-serif;white-space:nowrap';e.append(t);document.body.append(e);}});await page.screenshot({path:path.join(output,'completed-marked.png')});await page.locator('[data-review-marker]').evaluateAll(es=>es.forEach(e=>e.remove()));
   for(const [width,height] of [[1024,768],[600,720]]){await page.setViewportSize({width,height});await page.screenshot({path:path.join(output,'completed-'+width+'.png')});}
   await page.locator('#v69download').scrollIntoViewIfNeeded();assert.equal(await page.locator('#v69download').isVisible(),true);await page.screenshot({path:path.join(output,'download-600.png')});
   // Native settings mutation and same-revision project switch with a delayed read.
   settings=await native('bai_studio_render_settings_get',{project_id:pid});settings=await native('bai_studio_render_settings_save',{project_id:pid,revision:settings.revision,preset:'png_rgba_zip',background:settings.background});assert.deepEqual(await sdk('bai_studio_render_settings_get',{project_id:pid}),settings);
   const nativeJob=await wait((await native('bai_studio_render_job_start',{...args,preset:'png_rgba_zip',settings_revision:settings.revision})).id);assert.equal(nativeJob.probe.alpha_min,0);
   await page.locator('#v69reloadSettings').click();await page.waitForFunction(()=>document.getElementById('v69settingsStatus').textContent==='形式・背景：保存済み');
   await page.locator('#v69backgroundColor').fill('#ff0000');let beforeOther=await sdk('bai_studio_render_settings_get',{project_id:p3});while(beforeOther.revision<settings.revision)beforeOther=await sdk('bai_studio_render_settings_save',{project_id:p3,revision:beforeOther.revision,preset:beforeOther.preset,background:beforeOther.background});assert.equal(beforeOther.revision,settings.revision);let release;const gate=new Promise(resolve=>release=resolve);
   await page.route('**/render/settings?project_id='+p3,async route=>{await gate;await route.continue();});await page.locator('#v69historyProject').selectOption(p3);await page.waitForFunction(()=>document.getElementById('v69saveSettings').disabled);assert.deepEqual(await sdk('bai_studio_render_settings_get',{project_id:p3}),beforeOther);release();await page.waitForFunction(()=>document.getElementById('v69settingsStatus').textContent==='形式・背景：保存済み');
   h.assertNoErrors(page);
  }
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'PASS',scope:'generated RGBA image/translucent3D + real encoded WAV, settings/revisions, nonzero29.97 range3F, ZIP/MP4 versions/restore, SDK and optional native/UI',ui_native:!apiOnly,review_cases:apiOnly?'not tested':'invalid-color recovery/Enter focus/delayed other-project read/native settings and PNG start',measured,scene:{frames:j3.scene_capture.frames,alpha_min:j3.probe.alpha_min,alpha_max:j3.probe.alpha_max}},null,2));
 }catch(e){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'FAIL',error:e.message}));if(page)await page.screenshot({path:path.join(output,'failure.png')});throw e;}finally{await page?.close();await browser?.close();await client.close();await s.stop();}
});
