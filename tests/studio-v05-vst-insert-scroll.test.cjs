'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const h=require('./helpers/studio-harness.cjs'),qa=path.resolve(__dirname,'../qa/vst-insert-scroll-20261113');
async function json(r){const t=await r.text();assert.equal(r.status,200,t);return JSON.parse(t);}
test('8個のVST一覧だけを内部スクロールし、固定追加・末尾選択・削除・M/Sと長いフェーダーを維持',{timeout:60000},async()=>{
 const s=await h.startServer({port:9286});let browser,page;const report={status:'running',views:[],errors:[]};fs.mkdirSync(qa,{recursive:true});
 try{
  const pid=(await json(await fetch(s.base+'/api/studio/v05/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'8インサート検証',kind:'empty'})}))).project.id;
  const caps=await json(await fetch(s.base+'/api/studio/v05/audio/capabilities')),plugin=caps.plugins.find(p=>p.name==='TDR Nova');assert.ok(plugin);
  const inspected=await json(await fetch(s.base+'/api/studio/v05/audio/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plugin_id:plugin.id})}));
  let saved=await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+pid));saved.channels.audio.inserts=Array.from({length:8},()=>({plugin_id:plugin.id,bypass:true,parameters:Object.fromEntries(inspected.parameters.map(p=>[p.id,p.raw]))}));
  await json(await fetch(s.base+'/api/studio/v05/audio/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:pid,revision:0,channels:saved.channels,enabled:false})}));
  browser=await h.launchBrowser();page=await s.newPage(browser);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(s.base+'/studio/v05/index.html');await page.locator('#uiMainNav [data-workspace=edit]').click();await page.locator('#nav [data-page=audio]').click();await page.locator('#uiAudioEffectsTab').click();
  const strip=page.locator('.uiChannelStrip[data-channel=audio]'),slots=strip.locator('.uiInsertSlots');await page.waitForFunction(()=>document.querySelectorAll('.uiChannelStrip[data-channel=audio] .uiInsertSlots button').length===8);
  for(const [width,height] of [[1440,900],[1024,768]]){
   await page.setViewportSize({width,height});
   const first=await slots.evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY}));assert.ok(first.scroll>first.height*2);assert.equal(first.overflow,'scroll');
   const before=await strip.locator('.uiInsertChain>button').boundingBox();await slots.locator('button').last().scrollIntoViewIfNeeded();await slots.locator('button').last().click();
   assert.ok(await slots.evaluate(e=>e.scrollTop>0));assert.deepEqual(await strip.locator('.uiInsertChain>button').boundingBox(),before);
   const b=await strip.locator('.uiChannelMute').boundingBox();assert.ok(b.y+b.height<height-20);assert.ok((await strip.locator('input[type=range]').boundingBox()).height>=150);assert.equal(await page.locator('.vstEffectDetail h4').innerText(),plugin.name);
   assert.match(await strip.locator('input[type=range]').getAttribute('aria-label'),/音声の音量（dB）/);assert.doesNotMatch(await strip.locator('.uiInsertChain>button').getAttribute('title'),/未接続/);
   report.views.push({width,height,...first,addButtonFixed:true,lastInsertReachable:true,muteSoloVisible:true});
   if(process.env.BAI_VST_SCROLL_SHOTS){fs.mkdirSync(process.env.BAI_VST_SCROLL_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.BAI_VST_SCROLL_SHOTS,'vst-eight-'+width+'.png')});}
  }
  await page.getByRole('button',{name:'取り外す',exact:true}).click();assert.equal(await slots.locator('button').count(),7);assert.equal(await strip.locator('.uiInsertChain>button').isEnabled(),true);
  assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.failure=e.stack;throw e;}
 finally{fs.writeFileSync(path.join(qa,'validation.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();await s.stop();}
});
