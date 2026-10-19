const {test}=require('node:test');const assert=require('node:assert/strict');const {framing,framingBox}=require('./camera_framing.js');
const pose=(position=[0,1.2,5],target=[0,1.2,0],fov=60)=>({position,target,fov});
test('centered distant sphere fits',()=>assert.equal(framing(pose()).inside,true));
test('near subject is clipped',()=>assert.equal(framing(pose([0,1.2,1])).inside,false));
test('offscreen sphere fails',()=>assert.equal(framing(pose(),{center:[10,1.2,0]}).inside,false));
test('looking away fails',()=>assert.equal(framing(pose([0,1.2,5],[0,1.2,10])).inside,false));
test('narrow lens fails for the same sphere',()=>assert.equal(framing(pose([0,1.2,5],[0,1.2,0],10)).inside,false));
test('margin can alter border acceptance',()=>{const p=pose();assert.equal(framing(p,{radius:2.5,margin:0}).inside,true);assert.equal(framing(p,{radius:2.5,margin:.4}).inside,false)});
test('bad values fail closed',()=>{assert.throws(()=>framing(pose(),{radius:-2}));assert.throws(()=>framing(pose(),{aspect:0}));});

test('slim model box avoids spherical false positive',()=>{const p=pose();const box={min:[-.2,0,-.2],max:[.2,2.4,.2]};assert.equal(framingBox(p,box).inside,true);assert.equal(framing(p,{center:[0,1.2,0],radius:3}).inside,false)});
test('box outside side plane',()=>assert.equal(framingBox(pose(),{min:[9,0,0],max:[10,2,1]}).inside,false));
test('box behind camera',()=>assert.equal(framingBox(pose(),{min:[0,0,6],max:[1,2,7]}).behind,true));
test('box invalid coordinates',()=>assert.throws(()=>framingBox(pose(),{min:[1,0,0],max:[0,1,1]})));
