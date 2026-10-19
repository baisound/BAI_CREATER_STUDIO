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
function curvePoint(start,control,end,t){return start.map((v,i)=>(1-t)*(1-t)*v+2*(1-t)*t*control[i]+t*t*end[i]);}
// Arc-length lookup gives approximately uniform world-space speed, including non-linear bends.
function curveArcTable(start,control,end,segments=256){
 if(![start,control,end].every(valid)||!Number.isInteger(segments)||segments<8||segments>4096)throw Error('Invalid curve arc table');
 const table=[0];let prev=start,total=0;
 for(let i=1;i<=segments;i++){const point=curvePoint(start,control,end,i/segments);total+=magnitude(sub(point,prev));table.push(total);prev=point;}
 if(total<1e-8)throw Error('Degenerate curved rail');
 return {length:total,cumulative:table,segments};
}
function curveConstantSpeedT(start,control,end,progress,table=null){
 if(!Number.isFinite(progress)||progress<0||progress>1)throw Error('Invalid curved rail progress');
 const arc=table||curveArcTable(start,control,end);
 if(progress===0)return 0;if(progress===1)return 1;
 const desired=progress*arc.length,values=arc.cumulative;
 let lo=0,hi=arc.segments;while(hi-lo>1){const mid=(lo+hi)>>1;if(values[mid]<desired)lo=mid;else hi=mid;}
 const denom=values[hi]-values[lo];return (lo+(denom>0?(desired-values[lo])/denom:0))/arc.segments;
}
function curvedRail(base,{start,control,end,t=0,lookAt=null,constantSpeed=false}={}){
 if(!valid(start)||!valid(control)||!valid(end)||!Number.isFinite(t)||t<0||t>1)throw Error('Invalid curved rail parameters');
 const position=curvePoint(start,control,end,constantSpeed?curveConstantSpeedT(start,control,end,t):t);
 const target=lookAt===null?add(position,sub(base.target,base.position)):lookAt;
 return pose(base,position,target);
}
function follow(base,{subject,offset=null,lookAt=true}={}){
 if(!valid(subject))throw Error('Invalid subject position');
 const position=add(subject,offset===null?sub(base.position,base.target):offset);
 return pose(base,position,lookAt?subject:add(position,sub(base.target,base.position)));
}
// Parent-child camera rig: apply a rigid Y-axis parent transform to both camera
// and its target. The source pose is never mutated. World pivot remains fixed.
function parentTransform(base,{pivot=[0,0,0],translation=[0,0,0],yaw=0}={}){
 if(!valid(pivot)||!valid(translation)||!Number.isFinite(yaw)||Math.abs(yaw)>360000)throw Error('Invalid parent rig transform');
 if(!valid(base.position)||!valid(base.target))throw Error('Invalid source camera pose');
 const theta=yaw*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
 const transform=point=>{const d=sub(point,pivot);return add(add(pivot,[d[0]*c+d[2]*s,d[1],-d[0]*s+d[2]*c]),translation);};
 return pose(base,transform(base.position),transform(base.target));
}
// Animated parent boom, evaluated at a normalized position. This can be baked
// to ordinary keys while leaving source camera data unchanged.
function craneSequence(base,{pivot=base.target,fromAngle=0,toAngle=0,t=0,easing='linear'}={}){
 if(!Number.isFinite(t)||t<0||t>1||!Number.isFinite(fromAngle)||!Number.isFinite(toAngle)||!['linear','smooth'].includes(easing))throw Error('Invalid crane sequence');
 const u=easing==='smooth'?t*t*(3-2*t):t;
 return crane(base,{pivot,angle:fromAngle+(toAngle-fromAngle)*u});
}
// Bake a parametric camera movement into ordinary project keys. The resulting
// keys remain editable and use the project's existing persistence format.
function bake(base,{type,from,to,step=1,start,end,control=null,amount=90,easing='linear',constantSpeed=false}={}){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<=from||!Number.isInteger(step)||step<1)throw Error('Invalid rig frame interval');
 if(!['orbit','crane','rail','curve','parent'].includes(type)||!['linear','smooth'].includes(easing)||!Number.isFinite(amount))throw Error('Invalid rig motion');
 const count=Math.ceil((to-from)/step)+1;
 if(count>2000)throw Error('Rig bake exceeds 2000 keys; increase the step');
 const result=[];
 for(let frame=from;frame<=to;frame=Math.min(to,frame+step)){
  let t=(frame-from)/(to-from);if(easing==='smooth')t=t*t*(3-2*t);
  let p;
  if(type==='orbit')p=orbit(base,{center:start,azimuth:amount*t});
  else if(type==='crane')p=crane(base,{pivot:start,angle:amount*t});
  else if(type==='parent')p=parentTransform(base,{pivot:start,translation:scale(end,t),yaw:amount*t});
  else if(type==='curve')p=curvedRail(base,{start,control,end,t,constantSpeed});
  else p=rail(base,{start,end,t});
  result.push({frame,position:p.position,target:p.target,fov:p.fov,interpolation:'linear'});
  if(frame===to)break;
 }
 return result;
}
return Object.freeze({orbit,crane,parentTransform,craneSequence,rail,curvedRail,curveArcTable,curveConstantSpeedT,curvePoint,follow,bake});
});
