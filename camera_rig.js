/* Phase E: deterministic, non-destructive shot rig pose generators. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.BAICameraRig=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const valid=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const scale=(a,s)=>a.map(v=>v*s);
const magnitude=a=>Math.hypot(...a);
function pose(base,position,target){if(!valid(position)||!valid(target)||magnitude(sub(position,target))<1e-5)throw Error('Invalid camera rig pose');return {...base,position,target};}
function orbit(base,{center=base.target,azimuth=0,elevation=0,radius=null}={}){
 if(!valid(center)||![azimuth,elevation].every(Number.isFinite))throw Error('Invalid orbit parameters');
 const delta=sub(base.position,center),r=radius===null?magnitude(delta):radius;
 if(!Number.isFinite(r)||r<=0)throw Error('Invalid orbit radius');
 const az=Math.atan2(delta[0],delta[2])+azimuth*Math.PI/180;
 const el=Math.max(-Math.PI/2+1e-4,Math.min(Math.PI/2-1e-4,Math.atan2(delta[1],Math.hypot(delta[0],delta[2]))+elevation*Math.PI/180));
 return pose(base,add(center,[r*Math.cos(el)*Math.sin(az),r*Math.sin(el),r*Math.cos(el)*Math.cos(az)]),center);
}
function crane(base,{pivot=base.target,angle=0}={}){
 if(!valid(pivot)||!Number.isFinite(angle))throw Error('Invalid crane parameters');
 const d=sub(base.position,pivot),theta=angle*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
 // World X pivot: actual boom arc, not a vertical translation.
 const rotated=[d[0],d[1]*c-d[2]*s,d[1]*s+d[2]*c];
 return pose(base,add(pivot,rotated),base.target);
}
function rail(base,{start,end,t=0,lookAt=null}={}){
 if(!valid(start)||!valid(end)||!Number.isFinite(t)||t<0||t>1)throw Error('Invalid rail parameters');
 const position=add(start,scale(sub(end,start),t));
 const target=lookAt===null?add(position,sub(base.target,base.position)):lookAt;
 return pose(base,position,target);
}
function follow(base,{subject,offset=null,lookAt=true}={}){
 if(!valid(subject))throw Error('Invalid subject position');
 const position=add(subject,offset===null?sub(base.position,base.target):offset);
 return pose(base,position,lookAt?subject:add(position,sub(base.target,base.position)));
}
// Bake a parametric camera movement into ordinary project keys. The resulting
// keys remain editable and use the project's existing persistence format.
function bake(base,{type,from,to,step=1,start,end,amount=90,easing='linear'}={}){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<=from||!Number.isInteger(step)||step<1)throw Error('Invalid rig frame interval');
 if(!['orbit','crane','rail'].includes(type)||!['linear','smooth'].includes(easing)||!Number.isFinite(amount))throw Error('Invalid rig motion');
 const count=Math.ceil((to-from)/step)+1;
 if(count>2000)throw Error('Rig bake exceeds 2000 keys; increase the step');
 const result=[];
 for(let frame=from;frame<=to;frame=Math.min(to,frame+step)){
  let t=(frame-from)/(to-from);if(easing==='smooth')t=t*t*(3-2*t);
  let p;
  if(type==='orbit')p=orbit(base,{center:start,azimuth:amount*t});
  else if(type==='crane')p=crane(base,{pivot:start,angle:amount*t});
  else p=rail(base,{start,end,t});
  result.push({frame,position:p.position,target:p.target,fov:p.fov,interpolation:'linear'});
  if(frame===to)break;
 }
 return result;
}
return Object.freeze({orbit,crane,rail,follow,bake});
});
