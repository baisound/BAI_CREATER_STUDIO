'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const qa=__dirname,root=path.resolve(qa,'../..'),out=path.join(root,'studio/v05/reviews/ui-fixes-20261113');
(async()=>{
 const body=fs.readFileSync(path.join(qa,'implementation.json'));assert.ok(body.equals(fs.readFileSync(path.join(out,'implementation.json'))));const data=JSON.parse(body);
 for(const a of data.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(out,a.file))).digest('hex'),a.sha256);
 for(const s of data.sources)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,s.file),'utf8').replace(/\r\n/g,'\n')).digest('hex'),s.sha256);
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});let errors=[];
 try{const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(out,'index.html')).href);
  for(const key of ['library','output','audio','mixer','edit']){await page.locator('[data-screen='+key+']').click();assert.ok(await page.locator('#'+key).isVisible());}
  const refs=await page.locator('a[href],img[src]').evaluateAll(es=>es.map(e=>e.getAttribute(e.tagName==='IMG'?'src':'href')));for(const ref of refs)if(ref&&!/^(https?:|#)/.test(ref))assert.ok(fs.existsSync(path.resolve(out,ref)),ref);
  assert.deepEqual(errors,[]);if(process.env.BAI_UI_FIX_SHOTS)await page.screenshot({path:path.join(process.env.BAI_UI_FIX_SHOTS,'comparison-report.png')});
  fs.writeFileSync(path.join(qa,'report-validation.json'),JSON.stringify({status:'passed',interactivePanels:5,imageHashes:data.assets.length,sourceHashes:data.sources.length,localReferences:refs.length,jsErrors:errors,scope:'report and source correspondence; product functionality verified separately'},null,2)+'\n');
  console.log('5 review panels, asset/source hashes and local links passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
