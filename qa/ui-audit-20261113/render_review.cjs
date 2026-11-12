'use strict';
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const dir=path.resolve(__dirname,'../../studio/v05/reviews/ui-audit-20261113'),shots=process.env.BAI_UI_REVIEW_SHOTS;
if(!shots)throw Error('BAI_UI_REVIEW_SHOTS required');
(async()=>{
 fs.mkdirSync(shots,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});let failures=[];page.on('pageerror',e=>failures.push(e.message));
  for(const screen of ['edit','assets','export'])for(const kind of ['marked','proposal']){
   await page.goto(pathToFileURL(path.join(dir,kind+'-'+screen+'.html')).href);
   await page.screenshot({path:path.join(shots,kind+'-'+screen+'.png')});
   fs.copyFileSync(path.join(shots,kind+'-'+screen+'.png'),path.join(dir,kind+'-'+screen+'.png'));
  }
  await page.goto(pathToFileURL(path.join(dir,'index.html')).href);
  for(const key of ['assets','export','edit']){await page.locator('[data-panel="'+key+'"]').click();if(!await page.locator('#panel-'+key).isVisible())throw Error('Report tab failed');}
  await page.locator('#toggle').click();if(!await page.locator('body').evaluate(e=>e.classList.contains('markoff')))throw Error('Annotation toggle failed');
  if(failures.length)throw Error(failures.join('\n'));
  const crypto=require('node:crypto'),audit=JSON.parse(fs.readFileSync(path.join(__dirname,'audit.json'),'utf8'));
  audit.assets=fs.readdirSync(dir).filter(x=>x.endsWith('.png')).map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex'),kind:file.startsWith('proposal-')?'proposal_not_implemented':file.startsWith('marked-')?'current_with_explanatory_markers':file==='preview-crop.png'?'crop_from_current_screenshot':'current_product_screenshot'}));
  const payload=JSON.stringify(audit,null,2)+'\n';fs.writeFileSync(path.join(__dirname,'audit.json'),payload);fs.writeFileSync(path.join(dir,'audit.json'),payload);
  fs.writeFileSync(path.join(__dirname,'review-validation.json'),JSON.stringify({status:'passed',proposalPages:3,annotatedPages:3,interactiveTabs:3,toggle:true,jsErrors:failures,productChanges:false},null,2));
  console.log('3 annotated + 3 proposal images rendered; report tabs and marker toggle passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
