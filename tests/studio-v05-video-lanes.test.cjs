'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {Client}=require('@modelcontextprotocol/client');
const {StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
const harness=require('./helpers/studio-harness.cjs');
const root=path.resolve(__dirname,'..'),apiOnly=process.env.BAI_VIDEO_LANES_API_ONLY==='1';
const native=!apiOnly&&process.env.BAI_NATIVE_WEBMCP==='1';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function json(r,status=200){const text=await r.text();assert.equal(r.status,status,text);return JSON.parse(text);}
function value(r,error=false){if(typeof r==='string')r=JSON.parse(r);assert.equal(r.isError===true,error,JSON.stringify(r));return error?r:JSON.parse(r.content[0].text);}
function ff(args,input){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{input,maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout;}
const color=(bytes)=>[...ff(['-i','pipe:0','-vf','format=rgb24,crop=2:2:iw/2:ih/2','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],bytes).subarray(0,3)];
function sameColor(actual,expected){assert.ok(actual.every((n,i)=>expected[i]>128?n>180:n<80),`${actual} expected marker ${expected}`);}
function tone(pcm,second,hz){let a=0,b=0;for(let i=0;i<4000;i++){const x=pcm.readInt16LE((Math.round(second*8000)+i)*2),phase=2*Math.PI*hz*i/8000;a+=x*Math.sin(phase);b+=x*Math.cos(phase);}return Math.hypot(a,b)*2/4000;}

test('stable video lanes share saved source windows, overlap pixels and sound across UI and both MCP paths',
 {timeout:360000},async()=>{
 const server=await harness.startServer({port:apiOnly?9145:9144});
 const transport=new StdioClientTransport({command:process.platform==='win32'?'python':'python3',args:['-B',path.join(root,'mcp_server.py')],cwd:root,
  env:{...process.env,MIXAMO_VIEWER_URL:server.base,PYTHONUTF8:'0',PYTHONIOENCODING:'cp932'},stderr:'pipe'});
 const client=new Client({name:'stable-video-lanes',version:'1.0.0'});
 const raw=(name,args={})=>client.callTool({name,arguments:args}),sdk=async(name,args={})=>value(await raw(name,args));
 let page,browser,stderr='';transport.stderr?.on('data',b=>stderr+=b);
 try{
  await client.connect(transport);const id=(await sdk('bai_studio_project_create',{name:'動画行の保存と重なり',kind:'empty'})).project.id;
  await sdk('bai_studio_project_fps_set',{project_id:id,fps:29.97});
  const sources=[];
  for(const [name,tint,hz] of [['red','red',440],['green','lime',660],['yellow','yellow',880]]){
   const file=path.join(server.dataDir,name+'.mp4');
   ff(['-f','lavfi','-i',`color=c=${tint}:s=320x180:r=30:d=8`,'-f','lavfi','-i',`sine=frequency=${hz}:sample_rate=48000:duration=8`,
    ...(name==='green'?['-vf',"drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable='gte(t,1)'"]:[]),'-c:v','libx264','-c:a','aac','-y',file]);
   const bytes=fs.readFileSync(file),item=(await json(await fetch(`${server.base}/api/library-assets/upload?kind=video&name=${name}.mp4`,{method:'POST',body:bytes}))).item;
   sources.push({file,item,sha:sha(bytes)});
  }
  const get=()=>sdk('bai_studio_track_layout_get',{project_id:id});
  const set=async action=>sdk('bai_studio_track_layout_set',{project_id:id,revision:(await get()).revision,...action});
  const open=async()=>{
   await page.goto(server.base+'/studio/v05/index.html');await page.locator('#v06project').selectOption(id);await page.locator('#nav [data-workspace="edit"]').click();
   await page.waitForFunction(id=>window.BAIStudioMediaPreviewV68?.status().ready&&window.BAIStudioMediaPreviewV68.status().projectId===id,id);
  };
  if(!apiOnly){
   browser=await require('playwright').chromium.launch({executablePath:harness.chromiumPath(),args:[...(native?['--enable-features=WebMCPTesting']:[]),'--autoplay-policy=no-user-gesture-required']});
   page=await server.newPage(browser);await open();await page.locator('#vVideoLanes summary').click();await page.locator('#vVideoLaneAdd').click();
   await page.locator('#v07timeline [data-track="video"][data-lane="2"]').waitFor();
  }else await set({action:'add_video_lane'});
  await set({action:'add_video_lane'});assert.deepEqual((await get()).video_lane_ids,[1,2,3]);
  let arrangement;
  if(page){
   await page.locator('#v06cat').selectOption('video');await page.waitForFunction(()=>[...document.querySelectorAll('#v06results [draggable]')].some(e=>e.textContent.includes('red')));
   const source=page.locator('#v06results [draggable]').filter({hasText:'red'}).first();
   await source.dragTo(page.locator('#v07timeline [data-track="video"][data-lane="1"]'),{targetPosition:{x:2,y:15}});
   await page.locator('#v07timeline [data-track="video"][data-lane="1"] [data-clip-id]').waitFor();
   arrangement=await sdk('bai_studio_arrangement_get',{project_id:id});
   assert.ok(arrangement.clips[0].start<=.1);assert.equal(arrangement.clips[0].lane,1);
   arrangement=await sdk('bai_studio_clip_edit',{project_id:id,revision:arrangement.revision,clip_id:arrangement.clips[0].id,action:'update',track:'video',lane:1,start:0,duration:6,source_start:0});
  }else arrangement=await sdk('bai_studio_clip_place',{project_id:id,revision:0,asset_id:sources[0].item.id,track:'video',lane:1,start:0,duration:6});
  arrangement=await sdk('bai_studio_clip_place',{project_id:id,revision:arrangement.revision,asset_id:sources[1].item.id,track:'video',lane:2,start:1,duration:2});
  const foreground=arrangement.clip;
  if(page){
   await open();await page.locator(`#v07timeline [data-clip-id="${foreground.id}"]`).dblclick();
   await page.locator('#v77EditLane').selectOption('3');await page.locator('#v78SourceStart').fill('.5');await page.locator('#v08save').click();
   await page.locator(`#v07timeline [data-track="video"][data-lane="3"] [data-clip-id="${foreground.id}"]`).waitFor();
   await page.locator('#vVideoLanes summary').click();await page.locator('#vVideoLaneRemoveId').selectOption('2');await page.locator('#vVideoLaneRemove').click();
   await page.waitForFunction(()=>!document.querySelector('#v07timeline [data-track="video"][data-lane="2"]'));
  }else{
   await sdk('bai_studio_clip_edit',{project_id:id,revision:arrangement.revision,clip_id:foreground.id,action:'update',track:'video',lane:3,start:1,duration:2,source_start:.5});
   await set({action:'remove_video_lane',lane:2});
  }
  let web= sdk;
  if(native){
   await page.waitForFunction(()=>window.mixamoWebMcpDiagnostics?.registered.includes('bai_studio_track_layout_set'));
   assert.equal(await page.evaluate(()=>String(document.modelContext.registerTool).includes('[native code]')),true);
   web=async(name,args)=>value(await page.evaluate(async({name,args})=>{const t=(await document.modelContext.getTools()).find(t=>t.name===name);return document.modelContext.executeTool(t,args);},{name,args}));
  }
  await web('bai_studio_track_layout_set',{project_id:id,revision:(await get()).revision,action:'add_video_lane'});
  let layout=await get();assert.deepEqual(layout.video_lane_ids,[1,3,4]);assert.equal(layout.next_video_lane_id,5);
  if(page){
   await page.locator('#v07timeline [data-track="video"][data-lane="4"]').waitFor();
   for(const target of [4,3]){
    const button=page.locator(`#v07timeline [data-clip-id="${foreground.id}"]`);await button.scrollIntoViewIfNeeded();
    const a=await button.boundingBox(),b=await page.locator(`#v07timeline [data-track="video"][data-lane="${target}"]`).boundingBox();
    await page.mouse.move(a.x+12,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+12,b.y+b.height/2,{steps:6});await page.mouse.up();
    await page.locator(`#v07timeline [data-track="video"][data-lane="${target}"] [data-clip-id="${foreground.id}"]`).waitFor();
   }
   const label=page.locator('#v07timeline [data-track="video"][data-lane="4"]').locator('..').locator('.v77-track-label span').first();
   await label.dblclick();const name=page.getByRole('textbox',{name:'video:4 トラック名',exact:true});await name.fill('前景動画');await name.press('Enter');
   await page.waitForFunction(()=>[...document.querySelectorAll('.v77-track-label span')].some(n=>n.textContent==='前景動画'));
   layout=await get();assert.equal(layout.labels['video:4'],'前景動画');
  }

  arrangement=await sdk('bai_studio_arrangement_get',{project_id:id});
  arrangement=await web('bai_studio_clip_place',{project_id:id,revision:arrangement.revision,asset_id:sources[2].item.id,track:'video',lane:4,start:2,duration:2});
  const saved=(await sdk('bai_studio_arrangement_get',{project_id:id})).clips;
  assert.equal(saved.find(c=>c.id===foreground.id).source_start,.5);
  const refuse=async(name,args)=>{value(await raw(name,args),true);assert.deepEqual(await get(),layout);assert.deepEqual((await sdk('bai_studio_arrangement_get',{project_id:id})).clips,saved);};
  await refuse('bai_studio_track_layout_set',{project_id:id,revision:layout.revision,action:'remove_video_lane',lane:3});
  await refuse('bai_studio_track_layout_set',{project_id:id,revision:layout.revision,action:'remove_video_lane',lane:2});
  await refuse('bai_studio_track_layout_set',{project_id:id,revision:layout.revision-1,action:'add_video_lane'});
  await refuse('bai_studio_clip_edit',{project_id:id,revision:arrangement.revision,clip_id:foreground.id,action:'update',track:'video',lane:2,start:1,duration:2,source_start:.5});
  await refuse('bai_studio_clip_edit',{project_id:id,revision:arrangement.revision,clip_id:foreground.id,action:'update',track:'video',lane:3,start:1,duration:2,source_start:7});
  layout=await sdk('bai_studio_track_flags_set',{project_id:id,revision:layout.revision,locked:['video'],muted:[]});
  await refuse('bai_studio_clip_edit',{project_id:id,revision:arrangement.revision,clip_id:foreground.id,action:'update',track:'video',lane:4,start:1,duration:2,source_start:.5});
  layout=await sdk('bai_studio_track_flags_set',{project_id:id,revision:layout.revision,locked:[],muted:[]});
  const samples=[[0,[253,0,0]],[29,[253,0,0]],[30,[0,254,0]],[44,[0,254,0]],[45,[0,0,254]],[59,[0,0,254]],[60,[253,253,0]],[89,[253,253,0]],[90,[253,253,0]],[119,[253,253,0]],[120,[253,0,0]],[179,[253,0,0]]];
  if(page){
   await open();await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68.status().mediaCount===3);
   for(const [frame,expected] of samples){
    await page.locator('#v68frame').fill(String(frame));await page.locator('#v68seek').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('#v68layers video')].filter(e=>!e.hidden).every(e=>!e.seeking&&e.readyState>=2)&&document.querySelector('#v68stageNote').hidden);
    const png=await page.locator('#v68layers').screenshot();if(process.env.BAI_VIDEO_LANES_OUT){fs.mkdirSync(process.env.BAI_VIDEO_LANES_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.BAI_VIDEO_LANES_OUT,`preview-F${frame}.png`),png);}
    console.log(JSON.stringify({previewFrame:frame,rgb:color(png)}));sameColor(color(png),expected);
   }
   if(process.env.BAI_VIDEO_LANES_OUT){fs.mkdirSync(process.env.BAI_VIDEO_LANES_OUT,{recursive:true});await page.locator('#v07timeline [data-track="video"][data-lane="4"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.BAI_VIDEO_LANES_OUT,'video-lanes.png')});}
  }
  const range=await sdk('bai_studio_render_range_set',{project_id:id,revision:0,arrangement_revision:arrangement.revision,in_frame:0,out_frame:179});
  const outputs=[];
  for(const muted of [false,true]){
   if(muted){layout=await web('bai_studio_track_flags_set',{project_id:id,revision:layout.revision,locked:[],muted:['video']});}
   const started=await web('bai_studio_render_job_start',{project_id:id,arrangement_revision:arrangement.revision,range_revision:range.revision,resolution:'720p',name:'動画行の重なり'});
   let job;const deadline=Date.now()+120000;
   do{await new Promise(r=>setTimeout(r,200));job=await sdk('bai_studio_render_job_get',{job_id:started.id});}while(['queued','running'].includes(job.status)&&Date.now()<deadline);
   assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,180);
   const movie=Buffer.from(await(await fetch(`${server.base}/api/studio/v05/render/file?id=${job.id}`)).arrayBuffer());assert.equal(sha(movie),job.sha256);
   const colors=ff(['-i','pipe:0','-vf',`select=${samples.map(([f])=>`eq(n\\,${f})`).join('+')},scale=1:1`,'-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],movie);
   console.log(JSON.stringify({muted,frameMarkers:samples.map(([frame],i)=>({frame,rgb:[...colors.subarray(i*3,i*3+3)]}))}));
   assert.equal(colors.length,samples.length*3);samples.forEach(([,expected],i)=>sameColor([...colors.subarray(i*3,i*3+3)],expected));
   const pcm=ff(['-i','pipe:0','-ar','8000','-ac','1','-f','s16le','pipe:1'],movie),audio=[];
   for(const [time,active] of [[.2,[1,0,0]],[1.1,[1,1,0]],[2.1,[1,1,1]],[3.1,[1,0,1]],[4.5,[1,0,0]]]){
    const amps=[440,660,880].map(hz=>tone(pcm,time,hz));amps.forEach((amp,i)=>assert.ok(!muted&&active[i]?amp>400:amp<20,JSON.stringify({muted,time,amps})));audio.push({time,amps});
   }
   outputs.push({jobId:job.id,sha256:job.sha256,frames:180,muted,checkedColors:samples.length,audio});
   if(process.env.BAI_VIDEO_LANES_OUT){fs.mkdirSync(process.env.BAI_VIDEO_LANES_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.BAI_VIDEO_LANES_OUT,`video-lanes-${muted?'muted':'sound'}.mp4`),movie);}
  }
  assert.deepEqual((await sdk('bai_studio_arrangement_get',{project_id:id})).clips,saved);
  for(const source of sources)assert.equal(sha(fs.readFileSync(source.file)),source.sha);
  assert.deepEqual((await get()).video_lane_ids,[1,3,4]);assert.equal(stderr,'');if(page)harness.assertNoErrors(page);
  const result={native,apiOnly,projectId:id,laneIds:layout.video_lane_ids,nextLaneId:layout.next_video_lane_id,savedClips:saved,sourceHashes:sources.map(s=>s.sha),outputs,inputsUnchanged:true,refusalsPreserveState:true};
  if(process.env.BAI_VIDEO_LANES_OUT)fs.writeFileSync(path.join(process.env.BAI_VIDEO_LANES_OUT,`evidence-${apiOnly?'api':'chrome'}.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }finally{await client.close();await page?.close();await browser?.close();await server.stop();}
});
