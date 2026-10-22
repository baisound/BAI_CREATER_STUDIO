import assert from 'node:assert/strict';
import {createShootingDOF} from './studio/v05/js/shooting-dof-v34.js';
let calls=[];class V2 {set(x,y){this.x=x;this.y=y;return this;}constructor(x,y){this.set(x,y)}}
class RT {constructor(w,h){this.width=w;this.height=h;this.texture={};}dispose(){calls.push('target.dispose')}}
class Scene {add(){}}
class Mesh {constructor(geometry){this.geometry=geometry}}
class Geometry {dispose(){calls.push('geometry.dispose')}}
class Mat {constructor(p){this.uniforms=p.uniforms}dispose(){calls.push('material.dispose')}}
const THREE={DepthTexture:class{},WebGLRenderTarget:RT,ShaderMaterial:Mat,Scene,Mesh,PlaneGeometry:Geometry,OrthographicCamera:class{},Vector2:V2};
let current=null;const renderer={setRenderTarget(t){current=t;calls.push('target')},getRenderTarget(){return current},render(){calls.push('render')},clear(){}};
assert.equal(createShootingDOF({THREE:{},renderer,camera:{},scene:{}}),null);
const dof=createShootingDOF({THREE,renderer,camera:{near:.1,far:500},scene:{}});
assert.equal(dof.status().enabled,false);
assert.equal(dof.setFocus({focusDistance:-1,fStop:2,focalLengthMm:50}).applied,false);
assert.equal(dof.setFocus({focusDistance:2,fStop:2.8,focalLengthMm:50}).applied,true);
dof.render(320,180);assert.equal(calls.filter(x=>x==='render').length,2);assert.equal(current,null);
dof.render(320,180);assert.equal(calls.includes('target.dispose'),false);
dof.render(640,360);assert.equal(calls.includes('target.dispose'),true);
dof.dispose();assert.equal(dof.status().disposed,true);assert.throws(()=>dof.render(100,100),/disposed/);
console.log('PASS: fallback, focus validation, GPU passes, resize, restoration, disposal');
