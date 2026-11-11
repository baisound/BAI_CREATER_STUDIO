'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
const harness=require('./helpers/studio-harness.cjs');
const root=path.resolve(__dirname,'..'),apiOnly=process.env.BAI_HISTORY_API_ONLY==='1',out=process.env.BAI_HISTORY_OUT;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function ff(args){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{maxBuffer:100*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout;}
function value(r){if(typeof r==='string')r=JSON.parse(r);assert.notEqual(r.isError,true,JSON.stringify(r));return JSON.parse(r.content[0].text);}
async function json(r,status=200){const text=await r.text();assert.equal(r.status,status,text);return JSON.parse(text);}

test('clip Undo/Redo persists exact split windows through UI, SDK/native MCP and decoded MP4', {timeout:300000},async()=>{
 const s=await harness.startServer({port:apiOnly?9251:9250});
 const client=new Client({name:'clip-history-acceptance',version:'1'});let browser,page;
 const report={status:'in_progress',apiOnly,scope:'clip metadata only, not track layout/mutes/face or application-wide history'};
 const save=()=>{if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'clip-history.json'),JSON.stringify(report,null,2));}};
 try{
  await client.connect(new StdioClientTransport({command:process.platform==='win32'?'python':'python3',args:['-B',path.join(root,'mcp_server.py')],cwd:root,env:{...process.env,MIXAMO_VIEWER_URL:s.base},stderr:'pipe'}));
  const sdk=(name,args={})=>client.callTool({name,arguments:args}).then(value);
  assert.ok((await client.listTools()).tools.some(t=>t.name==='bai_studio_clip_redo'));
  if(!apiOnly){
   browser=await require('playwright').chromium.launch({executablePath:harness.chromiumPath(),args:['--enable-features=WebMCPTesting','--autoplay-policy=no-user-gesture-required']});
   page=await s.newPage(browser,{viewport:{width:1280,height:800}});await page.goto(s.base+'/studio/v05/index.html');
   await page.waitForFunction(()=>window.mixamoWebMcpDiagnostics?.registered.includes('bai_studio_clip_redo'));
   assert.equal(await page.evaluate(()=>String(document.modelContext.registerTool).includes('[native code]')),true);report.browser=browser.version();
  }
  const native=(name,args={})=>page?page.evaluate(async({name,args})=>document.modelContext.executeTool((await document.modelContext.getTools()).find(t=>t.name===name),args),{name,args}).then(value):sdk(name,args);
  const sourceVideo=process.env.BAI_HISTORY_REAL_VIDEO||path.join(s.dataDir,'clock.mp4'),sourceAudio=path.join(s.dataDir,'sound.wav'),sourceImage=path.join(s.dataDir,'blue.png');
  report.inputKind=process.env.BAI_HISTORY_REAL_VIDEO?'existing_real_video_read_only_plus_generated_wav_image':'generated_video_wav_image';
  if(!process.env.BAI_HISTORY_REAL_VIDEO)ff(['-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=6','-f','lavfi','-i','anoisesrc=amplitude=0.1:seed=44:duration=6:sample_rate=48000','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-y',sourceVideo]);
  ff(['-f','lavfi','-i','anoisesrc=amplitude=0.1:seed=5:duration=6:sample_rate=48000','-y',sourceAudio]);
  ff(['-f','lavfi','-i','color=blue:s=160x90','-frames:v','1','-y',sourceImage]);
  const inputs=[];
  for(const [kind,file] of [['video',sourceVideo],['audio',sourceAudio],['image',sourceImage]]){
   const original=fs.readFileSync(file),r=await json(await fetch(s.base+'/api/library-assets/upload?kind='+kind+'&name='+path.basename(file),{method:'POST',body:original}));
   inputs.push({kind,file,hash:sha(original),id:r.item.id});
  }
  const id=(await sdk('bai_studio_project_create',{name:'クリップ履歴 検証専用',kind:'empty'})).project.id;
  await sdk('bai_studio_project_fps_set',{project_id:id,fps:30});
  const read=()=>sdk('bai_studio_arrangement_get',{project_id:id});let a={revision:0};
  for(const [index,start,duration] of [[2,0,8],[0,1,4],[1,2,3]]){
   const i=inputs[index];a=await sdk('bai_studio_clip_place',{project_id:id,revision:a.revision,asset_id:i.id,track:i.kind,start,duration});
   if(i.kind!=='image')a=await sdk('bai_studio_clip_edit',{project_id:id,revision:a.revision,clip_id:a.clip.id,action:'update',track:i.kind,start,duration,source_start:i.kind==='video'?.5:.7});
  }
  const base=await read(),video=base.clips.find(c=>c.category==='video'),audio=base.clips.find(c=>c.category==='audio');
  assert.equal('clip_history' in base,false);
  async function render(name){
   const saved=await read(),r=await sdk('bai_studio_render_range_get',{project_id:id});
   const range=await sdk('bai_studio_render_range_set',{project_id:id,revision:r.revision,arrangement_revision:saved.revision,in_frame:0,out_frame:239});
   let job=await sdk('bai_studio_render_job_start',{project_id:id,arrangement_revision:saved.revision,range_revision:range.revision,resolution:'720p',name});
   const deadline=Date.now()+90000;
   while(['queued','running'].includes(job.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,150));job=await sdk('bai_studio_render_job_get',{job_id:job.id});}
   assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,240);
   const bytes=Buffer.from(await(await fetch(s.base+'/api/studio/v05/render/file?id='+job.id)).arrayBuffer());assert.equal(sha(bytes),job.sha256);
   const file=path.join(s.dataDir,name+'.mp4');fs.writeFileSync(file,bytes);
   return {job,file,frames:sha(ff(['-i',file,'-an','-vf','scale=32:18','-f','framemd5','pipe:1'])),pcm:sha(ff(['-i',file,'-map','0:a:0','-ac','1','-ar','8000','-f','s16le','pipe:1']))};
  }
  const original=await render('before-edit');
  a=await native('bai_studio_clip_split',{project_id:id,revision:base.revision,clip_id:video.id,split_at:3});
  const right=a.right;
  a=await native('bai_studio_clip_edit',{project_id:id,revision:a.revision,clip_id:right.id,action:'update',track:'video',start:5,duration:right.duration,source_start:right.source_start});
  a=await sdk('bai_studio_clip_edit',{project_id:id,revision:a.revision,clip_id:audio.id,action:'delete'});
  const edited=await read();
  async function open(){
   await page.reload();await page.locator('#v06project').selectOption(id);await page.locator('#nav [data-workspace="edit"]').click();
   await page.locator('#vClipUndo').waitFor();
  }
  async function ui(action){
   const before=await read();
   if(!page)return sdk('bai_studio_clip_'+action,{project_id:id,revision:before.revision});
   await open();await page.locator(action==='undo'?'#vClipUndo':'#vClipRedo').click();
   await harness.waitForAsync(page,async expected=>{const r=await fetch('/api/studio/v05/arrangement?id='+document.querySelector('#v06project').value);return(await r.json()).revision===expected;},before.revision+1,{timeout:10000});
  }
  await ui('undo');assert.ok((await read()).clips.some(c=>c.id===audio.id));
  await ui('undo');
  a=await read();await native('bai_studio_clip_undo',{project_id:id,revision:a.revision});
  assert.deepEqual((await read()).clips,base.clips);
  const restored=await render('after-undo');assert.equal(restored.frames,original.frames);assert.equal(restored.pcm,original.pcm);
  a=await read();await sdk('bai_studio_clip_redo',{project_id:id,revision:a.revision});
  a=await read();await native('bai_studio_clip_redo',{project_id:id,revision:a.revision});
  await ui('redo');assert.deepEqual((await read()).clips,edited.clips);
  const redone=await render('after-redo');assert.notEqual(redone.frames,original.frames);assert.notEqual(redone.pcm,original.pcm);
  await ui('undo');a=await read();
  await sdk('bai_studio_clip_edit',{project_id:id,revision:a.revision,clip_id:video.id,action:'update',track:'video',start:1.1,duration:2,source_start:.5});
  a=await read();assert.equal(a.edit_history.redo_count,0);
  let r=await fetch(s.base+'/api/studio/v05/arrangement/history/redo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,revision:a.revision})});assert.equal(r.status,400);
  r=await fetch(s.base+'/api/studio/v05/arrangement/history/undo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,revision:a.revision-1})});assert.equal(r.status,409);
  let layout=await sdk('bai_studio_track_layout_get',{project_id:id});
  layout=await sdk('bai_studio_track_flags_set',{project_id:id,revision:layout.revision,locked:['video'],muted:[]});
  const rejected=await client.callTool({name:'bai_studio_clip_undo',arguments:{project_id:id,revision:a.revision}});assert.equal(rejected.isError,true);
  assert.deepEqual(await read(),a);
  await sdk('bai_studio_track_flags_set',{project_id:id,revision:layout.revision,locked:[],muted:[]});
  if(page){
   await open();assert.equal(await page.locator('#vClipUndo').isEnabled(),true);assert.equal(await page.locator('#vClipRedo').isDisabled(),true);
   assert.deepEqual((await read()).clips,a.clips);
   await page.evaluate(()=>document.querySelector('#vClipUndo').focus());
   assert.equal(await page.locator('#vClipUndo').evaluate(e=>document.activeElement===e),true);
   await page.setViewportSize({width:900,height:760});await page.locator('#vClipUndo').scrollIntoViewIfNeeded();
   assert.ok(await page.locator('#vClipUndo').boundingBox());harness.assertNoErrors(page);
   await ui('undo');assert.notDeepEqual((await read()).clips,a.clips);
   await ui('redo');assert.deepEqual((await read()).clips,a.clips);
   if(process.env.BAI_HISTORY_SCREENSHOT){fs.mkdirSync(path.dirname(process.env.BAI_HISTORY_SCREENSHOT),{recursive:true});await page.screenshot({path:process.env.BAI_HISTORY_SCREENSHOT});}
  }
  for(const i of inputs){assert.equal(sha(fs.readFileSync(i.file)),i.hash);assert.equal(sha(Buffer.from(await(await fetch(s.base+'/api/library-assets/file/'+encodeURIComponent(i.id))).arrayBuffer())),i.hash);}
  assert.equal(sha(Buffer.from(await(await fetch(s.base+'/api/studio/v05/render/file?id='+original.job.id)).arrayBuffer())),original.job.sha256);
  report.status='passed';report.frames=240;report.originalAndRestoredDecodedVideo=original.frames;report.originalAndRestoredPcm=original.pcm;
  report.redoneDecodedVideo=redone.frames;report.redonePcm=redone.pcm;report.reopenedClips=a.clips;report.history=a.edit_history;
  report.rejectedWritesUnchanged=true;report.inputsAndPriorOutputUnchanged=true;report.inputHashes=inputs.map(({kind,hash})=>({kind,hash}));report.native=!apiOnly;save();
  console.log(JSON.stringify(report));
 }catch(e){report.status='failed';report.error=e.stack;save();throw e;}
 finally{await client.close();await page?.close();await browser?.close();await s.stop();}
});
