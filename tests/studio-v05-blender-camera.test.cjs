'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');const h=require('./helpers/studio-harness.cjs');
const fixture=process.env.BAI_CAMERA_FIXTURE||path.resolve(__dirname,'../../test-temp/blender-camera-fixture');
const have=fs.existsSync(path.join(fixture,'camera-source.blend'))&&process.env.MIXAMO_BLENDER;
const output=path.resolve(__dirname,'../../test-temp/blender-camera-browser');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function json(r,status=200){const t=await r.text();assert.equal(r.status,status,t);return JSON.parse(t);}
function standard(base,name,args){const r=spawnSync(h.python,['-X','utf8','mcp_server.py'],{input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})+'\n',encoding:'utf8',maxBuffer:4e6,windowsHide:true,env:{...process.env,MIXAMO_VIEWER_URL:base}});assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout).result;assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
async function web(page,name,args){let result=await page.evaluate(async({name,args})=>document.modelContext.executeTool((await document.modelContext.getTools()).find(t=>t.name===name),args),{name,args});if(typeof result==='string')result=JSON.parse(result);assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
function wav(){const samples=48000*3,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);return b;}
function decode(bytes,select,width=1280,height=720){const args=['-v','error','-i','pipe:0'];if(select)args.push('-vf',select);args.push('-f','rawvideo','-pix_fmt','rgb24','pipe:1');const r=spawnSync('ffmpeg',args,{input:bytes,maxBuffer:40e6,windowsHide:true});assert.equal(r.status,0,r.stderr.toString());return r.stdout;}
function masks(raw,w,h){return [0,1,2].map(channel=>{let count=0,x=0,y=0,minX=w,minY=h,maxX=0,maxY=0;for(let i=0;i<w*h;i++){if(raw[i*3+channel]>160&&[0,1,2].filter(k=>k!==channel).every(k=>raw[i*3+k]<90)){const px=i%w,py=Math.floor(i/w);count++;x+=px;y+=py;minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);}}assert.ok(count>10,'色の目印が見えません');return {count,cx:x/count/w,cy:y/count/h,bounds:[minX/w,minY/h,(maxX+1)/w,(maxY+1)/h]};});}

test('actual Blender camera -> UI compare/adopt/history -> same scene clock and encoded MP4',
 {skip:!have&&'MIXAMO_BLENDER と生成Blender fixtureが必要です',timeout:360000},async()=>{
  fs.mkdirSync(output,{recursive:true});const source=fs.readFileSync(path.join(fixture,'camera-source.blend')),sourceHash=sha(source);
  const ref=JSON.parse(fs.readFileSync(path.join(fixture,'reference.json'),'utf8'));
  const track=JSON.parse(fs.readFileSync(path.join(fixture,'camera.json'),'utf8'));
  const s=await h.startServer({port:8921});let browser,page,cap;
  const post=(route,body,status=200)=>fetch(s.base+'/api/studio/v05/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>json(r,status));
  const report={cases:[],status:'running'};
  try{
    const id=(await post('projects',{name:'Blenderカメラの取込検証',kind:'empty'})).project.id;
    const model=(await json(await fetch(s.base+'/api/library-assets/upload?kind=stage&name=generated-stage.glb',{method:'POST',body:fs.readFileSync(path.join(fixture,'stage.glb'))}))).item;
    const clock=(await json(await fetch(s.base+'/api/library-assets/upload?kind=audio&name=clock.wav',{method:'POST',body:wav()}))).item;
    await post('arrangement/place',{project_id:id,revision:0,asset_id:clock.id,track:'audio',start:0,duration:3});
    let scene=await post('scene/instances',{project_id:id,action:'add',revision:0,asset_id:model.id,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}});
    scene=await post('scene/instances',{project_id:id,action:'camera',revision:scene.revision,camera:{position:[0,1,7],target:[0,1,0],fov:45}});
    const original=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+id));
    browser=await require('playwright').chromium.launch({executablePath:h.chromiumPath(),args:['--enable-features=WebMCP,WebMCPTesting','--no-sandbox']});page=await s.newPage(browser);
    await page.goto(s.base+'/studio/v05/index.html');await page.locator('#v06project').selectOption(id,{force:true});
    await page.getByRole('button',{name:'制作',exact:true}).click();await page.getByRole('button',{name:'カメラ・演出',exact:true}).click();
    const chooser=page.waitForEvent('filechooser');await page.locator('#bc-import').click();await(await chooser).setFiles(path.join(fixture,'camera-source.blend'));
    await page.waitForFunction(()=>/候補・未採用|拒否/.test(document.getElementById('bc-status').textContent),null,{timeout:120000});
    assert.match(await page.locator('#bc-status').innerText(),/候補・未採用/);
    assert.deepEqual(await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+id)),original);
    const cid=await page.locator('#bc-candidate').inputValue();assert.ok(cid);
    await page.locator('#bc-reload').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.getElementById('bc-reload').disabled);
    assert.equal(await page.locator('#bc-reload').evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.locator('#bc-candidate').inputValue(),cid);
    await page.locator('#bc-start').fill('30');
    const mapping=ref.normalized_mapping;
    await page.locator('#blender-camera-import details').evaluate(el=>el.open=true);
    await page.locator('#bc-scale').fill('');await page.locator('#blender-camera-import details').evaluate(el=>el.open=false);
    await page.locator('#bc-after').click();
    await page.waitForFunction(()=>!document.getElementById('bc-after').disabled);
    assert.equal(await page.locator('#bc-scale').evaluate(el=>el===document.activeElement&&el.closest('details').open),true);
    await page.locator('#bc-scale').fill(String(mapping.scale));for(const [i,axis] of ['X','Y','Z'].entries())await page.locator('#bc-'+axis).fill(String(mapping.offset[i]));
    await page.evaluate(()=>window.BAIStudioMediaPreviewV68.seek(30));
    const headBeforeCompare=await json(await fetch(s.base+'/api/studio/v05/playhead?id='+id));
    await page.locator('#bc-after').click();
    await page.waitForFunction(()=>window.BAIStudioBlenderCamera.state().compared&&!document.getElementById('bc-after').disabled,null,{timeout:60000});
    assert.equal(await page.locator('#bc-after').evaluate(el=>el===document.activeElement),true);
    const points=ref.points.map(p=>[p[0],p[2],-p[1]].map((n,i)=>n*mapping.scale+mapping.offset[i]));
    const ready=()=>page.waitForFunction(()=>window.BAIStudioMultiScenePreview.status().ready,null,{timeout:60000});
    const sample=async frame=>{await page.evaluate(f=>window.BAIStudioMediaPreviewV68.seek(f),frame);return page.evaluate(points=>window.BAIStudioMultiScenePreview.cameraProbe(points),points);};
    const preview=await sample(45);assert.equal(preview.imported,true);
    await page.locator('#bc-before').click();const before=await sample(45);assert.equal(before.imported,false);assert.notDeepEqual(before.projection,preview.projection);
    await page.locator('#bc-after').click();await page.waitForFunction(()=>window.BAIStudioBlenderCamera.state().compared);
    assert.deepEqual(await json(await fetch(s.base+'/api/studio/v05/playhead?id='+id)),headBeforeCompare);
    await page.setViewportSize({width:1024,height:768});
    assert.ok(await page.locator('#blender-camera-import').evaluate(el=>el.scrollWidth<=el.clientWidth+2));
    const resized=await sample(45);assert.deepEqual(resized.projection,preview.projection);
    await page.screenshot({path:path.join(output,'import-1024.png')});await page.setViewportSize({width:1440,height:900});
    await page.screenshot({path:path.join(output,'candidate.png')});
    await page.evaluate(()=>{
      for(const [selector,label] of [['#bc-import','1'],['#bc-after','2'],['#bc-adopt','3']]){
        const rect=document.querySelector(selector).getBoundingClientRect(),mark=document.createElement('div');
        mark.dataset.cameraMark='';Object.assign(mark.style,{position:'fixed',zIndex:99999,left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px',border:'2px solid #f3c33e',boxSizing:'border-box',pointerEvents:'none'});const badge=document.createElement('b');badge.textContent=label;Object.assign(badge.style,{position:'absolute',left:'0',top:'-17px',background:'#f3c33e',color:'#101820',padding:'0 5px',fontSize:'14px',lineHeight:'18px'});mark.append(badge);document.body.append(mark);
      }
    });
    await page.screenshot({path:path.join(output,'candidate-marked.png')});await page.locator('[data-camera-mark]').evaluateAll(els=>els.forEach(el=>el.remove()));
    assert.deepEqual(await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+id)),original);
    await page.locator('#bc-adopt').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('bc-status').textContent.startsWith('配置済み'),null,{timeout:60000});
    let arranged=await json(await fetch(s.base+'/api/studio/v05/arrangement?id='+id));assert.equal(arranged.clips.filter(c=>c.track==='camera').length,1);assert.equal(arranged.revision,2);
    assert.equal(await page.locator('#bc-import').evaluate(el=>el===document.activeElement),true);
    for(const reference of ref.references){
      const actual=await sample(30+reference.frame);
      const max=Math.max(...actual.ndc.flatMap((p,i)=>p.map((n,k)=>Math.abs(n-reference.ndc[i][k]))));
      assert.ok(max<.00002,`Blender NDC mismatch ${reference.frame}: ${max}`);
      assert.equal(actual.type,reference.camera==='A'?'PERSP':'ORTHO');
    }
    const outside=await sample(Math.ceil(30+track.samples.at(-1).time*60));assert.equal(outside.imported,false);assert.deepEqual(outside.projection,before.projection);
    await page.reload();await page.getByRole('button',{name:'制作',exact:true}).click();
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.open({composite:true,compact:true}));await ready();
    assert.deepEqual((await sample(45)).projection,preview.projection);
    await post('arrangement/history/undo',{project_id:id,revision:arranged.revision});
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());await ready();assert.equal((await sample(45)).imported,false);
    arranged=await post('arrangement/history/redo',{project_id:id,revision:3});
    await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());await ready();assert.equal((await sample(45)).imported,true);
    // Standard MCP uses the same service, no arbitrary local path access.
    const second=standard(s.base,'bai_studio_blender_camera_import_json',{project_id:id,name:'evaluated.json',track});
    const comparison=standard(s.base,'bai_studio_blender_camera_preview',{project_id:id,candidate_id:second.id,start_frame:120,mapping});
    const adopted=standard(s.base,'bai_studio_blender_camera_adopt',{project_id:id,candidate_id:second.id,start_frame:120,mapping,expected:comparison.expected,allow_unsupported:false});
    // Native WebMCP imports/prepares/adopts a third, non-overlapping camera clip.
    const third=await web(page,'bai_studio_blender_camera_import_json',{project_id:id,name:'web-evaluated.json',track});
    const thirdStart=Math.ceil(120+track.samples.at(-1).time*60);
    const prepared=await web(page,'bai_studio_blender_camera_preview',{project_id:id,candidate_id:third.id,start_frame:thirdStart,mapping});
    const final=await web(page,'bai_studio_blender_camera_adopt',{project_id:id,candidate_id:third.id,start_frame:thirdStart,mapping,expected:prepared.expected,allow_unsupported:false});
    assert.equal((await sample(thirdStart+1)).imported,true);assert.equal(await page.evaluate(()=>window.BAIStudioMediaPreviewV68.status().frame),thirdStart+1);
    report.cases.push('manual blend import/compare/Enter adoption, NDC 7 frames and cut, resize/reload/outside/history, stdio/native WebMCP');
    const range=await post('timeline/range',{project_id:id,revision:0,arrangement_revision:final.revision,in_frame:30,out_frame:89});
    let job=await post('render/jobs',{project_id:id,range_revision:range.revision,arrangement_revision:final.revision,scene_revision:scene.revision,resolution:'720p',name:'Blenderカメラ比較'},202);
    const deadline=Date.now()+180000;
    while(['queued','running'].includes(job.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,400));job=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}
    assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,60);
    const mp4=Buffer.from(await(await fetch(s.base+'/api/studio/v05/render/file?id='+job.id)).arrayBuffer());fs.writeFileSync(path.join(output,'camera.mp4'),mp4);
    const selected=ref.references.map(r=>r.frame);const raw=decode(mp4,`select='${selected.map(f=>`eq(n,${f})`).join('+')}',setpts=N/60/TB`);
    report.pixelComparisons=[];
    selected.forEach((frame,i)=>{
      const actual=masks(raw.subarray(i*1280*720*3,(i+1)*1280*720*3),1280,720);
      const expected=masks(decode(fs.readFileSync(path.join(fixture,`reference-${frame}.png`))),...track.resolution);
      const aspect=track.resolution[0]*track.pixel_aspect[0]/track.resolution[1]/track.pixel_aspect[1],w=Math.min(1,aspect/(16/9)),h=Math.min(1,(16/9)/aspect);
      for(const e of expected){e.cx=(1-w)/2+e.cx*w;e.cy=(1-h)/2+e.cy*h;e.bounds=e.bounds.map((n,k)=>{const size=k%2?h:w;return (1-size)/2+n*size;});}
      let error=0;
      actual.forEach((a,j)=>{error=Math.max(error,Math.abs(a.cx-expected[j].cx),Math.abs(a.cy-expected[j].cy),...a.bounds.map((n,k)=>Math.abs(n-expected[j].bounds[k])));});
      assert.ok(error<.008,`Blender/MP4 image landmarks ${frame}: ${error}`);report.pixelComparisons.push({frame,maxNormalizedError:error});
    });
    // Manual comparison can reach beyond the saved endpoint without saving a new playhead/range.
    await page.getByRole('button',{name:'カメラ・演出',exact:true}).click();
    await page.locator('#bc-candidate').selectOption(cid);await page.locator('#bc-start').fill('300');
    await page.locator('#blender-camera-import details').evaluate(el=>el.open=true);await page.locator('#bc-scale').fill(String(mapping.scale));for(const [i,axis] of ['X','Y','Z'].entries())await page.locator('#bc-'+axis).fill(String(mapping.offset[i]));
    const oldHead=await json(await fetch(s.base+'/api/studio/v05/playhead?id='+id));
    await page.locator('#bc-go').click();await page.waitForFunction(()=>window.BAIStudioBlenderCamera.state().compared);
    assert.equal(await page.evaluate(()=>window.BAIStudioMediaPreviewV68.status().frame),300);
    assert.deepEqual(await json(await fetch(s.base+'/api/studio/v05/playhead?id='+id)),oldHead);
    await page.locator('#bc-adopt').click();await page.waitForFunction(()=>document.getElementById('bc-status').textContent.startsWith('配置済み'));
    await sample(301);assert.equal(await page.evaluate(()=>window.BAIStudioMediaPreviewV68.status().frame),301);assert.equal((await sample(301)).imported,true);
    report.cases.push('temporary comparison clock outside original end does not save head; manual and WebMCP adoption extend real shared clock');
    // Manual JSON entry and an explicit acknowledgement for preserved-but-unapplied DOF.
    const dof=structuredClone(track);for(const sample of dof.samples)sample.lens.dof.enabled=true;
    const dofFile=path.join(output,'generated-dof.json');fs.writeFileSync(dofFile,JSON.stringify(dof));
    const dofChooser=page.waitForEvent('filechooser');await page.locator('#bc-import').click();await(await dofChooser).setFiles(dofFile);
    await page.waitForFunction(()=>document.getElementById('bc-status').textContent.startsWith('候補・未採用')&&!document.getElementById('bc-import').disabled);
    await page.locator('#bc-start').fill('420');await page.locator('#bc-go').click();await page.waitForFunction(()=>window.BAIStudioBlenderCamera.state().compared);
    assert.equal(await page.locator('#bc-warnings').isVisible(),true);assert.match(await page.locator('#bc-warning-text').innerText(),/DOF/);
    assert.equal(await page.locator('#bc-adopt').isDisabled(),true);await page.locator('#bc-ack').check();assert.equal(await page.locator('#bc-adopt').isEnabled(),true);
    await page.locator('#bc-start').fill('421');assert.equal(await page.locator('#bc-adopt').isDisabled(),true);assert.equal(await page.evaluate(()=>window.BAIStudioBlenderCamera.state().compared),false);
    report.cases.push('manual evaluated JSON, visible DOF warning and required acknowledgement, changed start invalidates comparison');
    assert.equal(sha(fs.readFileSync(path.join(fixture,'camera-source.blend'))),sourceHash);
    h.assertNoErrors(page);report.status='passed';report.sourceHashUnchanged=true;report.gpu=await h.webglRenderer(page);
  }catch(e){report.status='failed';report.error=e.stack;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw e;}
  finally{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));await browser?.close();await s.stop();}
});
