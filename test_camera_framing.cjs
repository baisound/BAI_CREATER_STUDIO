const {test}=require('node:test');const assert=require('node:assert/strict');const {framing}=require('./camera_framing.js');
const pose=(position=[0,1.2,5],target=[0,1.2,0],fov=60)=>({position,target,fov});
test('centered distant sphere fits',()=>assert.equal(framing(pose()).inside,true));
test('near subject is clipped',()=>assert.equal(framing(pose([0,1.2,1])).inside,false));
test('offscreen sphere fails',()=>assert.equal(framing(pose(),{center:[10,1.2,0]}).inside,false));
test('looking away fails',()=>assert.equal(framing(pose([0,1.2,5],[0,1.2,10])).inside,false));
test('narrow lens fails for the same sphere',()=>assert.equal(framing(pose([0,1.2,5],[0,1.2,0],10)).inside,false));
test('margin can alter border acceptance',()=>{const p=pose();assert.equal(framing(p,{radius:2.5,margin:0}).inside,true);assert.equal(framing(p,{radius:2.5,margin:.4}).inside,false)});
test('bad values fail closed',()=>{assert.throws(()=>framing(pose(),{radius:-2}));assert.throws(()=>framing(pose(),{aspect:0}));});
