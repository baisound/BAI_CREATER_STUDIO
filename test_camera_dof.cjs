const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.runInNewContext(fs.readFileSync(__dirname+'/camera_dof.js','utf8'),ctx);
const dof=ctx.BAICameraDOF;
test('DOF parameters use focus distance',()=>assert.equal(dof.settings(50,2.8,3).focus,3));
test('stopping down lowers bokeh coefficient',()=>assert.ok(dof.settings(50,2.8,3).aperture>dof.settings(50,8,3).aperture));
test('invalid settings cannot reach renderer',()=>{for(const n of [0,-1,NaN,Infinity])assert.throws(()=>dof.settings(50,n,3))});
test('DOF only affects filming renderer and is initially disabled',()=>{const h=fs.readFileSync(__dirname+'/camera.html','utf8'),js=fs.readFileSync(__dirname+'/camera_3d.js','utf8'),server=fs.readFileSync(__dirname+'/server.py','utf8');assert.match(h,/id="dof-preview-enabled" type="checkbox"/);assert.match(js,/views\[1\]\.renderer/);assert.match(js,/dofComposer\.render\(\)/);assert.match(server,/camera_dof\.js/)});
