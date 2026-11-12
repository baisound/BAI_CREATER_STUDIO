'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const h=require('./helpers/studio-harness.cjs');
const qa=process.env.BAI_UI_FIX_QA||path.resolve(__dirname,'../qa/ui-fixes-20261113'),shots=process.env.BAI_UI_FIX_SHOTS;
function wav(){const n=24000,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(i/8)*5000),44+i*2);return b;}
async function json(r,status=200){const b=await r.text();assert.equal(r.status,status,b);return JSON.parse(b);}
test('音声の試聴結果を同作品へ頭出し付きで一括配置し、保存/履歴/実出力を維持する',{timeout:120000},async()=>{
 const s=await h.startServer({port:9282});let browser,page;const result={status:'in_progress',cases:[],errors:[]};fs.mkdirSync(qa,{recursive:true});
 try{
  const audio=await json(await fetch(s.base+'/api/library-assets/upload?kind=audio&name=音声見本.wav',{method:'POST',body:wav()}));
  const pid=(await json(await fetch(s.base+'/api/studio/v05/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'音声デモ',kind:'empty'})}))).project.id;
  let original=await json(await fetch(s.base+'/api/music-dance/project'));
  await json(await fetch(s.base+'/api/music-dance/project',{method:'POST',headers:{'Content-Type':'application/json','If-Match':original.revision},body:JSON.stringify({...original.project,audio_id:audio.item.id})}));
  original=await json(await fetch(s.base+'/api/music-dance/project'));
  browser=await h.launchBrowser();page=await s.newPage(browser);page.setDefaultTimeout(7000);page.on('pageerror',e=>result.errors.push(e.stack));
  await page.goto(s.base+'/studio/v05/index.html');await page.locator('#uiMainNav [data-workspace=edit]').click();await page.locator('#nav [data-page=audio]').click();
  await page.waitForFunction(()=>document.querySelector('#baiAudioSelect').options.length>1);await page.locator('#baiAudioWaves canvas').waitFor();
  assert.equal(await page.locator('#baiAudioSelect').inputValue(),audio.item.id);await page.waitForFunction(()=>!document.querySelector('#uiAudioPlace').disabled);result.cases.push('saved audio initializes placement action without manual reselection');
  await page.locator('#baiAudioStart').fill('31');await page.locator('#baiAudioStart').dispatchEvent('change');await page.locator('#baiAudioSource').fill('62');await page.locator('#baiAudioSource').dispatchEvent('change');
  assert.match(await page.locator('#uiAudioTargetProject').innerText(),/音声デモ/);assert.match(await page.locator('#uiAudioPlacementSummary').innerText(),/1.03.*2.07/);
  for(const [width,height] of [[1440,900],[1024,768]]){await page.setViewportSize({width,height});if(shots)await page.screenshot({path:path.join(shots,'audio-placement-'+width+'.png')});const b=await page.locator('#uiAudioPlace').boundingBox();assert.ok(b.y>=0&&b.y+b.height<height-26,'Placement CTA fully inside initial page viewport');}
  await page.locator('#uiAudioPlace').click();await page.waitForFunction(()=>document.body.dataset.workspace==='edit'&&document.querySelectorAll('[data-clip-id]').length===1);
  let a=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid));assert.equal(a.revision,1);assert.equal(a.clips.length,1);assert.deepEqual([a.clips[0].start,a.clips[0].source_start,a.clips[0].duration],[1.0333,2.0667,0.9333]);
  assert.equal(a.edit_history.undo_count,1);assert.match(await page.locator('#uiSelectedInspector').innerText(),/音声クリップ/);result.cases.push('30fps audition fields converted to seconds; start/head/duration saved in one history action');
  await page.locator('#vClipUndo').click();await h.waitForAsync(page,async id=>(await(await fetch('/api/studio/v05/arrangement?id='+id)).json()).clips.length===0,pid);
  await page.locator('#vClipRedo').click();await h.waitForAsync(page,async id=>(await(await fetch('/api/studio/v05/arrangement?id='+id)).json()).clips[0]?.source_start===2.0667,pid);
  await page.reload();await page.locator('#uiMainNav [data-workspace=edit]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-clip-id]').length===1);
  a=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+pid));assert.equal(a.clips[0].source_start,2.0667);assert.deepEqual((await json(await fetch(s.base+'/api/music-dance/project'))).project,original.project);
  result.cases.push('one Undo/Redo and reload preserve source offset; legacy music/dance project untouched');
  const range=await json(await fetch(s.base+'/api/studio/v05/timeline/range?id='+pid));
  let job=await json(await fetch(s.base+'/api/studio/v05/render/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:pid,arrangement_revision:a.revision,range_revision:range.revision,resolution:'720p',name:'頭出し確認'})}),202);
  const until=Date.now()+30000;while(['queued','running'].includes(job.status)&&Date.now()<until){await new Promise(r=>setTimeout(r,100));job=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}assert.equal(job.status,'succeeded',job.error);result.cases.push('trimmed audio arrangement produces an actual MP4');
  await page.locator('#nav [data-page=audio]').click();await page.locator('#uiAudioEffectsTab').click();assert.match(await page.locator('#uiAudioRack').innerText(),/入力 → VST3 → 音量 → マスター/);
  const host=await json(await fetch(s.base+'/api/studio/v05/audio/capabilities'));
  assert.equal(await page.locator('#uiAudioRack .uiChannelStrip').count(),4);for(const e of await page.locator('#uiAudioRack .uiInsertChain>button').all())assert.equal(await e.isDisabled(),!host.available);
  for(const [width,height] of [[1440,900],[1024,768]]){await page.setViewportSize({width,height});if(shots)await page.screenshot({path:path.join(shots,'audio-effects-'+width+'.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const sizes=await page.locator('.uiChannelStrip').evaluateAll(es=>es.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,fader:e.querySelector('input[type=range]').getBoundingClientRect().height})));for(const b of sizes){assert.ok(b.width>=96&&b.width<=116,'Owner-requested slimmer DAW strip');assert.ok(b.height/b.width>=2.6&&b.fader>=150,'Tall strip and usable long fader');}result.cases.push({mixerViewport:[width,height],strips:sizes});}
  await page.locator('.uiChannelName').filter({hasText:'音声'}).click();assert.match(await page.locator('.uiEffectInspector h3').innerText(),/音声/);
  await page.locator('#uiLegacyAudio>summary').click();assert.equal(await page.locator('#baiVst').isDisabled(),true);assert.equal(await page.locator('#baiEq').isDisabled(),true);result.cases.push('four slim effect/channel strips, real host availability, preserved legacy VST/EQ and compatibility save');
  assert.deepEqual(result.errors,[]);result.status='passed';
 }catch(e){result.status='failed';result.failure=e.stack;if(page)await page.screenshot({path:path.join(qa,'audio-failure.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(qa,'audio-validation.json'),JSON.stringify(result,null,2)+'\n');await browser?.close();await s.stop();}
});
