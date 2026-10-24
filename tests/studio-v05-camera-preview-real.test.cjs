'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const harness=require('./helpers/studio-harness.cjs');

const sourceRoot=process.env.BAI_REAL_MMD_DATA;
const modelName='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const modelPath=sourceRoot&&path.join(sourceRoot,'mmd','A',modelName);
const available=modelPath&&fs.existsSync(modelPath);
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function json(reply){const body=await reply.text();assert.equal(reply.status,200,body);return JSON.parse(body);}
function rgb(png){
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0',
    '-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{input:png,maxBuffer:8*1024*1024});
  assert.equal(result.status,0,result.stderr.toString());
  assert.ok(result.stdout.length>1000);
  return result.stdout;
}
function differentPixels(a,b){
  assert.equal(a.length,b.length);
  let count=0;
  for(let i=0;i<a.length;i+=3){
    if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),
      Math.abs(a[i+2]-b[i+2]))>12)count++;
  }
  return count;
}

test('real PMX shooting canvas follows saved camera cuts and holds the last shot',
  {skip:!available&&'BAI_REAL_MMD_DATA に実PMXがありません',timeout:180000},async()=>{
    const original=hash(modelPath);
    const sourceMeta=JSON.parse(fs.readFileSync(path.join(sourceRoot,'mmd_assets.json'),'utf8'));
    const entries=sourceMeta.A.filter(row=>row.name===modelName||row.name.startsWith('tex/'));
    const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],vmd:[]})};
    for(const row of entries){
      const source=path.join(sourceRoot,'mmd','A',...row.name.split('/'));
      assert.ok(fs.existsSync(source),`missing ${row.name}`);
      seed[`mmd/A/${row.name}`]=fs.readFileSync(source);
    }
    const camera={schema:1,fps:30,duration:300,keys:[
      {frame:0,position:[0,1.5,6],target:[0,1,0],fov:40}],
    custom_presets:[
      {name:'A',pose:{position:[0,1.5,5],target:[0,1,0],fov:40}},
      {name:'B',pose:{position:[5,1.5,3],target:[0,1,0],fov:40}},
      {name:'last',pose:{position:[-5,1.5,3],target:[0,1,0],fov:40}}],
    sequence:[{start:60,end:90,preset:'A',transition:'cut'},
      {start:90,end:120,preset:'B',transition:'cut'},
      {start:240,end:300,preset:'last',transition:'cut'}]};
    seed['camera_project.json']=JSON.stringify(camera);
    const server=await harness.startServer({port:8923,seed});
    let browser,page;
    try{
      const cameraPath=path.join(server.dataDir,'camera_project.json');
      const cameraHash=hash(cameraPath);
      const created=await json(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'CAM-015 実PMX撮影カット',kind:'empty'})}));
      const projectId=created.project.id;
      const assetId=`mmd:A:${modelName}`;
      const transform={position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
      await json(await fetch(`${server.base}/api/studio/v05/scene/model`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,asset_id:assetId,transform,revision:0})}));
      const catalog=await json(await fetch(`${server.base}/api/studio/v05/scene/model-candidates`));
      const asset=catalog.items.find(item=>item.id===assetId);
      assert.ok(asset?.available);
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(projectId);
      await page.evaluate(({projectId,asset,transform})=>
        window.BAIStudioScenePreview.show(projectId,asset,transform),{projectId,asset,transform});
      await page.waitForFunction(()=>window.BAIStudioShootingCamera?.status()?.registered===true,
        null,{timeout:120000});
      const canvas=page.locator('[data-shooting-preview] canvas');
      await canvas.waitFor({state:'visible'});
      const capture=async(seconds,expectedFrame,expectedX)=>{
        let state=null;
        for(let attempt=0;attempt<5;attempt++){
          state=await page.evaluate(value=>window.BAIStudioCameraV29Runtime.seek(value),seconds);
          if(state?.sampleFrame===expectedFrame)break;
          await page.waitForTimeout(100);
        }
        assert.equal(state?.sampleFrame,expectedFrame);
        assert.equal(state.pose.position[0],expectedX);
        await page.waitForTimeout(180);
        const applied=await page.evaluate(()=>window.BAIStudioShootingCamera.status());
        assert.equal(applied.registered,true);
        assert.equal(applied.last.pose.position[0],expectedX);
        return {state,pixels:rgb(await canvas.screenshot())};
      };
      const first=await capture(2,60,0);
      const second=await capture(3,90,5);
      const last=await capture(10,299,-5);
      const held=await capture(20,299,-5);
      assert.equal(last.state.heldAtEnd,true);
      assert.equal(held.state.heldAtEnd,true);
      assert.ok(differentPixels(first.pixels,second.pixels)>100,
        'A/Bカットの撮影キャンバスに可視差がありません');
      assert.ok(differentPixels(second.pixels,last.pixels)>100,
        'B/末尾カットの撮影キャンバスに可視差がありません');
      assert.ok(differentPixels(last.pixels,held.pixels)<100,
        '終端保持後の撮影キャンバスが変化しました');
      assert.equal(hash(cameraPath),cameraHash);
      assert.equal(hash(modelPath),original);
      harness.assertNoErrors(page);
      const renderer=await harness.webglRenderer(page);
      console.log(JSON.stringify({model_sha256:original,camera_sha256:cameraHash,
        renderer:renderer.renderer,gpuVerified:renderer.gpuVerified,
        cameraFrames:[first.state.sampleFrame,second.state.sampleFrame,
          last.state.sampleFrame,held.state.sampleFrame],
        changedAB:differentPixels(first.pixels,second.pixels),
        changedBLast:differentPixels(second.pixels,last.pixels),
        changedLastHeld:differentPixels(last.pixels,held.pixels)}));
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
