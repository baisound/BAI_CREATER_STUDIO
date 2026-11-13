'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const h=require('./helpers/studio-harness.cjs');
const pmxPath=process.env.BAI_REAL_DANCE_PMX,glbPath=process.env.BAI_REAL_DANCE_GLB;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('PMXの髪・紐の物理が初期姿勢/シーク/連続再生で極端に伸びず原本を保持する',{skip:!(pmxPath&&glbPath)&&'read-only real model/motion required',timeout:180000},async()=>{
 const pmxName=path.basename(pmxPath),seed={},entries=[],protectedFiles=[];
 const add=(source,dest)=>{const b=fs.readFileSync(source);seed[dest]=b;protectedFiles.push({path:source,sha256:sha(b)});return b.length;};
 entries.push({name:pmxName,size:add(pmxPath,'mmd/A/'+pmxName)});
 const tex=path.join(path.dirname(pmxPath),'tex');
 const visit=dir=>{for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())visit(p);else{const rel=path.relative(path.dirname(pmxPath),p).replaceAll('\\','/');entries.push({name:rel,size:add(p,'mmd/A/'+rel)});}}};if(fs.existsSync(tex))visit(tex);
 const motionBytes=add(glbPath,'integrated_v02/assets/integrity-dance.glb');seed['integrated_v02/user_assets.json']=JSON.stringify([{id:'integrity-dance',name:'隔離動作',filename:'integrity-dance.glb',kind:'motion',bytes:motionBytes}]);seed['mmd_assets.json']=JSON.stringify({A:entries,B:[],vmd:[]});
 const s=await h.startServer({port:9298,seed});let browser,page;const out=path.resolve(__dirname,'../../test-temp/pmx-physics-integrity');fs.mkdirSync(out,{recursive:true});const report={source_hashes:protectedFiles};
 try{
  browser=await h.launchBrowser();page=await s.newPage(browser);
  if(process.env.BAI_PHYSICS_BASELINE==='1'){const old=spawnSync('git',['show','b0ba58d:studio/js/motion/pmx-physics-preview.js'],{encoding:'utf8',windowsHide:true});assert.equal(old.status,0,old.stderr);await page.route('**/studio/js/motion/pmx-physics-preview.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:old.stdout}));}
  await page.goto(s.base+'/studio/v05/index.html');
  const result=await page.evaluate(async pmxName=>{
   const {loadLibs,loadModel}=await import('/studio/js/viewport/model-loader.js');const {createPmxGlbPreview}=await import('/studio/js/motion/pmx-glb-preview.js');const {createPmxPhysicsPreview}=await import('/studio/js/motion/pmx-physics-preview.js');const {createViewport}=await import('/studio/js/viewport/three-host.js');
   const libs=await loadLibs(),pmx=(await loadModel({source:'mmd',id:'mmd:A:'+pmxName,name:pmxName,kind:'A',format:'PMX'},libs)).object;
   const source=await loadModel({source:'integrated',id:'integrated:integrity-dance.glb',filename:'integrity-dance.glb',format:'GLB'},libs);
   pmx.scale.setScalar(.08);pmx.updateMatrixWorld(true);const container=document.createElement('div');container.style.cssText='position:fixed;inset:0;background:#172231;z-index:100000';document.body.append(container);const host=createViewport(container,libs);host.setObject(pmx);host.fit();
   const selected=pmx.skeleton.bones.map((bone,index)=>({bone,index})).filter(r=>/髪|狐面紐/.test(r.bone.name));const head=pmx.skeleton.bones.find(b=>b.name==='頭');const rest=new Map(selected.map(r=>[r.index,r.bone.position.clone()]));
   // Use authored joint pivots/translation limits, rather than assuming that
   // every PMX bone origin is a physical hinge. Short bone-length ratios alone
   // are not a valid deformation limit when rigid-body offsets rotate.
   const reach=new Map(selected.map(r=>{let b=r.bone,total=0;while(b&&b!==head&&b.parent?.isBone){total+=b.getWorldPosition(new libs.THREE.Vector3()).distanceTo(b.parent.getWorldPosition(new libs.THREE.Vector3()));b=b.parent;}return [r.index,total];}));
   const mmd=pmx.geometry.userData.MMD,points=[],edges=[],byBody=new Map(),bodyScale=pmx.getWorldScale(new libs.THREE.Vector3()).x;
   const connect=(a,b,cost)=>{edges[a].push([b,cost]);edges[b].push([a,cost]);};
   for(const joint of mmd.constraints){const point=new libs.THREE.Vector3().fromArray(joint.position).applyMatrix4(pmx.matrixWorld),a=points.length,b=a+1;points.push(point,point.clone());edges.push([],[]);for(const [body,node] of [[joint.rigidBodyIndex1,a],[joint.rigidBodyIndex2,b]]){if(!byBody.has(body))byBody.set(body,[]);byBody.get(body).push(node);}const slack=Math.hypot(...joint.translationLimitation1.map((v,i)=>Math.max(Math.abs(v),Math.abs(joint.translationLimitation2[i]))))*bodyScale;connect(a,b,slack);}
   for(const nodes of byBody.values())for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)connect(nodes[i],nodes[j],points[nodes[i]].distanceTo(points[nodes[j]]));
   const distances=points.map(()=>Infinity),headIndex=pmx.skeleton.bones.indexOf(head),headPoint=head.getWorldPosition(new libs.THREE.Vector3());
   mmd.rigidBodies.forEach((body,index)=>{if(body.boneIndex===headIndex&&body.type===0)for(const node of byBody.get(index)||[])distances[node]=headPoint.distanceTo(points[node]);});
   const visited=new Set();for(let n=0;n<points.length;n++){let current=-1;for(let i=0;i<points.length;i++)if(!visited.has(i)&&(current<0||distances[i]<distances[current]))current=i;if(current<0||!Number.isFinite(distances[current]))break;visited.add(current);for(const [next,cost] of edges[current])distances[next]=Math.min(distances[next],distances[current]+cost);}
   for(const row of selected){const position=row.bone.getWorldPosition(new libs.THREE.Vector3());const bounds=[];mmd.rigidBodies.forEach((body,index)=>{if(body.boneIndex===row.index&&body.type!==0){const limit=Math.min(...(byBody.get(index)||[]).map(node=>distances[node]+position.distanceTo(points[node])));if(Number.isFinite(limit))bounds.push(limit);}});if(bounds.length)reach.set(row.index,Math.max(reach.get(row.index),...bounds));}
   const probe=()=>{pmx.updateMatrixWorld(true);pmx.skeleton.update();const origin=head.getWorldPosition(new libs.THREE.Vector3());let radius=0,maxLengthRatio=0,maxReachRatio=0,reachBone='',worst='';for(const r of selected){const ratio=r.bone.position.length()/Math.max(.0001,rest.get(r.index).length());if(ratio>maxLengthRatio){maxLengthRatio=ratio;worst=r.bone.name;}const distance=r.bone.getWorldPosition(new libs.THREE.Vector3()).distanceTo(origin);radius=Math.max(radius,distance);const reachRatio=distance/(reach.get(r.index)+.02);if(reachRatio>maxReachRatio){maxReachRatio=reachRatio;reachBone=r.bone.name;}}return {maxLengthRatio,maxReachRatio,reachBone,radius,worst,bones:selected.map(r=>({name:r.bone.name,position:r.bone.position.toArray()}))};};
   const baseline=probe(),motion=createPmxGlbPreview(libs.THREE,pmx,source.object,source.animations[0]);const before=probe();const physics=await createPmxPhysicsPreview(pmx,motion);const samples=[];
   for(const time of [0,4,30,59,60,0,4]){physics.seek(time,false);host.invalidate();samples.push({time,...probe()});}
   physics.seek(0,false);let continuousWorst=0,continuousWorstFrame=0,reachWorst=0,reachWorstPose=null,maxRadius=0;
   for(let f=1;f<=Math.ceil(motion.duration*60);f++){physics.seek(f/60,true);const value=probe();if(value.maxLengthRatio>continuousWorst){continuousWorst=value.maxLengthRatio;continuousWorstFrame=f;}if(value.maxReachRatio>reachWorst){reachWorst=value.maxReachRatio;reachWorstPose={frame:f,name:value.reachBone,radius:value.radius};}maxRadius=Math.max(maxRadius,value.radius);if(f%600===0)samples.push({time:f/60,continuous:true,...value});}
   samples.push({time:motion.duration,continuous:true,...probe(),maxLengthRatio:continuousWorst,worstFrame:continuousWorstFrame,maxReachRatio:reachWorst,radius:maxRadius,reachWorstPose});
   // Keep an isolated view for a visual check; never write the source model.
   physics.seek(0,false);for(let f=1;f<=180;f++)physics.seek(f/60,true);host.invalidate();
   window.__integrity={pmx,host,motion,physics,probe};return {baseline,before,samples,dynamicBodies:physics.dynamicBodies,constraints:physics.constraints,lengthPreservedBodies:physics.lengthPreservedBodies,limits:selected.map(row=>({name:row.bone.name,reach:reach.get(row.index),bodies:mmd.rigidBodies.filter(body=>body.boneIndex===row.index).map(body=>({type:body.type,offset:body.position}))}))};
  },pmxName);
  report.result=result;await page.screenshot({path:path.join(out,'physics-before-or-after.png')});
  report.worstLengthRatio=Math.max(...result.samples.map(s=>s.maxLengthRatio));report.worstReachRatio=Math.max(...result.samples.map(s=>s.maxReachRatio));assert.ok(report.worstReachRatio<1.1,'髪/紐が元のチェーンの到達範囲を超えています: '+report.worstReachRatio);
  for(const f of protectedFiles)assert.equal(sha(fs.readFileSync(f.path)),f.sha256);report.status='passed';
 }catch(e){report.status='failed';report.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();await s.stop();}
});
