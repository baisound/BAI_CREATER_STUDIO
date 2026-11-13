'use strict';
// Private read-only Studio worker. Each sample is appended; never hold a movie in RAM.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),three=path.join(root,'node_modules/three');
const sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');
async function main(){
 const folder=path.resolve(process.argv[2]),m=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
 if(!Number.isInteger(m.server_port)||m.server_port<1||m.server_port>65535)throw Error('Local Studio server is required');
 const exe=[process.env.CHROMIUM_PATH,process.env.CHROMIUM,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(p=>p&&fs.existsSync(p));
 if(!exe)throw Error('Chrome/Edge is required for evaluated scene copying');
 const browser=await chromium.launch({executablePath:exe,args:['--enable-unsafe-swiftshader','--no-sandbox']});
 const handles=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(75000);
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.1\/(.*)/,route=>{
   const match=route.request().url().match(/three@0\.160\.1\/([^?#]*)/),file=match&&path.resolve(three,match[1]);
   if(!file?.startsWith(three+path.sep)||!fs.existsSync(file))return route.abort();
   return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'text/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto(`http://127.0.0.1:${m.server_port}/studio/v05/index.html?scene_capture=1`);
  await page.locator('#uiMainNav [data-workspace=edit]').click();
  await page.waitForFunction(id=>[...document.querySelector('#v06project').options].some(o=>o.value===id),m.project_id);
  await page.locator('#v06project').selectOption(m.project_id);
  await page.waitForFunction(()=>!!window.BAIStudioMultiScenePreview?.open);
  await page.evaluate(()=>window.BAIStudioMultiScenePreview.open({composite:true}));
  await page.waitForFunction(id=>{const s=window.BAIStudioMultiScenePreview.status();return s.ready&&s.loaded>0&&s.projectId===id;},m.project_id);
  const check=()=>page.evaluate(async m=>{
   const urls=['scene/instances?id=','arrangement?id=','scene/multi-motion-plan?id=','motion-edits?id=','pmx/morph-map?project_id=','vrm/expression-map?project_id=','lip/adoptions?project_id='];
   const values=await Promise.all(urls.map(async u=>{const r=await fetch('/api/studio/v05/'+u+encodeURIComponent(m.project_id),{cache:'no-store'});if(!r.ok)throw Error('Scene dependency read failed');return r.json();}));
   const [scene,arrangement,plan,edits]=values,s=window.BAIStudioMultiScenePreview.status();
   if(scene.revision!==m.scene_revision||arrangement.revision!==m.arrangement_revision||s.loaded!==scene.instances.length||s.timelineProblems.length||s.motion?.issues?.length||s.motion?.loadedClips?.length!==plan.ready_count||edits.issues?.some(i=>i.kind!=='baked_into_candidate'))throw Error('A saved model/motion/face/voice cannot be evaluated');
   return {dependencies:values,renderer:s.renderer};
  },m);
  const before=await check(),rows=[],frameCount=m.end_frame-m.start_frame+1;
  let previous=null,total=0;const textures=new Map();
  // Each seek uses the existing MP4 absolute-time evaluator, not browser wall time.
  for(let i=0;i<frameCount;i++){
   const sample=await page.evaluate(({frame,fps,first})=>window.BAIStudioMultiScenePreview.captureGeometry(frame,fps,first),{frame:m.start_frame+i,fps:m.fps,first:i===0});
   const identity=sample.meshes.map(x=>[x.id,x.count,x.topology_sha256]);
   if(previous&&JSON.stringify(identity)!==previous)throw Error('Mesh identity/topology changed during capture');
   previous=JSON.stringify(identity);
   if(i===0){
    const estimate=sample.vertex_count*12*frameCount+sample.meshes.length*(8+4*frameCount);
    if(estimate+Buffer.byteLength(JSON.stringify(sample))*2+sample.meshes.reduce((sum,row)=>sum+row.colors.length*80*frameCount,0)>512*1024*1024)throw Error('形状コピーが512MiBを超えます。終了Fを短くして再準備してください。');
    for(const [index,mesh] of sample.meshes.entries()){
     const filename=`mesh-${index}.mdd`,fd=fs.openSync(path.join(folder,filename),'wx');handles.push(fd);
     const header=Buffer.alloc(8+frameCount*4);header.writeInt32BE(frameCount);header.writeInt32BE(mesh.count,4);
     for(let j=0;j<frameCount;j++)header.writeFloatBE(j/m.fps,8+j*4);
     fs.writeSync(fd,header);const {positions,...topology}=mesh;
     rows.push({...topology,file:filename,states:[]});
    }
   }
   for(const [index,mesh] of sample.meshes.entries()){
    const buffer=Buffer.from(mesh.positions,'base64');if(buffer.length!==mesh.count*12)throw Error('Wrong vertex count');
    for(let offset=0;offset<buffer.length;offset+=4){const n=buffer.readFloatLE(offset);if(!Number.isFinite(n))throw Error('Invalid vertex');buffer.writeFloatBE(n,offset);}
    total+=buffer.length;if(total>512*1024*1024)throw Error('形状コピーが512MiBを超えます。終了Fを短くして再準備してください。');
    fs.writeSync(handles[index],buffer);rows[index].states.push({visible:mesh.visible,colors:mesh.colors});
   }
  }
  const after=await check();if(JSON.stringify(before.dependencies)!==JSON.stringify(after.dependencies))throw Error('作品が準備中に変わりました。再準備してください。');
  for(const fd of handles)fs.closeSync(fd);handles.length=0;
  for(const row of rows){row.sha256=sha(fs.readFileSync(path.join(folder,row.file)));for(const [index,material] of row.materials.entries()){
   if(material.map){const raw=Buffer.from(material.map.split(',')[1],'base64');if(raw.length>32*1024*1024)throw Error('テクスチャが大きすぎます。');const hash=sha(raw),filename=`texture-${hash}.png`;if(!textures.has(hash)){fs.writeFileSync(path.join(folder,filename),raw,{flag:'wx'});textures.set(hash,raw.length);}material.map=filename;material.map_sha256=hash;}
  }}
  const geometry=JSON.stringify({schema:1,meshes:rows,frame_count:frameCount,fps:m.fps,renderer:before.renderer});
  if(Buffer.byteLength(geometry)+[...textures.values()].reduce((a,b)=>a+b,0)+rows.reduce((sum,row)=>sum+fs.statSync(path.join(folder,row.file)).size,0)>512*1024*1024)throw Error('形状コピーが512MiBを超えます。終了Fを短くして再準備してください。');
  fs.writeFileSync(path.join(folder,'geometry.json'),geometry,{flag:'wx'});
 }finally{for(const fd of handles)fs.closeSync(fd);await browser.close();}
}
main().catch(e=>{process.stderr.write(String(e.stack||e)+'\n');process.exitCode=1;});
