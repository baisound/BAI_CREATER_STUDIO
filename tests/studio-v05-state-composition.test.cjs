'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
const harness=require('./helpers/studio-harness.cjs');
const root=path.resolve(__dirname,'..'),out=process.env.BAI_COMPOSITION_OUT,shots=process.env.BAI_COMPOSITION_SHOTS;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),W=320,H=180;
function ff(args,input){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{input,maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout;}
async function json(r,status=200){const t=await r.text();assert.equal(r.status,status,t);return JSON.parse(t);}
function value(r){if(typeof r==='string')r=JSON.parse(r);assert.notEqual(r.isError,true,JSON.stringify(r));return JSON.parse(r.content[0].text);}
function materialFixture(original,alpha){
 const n=original.readUInt32LE(12),doc=JSON.parse(original.subarray(20,20+n));
 doc.materials[0].pbrMetallicRoughness.baseColorFactor=[.1,.8,.9,alpha];doc.materials[0].alphaMode=alpha<1?'BLEND':'OPAQUE';
 const json=Buffer.from(JSON.stringify(doc)),pad=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(pad);
 const rest=original.subarray(20+n),result=Buffer.alloc(20+pad.length+rest.length);original.copy(result,0,0,20);
 result.writeUInt32LE(result.length,8);result.writeUInt32LE(pad.length,12);pad.copy(result,20);rest.copy(result,20+pad.length);return result;
}
function rgb(b){return ff(['-i','pipe:0','-frames:v','1','-vf',`scale=${W}:${H}`,'-pix_fmt','rgb24','-f','rawvideo','pipe:1'],b);}
function compare(a,b){
 const mask=p=>Array.from({length:W*H},(_,i)=>i%W>=2&&i%W<W-2&&Math.floor(i/W)>=2&&Math.floor(i/W)<H-2&&Math.abs(p[i*3]-255)+p[i*3+1]+Math.abs(p[i*3+2]-255)>90);
 const ma=mask(a),mb=mask(b),center=m=>{let x=0,y=0,n=0;for(let i=0;i<m.length;i++)if(m[i]){x+=i%W;y+=Math.floor(i/W);n++;}return [x/n/W,y/n/H,n];};
 let both=0,either=0,allError=0,colorError=0,colorSamples=0;
 for(let i=0;i<ma.length;i++){const x=i%W,y=Math.floor(i/W);if(x<2||y<2||x>=W-2||y>=H-2)continue;
  both+=ma[i]&&mb[i]?1:0;either+=ma[i]||mb[i]?1:0;
  for(let c=0;c<3;c++)allError+=Math.abs(a[i*3+c]-b[i*3+c]);
  if(ma[i]&&mb[i]&&[-2,-1,1,2,-W,W,-2*W,2*W].every(d=>ma[i+d]&&mb[i+d])){
   for(let c=0;c<3;c++)colorError+=Math.abs(a[i*3+c]-b[i*3+c]);colorSamples++;
  }
 }
 const ca=center(ma),cb=center(mb);assert.ok(ca[2]>50&&cb[2]>50&&colorSamples>20,'visible comparison pixels required');
 return {iou:both/either,centerShift:Math.hypot(ca[0]-cb[0],ca[1]-cb[1]),allMae:allError/((W-4)*(H-4)*3),colorMae:colorError/(colorSamples*3),colorSamples};
}
test('saved state survives project switch/reload and matches opaque/transparent MP4 in both pane shapes',{timeout:360000},async()=>{
 const s=await harness.startServer({port:9270}),client=new Client({name:'state-composition',version:'1'});let browser,page;
 const report={status:'in_progress',scope:'generated GLB static state, nonzero In 15..17 at30fps; not arbitrary shaders/moving camera',cases:[]};
 const save=()=>{if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'state-composition.json'),JSON.stringify(report,null,2));}};
 try{
  await client.connect(new StdioClientTransport({command:process.platform==='win32'?'python':'python3',args:['-B',path.join(root,'mcp_server.py')],cwd:root,env:{...process.env,MIXAMO_VIEWER_URL:s.base},stderr:'pipe'}));
  const sdk=(name,args={})=>client.callTool({name,arguments:args}).then(value);
  browser=await require('playwright').chromium.launch({executablePath:harness.chromiumPath(),args:['--enable-features=WebMCP,WebMCPTesting',...(process.env.BAI_REAL_GPU==='1'?['--use-angle=d3d11','--ignore-gpu-blocklist']:harness.CHROMIUM_ARGS||[])]});
  page=await s.newPage(browser,{viewport:{width:1280,height:900}});await page.goto(s.base+'/studio/v05/index.html');
  await page.waitForFunction(()=>window.mixamoWebMcpDiagnostics?.registered.includes('bai_studio_scene_instances_mutate'));
  assert.equal(await page.evaluate(()=>String(document.modelContext.registerTool).includes('[native code]')),true);report.browser=browser.version();
  const native=(name,args={})=>page.evaluate(async({name,args})=>document.modelContext.executeTool((await document.modelContext.getTools()).find(t=>t.name===name),args),{name,args}).then(value);
  const fixture=path.join(__dirname,'fixtures/synthetic_test_model.glb'),original=fs.readFileSync(fixture),originalHash=sha(original);
  const backdrop=path.join(s.dataDir,'magenta.png');ff(['-f','lavfi','-i','color=magenta:s=1280x720','-frames:v','1','-y',backdrop]);
  const image=await json(await fetch(s.base+'/api/library-assets/upload?kind=image&name=magenta.png',{method:'POST',body:fs.readFileSync(backdrop)}));
  const camera={position:[3,2.2,5],target:[.4,1,-.2],fov:38};let previous;
  for(const [label,alpha,savedCamera] of [['saved-opaque',1,true],['auto-opaque',1,false],['saved-transparent',.5,true]]){
   const bytes=materialFixture(original,alpha),upload=await json(await fetch(s.base+'/api/library-assets/upload?kind=stage&name='+label+'.glb',{method:'POST',body:bytes}));
   const id=(await sdk('bai_studio_project_create',{name:label,kind:'empty'})).project.id;await sdk('bai_studio_project_fps_set',{project_id:id,fps:30});
   const transform={position:[.4,0,-.2],rotation:[0,25,0],scale:[1.2,.8,.7]};
   let scene=await native('bai_studio_scene_instances_mutate',{project_id:id,action:'add',revision:0,asset_id:upload.item.id,transform});
   const instance=scene.instances[0].id;scene=await sdk('bai_studio_scene_instances_mutate',{project_id:id,action:'update',revision:scene.revision,instance_id:instance,locked:true});
   if(savedCamera)scene=await sdk('bai_studio_scene_instances_mutate',{project_id:id,action:'camera',revision:scene.revision,camera});
   const a=await sdk('bai_studio_clip_place',{project_id:id,revision:0,asset_id:image.item.id,track:'image',start:0,duration:2});
   const range=await sdk('bai_studio_render_range_set',{project_id:id,revision:0,arrangement_revision:a.revision,in_frame:15,out_frame:17});
   async function open(projectId){await page.locator('#v06project').selectOption(projectId);await page.locator('#nav [data-workspace="edit"]').click();
    if(!await page.locator('#v58-canvas').isVisible())await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(id=>{const x=window.BAIStudioMultiScenePreview?.status();return x?.ready&&x.projectId===id&&x.loaded===1;},projectId);
   }
   await page.reload();await open(id);await page.evaluate(()=>window.BAIStudioMediaPreviewV68.seek(.5));
   if(savedCamera){await page.locator('#v58-save-camera').click();await page.waitForFunction(()=>document.querySelector('#v58-multi-preview').textContent.includes('撮影視点を作品へ保存しました'));
    scene=await sdk('bai_studio_scene_instances_get',{project_id:id});
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.refit());await page.locator('#v58-restore-camera').click();
   }
   if(previous){await open(previous);await open(id);}
   await page.reload();await open(id);await page.evaluate(()=>window.BAIStudioMediaPreviewV68.seek(.5));
   const readback=await native('bai_studio_scene_instances_get',{project_id:id});assert.deepEqual(readback,scene);
   assert.deepEqual(readback.instances[0].transform,transform);assert.equal(!!readback.camera,savedCamera);assert.equal(readback.instances[0].locked,true);assert.equal(readback.instances[0].visible,true);
   const row={label,alpha,savedCamera,sceneRevision:scene.revision,shapes:[]};report.cases.push(row);
   let job=await native('bai_studio_render_job_start',{project_id:id,arrangement_revision:a.revision,range_revision:range.revision,scene_revision:scene.revision,resolution:'720p'});
   const end=Date.now()+120000;while(['queued','running'].includes(job.status)&&Date.now()<end){await new Promise(r=>setTimeout(r,250));job=await sdk('bai_studio_render_job_get',{job_id:job.id});}
   assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,3);row.captureRenderer=job.scene_capture.renderer;
   const mp4=Buffer.from(await(await fetch(s.base+'/api/studio/v05/render/file?id='+job.id)).arrayBuffer());assert.equal(sha(mp4),job.sha256);
   assert.equal((await sdk('bai_studio_render_jobs_list',{project_id:id})).unreadable_count,0);
   const encoded=rgb(mp4);row.outputHash=job.sha256;
   for(const shape of ['wide','tall']){
    await page.setViewportSize(shape==='wide'?{width:1280,height:900}:{width:600,height:950});
    await page.addStyleTag({content:shape==='tall'?'#viewport{height:700px!important;min-height:700px!important}':'#viewport{height:350px!important;min-height:350px!important}'});
    await page.evaluate(()=>window.BAIStudioMediaPreviewV68.seek(.5));await page.waitForTimeout(500);
    const probe=await page.evaluate(id=>window.BAIStudioMultiScenePreview.frameProbe(id),instance);
    assert.equal(probe.cameraSaved,savedCamera);
    if(savedCamera)assert.ok(probe.camera.every((x,i)=>Math.abs(x-scene.camera.position[i])<1e-5));
    const boxes=await page.evaluate(()=>['#v58-canvas','#v68layers'].map(q=>{const r=document.querySelector(q).getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round);}));
    assert.deepEqual(boxes[0],boxes[1]);assert.ok(Math.abs(probe.canvas[0]/probe.canvas[1]-16/9)<.02);
    await page.addStyleTag({content:'#v58-multi-preview,.vp-nav-help{visibility:hidden!important}'});
    const png=await page.locator('#v58-canvas').screenshot();const metrics=compare(rgb(png),encoded);
    await page.addStyleTag({content:'#v58-multi-preview,.vp-nav-help{visibility:visible!important}'});
    row.shapes.push({shape,boxes,previewRenderer:probe.renderer,...metrics});save();
    if(shots){fs.mkdirSync(shots,{recursive:true});fs.writeFileSync(path.join(shots,label+'-'+shape+'.png'),png);ff(['-i','pipe:0','-frames:v','1','-y',path.join(shots,label+'-mp4.png')],mp4);}
    assert.ok(metrics.iou>.85,JSON.stringify(row));assert.ok(metrics.centerShift<.01,JSON.stringify(row));
    assert.ok(metrics.allMae<=4&&metrics.colorMae<=8,'3D compositing color differs: '+JSON.stringify(row));
   }
   assert.deepEqual(await sdk('bai_studio_scene_instances_get',{project_id:id}),scene);previous=id;await page.setViewportSize({width:1280,height:900});
   assert.equal(sha(Buffer.from(await(await fetch(s.base+'/api/library-assets/file/'+encodeURIComponent(upload.item.id))).arrayBuffer())),sha(bytes));
  }
  assert.equal(sha(fs.readFileSync(fixture)),originalHash);harness.assertNoErrors(page);report.status='passed';report.fixtureUnchanged=true;save();console.log(JSON.stringify(report));
 }catch(e){report.status='failed';report.error=e.stack;save();throw e;}
 finally{await client.close();await page?.close();await browser?.close();await s.stop();}
});
