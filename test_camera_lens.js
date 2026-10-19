const assert=require('node:assert/strict');const {verticalFov,closestPreset}=require('./camera_lens');
for(const focal of [18,24,28,35,50,80,85,105,135,200]){const f=verticalFov(focal);assert(f>0&&f<150);assert.equal(closestPreset(f),String(focal));}
assert(Math.abs(verticalFov(50)-26.99146656)<.00001);assert.equal(closestPreset(40),null);
console.log('camera lens tests OK');
