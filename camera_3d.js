/** Phase E GLB/VRM beta: shared pose and animation time across scene and shooting camera. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {advanceFollow,validateSmoothing} from './camera_follow_smoothing.js';
import {classifyBone,parseOffset,validFollowConfig,pickBone,FOLLOW_STORAGE_KEY} from './camera_follow_config.js';
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
let trackingBone=null,trackingOffset=null,trackingBaseTarget=null,untrackedPose=null,followSmoothState=null;
const boneSelect=$('camera-follow-bone'),trackEnabled=$('camera-follow-enabled'),trackStatus=$('camera-follow-status');
const offsetInput=$('camera-follow-offset'),smoothingInput=$('camera-follow-smoothing');
let savedFollow={boneName:'',role:'',offset:[0,0,0],enabled:false,smoothingSeconds:0};
try{savedFollow=validFollowConfig(JSON.parse(localStorage.getItem(FOLLOW_STORAGE_KEY)||'{}'))}catch(_){/* Broken preference must never prevent camera startup. */}
offsetInput.value=savedFollow.offset.join(',');smoothingInput.value=String(savedFollow.smoothingSeconds);
function offsetValues(){return parseOffset(offsetInput.value.split(',').map(v=>v.trim()))}
function saveFollow(){
 try{const offset=offsetValues();const smoothingSeconds=validateSmoothing(smoothingInput.value);savedFollow=validFollowConfig({boneName:trackingBone?.name||'',role:classifyBone(trackingBone?.name),offset,enabled:trackEnabled.checked,smoothingSeconds});localStorage.setItem(FOLLOW_STORAGE_KEY,JSON.stringify(savedFollow));trackStatus.textContent='追従設定を保存しました（このブラウザー）'}
 catch(err){trackStatus.textContent='保存失敗: '+err.message}
}
$('camera-follow-save').onclick=saveFollow;
$('camera-follow-bake').onclick=()=>{
 try{
  if(!model||!trackingBone)throw Error('先にモデルと追従ボーンを選択してください');
  if(!activeClip||!mixer)throw Error('ボーンの動作をキー化するにはGLBアニメーションクリップが必要です');
  if(document.getElementById('vmd-follow-timeline')?.checked)throw Error('VMDカメラ追従をOFFにしてください');
  const from=Number($('rig-bake-from').value),to=Number($('rig-bake-to').value),step=Number($('rig-bake-step').value);
  let fromPose=null;
  window.dispatchEvent(new CustomEvent('bai-camera-query-pose',{detail:{frame:from,resolve:pose=>{fromPose=pose}}}));
  if(!fromPose)throw Error('開始フレームのカメラ構図を取得できません');
  if(!Number.isInteger(from)||!Number.isInteger(to)||!Number.isInteger(step)||from<0||to<from||step<1||step>100000)throw Error('区間と間隔を確認してください');
  const count=Math.ceil((to-from)/step)+1;if(count>2000)throw Error('キー数が2000を超えています');
  const before=lastFrame;const offset=offsetValues();const positions=[];
  try{
   const frames=[];for(let f=from;f<=to;f+=step)frames.push(f);if(frames.at(-1)!==to)frames.push(to);
   for(const f of frames){mixer.setTime((f/Math.max(1,fps))%Math.max(.001,activeClip.duration));model.updateMatrixWorld(true);const point=trackingBone.getWorldPosition(new THREE.Vector3()).toArray();if(!point.every(Number.isFinite))throw Error('ボーン座標が不正です');positions.push({frame:f,target:point})}
  }finally{mixer.setTime((before/Math.max(1,fps))%Math.max(.001,activeClip.duration));model.updateMatrixWorld(true)}
  window.dispatchEvent(new CustomEvent('bai-camera-follow-bake',{detail:{positions,offset,basePose:structuredClone(fromPose)}}));
 }catch(err){$('camera-follow-bake-status').textContent='生成失敗: '+err.message}
};
window.addEventListener('bai-camera-project-loaded',event=>{
 const config=event.detail?.project?.bone_follow;
 if(!config)return;
 try{savedFollow=validFollowConfig(config);offsetInput.value=savedFollow.offset.join(',');smoothingInput.value=String(savedFollow.smoothingSeconds);followSmoothState=null;discoverBones()}
 catch(err){trackStatus.textContent='プロジェクト追従設定が不正: '+err.message}
});
window.addEventListener('bai-camera-before-save',event=>{
 const project=event.detail?.project;if(!project)return;
 // Bad offsets abort save, preventing silent corruption of persisted follow settings.
 const offset=offsetValues();const smoothingSeconds=validateSmoothing(smoothingInput.value);
 project.bone_follow=validFollowConfig({boneName:trackingBone?.name||savedFollow.boneName,role:classifyBone(trackingBone?.name)||savedFollow.role,offset,enabled:trackEnabled.checked,smoothingSeconds});
});

function discoverBones(){
 boneSelect.replaceChildren(new Option('なし',''));trackingBone=null;trackingOffset=null;trackingBaseTarget=null;followSmoothState=null;
 if(!model){trackStatus.textContent='モデル未選択';return}
 const nodes=[];model.traverse(node=>{if(node.isBone&&node.name)nodes.push(node)});
 nodes.forEach((node,i)=>{const role=classifyBone(node.name);boneSelect.add(new Option((role?'['+({head:'頭',neck:'首',chest:'胸',hips:'腰'}[role])+'] ':'')+node.name+' ('+i+')',String(i)))});
 boneSelect._bones=nodes;trackingBone=pickBone(nodes,savedFollow);
 if(trackingBone)boneSelect.value=String(nodes.indexOf(trackingBone));
 trackEnabled.checked=Boolean(savedFollow.enabled&&trackingBone);
 trackStatus.textContent=nodes.length+'ボーンを検出'+(savedFollow.boneName&&!trackingBone?'（保存済みボーンが見つかりません）':'');
}
function trackSubject(){
 if(!trackEnabled.checked||!trackingBone||!shootingPose||!model)return;
 if(document.getElementById('vmd-follow-timeline')?.checked){trackStatus.textContent='VMDカメラ優先のためボーン追従停止中';return;}
 model.updateMatrixWorld(true);
 const subject=trackingBone.getWorldPosition(new THREE.Vector3());
 if(![subject.x,subject.y,subject.z].every(Number.isFinite))return;
 const rawTarget=subject.toArray();
 let target;try{followSmoothState=advanceFollow(followSmoothState,rawTarget,lastFrame,fps,smoothingInput.value);target=followSmoothState.target}catch(err){trackStatus.textContent=err.message;return}
 if(!trackingOffset){trackingBaseTarget=target;const base=untrackedPose||shootingPose;trackingOffset=base.position.map((x,i)=>x-base.target[i])}
 let manualOffset;
 try{manualOffset=offsetValues()}catch(err){trackStatus.textContent='追従停止: '+err.message;return}
 const next={...shootingPose,position:target.map((x,i)=>x+trackingOffset[i]+manualOffset[i]),target};
 applyPose(next);trackStatus.textContent=trackingBone.name+' を追従中（キー未変更）';
}
boneSelect.onchange=()=>{trackingBone=boneSelect._bones?.[Number(boneSelect.value)]||null;trackingOffset=null;trackingBaseTarget=null;followSmoothState=null;trackStatus.textContent=trackingBone?'追従候補: '+trackingBone.name:'追従なし'};
smoothingInput.onchange=()=>{followSmoothState=null};
trackEnabled.onchange=()=>{trackingOffset=null;trackingBaseTarget=null;followSmoothState=null;if(!trackEnabled.checked){trackStatus.textContent='追従OFF';if(untrackedPose)applyPose(untrackedPose)}};
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
function render(){if(!rendererFailed){resizeRender();camHelper.visible=true;views[0].renderer?.render(world,sceneCam);camHelper.visible=false;if(railPath)railPath.visible=false;railHandles.visible=false;views[1].renderer?.render(world,activeFilmingCamera);if(railPath)railPath.visible=true;railHandles.visible=true}requestAnimationFrame(render)}
// Scene-only rail gizmo; hidden from the final filming-camera view.
let railPath=null;
const railHandles=new THREE.Group();world.add(railHandles);
const railRaycaster=new THREE.Raycaster();const railPointer=new THREE.Vector2();
let railDrag=null;
function clearRailHandles(){for(const child of [...railHandles.children]){railHandles.remove(child);child.geometry.dispose();child.material.dispose()}}
function railPointerRay(event,element){const rect=element.getBoundingClientRect();railPointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);railRaycaster.setFromCamera(railPointer,sceneCam);return railRaycaster.ray}
function installRailDrag(element){
 element.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.shiftKey||!railHandles.visible)return;
  railPointerRay(event,element);
  const hits=railRaycaster.intersectObjects(railHandles.children,false);
  if(!hits.length)return;
  const handle=hits[0].object;
  const normal=new THREE.Vector3();sceneCam.getWorldDirection(normal);
  railDrag={pointerId:event.pointerId,name:handle.userData.railName,handle,plane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,handle.position),before:handle.position.toArray(),current:handle.position.toArray()};
  event.stopImmediatePropagation();event.preventDefault();element.setPointerCapture(event.pointerId);
 },true);
 element.addEventListener('pointermove',event=>{
  if(!railDrag||railDrag.pointerId!==event.pointerId)return;
  const point=new THREE.Vector3();if(!railPointerRay(event,element).intersectPlane(railDrag.plane,point))return;
  railDrag.current=point.toArray();railDrag.handle.position.copy(point);
  window.dispatchEvent(new CustomEvent('bai-camera-rail-handle-preview',{detail:{name:railDrag.name,position:point.toArray()}}));
  event.stopImmediatePropagation();event.preventDefault();
 },true);
 const finish=(event,cancel)=>{
  if(!railDrag||railDrag.pointerId!==event.pointerId)return;
  const d=railDrag;railDrag=null;
  window.dispatchEvent(new CustomEvent('bai-camera-rail-handle-end',{detail:{name:d.name,position:cancel?d.before:d.current,commit:!cancel}}));
  event.stopImmediatePropagation();event.preventDefault();
 };
 element.addEventListener('pointerup',event=>finish(event,false),true);
 element.addEventListener('pointercancel',event=>finish(event,true),true);
 window.addEventListener('blur',()=>{if(railDrag){const d=railDrag;railDrag=null;window.dispatchEvent(new CustomEvent('bai-camera-rail-handle-end',{detail:{name:d.name,position:d.before,commit:false}}))}});
}

window.addEventListener('bai-camera-rail-path',event=>{
 if(railPath){world.remove(railPath);railPath.geometry.dispose();railPath.material.dispose();railPath=null;}clearRailHandles();railHandles.visible=false;
 const d=event.detail;if(!d?.visible)return;
 if(![d.start,d.control,d.end].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)))return;
 const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(...d.start),new THREE.Vector3(...d.control),new THREE.Vector3(...d.end));
 railPath=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(128)),new THREE.LineBasicMaterial({color:0x40e4c5,depthTest:false}));
 railPath.renderOrder=999;world.add(railPath);
 for(const [name,coords,color] of [['start',d.start,0x5ac7ff],['control',d.control,0xffc75a],['end',d.end,0xff6e9b]]){
  const handle=new THREE.Mesh(new THREE.SphereGeometry(.19,16,12),new THREE.MeshBasicMaterial({color,depthTest:false}));handle.position.fromArray(coords);handle.userData.railName=name;handle.renderOrder=1000;railHandles.add(handle);
 }
 railHandles.visible=true;
});
window.dispatchEvent(new Event('bai-camera-rail-ready'));
const loader=new GLTFLoader();
// CAM-004: conservative world-space bounds sampled after animation updates.
// Only geometry-backed meshes count; helpers/rig handles are excluded.
function publishModelFraming(){
 if(!model){window.dispatchEvent(new CustomEvent('bai-camera-model-bounds',{detail:null}));return}
 model.updateWorldMatrix(true,true);
 const bounds=new THREE.Box3();let found=false;
 model.traverse(node=>{
  if(!node.isMesh||!node.geometry)return;
  if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
  if(!node.geometry.boundingBox)return;
  // Skinned meshes require posed bounds (Three.js r160 computes them).
  const local=node.isSkinnedMesh&&typeof node.computeBoundingBox==='function'
   ?(node.computeBoundingBox(),node.boundingBox):node.geometry.boundingBox;
  if(!local||local.isEmpty())return;
  bounds.union(local.clone().applyMatrix4(node.matrixWorld));found=true;
 });
 if(!found||bounds.isEmpty())return;
 const sphere=bounds.getBoundingSphere(new THREE.Sphere());
 window.dispatchEvent(new CustomEvent('bai-camera-model-bounds',{detail:{center:sphere.center.toArray(),radius:sphere.radius,source:'model',frame:lastFrame}}));
}
function clean(){if(!model)return;trackEnabled.checked=false;trackingBone=null;trackingOffset=null;world.remove(model);mixer?.stopAllAction();model.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose()});model=null;mixer=null;clips=[];activeClip=null;publishModelFraming()}
async function loadAsset(asset){if(!/^[^/\\]+\.(glb|vrm)$/i.test(asset))throw Error('GLB/VRMのみ対応');status('モデル読み込み中…');const response=await fetch('/api/integrated-v02/asset/'+encodeURIComponent(asset));if(!response.ok)throw Error('モデル取得エラー HTTP '+response.status);const parsed=await loader.parseAsync(await response.arrayBuffer(),'');clean();model=parsed.scene;world.add(model);const bounds=new THREE.Box3().setFromObject(model);const size=bounds.getSize(new THREE.Vector3());const scale=2/Math.max(.001,size.y);model.scale.multiplyScalar(scale);bounds.setFromObject(model);const center=bounds.getCenter(new THREE.Vector3());model.position.x-=center.x;model.position.z-=center.z;model.position.y-=bounds.min.y;
clips=parsed.animations||[];mixer=clips.length?new THREE.AnimationMixer(model):null;const select=$('camera-clip');select.replaceChildren(new Option('静止モデル',''));clips.forEach((clip,i)=>select.add(new Option(`${clip.name||'Animation '+(i+1)} (${clip.duration.toFixed(1)}s)`,String(i))));if(clips.length){select.value='0';setClip(0)}else select.value='';discoverBones();updateTime();
$('scene').style.visibility='hidden';$('preview').style.visibility='hidden';views[0].renderer.domElement.style.pointerEvents='auto';status(`${asset} / 3D表示中 / ${clips.length}クリップ。FBX・VMD・VRM物理は未対応`)}
function setClip(i){mixer?.stopAllAction();activeClip=Number.isInteger(i)&&clips[i]?clips[i]:null;if(activeClip)mixer.clipAction(activeClip).play();updateTime()}
function updateTime(){if(mixer&&activeClip){const time=lastFrame/Math.max(1,fps);mixer.setTime(time%Math.max(.001,activeClip.duration))}trackSubject();publishModelFraming()}
window.addEventListener('bai-camera-frame',e=>{lastFrame=e.detail.frame;fps=e.detail.fps||30;
// Preserve the separately dispatched native VMD pose while experimental follow is enabled.
// The ordinary camera-frame event still updates model animation time.
if(!document.getElementById('vmd-follow-timeline')?.checked){untrackedPose=e.detail.pose;applyPose(e.detail.pose)}
updateTime()});
window.addEventListener('bai-camera-pose',e=>{trackingOffset=null;untrackedPose=e.detail.pose;applyPose(e.detail.pose);trackSubject()});
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
initRender();if(!rendererFailed){controlInit();installRailDrag(canvas());render();catalog()}
