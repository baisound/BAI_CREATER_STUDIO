const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('camera.js','utf8');
const renderer=fs.readFileSync('camera_3d.js','utf8');
test('bone follow diagnostic never reports a guide-body success for missing frame target',()=>{
 assert.match(ui,/focus-follow-bone'\)\.checked&&!\(focusPointFrame===frame&&Array\.isArray\(focusPoint\)\)/);
 assert.match(ui,/ガイド位置で代用しません/);
});
test('tracking failures invalidate previously sampled target instead of retaining stale focus',()=>{
 const body=renderer.slice(renderer.indexOf('function updateTrackedFocus(){'),renderer.indexOf('function trackSubject(){'));
 assert.match(body,/!model\|\|!trackingBone\|\|!shootingPose\)\{window\.dispatchEvent/);
 assert.match(body,/catch\(error\)\{window\.dispatchEvent/);
});
