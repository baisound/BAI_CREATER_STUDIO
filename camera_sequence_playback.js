/* CAM-015: deterministic half-open CUT selection, without mutating camera keys. */
(function(root){'use strict';
function activeShot(project,frame){
 if(!project||!Number.isFinite(frame))return null;
 const shot=(project.sequence||[]).find(s=>frame>=s.start&&frame<s.end);
 if(!shot)return null;
 const preset=(project.custom_presets||[]).find(p=>p.name===shot.preset);
 if(!preset||!preset.pose||!Array.isArray(preset.pose.position)||!Array.isArray(preset.pose.target)||!Number.isFinite(preset.pose.fov))return null;
 return {shot,pose:{position:[...preset.pose.position],target:[...preset.pose.target],fov:preset.pose.fov}};
}
const api={activeShot};if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.BAICameraSequencePlayback=api;
})(typeof window!=='undefined'?window:globalThis);
