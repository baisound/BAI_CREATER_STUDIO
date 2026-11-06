'use strict';
// LIP-001 #187: both MCP surfaces cross the same saved API as the v0.5 UI.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Client}=require('@modelcontextprotocol/client');
const {StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
const harness=require('./helpers/studio-harness.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function json(response,status=200){const raw=await response.text();assert.equal(response.status,status,raw);return JSON.parse(raw);}
const post=(server,route,body)=>fetch(server.base+route,{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function value(result){if(typeof result==='string')result=JSON.parse(result);assert.notEqual(result?.isError,true,JSON.stringify(result));return JSON.parse(result.content[0].text);}
async function web(page,name,args={}){
  const response=await page.evaluate(async ({name,args})=>{
    if(window.__nativeLipMcp){
      const tool=(await document.modelContext.getTools()).find(row=>row.name===name);
      if(!tool)throw Error('native WebMCP tool missing: '+name);
      return document.modelContext.executeTool(tool,args);
    }
    const tool=window.__mcpTools.find(row=>row.name===name);
    if(!tool)throw Error('WebMCP tool missing: '+name);
    return tool.execute(args);
  },{name,args});
  return typeof response==='string'?JSON.parse(response):response;
}

async function scenario(mode){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lip-mcp-'));
  const modelPath=path.join(dir,'tiny.pmx');
  execFileSync(process.env.PYTHON||'python',[path.join(__dirname,'..','tools','make_test_pmx.py'),modelPath]);
  const pmx=fs.readFileSync(modelPath),pmxHash=sha(pmx);
  const server=await harness.startServer({port:mode==='native'?9133:9132,seed:{
    'mmd_assets.json':JSON.stringify({A:[{name:'tiny.pmx',size:pmx.length}],B:[],vmd:[]}),
    'mmd/A/tiny.pmx':pmx}});
  const transport=new StdioClientTransport({command:process.env.PYTHON||(process.platform==='win32'?'python':'python3'),
    args:['-B',path.join(__dirname,'..','mcp_server.py')],cwd:path.resolve(__dirname,'..'),
    env:{...process.env,MIXAMO_VIEWER_URL:server.base,PYTHONUTF8:'0',PYTHONIOENCODING:'cp932'},stderr:'pipe'});
  const client=new Client({name:'bai-lip-workflow-acceptance',version:'1.0.0'});
  const std=async (_base,name,args={})=>name==='tools/list'?client.listTools():client.callTool({name,arguments:args});
  const webCall=async (page,name,args={})=>page?web(page,name,args):std(server.base,name,args);
  let browser,page,stderr='';transport.stderr?.on('data',b=>{stderr+=b;});
  try{
    await client.connect(transport);
    const projectId=(await json(await post(server,'/api/studio/v05/projects',{name:'LIP MCP隔離',kind:'empty'}))).project.id;
    await std(server.base,'bai_studio_project_fps_set',{project_id:projectId,fps:29.97});
    const assetId='mmd:A:tiny.pmx';
    const scene=await json(await post(server,'/api/studio/v05/scene/instances',{
      project_id:projectId,action:'add',revision:0,asset_id:assetId,
      transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}}));
    const instanceId=scene.instances[0].id;
    const analysis=await json(await fetch(`${server.base}/api/studio/v05/pmx/morph-analysis?asset_id=${encodeURIComponent(assetId)}`));
    const entry={morph_id:analysis.morphs.find(row=>row.name==='あ').id,morph_name:'あ',weight:.8};
    const entries={A:entry,I:entry,U:entry,E:entry,O:entry,Closed:null,Rest:null};
    const map=await json(await post(server,'/api/studio/v05/pmx/morph-map',{
      project_id:projectId,revision:0,action:'set',model_asset_id:assetId,
      model_hash:analysis.modelHash,analysis_hash:analysis.analysisHash,entries,confirmed:true}));
    if(mode!=='sdk'){
      browser=mode==='native'?await require('playwright').chromium.launch({executablePath:harness.chromiumPath(),
        args:['--enable-features=WebMCPTesting','--no-sandbox']}):await server.launchBrowser();
      page=await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      if(mode==='native'){
        assert.equal(await page.evaluate(()=>String(document.modelContext?.registerTool).includes('[native code]')),true);
        await page.waitForFunction(()=>{const d=window.mixamoWebMcpDiagnostics;return d&&d.registered.length+d.errors.length===d.tools.length;});
        assert.deepEqual(await page.evaluate(()=>window.mixamoWebMcpDiagnostics.errors),[]);
        await page.evaluate(()=>{window.__nativeLipMcp=true;});
      }else{
        await page.evaluate(()=>{
          window.__mcpTools=[];
          Object.defineProperty(document,'modelContext',{configurable:true,
            value:{registerTool:async tool=>{window.__mcpTools.push(tool);}}});
        });
        await page.addScriptTag({path:path.join(__dirname,'..','webmcp.js')});
      }
    }
    const names=['bai_studio_srt_sources_get','bai_studio_srt_import',
      'bai_studio_lip_readings_get','bai_studio_lip_reading_set','bai_studio_lip_candidate_propose',
      'bai_studio_lip_drafts_get','bai_studio_lip_draft_save',
      'bai_studio_lip_vmd_candidate_create','bai_studio_lip_adoption_mutate'];
    const listed=(await std(server.base,'tools/list')).tools.map(row=>row.name);
    for(const name of names){
      assert.equal(listed.filter(row=>row===name).length,1,name);
      if(page)assert.equal(await page.evaluate(async n=>(window.__nativeLipMcp?await document.modelContext.getTools():window.__mcpTools).filter(row=>row.name===n).length,name),1,name);
    }
    assert.deepEqual(value(await std(server.base,names[0],{project_id:projectId})),
      value(await webCall(page,names[0],{project_id:projectId})));
    const srt=Buffer.from('1\r\n00:00:01,000 --> 00:00:02,000\r\nあ\r\n');
    const content_base64=srt.toString('base64');
    const upload={project_id:projectId,revision:0,name:'lip.srt',encoding:'utf-8',content_base64};
    assert.equal((await std(server.base,names[1],{...upload,content_base64:'%%%'})).isError,true);
    assert.equal((await webCall(page,names[1],{...upload,content_base64:'%%%'})).isError,true);
    assert.equal(value(await std(server.base,names[0],{project_id:projectId})).revision,0);
    const imported=value(await std(server.base,names[1],upload));
    const webImported=value(await webCall(page,names[1],{...upload,revision:1,name:'web.srt'}));
    assert.equal(imported.sources[0].sha256,sha(srt));
    assert.equal(webImported.revision,2);assert.equal(webImported.sources.length,2);
    assert.equal(webImported.sources[1].sha256,sha(srt));
    assert.deepEqual(fs.readFileSync(path.join(server.dataDir,'studio_v05_srt_sources',projectId,
      'sources',sha(srt)+'.srt')),srt);
    assert.match((await std(server.base,names[1],upload)).content[0].text,/HTTP 409/);
    const source=webImported.sources[0];
    const reading0=value(await std(server.base,names[2],{project_id:projectId}));
    const readingBody={project_id:projectId,revision:reading0.revision,source_id:source.id,
      source_hash:source.sha256,srt_index:1,reading_state:'confirmed',reading_kana:'あ',explicit_silence:false};
    const reading=value(await webCall(page,names[3],readingBody));
    assert.equal(reading.revision,1);
    assert.deepEqual(reading,value(await std(server.base,names[2],{project_id:projectId})));
    assert.match((await std(server.base,names[3],readingBody)).content[0].text,/HTTP 409/);
    const select={project_id:projectId,source_id:source.id,srt_index:1};
    const candidate=value(await std(server.base,names[4],select));
    assert.deepEqual(candidate,value(await webCall(page,names[4],select)));
    assert.equal(candidate.segments.length,1);assert.equal(candidate.projectFps,29.97);
    assert.ok(candidate.segments[0].startFrame>0);
    const draft0=value(await webCall(page,names[5],{project_id:projectId}));
    const draftBody={project_id:projectId,revision:draft0.revision,source_id:source.id,
      source_hash:source.sha256,srt_index:1,pronunciation_version:candidate.pronunciationVersion,
      project_fps:candidate.projectFps,segments:candidate.segments.map(row=>({
        startFrame:row.startFrame,endFrame:row.endFrame,mouthShape:row.mouthShape,weight:1}))};
    const savedDraft=value(await std(server.base,names[6],draftBody));
    assert.equal(savedDraft.revision,1);
    const revised={...draftBody,revision:1,segments:draftBody.segments.map(row=>({...row,weight:.4}))};
    const updatedDraft=value(await webCall(page,names[6],revised));
    assert.equal(updatedDraft.revision,2);
    assert.equal(value(await std(server.base,names[5],{project_id:projectId})).drafts[0].segments[0].weight,.4);
    const vmdBody={project_id:projectId,source_id:source.id,model_asset_id:assetId,
      source_revision:webImported.revision,reading_revision:reading.revision,
      draft_revision:updatedDraft.revision,map_revision:map.revision,dry_run:true};
    const checked=value(await std(server.base,names[7],vmdBody));
    assert.equal(checked.dryRun,true);
    const made=value(await webCall(page,names[7],{...vmdBody,dry_run:false}));
    assert.equal(checked.sha256,made.sha256);
    const candidateBytes=Buffer.from(await(await fetch(server.base+made.downloadUrl)).arrayBuffer());
    assert.equal(sha(candidateBytes),made.sha256);
    const adoption0=value(await std(server.base,'bai_studio_lip_adoptions_get',
      {project_id:projectId,instance_id:instanceId}));
    const adoption=value(await std(server.base,names[8],{project_id:projectId,revision:adoption0.revision,
      action:'adopt',instance_id:instanceId,candidate_id:made.candidateId}));
    assert.equal(adoption.tracks[0].status,'ready');
    const undone=value(await webCall(page,names[8],{project_id:projectId,revision:adoption.revision,action:'undo'}));
    assert.equal(undone.tracks.length,0);
    const redone=value(await std(server.base,names[8],{project_id:projectId,revision:undone.revision,action:'redo'}));
    assert.equal(redone.tracks[0].candidateId,made.candidateId);
    const removed=value(await webCall(page,names[8],{project_id:projectId,revision:redone.revision,
      action:'remove',instance_id:instanceId}));
    assert.equal(removed.tracks.length,0);
    const finalSources=value(await std(server.base,names[0],{project_id:projectId}));
    assert.deepEqual(finalSources,webImported);
    assert.deepEqual(value(await std(server.base,names[2],{project_id:projectId})),reading);
    assert.deepEqual(value(await std(server.base,names[5],{project_id:projectId})),updatedDraft);
    if(page){
      await page.reload();
      if(mode==='native'){
        await page.waitForFunction(()=>window.mixamoWebMcpDiagnostics?.registered.length===63);
        await page.evaluate(()=>{window.__nativeLipMcp=true;});
        assert.deepEqual(value(await webCall(page,names[0],{project_id:projectId})),finalSources);
        assert.deepEqual(value(await webCall(page,names[2],{project_id:projectId})),reading);
        assert.deepEqual(value(await webCall(page,names[5],{project_id:projectId})),updatedDraft);
      }
    }
    assert.equal(sha(fs.readFileSync(path.join(server.dataDir,'mmd','A','tiny.pmx'))),pmxHash);
    assert.deepEqual(fs.readFileSync(path.join(server.dataDir,'studio_v05_srt_sources',projectId,
      'sources',sha(srt)+'.srt')),srt);
    if(page)harness.assertNoErrors(page);
    assert.equal(stderr,'');
    console.log(JSON.stringify({mode,sdk:'2.4.0',tools:listed.length,lipTools:names.length,fps:29.97,
      nativeReload:mode==='native',savedSourceCount:2,adoptUndoRedoRemove:true,originalHashesPreserved:true}));
  }finally{
    await client.close();await page?.close();await browser?.close();await server.stop();
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('lip-mcp-'));fs.rmSync(dir,{recursive:true,force:true});
  }
}
test('official MCP SDK LIP SRT, reading, draft, VMD and adoption use matching saved APIs',
  {timeout:180000},()=>scenario(process.env.BAI_LIP_SDK_ONLY==='1'?'sdk':'injected'));
test('native WebMCP and official MCP SDK share LIP save, candidate and adoption history',
  {skip:process.env.BAI_NATIVE_WEBMCP!=='1'&&'Opt in with BAI_NATIVE_WEBMCP=1 and supported Chrome',timeout:180000},()=>scenario('native'));
