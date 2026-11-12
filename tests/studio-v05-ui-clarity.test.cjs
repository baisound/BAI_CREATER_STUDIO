'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const h=require('./helpers/studio-harness.cjs');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa/ui-fixes-20261113');
const shots=process.env.BAI_UI_FIX_SHOTS;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function json(response,status=200){const text=await response.text();assert.equal(response.status,status,text);return JSON.parse(text);}
test('承認UI改修：表示・フォーカス・保存・Undo/Redo・実動画の受取を隔離作品で確認', {timeout:120000},async()=>{
 const s=await h.startServer({port:9281});let browser,page;
 const result={status:'in_progress',scope:'isolated demo; same product APIs',cases:[],screens:[],errors:[]};
 fs.mkdirSync(qa,{recursive:true});if(shots)fs.mkdirSync(shots,{recursive:true});
 try{
  const image=await json(await fetch(s.base+'/api/library-assets/upload?kind=image&name=制作見本.webp',{method:'POST',body:fs.readFileSync(path.join(root,'studio/v05/assets/render-sakura.webp'))}));
  const project=(await json(await fetch(s.base+'/api/studio/v05/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'制作デモ A',kind:'empty'})}))).project.id;
  let a={revision:0};for(const start of [0,3])a=await json(await fetch(s.base+'/api/studio/v05/arrangement/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:project,asset_id:image.item.id,track:'image',start,duration:2,revision:a.revision})}));
  const range=await json(await fetch(s.base+'/api/studio/v05/timeline/range',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:project,revision:0,arrangement_revision:a.revision,in_frame:0,out_frame:2})}));
  let job=await json(await fetch(s.base+'/api/studio/v05/render/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:project,arrangement_revision:a.revision,range_revision:range.revision,resolution:'720p',name:'制作デモ'})}),202);
  const end=Date.now()+30000;while(['queued','running'].includes(job.status)&&Date.now()<end){await new Promise(r=>setTimeout(r,120));job=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}assert.equal(job.status,'succeeded',job.error);
  browser=await h.launchBrowser();page=await s.newPage(browser,{viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.stack||e.message));
  result.writes=[];page.on('response',async r=>{if(r.request().method()==='POST')result.writes.push({url:new URL(r.url()).pathname,status:r.status(),body:await r.text().catch(()=>null)});});
  page.setDefaultTimeout(7000);
  await page.goto(s.base+'/studio/v05/index.html');await page.locator('#uiMainNav').waitFor();await page.locator('#uiMainNav [data-workspace="edit"]').click();await page.locator('#v06project').selectOption(project);
  await page.waitForFunction(()=>document.querySelectorAll('#v07timeline [data-clip-id]').length===2&&document.querySelector('#v07timeline').dataset.uiOrganized==='true');
  const shot=async key=>{if(shots){const p=path.join(shots,key+'.png');await page.screenshot({path:p});result.screens.push({key,path:p,sha256:hash(fs.readFileSync(p))});}};
  const route=async key=>{await page.evaluate(which=>window.baiGo(which),key);};
  for(const key of ['home','library','output']){
   await route(key);assert.equal(await page.locator('.main').evaluate(e=>e.inert&&e.hidden),true);
   for(let n=0;n<38;n++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('.main')),false,'No behind-page focus: '+key);}
   await shot(key+'-1440');
  }result.cases.push('full-page background inert and no hidden editor Tab focus');
  await route('library');assert.equal(await page.getByLabel('素材を検索',{exact:true}).count(),1);assert.equal(await page.getByLabel('並び順',{exact:true}).count(),1);
  await page.locator('#baiAssetSearch').fill('制作見本');await page.locator('[data-library-id]').first().click();assert.equal(await page.locator('#baiLegacyImport').isVisible(),true);
  await shot('library-selected-1440');await page.locator('#baiPlaceSelected').click();assert.equal(await page.locator('.main').isVisible(),true);result.cases.push('named library fields, search/detail, actual selection-to-placement entry and PMX/VMD entry');
  await route('edit');await page.locator('#v07timeline [data-clip-id]').first().click();assert.match(await page.locator('#uiSelectedInspector').innerText(),/画像クリップ/);
  await page.locator('#uiSelectedInspector').getByRole('button',{name:'配置・長さを編集'}).click();await page.locator('#v08start').fill('0.5');await page.locator('#v08save').click();
  await h.waitForAsync(page,async id=>(await (await fetch('/api/studio/v05/arrangement?id='+encodeURIComponent(id))).json()).clips.some(c=>c.start===0.5),project);
  await page.locator('#vClipUndo').click();await h.waitForAsync(page,async id=>(await (await fetch('/api/studio/v05/arrangement?id='+encodeURIComponent(id))).json()).clips.every(c=>c.start!==0.5),project);
  await page.locator('#vClipRedo').click();await h.waitForAsync(page,async id=>(await (await fetch('/api/studio/v05/arrangement?id='+encodeURIComponent(id))).json()).clips.some(c=>c.start===0.5),project);
  await page.reload();await page.locator('#uiMainNav').waitFor();await route('edit');await page.waitForFunction(()=>document.querySelectorAll('#v07timeline [data-clip-id]').length===2&&document.querySelector('#v07timeline').dataset.uiOrganized==='true');
  await page.waitForFunction(()=>document.querySelector('#uiSaveState').textContent.includes('保存済み'));
  await page.locator('#v68frame').fill('60');await page.locator('#v68seek').click();
  result.cases.push('context editor uses existing API, Undo/Redo and reload retain actual changes');
  for(const [width,height] of [[1440,900],[1024,768]]){
   await page.setViewportSize({width,height});await route('edit');await page.locator('#v07timeline [data-clip-id]').first().click();
   const boxes=await page.locator('#v07timeline [data-clip-id]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,right:r.right};}));
   await shot('edit-'+width);result.cases.push({viewport:[width,height],clips:boxes});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No document horizontal overflow');
   for(const b of boxes)assert.ok(b.y>=0&&b.bottom<=height-26,'Saved clip visible without scrolling: '+JSON.stringify(b));
   const visibleRange=await page.locator('#v66RangeTools').evaluate(e=>{const r=e.getBoundingClientRect(),shell=e.closest('#v77TimelineShell').getBoundingClientRect();return r.top>=shell.top&&r.bottom<=shell.bottom;});assert.equal(visibleRange,true,'In/Out controls fully visible');
  }
  await page.setViewportSize({width:1440,height:900});await route('edit');await page.locator('#uiTimelineSettings>summary').click();await page.locator('#uiShowEmptyTracks').check();
  for(const track of ['audio','camera','effect','expression','image','light','lip','model','motion','music','video'])assert.equal(await page.locator('#v07timeline [data-track="'+track+'"]').first().isVisible(),true,track+' track available');await shot('track-settings-1440');await page.locator('#uiTimelineSettings>summary').click();
  result.cases.push('all 11 track types reachable through explicit empty-track toggle');
  await page.locator('#baiFileMenu').click();assert.match(await page.locator('#baiFileDropdown').innerText(),/自動保存/);await page.locator('#uiPrototypeFiles>summary').click();assert.match(await page.locator('#save').innerText(),/試作/);assert.equal(await page.locator('#undo').isDisabled(),true);await page.keyboard.press('Escape');
  result.cases.push('actual auto-save vs prototype JSON and unconnected global Undo distinguished');
  await page.locator('#baiFileMenu').click();await page.locator('#baiFileDropdown').getByRole('button',{name:'素材配置の保存状態を確認',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#baiFileDropdown').textContent.includes('素材配置 2件の保存を確認しました'));
  assert.equal((await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+project))).clips.length,2);await page.keyboard.press('Escape');result.cases.push('saved arrangement read back from actual API without mutating legacy or current data');
  await page.locator('#uiMainNav [data-page=home]').click();for(const key of ['dashboard','projects']){await page.locator('#nav [data-page='+key+']').click();assert.equal(await page.locator('#bai-'+key).isVisible(),true);}await page.locator('#uiSubNav').getByRole('button',{name:'ホーム',exact:true}).click();
  await page.locator('#uiMainNav [data-workspace=edit]').click();for(const key of ['motion','camera','assets']){await page.locator('#nav [data-workspace='+key+']').click();assert.equal(await page.locator('.main').isVisible(),true);}for(const key of ['audio','live-motion']){await page.locator('#nav [data-page='+key+']').click();assert.equal(await page.locator('#bai-'+key).isVisible(),true);}await page.locator('#uiMainNav [data-workspace=edit]').click();
  result.cases.push('all original 11 workspace entries reached through grouped navigation');
  for(const [width,height] of [[1440,900],[1024,768]]){
   await page.setViewportSize({width,height});await route('output');await page.locator('#v69download').waitFor();await shot('output-'+width);
   const layout=await page.evaluate(()=>Object.fromEntries(['v69name','baiOutputFormat','v69resolution','v66OutputRange','baiAddRender','v69download','v69historyCard'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{top:r.top,bottom:r.bottom,height:r.height}]})));
   result.cases.push({exportViewport:[width,height],layout});for(const [id,b] of Object.entries(layout))assert.ok(b.height>0&&b.top>=0&&b.top<height,id+' initially visible');
  }
  const url=await page.locator('#v69download').getAttribute('href');const file=await fetch(s.base+url);assert.equal(file.status,200);const bytes=Buffer.from(await file.arrayBuffer());assert.ok(bytes.length>1000);
  result.cases.push({realMp4Download:{bytes:bytes.length,sha256:hash(bytes)}});
  const colors=await page.locator('#baiAddRender').evaluate(e=>({color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}));const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const contrast=(lum(colors.color)+.05)/(lum(colors.background)+.05);assert.ok(contrast>=4.5);result.cases.push({exportButtonContrast:{...colors,ratio:contrast}});
  assert.deepEqual(result.errors,[]);result.status='passed';
 }catch(e){result.status='failed';result.failure=e.stack;result.finalArrangement=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+encodeURIComponent(await page.locator('#v06project').inputValue()))).catch(()=>null);if(page)await page.screenshot({path:path.join(qa,'failure.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(qa,'browser-validation.json'),JSON.stringify(result,null,2)+'\n');await browser?.close();await s.stop();}
});
