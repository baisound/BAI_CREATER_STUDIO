/* v29: consistent lens / focus metadata application to the registered shooting camera.
   This is NOT a DOF compositor: a renderer must consume baiLens and baiFocusDistance. */
(function(root){'use strict';
function create(){let shooting=null,navigation=null;
 function register(camera,{navigationCamera=null}={}){if(!camera||camera===navigationCamera)throw new TypeError('Distinct shooting camera required');shooting=camera;navigation=navigationCamera;return ()=>{if(shooting===camera){shooting=null;navigation=null;}};}
 function apply(state){if(!shooting||shooting===navigation)return false;
  const {pose={},lens={}}=state||{};
  if(Number.isFinite(lens.focalLengthMm)&&lens.focalLengthMm>0&&typeof shooting.setFocalLength==='function')shooting.setFocalLength(lens.focalLengthMm);
  else if(Number.isFinite(pose.fov)&&pose.fov>0&&pose.fov<180){shooting.fov=pose.fov;shooting.updateProjectionMatrix?.();}
  if(!shooting.userData)shooting.userData={};
  if(Number.isFinite(lens.fStop)&&lens.fStop>0)shooting.userData.baiFStop=lens.fStop;
  if(Number.isFinite(lens.focusDistance)&&lens.focusDistance>0)shooting.userData.baiFocusDistance=lens.focusDistance;
  shooting.userData.baiLensTimestampSeconds=state.seconds;
  return true;
 }
 return Object.freeze({register,apply});
}
function install(){const runtime=create();root.addEventListener('bai:camera-v29-state',e=>runtime.apply(e.detail));return runtime;}
root.BAIStudioCameraLensV29=Object.freeze({create,install});
})(typeof window!=='undefined'?window:globalThis);
