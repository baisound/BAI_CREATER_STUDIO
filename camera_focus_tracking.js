/* Approved Phase E feature: focus distance follows selected animated bone. */
(function(root){'use strict';
 function distance(cameraPosition,bonePosition){
  if(!Array.isArray(cameraPosition)||!Array.isArray(bonePosition)||cameraPosition.length!==3||bonePosition.length!==3||![...cameraPosition,...bonePosition].every(Number.isFinite))throw Error('合焦追従の座標が不正です');
  const d=Math.hypot(...cameraPosition.map((v,i)=>v-bonePosition[i]));
  if(!Number.isFinite(d)||d<=0)throw Error('合焦距離が不正です');
  return Math.max(.01,Math.min(100000,d));
 }
 function validate(value){if(!value||typeof value!=='object'||typeof value.enabled!=='boolean')throw Error('合焦追従設定が不正です');return {enabled:value.enabled}}
 root.BAICameraFocusTracking={distance,validate};
})(typeof window!=='undefined'?window:globalThis);
