'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const root=process.env.BAI_REAL_MMD_DATA;
const pmx='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const alternate='avatar-front-garment-v04.pmx';
const available=root&&fs.existsSync(path.join(root,'mmd','A',pmx))&&
  fs.existsSync(path.join(root,'mmd','B',alternate));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function json(response,status=200){const body=await response.text();assert.equal(response.status,status,body);return JSON.parse(body);}

test('v0.5 shows registered PMX mouth measurements and group vowel manual warning',
  {skip:!available&&'BAI_REAL_MMD_DATA に実PMXがありません'},async()=>{
  const source=path.join(root,'mmd','A',pmx),other=path.join(root,'mmd','B',alternate);
  const before=sha(source),beforeOther=sha(other);
  const meta=JSON.parse(fs.readFileSync(path.join(root,'mmd_assets.json'),'utf8'));
  const entries=meta.A.filter(entry=>entry.name===pmx||entry.name.startsWith('tex/'));
  const entriesB=meta.B.filter(entry=>entry.name===alternate||entry.name.startsWith('tex/'));
  const seed={'mmd_assets.json':JSON.stringify({A:entries,B:entriesB,vmd:[]})};
  for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(path.join(root,'mmd','A',...entry.name.split('/')));
  for(const entry of entriesB)seed[`mmd/B/${entry.name}`]=fs.readFileSync(path.join(root,'mmd','B',...entry.name.split('/')));
  const server=await harness.startServer({port:8930,seed});
  let browser,page;
  try{
    const created=await json(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'口モーフ解析隔離',kind:'empty'})}));
    const projectId=created.project.id;
    const scene=await json(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,action:'add',
        revision:0,asset_id:`mmd:A:${pmx}`,
        transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
    const withOther=await json(await fetch(`${server.base}/api/studio/v05/scene/instances`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,action:'add',
        revision:scene.revision,asset_id:`mmd:B:${alternate}`,
        transform:{position:[3,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
    browser=await server.launchBrowser();page=await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(projectId);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===2,null,{timeout:120000});
    await page.locator('#v58-multi-preview select[aria-label="表示対象モデル"]').selectOption(scene.instances[0].id);
    await page.locator('#v178-morph-analysis > summary').click();
    assert.equal(await page.locator('#v178-analysis-run').isEnabled(),true);
    const responsePromise=page.waitForResponse(response=>response.url().includes('/pmx/morph-analysis'),{timeout:30000});
    await page.locator('#v178-analysis-run').click();
    const response=await responsePromise;
    const body=await response.text();
    assert.equal(response.status(),200,body);
    const measured=JSON.parse(body);
    assert.equal(measured.asset_id,`mmd:A:${pmx}`);
    assert.equal(measured.modelHash,before);
    assert.equal(measured.morphs.length,48);
    await page.waitForFunction(()=>document.querySelector('#v178-analysis-status')?.textContent.includes('48件'));
    assert.match(await page.locator('#v178-analysis-status').textContent(),/手動確認\d+件/);
    assert.match(await page.locator('#v178-analysis-info').textContent(),/あ：グループモーフ/);
    assert.match(await page.locator('#v178-analysis-info').textContent(),/手動で確認/);
    const upper=measured.morphs.find(row=>row.name==='口上');
    await page.locator('#v178-analysis-name').selectOption(String(upper.id));
    assert.match(await page.locator('#v178-analysis-info').textContent(),/移動頂点1136件/);
    assert.match(await page.locator('#v178-analysis-info').textContent(),/中央値0\.09341/);
    await page.locator('#v180-morph-map summary').click();
    const mouth={A:['あ',0.8],I:['い',0.7],U:['う',0.6],E:['え',0.7],O:['お',0.9]};
    for(const [shape,[name,weight]] of Object.entries(mouth)){
      const row=measured.morphs.find(item=>item.name===name);
      assert.equal(row.manualRequired,true);
      await page.locator('#v180-map-'+shape).selectOption(String(row.id));
      await page.locator('#v180-weight-'+shape).fill(String(weight));
    }
    let mapResponse=page.waitForResponse(response=>response.url().includes('/pmx/morph-map')&&
      response.request().method()==='POST',{timeout:30000});
    await page.locator('#v180-map-draft').click();
    assert.equal((await mapResponse).status(),200);
    let map=await json(await fetch(`${server.base}/api/studio/v05/pmx/morph-map?project_id=${projectId}`));
    assert.equal(map.revision,1);
    assert.equal(map.maps[0].confirmed,false);
    assert.equal(map.maps[0].entries.A.weight,0.8);
    assert.match(await page.locator('#v180-map-status').textContent(),/下書き/);
    mapResponse=page.waitForResponse(response=>response.url().includes('/pmx/morph-map')&&
      response.request().method()==='POST',{timeout:30000});
    await page.locator('#v180-map-confirm').click();
    assert.equal((await mapResponse).status(),200);
    map=await json(await fetch(`${server.base}/api/studio/v05/pmx/morph-map?project_id=${projectId}`));
    assert.equal(map.revision,2);
    assert.equal(map.maps[0].confirmed,true);
    assert.equal(map.maps[0].source_status,'valid');
    assert.match(await page.locator('#v180-map-status').textContent(),/確定済み/);
    await page.getByRole('button',{name:'配置を再読み込み'}).click();
    await page.waitForFunction(()=>document.querySelector('#v180-map-status')?.textContent.includes('確定済み'),
      null,{timeout:120000});
    assert.equal(await page.locator('#v180-map-A').isDisabled(),true);
    await page.locator('#v178-analysis-run').click();
    await page.waitForFunction(()=>!document.querySelector('#v180-map-A')?.disabled,null,{timeout:30000});
    assert.equal(await page.locator('#v180-map-A').inputValue(),String(measured.morphs.find(row=>row.name==='あ').id));
    assert.equal(await page.locator('#v180-weight-O').inputValue(),'0.9');
    await page.locator('#v58-multi-preview select[aria-label="表示対象モデル"]').selectOption(withOther.instances[1].id);
    assert.equal(await page.locator('#v178-analysis-name').isHidden(),true);
    assert.doesNotMatch(await page.locator('#v178-analysis-status').textContent(),/48件/);
    const second=page.waitForResponse(response=>response.url().includes('/pmx/morph-analysis'),{timeout:30000});
    await page.locator('#v178-analysis-run').click();
    assert.equal((await second).status(),200);
    await page.waitForFunction(()=>document.querySelector('#v178-analysis-status')?.textContent.includes('0件'));
    assert.match(await page.locator('#v178-analysis-info').textContent(),/口パネルのモーフがありません/);
    assert.equal(await page.locator('#v180-map-draft').isDisabled(),true);
    assert.match(await page.locator('#v180-map-status').textContent(),/未保存/);
    fs.appendFileSync(path.join(server.dataDir,'mmd','A',pmx),Buffer.from([0]));
    await page.locator('#v58-multi-preview select[aria-label="表示対象モデル"]').selectOption(scene.instances[0].id);
    await page.locator('#v178-analysis-run').click();
    await page.waitForFunction(()=>document.querySelector('#v180-map-status')?.textContent.includes('原本変更'),
      null,{timeout:30000});
    const stale=await json(await fetch(`${server.base}/api/studio/v05/pmx/morph-map?project_id=${projectId}`));
    assert.equal(stale.maps[0].source_status,'changed');
    assert.equal(stale.maps[0].id,map.maps[0].id,'旧対応表を保持');
    const saved=await json(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${projectId}`));
    assert.equal(saved.revision,withOther.revision);
    assert.deepEqual(saved.face_keys,[]);
    harness.assertNoErrors(page);
    console.log(JSON.stringify({modelHash:before,mouth:measured.morphs.length,upper:upper.median,
      manualVowel:measured.morphs.find(row=>row.name==='あ').manualRequired}));
  }finally{
    await page?.close();await browser?.close();await server.stop();
    assert.equal(sha(source),before,'PMX original changed');
    assert.equal(sha(other),beforeOther,'alternate PMX original changed');
  }
});
