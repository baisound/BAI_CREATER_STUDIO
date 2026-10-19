const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const scope={};scope.globalThis=scope;vm.runInNewContext(fs.readFileSync('camera_focus_tracking.js','utf8'),scope);
const api=scope.BAICameraFocusTracking;
assert.equal(api.distance([0,0,0],[3,4,0]),5);
assert.equal(api.validate({enabled:true}).enabled,true);
assert.throws(()=>api.distance([0,0,0],[0,0,0]));
assert.throws(()=>api.validate({enabled:1}));
console.log('focus tracking: 4 checks passed');
