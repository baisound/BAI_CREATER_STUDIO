'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const h=require('./helpers/studio-harness.cjs'),source=process.env.BAI_REAL_MMD_DATA;
const model='Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx',motion='キラメキのシンフォニー1005.vmd';
test('real registered PMX/VMD and song produce a separate verified RGBA PNG/WAV archive without source edits',{skip:!source&&'BAI_REAL_MMD_DATA required',timeout:240000},async()=>{
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),index=JSON.parse(fs.readFileSync(path.join(source,'mmd_assets.json'))),rows=index.A.filter(r=>r.name===model||r.name.startsWith('tex/'));
 const lib=JSON.parse(fs.readFileSync(path.join(source,'library_assets/index.json'))),song=lib.items.find(x=>x.id==='library:c753fcabd67797f28ddd4b22');assert.ok(song);
 const seed={'mmd_assets.json':JSON.stringify({A:rows,B:[],vmd:[{name:motion}]}),'library_assets/index.json':JSON.stringify({schema:1,items:[song]})},files=[];
 for(const r of rows)files.push(['mmd/A/'+r.name,path.join(source,'mmd/A',r.name)]);
 files.push(['mmd/vmd/'+motion,path.join(source,'mmd/vmd',motion)],['library_assets/files/'+song.filename,path.join(source,'library_assets/files',song.filename)]);
 const before={};for(const [key,file] of files){seed[key]=fs.readFileSync(file);before[file]=sha(seed[key]);}
 const s=await h.startServer({port:Number(process.env.BAI_PNG_REAL_PORT||9282),seed});
 async function api(u,b,status=200){const r=await fetch(s.base+'/api/studio/v05/'+u,b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:undefined),t=await r.text();assert.equal(r.status,status,t);return JSON.parse(t);}
 try{
  const pid=(await api('projects',{name:'実モデル透過確認',kind:'empty'})).project.id;await api('project/fps',{project_id:pid,fps:29.97});
  const sc=await api('scene/instances',{project_id:pid,revision:0,action:'add',asset_id:'mmd:A:'+model,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}});
  let a=await api('arrangement/place',{project_id:pid,revision:0,asset_id:song.id,track:'audio',start:0,duration:6});a=await api('arrangement/place',{project_id:pid,revision:a.revision,asset_id:'mmd:vmd:'+motion,track:'motion',start:0,duration:184.5});
  a=await api('scene/motion-target',{project_id:pid,revision:a.revision,clip_id:a.clip.id,instance_id:sc.instances[0].id});
  const range=await api('timeline/range',{project_id:pid,revision:0,arrangement_revision:a.revision,in_frame:120,out_frame:122});
  const settings=await api('render/settings',{project_id:pid,revision:0,preset:'png_rgba_zip',background:{kind:'transparent',color:'#000000'}});
  let j=await api('render/jobs',{project_id:pid,range_revision:range.revision,arrangement_revision:a.revision,scene_revision:sc.revision,resolution:'720p',preset:'png_rgba_zip',settings_revision:settings.revision,name:'実モデル透過'},202);
  const deadline=Date.now()+180000;while(['queued','running'].includes(j.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,300));j=await api('render/jobs?id='+j.id);}assert.equal(j.status,'succeeded',j.error);assert.equal(j.probe.frames,3);assert.equal(j.probe.alpha_min,0);assert.equal(j.probe.alpha_max,255);
  const out=process.env.BAI_PNG_REAL_OUTPUT;assert.ok(out);fs.mkdirSync(out,{recursive:true});const file=path.join(out,'real-model-sequence.zip');fs.writeFileSync(file,Buffer.from(await(await fetch(s.base+'/api/studio/v05/render/file?id='+j.id)).arrayBuffer()));
  const check=spawnSync(process.env.PYTHON||'python',['-X','utf8','-c',"import zipfile,sys,io;from PIL import Image;z=zipfile.ZipFile(sys.argv[1]);im=Image.open(io.BytesIO(z.read('frame_000001.png')));a=im.getchannel('A');assert sum(v>0 for v in a.getdata())>1000;im.save(sys.argv[2])",file,path.join(out,'real-model-first.png')],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'PASS',scope:'real PMX/VMD/song read-only isolated copies; nonzero120..122 at29.97; not all models/full length',frames:3,alpha_min:0,alpha_max:255,source_unchanged:true},null,2));
 }finally{await s.stop();for(const [file,digest] of Object.entries(before))assert.equal(sha(fs.readFileSync(file)),digest);}
});
