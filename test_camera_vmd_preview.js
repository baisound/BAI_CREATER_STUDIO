const assert=require('node:assert/strict');
const {sample,bezier,previewPose}=require('./camera_vmd_preview');
const k=(frame,x)=>({frame,center:[x,0,0],rotation:[x,0,0],distance:-x,viewAngle:40+x,perspective:0,interpolation:Array(6).fill([0,0,127,127]).flat()});
const data={keys:[k(0,0),k(30,30)]};
for(const p of [0,.25,.5,.75,1])assert.ok(Math.abs(bezier(p,[0,0,127,127])-p)<1e-8);
assert.ok(Math.abs(sample(data,15).center[0]-15)<1e-8);
assert.ok(Math.abs(sample(data,15).distance+15)<1e-8);
assert.equal(sample(data,40).center[0],30);
assert.equal(sample(data,0).center[0],0);
assert.throws(()=>sample({keys:[]},1));
assert.throws(()=>sample(data,NaN));
console.log('VMD preview JS tests passed');

const pose=previewPose({center:[1,2,3],rotation:[0,0,0],distance:-5,viewAngle:45,perspective:0});
assert.deepEqual(pose.position,[1,2,-2]);
assert.deepEqual(pose.target,[1,2,3]);
assert.equal(pose.fov,45);
assert.ok(Math.abs(previewPose({center:[0,0,0],rotation:[0,Math.PI/2,0],distance:-3,viewAngle:35}).position[0]+3)<1e-9);
assert.throws(()=>previewPose({center:[0,0,0],rotation:[0,0,0],distance:0,viewAngle:45}));

// Roll must rotate both image-plane axes, and projection mode must survive sampling.
const rolled=previewPose({center:[0,0,0],rotation:[0,0,Math.PI/2],distance:-5,viewAngle:40,perspective:1});
assert.ok(Math.abs(rolled.right[0])<1e-10);
assert.ok(Math.abs(rolled.right[1]-1)<1e-10);
assert.ok(Math.abs(rolled.up[0]+1)<1e-10);
assert.equal(rolled.perspective,1);
assert.equal(sample({keys:[{...k(0,0),perspective:1},{...k(30,30),perspective:0}]},15).perspective,1);
