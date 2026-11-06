'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const harness = require('./helpers/studio-harness.cjs');
const root = path.resolve(__dirname, '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const apiOnly = process.env.BAI_MUTE_API_ONLY === '1';
const native = !apiOnly && process.env.BAI_NATIVE_WEBMCP === '1';
async function json(response, status = 200) {
  const text = await response.text(); assert.equal(response.status, status, text); return JSON.parse(text);
}
function ff(args, input) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { input, maxBuffer: 8*1024*1024 });
  assert.equal(r.status, 0, r.stderr.toString()); return r.stdout;
}
function value(result, error = false) {
  if (typeof result === 'string') result = JSON.parse(result);
  assert.equal(result.isError === true, error, JSON.stringify(result));
  return error ? result : JSON.parse(result.content[0].text);
}
function amplitudes(movie) {
  const pcm = ff(['-i','pipe:0','-ac','1','-ar','8000','-f','s16le','pipe:1'],movie);
  return [440,660,880].map(hz => {
    let a=0,b=0;
    for(let i=0;i<8000;i++) { const x=pcm.readInt16LE((8000+i)*2), angle=2*Math.PI*hz*i/8000; a+=x*Math.cos(angle);b+=x*Math.sin(angle); }
    return 2*Math.hypot(a,b)/8000;
  });
}

test('saved audio/music/video mute is shared by UI, official SDK, native WebMCP and completed PCM',
  { timeout: 360000 }, async () => {
  const server = await harness.startServer({ port: apiOnly ? 9140 : 9139 });
  const transport = new StdioClientTransport({ command: process.platform==='win32'?'python':'python3',
    args:['-B',path.join(root,'mcp_server.py')],cwd:root,
    env:{...process.env,MIXAMO_VIEWER_URL:server.base,PYTHONUTF8:'0',PYTHONIOENCODING:'cp932'},stderr:'pipe' });
  const client = new Client({name:'saved-track-audio-mute',version:'1.0.0'});
  const sdkRaw = (name,args={}) => client.callTool({name,arguments:args});
  const sdk = async (name,args={}) => value(await sdkRaw(name,args));
  let browser,page,stderr=''; transport.stderr?.on('data',b=>stderr+=b);
  try {
    await client.connect(transport);
    const id=(await sdk('bai_studio_project_create',{name:'音声ミュートの保存と出力',kind:'empty'})).project.id;
    await sdk('bai_studio_project_fps_set',{project_id:id,fps:29.97});
    const sources=[]; let arrangement={revision:0};
    for(const [track,hz,rate] of [['video',440,44100],['audio',660,48000],['music',880,32000]]) {
      const ext=track==='video'?'mp4':'wav', file=path.join(server.dataDir,track+'.'+ext);
      const args=track==='video'?['-f','lavfi','-i','color=c=red:s=320x180:r=30:d=5']:[];
      ff([...args,'-f','lavfi','-i',`sine=frequency=${hz}:sample_rate=${rate}:duration=5`,
        ...(track==='video'?['-c:v','libx264','-c:a','aac']:['-c:a','pcm_s16le']),'-y',file]);
      const bytes=fs.readFileSync(file);
      const item=(await json(await fetch(`${server.base}/api/library-assets/upload?kind=${track==='video'?'video':'audio'}&name=${track}.${ext}`,{method:'POST',body:bytes}))).item;
      sources.push({track,file,item,sha:sha(bytes)});
      arrangement=await sdk('bai_studio_clip_place',{project_id:id,revision:arrangement.revision,asset_id:item.id,track,start:.5,duration:3});
      arrangement=await sdk('bai_studio_clip_edit',{project_id:id,revision:arrangement.revision,clip_id:arrangement.clip.id,action:'update',track,start:.5,duration:3,source_start:.25});
    }
    const saved=(await sdk('bai_studio_arrangement_get',{project_id:id})).clips;
    const range=await sdk('bai_studio_render_range_set',{project_id:id,revision:0,arrangement_revision:arrangement.revision,in_frame:0,out_frame:104});
    if(!apiOnly) {
      browser=await require('playwright').chromium.launch({executablePath:harness.chromiumPath(),
        args:[...(native?['--enable-features=WebMCPTesting']:[]),'--autoplay-policy=no-user-gesture-required']});
      page=await server.newPage(browser);await page.goto(server.base+'/studio/v05/index.html');
      await page.locator('#v06project').selectOption(id);await page.locator('#nav [data-workspace="edit"]').click();
      await page.waitForFunction(id=>window.BAIStudioMediaPreviewV68?.status().ready&&window.BAIStudioMediaPreviewV68.status().projectId===id&&window.BAIStudioMediaPreviewV68.status().mediaCount===3,id);
      if(native) {
        await page.waitForFunction(()=>window.mixamoWebMcpDiagnostics?.registered.includes('bai_studio_track_flags_set'));
        assert.equal(await page.evaluate(()=>String(document.modelContext.registerTool).includes('[native code]')),true);
      }
    }
    const layout=()=>sdk('bai_studio_track_layout_get',{project_id:id});
    const set=async(muted,web=false)=>{
      const body={project_id:id,revision:(await layout()).revision,locked:[],muted};
      if(web&&native) return value(await page.evaluate(async body=>{
        const tool=(await document.modelContext.getTools()).find(t=>t.name==='bai_studio_track_flags_set');
        return document.modelContext.executeTool(tool,body);
      },body));
      return sdk('bai_studio_track_flags_set',body);
    };
    const preview=async muted=>{
      if(!page)return;
      await page.waitForFunction(expected=>{
        const s=window.BAIStudioMediaPreviewV68?.status();return s?.audioSettingsReady&&JSON.stringify([...s.mutedAudioTracks].sort())===JSON.stringify([...expected].sort());
      },muted);
      for(const source of sources) {
        await page.waitForFunction(({track,muted})=>document.querySelector(`[data-audio-mute-track="${track}"]`)?.getAttribute('aria-pressed')===String(muted),{track:source.track,muted:muted.includes(source.track)});
        const selector=`#v68layers ${source.track==='video'?'video':'audio'}[src*="${encodeURIComponent(source.item.id)}"]`;
        assert.equal(await page.locator(selector).evaluate(e=>e.muted),muted.includes(source.track));
      }
    };
    const outputs=[];
    const render=async(muted,onStarted)=>{
      const started=await sdk('bai_studio_render_job_start',{project_id:id,arrangement_revision:arrangement.revision,range_revision:range.revision,resolution:'720p',name:'音声ミュート確認'});
      assert.deepEqual(started.audio_settings.muted_tracks,[...muted].sort());
      if(onStarted)await onStarted();
      let job;const end=Date.now()+90000;
      do{await new Promise(r=>setTimeout(r,200));job=await sdk('bai_studio_render_job_get',{job_id:started.id});}while(['queued','running'].includes(job.status)&&Date.now()<end);
      assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,105);
      const bytes=Buffer.from(await(await fetch(`${server.base}/api/studio/v05/render/file?id=${job.id}`)).arrayBuffer());assert.equal(sha(bytes),job.sha256);
      const amp=amplitudes(bytes);
      for(let i=0;i<3;i++) assert.ok(muted.includes(['video','audio','music'][i])?amp[i]<20:amp[i]>400,JSON.stringify({muted,amp}));
      const rgb=ff(['-i','pipe:0','-ss','1','-vf','scale=1:1','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],bytes);
      assert.ok(rgb[0]>240&&rgb[1]<10&&rgb[2]<10,'Video image remains visible even when its sound is muted');
      const result={id:job.id,sha256:job.sha256,audioSettings:job.audio_settings,frames:job.probe.frames,amplitudes:amp};outputs.push(result);
      if(process.env.BAI_MUTE_OUT){fs.mkdirSync(process.env.BAI_MUTE_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.BAI_MUTE_OUT,`mute-${muted.join('-')||'none'}-${outputs.length}.mp4`),bytes);}
      return amp;
    };
    // A state update immediately after job submission must not alter the frozen job.
    const baseline=await render([],()=>set(['audio','music','video']));await preview(['audio','music','video']);
    await render(['audio','music','video']);
    await set([]);await preview([]);
    if(page) {
      await page.locator('[data-audio-mute-track="audio"]').click();await preview(['audio']);
      await page.locator('#v68frame').fill('45');await page.locator('#v68seek').click();
      await page.locator('#v68play').click();await page.waitForTimeout(200);
      assert.ok(await page.locator('#v68layers video').evaluate(e=>e.currentTime>.5&&!e.paused));
      await page.locator('#v68pause').click();
      const fresh=await layout();
      await page.evaluate(layout=>window.dispatchEvent(new CustomEvent('bai:v05-track-layout-changed',{detail:{...layout,revision:0,muted:[]}})),fresh);
      await preview(['audio']);
    }else await set(['audio']);
    await render(['audio']);
    await set(['video']);await preview(['video']);await render(['video']);
    await set(['music'],true);await preview(['music']);await render(['music']);
    if(page) {
      await page.reload();await page.locator('#v06project').selectOption(id);await page.locator('#nav [data-workspace="edit"]').click();await preview(['music']);
      if(process.env.BAI_MUTE_OUT){await page.locator('[data-audio-mute-track="music"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.BAI_MUTE_OUT,'saved-music-mute.png')});}
      const other=(await sdk('bai_studio_project_create',{name:'無音の別作品',kind:'empty'})).project.id;
      await page.reload();await page.locator('#v06project').selectOption(other);
      await page.waitForFunction(id=>window.BAIStudioMediaPreviewV68.status().projectId===id&&window.BAIStudioMediaPreviewV68.status().audioSettingsReady,other);
      assert.deepEqual(await page.evaluate(()=>window.BAIStudioMediaPreviewV68.status().mutedAudioTracks),[]);
      await page.locator('#v06project').selectOption(id);await preview(['music']);
    }
    await set([]);await preview([]);const restored=await render([]);
    restored.forEach((amp,i)=>assert.ok(Math.abs(amp-baseline[i])<2,'Unmute restores original sound level'));
    for(const output of outputs)output.amplitudes.forEach((amp,i)=>{if(amp>400)assert.ok(Math.abs(amp-baseline[i])<20,'Muting another track must not amplify remaining sound');});
    if(page) {
      await page.locator('#nav [data-workspace="export"]').click();
      const mutedJob=outputs.find(o=>JSON.stringify(o.audioSettings.muted_tracks)==='["music"]');
      await page.locator(`.v69job[data-job-id="${mutedJob.id}"]`).waitFor();
      assert.match(await page.locator(`.v69job[data-job-id="${mutedJob.id}"]`).innerText(),/開始時の音声ミュート: 楽曲/);
    }
    const old=await layout();value(await sdkRaw('bai_studio_track_flags_set',{project_id:id,revision:old.revision-1,locked:[],muted:['audio']}),true);
    value(await sdkRaw('bai_studio_track_flags_set',{project_id:id,revision:old.revision,locked:[],muted:['invalid']}),true);
    assert.deepEqual(await layout(),old);assert.deepEqual((await sdk('bai_studio_arrangement_get',{project_id:id})).clips,saved);
    for(const source of sources)assert.equal(sha(fs.readFileSync(source.file)),source.sha);
    const result={native,apiOnly,projectId:id,fps:29.97,sourceStart:.25,sourceHashes:sources.map(s=>s.sha),outputs,
      savedClipsPreserved:true,staleAndInvalidRejected:true,frozenJobVerified:true,otherTrackGainPreserved:true,stderr};
    if(process.env.BAI_MUTE_OUT)fs.writeFileSync(path.join(process.env.BAI_MUTE_OUT,`mute-evidence-${apiOnly?'api':'chrome'}.json`),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));if(page)harness.assertNoErrors(page);assert.equal(stderr,'');
  }finally{await client.close();await page?.close();await browser?.close();await server.stop();}
});

test('real registered 230s song preserves source times through saved mute and unmute',
  { skip: !process.env.BAI_REAL_MMD_DATA && 'Explicit read-only real data root required', timeout: 240000 }, async () => {
  const dataRoot=process.env.BAI_REAL_MMD_DATA;
  const indexFile=path.join(dataRoot,'library_assets/index.json');
  const indexBytes=fs.readFileSync(indexFile),index=JSON.parse(indexBytes);
  const source=index.items.find(i=>i.id==='library:fd895f1ca8efd8b2bfbe0f43');assert.ok(source);
  const file=path.join(dataRoot,'library_assets/files',source.filename),original=fs.readFileSync(file);
  assert.equal(sha(original),'f00671c794ccbfd33da7d03bfabd407c83b2f47c5215007967ce053bfa0a9f0e');
  const server=await harness.startServer({port:9141,seed:{'library_assets/index.json':JSON.stringify({schema:1,items:[source]}),[`library_assets/files/${source.filename}`]:original}});
  const post=async(route,body,status=200)=>json(await fetch(server.base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),status);
  try {
    const id=(await post('/api/studio/v05/projects',{name:'実曲の保存ミュート長尺',kind:'empty'})).project.id;
    await post('/api/studio/v05/project/fps',{project_id:id,fps:29.97});
    const placed=await post('/api/studio/v05/arrangement/place',{project_id:id,revision:0,asset_id:source.id,track:'music',start:1.1667,duration:230.2});
    const saved=await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
    const frames=Math.ceil((1.1667+230.2)*29.97-1e-7);
    const range=await post('/api/studio/v05/timeline/range',{project_id:id,revision:0,arrangement_revision:placed.revision,in_frame:0,out_frame:frames-1});
    const results=[];let outputPcm;
    for(const [revision,muted] of [[0,['music']],[1,[]]]) {
      await post('/api/studio/v05/timeline/flags',{project_id:id,revision,locked:[],muted});
      const reread=await json(await fetch(`${server.base}/api/studio/v05/timeline/layout?id=${id}`));assert.deepEqual(reread.muted,muted);
      const start=await post('/api/studio/v05/render/jobs',{project_id:id,arrangement_revision:placed.revision,range_revision:range.revision,resolution:'720p',name:'実曲ミュート長尺'},202);
      let job;const deadline=Date.now()+120000;
      do{await new Promise(r=>setTimeout(r,300));job=await json(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${start.id}`));}while(['queued','running'].includes(job.status)&&Date.now()<deadline);
      assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,frames);assert.deepEqual(job.audio_settings.muted_tracks,muted);
      const movie=Buffer.from(await(await fetch(`${server.base}/api/studio/v05/render/file?id=${job.id}`)).arrayBuffer());assert.equal(sha(movie),job.sha256);
      const pcm=ff(['-i','pipe:0','-ar','8000','-ac','1','-f','s16le','pipe:1'],movie);
      let max=0;for(let i=0;i<pcm.length;i+=2)max=Math.max(max,Math.abs(pcm.readInt16LE(i)));
      if(muted.length)assert.ok(max<=1,`Muted song is audible: ${max}`);else{assert.ok(max>1000);outputPcm=pcm;}
      results.push({muted,jobId:job.id,sha256:job.sha256,frames:job.probe.frames,maxPcm:max,bytes:movie.length});
      if(process.env.BAI_MUTE_OUT)fs.writeFileSync(path.join(process.env.BAI_MUTE_OUT,`real-song-${muted.length?'muted':'unmuted'}.mp4`),movie);
    }
    const sourcePcm=ff(['-i',file,'-ar','8000','-ac','1','-f','s16le','pipe:1']);
    const windows=[];
    for(let second=2;second<228;second+=5) {
      const src=Math.round(second*8000),out=Math.round((second+1.1667)*8000);let best={lag:0,correlation:-1};
      for(let lag=-270;lag<=270;lag++) {
        let aa=0,bb=0,dot=0;
        for(let i=0;i<2400;i+=4){const a=sourcePcm.readInt16LE((src+i)*2),b=outputPcm.readInt16LE((out+i+lag)*2);aa+=a*a;bb+=b*b;dot+=a*b;}
        const correlation=dot/Math.sqrt(aa*bb||1);if(correlation>best.correlation)best={lag,correlation};
      }
      assert.ok(Math.abs(best.lag)<=8000/29.97&&best.correlation>.99,JSON.stringify({second,...best}));windows.push({second,...best});
    }
    assert.deepEqual(await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`)),saved);
    assert.equal(sha(fs.readFileSync(file)),sha(original));assert.deepEqual(fs.readFileSync(indexFile),indexBytes);
    const result={projectId:id,sourceSha256:sha(original),sourceSeconds:230.2,startSeconds:1.1667,fps:29.97,results,windows,originalsUnchanged:true};
    if(process.env.BAI_MUTE_OUT)fs.writeFileSync(path.join(process.env.BAI_MUTE_OUT,`mute-real-song-${process.platform}.json`),JSON.stringify(result,null,2));
    console.log(JSON.stringify({...result,windows:{count:windows.length,maxLag:Math.max(...windows.map(w=>Math.abs(w.lag))),minimumCorrelation:Math.min(...windows.map(w=>w.correlation))}}));
  }finally{await server.stop();}
});
