/* Read-only IK target inventory from the actual Three.js PMX geometry. */
export function listPmxIkTargets(mesh){
  const bones=mesh?.skeleton?.bones;
  const iks=mesh?.geometry?.userData?.MMD?.iks;
  if(!Array.isArray(bones)||!Array.isArray(iks))return [];
  const counts=new Map();
  for(const bone of bones)counts.set(bone?.name,(counts.get(bone?.name)||0)+1);
  const seen=new Set(),targets=[];
  for(const ik of iks){
    if(!Number.isInteger(ik?.target)||!Number.isInteger(ik?.effector)||
       !Array.isArray(ik.links)||!ik.links.length)continue;
    const target=bones[ik.target],effector=bones[ik.effector];
    if(!target?.isBone||!effector?.isBone||!target.name||!effector.name||
       counts.get(target.name)!==1||seen.has(ik.target))continue;
    seen.add(ik.target);
    targets.push({name:target.name,effector:effector.name,linkCount:ik.links.length});
  }
  return targets;
}
