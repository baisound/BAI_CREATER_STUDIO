'use strict';
// Reproduce current product UI with isolated, public demo data. No owner writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),h=require('../../tests/helpers/studio-harness.cjs');
const root=path.resolve(__dirname,'../..'),dest=process.env.BAI_UI_AUDIT_SHOTS;
if(!dest)throw Error('BAI_UI_AUDIT_SHOTS required');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function json(r,status=200){const t=await r.text();if(r.status!==status)throw Error(t);return JSON.parse(t);}
(async()=>{
 const s=await h.startServer({port:9280});let browser;
 const result={sourceMain:'f62a74c250c49dda4fce87c28d68b51534fceecb',data:'isolated demo projects, not owner data',screens:[],errors:[]};
 try{
  fs.mkdirSync(dest,{recursive:true});
  const image=await json(await fetch(s.base+'/api/library-assets/upload?kind=image&name=制作見本.webp',{method:'POST',body:fs.readFileSync(path.join(root,'studio/v05/assets/render-sakura.webp'))}));
  const project=(await json(await fetch(s.base+'/api/studio/v05/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'制作デモ A',kind:'empty'})}))).project.id;
  await json(await fetch(s.base+'/api/studio/v05/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'制作デモ B',kind:'empty'})}));
  let a={revision:0};
  for(const start of [0,3])a=await json(await fetch(s.base+'/api/studio/v05/arrangement/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:project,asset_id:image.item.id,track:'image',start,duration:2,revision:a.revision})}));
  const range=await json(await fetch(s.base+'/api/studio/v05/timeline/range',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:project,revision:0,arrangement_revision:a.revision,in_frame:0,out_frame:2})}));
  let job=await json(await fetch(s.base+'/api/studio/v05/render/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:project,arrangement_revision:a.revision,range_revision:range.revision,resolution:'720p',name:'制作デモ'})}),202);
  const end=Date.now()+30000;while(['queued','running'].includes(job.status)&&Date.now()<end){await new Promise(r=>setTimeout(r,150));job=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}
  if(job.status!=='succeeded')throw Error(job.error||job.status);
  browser=await h.launchBrowser();const page=await s.newPage(browser,{viewport:{width:1440,height:900}});
  await page.goto(s.base+'/studio/v05/index.html');await page.locator('#v06project').selectOption(project);
  const gather=()=>page.evaluate(()=>{
   const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;};
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
   const controls=[...document.querySelectorAll('button,input,select,a,[role="button"]')].filter(visible).map(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect(),top=document.elementFromPoint(Math.min(innerWidth-1,r.x+r.width/2),Math.min(innerHeight-1,r.y+r.height/2));return {tag:e.tagName,id:e.id,text:(e.textContent||'').trim().slice(0,100),aria:e.getAttribute('aria-label'),title:e.title,disabled:!!e.disabled,coveredAtCenter:!!top&&top!==e&&!e.contains(top),labels:[...e.labels||[]].map(l=>l.textContent.trim().slice(0,80)),rect:rect(e),font:c.fontSize,color:c.color,background:c.backgroundColor};});
   const panels=['.top','#nav','.main','.left','.right','.timeline','#baiPages','#bai-output','#bai-home','#v06AssetPicker','#v69historyCard'].map(q=>{const e=document.querySelector(q);return e?{selector:q,visible:visible(e),rect:rect(e),scrollHeight:e.scrollHeight,clientHeight:e.clientHeight}:null;}).filter(Boolean);
   return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,controls,panels,headings:[...document.querySelectorAll('h1,h2,h3')].filter(visible).map(e=>e.textContent.trim())};
  });
  for(const [key,name] of [['home','ホーム'],['assets','素材管理'],['edit','タイムライン編集'],['export','書き出し']]){
   await page.locator('#nav').getByRole('button',{name,exact:true}).click();await page.waitForTimeout(500);
   const metrics=await gather(),filename=key+'-1440.png';await page.screenshot({path:path.join(dest,filename)});
   result.screens.push({key,filename,...metrics,sha256:sha(fs.readFileSync(path.join(dest,filename)))});
  }
  await page.setViewportSize({width:1024,height:768});await page.locator('#nav').getByRole('button',{name:'タイムライン編集',exact:true}).click();await page.waitForTimeout(250);
  await page.screenshot({path:path.join(dest,'edit-1024.png')});result.screens.push({key:'edit-narrow',filename:'edit-1024.png',...await gather(),sha256:sha(fs.readFileSync(path.join(dest,'edit-1024.png')))});
  await page.setViewportSize({width:1440,height:900});
  result.keyboard=[];await page.locator('#nav').getByRole('button',{name:'ホーム',exact:true}).click();
  for(let i=0;i<32;i++){await page.keyboard.press('Tab');result.keyboard.push(await page.evaluate(()=>{const e=document.activeElement,c=getComputedStyle(e),r=e.getBoundingClientRect(),top=document.elementFromPoint(Math.min(innerWidth-1,r.x+r.width/2),Math.min(innerHeight-1,r.y+r.height/2));return {id:e.id,text:e.textContent.trim().slice(0,80),outline:c.outline,coveredAtCenter:!!top&&top!==e&&!e.contains(top),rect:{x:r.x,y:r.y,width:r.width,height:r.height}};}));}
  const beforeSave=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+project));
  const download=page.waitForEvent('download');await page.locator('#save').click();const downloaded=await download;
  const savedJson=JSON.parse(fs.readFileSync(await downloaded.path(),'utf8'));
  const afterSave=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+project));
  await page.locator('#undo').click();
  result.headerActions={downloadName:downloaded.suggestedFilename(),downloadKeys:Object.keys(savedJson),arrangementUnchanged:JSON.stringify(beforeSave)===JSON.stringify(afterSave),undoNotice:await page.locator('#toast').textContent().catch(()=>null)};
  result.errors=page.__monitor.errors;result.browser=browser.version();
  fs.writeFileSync(path.join(__dirname,'measurements.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({screens:result.screens.map(x=>({key:x.key,controls:x.controls.length,width:x.width,scrollWidth:x.scrollWidth})),errors:result.errors.length}));
 }finally{await browser?.close();await s.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
