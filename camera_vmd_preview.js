/* Non-destructive RAW MMD camera channel playback. No coordinate-frame conversion. */
(function(root){'use strict';
function bezier(progress,control){if(progress<=0)return 0;if(progress>=1)return 1;if(!Array.isArray(control)||control.length!==4||control.some(v=>!Number.isInteger(v)||v<0||v>127))throw Error('Invalid VMD interpolation');const [x1,y1,x2,y2]=control.map(v=>v/127);const cubic=(t,a,b)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;let lo=0,hi=1;for(let i=0;i<40;i++){const t=(lo+hi)/2;if(cubic(t,x1,x2)<progress)lo=t;else hi=t;}return cubic((lo+hi)/2,y1,y2)}
function sample(data,frame){if(!Number.isFinite(frame)||frame<0)throw Error('Invalid frame');const keys=data?.keys;if(!Array.isArray(keys)||!keys.length)throw Error('No camera keys');const copy=k=>({frame,center:[...k.center],rotation:[...k.rotation],distance:k.distance,viewAngle:k.viewAngle,perspective:k.perspective});if(frame<=keys[0].frame)return copy(keys[0]);if(frame>=keys[keys.length-1].frame)return copy(keys[keys.length-1]);let left=0,right=keys.length-1;while(left+1<right){const mid=(left+right)>>1;if(keys[mid].frame<frame)left=mid;else right=mid;}const a=keys[left],b=keys[right],p=(frame-a.frame)/(b.frame-a.frame),rates=Array.from({length:6},(_,i)=>bezier(p,b.interpolation.slice(i*4,i*4+4))),blend=(x,y,r)=>x+(y-x)*r;return {frame,center:a.center.map((x,i)=>blend(x,b.center[i],rates[i])),rotation:a.rotation.map((x,i)=>blend(x,b.rotation[i],rates[3])),distance:blend(a.distance,b.distance,rates[4]),viewAngle:blend(a.viewAngle,b.viewAngle,rates[5]),perspective:a.perspective}}
function previewPose(raw){
  // Experimental MMD convention: camera at center + Rz*Ry*Rx*(0,0,distance).
  // Conversion is deliberately opt-in, not used for project serialization.
  if(!raw||!Array.isArray(raw.center)||raw.center.length!==3||!Array.isArray(raw.rotation)||raw.rotation.length!==3||![...raw.center,...raw.rotation,raw.distance,raw.viewAngle].every(Number.isFinite))throw Error('Invalid raw camera pose');
  const [rx,ry,rz]=raw.rotation, sx=Math.sin(rx),cx=Math.cos(rx),sy=Math.sin(ry),cy=Math.cos(ry),sz=Math.sin(rz),cz=Math.cos(rz);
  const d=raw.distance,offset=[(cz*sy*cx+sz*sx)*d,(sz*sy*cx-cz*sx)*d,cy*cx*d];
  const position=raw.center.map((x,i)=>x+offset[i]);
  if(Math.hypot(...offset)<.0001)throw Error('Camera distance too small');
  const fov=Math.max(1,Math.min(179,raw.viewAngle));
  // Experimental basis includes camera roll. Axes are rotated by Rz * Ry * Rx.
  const right=[cz*cy,sz*cy,-sy];
  const up=[cz*sy*sx-sz*cx,sz*sy*sx+cz*cx,cy*sx];
  return {position,target:[...raw.center],right,up,fov,experimental:true,perspective:raw.perspective};
}
const lib={bezier,sample,previewPose};if(typeof module!=='undefined'&&module.exports)module.exports=lib;root.BAICameraVMD=lib;
})(typeof window!=='undefined'?window:globalThis);
