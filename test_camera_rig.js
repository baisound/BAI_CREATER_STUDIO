const assert=require('node:assert/strict');const r=require('./camera_rig.js');
const p={position:[0,2,5],target:[0,1,0],fov:50};
function near(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)}
near(r.orbit(p,{azimuth:0}).position[2],5);
near(Math.hypot(...r.orbit(p,{azimuth:90}).position.map((v,i)=>v-p.target[i])),Math.sqrt(26));
near(r.rail(p,{start:[0,2,5],end:[10,2,5],t:.25}).position[0],2.5);
near(r.follow(p,{subject:[3,1,2]}).position[0],3);
near(r.crane(p,{pivot:[0,1,0],angle:0}).position[2],5);
assert.throws(()=>r.rail(p,{start:[0,0,0],end:[1,0,0],t:1.2}));
assert.throws(()=>r.follow(p,{subject:[NaN,0,0]}));
assert.deepEqual(p.position,[0,2,5]);
console.log('camera rig: 8 assertions passed');
