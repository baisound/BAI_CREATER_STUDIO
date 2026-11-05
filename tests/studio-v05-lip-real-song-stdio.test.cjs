'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const readline=require('node:readline');
const {spawn}=require('node:child_process');
const harness=require('./helpers/studio-harness.cjs');
const sourcePath=process.env.BAI_REAL_LIP_SRT;
const available=Boolean(sourcePath&&fs.existsSync(sourcePath));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function json(response,status=200){const raw=await response.text();assert.equal(response.status,status,raw);return JSON.parse(raw);}
function openMcp(base){
  const child=spawn(process.env.PYTHON||'python',['-u',path.join(__dirname,'..','mcp_server.py')],{
    stdio:['pipe','pipe','pipe'],env:{...process.env,MIXAMO_VIEWER_URL:base,
      PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
  let nextId=1,stderr='',closed=false;
  const pending=new Map();
  child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{stderr+=chunk;});
  child.on('close',code=>{closed=true;for(const [id,row] of pending){
    clearTimeout(row.timer);row.reject(Error(`MCP closed ${code}: ${stderr}`));pending.delete(id);}});
  readline.createInterface({input:child.stdout}).on('line',line=>{
    let reply;try{reply=JSON.parse(line);}catch(error){
      for(const [id,row] of pending){clearTimeout(row.timer);row.reject(error);pending.delete(id);}return;}
    const row=pending.get(reply.id);if(!row)return;
    clearTimeout(row.timer);pending.delete(reply.id);
    if(reply.error)row.reject(Error(JSON.stringify(reply.error)));else row.resolve(reply.result);
  });
  function rpc(method,params={}){
    const id=nextId++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(Error(`MCP ${method} timed out: ${stderr}`));},30000);
      pending.set(id,{resolve,reject,timer});
      child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
    });
  }
  const notify=(method,params={})=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n');
  async function stop(){
    if(closed)return;
    child.stdin.end();
    await Promise.race([new Promise(resolve=>child.once('close',resolve)),
      new Promise(resolve=>setTimeout(resolve,5000))]);
    if(!closed)child.kill();
  }
  return {rpc,notify,stop,stderr:()=>stderr};
}
function value(result){assert.equal(result?.isError,undefined,JSON.stringify(result));return JSON.parse(result.content[0].text);}
test('persistent MCP stdio session imports real vocal SRT and saves an unconfirmed proposal',
  {skip:!available&&'BAI_REAL_LIP_SRT が必要'},async()=>{
  const bytes=fs.readFileSync(sourcePath),original=sha(bytes);
  const server=await harness.startServer({port:8962});
  let client;
  try{
    const project=(await json(await fetch(server.base+'/api/studio/v05/projects',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'実歌声SRT MCP隔離',kind:'empty'})}))).project;
    client=openMcp(server.base);
    const initialized=await client.rpc('initialize',{protocolVersion:'2024-11-05',
      capabilities:{},clientInfo:{name:'bai-lip-stdio-test',version:'1'}});
    assert.equal(initialized.protocolVersion,'2024-11-05');
    assert.ok(initialized.capabilities.tools);
    client.notify('notifications/initialized');
    assert.deepEqual(await client.rpc('ping'),{});
    const listed=await client.rpc('tools/list');
    for(const name of ['bai_studio_srt_sources_get','bai_studio_srt_import',
      'bai_studio_lip_readings_get','bai_studio_lip_reading_set','bai_studio_lip_candidate_propose'])
      assert.equal(listed.tools.filter(row=>row.name===name).length,1,name);
    const call=(name,args)=>client.rpc('tools/call',{name,arguments:args});
    const before=value(await call('bai_studio_srt_sources_get',{project_id:project.id}));
    assert.equal(before.revision,0);
    const imported=value(await call('bai_studio_srt_import',{
      project_id:project.id,revision:before.revision,name:path.basename(sourcePath),
      encoding:bytes.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf]))?'utf-8-bom':'utf-8',
      content_base64:bytes.toString('base64')}));
    assert.equal(imported.sources[0].sha256,original);
    assert.equal(imported.sources[0].entries.length,54);
    const source=imported.sources[0];
    const reread=value(await call('bai_studio_srt_sources_get',{project_id:project.id}));
    assert.equal(reread.sources[0].sha256,original);
    assert.equal(reread.sources[0].entries.at(-1).endMs,228365);
    const readings=value(await call('bai_studio_lip_readings_get',{project_id:project.id}));
    assert.equal(readings.utterances.length,0);
    const proposed=value(await call('bai_studio_lip_reading_set',{
      project_id:project.id,revision:readings.revision,source_id:source.id,
      source_hash:original,srt_index:1,reading_state:'proposed',
      reading_kana:'すずのねひとつ',explicit_silence:false}));
    assert.equal(proposed.utterances[0].readingState,'proposed');
    const candidate=value(await call('bai_studio_lip_candidate_propose',{
      project_id:project.id,source_id:source.id,srt_index:1}));
    assert.equal(candidate.status,'proposed');
    assert.ok(candidate.segments.length>0);
    const apiRead=await json(await fetch(`${server.base}/api/studio/v05/lip/readings?project_id=${project.id}`));
    assert.equal(apiRead.utterances[0].readingState,'proposed');
    const saved=fs.readFileSync(path.join(server.dataDir,'studio_v05_srt_sources',project.id,
      'sources',original+'.srt'));
    assert.deepEqual(saved,bytes);
    assert.equal(client.stderr(),'');
    console.log(JSON.stringify({protocol:initialized.protocolVersion,tools:listed.tools.length,
      cues:source.entries.length,sourceHash:original,readingState:candidate.status,
      proposedSegments:candidate.segments.length}));
  }finally{await client?.stop();await server.stop();
    assert.equal(sha(fs.readFileSync(sourcePath)),original,'SRT source changed');}
});
