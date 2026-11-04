'use strict';
// LIP-001 #187: SRT panel creates a source-VMD composite candidate (synthetic PMX/VMD).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const harness=require('./helpers/studio-harness.cjs');

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function json(response,status=200){const raw=await response.text();assert.equal(response.status,status,raw);return JSON.parse(raw);}
const post=(server,route,body)=>fetch(server.base+route,{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

function sourceVmd(){
  // VMD 0002 (header+model name+zero bone count = 54 bytes), no bones, morph あ (CP932 82 A0) at F0/F30=0.8, F60/F90=0, then 4 empty tails.
  const header=Buffer.alloc(54);header.write('Vocaloid Motion Data 0002','latin1');header.write('test',30,'latin1');
  const keys=[[0,.8],[30,.8],[60,0],[90,0]];
  const morphs=Buffer.alloc(4+keys.length*23);morphs.writeUInt32LE(keys.length,0);
  keys.forEach(([frame,weight],index)=>{const o=4+index*23;morphs[o]=0x82;morphs[o+1]=0xa0;
    morphs.writeUInt32LE(frame,o+15);morphs.writeFloatLE(weight,o+19);});
  return Buffer.concat([header,morphs,Buffer.alloc(16)]);
}

test('v0.5 SRT panel writes a source VMD composite candidate and rejects discontinuities',async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lip-composite-'));
  const pmxFile=path.join(tmp,'tiny.pmx');
  execFileSync(process.env.PYTHON||'python3',[path.join(__dirname,'..','tools','make_test_pmx.py'),pmxFile]);
  const pmx=fs.readFileSync(pmxFile),vmd=sourceVmd();
  const vmdName='source-face.vmd';
  const server=await harness.startServer({port:8957,seed:{
    'mmd_assets.json':JSON.stringify({A:[{name:'tiny.pmx',size:pmx.length}],B:[],vmd:[{name:vmdName,size:vmd.length}]}),
    'mmd/A/tiny.pmx':pmx,[`mmd/vmd/${vmdName}`]:vmd}});
  let browser,page;
  try{
    const projectId=(await json(await post(server,'/api/studio/v05/projects',{name:'合成VMD画面',kind:'empty'}))).project.id;
    const assetId='mmd:A:tiny.pmx';
    const scene=await json(await post(server,'/api/studio/v05/scene/instances',{project_id:projectId,action:'add',
      revision:0,asset_id:assetId,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}}));
    const instanceId=scene.instances[0].id;
    const analysis=await json(await fetch(`${server.base}/api/studio/v05/pmx/morph-analysis?asset_id=${encodeURIComponent(assetId)}`));
    const entry={morph_id:analysis.morphs.find(row=>row.name==='あ').id,morph_name:'あ',weight:.8};
    const entries={A:entry,I:entry,U:entry,E:entry,O:entry,Closed:null,Rest:null};
    await json(await post(server,'/api/studio/v05/pmx/morph-map',{project_id:projectId,revision:0,action:'set',
      model_asset_id:assetId,model_hash:analysis.modelHash,analysis_hash:analysis.analysisHash,entries,confirmed:true}));
    const placed=await json(await post(server,'/api/studio/v05/arrangement/place',{project_id:projectId,
      asset_id:`mmd:vmd:${vmdName}`,track:'motion',start:0,duration:3,revision:0}));
    await json(await post(server,'/api/studio/v05/scene/motion-target',{project_id:projectId,
      clip_id:placed.clip.id,revision:placed.revision,instance_id:instanceId}));
    let sceneState=await json(await fetch(`${server.base}/api/studio/v05/scene/instances?id=${projectId}`));
    for(const [time,value] of [[2.5,0],[3,.5]])
      sceneState=await json(await post(server,'/api/studio/v05/scene/instances',{project_id:projectId,
        action:'face-set',revision:sceneState.revision,face_key:{instance_id:instanceId,morph_name:'あ',time,value,track:'expression'}}));

    browser=await server.launchBrowser();page=await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(projectId);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v187-srt-panel > summary').click();
    await page.waitForFunction(()=>document.querySelector('#v187-status')?.textContent.includes('0件'));
    const srt=Buffer.from('1\r\n00:00:01,000 --> 00:00:02,000\r\nあ\r\n');
    await page.locator('#v187-file').setInputFiles({name:'lip.srt',mimeType:'text/plain',buffer:srt});
    await page.locator('#v187-encoding').selectOption('utf-8');
    let response=page.waitForResponse(r=>r.url().includes('/srt/import')&&r.request().method()==='POST');
    await page.locator('#v187-import').click();assert.equal((await response).status(),200);
    await page.waitForFunction(()=>document.querySelector('#v187-status')?.textContent.includes('1発話'));
    await page.locator('#v190-reading-state').selectOption('confirmed');
    await page.locator('#v190-reading-kana').fill('あ');
    response=page.waitForResponse(r=>r.url().includes('/lip/readings')&&r.request().method()==='POST');
    await page.locator('#v190-reading-save').click();assert.equal((await response).status(),200);
    await page.waitForFunction(()=>document.querySelector('#v190-reading-status')?.textContent.includes('確定済み'));
    await page.locator('#v192-candidate-run').click();
    await page.waitForFunction(()=>document.querySelectorAll('#v194-draft-list .v194-draft-row').length===1);
    response=page.waitForResponse(r=>r.url().includes('/lip/drafts')&&r.request().method()==='POST');
    await page.locator('#v194-draft-save').click();assert.equal((await response).status(),200);
    await page.waitForFunction(()=>document.querySelector('#v194-draft-status')?.textContent.includes('保存しました'));
    await page.locator('#v197-export-panel > summary').click();
    await page.locator('#v197-export-check').click();
    await page.waitForFunction(()=>!document.querySelector('#v197-export-create')?.disabled);
    response=page.waitForResponse(r=>r.url().endsWith('/lip/vmd-candidate')&&r.request().method()==='POST');
    await page.locator('#v197-export-create').click();
    const lip=await (await response).json();
    assert.equal(lip.morphKeys,2);
    await page.waitForFunction(()=>!document.querySelector('#v199-adopt')?.disabled);
    response=page.waitForResponse(r=>r.url().endsWith('/lip/adoptions')&&r.request().method()==='POST');
    await page.locator('#v199-adopt').click();assert.equal((await response).status(),200);
    await page.waitForFunction(()=>document.querySelector('#v199-adoption-status')?.textContent.includes('採用中'));

    await page.waitForFunction(()=>!document.querySelector('#v240-composite-create')?.disabled);
    response=page.waitForResponse(r=>r.url().endsWith('/lip/composite-candidate')&&r.request().method()==='POST');
    await page.locator('#v240-composite-create').click();
    const madeResponse=await response;assert.equal(madeResponse.status(),200,await madeResponse.text());
    const made=await madeResponse.json();
    assert.equal(made.clipId,placed.clip.id);assert.equal(made.adoption.candidateId,lip.candidateId);
    assert.equal(made.readback.status,'passed_full_key_readback');
    await page.waitForFunction(()=>!document.querySelector('#v240-composite-download')?.hidden);
    assert.equal(await page.locator('#v240-composite-download').getAttribute('download'),made.fileName);
    assert.match(await page.locator('#v240-composite-status').textContent(),/読み直して照合済み/);
    const downloaded=Buffer.from(await(await fetch(server.base+made.downloadUrl)).arrayBuffer());
    assert.equal(sha(downloaded),made.sha256);
    const {MMDParser}=await import('three/examples/jsm/libs/mmdparser.module.js');
    const parsed=new MMDParser.Parser().parseVmd(downloaded.buffer.slice(downloaded.byteOffset,
      downloaded.byteOffset+downloaded.byteLength),false);
    const mouth=new Map(parsed.morphs.filter(row=>row.morphName==='あ').map(row=>[row.frameNum,row.weight]));
    assert.equal(mouth.size,91);
    assert.ok(Math.abs(mouth.get(45)-.4)<1e-6&&Math.abs(mouth.get(90)-.5)<1e-6);

    // A manual key that steps between VMD frames is rejected and listed in the panel.
    sceneState=await json(await post(server,'/api/studio/v05/scene/instances',{project_id:projectId,
      action:'face-set',revision:sceneState.revision,face_key:{instance_id:instanceId,morph_name:'あ',time:.5,value:0,track:'expression'}}));
    harness.expectErrors(page,[/Failed to load resource: the server responded with a status of 422/]);
    response=page.waitForResponse(r=>r.url().endsWith('/lip/composite-candidate')&&r.request().method()==='POST');
    await page.locator('#v240-composite-create').click();
    assert.equal((await response).status(),422);
    await page.waitForFunction(()=>document.querySelector('#v240-composite-issues')?.textContent.includes('再現できない'));
    assert.match(await page.locator('#v240-composite-status').textContent(),/合成候補を作れません/);
    assert.equal(await page.locator('#v240-composite-download').isHidden(),true);
    assert.equal((await fetch(server.base+made.downloadUrl)).status,409,'入力が変わった候補は取得不可');
    assert.deepEqual(fs.readFileSync(path.join(server.dataDir,'mmd','vmd',vmdName)),vmd);
    assert.deepEqual(fs.readFileSync(path.join(server.dataDir,'mmd','A','tiny.pmx')),pmx);
    harness.assertNoErrors(page);
  }finally{await page?.close();await browser?.close();await server.stop();fs.rmSync(tmp,{recursive:true,force:true});}
});
