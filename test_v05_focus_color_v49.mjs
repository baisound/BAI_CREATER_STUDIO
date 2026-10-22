import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createShootingDOF} from './studio/v05/js/shooting-dof-v34.js';
const created=[];
class Vec2 {constructor(x,y){this.x=x;this.y=y}set(x,y){this.x=x;this.y=y}}
class Geometry {dispose(){}}
class Material {constructor(o){this.uniforms=o.uniforms;this.fragmentShader=o.fragmentShader;created.push(this)}dispose(){}}
class RT {constructor(){this.texture={}}dispose(){}}
class Mesh {constructor(g,m){this.geometry=g;this.material=m}}
class Scene {add(){}}
class Cam{}
const THREE={Vector2:Vec2,ShaderMaterial:Material,WebGLRenderTarget:RT,DepthTexture:class{},Mesh,PlaneGeometry:Geometry,Scene,OrthographicCamera:Cam};
let draws=0;const renderer={setRenderTarget(){},render(){draws++}};
const dof=createShootingDOF({THREE,renderer,camera:{near:.1,far:100},scene:{}});
assert.ok(dof);
assert.equal(dof.setDiagnosticMode(true).reason,'focus_not_available');
assert.equal(dof.setFocus({focusDistance:4,fStop:2.8,focalLengthMm:50}).applied,true);
assert.deepEqual(dof.setDiagnosticMode(true,{tolerance:.25}),{applied:true,enabled:true,tolerance:.25});
assert.equal(dof.status().diagnostic,true);
assert.equal(created[0].uniforms.tolerance.value,.25);
assert.match(created[0].fragmentShader,/linearDepth\(uv0\)-focus/);
assert.equal(dof.setDiagnosticMode(true,{tolerance:-1}).applied,false);
dof.render(100,60);assert.equal(draws,2);
assert.equal(dof.setDiagnosticMode(false).applied,true);
assert.equal(dof.status().diagnostic,false);
dof.dispose();assert.equal(dof.status().disposed,true);
const ui=readFileSync('./studio/v05/index.html','utf8');assert.match(ui,/v49-focus-colors/);assert.match(ui,/focus-color-ui-v49/);
console.log('v49 focus-color tests passed (10 assertions)');
