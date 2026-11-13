'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const h=require('./helpers/studio-harness.cjs');
const output=path.resolve(__dirname,'../../test-temp/target-contact-fit');
async function json(r,status=200){const text=await r.text();assert.equal(r.status,status,text);return JSON.parse(text);}
function standard(base,name,args){
  const result=spawnSync(h.python,['-X','utf8','mcp_server.py'],{input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})+'\n',
    encoding:'utf8',windowsHide:true,env:{...process.env,MIXAMO_VIEWER_URL:base}});
  assert.equal(result.status,0,result.stderr);const out=JSON.parse(result.stdout).result;assert.ok(!out.isError,JSON.stringify(out));return JSON.parse(out.content[0].text);
}
async function web(page,args){
  let out=await page.evaluate(async args=>document.modelContext.executeTool((await document.modelContext.getTools()).find(t=>t.name==='bai_studio_pmx_contact_candidate'),args),args);
  if(typeof out==='string')out=JSON.parse(out);assert.ok(!out.isError,JSON.stringify(out));return JSON.parse(out.content[0].text);
}
function pixels(bytes){const run=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{input:bytes,maxBuffer:4e6,windowsHide:true});assert.equal(run.status,0,run.stderr.toString());return run.stdout;}
function samePose(a,b){
  for(const field of ['sole','ankle','target','morphs']){
    assert.equal(a[field].length,b[field].length);
    a[field].forEach((n,i)=>assert.ok(Math.abs(n-b[field][i])<=1e-9,`${field}[${i}] changed`));
  }
}

test('target PMX sole contact: two proportions, bounded preview/save/undo/reload and negative cases',
 {timeout:360000},async()=>{
  fs.mkdirSync(output,{recursive:true});
  const generated=spawnSync(h.python,['-X','utf8','-m','tests.helpers.contact-fit-fixture'],{cwd:h.root,encoding:'utf8'});
  assert.equal(generated.status,0,generated.stderr);
  const seed=Object.fromEntries(Object.entries(JSON.parse(generated.stdout)).map(([p,b])=>[p,Buffer.from(b,'base64')]));
  const s=await h.startServer({port:8917,seed});let browser,page;
  const post=(route,body,status=200)=>fetch(s.base+'/api/studio/v05/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>json(r,status));
  const results=[];
  try{
    browser=await require('playwright').chromium.launch({executablePath:h.chromiumPath(),args:['--enable-features=WebMCP,WebMCPTesting','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox']});page=await s.newPage(browser);
    for(const [slot,name] of [['A','short.pmx'],['B','long.pmx']]){
      const p=await post('projects',{name:'対象PMXの接地 '+slot,kind:'empty'}),id=p.project.id;
      let scene=await post('scene/instances',{project_id:id,action:'add',revision:0,asset_id:`mmd:${slot}:${name}`,
        transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}});
      const rid=scene.instances[0].id;
      scene=await post('scene/instances',{project_id:id,action:'camera',revision:scene.revision,camera:{position:[0,.06,.3],target:[0,.06,0],fov:45}});
      const clip=await post('arrangement/place',{project_id:id,asset_id:'mmd:vmd:contact.vmd',track:'motion',start:0,duration:3,revision:0});
      const assignment=await post('scene/motion-target',{project_id:id,clip_id:clip.clip.id,instance_id:rid,revision:clip.revision});
      await page.goto(s.base+'/studio/v05/index.html');await page.locator('#v06project').selectOption(id,{force:true});
      await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.open);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.open());
      const ready=()=>page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.status().ready&&window.BAIStudioMultiScenePreview.status().motion.loadedClips.length===1,null,{timeout:120000});
      await ready();
      await page.locator('#v105-foot-qa summary').first().click();
      await page.locator('#v-contact-first').fill('6');await page.locator('#v-contact-end').fill('66');
      await page.locator('#v105-ground-y').fill('0');
      await page.locator('#v-contact-make').focus();await page.keyboard.press('Enter');
      await page.waitForFunction(()=>/候補・未保存|拒否/.test(document.getElementById('v-contact-status').textContent),null,{timeout:120000});
      const state=await page.evaluate(()=>window.BAIStudioMultiScenePreview.contactState());
      assert.match(state.state,/候補・未保存/,JSON.stringify(state));
      assert.ok(state.report.beforeHeight>state.report.maxHeight*2);
      assert.ok(state.report.beforeSlide>state.report.maxSlide*2);
      assert.ok(state.report.maxHeight<=state.report.tolerance&&state.report.maxSlide<=state.report.tolerance);
      assert.ok(state.report.maxIkResidual<=state.report.tolerance);
      assert.ok(state.report.maxOtherChange<=1e-5);
      await page.screenshot({path:path.join(output,slot+'-candidate.png')});
      if(slot==='A')await page.locator('#v58-multi-preview').screenshot({path:path.join(output,'generated-panel.png')});
      if(slot==='A'){
        await page.setViewportSize({width:1024,height:768});
        assert.ok(await page.locator('#v58-canvas').evaluate(el=>el.getBoundingClientRect().height>=230));
        assert.ok(await page.locator('#v58-multi-preview').evaluate(el=>el.scrollWidth<=el.clientWidth+2));
        await page.screenshot({path:path.join(output,'candidate-1024.png')});
        await page.setViewportSize({width:1440,height:900});
      }
      await page.locator('#v-contact-before').click();assert.match(await page.locator('#v-contact-status').innerText(),/補正前/);
      await page.locator('#v-contact-after').click();
      if(slot==='B')await web(page,{project_id:id,instance_id:rid,action:'save'});
      else{await page.locator('#v-contact-save').focus();await page.keyboard.press('Enter');}
      await page.waitForFunction(()=>document.getElementById('v-contact-status').textContent==='保存済み');
      assert.equal(await page.locator('#v-contact-make').evaluate(el=>el===document.activeElement),true);
      let edits=await json(await fetch(s.base+'/api/studio/v05/motion-edits?id='+id));
      assert.equal(edits.layers.length,1);assert.equal(edits.layers[0].keys.length,60);assert.equal(edits.revision,1);
      assert.equal(edits.layers[0].start_frame,6);assert.equal(edits.layers[0].end_frame,66);
      const saved=edits;
      const sample=async f=>{
        await page.locator('#v58-motion-seek').fill(String(f/60));await page.getByRole('button',{name:'時刻を移動',exact:true}).click();
        return page.evaluate(rid=>window.BAIStudioMultiScenePreview.contactProbe(rid,'左'),rid);
      };
      const corrected=await sample(30);assert.ok(Math.abs(corrected.sole[1])<=corrected.tolerance);
      const outsideBefore=await sample(5),outsideAfter=await sample(66);await sample(59);samePose(await sample(30),corrected);
      await page.reload();await page.waitForFunction(()=>window.BAIStudioMultiScenePreview?.open);await page.evaluate(()=>window.BAIStudioMultiScenePreview.open());await ready();
      samePose(await sample(30),corrected);
      const same=await json(await fetch(s.base+'/api/studio/v05/motion-edits?id='+id));assert.deepEqual(same,saved);
      edits=await post('motion-edits',{project_id:id,revision:1,action:'undo'});assert.equal(edits.layers.length,0);
      edits=await post('motion-edits',{project_id:id,revision:2,action:'redo'});assert.deepEqual(edits.layers,saved.layers);
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());await ready();
      const render=async()=>{
        const range=await json(await fetch(s.base+'/api/studio/v05/timeline/range?id='+id));
        const selected=await post('timeline/range',{project_id:id,revision:range.revision,arrangement_revision:assignment.revision,in_frame:30,out_frame:32});
        let job=await post('render/jobs',{project_id:id,arrangement_revision:assignment.revision,scene_revision:scene.revision,range_revision:selected.revision,resolution:'720p',name:'接地照合'},202);
        const deadline=Date.now()+120000;
        while(['queued','running'].includes(job.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,400));job=await json(await fetch(s.base+'/api/studio/v05/render/jobs?id='+job.id));}
        assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,3);
        return pixels(Buffer.from(await(await fetch(s.base+'/api/studio/v05/render/file?id='+job.id)).arrayBuffer()));
      };
      if(slot==='A'){
        const correctedPixels=await render();
        edits=standard(s.base,'bai_studio_pmx_fk_edits_mutate',{project_id:id,revision:edits.revision,action:'undo'});
        await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());await ready();
        const raw=await sample(30);assert.ok(Math.abs(raw.sole[1]-corrected.sole[1])>.0001);
        samePose(await sample(5),outsideBefore);samePose(await sample(66),outsideAfter);
        const rawPixels=await render();let changed=0;for(let i=0;i<rawPixels.length;i+=3)if(Math.max(...[0,1,2].map(k=>Math.abs(rawPixels[i+k]-correctedPixels[i+k])))>5)changed++;
        assert.ok(changed>20,'保存補正が完成MP4の画素へ反映されません');
        const expected=standard(s.base,'bai_studio_pmx_contact_context',{project_id:id,instance_id:rid,clip_id:clip.clip.id});
        edits=standard(s.base,'bai_studio_pmx_contact_save',{project_id:id,revision:expected.revision,instance_id:rid,clip_id:clip.clip.id,expected,
          contact:{side:'左',start_frame:6,end_frame:66,ground_y:0},keys:saved.layers[0].keys});
        assert.equal(edits.layers.length,1);assert.equal(JSON.stringify(edits.layers[0].keys),JSON.stringify(saved.layers[0].keys));
        await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());await ready();samePose(await sample(30),corrected);
        results.push({mp4ChangedPixels:changed,standardMCP:'context/save/undo passed',webMCP:'native save tested on second model'});
      }
      if(slot==='B'){
        await web(page,{project_id:id,instance_id:rid,action:'create',side:'左',start_frame:6,end_frame:66,ground_y:0});
        await page.locator('#v-contact-discard').click();assert.equal(await page.locator('#v-contact-make').evaluate(el=>el===document.activeElement),true);
        await web(page,{project_id:id,instance_id:rid,action:'create',side:'左',start_frame:6,end_frame:66,ground_y:0});
        const unchanged=await json(await fetch(s.base+'/api/studio/v05/motion-edits?id='+id));
        await post('scene/instances',{project_id:id,action:'camera',revision:scene.revision,camera:{position:[0,.06,.31],target:[0,.06,0],fov:45}});
        h.expectErrors(page,[/409/]);
        const conflict=await page.evaluate(async()=>{try{await window.BAIStudioMultiScenePreview.contactSave();return null;}catch(e){return e.message;}});
        assert.match(conflict,/context changed/);assert.deepEqual(await json(await fetch(s.base+'/api/studio/v05/motion-edits?id='+id)),unchanged);
        await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());await ready();
      }
      // Excessive displacement and FK mode must not write any key/layer/history.
      const beforeReject=await json(await fetch(s.base+'/api/studio/v05/motion-edits?id='+id));
      const reject=await page.evaluate(async()=>{
        try{await window.BAIStudioMultiScenePreview.contactCreate({side:'左',start_frame:6,end_frame:66,ground_y:10});return null;}
        catch(e){return e.message;}
      });assert.match(reject,/10%|届|超/);
      assert.deepEqual(await json(await fetch(s.base+'/api/studio/v05/motion-edits?id='+id)),beforeReject);
      const mode=await post('motion-edits',{project_id:id,revision:edits.revision,action:'mode-set',instance_id:rid,clip_id:clip.clip.id,limb:'left_leg',mode:'FK'});
      await page.evaluate(()=>window.BAIStudioMultiScenePreview.refresh());await ready();
      const fkReject=await page.evaluate(async()=>{try{await window.BAIStudioMultiScenePreview.contactCreate({side:'左',start_frame:6,end_frame:66,ground_y:0});return null;}catch(e){return e.message;}});
      assert.match(fkReject,/IKモード/);assert.deepEqual(await json(await fetch(s.base+'/api/studio/v05/motion-edits?id='+id)),mode);
      await page.locator('#v105-foot-qa summary').first().click();
      // The details may already be open after the browser tool. Ensure inputs are reachable.
      await page.locator('#v105-foot-qa').evaluate(el=>el.open=true);
      await page.locator('#v105-ground-y').fill('');await page.locator('#v-contact-make').click();
      assert.equal(await page.locator('#v105-ground-y').evaluate(el=>el===document.activeElement),true);
      assert.deepEqual(await json(await fetch(s.base+'/api/studio/v05/motion-edits?id='+id)),mode);
      results.push({slot,report:state.report,project_id:id,instance_id:rid,clip_id:clip.clip.id,arrangement_revision:assignment.arrangement_revision??assignment.revision,scene_revision:scene.revision});
    }
    h.assertNoErrors(page);
  }catch(e){await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw e;}
  finally{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));await browser?.close();await s.stop();}
});
