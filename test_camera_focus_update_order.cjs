const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const code=fs.readFileSync('camera_3d.js','utf8');
test('camera follow must apply camera pose before evaluating focal distance',()=>{
 const start=code.indexOf('function trackSubject(){');const end=code.indexOf('boneSelect.onchange=',start);
 const body=code.slice(start,end);
 assert.match(body,/applyPose\(next\);updateTrackedFocus\(\)/);
 assert.doesNotMatch(body,/function trackSubject\(\)\{\s*updateTrackedFocus\(\)/);
});
test('VMD camera updates focal distance after applying sampled pose',()=>{
 assert.match(code,/bai-camera-vmd-preview',e=>\{applyPose\(e\.detail\.pose\);updateTrackedFocus\(\)\}/);
});
