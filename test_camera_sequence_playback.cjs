const assert=require('node:assert/strict');
const {test}=require('node:test');
const {activeShot}=require('./camera_sequence_playback.js');
const preset={name:'close',pose:{position:[1,2,3],target:[0,1,0],fov:35}};
const project={sequence:[{start:10,end:20,preset:'close'},{start:20,end:30,preset:'close'}],custom_presets:[preset]};
test('half-open cut boundaries',()=>{assert.equal(activeShot(project,9),null);assert.equal(activeShot(project,10).shot.start,10);assert.equal(activeShot(project,19).shot.start,10);assert.equal(activeShot(project,20).shot.start,20);assert.equal(activeShot(project,30),null)});
test('no camera-key mutation or shared pose arrays',()=>{const a=activeShot(project,12);a.pose.position[0]=999;assert.equal(preset.pose.position[0],1)});
test('missing preset is not silently substituted',()=>{assert.equal(activeShot({sequence:[{start:0,end:2,preset:'none'}],custom_presets:[]},1),null)});
