import test from 'node:test';
import assert from 'node:assert/strict';
import {solveArmGeometry} from '../studio/v05/js/arm-ik-geometry-v134.mjs';

const gap=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));

test('near-straight real PMX arm uses a stable fallback pole and preserves both lengths',()=>{
  const shoulder=[0.14052918672561646,1.4678146454691887,-0.024791226089000702];
  const elbow=[0.31848400354385376,1.3432093903422355,-0.024791226089000702];
  const wrist=[0.5172018456459045,1.2040677735209464,-0.02436684101819992];
  const direction=wrist.map((value,index)=>(value-shoulder[index])/gap(wrist,shoulder));
  const target=shoulder.map((value,index)=>value+direction[index]*(gap(wrist,shoulder)-0.04));
  assert.throws(()=>solveArmGeometry({shoulder,elbow,wrist,target}),/予備ポール/);
  const result=solveArmGeometry({shoulder,elbow,wrist,target,
    fallbackPole:[shoulder[0],shoulder[1],shoulder[2]+1]});
  assert.equal(result.poleSource,'fallback');
  assert.equal(result.reachable,true);
  assert.ok(gap(result.wristTarget,target)<1e-10);
  assert.ok(Math.abs(gap(result.elbowTarget,shoulder)-result.upper)<1e-10);
  assert.ok(Math.abs(gap(result.elbowTarget,result.wristTarget)-result.lower)<1e-10);
  assert.ok(result.poleDirection[2]>0.9);
});

test('explicit left and right poles produce mirrored elbow targets',()=>{
  const left=solveArmGeometry({shoulder:[0,0,0],elbow:[1,0,0],wrist:[2,0,0],
    target:[1.6,0,0],pole:[0,0,1]});
  const right=solveArmGeometry({shoulder:[0,0,0],elbow:[-1,0,0],wrist:[-2,0,0],
    target:[-1.6,0,0],pole:[0,0,-1]});
  assert.equal(left.poleSource,'explicit');
  assert.equal(right.poleSource,'explicit');
  assert.ok(gap(left.elbowTarget,[-right.elbowTarget[0],right.elbowTarget[1],
    -right.elbowTarget[2]])<1e-10);
  assert.ok(gap(left.wristTarget,[-right.wristTarget[0],right.wristTarget[1],
    right.wristTarget[2]])<1e-10);
});

test('outside and inside unreachable targets clamp to the nearest reach boundary',()=>{
  const outside=solveArmGeometry({shoulder:[0,0,0],elbow:[1,0,0],wrist:[2,0,0],
    target:[3,0,0]});
  assert.equal(outside.reachable,false);
  assert.ok(gap(outside.wristTarget,[2,0,0])<1e-10);
  assert.ok(Math.abs(outside.unreachableDistance-1)<1e-10);
  const inside=solveArmGeometry({shoulder:[0,0,0],elbow:[2,0,0],wrist:[3,0,0],
    target:[0.2,0,0]});
  assert.equal(inside.reachable,false);
  assert.ok(gap(inside.wristTarget,[1,0,0])<1e-10);
  assert.ok(Math.abs(inside.unreachableDistance-0.8)<1e-10);
});

test('invalid, degenerate, and axial pole inputs stop before a pose is accepted',()=>{
  const input={shoulder:[0,0,0],elbow:[1,0,0],wrist:[2,0,0],target:[1.6,0,0]};
  assert.throws(()=>solveArmGeometry({...input,target:[NaN,0,0]}),/有限/);
  assert.throws(()=>solveArmGeometry({...input,elbow:[0,0,0]}),/長さ/);
  assert.throws(()=>solveArmGeometry({...input,target:[0,0,0]}),/重なり/);
  assert.throws(()=>solveArmGeometry({...input,pole:[3,0,0]}),/腕の軸と重なっ/);
  assert.throws(()=>solveArmGeometry({...input,fallbackPole:[3,0,0]}),/予備ポールが腕の軸/);
});
