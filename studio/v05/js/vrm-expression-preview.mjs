// Runtime-only VRM morph preview. Source-indexed binds come from the registered
// VRM inspection API and GLTFLoader parser associations from this loaded object.
export function applyVrmExpressionPreview(model, binds, inputWeight){
  if(model?.format!=='VRM'||!model.vrmTargets||!Array.isArray(binds)||!binds.length)
    throw Error('実バインドのあるVRMを選んでください。');
  if(!Number.isFinite(inputWeight)||inputWeight<=0||inputWeight>1)
    throw Error('表情の入力重みは0より大きく1以下にしてください。');
  const deltas=new Map();
  for(const bind of binds){
    if(!Number.isInteger(bind?.index)||bind.index<0||!Number.isFinite(bind.weight)||
       bind.weight<=0||bind.weight>1)throw Error('VRM表情バインドが不正です。');
    let meshes=[];
    if(Number.isInteger(bind.mesh))meshes=model.vrmTargets.meshes.get(bind.mesh)||[];
    else if(Number.isInteger(bind.node)){
      const node=model.vrmTargets.nodes.get(bind.node);
      node?.traverse?.(part=>{if(part.isMesh)meshes.push(part);});
    }
    if(!meshes.length)throw Error('読み込み済みVRMに対象メッシュがありません。');
    for(const mesh of meshes){
      if(!mesh.morphTargetInfluences||bind.index>=mesh.morphTargetInfluences.length)
        throw Error('読み込み済みVRMに対象モーフがありません。');
      let indices=deltas.get(mesh);
      if(!indices){indices=new Map();deltas.set(mesh,indices);}
      indices.set(bind.index,(indices.get(bind.index)||0)+inputWeight*bind.weight);
    }
  }
  const before=[];
  for(const [mesh,indices] of deltas)for(const [index,delta] of indices){
    const original=mesh.morphTargetInfluences[index];
    if(!Number.isFinite(original))throw Error('VRMモーフの現在値が不正です。');
    before.push({mesh,index,value:original,next:Math.min(1,Math.max(0,original+delta))});
  }
  for(const entry of before)entry.mesh.morphTargetInfluences[entry.index]=entry.next;
  return {targets:before.map(({mesh,index,next})=>({mesh,index,value:next})),
    restore(){for(const entry of before)entry.mesh.morphTargetInfluences[entry.index]=entry.value;}};
}
