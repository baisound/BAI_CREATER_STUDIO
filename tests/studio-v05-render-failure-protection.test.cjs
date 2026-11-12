'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
const harness=require('./helpers/studio-harness.cjs');
const root=path.resolve(__dirname,'..'),apiOnly=process.env.BAI_FAILURE_API_ONLY==='1',out=process.env.BAI_FAILURE_OUT;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function ff(args){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{maxBuffer:100*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout;}
function value(r){if(typeof r==='string')r=JSON.parse(r);assert.notEqual(r.isError,true,JSON.stringify(r));return JSON.parse(r.content[0].text);}
async function json(r,status=200){const text=await r.text();assert.equal(r.status,status,text);return JSON.parse(text);}

test('storage/launch faults allow retry, committed-state recovery and verified older downloads', {timeout:300000},async()=>{
 const beforePath=process.env.PYTHONPATH,beforeFlag=process.env.BAI_RENDER_FAILURE_TEST;
 process.env.PYTHONPATH=[root,path.join(__dirname,'helpers/render-failure-injection'),...(beforePath?[beforePath]:[])].join(path.delimiter);
 process.env.BAI_RENDER_FAILURE_TEST='render-protection-20261112';
 let s;
 try{s=await harness.startServer({port:apiOnly?9261:9260});}
 finally{if(beforePath===undefined)delete process.env.PYTHONPATH;else process.env.PYTHONPATH=beforePath;if(beforeFlag===undefined)delete process.env.BAI_RENDER_FAILURE_TEST;else process.env.BAI_RENDER_FAILURE_TEST=beforeFlag;}
 const client=new Client({name:'render-failure-acceptance',version:'1'});let browser,page;
 const report={status:'in_progress',apiOnly,faultKind:'isolated per-operation ENOSPC/launch injection, not physical disk exhaustion'};
 const save=()=>{if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'render-protection.json'),JSON.stringify(report,null,2));}};
 try{
  await client.connect(new StdioClientTransport({command:process.platform==='win32'?'python':'python3',args:['-B',path.join(root,'mcp_server.py')],cwd:root,env:{...process.env,MIXAMO_VIEWER_URL:s.base},stderr:'pipe'}));
  const sdk=(name,args={})=>client.callTool({name,arguments:args}).then(value);
  const fault=mode=>fs.writeFileSync(path.join(s.dataDir,'render-fault-control.txt'),mode);
  if(!apiOnly){browser=await require('playwright').chromium.launch({executablePath:harness.chromiumPath(),args:['--enable-features=WebMCP,WebMCPTesting','--autoplay-policy=no-user-gesture-required']});
   page=await s.newPage(browser,{viewport:{width:1280,height:900}});await page.goto(s.base+'/studio/v05/index.html');
   await page.waitForFunction(()=>window.mixamoWebMcpDiagnostics?.registered.includes('bai_studio_render_job_start'));
   assert.equal(await page.evaluate(()=>String(document.modelContext.registerTool).includes('[native code]')),true);report.browser=browser.version();}
  const nativeRaw=(name,args={})=>page?page.evaluate(async({name,args})=>document.modelContext.executeTool((await document.modelContext.getTools()).find(t=>t.name===name),args),{name,args}):client.callTool({name,arguments:args});
  const native=(name,args={})=>nativeRaw(name,args).then(value);
  const source=process.env.BAI_FAILURE_REAL_VIDEO||path.join(s.dataDir,'blue.png');
  if(!process.env.BAI_FAILURE_REAL_VIDEO)ff(['-f','lavfi','-i','color=blue:s=160x90','-frames:v','1','-y',source]);
  const inputBytes=fs.readFileSync(source),inputHash=sha(inputBytes),kind=process.env.BAI_FAILURE_REAL_VIDEO?'video':'image';
  const upload=await json(await fetch(s.base+'/api/library-assets/upload?kind='+kind+'&name='+path.basename(source),{method:'POST',body:inputBytes}));
  const id=(await sdk('bai_studio_project_create',{name:'書き出し保存障害の検証',kind:'empty'})).project.id;
  await sdk('bai_studio_project_fps_set',{project_id:id,fps:30});
  let a=await sdk('bai_studio_clip_place',{project_id:id,revision:0,asset_id:upload.item.id,track:kind,start:0,duration:2});
  if(kind==='video')a=await sdk('bai_studio_clip_edit',{project_id:id,revision:a.revision,clip_id:a.clip.id,action:'update',track:'video',start:0,duration:2,source_start:1.1});
  const range=await sdk('bai_studio_render_range_set',{project_id:id,revision:0,arrangement_revision:a.revision,in_frame:0,out_frame:29});
  const body={project_id:id,arrangement_revision:a.revision,range_revision:range.revision,resolution:'720p'};
  const renderRoot=path.join(s.dataDir,'studio_v05_media_renders'),index=path.join(renderRoot,'names',sha(Buffer.from(id))+'.json');
  async function wait(job,status='succeeded'){
   const end=Date.now()+90000;while(['queued','running'].includes(job.status)&&Date.now()<end){await new Promise(r=>setTimeout(r,150));job=await sdk('bai_studio_render_job_get',{job_id:job.id});}
   assert.equal(job.status,status,job.error);if(status==='succeeded')assert.equal(job.probe.frames,30);return job;
  }
  async function download(job){const r=await fetch(s.base+'/api/studio/v05/render/file?id='+job.id);assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(sha(bytes),job.sha256);return bytes;}
  const old=await wait(await sdk('bai_studio_render_job_start',{...body,name:'保存保護'})),oldBytes=await download(old);
  const originalIndex=fs.readFileSync(index);
  fault('queued');let response=await fetch(s.base+'/api/studio/v05/render/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,name:'開始失敗'})});
  const full=await json(response,507);assert.match(full.error,/空き容量/);assert.deepEqual(await download(old),oldBytes);fault('');
  fault('thread-launch');let failedRaw=await nativeRaw('bai_studio_render_job_start',{...body,name:'起動失敗'});if(typeof failedRaw==='string')failedRaw=JSON.parse(failedRaw);
  assert.equal(failedRaw.isError,true);if(page)harness.expectErrors(page,[/console: Failed to load resource: the server responded with a status of 503/]);fault('');
  const interruptedId=crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(renderRoot,'jobs',interruptedId+'.json'),JSON.stringify({id:interruptedId,project_id:id,status:'running',created_at:Date.now()/1000}));
  fault('all-job-writes');const partial=await sdk('bai_studio_render_jobs_list',{project_id:id,completed_only:true});
  assert.ok(partial.unreadable_count>=1);assert.ok(partial.jobs.some(j=>j.id===old.id));assert.deepEqual(await download(old),oldBytes);
  if(page){await page.reload();await page.locator('#nav [data-workspace="edit"]').click();await page.locator('#v06project').selectOption(id);await page.locator('#nav [data-workspace="export"]').click();
   await page.locator('#v69historyWarning').waitFor();await page.locator(`.v69job[data-job-id="${old.id}"] a[data-action="download"]`).waitFor();
   const d=page.waitForEvent('download');await page.locator(`.v69job[data-job-id="${old.id}"] a[data-action="download"]`).click();
   const file=await(await d).path();assert.equal(sha(fs.readFileSync(file)),old.sha256);report.actualOldDownloadDuringStorageFault=true;}
  fault('');
  fault('name-index');const failed=await wait(await sdk('bai_studio_render_job_start',{...body,name:'保存保護',collision_mode:'replace',replace_job_id:old.id}),'failed');
  assert.match(failed.error,/空き容量/);assert.deepEqual(fs.readFileSync(index),originalIndex);assert.deepEqual(await download(old),oldBytes);fault('');
  let retry;
  if(page){await page.locator('#v69refreshHistory').click();await page.locator(`.v69job[data-job-id="${failed.id}"]`).waitFor({state:'visible'});
   await page.locator('#v69name').fill('保存保護');await page.locator('#v69name').dispatchEvent('change');await page.locator('#v69nameMode').selectOption('version');
   await page.locator('#baiAddRender').click();
   await harness.waitForAsync(page,async projectId=>(await(await fetch('/api/studio/v05/render/jobs?project_id='+projectId)).json()).jobs.some(j=>j.download_name==='保存保護-v02.mp4'),id);
   retry=(await sdk('bai_studio_render_jobs_list',{project_id:id})).jobs.find(j=>j.download_name==='保存保護-v02.mp4');retry=await wait(retry);
  }else retry=await wait(await sdk('bai_studio_render_job_start',{...body,name:'保存保護',collision_mode:'version'}));
  assert.equal(retry.download_name,'保存保護-v02.mp4');assert.notEqual(retry.id,failed.id);assert.deepEqual(await download(old),oldBytes);
  fault('final-save-once');const recovered=await wait(await native('bai_studio_render_job_start',body));
  assert.equal(recovered.temporary_cleanup,'complete');await download(recovered);
  const replaced=await wait(await native('bai_studio_render_job_start',{...body,name:'保存保護',collision_mode:'replace',replace_job_id:old.id}));
  assert.deepEqual(await download(old),oldBytes);const healthyIndex=fs.readFileSync(index);
  const oldFile=path.join(renderRoot,'files',old.id+'.mp4'),tampered=Buffer.from(oldBytes);tampered[Math.min(100,tampered.length-1)]^=1;fs.writeFileSync(oldFile,tampered);
  response=await fetch(s.base+'/api/studio/v05/render/file?id='+old.id,{headers:{Range:'bytes=0-31'}});assert.match((await json(response,422)).error,/内容/);
  const info=await sdk('bai_studio_render_name_preview',{project_id:id,name:'保存保護'});
  const blocked=await client.callTool({name:'bai_studio_render_restore',arguments:{project_id:id,name:'保存保護',job_id:old.id,revision:info.revision,current_job_id:info.current_job_id}});assert.equal(blocked.isError,true);
  assert.deepEqual(fs.readFileSync(index),healthyIndex);assert.deepEqual(fs.readFileSync(oldFile),tampered);await download(replaced);await download(retry);
  if(page){await page.locator('#v69refreshHistory').click();await page.locator(`.v69job[data-job-id="${old.id}"] button`).filter({hasText:'完成映像を確認'}).click();
   await page.waitForFunction(()=>document.querySelector('#v69status').textContent.includes('完成動画を読み込めません'));
   harness.expectErrors(page,[/console: Failed to load resource: the server responded with a status of 422/]);harness.assertNoErrors(page);
   // Only generated blue footage may be published as an issue screenshot.
   if(process.env.BAI_FAILURE_SCREENSHOT&&!process.env.BAI_FAILURE_REAL_VIDEO){await page.locator(`.v69job[data-job-id="${retry.id}"] button`).filter({hasText:'完成映像を確認'}).click();
    fs.mkdirSync(path.dirname(process.env.BAI_FAILURE_SCREENSHOT),{recursive:true});await page.screenshot({path:process.env.BAI_FAILURE_SCREENSHOT});}
  }
  assert.equal(sha(fs.readFileSync(source)),inputHash);assert.equal(sha(Buffer.from(await(await fetch(s.base+'/api/library-assets/file/'+encodeURIComponent(upload.item.id))).arrayBuffer())),inputHash);
  Object.assign(report,{status:'passed',inputKind:kind,inputHash,frames:30,queuedFailureStatus:507,threadFailureStatus:503,completedListSurvivesUnwritableJob:true,
   failedReplacementKeptOldIndexAndBytes:true,newVersionRetry:retry.download_name,committedUnnamedRecovered:true,corruptSameSizeRangeRejected:true,
   corruptOldVersionRestoreRejected:true,tamperedFixtureNotRepaired:true,healthyOutputsStillDownloadable:true,sourceUnchanged:true,native:!apiOnly});save();console.log(JSON.stringify(report));
 }catch(e){report.status='failed';report.error=e.stack;if(page){report.diagnostics=await page.evaluate(()=>({url:location.href,mcp:window.mixamoWebMcpDiagnostics,context:!!document.modelContext})).catch(()=>null);report.browserErrors=page.__monitor?.errors;}save();throw e;}
 finally{await client.close();await page?.close();await browser?.close();await s.stop();}
});
