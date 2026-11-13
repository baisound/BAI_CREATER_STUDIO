import {createPmxPhysicsPreview} from '../../js/motion/pmx-physics-preview.js';

export const SOLVER='mmd-fixed60-v1',HZ=60,MAX_BYTES=128*1024*1024,MAX_SECONDS=600;
function failure(instance,message){return Object.assign(Error((instance.name||instance.asset?.name||instance.id)+': '+message),{instanceId:instance.id});}

/** Build privately, then publish the entire immutable set of dynamic bone poses. */
export async function buildTimelinePhysics({scene,arrangement,getLoaded,sample,isCurrent=()=>true,onProgress=()=>{},factory=createPmxPhysicsPreview}){
 const configured=Object.entries(scene.physics||{}).filter(([,s])=>s.enabled),rows=[];
 let bytes=0;const engines=[];
 if(!configured.length)return {state:'off',apply(){},dispose(){},bytes:0,models:0};
 for(const [id,setting] of configured){
  const instance=scene.instances.find(row=>row.id===id),target=getLoaded(id);
  if(!instance)continue; // Removed timeline clips retain their saved override for Undo.
  if(setting.solver!==SOLVER||setting.asset_id!==instance.asset_id||target?.format!=='PMX'||!target.object?.skeleton)throw failure(instance,'物理対象のPMXが変わっています。設定を確認してください。');
  const scale=instance.transform.scale;
  if(scale.some(x=>x<=0)||Math.max(...scale)-Math.min(...scale)>1e-6)throw failure(instance,'MMD物理はXYZが同じ正の倍率で使ってください。');
  if(Math.abs(instance.transform.rotation[0])>1e-6||Math.abs(instance.transform.rotation[2])>1e-6)throw failure(instance,'MMD物理はモデル配置のX/Z回転を0にして使ってください。');
  const metadata=target.object.geometry.userData.MMD;
  const dynamic=[...new Set((metadata.rigidBodies||[]).filter(b=>b.type!==0&&b.boneIndex>=0).map(b=>b.boneIndex))];
  if(!dynamic.length)throw failure(instance,'このPMXには揺れを計算する剛体がありません。物理をOFFで保存してください。');
  if(dynamic.some(index=>!Number.isInteger(index)||!target.object.skeleton.bones[index]))throw failure(instance,'物理対象の骨がありません。物理OFFで保存してモデルを確認してください。');
  const windows=instance.timeline_windows;
  const end=windows?.length?Math.max(...windows.map(w=>w.start+w.duration)):
   Math.max(2,...arrangement.clips.map(c=>c.start+c.duration),...(scene.face_keys||[]).map(k=>k.time));
  const ticks=Math.ceil(end*HZ)+1; // Include the upper interpolation sample.
  if(end>MAX_SECONDS)throw failure(instance,'MMD物理は600秒以内の区間で使ってください。');
  bytes+=(ticks+1)*dynamic.length*7*4;
  if(bytes>MAX_BYTES)throw failure(instance,'MMD物理のキャッシュ合計が128MiBを超えます。対象モデルや区間を減らしてください。');
  rows.push({id,target,instance,end,ticks,dynamic,data:new Float32Array((ticks+1)*dynamic.length*7)});
 }
 const assertCurrent=()=>{if(!isCurrent())throw Error('物理の準備を中止しました。');};
 try{
  for(const row of rows){
   assertCurrent();
   // duration is the absolute project interval, never the selected motion's duration.
   try{row.engine=await factory(row.target.object,{duration:row.ticks/HZ,seek:sample});}catch(error){throw failure(row.instance,String(error.message||error));}engines.push(row.engine);
   row.bones=row.engine.dynamicBones.map(b=>({...b,bone:row.target.object.skeleton.bones[b.index]}));
   if(row.bones.length!==row.dynamic.length||row.bones.some(b=>!b.bone))throw failure(row.instance,'物理対象の骨を確認できません。');
  }
  const maxTicks=Math.max(0,...rows.map(row=>row.ticks));
  for(let tick=0;tick<=maxTicks;tick++){
   assertCurrent();
   for(const row of rows){
    if(tick>row.ticks)continue;
    try{row.engine.seek(tick/HZ,true);}catch(error){throw failure(row.instance,String(error.message||error));}
    for(const [index,entry] of row.bones.entries()){
     const offset=(tick*row.bones.length+index)*7;
     const values=[...entry.bone.position.toArray(),...entry.bone.quaternion.toArray()];if(!values.every(Number.isFinite)||values.some(x=>Math.abs(x)>1e6))throw failure(row.instance,'物理姿勢に不正な値があるため準備を止めました。物理OFFで保存してモデルを確認してください。');
     row.data.set(values,offset);
    }
   }
   if(tick%32===0){onProgress(tick/maxTicks);await new Promise(resolve=>setTimeout(resolve,0));}
  }
  assertCurrent();
 }finally{for(const engine of engines)engine.dispose();for(const row of rows)row.engine=null;}
 let disposed=false;
 return {state:'ready',models:rows.length,bytes,hz:HZ,
  apply(seconds){
   if(disposed)throw Error('物理キャッシュは再準備が必要です。');
   for(const row of rows){
    const frame=Math.max(0,Math.min(row.ticks,seconds*HZ)),a=Math.floor(frame),b=Math.min(row.ticks,a+1),mix=frame-a;
    for(const [index,entry] of row.bones.entries()){
     const left=(a*row.bones.length+index)*7,right=(b*row.bones.length+index)*7;
     const bone=entry.bone,THREE=row.target.libs.THREE;
     if(!entry.preservePosition)bone.position.set(...[0,1,2].map(k=>row.data[left+k]+(row.data[right+k]-row.data[left+k])*mix));
     bone.quaternion.fromArray(row.data,left+3).slerp(new THREE.Quaternion().fromArray(row.data,right+3),mix).normalize();
    }
    row.target.object.updateMatrixWorld(true);
   }
  },
  dispose(){disposed=true;for(const row of rows)row.data=null;},
 };
}
