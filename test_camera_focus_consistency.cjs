const assert=require('node:assert/strict');
const {test}=require('node:test');
require('./camera_focus_consistency.js');
require('./camera_focus_tracking.js');
const C=globalThis.BAICameraFocusConsistency,T=globalThis.BAICameraFocusTracking;
const pose={position:[0,0,0],target:[0,0,1]};
test('optical axis depth, not radial distance',()=>{
 const a=C.diagnose({pose,lens:50,aperture:2.8,focus:5,point:[3,0,5]});
 assert.equal(a.actual,5);assert.equal(T.distance(pose.position,[3,0,5],pose.target),5);
});
test('front and back classification',()=>{
 assert.equal(C.diagnose({pose,lens:50,aperture:2.8,focus:5,point:[0,0,2]}).classification,'front');
 assert.equal(C.diagnose({pose,lens:50,aperture:2.8,focus:5,point:[0,0,10]}).classification,'back');
});
test('reject behind camera',()=> assert.throws(()=>C.diagnose({pose,lens:50,aperture:2.8,focus:5,point:[0,0,-1]})));
