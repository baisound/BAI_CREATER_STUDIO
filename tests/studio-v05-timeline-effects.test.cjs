'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const h=require('./helpers/studio-harness.cjs'),qa=path.resolve(__dirname,'../qa/timeline-scene-20261113/effects'),shots=path.resolve(__dirname,'../studio/v05/reviews/timeline-scene-20261113');
async function json(r,status=200){const t=await r.text();assert.equal(r.status,status,t);return JSON.parse(t);}
async function post(s,p,b,status=200){return json(await fetch(s.base+'/api/studio/v05/'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),status);}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function decode(b,args=[]){const r=spawnSync('ffmpeg',['-v','error','-i','pipe:0',...args,'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{input:b,maxBuffer:30e6,windowsHide:true});assert.equal(r.status,0,r.stderr.toString());return r.stdout;}
function standard(base,name,args){const run=spawnSync('python',['-X','utf8','mcp_server.py'],{input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})+'\n',encoding:'utf8',windowsHide:true,env:{...process.env,MIXAMO_VIEWER_URL:base}});assert.equal(run.status,0,run.stderr);const out=JSON.parse(run.stdout).result;assert.ok(!out.isError,JSON.stringify(out));return JSON.parse(out.content[0].text);}
async function web(page,name,args){let out=await page.evaluate(async({name,args})=>document.modelContext.executeTool((await document.modelContext.getTools()).find(t=>t.name===name),args),{name,args});if(typeof out==='string')out=JSON.parse(out);assert.ok(!out.isError,JSON.stringify(out));return JSON.parse(out.content[0].text);}
async function marked(page,file,targets){await page.evaluate(targets=>{for(const [number,selector] of targets){const r=document.querySelector(selector)?.getBoundingClientRect();if(!r)continue;const mark=document.createElement('div');mark.className='qa-scene-mark';mark.style.cssText=`position:fixed;pointer-events:none;z-index:99999;box-sizing:border-box;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;border:2px solid #ffd45a`;const badge=document.createElement('b');badge.textContent=number;badge.style.cssText='position:absolute;left:0;top:0;padding:2px 6px;background:#ffd45a;color:#111;font:700 16px sans-serif';mark.append(badge);document.body.append(mark);}},targets);await page.screenshot({path:path.join(shots,file)});await page.evaluate(()=>document.querySelectorAll('.qa-scene-mark').forEach(e=>e.remove()));}

test('同じタイムラインのPMX・動き・表情・口・カメラを半開区間/保存復元/実MP4へ接続する',{timeout:240000},async()=>{
 const fixture=spawnSync('python',['-X','utf8','-m','tests.helpers.timeline-scene-fixture'],{encoding:'utf8',windowsHide:true});assert.equal(fixture.status,0,fixture.stderr);const inputs=JSON.parse(fixture.stdout),seed=Object.fromEntries(Object.entries(inputs.seed).map(([k,v])=>[k,Buffer.from(v,'base64')]));
 const s=await h.startServer({port:9296,seed});let browser,page;const report={cases:[],errors:[]};fs.mkdirSync(qa,{recursive:true});fs.mkdirSync(shots,{recursive:true});
 try{
  const pid=(await post(s,'projects',{name:'モデル・動き・表情・カメラ連動',kind:'empty'})).project.id;
  await post(s,'project/fps',{project_id:pid,fps:30});
  const bg=(await json(await fetch(s.base+'/api/library-assets/upload?kind=image&name=background.png',{method:'POST',body:Buffer.from(inputs.background,'base64')}))).item;
  let arranged=await post(s,'arrangement/place',{project_id:pid,revision:0,asset_id:bg.id,track:'image',start:0,duration:2});
  const place=async(asset,track,start,duration)=>{arranged=await post(s,'arrangement/place',{project_id:pid,revision:arranged.revision,asset_id:asset,track,start,duration});return arranged.clip;};
  const model=await place('mmd:A:timeline.pmx','model',.25,1.5),rid='timeline:'+model.id;
  const body=await place('mmd:vmd:body.vmd','motion',.25,1.5),face=await place('mmd:vmd:face.vmd','expression',.5,.5),lip=await place('mmd:vmd:lip.vmd','lip',1,.5),camera=await place('mmd:vmd:カメラ.vmd','camera',.25,1);
  let scene=await post(s,'scene/instances',{project_id:pid,action:'camera',revision:0,camera:{position:[0,.04,.64],target:[0,.04,0],fov:45}});
  browser=await require('playwright').chromium.launch({executablePath:h.chromiumPath(),args:['--enable-features=WebMCP,WebMCPTesting','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox']});page=await s.newPage(browser);page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.stack));
  await page.goto(s.base+'/studio/v05/index.html');await page.locator('#uiMainNav [data-workspace=edit]').click();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&window.BAIStudioMultiScenePreview.status().loaded===1);
  assert.match(await page.locator('#v68status').innerText(),/対象モデルを割り当て/);assert.match(await page.locator('#v70sceneOpen').innerText(),/要確認 3件/);
  await page.screenshot({path:path.join(shots,'timeline-needs-assignment.png')});
  await page.locator('#v70sceneOpen').click();
  for(const clip of [body,face,lip]){
   await page.locator('#v58-multi-preview select[aria-label="動き・表情・口のクリップ"]').selectOption(clip.id);
   await page.locator('#v58-multi-preview select[aria-label="適用するモデル"]').selectOption(rid);
   await page.locator('#v58-multi-preview').getByRole('button',{name:'モデルへ割り当て',exact:true}).click();
   await h.waitForAsync(page,async({pid,id,rid})=>(await(await fetch('/api/studio/v05/arrangement?id='+pid)).json()).clips.find(c=>c.id===id)?.target_scene_instance_id===rid,{pid,id:clip.id,rid});
   await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready);
  }
  report.cases.push('手動UIで動き/表情/口VMDをタイムライン由来の同じモデルへ割当し保存');
  await page.evaluate(()=>window.BAIStudioMediaPreviewV68.seek(18));
  await page.screenshot({path:path.join(shots,'timeline-assignment-1440.png')});
  await marked(page,'timeline-assignment-marked.png',[[1,'#v58-multi-preview select[aria-label="動き・表情・口のクリップ"]'],[2,'#v58-multi-preview select[aria-label="適用するモデル"]']]);
  await page.setViewportSize({width:1024,height:768});
  assert.ok(await page.locator('#v58-multi-preview').evaluate(el=>el.scrollWidth<=el.clientWidth+2),'割当パネルの横はみ出し');
  await page.screenshot({path:path.join(shots,'timeline-assignment-1024.png')});await page.setViewportSize({width:1440,height:900});
  // Close only the controls; the same rendered scene remains over the image.
  const close=page.locator('#v58-multi-preview').getByRole('button',{name:'閉じる',exact:true});await close.focus();await close.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'v70sceneOpen');
  const seek=async frame=>{await page.locator('#v68frame').fill(String(frame));await page.locator('#v68seek').click();return page.evaluate(rid=>{const api=window.BAIStudioMultiScenePreview;return {state:api.status(),face:api.morphProbe(rid),pose:api.poseProbe(rid,['センター'])};},rid);};
  const early=await seek(7);assert.equal(early.state.timelineModels[0].visible,false);
  const expression=await seek(18);assert.equal(expression.state.activeCameraClip,camera.id);assert.equal(expression.state.timelineIssue,null);assert.ok(Math.abs(expression.face.morphs['あ']-.8)<.001,JSON.stringify(expression.face));assert.ok(expression.pose.bones['センター'].position[1]>.3);
  const lipStart=await seek(30);assert.ok(Math.abs(lipStart.face.morphs['あ']-.2)<.001);assert.equal(lipStart.state.cameraProjection,'orthographic');assert.ok(Math.abs(lipStart.state.cameraUp[0])>.1);
  const late=await seek(39);assert.equal(late.state.activeCameraClip,null);assert.equal(late.state.cameraProjection,'perspective');assert.ok(Math.abs(late.face.morphs['あ']-.44)<.001);assert.ok(late.state.camera.position.every((v,i)=>Math.abs(v-[0,.04,.64][i])<1e-9));
  const bodyOnly=await seek(48);assert.ok(bodyOnly.face.morphs['あ']>.99,'outside face clips the original body VMD morph is restored');const off=await seek(53);assert.equal(off.state.timelineModels[0].visible,false);assert.equal(off.face.morphs['あ'],0);
  assert.deepEqual(await page.evaluate(()=>window.BAIStudioMediaPreviewV68.status().issues),[]);
  report.cases.push('開始前/終了後の表示、VMD30fps時刻、表情→口の境界、動き/モーフの復帰、カメラ透視/平行/rollと区間外復帰');
  await seek(18);await page.screenshot({path:path.join(shots,'timeline-effects-1440.png')});
  await marked(page,'timeline-effects-marked.png',[[1,'#v68stage'],[2,'#v70sceneOpen'],[3,'#v07timeline']]);
  await page.reload();await page.locator('#uiMainNav [data-workspace=edit]').click();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&window.BAIStudioMultiScenePreview.status().motion.loadedClips.length===1);
  const restored=await seek(18);assert.deepEqual(restored.face,expression.face);assert.deepEqual(restored.pose,expression.pose);
  report.cases.push('再読込で同じモデルID/割当/時刻/実骨姿勢と表情値を復元');
  const cap=await s.newPage(browser);await cap.goto(s.base+'/studio/v05/index.html?scene_capture=1');await cap.locator('#uiMainNav [data-workspace=edit]').click();await cap.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&window.BAIStudioMultiScenePreview.status().motion.loadedClips.length===1);
  const frames=[0,8,18,30,39,53];const expected=new Map();
  for(const frame of frames){const b=Buffer.from((await cap.evaluate(f=>window.BAIStudioMultiScenePreview.captureFrame(f,30,320,180),frame)).split(',')[1],'base64');expected.set(frame,decode(b,['-frames:v','1']));}
  arranged=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid));scene=await json(await fetch(s.base+'/api/studio/v05/scene/instances?id='+pid));const range=await json(await fetch(s.base+'/api/studio/v05/timeline/range?id='+pid));
  let job=await post(s,'render/jobs',{project_id:pid,arrangement_revision:arranged.revision,range_revision:range.revision,scene_revision:scene.revision,resolution:'720p',name:'全連動の実出力'},202);
  const end=Date.now()+100000;while(['queued','running'].includes(job.status)&&Date.now()<end){await new Promise(r=>setTimeout(r,250));job=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}assert.equal(job.status,'succeeded',job.error);
  const mp4=Buffer.from(await(await fetch(s.base+'/api/studio/v05/render/file?id='+job.id)).arrayBuffer()),movie=decode(mp4,['-vf','scale=320:180']);assert.equal(movie.length,60*320*180*4);
  report.frames=[];
  for(const frame of frames){const png=expected.get(frame),actual=movie.subarray(frame*320*180*4,(frame+1)*320*180*4);let error=0,visible=0;for(let i=0;i<png.length;i+=4){const alpha=png[i+3]/255;visible+=alpha>.5;for(let c=0;c<3;c++)error+=Math.abs(actual[i+c]-(png[i+c]*alpha+[20,35,55][c]*(1-alpha)));}const mae=error/(320*180*3);assert.ok(mae<4,'preview/MP4 frame '+frame+' MAE='+mae);assert.ok([0,53].includes(frame)?visible===0:visible>30,'rendered model pixels F'+frame);report.frames.push({frame,rgb_mae:mae,visible_pixels:visible});}
  report.cases.push('60フレームの実MP4。モデル前後/動き/モーフ/透視/平行/カメラ復帰の6時点を実プレビュー画素と照合');
  const readStd=standard(s.base,'bai_studio_scene_instances_get',{project_id:pid}),readWeb=await web(page,'bai_studio_scene_instances_get',{project_id:pid});assert.deepEqual(readWeb,readStd);
  assert.equal(readStd.timeline_effects.length,3);assert.equal(readStd.instances[0].id,rid);
  arranged=standard(s.base,'bai_studio_scene_motion_target_set',{project_id:pid,clip_id:face.id,instance_id:null,revision:arranged.revision});
  assert.equal(standard(s.base,'bai_studio_scene_instances_get',{project_id:pid}).timeline_effects.find(r=>r.clip_id===face.id).status,'unready');
  arranged=await web(page,'bai_studio_scene_motion_target_set',{project_id:pid,clip_id:face.id,instance_id:rid,revision:arranged.revision});
  await page.evaluate(()=>window.BAIStudioV05Arrangement.refreshArrangement());await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready);
  assert.ok(Math.abs((await seek(18)).face.morphs['あ']-.8)<.001);
  // Editing the saved camera start re-samples its local source clock immediately.
  arranged=await post(s,'arrangement/clip/edit',{project_id:pid,clip_id:camera.id,revision:arranged.revision,action:'update',start:.75,duration:camera.duration,track:'camera'});
  await page.evaluate(()=>window.BAIStudioV05Arrangement.refreshArrangement());await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready);
  assert.equal((await seek(18)).state.activeCameraClip,null);assert.equal((await seek(30)).state.cameraProjection,'perspective');
  report.cases.push('標準STDIO MCP/WebMCPの同じ派生モデル・ネイティブキー読取と表情割当解除/再割当。カメラ開始時刻編集が即時反映');
  await seek(58);await page.locator('#v68play').click();await page.waitForFunction(()=>!window.BAIStudioMediaPreviewV68.status().playing&&window.BAIStudioMediaPreviewV68.status().frame===59);
  await page.locator('#v68play').click();await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68.status().frame>=9&&window.BAIStudioMultiScenePreview.status().timelineModels[0].visible);await page.locator('#v68pause').click();
  await page.locator('#v68stop').click();assert.equal((await page.evaluate(()=>window.BAIStudioMultiScenePreview.status())).timelineModels[0].visible,false);
  report.cases.push('実再生の終端停止→再生で先頭復帰→モデル再出現→停止時の開始前非表示');
  // A conflicting camera remains visible as an actionable failure and blocks output.
  await place('mmd:vmd:カメラ.vmd','camera',.8,.5);
  await page.evaluate(()=>window.BAIStudioV05Arrangement.refreshArrangement());await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready);
  await seek(30);assert.match(await page.locator('#v68status').innerText(),/重なっています/);assert.match(await page.locator('#v70sceneOpen').innerText(),/要確認/);
  await page.screenshot({path:path.join(shots,'timeline-camera-conflict.png')});
  const rejected=await post(s,'render/jobs',{project_id:pid,arrangement_revision:arranged.revision,range_revision:range.revision,scene_revision:scene.revision,resolution:'720p'},422);assert.match(rejected.error,/重なり/);
  const undone=standard(s.base,'bai_studio_clip_undo',{project_id:pid,revision:arranged.revision});arranged=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid));assert.equal(arranged.revision,undone.revision);
  await page.evaluate(()=>window.BAIStudioV05Arrangement.refreshArrangement());await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready);assert.equal((await seek(30)).state.timelineIssue,null);
  report.cases.push('1024px割当パネル横はみ出しなし、Enterで閉じて入口へフォーカス復帰。重複カメラの具体的エラーと出力拒否、標準MCP Undoで回復');
  arranged=await post(s,'arrangement/clip/edit',{project_id:pid,clip_id:camera.id,revision:arranged.revision,action:'delete'});await place('mmd:vmd:zero-camera.vmd','camera',0,1.5);
  await page.evaluate(()=>window.BAIStudioV05Arrangement.refreshArrangement());await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready);await seek(0);const invalid=await seek(15);assert.equal(invalid.state.activeCameraClip,null);assert.match(invalid.state.timelineIssue,/Unsupported VMD camera pose/);assert.ok(invalid.state.camera.position.every((v,i)=>Math.abs(v-[0,.04,.64][i])<1e-9));
  assert.ok(invalid.pose.bones['センター'].position[1]>.2,'カメラ失敗でも有効な動きは評価する');
  await cap.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());await assert.rejects(()=>cap.evaluate(()=>window.BAIStudioMultiScenePreview.captureFrame(15,30,320,180)),/Unsupported VMD camera pose/);
  report.cases.push('動き/表情/口の未割当3件を通常画面と入口へ表示。途中で距離0になるVMD評価失敗でも旧フレームを残さず保存視点へ復帰し、出力キャプチャは拒否');
  for(const [name,bytes] of Object.entries(seed))assert.equal(sha(fs.readFileSync(path.join(s.dataDir,name))),sha(bytes));
  assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.error=e.stack;if(page)await page.screenshot({path:path.join(qa,'failure.png')}).catch(()=>{});throw e;}finally{fs.writeFileSync(path.join(qa,'browser.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();await s.stop();}
});




