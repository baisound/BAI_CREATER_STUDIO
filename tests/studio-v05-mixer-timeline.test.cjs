'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const h=require('./helpers/studio-harness.cjs');
const qa=path.resolve(__dirname,'../qa/mixer-timeline-20261113');
async function json(r,status=200){const t=await r.text();assert.equal(r.status,status,t);return JSON.parse(t);}
async function post(s,p,b,status=200){return json(await fetch(s.base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),status);}
function wav(freq){const n=48000*4,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*freq*i/48000)*5000),44+i*2);return b;}
test('ミキサーは実行名・素材・行ミュート・共通時刻を保存済みタイムラインと共有する',{timeout:160000},async()=>{
 const s=await h.startServer({port:9291});let browser,page;const report={cases:[],errors:[]};fs.mkdirSync(qa,{recursive:true});
 try{
  const pid=(await post(s,'/api/studio/v05/projects',{name:'タイムライン連動検証',kind:'empty'})).project.id;
  let layout=await post(s,'/api/studio/v05/timeline/audio-lanes',{project_id:pid,revision:0});
  layout=await post(s,'/api/studio/v05/timeline/labels',{project_id:pid,revision:layout.revision,key:'audio:2',label:'台詞'});
  const originals=[];
  for(const [lane,freq,name] of [[1,440,'ガイド.wav'],[2,880,'台詞.wav']]){
   const original=wav(freq),asset=(await json(await fetch(s.base+'/api/library-assets/upload?kind=audio&name='+encodeURIComponent(name),{method:'POST',body:original}))).item;originals.push([asset.id,original]);
   const a=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid));await post(s,'/api/studio/v05/arrangement/place',{project_id:pid,revision:a.revision,asset_id:asset.id,track:'audio',lane,start:0,duration:4});
  }
  browser=await h.launchBrowser();page=await s.newPage(browser);await page.setViewportSize({width:1440,height:900});page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.stack));
  await page.goto(s.base+'/studio/v05/index.html');await page.locator('#uiMainNav [data-workspace=edit]').click();await page.locator('#nav [data-page=audio]').click();await page.locator('#uiAudioEffectsTab').click();
  const lane=page.locator('.uiChannelStrip[data-channel="audio:2"]');await lane.waitFor();assert.equal(await lane.locator('strong').textContent(),'台詞');assert.match(await lane.locator('.uiChannelInput').textContent(),/台詞/);
  await lane.locator('input[type=range]').focus();await lane.locator('input[type=range]').press('ArrowLeft');await lane.locator('input[type=range]').press('ArrowLeft');assert.equal(await page.evaluate(()=>document.activeElement?.dataset.focusKey),'gain-audio:2');assert.equal(await lane.locator('input[type=range]').inputValue(),'-0.2');
  await lane.locator('input[type=range]').fill('-6');await lane.locator('input[type=range]').dispatchEvent('change');await page.locator('#vstMixerSave').click();
  await h.waitForAsync(page,async id=>(await(await fetch('/api/studio/v05/audio/settings?project_id='+id)).json()).tracks['audio:2']?.gain_db===-6,pid);
  const settings=await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+pid));assert.equal(settings.channels.audio.gain_db,0);assert.equal(settings.tracks['audio:1'].gain_db,0);report.cases.push('同じ音声種別の行1と行2を独立表示・保存。実行名と素材名を表示');
  await lane.locator('.uiChannelMute button').first().click();await h.waitForAsync(page,async id=>(await(await fetch('/api/studio/v05/timeline/layout?id='+id)).json()).muted_lanes?.includes('audio:2'),pid);
  await page.locator('#nav [data-workspace=edit]').click();await page.locator('[data-audio-mute-lane="audio:2"]').waitFor();assert.equal(await page.locator('[data-audio-mute-lane="audio:2"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-audio-mute-lane="audio:2"]').click();await page.locator('#nav [data-page=audio]').click();await page.locator('#uiAudioEffectsTab').click();await page.waitForFunction(()=>document.querySelector('[data-channel="audio:2"] .uiChannelMute button')?.getAttribute('aria-pressed')==='false');report.cases.push('ミキサー→タイムライン→ミキサーで同じ行ミュート正本を操作');
  await page.locator('#vstTimelineFrame').fill('30');await page.locator('#uiAudioRack').getByRole('button',{name:'移動',exact:true}).click();
  await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68.status().frame===30);await page.locator('#vstMixerPrepare').click();await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68.status().playing);await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68.status().frame>40);await page.locator('#vstTimelinePause').click();
  const head=await page.evaluate(()=>window.BAIStudioMediaPreviewV68.status());assert.ok(head.frame>40);assert.match(await page.locator('#vstTimelineClock').textContent(),new RegExp((head.frame/head.fps).toFixed(2)));assert.equal(await page.locator('#vstMixerAudition').evaluate(e=>e.paused),true);report.cases.push('ミキサーの移動/再生/一時停止は共通時計。独立試聴プレイヤーは再生しない');
  const shots=path.resolve(__dirname,'../studio/v05/reviews/mixer-timeline-20261113');fs.mkdirSync(shots,{recursive:true});
  for(const [width,height] of [[1440,900],[1024,768]]){await page.setViewportSize({width,height});await page.screenshot({path:path.join(shots,'linked-'+width+'.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const add=await lane.locator('.uiInsertChain>button').boundingBox();assert.ok(add.y+add.height<height);}
  // Empty lane addition/rename must refresh even with a dirty mixer draft.
  await lane.locator('input[type=range]').fill('-9');await lane.locator('input[type=range]').dispatchEvent('change');
  await page.locator('#nav [data-workspace=edit]').click();await page.locator('#uiTimelineSettings>summary').click();await page.locator('#vAudioMusicLanes summary').click();await page.locator('#vAudioLaneAdd').click();await page.locator('#vAudioLaneRemoveId option[value="3"]').waitFor({state:'attached'});
  const label=page.locator('.v77-track-label>span').filter({hasText:/^台詞$/});await label.dblclick();const rename=page.getByLabel('audio:2 トラック名',{exact:true});await rename.fill('ナレーション');await rename.press('Enter');await h.waitForAsync(page,async id=>(await(await fetch('/api/studio/v05/timeline/layout?id='+id)).json()).labels['audio:2']==='ナレーション',pid);
  await page.locator('#nav [data-page=audio]').click();await page.locator('#uiAudioEffectsTab').click();await page.locator('[data-channel="audio:3"]').waitFor();await page.waitForFunction(()=>document.querySelector('[data-channel="audio:2"] strong')?.textContent==='ナレーション');assert.equal(await lane.locator('input[type=range]').inputValue(),'-9');await page.locator('#vstMixerUndo').click();assert.equal(await lane.locator('input[type=range]').inputValue(),'-6');report.cases.push('実タイムラインUIから行追加・名称変更しても未保存の音量を保持、Undoで復元');
  await page.locator('#nav [data-workspace=edit]').click();const typeMute=page.locator('[data-audio-mute-type=audio]');await typeMute.locator('..').locator('summary').click();await typeMute.click();
  await page.locator('#nav [data-page=audio]').click();await page.locator('#uiAudioEffectsTab').click();await lane.getByText('種類全体で消音中',{exact:true}).waitFor();assert.equal(await lane.locator('.uiChannelMute button').first().isDisabled(),true);await lane.locator('.vstTypeMuteNotice').click();assert.ok(await typeMute.isVisible());await typeMute.click();report.cases.push('種類全体の消音理由を可視表示し、実際の解除設定へ戻れる');
  for(const [id,original] of originals)assert.deepEqual(Buffer.from(await(await fetch(s.base+'/api/library-assets/file/'+encodeURIComponent(id))).arrayBuffer()),original);
  assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.failure=e.stack;if(page)await page.screenshot({path:path.join(qa,'failure.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(qa,'browser.json'),JSON.stringify(report,null,2));await browser?.close();await s.stop();}
});
