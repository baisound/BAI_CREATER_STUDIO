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
const segment=r.bake(p,{type:'orbit',from:10,to:20,step:3,start:[0,1,0],amount:90});
assert.deepEqual(segment.map(k=>k.frame),[10,13,16,19,20]);
near(segment[0].position[0],0);
near(segment.at(-1).position[0],5);
assert.equal(segment.at(-1).interpolation,'linear');
const railKeys=r.bake(p,{type:'rail',from:0,to:10,step:5,start:[0,2,5],end:[10,2,5],easing:'smooth'});
near(railKeys[1].position[0],5);
assert.throws(()=>r.bake(p,{type:'orbit',from:0,to:10000,step:1,start:[0,1,0]}),/2000/);
assert.throws(()=>r.bake(p,{type:'follow',from:0,to:10}),/Invalid/);
console.log('camera rig segment: 7 assertions passed');

const curve=r.curvedRail(p,{start:[0,2,5],control:[5,6,5],end:[10,2,5],t:.5});
near(curve.position[0],5);near(curve.position[1],4);
near(r.curvedRail(p,{start:[0,2,5],control:[5,6,5],end:[10,2,5],t:0}).position[0],0);
near(r.curvedRail(p,{start:[0,2,5],control:[5,6,5],end:[10,2,5],t:1}).position[0],10);
const curveKeys=r.bake(p,{type:'curve',from:0,to:10,step:5,start:[0,2,5],control:[5,6,5],end:[10,2,5]});
near(curveKeys[1].position[1],4);
assert.throws(()=>r.curvedRail(p,{start:[0,0,0],control:[NaN,0,0],end:[1,0,0],t:.5}));
assert.throws(()=>r.bake(p,{type:'curve',from:0,to:5,start:[0,0,0],end:[1,0,0]}));
console.log('curved rail: 7 assertions passed');

// Arc-length parameterization should give substantially equal travel distances.
const start=[0,0,0],control=[1,8,0],end=[12,0,0];
const arc=r.curveArcTable(start,control,end);assert.ok(arc.length>12);
const samples=Array.from({length:11},(_,i)=>r.curvedRail(p,{start,control,end,t:i/10,constantSpeed:true}).position);
const distances=samples.slice(1).map((v,i)=>Math.hypot(...v.map((n,j)=>n-samples[i][j])));
assert.ok(Math.max(...distances)/Math.min(...distances)<1.1, 'constant speed segments diverged');
assert.deepEqual(samples[0],start);assert.deepEqual(samples.at(-1),end);
const equalKeys=r.bake(p,{type:'curve',from:0,to:10,step:1,start,control,end,constantSpeed:true});
near(equalKeys[5].position[0],samples[5][0]);
assert.throws(()=>r.curveArcTable(start,start,start),/Degenerate/);
assert.throws(()=>r.curveConstantSpeedT(start,control,end,2),/progress/);
console.log('constant speed rail: 6 assertions passed');
