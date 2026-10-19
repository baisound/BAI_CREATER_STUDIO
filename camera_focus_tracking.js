/* Approved Phase E feature: focus distance follows selected animated bone. */
(function(root){'use strict';
 function distance(cameraPosition,bonePosition,targetPosition=null){
  if(!Array.isArray(cameraPosition)||!Array.isArray(bonePosition)||cameraPosition.length!==3||bonePosition.length!==3||![...cameraPosition,...bonePosition].every(Number.isFinite))throw Error('合焦追従の座標が不正です');
  const axis=targetPosition?.map((v,i)=>v-cameraPosition[i]);
  const length=axis&&Math.hypot(...axis);
  if(targetPosition&&(!(length>1e-8)||targetPosition.length!==3||!targetPosition.every(Number.isFinite)))throw Error('光軸が不正です');
  const d=targetPosition?bonePosition.reduce((sum,v,i)=>sum+(v-cameraPosition[i])*axis[i]/length,0):Math.hypot(...cameraPosition.map((v,i)=>v-bonePosition[i]));
  if(!Number.isFinite(d)||d<=0)throw Error('合焦距離が不正です');
  return Math.max(.01,Math.min(100000,d));
 }
 function validate(value){if(!value||typeof value!=='object'||typeof value.enabled!=='boolean')throw Error('合焦追従設定が不正です');return {enabled:value.enabled}}
 root.BAICameraFocusTracking={distance,validate};
})(typeof window!=='undefined'?window:globalThis);
