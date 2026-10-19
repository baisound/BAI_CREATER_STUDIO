/* CAM-004 conservative spherical framing test; no dependency on WebGL. */
(function(root){'use strict';
function framing(pose,{center=[0,1.2,0],radius=1.2,aspect=16/9,margin=0.05}={}){
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 if(!pose||!Array.isArray(pose.position)||!Array.isArray(pose.target)||!Array.isArray(center)||
  [pose.position,pose.target,center].some(a=>a.length!==3||!a.every(finite))||
  ![pose.fov,radius,aspect,margin].every(finite)||pose.fov<=0||pose.fov>=180||radius<0||aspect<=0||margin<0||margin>=.5)throw Error('構図診断の入力が不正です');
 const sub=(a,b)=>a.map((v,i)=>v-b[i]);const dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0);
 const norm=a=>Math.hypot(...a);const unit=a=>a.map(v=>v/norm(a));
 const forward=sub(pose.target,pose.position);if(norm(forward)<1e-9)throw Error('注視方向が不正です');
 const f=unit(forward), worldUp=Math.abs(f[1])>.999?[0,0,1]:[0,1,0];
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const right=unit(cross(f,worldUp)),up=cross(right,f),vec=sub(center,pose.position);
 const z=dot(vec,f),x=Math.abs(dot(vec,right)),y=Math.abs(dot(vec,up));
 const near=z-radius;const vtan=Math.tan(pose.fov*Math.PI/360)*(1-margin),htan=vtan*aspect;
 // Sphere must fit inside all side planes; normals are normalized so
 // signed distance >= radius, not just center +/- radius in screen space.
 const vertical=(z*vtan-y)/Math.hypot(1,vtan)-radius;
 const horizontal=(z*htan-x)/Math.hypot(1,htan)-radius;
 const inside=near>0&&vertical>=-1e-9&&horizontal>=-1e-9;
 return {inside,behind:near<=0,verticalClearance:vertical,horizontalClearance:horizontal,forwardDistance:z};
}
// An axis-aligned world-space model box is less pessimistic than a sphere.
// Every corner must lie inside the camera frustum (no occlusion inference).
function framingBox(pose,{min,max,aspect=16/9,margin=0.05}={}){
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 if(!pose||![pose.position,pose.target,min,max].every(a=>Array.isArray(a)&&a.length===3&&a.every(finite))||
    ![pose.fov,aspect,margin].every(finite)||pose.fov<=0||pose.fov>=180||aspect<=0||margin<0||margin>=.5||min.some((v,i)=>v>max[i]))throw Error('包囲箱診断の入力が不正です');
 const sub=(a,b)=>a.map((v,i)=>v-b[i]);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 const unit=a=>{const n=Math.hypot(...a);if(n<1e-9)throw Error('注視方向が不正です');return a.map(v=>v/n)};
 const forward=unit(sub(pose.target,pose.position));
 const upHint=Math.abs(forward[1])>.999?[0,0,1]:[0,1,0];
 const right=unit(cross(forward,upHint)),up=cross(right,forward);
 const tanV=Math.tan(pose.fov*Math.PI/360)*(1-margin),tanH=tanV*aspect;
 let near=Infinity,vertical=Infinity,horizontal=Infinity;
 for(let i=0;i<8;i++){
  const pt=[(i&1)?max[0]:min[0],(i&2)?max[1]:min[1],(i&4)?max[2]:min[2]];
  const rel=sub(pt,pose.position),z=dot(rel,forward);
  near=Math.min(near,z);
  vertical=Math.min(vertical,z*tanV-Math.abs(dot(rel,up)));
  horizontal=Math.min(horizontal,z*tanH-Math.abs(dot(rel,right)));
 }
 return {inside:near>0&&vertical>=-1e-9&&horizontal>=-1e-9,behind:near<=0,verticalClearance:vertical,horizontalClearance:horizontal,forwardDistance:near,method:'box'};
}
root.BAICameraFraming={framing,framingBox};if(typeof module!=='undefined'&&module.exports)module.exports={framing,framingBox};
})(typeof window!=='undefined'?window:globalThis);
