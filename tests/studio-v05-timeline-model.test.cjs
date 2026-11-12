'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const h=require('./helpers/studio-harness.cjs');
const qa=path.resolve(__dirname,'../qa/timeline-scene-20261113');
async function json(r,status=200){const t=await r.text();assert.equal(r.status,status,t);return JSON.parse(t);}
async function post(s,p,b,status=200){return json(await fetch(s.base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),status);}
function raw(bytes){const r=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{input:bytes,maxBuffer:4e6,windowsHide:true});assert.equal(r.status,0,r.stderr.toString());return r.stdout;}
function changed(a,b){let n=0;assert.equal(a.length,b.length);for(let i=0;i<a.length;i+=4)if(Math.max(...[0,1,2,3].map(j=>Math.abs(a[i+j]-b[i+j])))>24)n++;return n;}
test('モデルを配置しただけで画像の上へ描画し、配置の時間範囲・削除Undo・実MP4まで反映する',{timeout:160000},async()=>{
 const s=await h.startServer({port:9292});let browser,page;const report={cases:[],errors:[]};fs.mkdirSync(qa,{recursive:true});
 try{
  const pid=(await post(s,'/api/studio/v05/projects',{name:'配置モデル連動',kind:'empty'})).project.id;
  const model=(await json(await fetch(s.base+'/api/library-assets/upload?kind=stage&name=timeline.glb',{method:'POST',body:fs.readFileSync(path.join(__dirname,'fixtures/synthetic_test_model.glb'))}))).item;
  const image=(await json(await fetch(s.base+'/api/library-assets/upload?kind=image&name=background.webp',{method:'POST',body:fs.readFileSync(path.resolve(__dirname,'../studio/assets/samples/viewport-shrine.webp'))}))).item;
  let placed=await post(s,'/api/studio/v05/arrangement/place',{project_id:pid,revision:0,asset_id:image.id,track:'image',start:0,duration:.5});
  placed=await post(s,'/api/studio/v05/arrangement/place',{project_id:pid,revision:placed.revision,asset_id:model.id,track:'model',start:.1,duration:.2});const clip=placed.clip;
  await post(s,'/api/studio/v05/project/fps',{project_id:pid,fps:30});
  browser=await h.launchBrowser();page=await s.newPage(browser);page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(s.base+'/studio/v05/index.html');await page.locator('#uiMainNav [data-workspace=edit]').click();
  await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&window.BAIStudioMultiScenePreview.status().loaded===1);
  let state=await page.evaluate(()=>window.BAIStudioMultiScenePreview.status());assert.equal(state.timelineModels[0].clip_id,clip.id);assert.equal(state.composite,true);assert.equal(await page.locator('#v58-multi-preview').isVisible(),false);
  await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68?.status().ready);await page.locator('#v68frame').fill('0');await page.locator('#v68seek').click();assert.equal((await page.evaluate(()=>window.BAIStudioMultiScenePreview.status())).timelineModels[0].visible,false);
  const capturePage=await s.newPage(browser);await capturePage.goto(s.base+'/studio/v05/index.html?scene_capture=1');await capturePage.locator('#uiMainNav [data-workspace=edit]').click();await capturePage.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&window.BAIStudioMultiScenePreview.status().loaded===1);
  const frame=async n=>Buffer.from((await capturePage.evaluate(n=>window.BAIStudioMultiScenePreview.captureFrame(n,30,320,180),n)).split(',')[1],'base64');
  const before=raw(await frame(0)),during=raw(await frame(6)),after=raw(await frame(9));assert.ok(changed(before,during)>100);assert.equal(changed(before,after),0);report.cases.push('モデル配置だけで自動合成。開始前/終了後は非表示、配置中は実WebGL画素が変化');
  await page.locator('#v68frame').fill('6');await page.locator('#v68seek').click();assert.equal(await page.locator('#v68layers img').isVisible(),true);
  const shots=path.resolve(__dirname,'../studio/v05/reviews/timeline-scene-20261113');fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'model-over-image.png')});
  let arrangement=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid)),range=await json(await fetch(s.base+'/api/studio/v05/timeline/range?id='+pid)),scene=await json(await fetch(s.base+'/api/studio/v05/scene/instances?id='+pid));
  let job=await post(s,'/api/studio/v05/render/jobs',{project_id:pid,arrangement_revision:arrangement.revision,range_revision:range.revision,scene_revision:scene.revision,resolution:'720p',name:'配置モデル'},202);
  const deadline=Date.now()+100000;while(['queued','running'].includes(job.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,300));job=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,15);report.cases.push('配置モデルと画像を含む実MP4を15フレーム出力');
  await capturePage.close();await post(s,'/api/studio/v05/arrangement/clip/edit',{project_id:pid,revision:arrangement.revision,clip_id:clip.id,action:'delete'});
  await page.reload();await page.locator('#uiMainNav [data-workspace=edit]').click();await page.locator('#vClipUndo').click();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().timelineModels?.length===1);report.cases.push('削除後の再読込と保存済みUndoで同じ配置IDが復元');
  assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.failure=e.stack;if(page)await page.screenshot({path:path.join(qa,'failure.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(qa,'model-browser.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();await s.stop();}
});
