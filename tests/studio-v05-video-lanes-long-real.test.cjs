'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),harness=require('./helpers/studio-harness.cjs');
const source=process.env.BAI_VIDEO_LANES_REAL;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function ff(args,input){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{input,maxBuffer:12*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout;}
async function json(r,status=200){const s=await r.text();assert.equal(r.status,status,s);return JSON.parse(s);}
const sample=(b,index)=>{const lo=Math.floor(index),a=b.readInt16LE(lo*2),c=b.readInt16LE((lo+1)*2);return a+(c-a)*(index-lo);};

test('real AAC-preserved 214s video and three overlapping clips keep saved lanes and long output clocks',
 {skip:!source&&'Explicit read-only preserved-AAC 480p source required',timeout:240000},async()=>{
 const original=fs.readFileSync(source),before=sha(original);assert.equal(before,'c895d1da79dfddb4c93210b778b74d727be225ac5c07a2c5d6c5a399093f89d6');
 const server=await harness.startServer({port:process.platform==='win32'?9146:9147});
 const post=async(route,body,status=200)=>json(await fetch(server.base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),status);
 try{
  const file=path.join(server.dataDir,'yellow.mp4');
  ff(['-f','lavfi','-i','color=c=yellow:s=320x180:r=30:d=4','-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=4','-c:v','libx264','-c:a','aac','-y',file]);
  const overlay=fs.readFileSync(file),overlayHash=sha(overlay);
  const upload=async(name,bytes)=>(await json(await fetch(`${server.base}/api/library-assets/upload?kind=video&name=${name}`,{method:'POST',body:bytes}))).item;
  const base=await upload('native-preserved-aac.mp4',original),front=await upload('yellow-marker.mp4',overlay);
  const id=(await post('/api/studio/v05/projects',{name:'実動画の長尺と複数動画行',kind:'empty'})).project.id;
  await post('/api/studio/v05/project/fps',{project_id:id,fps:29.97});
  const layout=await post('/api/studio/v05/timeline/video-lanes',{project_id:id,revision:0});assert.deepEqual(layout.video_lane_ids,[1,2]);
  let arr=await post('/api/studio/v05/arrangement/place',{project_id:id,revision:0,asset_id:base.id,track:'video',lane:1,start:1.37,duration:212.85});
  arr=await post('/api/studio/v05/arrangement/clip/edit',{project_id:id,revision:arr.revision,clip_id:arr.clip.id,action:'update',track:'video',lane:1,start:1.37,duration:212.85,source_start:1.1});
  const starts=[10,109,209];
  for(const start of starts){
   arr=await post('/api/studio/v05/arrangement/place',{project_id:id,revision:arr.revision,asset_id:front.id,track:'video',lane:2,start,duration:2});
   arr=await post('/api/studio/v05/arrangement/clip/edit',{project_id:id,revision:arr.revision,clip_id:arr.clip.id,action:'update',track:'video',lane:2,start,duration:2,source_start:.25});
  }
  const saved=await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
  assert.equal(saved.clips[0].source_start,1.1);assert.ok(saved.clips.slice(1).every(c=>c.lane===2&&c.source_start===.25));
  const frames=Math.ceil(214.22*29.97-1e-7);
  const range=await post('/api/studio/v05/timeline/range',{project_id:id,revision:0,arrangement_revision:arr.revision,in_frame:0,out_frame:frames-1});
  const started=await post('/api/studio/v05/render/jobs',{project_id:id,arrangement_revision:arr.revision,range_revision:range.revision,resolution:'720p',name:'実動画の複数行長尺'},202);
  let job;const deadline=Date.now()+180000;
  do{await new Promise(r=>setTimeout(r,500));job=await json(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${started.id}`));}while(['queued','running'].includes(job.status)&&Date.now()<deadline);
  assert.equal(job.status,'succeeded',job.error);assert.equal(job.probe.frames,frames);
  const movie=Buffer.from(await(await fetch(`${server.base}/api/studio/v05/render/file?id=${job.id}`)).arrayBuffer());assert.equal(sha(movie),job.sha256);
  const decoded=ff(['-i','pipe:0','-ar','8000','-ac','1','-f','s16le','pipe:1'],movie);
  const nativePcm=ff(['-i',source,'-ar','8000','-ac','1','-f','s16le','pipe:1']);
  const overlayPcm=ff(['-i',file,'-af','aresample=48000,aformat=channel_layouts=stereo','-ar','8000','-ac','1','-f','s16le','pipe:1']);
  const audio=[];
  for(const second of [5,10.5,12.5,100,109.5,111.5,200,209.5,211.5]){
   const offset=starts.find(s=>second>=s&&second<s+2),reference=[];
   for(let i=0;i<2400;i++)reference.push(sample(nativePcm,(second-.27)*8000+i)+(offset===undefined?0:sample(overlayPcm,(second-offset+.25)*8000+i)));
   let best={lag:0,correlation:-1};
   for(let lag=-270;lag<=270;lag++){let aa=0,bb=0,dot=0;for(let i=0;i<2400;i+=4){const a=reference[i],b=decoded.readInt16LE((Math.round(second*8000)+i+lag)*2);aa+=a*a;bb+=b*b;dot+=a*b;}const correlation=dot/Math.sqrt(aa*bb||1);if(correlation>best.correlation)best={lag,correlation};}
   assert.ok(best.correlation>.98&&Math.abs(best.lag)<=8000/29.97,JSON.stringify({second,...best}));audio.push({second,...best});
  }
  const markers=[];
  for(const start of starts){const frame=Math.round((start+.5)*29.97),rgb=ff(['-i','pipe:0','-vf',`select=eq(n\\,${frame}),scale=1:1`,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],movie);assert.ok(rgb[0]>180&&rgb[1]>180&&rgb[2]<80);markers.push({frame,matched:true});}
  assert.deepEqual(await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`)),saved);
  assert.equal(sha(fs.readFileSync(source)),before);assert.equal(sha(fs.readFileSync(file)),overlayHash);
  const result={projectId:id,sourceSha256:before,overlaySha256:overlayHash,fps:29.97,frames,bytes:movie.length,outputSha256:job.sha256,savedClips:saved.clips,audio,markers,inputsUnchanged:true};
  if(process.env.BAI_VIDEO_LANES_OUT){fs.mkdirSync(process.env.BAI_VIDEO_LANES_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.BAI_VIDEO_LANES_OUT,`long-real-${process.platform}.mp4`),movie);fs.writeFileSync(path.join(process.env.BAI_VIDEO_LANES_OUT,`long-real-${process.platform}.json`),JSON.stringify(result,null,2));}
  console.log(JSON.stringify(result));
 }finally{await server.stop();}
});
