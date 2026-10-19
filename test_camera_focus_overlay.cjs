const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const scene=fs.readFileSync('camera_3d.js','utf8');
const editor=fs.readFileSync('camera.js','utf8');
test('diagnostics emitted from shared calculation and disabled state',()=>{
 assert.match(editor,/bai-camera-focus-diagnostic/);
 assert.match(editor,/classification:r\.classification/);
 assert.match(editor,/enabled:false/);
});
test('VMD preview pose replaces ordinary camera pose for frame matching',()=>{
 assert.match(editor,/bai-camera-vmd-preview/);
 assert.match(editor,/diagnosticVmdFrame===f&&diagnosticVmdPose/);
 assert.match(editor,/diagnosticVmdPose=null/);
});
test('GPU visualization is scene-only and hidden for filming renderer',()=>{
 assert.match(scene,/focusOverlay=new THREE\.Group/);
 const start=scene.indexOf('function render(){');const end=scene.indexOf('// Scene-only rail gizmo',start);
 const render=scene.slice(start,end);
 assert.ok(render.indexOf('views[0].renderer?.render')<render.indexOf('focusOverlay.visible=false'));
 assert.ok(render.indexOf('focusOverlay.visible=false')<render.indexOf('views[1].renderer?.render'));
});
