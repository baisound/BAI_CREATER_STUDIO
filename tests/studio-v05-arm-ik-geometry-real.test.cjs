'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const source=process.env.BAI_REAL_MMD_DATA;
const model='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const motion='狐面物理確認用_頭振り_F000-0300.vmd';
const modelPath=source&&path.join(source,'mmd','A',model);
const motionPath=source&&path.join(source,'mmd','vmd',motion);
const exists=modelPath&&motionPath&&fs.existsSync(modelPath)&&fs.existsSync(motionPath);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));
async function ok(response){
  const body=await response.text();
  if(response.status!==200)throw Error(body);
  return JSON.parse(body);
}

test('real PMX arm chain starts nearly straight and needs a stable 3D pole',
  {skip:!exists&&'BAI_REAL_MMD_DATA に実素材がありません',timeout:180000},async()=>{
  const before=[digest(modelPath),digest(motionPath)];
  const metadata=JSON.parse(fs.readFileSync(path.join(source,'mmd_assets.json'),'utf8'));
  const entries=metadata.A.filter(entry=>entry.name===model||entry.name.startsWith('tex/'));
  const seed={'mmd_assets.json':JSON.stringify({A:entries,B:[],
    vmd:[{name:motion,size:fs.statSync(motionPath).size}]})};
  for(const entry of entries)seed[`mmd/A/${entry.name}`]=fs.readFileSync(
    path.join(source,'mmd','A',...entry.name.split('/')));
  seed[`mmd/vmd/${motion}`]=fs.readFileSync(motionPath);
  const server=await harness.startServer({port:8899,seed});
  let browser,page;
  try{
    const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'腕IK幾何検証',kind:'empty'})}));
    const id=project.project.id;
    const scene=await ok(await fetch(`${server.base}/api/studio/v05/scene/instances`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:id,action:'add',revision:0,asset_id:`mmd:A:${model}`,
        transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}})}));
    const instanceId=scene.instances[0].id;
    const placed=await ok(await fetch(`${server.base}/api/studio/v05/arrangement/place`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:id,asset_id:`mmd:vmd:${motion}`,
        track:'motion',start:0,duration:10,revision:0})}));
    await ok(await fetch(`${server.base}/api/studio/v05/scene/motion-target`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:id,clip_id:placed.clip.id,
        revision:placed.revision,instance_id:instanceId})}));
    browser=await server.launchBrowser();page=await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v70sceneOpen').click();
    await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().loaded===1&&
      window.BAIStudioMultiScenePreview?.status().motion?.loadedClips.length===1,
      null,{timeout:120000});
    await page.evaluate(()=>window.BAIStudioTimeline.seek(4,'arm-geometry'));
    const names=['左腕','左腕捩','左ひじ','左手捩','左手首',
      '右腕','右腕捩','右ひじ','右手捩','右手首'];
    const pose=await page.evaluate(input=>window.BAIStudioMultiScenePreview.poseProbe(
      input.instanceId,input.names),{instanceId,names});
    const position=name=>pose.bones[name].world.slice(12,15);
    const measured={};
    for(const side of ['左','右']){
      const shoulder=position(side+'腕'),elbow=position(side+'ひじ'),wrist=position(side+'手首');
      const upper=distance(shoulder,elbow),lower=distance(elbow,wrist);
      const direct=distance(shoulder,wrist),straightGap=upper+lower-direct;
      const axis=wrist.map((value,index)=>(value-shoulder[index])/direct);
      const along=elbow.reduce((sum,value,index)=>sum+(value-shoulder[index])*axis[index],0);
      const radial=distance(elbow,shoulder.map((value,index)=>value+along*axis[index]));
      const inner=direct-0.04;
      const circleX=(upper*upper-lower*lower+inner*inner)/(2*inner);
      const inwardCircleRadius=Math.sqrt(Math.max(0,upper*upper-circleX*circleX));
      measured[side]={upper,lower,direct,straightGap,radial,inwardCircleRadius,
        twistBeforeElbow:distance(position(side+'腕捩'),elbow),
        twistBeforeWrist:distance(position(side+'手捩'),wrist)};
      assert.ok(upper>0.15&&lower>0.15);
      assert.ok(straightGap>=0&&straightGap<1e-4);
      assert.ok(radial<0.001);
      assert.ok(inwardCircleRadius>0.05);
      assert.ok(measured[side].twistBeforeElbow>0.02);
      assert.ok(measured[side].twistBeforeWrist>0.02);
    }
    console.log(JSON.stringify(measured));
    const endpoint=`${server.base}/api/studio/v05/motion-edits`;
    const post=body=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:id,...(!['undo','redo'].includes(body.action)?
        {instance_id:instanceId,clip_id:placed.clip.id}:{}),...body})});
    const head={frame:240,bone:'頭',rotation:[0,0,0,1]};
    const first=await ok(await post({revision:0,action:'set',key:head}));
    assert.equal(first.revision,1);
    const arm={frame:240,bone:'左腕',rotation:[0,0,0,1]};
    const elbow={frame:240,bone:'左ひじ',rotation:[0,0,0,1]};
    const paired=await ok(await post({revision:1,action:'arm-set',keys:[arm,elbow]}));
    assert.equal(paired.revision,2);
    assert.deepEqual(paired.layers[0].keys.map(key=>key.bone),['左ひじ','左腕','頭']);
    const invalid=await post({revision:2,action:'arm-set',keys:[arm,{...elbow,frame:241}]});
    assert.equal(invalid.status,422);
    assert.equal((await ok(await fetch(`${endpoint}?id=${id}`))).revision,2);
    const undo=await ok(await post({revision:2,action:'undo'}));
    assert.equal(undo.revision,3);
    assert.deepEqual(undo.layers[0].keys.map(key=>key.bone),['頭']);
    const redo=await ok(await post({revision:3,action:'redo'}));
    assert.equal(redo.revision,4);
    assert.deepEqual(redo.layers[0].keys.map(key=>key.bone),['左ひじ','左腕','頭']);
    harness.assertNoErrors(page);
  }finally{
    await page?.close();await browser?.close();await server.stop();
    assert.deepEqual([digest(modelPath),digest(motionPath)],before);
  }
});
