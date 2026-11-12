'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const h=require('./helpers/studio-harness.cjs'),qa=path.resolve(__dirname,'../qa/preview-space-20261113');
test('埋込プレビューの二重ヘッダーを畳み表示高さと全操作への入口を保つ',{timeout:60000},async()=>{
 const s=await h.startServer({port:9287});let browser,page;const result={status:'running',views:[],errors:[]};fs.mkdirSync(qa,{recursive:true});
 try{
  browser=await h.launchBrowser();page=await s.newPage(browser);page.on('pageerror',e=>result.errors.push(e.message));await page.goto(s.base+'/studio/v05/index.html');await page.locator('#uiMainNav [data-workspace=edit]').click();await page.locator('#nav [data-page=live-motion]').click();
  await page.waitForFunction(()=>document.querySelector('#baiLiveFrame')?.contentDocument?.querySelector('.music-dance-viewport'));
  const child=page.frameLocator('#baiLiveFrame');await child.locator('.v05-embed-bar').waitFor();assert.equal(await child.locator('.topbar').isVisible(),false);assert.equal(await child.locator('.sidebar').isVisible(),false);
  for(const [width,height] of [[1440,900],[1478,653],[1024,768]]){
   await page.setViewportSize({width,height});
   const view=await page.evaluate(()=>{const f=document.querySelector('#baiLiveFrame'),box=f.getBoundingClientRect(),vp=f.contentDocument.querySelector('.music-dance-viewport').getBoundingClientRect(),transport=f.contentDocument.querySelector('.music-dance-transport').getBoundingClientRect();return {header:document.querySelector('.top').getBoundingClientRect().height,frame:{top:box.top,height:box.height,bottom:box.bottom},viewport:{top:vp.top,height:vp.height,bottom:vp.bottom},innerTransportTop:transport.top,innerHeader:f.contentDocument.querySelector('.v05-embed-bar').getBoundingClientRect().height};});
   assert.ok(view.frame.height>=height*.55,JSON.stringify(view));assert.ok(view.frame.bottom<=height-30);assert.ok(view.header<=76);assert.ok(view.viewport.top<190&&view.viewport.height>=200);assert.ok(view.viewport.bottom<=view.frame.height);assert.ok(view.innerTransportTop>=view.viewport.bottom,'No overlap between 3D and transport');result.views.push({width,height,...view});
   if(process.env.BAI_PREVIEW_SPACE_SHOTS){fs.mkdirSync(process.env.BAI_PREVIEW_SPACE_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.BAI_PREVIEW_SPACE_SHOTS,'preview-space-'+width+'x'+height+'.png')});}
   await child.locator('[data-role=dance-save]').scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>{const d=document.querySelector('#baiLiveFrame').contentDocument,e=d.querySelector('[data-role=dance-save]'),r=e.getBoundingClientRect();return d.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e;}),true,'Save is reachable through internal scroll');
   await child.locator('[data-role=dance-model]').scrollIntoViewIfNeeded();
  }
  await child.locator('.v05-embed-menu>summary').click();assert.equal(await child.locator('.sidebar').isVisible(),true);assert.equal(await child.locator('.topbar').isVisible(),true);assert.ok(await child.locator('.v05-embed-screen-tools button').count()>0);
  await child.getByLabel('補助パネルを表示',{exact:true}).check();assert.equal(await child.locator('.pane-right').isVisible(),true);await child.getByLabel('補助パネルを表示',{exact:true}).uncheck();await child.locator('.v05-embed-menu>summary').press('Escape');assert.equal(await child.locator('.sidebar').isVisible(),false);
  assert.equal(await child.locator('[data-role=dance-model]').isVisible(),true);assert.equal(await child.locator('[data-role=dance-motion]').isVisible(),true);assert.equal(await child.locator('[data-role=dance-audio]').isVisible(),true);
  await page.setViewportSize({width:700,height:768});await child.locator('.v05-embed-menu>summary').click();
  const sidebarBox=await child.locator('.sidebar').boundingBox();assert.ok(sidebarBox.x>=0);
  await child.locator('.sidebar a[data-route="13"]').click();await child.locator('.v05-embed-screen-tools .mode-switch').waitFor();assert.equal(await child.locator('.v05-embed-screen-tools .mode-switch button').count(),2);
  await child.locator('.v05-embed-menu>summary').press('Escape');
  // Standalone workspaces retain their original navigation.
  const standalone=await s.newPage(browser);await standalone.goto(s.base+'/workspace/10');assert.equal(await standalone.locator('.topbar').isVisible(),true);assert.equal(await standalone.locator('.sidebar').isVisible(),true);await standalone.close();
  assert.deepEqual(result.errors,[]);result.status='passed';
 }catch(e){result.status='failed';result.failure=e.stack;if(page)await page.screenshot({path:path.join(qa,'failure.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(qa,'validation.json'),JSON.stringify(result,null,2)+'\n');await browser?.close();await s.stop();}
});
