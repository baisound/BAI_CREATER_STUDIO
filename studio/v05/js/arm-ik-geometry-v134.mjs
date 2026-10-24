/* Pure world-space two-bone geometry. PMX bone rotations and grants are evaluated separately. */
const sub=(a,b)=>a.map((value,index)=>value-b[index]);
const add=(a,b)=>a.map((value,index)=>value+b[index]);
const mul=(a,scale)=>a.map(value=>value*scale);
const dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
const length=value=>Math.hypot(...value);
function point(value,name){
  if(!Array.isArray(value)||value.length!==3||value.some(n=>typeof n!=='number'||
      !Number.isFinite(n)||Math.abs(n)>100000))throw Error(`${name}は有限な3D位置が必要です。`);
  return value;
}
function radial(point,origin,axis){
  const from=sub(point,origin);
  return sub(from,mul(axis,dot(from,axis)));
}

export function solveArmGeometry({shoulder,elbow,wrist,target,pole=null,fallbackPole=null}){
  shoulder=point(shoulder,'肩');elbow=point(elbow,'ひじ');
  wrist=point(wrist,'手首');target=point(target,'目標');
  if(pole!==null)point(pole,'ポール');
  if(fallbackPole!==null)point(fallbackPole,'予備ポール');
  const upper=length(sub(elbow,shoulder)),lower=length(sub(wrist,elbow));
  if(upper<=1e-6||lower<=1e-6)throw Error('腕または前腕の長さを定義できません。');
  const desired=sub(target,shoulder),distance=length(desired);
  if(distance<=1e-6)throw Error('目標が肩と重なり、手先方向を定義できません。');
  const axis=mul(desired,1/distance);
  const minReach=Math.abs(upper-lower),maxReach=upper+lower;
  const reach=Math.max(minReach,Math.min(maxReach,distance));
  const clampedTarget=add(shoulder,mul(axis,reach));
  const x=(upper*upper-lower*lower+reach*reach)/(2*reach);
  const height=Math.sqrt(Math.max(0,upper*upper-x*x));
  let poleDirection=null,poleSource=null;
  if(height>1e-8){
    const threshold=Math.max(1e-5,upper*0.01);
    const choice=pole===null?elbow:pole;
    let projected=radial(choice,shoulder,axis);
    if(length(projected)<=threshold){
      if(pole!==null)throw Error('ポールが腕の軸と重なっています。');
      if(fallbackPole===null)throw Error('ほぼ直線の腕には予備ポールが必要です。');
      projected=radial(fallbackPole,shoulder,axis);
      poleSource='fallback';
      if(length(projected)<=threshold)throw Error('予備ポールが腕の軸と重なっています。');
    }else poleSource=pole===null?'current':'explicit';
    poleDirection=mul(projected,1/length(projected));
  }
  const elbowTarget=add(add(shoulder,mul(axis,x)),mul(poleDirection||[0,0,0],height));
  if(![...elbowTarget,...clampedTarget].every(Number.isFinite))
    throw Error('腕IKの計算結果が有限ではありません。');
  return {elbowTarget,wristTarget:clampedTarget,upper,lower,minReach,maxReach,
    requestedDistance:distance,reach,unreachableDistance:Math.abs(distance-reach),
    reachable:Math.abs(distance-reach)<=1e-8,poleSource,poleDirection};
}
