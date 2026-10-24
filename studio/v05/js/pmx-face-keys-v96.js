// Saved PMX face keys are evaluated after the assigned body/VMD motion.
// Only named, actually loaded morphs are touched; source PMX/VMD stay read-only.
export function morphValues(object){
  const result=new Map();
  object?.traverse?.(node=>{
    if(!node.morphTargetDictionary||!node.morphTargetInfluences)return;
    for(const [name,index] of Object.entries(node.morphTargetDictionary)){
      if(Number.isInteger(index)&&index>=0&&index<node.morphTargetInfluences.length)
        result.set(name,Number(node.morphTargetInfluences[index]));
    }
  });
  return result;
}

export function resetMorphs(object){
  object?.traverse?.(node=>{
    if(!node.morphTargetInfluences)return;
    node.morphTargetInfluences.fill(0);
  });
}

export function setMorphValue(object,name,value){
  if(typeof name!=='string'||!name||!Number.isFinite(value)||value<0||value>1)return false;
  let found=false;
  object?.traverse?.(node=>{
    if(!node.morphTargetDictionary||!node.morphTargetInfluences)return;
    const index=node.morphTargetDictionary[name];
    if(Number.isInteger(index)&&index>=0&&index<node.morphTargetInfluences.length){
      node.morphTargetInfluences[index]=value;
      found=true;
    }
  });
  return found;
}

export function evaluateFaceKeys(keys,instanceId,seconds){
  const byName=new Map();
  for(const key of keys||[]){
    if(key.instance_id!==instanceId)continue;
    if(!byName.has(key.morph_name))byName.set(key.morph_name,[]);
    byName.get(key.morph_name).push(key);
  }
  const result=new Map();
  for(const [name,rows] of byName){
    rows.sort((a,b)=>a.time-b.time);
    if(seconds<rows[0].time)continue; // Earlier motion keeps its original face.
    let value=rows.at(-1).value;
    for(let i=0;i<rows.length-1;i++){
      const a=rows[i],b=rows[i+1];
      if(seconds>b.time)continue;
      const mix=Math.max(0,Math.min(1,(seconds-a.time)/(b.time-a.time)));
      value=a.value+(b.value-a.value)*mix;
      break;
    }
    result.set(name,value);
  }
  return result;
}

export function applyFaceKeys(object,keys,instanceId,seconds){
  const values=evaluateFaceKeys(keys,instanceId,seconds);
  const found=new Set();
  object?.traverse?.(node=>{
    if(!node.morphTargetDictionary||!node.morphTargetInfluences)return;
    for(const [name,value] of values){
      const index=node.morphTargetDictionary[name];
      if(Number.isInteger(index)&&index>=0&&index<node.morphTargetInfluences.length){
        node.morphTargetInfluences[index]=value;
        found.add(name);
      }
    }
  });
  return [...values.keys()].filter(name=>!found.has(name));
}
