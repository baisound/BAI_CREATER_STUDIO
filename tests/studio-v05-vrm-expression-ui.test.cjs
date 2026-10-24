'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const root=process.env.BAI_REAL_MMD_DATA;
const oldName='21130746078bfaf0ce15.vrm';
const newName='W02_白峰ユキナ.vrm';
const available=root&&[oldName,newName].every(name=>fs.existsSync(path.join(root,'integrated_v02','assets',name)));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function json(response,status=200){const body=await response.text();assert.equal(response.status,status,body);return JSON.parse(body);}

test('v0.5 VRM expression map saves bound vowels and keeps unbound definitions as draft',
  {skip:!available&&'BAI_REAL_MMD_DATA に実VRMがありません'},async()=>{
  const oldSource=path.join(root,'integrated_v02','assets',oldName);
  const newSource=path.join(root,'integrated_v02','assets',newName);
  const oldHash=sha(oldSource),newHash=sha(newSource);
  const seed={
    'integrated_v02/catalog.json':JSON.stringify({models:[
      {name:'VRM0実例',source_asset:'assets/legacy.vrm',owner_complete:true},
      {name:'VRM1実例',source_asset:'assets/modern.vrm',owner_complete:true}],motions:[]}),
    'integrated_v02/assets/legacy.vrm':fs.readFileSync(oldSource),
    'integrated_v02/assets/modern.vrm':fs.readFileSync(newSource)
  };
  const server=await harness.startServer({port:8932,seed});
  let browser,page;
  try{
    const created=await json(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'VRM表情定義隔離',kind:'empty'})}));
    const projectId=created.project.id;
    const add=async(assetId,revision,x)=>json(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        project_id:projectId,action:'add',revision,asset_id:assetId,
        transform:{position:[x,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
    const first=await add('integrated:legacy.vrm',0,0);
    const second=await add('integrated:modern.vrm',first.revision,3);
    browser=await server.launchBrowser();page=await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(projectId);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===2,null,{timeout:120000});
    const choose=page.locator('#v58-multi-preview select[aria-label="表示対象モデル"]');
    await choose.selectOption(first.instances[0].id);
    await page.locator('#v183-vrm-expressions > summary').click();
    assert.equal(await page.locator('#v183-vrm-run').isEnabled(),true);
    let response=page.waitForResponse(row=>row.url().includes('/vrm/expressions'),{timeout:30000});
    await page.locator('#v183-vrm-run').click();
    let data=await (await response).json();
    assert.equal(data.version,'0');assert.equal(data.modelHash,oldHash);
    assert.deepEqual(Object.values(data.vowels).map(row=>row.status),Array(5).fill('ready'));
    assert.match(await page.locator('#v183-vrm-status').textContent(),/実バインドのある母音5\/5/);
    assert.match(await page.locator('#v183-vrm-vowels').textContent(),/A \(a\)：実バインドあり/);
    await page.locator('#v184-vrm-map > summary').click();
    const oldAIndex=data.expressions.findIndex(row=>row.kind==='preset'&&row.name==='a');
    for(const [shape,name] of Object.entries({A:'a',I:'i',U:'u',E:'e',O:'o'})){
      const index=data.expressions.findIndex(row=>row.kind==='preset'&&row.name===name);
      assert.ok(index>=0);await page.locator(`#v184-map-${shape}`).selectOption(String(index));
      await page.locator(`#v184-weight-${shape}`).fill('0.8');
    }
    assert.equal(await page.locator('#v184-map-confirm').isEnabled(),true);
    let mapResponse=page.waitForResponse(row=>row.url().includes('/vrm/expression-map')&&
      row.request().method()==='POST');
    await page.locator('#v184-map-draft').click();
    assert.equal((await mapResponse).status(),200);
    let saved=await json(await fetch(`${server.base}/api/studio/v05/vrm/expression-map?project_id=${projectId}`));
    assert.equal(saved.revision,1);assert.equal(saved.maps[0].confirmed,false);
    mapResponse=page.waitForResponse(row=>row.url().includes('/vrm/expression-map')&&
      row.request().method()==='POST');
    await page.locator('#v184-map-confirm').click();
    assert.equal((await mapResponse).status(),200);
    saved=await json(await fetch(`${server.base}/api/studio/v05/vrm/expression-map?project_id=${projectId}`));
    assert.equal(saved.revision,2);assert.equal(saved.maps[0].confirmed,true);
    assert.equal(saved.maps[0].model_hash,oldHash);
    assert.match(await page.locator('#v184-map-status').textContent(),/確定済み/);
    await choose.selectOption(second.instances[1].id);
    assert.equal(await page.locator('#v183-vrm-name').isHidden(),true);
    assert.doesNotMatch(await page.locator('#v183-vrm-status').textContent(),/5\/5/);
    response=page.waitForResponse(row=>row.url().includes('/vrm/expressions'),{timeout:30000});
    await page.locator('#v183-vrm-run').click();
    data=await (await response).json();
    assert.equal(data.version,'1');assert.equal(data.modelHash,newHash);
    assert.deepEqual(Object.values(data.vowels).map(row=>row.status),Array(5).fill('unbound'));
    assert.match(await page.locator('#v183-vrm-status').textContent(),/実バインドのある母音0\/5/);
    assert.match(await page.locator('#v183-vrm-vowels').textContent(),/A \(aa\)：定義のみ・実変形なし/);
    for(const [shape,name] of Object.entries({A:'aa',I:'ih',U:'ou',E:'ee',O:'oh'})){
      const index=data.expressions.findIndex(row=>row.kind==='preset'&&row.name===name);
      assert.ok(index>=0);await page.locator(`#v184-map-${shape}`).selectOption(String(index));
    }
    assert.equal(await page.locator('#v184-map-confirm').isEnabled(),false);
    mapResponse=page.waitForResponse(row=>row.url().includes('/vrm/expression-map')&&
      row.request().method()==='POST');
    await page.locator('#v184-map-draft').click();
    assert.equal((await mapResponse).status(),200);
    saved=await json(await fetch(`${server.base}/api/studio/v05/vrm/expression-map?project_id=${projectId}`));
    assert.equal(saved.revision,3);assert.equal(saved.maps[1].confirmed,false);
    assert.equal(saved.maps[1].model_hash,newHash);
    const forced={...saved.maps[1],project_id:projectId,revision:3,action:'set',confirmed:true};
    delete forced.id;delete forced.source_status;
    const rejected=await fetch(`${server.base}/api/studio/v05/vrm/expression-map`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(forced)});
    assert.equal(rejected.status,422);
    await choose.selectOption(first.instances[0].id);
    response=page.waitForResponse(row=>row.url().includes('/vrm/expressions'),{timeout:30000});
    await page.locator('#v183-vrm-run').click();await response;
    await page.waitForFunction(()=>document.querySelector('#v184-map-status')?.textContent?.includes('確定済み'));
    assert.match(await page.locator('#v184-map-status').textContent(),/確定済み/);
    assert.equal(await page.locator('#v184-map-A').inputValue(),String(oldAIndex));
    const scene=await json(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${projectId}`));
    assert.equal(scene.revision,second.revision);
    assert.deepEqual(scene.face_keys,[]);
    harness.assertNoErrors(page);
    console.log(JSON.stringify({vrm0:oldHash,vrm1:newHash,ready0:5,ready1:0}));
  }finally{
    await page?.close();await browser?.close();await server.stop();
    assert.equal(sha(oldSource),oldHash,'VRM 0.x original changed');
    assert.equal(sha(newSource),newHash,'VRM 1.0 original changed');
  }
});
