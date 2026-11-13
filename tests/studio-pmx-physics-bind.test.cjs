'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const h=require('./helpers/studio-harness.cjs');
test('回転済みの初期姿勢でもPMXジョイントは基準姿勢で構築し、合成チェーンの接続を保つ',{timeout:60000},async()=>{
 const s=await h.startServer({port:9299});let browser;
 try{
  browser=await h.launchBrowser();const page=await s.newPage(browser);await page.goto(s.base+'/studio/v05/index.html');
  const samples=await page.evaluate(async()=>{
   const {loadLibs}=await import('/studio/js/viewport/model-loader.js'),{createPmxPhysicsPreview}=await import('/studio/js/motion/pmx-physics-preview.js');const {THREE}=await loadLibs();
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,-1,0,0,-2,0],3));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,1,0,0,0,2,0,0,0],4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
   const pmx=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());const bones=[0,1,2].map(i=>{const b=new THREE.Bone();b.name=i?'髪_'+i:'頭';if(i)b.position.y=-1;return b;});bones[0].add(bones[1]);bones[1].add(bones[2]);pmx.add(bones[0]);pmx.bind(new THREE.Skeleton(bones));pmx.scale.setScalar(.08);pmx.updateMatrixWorld(true);
   geometry.userData.MMD={rigidBodies:bones.map((_,i)=>({boneIndex:i,type:i?1:0,shapeType:0,width:.04,height:.04,depth:.04,weight:i ? .1 : 0,position:[0,i ? -.5 : 0,0],rotation:[0,0,0],friction:.5,restitution:0,positionDamping:.3,rotationDamping:.3,groupIndex:0,groupTarget:0})),constraints:[0,1].map(i=>({rigidBodyIndex1:i,rigidBodyIndex2:i+1,position:[0,-i-1,0],rotation:[0,0,0],translationLimitation1:[0,0,0],translationLimitation2:[0,0,0],rotationLimitation1:[-.2,-.2,-.2],rotationLimitation2:[.2,.2,.2],springPosition:[0,0,0],springRotation:[0,0,0]}))};
   const motion={duration:4,seek(t){bones[0].quaternion.setFromEuler(new THREE.Euler(.4,.2,.7+Math.sin(t)*.1));for(let i=1;i<3;i++){bones[i].position.set(0,-1,0);bones[i].quaternion.identity();}pmx.updateMatrixWorld(true);}};motion.seek(0);const metadata=JSON.stringify(geometry.userData.MMD),before=bones[0].quaternion.toArray();const physics=await createPmxPhysicsPreview(pmx,motion);const restored=bones[0].quaternion.toArray();const result={before,restored,metadataUnchanged:metadata===JSON.stringify(geometry.userData.MMD),ratios:[],rotations:[]};
   physics.seek(0,false);for(let f=1;f<=240;f++){physics.seek(f/60,true);result.ratios.push(Math.max(bones[1].position.length(),bones[2].position.length()));result.rotations.push(bones[1].quaternion.angleTo(new THREE.Quaternion()));}physics.seek(0,false);result.ratios.push(Math.max(bones[1].position.length(),bones[2].position.length()));physics.dispose();return result;
  });
  fs.writeFileSync('qa/timeline-scene-20261113/physics-accessory-result.json',JSON.stringify(samples,null,2)+'\n');assert.deepEqual(samples.restored,samples.before,'物理構築で表示中の動作姿勢を上書きしない');assert.equal(samples.metadataUnchanged,true);assert.ok(Math.max(...samples.rotations)>.01,'物理の回転を止めない');assert.ok(Math.max(...samples.ratios)<1.05,'合成紐が初期姿勢の違いで伸びる: '+Math.max(...samples.ratios));
 }finally{await browser?.close();await s.stop();}
});
