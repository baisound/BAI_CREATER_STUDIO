const h=require('../../tests/helpers/studio-harness.cjs'),fs=require('fs'),path=require('path');
process.env.TEMP='D:/BAI/BAI_CREATER_STUDIO/worktrees/test-temp';process.env.TMP=process.env.TEMP;
const out=__dirname;
(async()=>{
 const s=await h.startServer({port:9293});
 const api=async(p,b)=>{const r=await fetch(s.base+p,b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{});const t=await r.text();if(!r.ok)throw Error(t);return JSON.parse(t);};
 const pid=(await api('/api/studio/v05/projects',{name:'VST画面→実音声の隔離検証',kind:'empty'})).project.id;
 const n=48000*8,b=Buffer.alloc(44+n*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(192000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);for(let i=0;i<n;i++){const v=Math.round(Math.sin(2*Math.PI*1000*i/48000)*3276.8);b.writeInt16LE(v,44+i*4);b.writeInt16LE(v,46+i*4);}
 const upload=await fetch(s.base+'/api/library-assets/upload?kind=audio&name=GUI-E2E-1kHz.wav',{method:'POST',body:b});const asset=(await upload.json()).item;if(!upload.ok)throw Error(JSON.stringify(asset));
 await api('/api/studio/v05/arrangement/place',{project_id:pid,revision:0,asset_id:asset.id,track:'audio',lane:1,start:0,duration:8});
 const cap=await api('/api/studio/v05/audio/capabilities'),plugin=cap.plugins.find(p=>p.name==='TDR Nova');if(!plugin)throw Error('Installed TDR Nova required');
 const info=await api('/api/studio/v05/audio/inspect',{plugin_id:plugin.id}),saved=await api('/api/studio/v05/audio/settings?project_id='+pid);
 const parameters=Object.fromEntries(info.parameters.map(p=>[p.id,p.raw]));
 await api('/api/studio/v05/audio/settings',{project_id:pid,revision:0,enabled:true,channels:saved.channels,tracks:{'audio:1':{gain_db:0,solo:false,inserts:[{plugin_id:plugin.id,bypass:false,parameters}]}}});
 const baseline=await api('/api/studio/v05/audio/prepare',{project_id:pid});fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'original.wav'),b);fs.writeFileSync(path.join(out,'baseline.wav'),Buffer.from(await(await fetch(s.base+baseline.url)).arrayBuffer()));
 const fixture={base:s.base,url:s.base+'/studio/v05/index.html',project_id:pid,asset_id:asset.id,dataDir:s.dataDir,plugin,baseline,parameters};fs.writeFileSync(path.join(out,'fixture-local.json'),JSON.stringify(fixture,null,2));console.log(JSON.stringify({url:fixture.url,project_id:pid,dataDir:s.dataDir,baseline_id:baseline.id}));
 process.stdin.resume();await new Promise(resolve=>process.stdin.once('data',resolve));await s.stop();
})().catch(e=>{console.error(e);process.exit(1)});
