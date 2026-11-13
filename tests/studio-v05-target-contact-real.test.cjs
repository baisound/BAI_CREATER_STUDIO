'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const h=require('./helpers/studio-harness.cjs');
const root=process.env.BAI_REAL_MMD_DATA;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function json(r,status=200){const text=await r.text();assert.equal(r.status,status,text);return JSON.parse(text);}
test('real registered PMX/VMD: weighted sole contact uses isolated copies and keeps original hashes',
 {timeout:240000,skip:!root&&'BAI_REAL_MMD_DATA がありません'},async()=>{
  const meta=JSON.parse(fs.readFileSync(path.join(root,'mmd_assets.json'),'utf8'));
  const model=meta.A.find(e=>e.name.toLowerCase().endsWith('.pmx'));
  const motion=meta.vmd.find(e=>/頭振|head/i.test(e.name)&&e.name.toLowerCase().endsWith('.vmd'));
  assert.ok(model&&motion,'実PMXと静的接地を確認できる頭振りVMDが必要です');
  const entries=meta.A.filter(e=>e.name===model.name||!e.name.toLowerCase().endsWith('.pmx'));
  const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[motion]})},original=[];
  for(const [kind,entriesForKind] of [['A',entries],['vmd',[motion]]])for(const e of entriesForKind){
    const file=path.join(root,'mmd',kind,...e.name.split('/'));
    const bytes=fs.readFileSync(file);seed[`mmd/${kind}/${e.name}`]=bytes;original.push({file,hash:sha(bytes)});
  }
  const output=path.resolve(__dirname,'../../test-temp/target-contact-fit-real');fs.mkdirSync(output,{recursive:true});
  const s=await h.startServer({port:8918,seed});let browser,page;
  const post=(route,body)=>fetch(s.base+'/api/studio/v05/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(json);
  const report={status:'running'};
  try{
    const id=(await post('projects',{name:'実PMX接地の隔離確認',kind:'empty'})).project.id;
    const scene=await post('scene/instances',{project_id:id,revision:0,action:'add',asset_id:'mmd:A:'+model.name,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}});
    const rid=scene.instances[0].id;
    const placed=await post('arrangement/place',{project_id:id,revision:0,asset_id:'mmd:vmd:'+motion.name,track:'motion',start:0,duration:3});
    await post('scene/motion-target',{project_id:id,revision:placed.revision,clip_id:placed.clip.id,instance_id:rid});
    browser=await require('playwright').chromium.launch({executablePath:h.chromiumPath(),args:['--no-sandbox']});page=await s.newPage(browser);
    await page.goto(s.base+'/studio/v05/index.html');await page.locator('#v06project').selectOption(id,{force:true});
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.open);await page.evaluate(()=>window.BAIStudioMultiScenePreview.open());
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready&&window.BAIStudioMultiScenePreview.status().motion.loadedClips.length===1,null,{timeout:120000});
    report.gpu=await h.webglRenderer(page);if(process.env.BAI_REAL_GPU==='1')assert.equal(report.gpu.gpuVerified,true);
    const before=await page.evaluate(rid=>window.BAIStudioMultiScenePreview.contactProbe(rid,'左'),rid);
    const floor=Math.round((before.sole[1]+.002)*1e6)/1e6;
    report.candidate=await page.evaluate(options=>window.BAIStudioMultiScenePreview.contactCreate(options),{side:'左',start_frame:6,end_frame:36,ground_y:floor});
    assert.ok(report.candidate.report.vertexCount>20);
    assert.ok(report.candidate.report.maxHeight<=report.candidate.report.tolerance);
    assert.ok(report.candidate.report.maxSlide<=report.candidate.report.tolerance);
    await page.locator('#v-contact-save').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'candidate.png')});
    await page.evaluate(()=>{
      for(const [n,selector] of [[1,'#v-contact-first'],[2,'#v-contact-before'],[3,'#v58-canvas']]){
        const r=document.querySelector(selector).getBoundingClientRect(),mark=document.createElement('div');mark.className='contact-qa-mark';
        mark.style.cssText=`position:fixed;pointer-events:none;z-index:99999;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;border:2px solid #ffd45a;box-sizing:border-box`;
        const badge=document.createElement('b');badge.textContent=n;badge.style.cssText='background:#ffd45a;color:#111;padding:2px 5px';mark.append(badge);document.body.append(mark);
      }
    });
    await page.screenshot({path:path.join(output,'candidate-marked.png')});await page.evaluate(()=>document.querySelectorAll('.contact-qa-mark').forEach(el=>el.remove()));
    await page.locator('#v-contact-save').click();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.contactState().state==='保存済み');
    const saved=await json(await fetch(s.base+'/api/studio/v05/motion-edits?id='+id));assert.equal(saved.layers.length,1);assert.equal(saved.layers[0].keys.length,30);
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready);
    await page.locator('#v58-motion-seek').fill('.3');await page.getByRole('button',{name:'時刻を移動',exact:true}).click();
    const after=await page.evaluate(rid=>window.BAIStudioMultiScenePreview.contactProbe(rid,'左'),rid);
    assert.ok(Math.abs(after.sole[1]-floor)<=after.tolerance);
    for(const f of original)assert.equal(sha(fs.readFileSync(f.file)),f.hash);
    h.assertNoErrors(page);report.status='passed';report.sourceHashesUnchanged=original.length;
  }catch(e){report.status='failed';report.error=e.stack;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw e;}
  finally{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));await browser?.close();await s.stop();}
});
