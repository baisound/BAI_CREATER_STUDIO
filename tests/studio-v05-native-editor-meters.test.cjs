'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const h=require('./helpers/studio-harness.cjs');
const qa=path.resolve(__dirname,'../qa/vst-native-editor-20261113');
async function json(r){const text=await r.text();assert.equal(r.status,200,text);return JSON.parse(text);}
async function post(s,p,b){return json(await fetch(s.base+'/api/studio/v05/'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}));}
const body=s=>({project_id:s.project_id,revision:s.revision,channels:s.channels,tracks:s.tracks,enabled:s.enabled});
async function enter(page,s){await page.goto(s.base+'/studio/v05/index.html');await page.locator('#uiMainNav [data-workspace=edit]').click();await page.locator('#nav [data-page=audio]').click();await page.locator('#uiAudioEffectsTab').click();await page.waitForFunction(()=>!document.querySelector('[data-channel=master] input[type=range]')?.disabled);}
function wav(){const n=48000*8,b=Buffer.alloc(44+n*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(192000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);for(let i=0;i<n;i++){const v=i<48000*6?Math.round(Math.sin(2*Math.PI*1000*i/48000)*3276.8):0;b.writeInt16LE(v,44+i*4);b.writeInt16LE(Math.round(v*.5),46+i*4);}return b;}

test('インサートから直接開き、未保存・起動待ち・再読込・回収を保持する（GUI通信は隔離スタブ）',{timeout:90000},async()=>{
 const s=await h.startServer({port:9294});let browser,page;const report={kind:'browser protocol; native window separately tested',cases:[]};fs.mkdirSync(qa,{recursive:true});
 try{
  const pid=(await post(s,'projects',{name:'VST操作と回収',kind:'empty'})).project.id;
  const cap=await json(await fetch(s.base+'/api/studio/v05/audio/capabilities')),plugin=cap.plugins.find(p=>p.name==='TDR Nova');assert.ok(plugin);
  let saved=await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+pid));saved.channels.master.inserts=[{plugin_id:plugin.id,parameters:{output_gain_db:.5},bypass:false}];saved=await post(s,'audio/settings',body(saved));
  browser=await h.launchBrowser();page=await s.newPage(browser);page.setDefaultTimeout(10000);
  let session=null,opens=[],release;const sessions=new Map();let delay=false;
  await page.route('**/api/studio/v05/audio/editor-*',async route=>{
   const u=new URL(route.request().url()),body=route.request().postDataJSON();let result={};
   if(u.pathname.endsWith('editor-open')){opens.push(body);if(delay)await new Promise(r=>release=r);session={id:String(opens.length).padStart(32,'b'),project_id:pid,key:body.key,index:body.index,plugin_id:plugin.id,name:plugin.name,status:'editing',draft:!!body.draft_insert,initial_insert:body.draft_insert||saved.channels.master.inserts[0]};result=session;}
   if(u.pathname.endsWith('editor-open'))sessions.set(session.id,session);
   if(u.pathname.endsWith('editor-status'))result=sessions.get(u.searchParams.get('id'));
   if(u.pathname.endsWith('editor-list'))result={settings_revision:saved.revision,sessions:[...sessions.values()].filter(s=>s.status!=='discarded')};
   if(u.pathname.endsWith('editor-close')){session={...sessions.get(body.id),status:body.mode==='discard'?'discarded':'draft_ready',parameters:{output_gain_db:.25},state_id:'a'.repeat(64)};sessions.set(session.id,session);result=session;}
   await route.fulfill({json:result});
  });
  await enter(page,s);const master=page.locator('[data-channel=master]'),insert=master.locator('.uiInsertSlots button');
  await master.locator('input[type=range]').fill('-6');await master.locator('input[type=range]').dispatchEvent('change');
  const nativeShots=path.resolve(__dirname,'../studio/v05/reviews/vst-native-editor-20261113');fs.mkdirSync(nativeShots,{recursive:true});await page.screenshot({path:path.join(nativeShots,'native-direct-1440.png')});
  delay=true;await insert.dblclick();await page.waitForFunction(()=>document.querySelector('[data-channel=master] input[type=range]').disabled);
  assert.equal(opens.length,1);assert.equal(opens[0].draft_insert.parameters.output_gain_db,.5);
  assert.equal((await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+pid))).channels.master.gain_db,0);
  assert.equal(await page.locator('#vstMixerSave').isDisabled(),true);release();delay=false;
  await page.getByText(/編集中。閉じると編集内容/).waitFor();await page.getByRole('button',{name:'反映して閉じる',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#vstMixerSave').disabled);
  assert.equal(await master.locator('input[type=range]').inputValue(),'-6');assert.equal(await page.locator('#vstParameterValue').inputValue(),'0.25');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.focusKey),'insert-master-0');
  report.cases.push('double click directly opens; pending locks controls; unrelated dirty gain not auto-saved; close merges native params and returns insert focus');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'保存済みを読み直す',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-channel=master] input[type=range]').value==='0');assert.equal(session.status,'discarded');
  await insert.press('Enter');await page.getByText(/編集中。閉じると作品/).waitFor();assert.equal(opens.length,2);report.cases.push('Enter directly opens; explicit discard clears recovered native draft');
  session={...session,status:'conflict',parameters:{output_gain_db:.2},state_id:'c'.repeat(64),error:'別の保存と競合'};sessions.set(session.id,session);
  await page.reload();await page.locator('#uiMainNav [data-workspace=edit]').click();await page.locator('#nav [data-page=audio]').click();await page.locator('#uiAudioEffectsTab').click();
  await page.getByText('別の保存と競合',{exact:true}).waitFor();await page.getByRole('button',{name:'回収した変更を破棄',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#vstNativeEditors').textContent.trim());
  report.cases.push('reload discovers conflict and exposes discard without requiring right-side navigation');
  saved=await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+pid));saved.channels.master.inserts.push({...saved.channels.master.inserts[0]});saved=await post(s,'audio/settings',body(saved));await enter(page,s);
  await master.locator('input[type=range]').fill('-4');await master.locator('input[type=range]').dispatchEvent('change');await insert.nth(0).dblclick();await page.getByText(/編集中。閉じると編集内容/).waitFor();await insert.nth(1).press('Enter');await page.waitForFunction(()=>document.querySelectorAll('#vstNativeEditors>div').length===2);
  await page.getByRole('button',{name:'反映して閉じる',exact:true}).first().click();await page.getByText(/回収した設定を保持中（未保存）/).waitFor();assert.equal(await page.locator('#vstNativeEditors>div').count(),2);
  assert.equal(await page.getByRole('button',{name:'選択中の同じVSTへ設定を反映（未保存）',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'変更を破棄',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#vstMixerSave').disabled);await insert.nth(0).click();await page.getByRole('button',{name:'選択中の同じVSTへ設定を反映（未保存）',exact:true}).click();assert.equal(await page.locator('#vstParameterValue').inputValue(),'0.25');assert.equal(await master.locator('input[type=range]').inputValue(),'-4');
  report.cases.push('two native drafts: closing A while B edits retains recoverable A; after B closes explicit merge preserves gain and native parameters');report.status='passed';
 }catch(e){report.status='failed';report.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(qa,'native-protocol.json'),JSON.stringify(report,null,2));await browser?.close();await s.stop();}
});

test('実PCMのステレオピーク・LUFSを共通時計、停止、シーク、行ミュート、素材待機へ追従',{timeout:150000},async()=>{
 const s=await h.startServer({port:9295});let browser,page;const report={cases:[],errors:[]};
 try{
  const pid=(await post(s,'projects',{name:'メーター実音声検証',kind:'empty'})).project.id;
  const original=wav(),asset=(await json(await fetch(s.base+'/api/library-assets/upload?kind=audio&name=LUFS.wav',{method:'POST',body:original}))).item;
  await post(s,'arrangement/place',{project_id:pid,revision:0,asset_id:asset.id,track:'audio',lane:1,start:0,duration:8});
  let saved=await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+pid));saved.enabled=true;await post(s,'audio/settings',body(saved));
  browser=await h.launchBrowser();page=await s.newPage(browser);page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.stack));await enter(page,s);
  const lane=page.locator('[data-channel="audio:1"]'),meter=lane.locator('.uiInactiveMeter');
  await page.locator('#vstMixerPrepare').click();await page.waitForFunction(()=>Number(document.querySelector('[data-channel="audio:1"] .vstLoudness')?.dataset.momentary)<-10);
  const shots=path.resolve(__dirname,'../studio/v05/reviews/vst-native-editor-20261113');fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'meters-playing-1440.png')});
  const measured=await meter.evaluate(e=>({l:e.style.getPropertyValue('--vst-left'),r:e.style.getPropertyValue('--vst-right')}));assert.ok(parseFloat(measured.l)>parseFloat(measured.r)+7,JSON.stringify(measured));
  await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68.status().frame/window.BAIStudioMediaPreviewV68.status().fps>3.3);await page.locator('#vstTimelinePause').click();
  await page.waitForFunction(()=>document.querySelector('[data-channel="audio:1"] .uiInactiveMeter').style.getPropertyValue('--vst-left')==='0%');
  const loud=await lane.locator('.vstLoudness').getAttribute('data-momentary');assert.ok(Number(loud)<-20&&Number(loud)>-24,loud);assert.match(await page.locator('#vstMasterLoudness').textContent(),/S -2[0-9].*LUFS.*dBTP/);
  assert.equal(await lane.locator('.vstLoudness').getAttribute('aria-live'),'off');assert.equal(await page.locator('#vstMasterLoudness').getAttribute('aria-live'),'off');
  report.cases.push('real prepared stereo left/right differ 6 dB; M/S/I + true peak; pause zeros peak while retaining cursor loudness; live announcements off');
  await page.locator('#vstTimelineFrame').fill('225');await page.locator('#uiAudioRack').getByRole('button',{name:'移動',exact:true}).click();await page.locator('#vstMixerPrepare').click();await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68.status().frame>=225);
  await page.waitForFunction(()=>document.querySelector('[data-channel="audio:1"] .uiInactiveMeter').style.getPropertyValue('--vst-left')==='0%');await page.locator('#vstTimelinePause').click();report.cases.push('seek into silent tail reads correct 100ms bins');
  await lane.locator('.uiChannelMute button').first().click();await page.locator('#vstTimelineFrame').fill('30');await page.locator('#uiAudioRack').getByRole('button',{name:'移動',exact:true}).click();await page.locator('#vstMixerPrepare').click();await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68.status().playing);await page.waitForTimeout(450);assert.equal(await meter.evaluate(e=>e.style.getPropertyValue('--vst-left')),'0%');await page.locator('#vstTimelinePause').click();report.cases.push('canonical saved row mute recalculates actual zero signal');
  await page.locator('#uiAudioArrangeTab').click();await page.locator('#baiAudioSelect').selectOption(asset.id);await page.locator('#baiAudioWaves canvas').waitFor();await page.locator('#baiAudioStart').fill('90');await page.locator('#baiAudioStart').dispatchEvent('change');
  await page.locator('#baiAudioPlay').click();await page.locator('#uiAudioEffectsTab').click();await page.waitForTimeout(250);assert.equal(await meter.evaluate(e=>e.style.getPropertyValue('--vst-left')),'0%');assert.equal(await lane.locator('.vstLoudness').getAttribute('data-momentary'),'');report.cases.push('asset audition waiting before placed start does not display future audio');
  await page.screenshot({path:path.join(shots,'meters-1440.png')});
  assert.deepEqual(Buffer.from(await(await fetch(s.base+'/api/library-assets/file/'+encodeURIComponent(asset.id))).arrayBuffer()),original);assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.error=e.stack;if(page)await page.screenshot({path:path.join(qa,'meters-failure.png')});throw e;}finally{fs.writeFileSync(path.join(qa,'meters-browser.json'),JSON.stringify(report,null,2));await browser?.close();await s.stop();}
});
