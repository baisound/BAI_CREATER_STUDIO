/* V26: isolated cinematic camera pose application; never mutates editor navigation camera. */
(function(root){'use strict';
function finite(v){return typeof v==='number'&&Number.isFinite(v);}
function vector(raw){if(Array.isArray(raw)&&raw.length>=3&&raw.slice(0,3).every(finite))return raw.slice(0,3);if(raw&&['x','y','z'].every(k=>finite(raw[k])))return [raw.x,raw.y,raw.z];return null;}
function create(){
 let shooting=null, navigation=null, active=true, last=null;
 function registerShootingCamera(camera,{navigationCamera=null}={}){
  if(!camera||!camera.position||typeof camera.position.set!=='function')throw new TypeError('Three.js shooting camera required');
  if(camera===navigationCamera)throw new Error('Shooting and navigation cameras must differ');
  shooting=camera;navigation=navigationCamera;return ()=>{if(shooting===camera){shooting=null;navigation=null;}};
 }
 function apply(pose,meta={}){
  if(!active||!shooting)return {applied:false,reason:'camera_unavailable'};
  if(shooting===navigation)return {applied:false,reason:'camera_is_navigation'};
  if(!pose||typeof pose!=='object')return {applied:false,reason:'invalid_pose'};
  const pos=vector(pose.position??pose.location);
  const rot=vector(pose.rotation??pose.euler);
  const quaternion=pose.quaternion;
  const q=Array.isArray(quaternion)&&quaternion.length===4&&quaternion.every(finite)?quaternion:null;
  const fov=pose.fov??pose.fieldOfView;
  if(!pos&&!rot&&!q&&!finite(fov))return {applied:false,reason:'unsupported_pose'};
  if(fov!==undefined&&(!finite(fov)||fov<=0||fov>=180))return {applied:false,reason:'invalid_fov'};
  if(pos)shooting.position.set(...pos);
  if(q&&shooting.quaternion?.set)shooting.quaternion.set(...q);
  else if(rot&&shooting.rotation?.set)shooting.rotation.set(...rot);
  if(finite(fov)){shooting.fov=fov;shooting.updateProjectionMatrix?.();}
  if(finite(pose.focusDistance)&&pose.focusDistance>0)shooting.userData&&(shooting.userData.baiFocusDistance=pose.focusDistance);
  shooting.updateMatrixWorld?.();last={pose,meta};return {applied:true};
 }
 return Object.freeze({registerShootingCamera,apply,setEnabled(value){active=Boolean(value);},status:()=>({registered:!!shooting,enabled:active,last})});
}
function install(){const runtime=create();if(root.addEventListener)root.addEventListener('bai:camera-pose-evaluated',ev=>{
 const result=runtime.apply(ev.detail?.pose,ev.detail);
 if(!result.applied&&result.reason!=='camera_unavailable')root.dispatchEvent?.(new CustomEvent('bai:camera-render-warning',{detail:result}));
});return runtime;}
root.BAIStudioCameraRenderer=Object.freeze({create,install});
})(typeof window!=='undefined'?window:globalThis);
