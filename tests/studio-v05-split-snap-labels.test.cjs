'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');

async function ok(response, expected=200) { const body=await response.text(); assert.equal(response.status,expected,body); return JSON.parse(body); }
function wav() {
  const samples=16000,data=Buffer.alloc(samples*4),head=Buffer.alloc(44);
  for(let i=4000;i<samples;i++){const v=Math.round(Math.sin(i*Math.PI/16)*8000);data.writeInt16LE(v,i*4);data.writeInt16LE(v,i*4+2)}
  head.write('RIFF',0);head.writeUInt32LE(36+data.length,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);
  head.writeUInt16LE(1,20);head.writeUInt16LE(2,22);head.writeUInt32LE(8000,24);head.writeUInt32LE(32000,28);
  head.writeUInt16LE(4,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(data.length,40);
  return Buffer.concat([head,data]);
}
function rms(mp4,start,length=0.2) {
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(start),'-i','pipe:0','-t',String(length),'-map','0:a:0','-ac','1','-ar','8000','-f','s16le','pipe:1'],{input:mp4,maxBuffer:8*1024*1024});
  assert.equal(result.status,0,result.stderr.toString());let sum=0,count=0;
  for(let i=0;i+1<result.stdout.length;i+=2){const v=result.stdout.readInt16LE(i);sum+=v*v;count++}
  return Math.sqrt(sum/Math.max(1,count));
}
function frameMean(mp4,start) {
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(start),'-i','pipe:0','-frames:v','1','-vf','scale=96:64','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{input:mp4,maxBuffer:8*1024*1024});
  assert.equal(result.status,0,result.stderr.toString());assert.ok(result.stdout.length>0);
  return result.stdout.reduce((total,value)=>total+value,0)/result.stdout.length;
}

test('scissors split keeps source windows, separated pieces move/extend, snap and track labels persist',async()=>{
  const server=await harness.startServer({port:8899});let browser,page;
  try{
    const audio=await ok(await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=lead.wav`,{method:'POST',body:wav()}));
    const video=await ok(await fetch(`${server.base}/api/library-assets/upload?kind=video&name=preview.mp4`,{method:'POST',body:fs.readFileSync(path.join(__dirname,'fixtures','media_preview.mp4'))}));
    const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'ハサミと吸着試験',kind:'empty'})}));
    const id=project.project.id;
    browser=await server.launchBrowser();page=await server.newPage(browser);await page.goto(`${server.base}/studio/v05/index.html`);
    const readArr=async()=>ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    const waitArr=async predicate=>{const deadline=Date.now()+7000;let value;do{value=await readArr();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,75))}while(Date.now()<deadline);throw new Error('Arrangement did not update: '+JSON.stringify(value))};
    const box=async clipId=>{const locator=page.locator(`#v07timeline [data-clip-id="${clipId}"]`);for(let i=0;i<8;i++){try{await locator.waitFor({state:'visible',timeout:1500});await locator.scrollIntoViewIfNeeded({timeout:1500});const bounds=await locator.boundingBox();if(bounds)return bounds}catch{}await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('Clip has no visible bounds: '+clipId)};
    await page.locator('#v06project').selectOption(id);await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v06cat').selectOption('audio');
    await page.locator('#v07timeline [data-track="audio"]').waitFor({state:'visible'});
    await page.locator('#v06results [draggable="true"]').first().waitFor({state:'visible'});
    await page.locator('#v06results [draggable="true"]').first().dragTo(page.locator('#v07timeline [data-track="audio"]'),{targetPosition:{x:0,y:15}});
    await page.locator('#v07timeline [data-track="audio"] [data-clip-id]').waitFor();
    let data=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    const original=data.clips[0];assert.equal(original.duration,2);
    await page.locator('#v84CutMode').click();
    await page.waitForFunction(()=>document.querySelector('#v84CutMode')?.getAttribute('aria-pressed')==='true');
    await page.locator(`#v07timeline [data-clip-id="${original.id}"]`).waitFor({state:'visible'});
    let rect=await box(original.id);
    await page.mouse.click(rect.x+24,rect.y+rect.height/2);
    try{await page.waitForFunction(()=>document.querySelectorAll('#v07timeline [data-track="audio"] [data-clip-id]').length===2,null,{timeout:6000})}catch(error){throw new Error(`${error.message}; status=${await page.locator('#v06status').innerText()}; data=${JSON.stringify(await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`)))}`)}
    data=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    let left=data.clips.find(c=>c.id===original.id),right=data.clips.find(c=>c.id!==original.id);
    assert.ok(left&&right,JSON.stringify({original,data}));
    assert.deepEqual([left.start,left.duration,left.source_start,right.start,right.duration,right.source_start],[0,1,0,1,1,1]);
    const edge=await fetch(`${server.base}/api/studio/v05/arrangement/clip/split`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,clip_id:right.id,revision:data.revision,split_at:right.start})});
    assert.equal(edge.status,400);
    const stale=await fetch(`${server.base}/api/studio/v05/arrangement/clip/split`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,clip_id:right.id,revision:data.revision-1,split_at:1.5})});
    assert.equal(stale.status,409);
    await page.locator('#v84SelectMode').click();
    await page.locator(`#v07timeline [data-clip-id="${right.id}"]`).waitFor({state:'visible'});
    rect=await box(right.id);
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
    await page.mouse.move(rect.x+rect.width/2+48,rect.y+rect.height/2,{steps:8});await page.mouse.up();
    await waitArr(d=>d.clips.some(c=>c.start===3));
    await page.waitForFunction(clipId=>document.querySelector(`[data-clip-id="${clipId}"]`)?.title.includes('3秒〜4秒'),right.id);
    data=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));right=data.clips.find(c=>c.id===right.id);assert.equal(right.source_start,1);
    rect=await box(left.id);
    await page.mouse.move(rect.x+rect.width-3,rect.y+rect.height/2);await page.mouse.down();
    await page.mouse.move(rect.x+rect.width-3+12,rect.y+rect.height/2,{steps:8});await page.mouse.up();
    await waitArr(d=>d.clips.some(c=>c.start===0&&c.duration===1.5));
    await page.waitForFunction(clipId=>document.querySelector(`[data-clip-id="${clipId}"]`)?.title.includes('1.5秒'),left.id);
    rect=await box(right.id);
    await page.mouse.move(rect.x+3,rect.y+rect.height/2);await page.mouse.down();
    await page.mouse.move(rect.x+3-12,rect.y+rect.height/2,{steps:8});await page.mouse.up();
    await waitArr(d=>d.clips.some(c=>c.start===2.5&&c.source_start===0.5));
    await page.waitForFunction(clipId=>document.querySelector(`[data-clip-id="${clipId}"]`)?.title.includes('元素材 0.5秒'),right.id);
    await page.locator('#v84SnapToggle').click();await page.waitForFunction(()=>document.querySelector('#v84SnapToggle')?.getAttribute('aria-pressed')==='false');
    await page.locator(`#v07timeline [data-clip-id="${left.id}"]`).waitFor({state:'visible'});
    rect=await box(left.id);
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
    await page.mouse.move(rect.x+rect.width/2+7,rect.y+rect.height/2,{steps:6});await page.mouse.up();
    await waitArr(d=>d.clips.some(c=>c.start>0&&c.start<0.5));
    data=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));left=data.clips.find(c=>c.id===left.id);right=data.clips.find(c=>c.id===right.id);
    assert.ok(left.start>0.2&&left.start<0.4,JSON.stringify({left,right}));assert.equal(right.start,2.5);assert.equal(right.source_start,0.5);
    assert.ok(await page.locator('#v07timeline .v77-ticks span').count()>6,'ruler must be finer than 10 seconds');
    await page.waitForFunction(()=>{const lane=document.querySelector('#v07timeline [data-track="audio"]');return lane?.isConnected&&getComputedStyle(lane).backgroundImage.includes('repeating-linear-gradient')});
    await page.locator('#v07zoom').evaluate(el=>{el.value='120';el.dispatchEvent(new Event('input',{bubbles:true}))});
    await page.waitForFunction(()=>[...document.querySelectorAll('#v07timeline .v77-ticks span')].some(el=>el.textContent==='0.5秒'));
    await page.locator('#v07timeline .v77-track-label').filter({hasText:'音声'}).locator('span').dblclick();
    const input=page.locator('#v07timeline input[aria-label="audio トラック名"]');await input.fill('髙田 Audio');await input.press('Enter');
    await page.waitForFunction(()=>[...document.querySelectorAll('#v07timeline .v77-track-label span')].some(el=>el.textContent==='髙田 Audio'));
    const layout=await ok(await fetch(`${server.base}/api/studio/v05/timeline/layout?id=${id}`));assert.equal(layout.labels.audio,'髙田 Audio');
    const emoji=await fetch(`${server.base}/api/studio/v05/timeline/labels`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,revision:layout.revision,key:'model',label:'😀'})});assert.equal(emoji.status,400);
    await page.locator('#v07zoom').evaluate(el=>{el.value='24';el.dispatchEvent(new Event('input',{bubbles:true}))});
    await page.waitForFunction(()=>document.querySelector('#v07timeline [data-track="video"]')?.style.width==='720px');
    await page.locator('#v06cat').selectOption('video');
    await page.locator('#v06results [draggable="true"]').first().dragTo(page.locator('#v07timeline [data-track="video"]'),{targetPosition:{x:120,y:15}});
    await page.locator('#v07timeline [data-track="video"] [data-clip-id]').waitFor();
    data=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));const videoClip=data.clips.find(c=>c.category==='video');assert.equal(videoClip.start,5);
    await page.locator('#v84CutMode').click();await page.waitForFunction(()=>document.querySelector('#v84CutMode')?.getAttribute('aria-pressed')==='true');rect=await box(videoClip.id);
    await page.mouse.click(rect.x+24,rect.y+rect.height/2);
    await waitArr(d=>d.clips.filter(c=>c.category==='video').length===2);
    data=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    assert.deepEqual(data.clips.filter(c=>c.category==='video').map(c=>c.source_start),[0,1]);
    const videoRight=data.clips.find(c=>c.category==='video'&&c.id!==videoClip.id);
    await ok(await fetch(`${server.base}/api/studio/v05/arrangement/clip/edit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,clip_id:videoRight.id,revision:data.revision,action:'update',track:'video',lane:1,start:7,duration:1,source_start:1})}));
    data=await readArr();
    await ok(await fetch(`${server.base}/api/studio/v05/arrangement/clip/edit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,clip_id:videoRight.id,revision:data.revision,action:'update',track:'video',lane:1,start:6.5,duration:1.5,source_start:0.5})}));
    data=await readArr();assert.deepEqual(data.clips.find(c=>c.id===videoRight.id)&&[data.clips.find(c=>c.id===videoRight.id).start,data.clips.find(c=>c.id===videoRight.id).duration,data.clips.find(c=>c.id===videoRight.id).source_start],[6.5,1.5,0.5]);
    await page.reload();await page.locator('#v06project').selectOption(id);await page.locator('#nav [data-workspace="edit"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#v07timeline [data-clip-id]').length===4);
    assert.equal(await page.locator('#v07timeline .v77-track-label').filter({hasText:'髙田 Audio'}).count(),1);
    await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68?.status().ready&&document.querySelectorAll('#v68layers audio').length===2&&document.querySelectorAll('#v68layers video').length===2);
    await page.locator('#v68frame').fill('162');await page.locator('#v68seek').click();
    await page.waitForFunction(()=>{const element=document.querySelectorAll('#v68layers audio')[1];return element?.readyState>=1&&Math.abs(element.currentTime-0.7)<0.12});
    await page.locator('#v68frame').fill('402');await page.locator('#v68seek').click();
    await page.waitForFunction(()=>{const element=document.querySelectorAll('#v68layers video')[1];return element?.readyState>=1&&Math.abs(element.currentTime-0.7)<0.12});
    const range=await ok(await fetch(`${server.base}/api/studio/v05/timeline/range`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,revision:0,arrangement_revision:data.revision,in_frame:0,out_frame:479})}));
    const started=await ok(await fetch(`${server.base}/api/studio/v05/render/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,range_revision:range.revision,arrangement_revision:data.revision,resolution:'720p'})}),202);
    let job;const deadline=Date.now()+60000;do{await new Promise(resolve=>setTimeout(resolve,300));job=await ok(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${started.id}`))}while(['queued','running'].includes(job.status)&&Date.now()<deadline);
    assert.equal(job.status,'succeeded',job.error);
    const output=Buffer.from(await(await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
    assert.ok(rms(output,0.3)<100,'lead silence before the first source tone');
    assert.ok(rms(output,1)>300,'extended left side restores the original tone');
    assert.ok(rms(output,2.7)>300,'extended right side restores the earlier source tone');
    assert.ok(frameMean(output,5.2)>frameMean(output,6.2)+15,'moved video split leaves a visible gap');
    assert.ok(frameMean(output,6.7)>frameMean(output,6.2)+15,'right video split restores source frames after its moved cut');
  }finally{await page?.close();await browser?.close();await server.stop()}
});
