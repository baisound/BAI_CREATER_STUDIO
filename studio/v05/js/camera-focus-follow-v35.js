/* Focus-follow state adapter. Uses the same evaluated time and lens snapshot as
 * camera diagnostics. It does not claim the GPU output has been validated. */
(function(root){'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function coords(value){
 if(Array.isArray(value)&&value.length>=3&&value.slice(0,3).every(finite))return value.slice(0,3);
 if(value&&[value.x,value.y,value.z].every(finite))return [value.x,value.y,value.z];
 if(value&&[value.position?.x,value.position?.y,value.position?.z].every(finite))return [value.position.x,value.position.y,value.position.z];
 return null;
}
function resolve(snapshot,target){
 if(!snapshot?.focusValid||!finite(snapshot.seconds)||!Number.isInteger(snapshot.frame)||!finite(snapshot.fps))return {applied:false,reason:'invalid_snapshot'};
 if(!target||target.projectId!==undefined&&snapshot.projectId!==undefined&&target.projectId!==snapshot.projectId)return {applied:false,reason:'wrong_project'};
 if(target.seconds!==snapshot.seconds||target.frame!==snapshot.frame)return {applied:false,reason:'time_mismatch'};
 const camera=coords(snapshot.pose?.position||snapshot.pose?.location||snapshot.pose);
 const point=coords(target.worldPosition);
 if(!camera||!point)return {applied:false,reason:'position_unavailable'};
 const distance=Math.hypot(camera[0]-point[0],camera[1]-point[1],camera[2]-point[2]);
 if(!finite(distance)||distance<=0)return {applied:false,reason:'invalid_distance'};
 const lens={...snapshot.lens,focusDistance:distance};
 return {applied:true,state:Object.freeze({...snapshot,lens:Object.freeze(lens),focusValid:true,focusTargetId:target.targetId||null,focusDistance:distance})};
}
function create({emit=()=>{},renderFocus=()=>({applied:false,reason:'renderer_not_connected'}),diagnostic=()=>{}}={}){
 let snapshot=null,target=null,latest=null;
 function refresh(){if(!snapshot||!target)return {applied:false,reason:'waiting_for_state'};
  const resolved=resolve(snapshot,target);
  if(!resolved.applied){diagnostic({category:'camera',level:'info',code:'focus_follow_unavailable',reason:resolved.reason,frame:snapshot.frame});return resolved;}
  latest=resolved.state;emit(latest);
  const result=renderFocus(latest);
  return {...resolved,renderResult:result};
 }
 return Object.freeze({setSnapshot(value){snapshot=value;return refresh();},setTarget(value){target=value;return refresh();},current:()=>latest});
}
function install(){const runtime=create({
 emit:state=>root.dispatchEvent(new CustomEvent('bai:camera-focus-follow-resolved',{detail:state})),
 renderFocus:state=>root.BAIStudioCameraProjectRuntime?.applyFocus?.(state)||{applied:false,reason:'renderer_not_connected'},
 diagnostic:detail=>root.dispatchEvent(new CustomEvent('bai:diagnostic',{detail}))
 });
 const onSnapshot=e=>runtime.setSnapshot(e.detail);
 const onTarget=e=>runtime.setTarget(e.detail);
 root.addEventListener('bai:camera-focus-snapshot',onSnapshot);
 root.addEventListener('bai:camera-focus-target-position',onTarget);
 return Object.freeze({setTarget:runtime.setTarget,current:runtime.current,dispose(){root.removeEventListener('bai:camera-focus-snapshot',onSnapshot);root.removeEventListener('bai:camera-focus-target-position',onTarget);}});
}
root.BAIStudioCameraFocusFollowV35=Object.freeze({resolve,create,install});
})(typeof window!=='undefined'?window:globalThis);
