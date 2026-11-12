'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const h=require('./helpers/studio-harness.cjs');
const qa=process.env.BAI_AUDIO_QA||path.resolve(__dirname,'../qa/mixer-timeline-20261113/regression'),shots=process.env.BAI_MIXER_SHOTS;
function wav(){const n=48000*3,b=Buffer.alloc(44+n*4);b.write('RIFF');b.writeUInt32LE(36+n*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(192000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);for(let i=0;i<n;i++){const v=Math.round(Math.sin(2*Math.PI*440*i/48000)*5000);b.writeInt16LE(v,44+i*4);b.writeInt16LE(v,46+i*4);}return b;}
async function json(r,expected=200){const t=await r.text();assert.equal(r.status,expected,t);return JSON.parse(t);}
async function post(s,p,b,code=200){return json(await fetch(s.base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),code);}
const stateBody=({project_id,revision,channels,enabled})=>({project_id,revision,channels,enabled});
async function pcm(s,url){const b=Buffer.from(await(await fetch(s.base+url)).arrayBuffer());const result=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-f','f32le','-acodec','pcm_f32le','pipe:1'],{input:b,maxBuffer:8e6,windowsHide:true});assert.equal(result.status,0,result.stderr.toString());return new Float32Array(result.stdout.buffer.slice(result.stdout.byteOffset,result.stdout.byteOffset+result.stdout.length));}
function rms(a,start=48000,end=144000){let v=0;for(let i=start;i<Math.min(a.length,end);i++)v+=a[i]**2;return Math.sqrt(v/(Math.min(a.length,end)-start));}

test('VST3と作品ミキサーを操作し、保存・試聴・プレビュー・実MP4を同じ処理へ接続する',{timeout:180000},async()=>{
 const s=await h.startServer({port:9283});let browser,page;const report={status:'running',cases:[],errors:[]};fs.mkdirSync(qa,{recursive:true});
 try{
  const cap=await json(await fetch(s.base+'/api/studio/v05/audio/capabilities'));assert.equal(cap.available,true,cap.reason);
  const plugin=cap.plugins.find(p=>p.name==='TDR Nova');assert.ok(plugin,'Installed real TDR Nova required for this Windows gate');
  const original=wav(),asset=(await json(await fetch(s.base+'/api/library-assets/upload?kind=audio&name=ミキサー検証.wav',{method:'POST',body:original}))).item;
  const pid=(await post(s,'/api/studio/v05/projects',{name:'ミキサー実処理デモ',kind:'empty'})).project.id;
  browser=await h.launchBrowser();page=await s.newPage(browser);page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.stack));
  await page.addInitScript(()=>{const orig=AudioContext.prototype.createBufferSource;AudioContext.prototype.createBufferSource=function(...a){const n=orig.apply(this,a),start=n.start.bind(n);n.start=(...args)=>{let sum=0;const data=n.buffer.getChannelData(0);for(let i=24000;i<48000;i++)sum+=data[i]**2;window.__auditionRms=Math.sqrt(sum/24000);start(...args);};return n;};});
  await page.goto(s.base+'/studio/v05/index.html');await page.locator('#uiMainNav [data-page=library]').click();await page.locator('#baiLibraryGrid [data-library-id]').filter({hasText:'ミキサー検証'}).click();await page.locator('#baiPlaceSelected').click();await page.waitForFunction(()=>Number(document.querySelector('#v06duration').value)===3);await page.locator('#v06track').selectOption('audio');await page.locator('#v06start').fill('0.25');await page.locator('#v06duration').fill('2');await page.locator('#v06place').click();
  await h.waitForAsync(page,async id=>(await(await fetch('/api/studio/v05/arrangement?id='+id)).json()).clips.length===1,pid);
  let placed=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid));assert.equal(placed.clips[0].asset_id,asset.id);report.cases.push('WAV selected in material library is placed and saved into the same project through manual UI');
  await post(s,'/api/studio/v05/arrangement/clip/edit',{project_id:pid,clip_id:placed.clips[0].id,revision:placed.revision,action:'update',start:.25,duration:2,track:'audio',source_start:.5});await page.reload();await page.locator('#uiMainNav [data-workspace=edit]').click();await page.locator('#nav [data-page=audio]').click();await page.locator('#uiAudioEffectsTab').click();await page.locator('#vstMixerBuses').evaluate(e=>e.open=true);
  await page.waitForFunction(()=>!document.querySelector('.uiChannelStrip input[type=range]')?.disabled);
  const voice=page.locator('.uiChannelStrip[data-channel=audio]');await voice.locator('input[type=range]').fill('-6');await voice.locator('input[type=range]').dispatchEvent('change');await page.locator('#vstMixerSave').click();
  await h.waitForAsync(page,async id=>(await(await fetch('/api/studio/v05/audio/settings?project_id='+id)).json()).channels.audio.gain_db===-6,pid);
  let settings=await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+pid));assert.equal(settings.enabled,true);
  const attenuated=await post(s,'/api/studio/v05/audio/prepare',{project_id:pid}),attenuatedPcm=await pcm(s,attenuated.url);
  assert.ok(Math.abs(rms(attenuatedPcm)/(5000/32768/Math.sqrt(2))-10**(-6/20))<.001);
  report.cases.push('UI -6 dB save produces measured PCM gain ratio '+rms(attenuatedPcm)/(5000/32768/Math.sqrt(2)));
  await voice.locator('input[type=range]').fill('-9');await voice.locator('input[type=range]').dispatchEvent('change');await page.locator('#vstMixerSave').click();await page.waitForFunction(()=>document.querySelector('#vstMixerSave').disabled);
  await page.locator('#vstMixerUndo').click();await page.locator('#vstMixerSave').click();await h.waitForAsync(page,async id=>(await(await fetch('/api/studio/v05/audio/settings?project_id='+id)).json()).channels.audio.gain_db===-6,pid);report.cases.push('Undo after a successful save retains current revision and can be saved again');
  await voice.locator('.uiInsertChain>button').click();await page.locator('#vstPluginSelect').selectOption(plugin.id);await page.getByRole('button',{name:'読み込んで追加',exact:true}).click();
  await page.locator('#vstParameter').waitFor();await page.locator('#vstParameter').selectOption('output_gain_db');await page.locator('#vstParameterValue').fill('0.25');await page.locator('#vstParameterValue').dispatchEvent('change');await page.locator('#vstMixerSave').click();
  await h.waitForAsync(page,async id=>(await(await fetch('/api/studio/v05/audio/settings?project_id='+id)).json()).channels.audio.inserts.length===1,pid);
  await page.waitForFunction(()=>document.querySelector('#vstMixerSave').disabled);
  const wet=await post(s,'/api/studio/v05/audio/prepare',{project_id:pid}),wetPcm=await pcm(s,wet.url);
  const nativeRatio=rms(wetPcm)/rms(attenuatedPcm);assert.ok(nativeRatio>.2&&nativeRatio<.8,nativeRatio);report.nativeRatio=nativeRatio;
  settings=await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+pid));
  assert.equal((await post(s,'/api/studio/v05/audio/prepare',{project_id:pid})).id,wet.id);
  const old=await post(s,'/api/studio/v05/audio/settings',{...stateBody(settings),revision:0},409);assert.match(old.error,/変わりました/);
  await page.reload();await page.locator('#uiMainNav [data-workspace=edit]').click();await page.locator('#nav [data-page=audio]').click();await page.locator('#uiAudioEffectsTab').click();await page.locator('#vstMixerBuses').evaluate(e=>e.open=true);await page.waitForFunction(()=>document.querySelector('.uiChannelStrip[data-channel=audio] input[type=range]')?.value==='-6');
  await voice.locator('.uiChannelName').click();await page.locator('#vstParameter').selectOption('output_gain_db');assert.equal(await page.locator('#vstParameterValue').inputValue(),'0.25');
  const bypass=page.getByRole('button',{name:'バイパス',exact:true});await bypass.focus();await bypass.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement?.dataset.focusKey),'bypass');await page.getByRole('button',{name:'有効にする',exact:true}).press('Enter');
  await page.locator('#vstMixerSave').click();await page.waitForFunction(()=>document.querySelector('#vstMixerSave').disabled);
  await page.locator('#vstMixerPrepare').click();await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68.status().playing);
  report.cases.push('real native VST changes PCM; cache, saved raw parameter and project reload verified');
  for(const [width,height] of [[1440,900],[1024,768]]){await page.setViewportSize({width,height});if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'mixer-processing-'+width+'.png')});}const b=await page.locator('#vstMixerPrepare').boundingBox();assert.ok(b.y+b.height<height);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));for(const strip of await page.locator('#baiMixer>.uiChannelStrip').all()){const rect=await strip.boundingBox();assert.ok(rect.width<=190&&rect.height/rect.width>2.4);const buttons=await strip.locator('.uiChannelMute').boundingBox();assert.ok(buttons.y+buttons.height<=height-20,'M/S visible without outer scrolling');}report.cases.push({viewport:[width,height],mixerVisible:true});}
  await page.locator('#uiAudioArrangeTab').click();assert.equal(await page.locator('#vstMixerAudition').evaluate(e=>e.paused),true);await page.locator('#baiAudioSelect').selectOption(asset.id);await page.locator('#baiAudioWaves canvas').waitFor();await page.locator('#baiAudioPlay').click();await page.waitForFunction(()=>window.__auditionRms>0);const audition=await page.evaluate(()=>window.__auditionRms);assert.ok(Math.abs(audition-rms(wetPcm))<.001);
  await page.locator('#uiAudioEffectsTab').click();await page.locator('#vstMixerBuses').evaluate(e=>e.open=true);await page.locator('#vstMixerPrepare').click();await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68.status().playing);assert.equal(await page.locator('#baiAudioPause').isDisabled(),true);
  report.cases.push('material audition feeds processed VST PCM to a real Web Audio source');
  await page.locator('#uiMainNav [data-workspace=edit]').click();assert.equal(await page.locator('#vstMixerAudition').evaluate(e=>e.paused),true);await h.waitForAsync(page,async()=>window.BAIStudioMediaPreviewV68?.status().ready&&document.querySelector('[data-mixer-audio]')?.readyState>=2);
  await page.locator('#v68play').click();await page.waitForFunction(()=>document.querySelector('[data-mixer-audio]')?.currentTime>.3);
  const audioState=await page.locator('#v68layers audio').evaluateAll(es=>es.map(e=>({mixed:!!e.dataset.mixerAudio,muted:e.muted,time:e.currentTime})));assert.equal(audioState.filter(e=>e.mixed&&!e.muted).length,1);assert.ok(audioState.filter(e=>!e.mixed).every(e=>e.muted));await page.locator('#v68pause').click();
  report.cases.push('project preview plays processed PCM with every original media voice muted (no doubled dry audio)');
  const a=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid)),range=await json(await fetch(s.base+'/api/studio/v05/timeline/range?id='+pid));
  let job=await post(s,'/api/studio/v05/render/jobs',{project_id:pid,arrangement_revision:a.revision,range_revision:range.revision,resolution:'720p',name:'VST音声検証'},202);
  const end=Date.now()+45000;while(['queued','running'].includes(job.status)&&Date.now()<end){await new Promise(r=>setTimeout(r,150));job=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}assert.equal(job.status,'succeeded',job.error);
  const mp4=await pcm(s,'/api/studio/v05/render/file?id='+job.id);const ratio=rms(mp4)/rms(wetPcm);assert.ok(Math.abs(ratio-1)<.03,ratio);report.mp4GainRatio=ratio;
  assert.deepEqual(Buffer.from(await(await fetch(s.base+'/api/library-assets/file/'+encodeURIComponent(asset.id))).arrayBuffer()),original);
  report.cases.push('actual MP4 decodes to processed audio level within 3%; uploaded original bytes unchanged');
  // Mute and solo use the same offline engine, not just button colors.
  settings=await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+pid));settings.channels.audio.mute=true;await post(s,'/api/studio/v05/audio/settings',stateBody(settings));
  const silent=await pcm(s,(await post(s,'/api/studio/v05/audio/prepare',{project_id:pid})).url);assert.equal(rms(silent),0);report.cases.push('saved channel mute produces zero PCM');
  settings=await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+pid));settings.channels.audio.inserts[0].plugin_id='0'.repeat(64);await post(s,'/api/studio/v05/audio/settings',stateBody(settings));
  let failed=await post(s,'/api/studio/v05/render/jobs',{project_id:pid,arrangement_revision:a.revision,range_revision:range.revision,resolution:'720p',name:'VST音声検証'},202);
  const failEnd=Date.now()+20000;while(['queued','running'].includes(failed.status)&&Date.now()<failEnd){await new Promise(r=>setTimeout(r,150));failed=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+failed.id));}assert.equal(failed.status,'failed');assert.match(failed.error,/VST3/);assert.deepEqual(await pcm(s,'/api/studio/v05/render/file?id='+job.id),mp4);report.cases.push('missing native plugin fails the new render explicitly and preserves the completed MP4');
  assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.failure=e.stack;if(page)await page.screenshot({path:path.join(qa,'failure.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(qa,'browser-validation.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();await s.stop();}
});
