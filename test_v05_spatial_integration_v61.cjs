const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('studio/v05/index.html','utf8');
const multi=fs.readFileSync('studio/v05/js/multi-model-ui-v58.js','utf8');
const editor=fs.readFileSync('studio/v05/js/spatial-ui-v61.js','utf8');
test('shared core loaded before classic v0.5 editor',()=>{
 assert.ok(html.indexOf('src="js/spatial-transform-v61.js"')<html.indexOf('const $=s=>'));
 assert.match(html,/demoTransforms\.axis/);
});
test('3D instance writes back via existing revision-controlled API',()=>{
 assert.match(multi,/\/api\/studio\/v05\/scene\/instances/);
 assert.match(multi,/revision:originalRevision/);
 assert.match(multi,/instance_id:instanceId,transform/);
});
test('real model uses Three.js transform controls and navigation safety',()=>{
 assert.match(editor,/TransformControls/);
 assert.match(editor,/viewport\.controls\.enabled=!isDragging/);
 assert.match(editor,/writeThree\(model.root,v\)/);
});
