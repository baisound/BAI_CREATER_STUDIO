import assert from 'node:assert/strict';
import {createShootingPreview} from './studio/v05/js/shooting-preview-v27.js';
let count=0, renders=0, cleaned=0, attached=0, unregistered=0;
class Camera {constructor(){this.position={copy:()=>{}};this.quaternion={copy:()=>{}};this.aspect=1;}updateProjectionMatrix(){count++;}}
class Renderer {constructor(){this.domElement={style:{},setAttribute(){},remove(){cleaned++;}};}setPixelRatio(){}setSize(){}render(scene,camera){assert.equal(scene.id,1);assert.ok(camera instanceof Camera);renders++;}dispose(){cleaned++;}}
const THREE={PerspectiveCamera:Camera,WebGLRenderer:Renderer};
const parent={clientWidth:320,clientHeight:180,appendChild(){attached++;}};
let rafs=[];let listeners={};const win={devicePixelRatio:1,requestAnimationFrame(cb){rafs.push(cb);return rafs.length;},cancelAnimationFrame(){},addEventListener(name,fn){listeners[name]=fn;},removeEventListener(name){delete listeners[name];}};
const navigation=new Camera();const host={scene:{id:1},camera:navigation,onInvalidate(fn){this.cb=fn;return()=>{delete this.cb;}}};
const cameraRuntime={registerShootingCamera(cam,{navigationCamera}){assert.notEqual(cam,navigationCamera);return()=>unregistered++;},status(){return {last:null}}};
const preview=createShootingPreview({THREE,host,parent,cameraRuntime,win});
assert.equal(attached,1);assert.equal(preview.status().linked,false);rafs.shift()();assert.equal(renders,1);
listeners['bai:camera-pose-evaluated']();assert.equal(preview.status().linked,true);rafs.shift()();assert.equal(renders,2);
assert.equal(host.camera,navigation);preview.dispose();assert.equal(unregistered,1);assert.equal(cleaned,2);assert.equal(listeners['bai:camera-pose-evaluated'],undefined);preview.dispose();assert.equal(unregistered,1);
console.log('v27 shooting preview PASS (camera isolation, frame render, event update, cleanup)');
