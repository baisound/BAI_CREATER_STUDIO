/** Phase E GLB/VRM beta: shared pose and animation time across scene and shooting camera. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const $=id=>document.getElementById(id), status=s=>$('camera-asset-status').textContent=s;
const world=new THREE.Scene();world.background=new THREE.Color('#101b2c');
world.add(new THREE.HemisphereLight(0xffffff,0x46546a,2.4));
const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(4,8,7);world.add(sun);
const ground=new THREE.GridHelper(24,24,0x516e89,0x2c3d50);world.add(ground);
const reference=new THREE.Group();const marker=new THREE.Mesh(new THREE.SphereGeometry(.12),new THREE.MeshBasicMaterial({color:0xffcb63}));reference.add(marker);world.add(reference);
const sceneCam=new THREE.PerspectiveCamera(55,1,.02,1000);sceneCam.position.set(5,3,7);sceneCam.lookAt(0,1,0);
const filmingCam=new THREE.PerspectiveCamera(40,1,.02,1000);filmingCam.position.set(0,1.6,5);filmingCam.lookAt(0,1,0);
const orthographicCam=new THREE.OrthographicCamera(-1,1,1,-1,.02,1000);
let activeFilmingCamera=filmingCam;let orthographicHalfHeight=1;
const views=[{host:$('scene').parentElement,camera:sceneCam},{host:$('preview').parentElement,camera:filmingCam}];
let model=null,mixer=null,clips=[],activeClip=null,lastFrame=0,fps=30,shootingPose=null,rendererFailed=false;
let camHelper=new THREE.CameraHelper(filmingCam);world.add(camHelper);
function selectFilmingCamera(camera){if(activeFilmingCamera===camera)return;activeFilmingCamera=camera;views[1].camera=camera;world.remove(camHelper);camHelper.dispose();camHelper=new THREE.CameraHelper(camera);world.add(camHelper)}
const moveTarget=new THREE.Vector3(0,1,0);let yaw=.6,pitch=.3,distance=8;
function scenePosition(){sceneCam.position.set(moveTarget.x+distance*Math.sin(yaw)*Math.cos(pitch),moveTarget.y+distance*Math.sin(pitch),moveTarget.z+distance*Math.cos(yaw)*Math.cos(pitch));sceneCam.lookAt(moveTarget)}
scenePosition();
function initRender(){for(const view of views){try{const renderer=new THREE.WebGLRenderer({alpha:false,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.domElement.className='view-3d-canvas';view.host.append(renderer.domElement);view.renderer=renderer;}catch(err){rendererFailed=true;status('WebGL利用不可: 2Dガイドへ戻します ('+err.message+')');return}}}
function applyPose(p){
 if(!p||!p.position||!p.target)return;
 shootingPose=p;
 // In native camera VMD, 0 is perspective and 1 is orthographic.
 // An orthographic view has no optical FOV; use the perspective-equivalent
 // framing at this distance to make the mode switch manageable in editing.
 const orthographic=p.perspective===1;
 const camera=orthographic?orthographicCam:filmingCam;
 selectFilmingCamera(camera);
 camera.position.fromArray(p.position);
 camera.up.set(0,1,0);
 if(Array.isArray(p.up)&&p.up.length===3&&p.up.every(Number.isFinite)&&new THREE.Vector3().fromArray(p.up).lengthSq()>1e-10)camera.up.fromArray(p.up).normalize();
 camera.lookAt(new THREE.Vector3().fromArray(p.target));
 const fov=Number(p.fov)||40;
 if(orthographic){
  const distance=camera.position.distanceTo(new THREE.Vector3().fromArray(p.target));
  orthographicHalfHeight=Math.max(.001,distance*Math.tan(THREE.MathUtils.degToRad(THREE.MathUtils.clamp(fov,5,150))*.5));
 }else camera.fov=fov;
 resizeProjection(camera,views[1].host.clientWidth/Math.max(1,views[1].host.clientHeight));
 camHelper.update();
}
function resizeProjection(camera,aspect){
 aspect=Number.isFinite(aspect)&&aspect>0?aspect:1;
 if(camera.isPerspectiveCamera)camera.aspect=aspect;
 else if(camera.isOrthographicCamera){camera.left=-orthographicHalfHeight*aspect;camera.right=orthographicHalfHeight*aspect;camera.top=orthographicHalfHeight;camera.bottom=-orthographicHalfHeight}
 camera.updateProjectionMatrix();
}
function resizeRender(){for(const v of views){if(!v.renderer)continue;const w=Math.max(2,v.host.clientWidth),h=Math.max(2,v.host.clientHeight);resizeProjection(v.camera,w/h);v.renderer.setSize(w,h,false)}}
function render(){if(!rendererFailed){resizeRender();camHelper.visible=true;views[0].renderer?.render(world,sceneCam);camHelper.visible=false;views[1].renderer?.render(world,activeFilmingCamera)}requestAnimationFrame(render)}
const loader=new GLTFLoader();
function clean(){if(!model)return;world.remove(model);mixer?.stopAllAction();model.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose()});model=null;mixer=null;clips=[];activeClip=null}
async function loadAsset(asset){if(!/^[^/\\]+\.(glb|vrm)$/i.test(asset))throw Error('GLB/VRMのみ対応');status('モデル読み込み中…');const response=await fetch('/api/integrated-v02/asset/'+encodeURIComponent(asset));if(!response.ok)throw Error('モデル取得エラー HTTP '+response.status);const parsed=await loader.parseAsync(await response.arrayBuffer(),'');clean();model=parsed.scene;world.add(model);const bounds=new THREE.Box3().setFromObject(model);const size=bounds.getSize(new THREE.Vector3());const scale=2/Math.max(.001,size.y);model.scale.multiplyScalar(scale);bounds.setFromObject(model);const center=bounds.getCenter(new THREE.Vector3());model.position.x-=center.x;model.position.z-=center.z;model.position.y-=bounds.min.y;
clips=parsed.animations||[];mixer=clips.length?new THREE.AnimationMixer(model):null;const select=$('camera-clip');select.replaceChildren(new Option('静止モデル',''));clips.forEach((clip,i)=>select.add(new Option(`${clip.name||'Animation '+(i+1)} (${clip.duration.toFixed(1)}s)`,String(i))));if(clips.length){select.value='0';setClip(0)}else select.value='';updateTime();
$('scene').style.visibility='hidden';$('preview').style.visibility='hidden';views[0].renderer.domElement.style.pointerEvents='auto';status(`${asset} / 3D表示中 / ${clips.length}クリップ。FBX・VMD・VRM物理は未対応`)}
function setClip(i){mixer?.stopAllAction();activeClip=Number.isInteger(i)&&clips[i]?clips[i]:null;if(activeClip)mixer.clipAction(activeClip).play();updateTime()}
function updateTime(){if(!mixer||!activeClip)return;const time=lastFrame/Math.max(1,fps);mixer.setTime(time%Math.max(.001,activeClip.duration))}
window.addEventListener('bai-camera-frame',e=>{lastFrame=e.detail.frame;fps=e.detail.fps||30;
// Preserve the separately dispatched native VMD pose while experimental follow is enabled.
// The ordinary camera-frame event still updates model animation time.
if(!document.getElementById('vmd-follow-timeline')?.checked)applyPose(e.detail.pose);
updateTime()});
window.addEventListener('bai-camera-pose',e=>applyPose(e.detail.pose));
window.addEventListener('bai-camera-vmd-preview',e=>applyPose(e.detail.pose));
$('camera-clip').onchange=e=>{const i=Number(e.target.value);setClip(e.target.value===''?null:i)};
$('camera-load-asset').onclick=()=>{const name=$('camera-asset').value;if(!name){status('素材を選択してください');return}loadAsset(name).catch(err=>status('読み込み失敗: '+err.message))};
async function catalog(){try{const r=await fetch('/api/integrated-v02/catalog');if(!r.ok)throw Error('HTTP '+r.status);const c=await r.json(),sel=$('camera-asset'),seen=new Set();for(const entry of [...(c.models||[]),...(c.motions||[])]){const name=entry.source_asset?.split('/').pop();if(!name||!/\.(glb|vrm)$/i.test(name)||seen.has(name))continue;seen.add(name);sel.add(new Option((entry.name||name)+' — '+name,name))}status(seen.size+'件のGLB/VRM素材を選択できます')}catch(err){status('カタログ取得失敗: '+err.message)}}
// Scene view controls: Unreal-style RMB+WASD fly, LMB orbit, Shift+LMB truck/crane.
// The independent scene camera never writes filming-camera keys.
let dragButton=null,lastX=0,lastY=0,rightHeld=false;
const canvas=()=>views[0].renderer?.domElement;
function focusSelectedModel(){
  const bounds=model?new THREE.Box3().setFromObject(model):null;
  if(bounds&&!bounds.isEmpty()){
    bounds.getCenter(moveTarget);
    const size=bounds.getSize(new THREE.Vector3());
    distance=Math.max(1.5,Math.min(100,size.length()*1.5));
  }else{moveTarget.set(0,1,0);distance=5}
  scenePosition();
}
function controlInit(){
  const el=canvas();if(!el)return;
  el.tabIndex=0;
  el.addEventListener('contextmenu',e=>e.preventDefault());
  el.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.button!==2)return;
    dragButton=e.button;rightHeld=e.button===2;
    lastX=e.clientX;lastY=e.clientY;
    el.focus();el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove',e=>{
    if(dragButton===null)return;
    const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
    if(dragButton===0&&e.shiftKey){
      const forward=new THREE.Vector3();sceneCam.getWorldDirection(forward);
      const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
      const scale=distance*.0015;
      moveTarget.addScaledVector(right,-dx*scale);
      moveTarget.y+=dy*scale;
    }else{
      yaw-=dx*.007;pitch=Math.max(-1.4,Math.min(1.4,pitch+dy*.005));
    }
    scenePosition();
  });
  const stop=e=>{dragButton=null;rightHeld=false;if(el.hasPointerCapture?.(e.pointerId))el.releasePointerCapture(e.pointerId)};
  el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);
  el.addEventListener('blur',()=>{dragButton=null;rightHeld=false});
  el.addEventListener('wheel',e=>{
    e.preventDefault();distance=Math.max(.35,Math.min(100,distance*Math.exp(e.deltaY*.001)));scenePosition();
  },{passive:false});
  el.addEventListener('keydown',e=>{
    if(e.code==='KeyF'){focusSelectedModel();e.preventDefault();return}
    // Do not hijack WASD unless the user is explicitly flying with RMB held.
    if(!rightHeld)return;
    const dir=new THREE.Vector3();sceneCam.getWorldDirection(dir);dir.normalize();
    const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0)).normalize();
    const speed=e.shiftKey?.4:.15;
    let delta=null;
    switch(e.code){
      case'KeyW':delta=dir.clone().multiplyScalar(speed);break;
      case'KeyS':delta=dir.clone().multiplyScalar(-speed);break;
      case'KeyA':delta=right.clone().multiplyScalar(-speed);break;
      case'KeyD':delta=right.clone().multiplyScalar(speed);break;
      case'KeyQ':delta=new THREE.Vector3(0,-speed,0);break;
      case'KeyE':delta=new THREE.Vector3(0,speed,0);break;
    }
    if(delta){moveTarget.add(delta);scenePosition();e.preventDefault()}
  });
}
initRender();if(!rendererFailed){controlInit();render();catalog()}
