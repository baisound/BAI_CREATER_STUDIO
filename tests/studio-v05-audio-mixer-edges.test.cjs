'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const h=require('./helpers/studio-harness.cjs'),root=path.resolve(__dirname,'..'),qa=path.join(root,'qa/mixer-timeline-20261113/regression');
const body=({project_id,revision,channels,enabled})=>({project_id,revision,channels,enabled});
async function json(r){const text=await r.text();assert.equal(r.status,200,text);return JSON.parse(text);}
function standard(base,name,args={}){const run=spawnSync('python',['-X','utf8',path.join(root,'mcp_server.py')],{input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})+'\n',encoding:'utf8',timeout:45000,windowsHide:true,env:{...process.env,MIXAMO_VIEWER_URL:base}});assert.equal(run.status,0,run.stderr);const r=JSON.parse(run.stdout);assert.equal(r.result?.isError,undefined,run.stdout);return JSON.parse(r.result.content[0].text);}
test('保存と作品切替の競合、VST失敗復旧、両MCPの同一処理を確認する',{timeout:150000},async()=>{
 const s=await h.startServer({port:9285});let browser,page;const result={status:'running',cases:[],errors:[]};fs.mkdirSync(qa,{recursive:true});
 try{
  const make=async name=>(await json(await fetch(s.base+'/api/studio/v05/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,kind:'empty'})}))).project.id;
  const a=await make('競合確認A'),b=await make('競合確認B');
  browser=await h.launchBrowser();page=await s.newPage(browser);page.setDefaultTimeout(10000);page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(s.base+'/studio/v05/index.html');
  const choose=async pid=>{await page.locator('#uiMainNav [data-workspace=edit]').click();await page.locator('#v06project').selectOption(pid);await page.locator('#nav [data-page=audio]').click();await page.locator('#uiAudioEffectsTab').click();await page.locator('#vstMixerBuses').evaluate(e=>e.open=true);};
  await choose(a);await page.waitForFunction(()=>!document.querySelector('#vstMixerEnabled').disabled);
  const gain=page.locator('.uiChannelStrip[data-channel=audio] input[type=range]');await gain.fill('-4');await gain.dispatchEvent('change');
  let releasePost,releaseGet;const postGate=new Promise(r=>releasePost=r),getGate=new Promise(r=>releaseGet=r);let observedPost=false,observedGet=false;
  await page.route('**/api/studio/v05/audio/settings*',async route=>{const r=route.request();if(r.method()==='POST'){observedPost=true;await postGate;}else if(new URL(r.url()).searchParams.get('project_id')===b){observedGet=true;await getGate;}await route.continue();});
  await page.locator('#vstMixerSave').click();await choose(b);
  await h.waitForAsync(page,async()=>true);assert.equal(observedPost,true);assert.equal(observedGet,true);
  const postDone=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/audio/settings'));releasePost();await postDone;
  assert.equal(await page.locator('#vstMixerSave').isDisabled(),true);assert.equal(await page.locator('.uiChannelStrip[data-channel=audio]').evaluate(e=>e.inert),true);
  releaseGet();await page.waitForFunction(()=>!document.querySelector('#vstMixerEnabled').disabled);assert.equal(await gain.inputValue(),'0');await page.unroute('**/api/studio/v05/audio/settings*');
  assert.equal((await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+a))).channels.audio.gain_db,-4);assert.equal((await json(await fetch(s.base+'/api/studio/v05/audio/settings?project_id='+b))).revision,0);
  result.cases.push('A save completes before delayed B load: B controls remain inert and A/B settings never cross');
  const cap=standard(s.base,'bai_studio_audio_capabilities'),plugin=cap.plugins.find(p=>p.name==='TDR Nova');assert.ok(plugin);const metadata=standard(s.base,'bai_studio_audio_plugin_inspect',{plugin_id:plugin.id});assert.equal(metadata.is_effect,true);
  await choose(a);await page.waitForFunction(()=>!document.querySelector('#vstMixerEnabled').disabled);
  const add=()=>page.locator('.uiChannelStrip[data-channel=audio] .uiInsertChain>button');await add().click();await page.locator('#vstPluginSelect').selectOption(plugin.id);
  let releaseInspect;const inspectGate=new Promise(r=>releaseInspect=r);await page.route('**/api/studio/v05/audio/inspect',async route=>{await inspectGate;await route.continue();});
  await page.getByRole('button',{name:'読み込んで追加',exact:true}).click();await choose(b);await page.waitForFunction(()=>!document.querySelector('#vstMixerEnabled').disabled);await choose(a);await page.waitForFunction(()=>!document.querySelector('#vstMixerEnabled').disabled);
  const inspectDone=page.waitForResponse(r=>r.url().endsWith('/audio/inspect'));releaseInspect();await inspectDone;await page.unroute('**/api/studio/v05/audio/inspect');assert.equal(await page.locator('.uiChannelStrip[data-channel=audio] .uiInsertSlots button').count(),0);
  result.cases.push('A→B→A while native inspect waits: stale plugin response is discarded');
  await add().click();await page.locator('#vstPluginSelect').selectOption(plugin.id);await page.getByRole('button',{name:'読み込んで追加',exact:true}).click();await page.locator('#vstParameter').waitFor();
  await page.locator('#vstParameter').selectOption('output_gain_db');await page.locator('#vstParameterValue').fill('0.25');await page.locator('#vstParameterValue').dispatchEvent('change');
  let releaseSave;const saveGate=new Promise(r=>releaseSave=r);await page.route('**/api/studio/v05/audio/settings',async route=>{await saveGate;await route.continue();});await page.locator('#vstMixerSave').click();assert.equal(await page.locator('#vstParameterValue').isDisabled(),true);assert.equal(await page.locator('#vstParameter').isDisabled(),true);
  const saveDone=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/audio/settings'));releaseSave();await saveDone;await page.unroute('**/api/studio/v05/audio/settings');await page.waitForFunction(()=>!document.querySelector('#vstParameterValue').disabled);result.cases.push('VST parameters cannot change while a delayed save is in flight');
  // Invalid real host parameter produces an inline failure and supports recovery.
  let saved=standard(s.base,'bai_studio_audio_settings_get',{project_id:a});saved.channels.audio.inserts[0].parameters.unknown_native_parameter=.5;standard(s.base,'bai_studio_audio_settings_save',body(saved));
  await page.getByRole('button',{name:'保存済みを読み直す',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#vstMixerEnabled').disabled);await page.locator('#vstMixerPrepare').click();await page.waitForFunction(()=>document.querySelector('#vstMixerStatus').textContent.includes('VSTパラメーターが変わりました'));
  await page.locator('.uiChannelStrip[data-channel=audio] .uiChannelName').click();await page.getByRole('button',{name:'取り外す',exact:true}).press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.dataset.focusKey),'channel-audio');await page.locator('#vstMixerSave').click();await page.waitForFunction(()=>document.querySelector('#vstMixerStatus').textContent.includes('作品へ保存しました'));
  const prepared=standard(s.base,'bai_studio_audio_prepare',{project_id:a});assert.equal(prepared.enabled,true);result.cases.push('native parameter failure is explicit; removing final insert restores keyboard focus and processing');
  await page.evaluate(()=>{window.__mcpTools=[];Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>window.__mcpTools.push(tool)}});});await page.addScriptTag({path:path.join(root,'webmcp.js')});await page.waitForFunction(()=>window.__mcpTools.some(t=>t.name==='bai_studio_audio_prepare'));
  const web=async(name,args={})=>{const r=await page.evaluate(async x=>window.__mcpTools.find(t=>t.name===x.name).execute(x.args),{name,args});assert.equal(r.isError,undefined,JSON.stringify(r));return JSON.parse(r.content[0].text);};
  assert.equal((await web('bai_studio_audio_capabilities')).available,true);assert.equal((await web('bai_studio_audio_plugin_inspect',{plugin_id:plugin.id})).plugin_id,plugin.id);
  saved=await web('bai_studio_audio_settings_get',{project_id:a});saved.channels.master.gain_db=-3;const newState=await web('bai_studio_audio_settings_save',body(saved));assert.equal(standard(s.base,'bai_studio_audio_settings_get',{project_id:a}).revision,newState.revision);
  let rows=standard(s.base,'bai_studio_audio_tracks',{project_id:a});assert.ok(rows.rows.some(r=>r.key==='audio:1'));
  const mute=await web('bai_studio_audio_lane_mute',{project_id:a,revision:rows.layout_revision,key:'audio:1',muted:true});rows=await web('bai_studio_audio_tracks',{project_id:a});assert.ok(rows.rows.find(r=>r.key==='audio:1').muted);
  standard(s.base,'bai_studio_audio_lane_mute',{project_id:a,revision:mute.revision,key:'audio:1',muted:false});
  const webMix=await web('bai_studio_audio_prepare',{project_id:a}),stdMix=standard(s.base,'bai_studio_audio_prepare',{project_id:a});assert.equal(webMix.sha256,stdMix.sha256);assert.equal(webMix.id,stdMix.id);result.cases.push('all seven standard MCP and WebMCP tools share settings, canonical lane mutes, real host and PCM cache');
  assert.deepEqual(result.errors,[]);result.status='passed';
 }catch(e){result.status='failed';result.failure=e.stack;if(page)await page.screenshot({path:path.join(qa,'edge-failure.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(qa,'edge-validation.json'),JSON.stringify(result,null,2)+'\n');await browser?.close();await s.stop();}
});
