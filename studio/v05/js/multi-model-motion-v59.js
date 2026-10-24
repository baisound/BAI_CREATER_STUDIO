/* Stage 59: one master time, independent motion players per scene instance,
 * one renderer invalidation AFTER all instance evaluations. Does not invent target IDs.
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.BAIStudioMultiMotionV59=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function activeAt(rows,seconds){
    if(!Array.isArray(rows)||!Number.isFinite(seconds)||seconds<0)
      throw TypeError('Invalid motion timeline');
    const targets={};
    for(const row of rows){
      if(row?.status!=='ready'||!row.target_scene_instance_id)continue;
      if(!Number.isFinite(row.start)||!Number.isFinite(row.duration)||row.duration<=0)continue;
      if(seconds>=row.start&&seconds<row.start+row.duration){
        const id=row.target_scene_instance_id;
        if(targets[id])throw Error('Overlapping motion for scene instance '+id);
        targets[id]={...row,offsetSeconds:seconds-row.start};
      }
    }
    return targets;
  }
  function createCoordinator({controller,loadMotion,onChange=()=>{},onError=()=>{}}){
    if(!controller?.seek||!controller?.getLoaded||!controller?.setEvaluator||
       typeof loadMotion!=='function')throw TypeError('Scene controller and loader required');
    const players=new Map();
    // Keep the per-model player callback in sync with ownership changes.
    const attachedTargets=new Set();
    const lastActive=new Map();
    let projectId=null,epoch=0,closed=false,rows=[],revision=null,issues=[];
    function status(){return {projectId,revision,loadedClips:[...players.keys()],issues:[...issues],closed};}
    function notify(){onChange(status());}
    function release(id){
      const found=players.get(id);
      if(found){players.delete(id);try{found.player.dispose?.();}catch(e){onError({clipId:id,error:e});}}
    }
    function clear(){
      ++epoch;
      for(const id of [...players.keys()])release(id);
      for(const id of attachedTargets){
        try{controller.setEvaluator(id,null);}catch(_){}
      }
      attachedTargets.clear();
      lastActive.clear();
      rows=[];issues=[];notify();
    }
    async function reconcile(plan){
      if(closed)throw Error('Motion coordinator closed');
      if(!plan||typeof plan.project_id!=='string'||!Array.isArray(plan.rows))throw TypeError('Invalid motion plan');
      if(projectId!==plan.project_id){clear();projectId=plan.project_id;}
      const token=++epoch;
      revision=plan.arrangement_revision;
      rows=plan.rows.map(x=>({...x}));
      issues=rows.filter(x=>x.status!=='ready').map(x=>({clipId:x.clip_id,reason:x.status}));
      const desired=new Map(rows.filter(x=>x.status==='ready').map(x=>[x.clip_id,x]));
      for(const [id,player] of [...players]){
        const next=desired.get(id);
        if(!next||JSON.stringify([next.asset_id,next.target_scene_instance_id,next.motion_format])!==player.signature||
           !controller.getLoaded(next.target_scene_instance_id) ||
           controller.getLoaded(next.target_scene_instance_id)!==player.model)release(id);
      }
      for(const [id,row] of desired){
        if(players.has(id))continue;
        const target=controller.getLoaded(row.target_scene_instance_id);
        if(!target){issues.push({clipId:id,reason:'model_not_loaded'});continue;}
        let player;
        try{
          // Each helper captures the rig's initial pose. A previously loaded
          // clip may have left an edited pose on this shared mesh.
          target.resetPose?.();
          player=await loadMotion({row,target,projectId:plan.project_id});
          if(token!==epoch||closed||projectId!==plan.project_id){
            player?.dispose?.();return {stale:true,...status()};
          }
          if(controller.getLoaded(row.target_scene_instance_id)!==target){
            // The 3D skeleton was replaced while the motion was loading.
            // Never attach an animation to a disposed scene instance.
            player?.dispose?.();
            issues.push({clipId:id,reason:'model_changed_during_load'});
            continue;
          }
          if(!player||typeof player.seek!=='function')throw Error('Motion loader must return seek()');
          players.set(id,{player,target:row.target_scene_instance_id,model:target,
            signature:JSON.stringify([row.asset_id,row.target_scene_instance_id,row.motion_format])});
        }catch(error){
          player?.dispose?.();
          issues.push({clipId:id,reason:'motion_load_failed',message:String(error?.message||error)});
          onError({clipId:id,error});
        }
      }
      if(token!==epoch||closed)return {stale:true,...status()};
      const ids=new Set(rows.map(x=>x.target_scene_instance_id).filter(Boolean));
      for(const id of attachedTargets){
        if(!ids.has(id)){
          try{controller.setEvaluator(id,null);}catch(_){}
          attachedTargets.delete(id);
          lastActive.delete(id);
          controller.getLoaded(id)?.resetPose?.();
        }
      }
      for(const id of ids){
        if(!controller.getLoaded(id))continue;
        controller.setEvaluator(id,(seconds,clips)=>{
          const current=clips?.[0];
          const entry=current&&players.get(current.clip_id);
          const loaded=controller.getLoaded(id);
          if(entry&&entry.target===id&&loaded===entry.model){
            try{
              // Different clips can use independent animation mixers on one rig.
              // Restore the bind pose before handing ownership to a new player.
              if(lastActive.get(id)?.player!==entry.player)loaded?.resetPose?.();
              entry.player.seek(current.offsetSeconds);
              lastActive.set(id,{clipId:current.clip_id,player:entry.player});
            }catch(error){
              lastActive.delete(id);
              // Avoid retaining a partially evaluated or stale pose on errors.
              loaded?.resetPose?.();
              throw error;
            }
          }else{
            lastActive.delete(id);
            loaded?.resetPose?.();
          }
        });
        attachedTargets.add(id);
      }
      notify();
      return {stale:false,...status()};
    }
    function seek(seconds){
      if(closed)throw Error('Motion coordinator closed');
      const byId=activeAt(rows,seconds);
      const input={};
      for(const [id,row] of Object.entries(byId)){
        input[id]=[{clip_id:row.clip_id,offsetSeconds:row.offsetSeconds}];
      }
      return controller.seek(seconds,input);
    }
    function setCorrectionLayers(clipId,layers,preview=null){
      const entry=players.get(clipId);
      if(!entry||typeof entry.player.setCorrectionLayers!=='function')return false;
      entry.player.setCorrectionLayers(layers,preview);
      return true;
    }
    function dispose(){if(closed)return;clear();closed=true;notify();}
    return {reconcile,seek,setCorrectionLayers,clear,dispose,status};
  }
  return {createCoordinator,activeAt};
});
