import {solveArmGeometry} from './arm-ik-geometry-v134.mjs';

// Calculate local rotations on the evaluated PMX skeleton, then restore every bone.
// The caller must validate the same rotations through the VMD/IK/grant evaluator.
export function solveArmLocalRotations({THREE,object,arm,elbow,wrist,target,pole=null,fallbackPole=null}){
  if(!THREE?.Vector3||!THREE?.Quaternion||!object?.updateWorldMatrix||
      !arm?.isBone||!elbow?.isBone||!wrist?.isBone||
      new Set([arm,elbow,wrist]).size!==3)
    throw Error('実PMXの異なる腕・ひじ・手首骨が必要です。');
  function ancestor(child,parent){
    for(let node=child.parent;node;node=node.parent)if(node===parent)return true;
    return false;
  }
  if(!ancestor(elbow,arm)||!ancestor(wrist,elbow))
    throw Error('腕・ひじ・手首が一つの親子経路にありません。');
  const point=bone=>bone.getWorldPosition(new THREE.Vector3()).toArray();
  const originalArm=arm.quaternion.clone(),originalElbow=elbow.quaternion.clone();
  function rotate(bone,from,to,desired){
    const origin=new THREE.Vector3().fromArray(from);
    const actualDirection=new THREE.Vector3().fromArray(to).sub(origin);
    const targetDirection=new THREE.Vector3().fromArray(desired).sub(origin);
    if(actualDirection.lengthSq()<1e-12||targetDirection.lengthSq()<1e-12)
      throw Error('腕の方向を定義できません。');
    actualDirection.normalize();targetDirection.normalize();
    const worldDelta=new THREE.Quaternion().setFromUnitVectors(actualDirection,targetDirection);
    const parentWorld=bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const localDelta=parentWorld.clone().invert().multiply(worldDelta).multiply(parentWorld);
    bone.quaternion.premultiply(localDelta).normalize();
    object.updateWorldMatrix(true,true);
  }
  object.updateWorldMatrix(true,true);
  const shoulderPoint=point(arm),elbowPoint=point(elbow),wristPoint=point(wrist);
  const geometry=solveArmGeometry({shoulder:shoulderPoint,elbow:elbowPoint,
    wrist:wristPoint,target,pole,fallbackPole});
  let result;
  try{
    rotate(arm,shoulderPoint,elbowPoint,geometry.elbowTarget);
    const movedElbow=point(elbow),movedWrist=point(wrist);
    rotate(elbow,movedElbow,movedWrist,geometry.wristTarget);
    const wristActual=point(wrist),elbowActual=point(elbow);
    const residual=Math.hypot(...wristActual.map((value,index)=>value-geometry.wristTarget[index]));
    const elbowResidual=Math.hypot(...elbowActual.map((value,index)=>value-geometry.elbowTarget[index]));
    if(!Number.isFinite(residual)||!Number.isFinite(elbowResidual))
      throw Error('腕IKの実骨回転で有限な結果を得られません。');
    result={...geometry,armLocal:arm.quaternion.toArray(),elbowLocal:elbow.quaternion.toArray(),
      armBase:originalArm.toArray(),elbowBase:originalElbow.toArray(),
      wristActual,elbowActual,residual,elbowResidual};
  }finally{
    arm.quaternion.copy(originalArm);elbow.quaternion.copy(originalElbow);
    object.updateWorldMatrix(true,true);
  }
  return result;
}
