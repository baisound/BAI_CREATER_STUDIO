'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function json(reply){const body=await reply.text();assert.equal(reply.status,200,body);return JSON.parse(body);}

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
      const seek=async(seconds,projectFrame,cameraFrame,held)=>{
        await page.evaluate(value=>window.BAIStudioCameraV29Runtime.seek(value),seconds);
        try{
          await page.waitForFunction(({projectFrame,cameraFrame,held})=>{
            const state=window.BAIStudioCameraV29Runtime?.status();
            return state?.frame===projectFrame&&state.sampleFrame===cameraFrame&&
              state.heldAtEnd===held;
          },{projectFrame,cameraFrame,held},{timeout:10000});
        }catch(error){
          const state=await page.evaluate(()=>({camera:window.BAIStudioCameraV29Runtime?.status()}));
          throw new Error(`Camera ${seconds}s mismatch: ${JSON.stringify(state)}`,{cause:error});
        }
        return page.evaluate(()=>window.BAIStudioCameraV29Runtime.status());
      };
      const at4=await seek(4,96,120,false);
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
      const at20=await seek(20,480,300,true);
      assert.equal(at20.requestedCameraFrame,600);
      assert.equal(at20.pose.position[0],12);
      const at2=await seek(2,48,60,false);
      assert.equal(at2.pose.position[0],6);
      assert.equal(hash(cameraPath),original);
      harness.assertNoErrors(page);
    }finally{
      await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.stop();
    }
  });
