'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');

function wavWithLeadSilence() {
  const samples = 16000, data = Buffer.alloc(samples * 4), head = Buffer.alloc(44);
  for (let i = 4000; i < samples; i++) {
    const sample = Math.round(Math.sin(i * Math.PI / 16) * 8000);
    data.writeInt16LE(sample, i * 4); data.writeInt16LE(sample, i * 4 + 2);
  }
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(8000, 24);
  head.writeUInt32LE(32000, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
async function ok(response, expected=200) { const text=await response.text(); assert.equal(response.status,expected,text); return JSON.parse(text); }

test('video/audio drag uses source length, left trim stores source offset, preview and MP4 read the same audio window', async () => {
  const server=await harness.startServer({port:8897});
  let browser,page;
  try {
    const audio=await ok(await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=lead.wav`,{method:'POST',body:wavWithLeadSilence()}));
    const video=await ok(await fetch(`${server.base}/api/library-assets/upload?kind=video&name=preview.mp4`,{method:'POST',body:fs.readFileSync(path.join(__dirname,'fixtures','media_preview.mp4'))}));
    const info=await ok(await fetch(`${server.base}/api/studio/v05/media-info?id=${encodeURIComponent(audio.item.id)}`));
    assert.equal(info.kind,'audio');assert.equal(info.duration_seconds,2);
    const project=await ok(await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'媒体別タイムライン試験',kind:'empty'})}));
    const id=project.project.id;
    browser=await server.launchBrowser();page=await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(id);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v06cat').selectOption('audio');
    await page.locator('#v06results [draggable="true"]').first().dragTo(page.locator('#v07timeline [data-track="audio"]'),{targetPosition:{x:0,y:15}});
    await page.locator('#v07timeline [data-track="audio"] [data-clip-id]').waitFor();
    let arrangement=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    assert.equal(arrangement.clips[0].duration,2);assert.equal(arrangement.clips[0].source_start,0);
    const clip=page.locator(`#v07timeline [data-clip-id="${arrangement.clips[0].id}"]`);
    await clip.scrollIntoViewIfNeeded();let rect=await clip.boundingBox();
    await page.mouse.move(rect.x+4,rect.y+rect.height/2);await page.mouse.down();
    await page.mouse.move(rect.x+16,rect.y+rect.height/2,{steps:8});await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#v07timeline [data-track="audio"] [data-clip-id]')?.title.includes('元素材 0.5秒'));
    arrangement=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    const trimmed=arrangement.clips[0];assert.equal(trimmed.start,0.5);assert.equal(trimmed.duration,1.5);assert.equal(trimmed.source_start,0.5);
    const bad=await fetch(`${server.base}/api/studio/v05/arrangement/clip/edit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,clip_id:trimmed.id,revision:arrangement.revision,action:'update',track:'audio',start:0.5,duration:2,lane:1,source_start:0.5})});
    assert.equal(bad.status,400);assert.match((await bad.json()).error,/source media duration/);
    await page.locator('#v06cat').selectOption('video');
    await page.locator('#v06results [draggable="true"]').first().dragTo(page.locator('#v07timeline [data-track="video"]'),{targetPosition:{x:48,y:15}});
    await page.locator('#v07timeline [data-track="video"] [data-clip-id]').waitFor();
    arrangement=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    const videoClip=arrangement.clips.find(c=>c.category==='video');
    assert.equal(videoClip.start,2);assert.equal(videoClip.duration,2);
    const videoButton=page.locator(`#v07timeline [data-clip-id="${videoClip.id}"]`);
    await videoButton.scrollIntoViewIfNeeded();rect=await videoButton.boundingBox();
    await page.mouse.move(rect.x+rect.width-3,rect.y+rect.height/2);await page.mouse.down();
    await page.mouse.move(rect.x+rect.width-15,rect.y+rect.height/2,{steps:8});await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#v07timeline [data-track="video"] [data-clip-id]')?.title.includes('3.5秒'));
    arrangement=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    assert.equal(arrangement.clips.find(c=>c.category==='video').duration,1.5);
    await page.reload();await page.locator('#v06project').selectOption(id);await page.locator('#nav [data-workspace="edit"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#v07timeline [data-clip-id]').length===2);
    arrangement=await ok(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    assert.equal(arrangement.clips.find(c=>c.category==='audio').source_start,0.5);
    assert.equal(arrangement.clips.find(c=>c.category==='video').duration,1.5);
    await page.waitForFunction(()=>window.BAIStudioMediaPreviewV68?.status().ready&&window.BAIStudioMediaPreviewV68.status().mediaCount===2);
    await page.locator('#v68frame').fill('60');await page.locator('#v68seek').click();
    await page.waitForFunction(()=>document.querySelector('#v68layers audio')?.readyState>=1&&Math.abs(document.querySelector('#v68layers audio').currentTime-1)<0.1);
    const range=await ok(await fetch(`${server.base}/api/studio/v05/timeline/range`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,revision:0,arrangement_revision:arrangement.revision,in_frame:30,out_frame:89})}));
    const started=await ok(await fetch(`${server.base}/api/studio/v05/render/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,range_revision:range.revision,arrangement_revision:arrangement.revision,resolution:'720p'})}),202);
    let job;const deadline=Date.now()+60000;
    do{await new Promise(resolve=>setTimeout(resolve,350));job=await ok(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${started.id}`))}while(['queued','running'].includes(job.status)&&Date.now()<deadline);
    assert.equal(job.status,'succeeded',job.error);
    const output=Buffer.from(await(await fetch(`${server.base}/api/studio/v05/render/file?id=${started.id}`)).arrayBuffer());
    const decode=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-t','0.2','-map','0:a:0','-ac','1','-ar','8000','-f','s16le','pipe:1'],{input:output,maxBuffer:8*1024*1024});
    assert.equal(decode.status,0,decode.stderr.toString());
    let sum=0;for(let i=0;i+1<decode.stdout.length;i+=2){const v=decode.stdout.readInt16LE(i);sum+=v*v}
    assert.ok(Math.sqrt(sum/Math.max(1,decode.stdout.length/2))>300,'trimmed source should start with the tone, not the original silence');
  } finally {await page?.close();await browser?.close();await server.stop()}
});
