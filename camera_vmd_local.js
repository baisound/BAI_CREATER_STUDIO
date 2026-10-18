/* Read-only experimental local VMD camera sampling; matches Python preview bridge.
 * No conversion is written back into imported keys. MMD compatibility unverified.
 */
(function(root){'use strict';
function bezier(u,p){if(u<=0)return 0;if(u>=1)return 1;const [x1,y1,x2,y2]=p.map(v=>v/127);const cubic=(t,a,b)=>3*(1-t)**2*t*a+3*(1-t)*t*t*b+t**3;let lo=0,hi=1;for(let n=0;n<36;n++){const mid=(lo+hi)/2;if(cubic(mid,x1,x2)<u)lo=mid;else hi=mid}return cubic((lo+hi)/2,y1,y2)}
function createSampler(track){if(track?.format!=='mmd-vmd-camera-native-v1'||!Array.isArray(track.keys)||!track.keys.length)throw Error('VMD camera track invalid');const keys=track.keys;for(let i=0;i<keys.length;i++){const k=keys[i];if(!Number.isInteger(k.frame)||(i&&keys[i-1].frame>=k.frame)||!Array.isArray(k.interpolation)||k.interpolation.length!==24||k.interpolation.some(v=>!Number.isInteger(v)||v<0||v>127))throw Error('VMD keys invalid')}
function sample(frame){if(!Number.isFinite(frame)||frame<0)throw Error('Frame invalid');let lo=0,hi=keys.length;while(lo<hi){const mid=(lo+hi)>>1;if(keys[mid].frame<frame)lo=mid+1;else hi=mid}const right=lo;
function exact(k){return {frame,target:[...k.target],rotation:[...k.rotation],distance:k.distance,fov:k.fov,perspective:k.perspective}}
if(right===0)return exact(keys[0]);if(right===keys.length)return exact(keys[keys.length-1]);if(keys[right].frame===frame)return exact(keys[right]);const a=keys[right-1],b=keys[right],u=(frame-a.frame)/(b.frame-a.frame),t=Array.from({length:6},(_,j)=>bezier(u,b.interpolation.slice(j*4,j*4+4))),mix=(x,y,t)=>x+(y-x)*t;return {frame,target:a.target.map((x,j)=>mix(x,b.target[j],t[j])),rotation:a.rotation.map((x,j)=>mix(x,b.rotation[j],t[3])),distance:mix(a.distance,b.distance,t[4]),fov:mix(a.fov,b.fov,t[5]),perspective:a.perspective}}
function preview(frame){const v=sample(frame),[x,y,z]=v.rotation;let vx=0,vy=0,vz=v.distance;[vy,vz]=[vy*Math.cos(x)-vz*Math.sin(x),vy*Math.sin(x)+vz*Math.cos(x)];[vx,vz]=[vx*Math.cos(y)+vz*Math.sin(y),-vx*Math.sin(y)+vz*Math.cos(y)];[vx,vy]=[vx*Math.cos(z)-vy*Math.sin(z),vx*Math.sin(z)+vy*Math.cos(z)];const focus=[v.target[0],v.target[1],-v.target[2]],position=[focus[0]+vx,focus[1]+vy,focus[2]-vz];if(![...position,...focus,v.fov].every(Number.isFinite)||Math.hypot(vx,vy,vz)<1e-5||v.fov<5||v.fov>150)throw Error('Unsupported VMD camera pose');return {frame,position,target:focus,fov:v.fov,perspective:v.perspective,preview_only:true,coordinate_space:'BAI-THREE-EXPERIMENTAL'}}
return {sample,preview}}
root.BAIVmdLocal={createSampler};
})(typeof window!=='undefined'?window:globalThis);
