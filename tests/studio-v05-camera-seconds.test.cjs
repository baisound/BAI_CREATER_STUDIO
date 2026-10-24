'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function json(reply){const body=await reply.text();assert.equal(reply.status,200,body);return JSON.parse(body);}
async function seekCamera(page,seconds,projectFrame,cameraFrame,held=false){
  let state=null;
  for(let attempt=0;attempt<5;attempt++){
    state=await page.evaluate(value=>window.BAIStudioCameraV29Runtime.seek(value),seconds);
    if(state?.frame===projectFrame&&state.sampleFrame===cameraFrame&&
      state.heldAtEnd===held)return state;
    // Project bootstrap can invalidate an in-flight seek via generation++.
    await page.waitForTimeout(100);
  }
  throw new Error(`Camera ${seconds}s mismatch: ${JSON.stringify(state)}`);
}

test('24fps project evaluates legacy 30fps camera at the same seconds and holds its tail',
  {timeout:120000},async()=>{
    const camera={schema:1,fps:30,duration:300,keys:[
      {frame:0,position:[0,1.6,5],target:[0,1,0],fov:40},
      {frame:120,position:[12,1.6,5],target:[0,1,0],fov:40}]};
    const server=await harness.startServer({port:8920,seed:{
      'camera_project.json':JSON.stringify(camera)}});
    let browser,page;
    try{
      const cameraPath=path.join(server.dataDir,'camera_project.json');
      const original=hash(cameraPath);
      const created=await json(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'CAM-015 24fpsと30fps同時刻',kind:'empty'})}));
      const projectId=created.project.id;
      await json(await fetch(`${server.base}/api/studio/v05/project/fps`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,fps:24})}));
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(projectId);
      await page.waitForFunction(()=>window.BAIStudioCameraV29Runtime?.getFrameRate()===24);
      const at4=await seekCamera(page,4,96,120);
      assert.equal(at4.cameraFps,30);
      assert.equal(at4.requestedCameraFrame,120);
      assert.equal(at4.pose.position[0],12);
      const byFrame=await json(await fetch(`${server.base}/api/camera/sequence/evaluate?frame=120`));
      const bySeconds=await json(await fetch(`${server.base}/api/camera/sequence/evaluate?seconds=4`));
      assert.deepEqual(bySeconds.pose,byFrame.pose);
      assert.equal(bySeconds.requested_seconds,4);
      assert.equal(bySeconds.requested_frame,120);
      for(const query of ['seconds=-1','seconds=NaN','seconds=Infinity',
        'seconds=4&frame=120']){
        assert.equal((await fetch(`${server.base}/api/camera/sequence/evaluate?${query}`)).status,400,query);
      }
      const at20=await seekCamera(page,20,480,300,true);
      assert.equal(at20.requestedCameraFrame,600);
      assert.equal(at20.pose.position[0],12);
      const at2=await seekCamera(page,2,48,60);
      assert.equal(at2.pose.position[0],6);
      assert.equal(hash(cameraPath),original);
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });

test('24/60fps projects cross half-open 30fps camera cuts at the same seconds',
  {timeout:120000},async()=>{
    const camera={schema:1,fps:30,duration:300,keys:[
      {frame:0,position:[0,1.6,5],target:[0,1,0],fov:40},
      {frame:150,position:[15,1.6,5],target:[0,1,0],fov:40}],
    custom_presets:[
      {name:'A',pose:{position:[100,1.6,5],target:[0,1,0],fov:40}},
      {name:'B',pose:{position:[200,1.6,5],target:[0,1,0],fov:40}}],
    sequence:[{start:60,end:90,preset:'A',transition:'cut'},
      {start:90,end:120,preset:'B',transition:'cut'}]};
    const server=await harness.startServer({port:8921,seed:{
      'camera_project.json':JSON.stringify(camera)}});
    let browser,page;
    try{
      const cameraPath=path.join(server.dataDir,'camera_project.json');
      const original=hash(cameraPath);
      const created=await json(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'CAM-015 カット境界',kind:'empty'})}));
      const projectId=created.project.id;
      await json(await fetch(`${server.base}/api/studio/v05/project/fps`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,fps:24})}));
      const created60=await json(await fetch(`${server.base}/api/studio/v05/projects`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'CAM-015 カット境界60fps',kind:'empty'})}));
      const project60Id=created60.project.id;
      browser=await server.launchBrowser();page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      await page.locator('#v06project').selectOption(projectId);
      await page.waitForFunction(()=>window.BAIStudioCameraV29Runtime?.getFrameRate()===24);
      const cases=[
        {projectFrame:47,cameraFrame:59,source:'keys',preset:null,x:5.9},
        {projectFrame:48,cameraFrame:60,source:'sequence',preset:'A',x:100},
        {projectFrame:71,cameraFrame:89,source:'sequence',preset:'A',x:100},
        {projectFrame:72,cameraFrame:90,source:'sequence',preset:'B',x:200},
        {projectFrame:95,cameraFrame:119,source:'sequence',preset:'B',x:200},
        {projectFrame:96,cameraFrame:120,source:'keys',preset:null,x:12}];
      for(const expected of cases){
        const seconds=expected.projectFrame/24;
        const state=await seekCamera(page,seconds,expected.projectFrame,expected.cameraFrame);
        assert.equal(state.frame,expected.projectFrame);
        assert.equal(state.requestedCameraFrame,expected.cameraFrame);
        assert.equal(state.sampleFrame,expected.cameraFrame);
        assert.ok(Math.abs(state.pose.position[0]-expected.x)<1e-9);
        const api=await json(await fetch(`${server.base}/api/camera/sequence/evaluate?seconds=${seconds}`));
        assert.equal(api.source,expected.source);
        assert.equal(api.preset,expected.preset);
        assert.equal(api.frame,expected.cameraFrame);
        assert.deepEqual(api.pose,state.pose);
      }
      await page.locator('#v06project').selectOption(project60Id);
      await page.waitForFunction(id=>window.BAIStudioPersistedSeek?.status()?.projectId===id&&
        window.BAIStudioCameraV29Runtime?.getFrameRate()===60,project60Id);
      for(const [seconds,projectFrame,cameraFrame,preset] of [
        [2,120,60,'A'],[3,180,90,'B'],[4,240,120,null]]){
        const state=await seekCamera(page,seconds,projectFrame,cameraFrame);
        assert.equal(state.frame,projectFrame);
        assert.equal(state.sampleFrame,cameraFrame);
        assert.equal(state.cameraFps,30);
        const api=await json(await fetch(`${server.base}/api/camera/sequence/evaluate?seconds=${seconds}`));
        assert.equal(api.preset,preset);
        assert.deepEqual(api.pose,state.pose);
      }
      assert.equal(hash(cameraPath),original);
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
