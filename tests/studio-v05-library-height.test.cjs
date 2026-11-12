'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const h=require('./helpers/studio-harness.cjs');
const {spawnSync}=require('node:child_process');
const qa=path.resolve(__dirname,'../qa/vst-mixer-20261113');
test('素材一覧のカードを縮ませず、低い画面でも一覧の高さと詳細への入口を保つ',{timeout:60000},async()=>{
 const s=await h.startServer({port:9284});let browser,page;const report={status:'running',views:[],errors:[]};fs.mkdirSync(qa,{recursive:true});
 try{
  for(let i=0;i<16;i++){const image=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180','-vf','hue=h='+i*23,'-frames:v','1','-f','image2pipe','-vcodec','png','-'],{windowsHide:true,maxBuffer:2e6});assert.equal(image.status,0);const r=await fetch(s.base+'/api/library-assets/upload?kind=image&name='+encodeURIComponent(`表示確認画像${String(i).padStart(2,'0')}.png`),{method:'POST',body:image.stdout});assert.equal(r.status,200);}
  browser=await h.launchBrowser();page=await s.newPage(browser);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(s.base+'/studio/v05/index.html');await page.locator('#uiMainNav [data-page=library]').click();await page.locator('#baiLibraryGrid button').first().waitFor();
  // Advanced tools arrive asynchronously; they must not consume the top row.
  await page.waitForFunction(()=>document.querySelector('#v54-assets')?.parentElement===document.querySelector('#baiCats')?.closest('.baiCard'));
  for(const [width,height] of [[1440,900],[1478,653],[1024,768]]){
   await page.setViewportSize({width,height});await page.locator('#baiLibraryGrid img').first().waitFor();
   const view=await page.evaluate(()=>{const grid=document.querySelector('#baiLibraryGrid'),g=grid.getBoundingClientRect();return {height:g.height,top:g.top,bottom:g.bottom,scrollHeight:grid.scrollHeight,cards:[...grid.children].slice(0,8).map(e=>{const r=e.getBoundingClientRect(),img=e.querySelector('img'),i=img.getBoundingClientRect(),p=e.querySelector('p').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,imageBottom:i.bottom,imageTop:i.top,descriptionBottom:p.bottom,fit:getComputedStyle(img).objectFit};})};});
   assert.ok(view.height>=height*.42,JSON.stringify(view));assert.ok(view.bottom<=height-20);
   for(const c of view.cards){assert.ok(c.height>=196);assert.ok(c.imageBottom<c.bottom&&c.descriptionBottom<=c.bottom);assert.equal(c.fit,'contain');}
   assert.ok(view.scrollHeight>view.height);report.views.push({width,height,...view});
   if(process.env.BAI_MIXER_SHOTS)await page.screenshot({path:path.join(process.env.BAI_MIXER_SHOTS,'library-height-'+width+'x'+height+'.png')});
  }
  await page.locator('#baiLibraryGrid button').first().click();await page.locator('#baiPlaceSelected').waitFor();assert.equal(await page.locator('#baiPlaceSelected').isEnabled(),true);
  await page.locator('#baiLibraryGrid').evaluate(e=>e.scrollTop=e.scrollHeight);await page.locator('#baiLibraryGrid button').last().click();assert.equal(await page.locator('#baiPlaceSelected').isEnabled(),true);
  assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.failure=e.stack;if(page)await page.screenshot({path:path.join(qa,'library-failure.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(qa,'library-validation.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();await s.stop();}
});
