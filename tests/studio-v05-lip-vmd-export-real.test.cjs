'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const root=process.env.BAI_REAL_MMD_DATA;
const modelName='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const modelPath=root&&path.join(root,'mmd','A',modelName);
const available=Boolean(modelPath&&fs.existsSync(modelPath));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function json(response,status=200){const raw=await response.text();assert.equal(response.status,status,raw);return JSON.parse(raw);}

test('v0.5 SRT UI exports separate morph VMD and real PMX playback changes mouth',
  {skip:!available&&'BAI_REAL_MMD_DATA に実PMXがありません'},async()=>{
  const originalModel=fs.readFileSync(modelPath),originalHash=sha(originalModel);
  const meta=JSON.parse(fs.readFileSync(path.join(root,'mmd_assets.json'),'utf8'));
  const entries=meta.A.filter(row=>row.name===modelName||row.name.startsWith('tex/'));
  const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[]})};
  for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(path.join(root,'mmd','A',...entry.name.split('/')));
  const server=await harness.startServer({port:8943,seed});
  let browser,page;
  try{
    const project=await json(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'口形VMD実PMX隔離',kind:'empty'})}));
    const projectId=project.project.id,assetId=`mmd:A:${modelName}`;
    const scene=await json(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,action:'add',revision:0,
        asset_id:assetId,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
    const instanceId=scene.instances[0].id;
    const analysis=await json(await fetch(`${server.base}/api/studio/v05/pmx/morph-analysis?asset_id=${encodeURIComponent(assetId)}`));
    assert.equal(analysis.modelHash,originalHash);
    const byName=new Map(analysis.morphs.map(row=>[row.name,row]));
    const entriesByShape={};
    for(const [shape,name,weight] of [['A','あ',.8],['I','い',.7],['U','う',.6],['E','え',.7],['O','お',.9]]){
      const row=byName.get(name);assert.ok(row,`PMX morph ${name}`);
      entriesByShape[shape]={morph_id:row.id,morph_name:name,weight};
    }
    entriesByShape.Closed=null;entriesByShape.Rest=null;
    await json(await fetch(`${server.base}/api/studio/v05/pmx/morph-map`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,revision:0,action:'set',
        model_asset_id:assetId,model_hash:originalHash,analysis_hash:analysis.analysisHash,
        entries:entriesByShape,confirmed:true})}));
    browser=await server.launchBrowser();page=await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(projectId);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v187-srt-panel > summary').click();
    await page.waitForFunction(()=>document.querySelector('#v187-status')?.textContent.includes('0件'));
    const originalSrt=Buffer.from('1\r\n00:00:01,000 --> 00:00:03,000\r\nあい\r\n');
    await page.locator('#v187-file').setInputFiles({name:'lip.srt',mimeType:'text/plain',buffer:originalSrt});
    await page.locator('#v187-encoding').selectOption('utf-8');
    let response=page.waitForResponse(r=>r.url().includes('/srt/import')&&r.request().method()==='POST');
    await page.locator('#v187-import').click();assert.equal((await response).status(),200);
    await page.waitForFunction(()=>document.querySelector('#v187-status')?.textContent.includes('1発話'));
    await page.locator('#v190-reading-state').selectOption('confirmed');
    await page.locator('#v190-reading-kana').fill('あい');
    response=page.waitForResponse(r=>r.url().includes('/lip/readings')&&r.request().method()==='POST');
    await page.locator('#v190-reading-save').click();assert.equal((await response).status(),200);
    await page.waitForFunction(()=>document.querySelector('#v190-reading-status')?.textContent.includes('確定済み'));
    await page.locator('#v192-candidate-run').click();
    await page.waitForFunction(()=>document.querySelectorAll('#v194-draft-list .v194-draft-row').length===2);
    await page.locator('#v194-draft-list .v194-draft-row').nth(1).locator('[data-field="weight"]').fill('0.5');
    response=page.waitForResponse(r=>r.url().includes('/lip/drafts')&&r.request().method()==='POST');
    await page.locator('#v194-draft-save').click();assert.equal((await response).status(),200);
    await page.waitForFunction(()=>document.querySelector('#v194-draft-status')?.textContent.includes('保存しました'));
    await page.locator('#v197-export-panel > summary').click();
    assert.equal(await page.locator('#v197-export-map').inputValue(),assetId);
    response=page.waitForResponse(r=>r.url().endsWith('/lip/vmd-candidate')&&r.request().method()==='POST');
    await page.locator('#v197-export-check').click();
    const dryResponse=await response;assert.equal(dryResponse.status(),200,await dryResponse.text());
    const dry=await dryResponse.json();
    assert.equal(dry.dryRun,true);assert.equal(dry.morphKeys,4);
    await page.waitForFunction(()=>!document.querySelector('#v197-export-create')?.disabled);
    response=page.waitForResponse(r=>r.url().endsWith('/lip/vmd-candidate')&&r.request().method()==='POST');
    await page.locator('#v197-export-create').click();
    const madeResponse=await response;assert.equal(madeResponse.status(),200,await madeResponse.text());
    const made=await madeResponse.json();
    assert.equal(made.dryRun,false);assert.equal(made.candidateOnly,true);
    await page.waitForFunction(()=>!document.querySelector('#v197-export-download')?.hidden);
    assert.match(await page.locator('#v197-export-status').textContent(),/実PMXの外観確認と採用は未完了/);
    assert.equal(await page.locator('#v197-export-download').getAttribute('download'),made.fileName);
    const vmd=Buffer.from(await(await fetch(server.base+made.downloadUrl)).arrayBuffer());
    assert.equal(sha(vmd),made.sha256);
    await page.locator('#v194-draft-list .v194-draft-row').nth(1).locator('[data-field="weight"]').fill('0.4');
    assert.equal(await page.locator('#v197-export-download').isHidden(),true,
      '未保存の下書き編集で古い候補リンクを隠す');
    assert.equal(await page.locator('#v197-export-create').isDisabled(),true);
    const {MMDParser}=await import('three/examples/jsm/libs/mmdparser.module.js');
    const buffer=vmd.buffer.slice(vmd.byteOffset,vmd.byteOffset+vmd.byteLength);
    const parsed=new MMDParser.Parser().parseVmd(buffer,false);
    assert.deepEqual(parsed.morphs.map(row=>[row.morphName,row.frameNum]),
      [['あ',30],['あ',60],['い',60],['い',90]]);
    assert.ok(Math.abs(parsed.morphs[0].weight-.8)<1e-6);
    assert.ok(Math.abs(parsed.morphs[2].weight-.35)<1e-6);
    const candidateOnDisk=path.join(server.dataDir,'studio_v05_lip_vmd_candidates',projectId,made.candidateId+'.vmd');
    assert.deepEqual(fs.readFileSync(candidateOnDisk),vmd);
    // Test-only registration in the isolated server proves PMX playback; product adoption remains separate.
    const testVmdName='LIP001-review-only.vmd';
    fs.mkdirSync(path.join(server.dataDir,'mmd','vmd'),{recursive:true});
    fs.writeFileSync(path.join(server.dataDir,'mmd','vmd',testVmdName),vmd);
    const isolatedMeta=JSON.parse(fs.readFileSync(path.join(server.dataDir,'mmd_assets.json'),'utf8'));
    isolatedMeta.vmd.push({name:testVmdName,size:vmd.length});
    fs.writeFileSync(path.join(server.dataDir,'mmd_assets.json'),JSON.stringify(isolatedMeta));
    const placed=await json(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
        asset_id:`mmd:vmd:${testVmdName}`,track:'motion',start:0,duration:4,revision:0})}));
    await json(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,
        clip_id:placed.clip.id,revision:placed.revision,instance_id:instanceId})}));
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,null,{timeout:120000});
    const read=async frame=>{
      await page.evaluate(frame=>window.BAIStudioTimeline.seek(frame/30,'lip-vmd-real-test'),frame);
      await page.waitForTimeout(250);
      const morphs=await page.evaluate(id=>window.BAIStudioMultiScenePreview.morphProbe(id).morphs,instanceId);
      return {morphs,pixels:await page.locator('#v58-canvas canvas').screenshot()};
    };
    const at30=await read(30),at60=await read(60),at90=await read(90);
    assert.ok(Math.abs(at30.morphs['あ']-.8)<.01,`F30 A=${at30.morphs['あ']}`);
    assert.ok(Math.abs(at60.morphs['あ'])<.01&&Math.abs(at60.morphs['い']-.35)<.01,
      `F60 A/I=${at60.morphs['あ']}/${at60.morphs['い']}`);
    assert.ok(Math.abs(at90.morphs['い'])<.01,`F90 I=${at90.morphs['い']}`);
    assert.notEqual(sha(at30.pixels),sha(at60.pixels),'実PMXの口形切替が描画に現れません');
    assert.deepEqual(fs.readFileSync(path.join(server.dataDir,'studio_v05_srt_sources',projectId,'sources',sha(originalSrt)+'.srt')),originalSrt);
    assert.equal(sha(originalModel),originalHash);
    harness.assertNoErrors(page);
    console.log(JSON.stringify({modelHash:originalHash,vmdHash:made.sha256,morphKeys:made.morphKeys,
      frames:[30,60,90],values:[at30.morphs['あ'],at60.morphs['い'],at90.morphs['い']]}));
  }finally{await page?.close();await browser?.close();await server.stop();
    assert.equal(sha(fs.readFileSync(modelPath)),originalHash,'実PMX原本が変わりました');}
});
