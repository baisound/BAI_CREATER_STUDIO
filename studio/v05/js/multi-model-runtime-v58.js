/* v58 - independently loaded model instances in one shared 3D scene.
 * Dependency-injected to permit deterministic tests without WebGL.
 * A model is loaded once PER INSTANCE, not once per asset.  SkinnedMesh clones
 * cannot safely share mixer/skeleton state and shared disposal is forbidden.
 */
(function(global,factory){
  const api=factory();
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  global.BAIStudioMultiModelV58=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const validTransform=t=>t&&['position','rotation','scale'].every(k=>
    Array.isArray(t[k])&&t[k].length===3&&t[k].every(n=>typeof n==='number'&&Number.isFinite(n)))&&t.scale.every(n=>n>0);
  function createController({host,loadInstance,onChange=()=>{},onError=()=>{}}){
    if(!host?.mount||!host?.unmount||!host?.setTransform||!host?.evaluateAt||typeof loadInstance!=='function')
      throw new TypeError('Shared host and model loader required');
    const loaded=new Map();let projectId=null,epoch=0,closed=false,revision=null;
    function notify(){onChange(status());}
    function status(){return {projectId,revision,loaded:loaded.size,ids:[...loaded.keys()],closed};}
    function release(id){
      const entry=loaded.get(id);if(!entry)return;
      loaded.delete(id);
      // The shared host owns this instance's disposal callback.
      host.unmount(id);
    }
    function clear(){
      epoch++;
      for(const id of [...loaded.keys()])release(id);
      notify();
    }
    async function reconcile(data){
      if(closed)throw Error('Multi-model preview is closed');
      if(!data||typeof data.project_id!=='string'||!Array.isArray(data.instances))
        throw TypeError('Invalid scene instance response');
      if(projectId!==data.project_id){clear();projectId=data.project_id;}
      revision=data.revision;
      const token=++epoch;
      const wanted=new Map();
      const issues=[];
      for(const entry of data.instances){
        if(!entry||typeof entry.id!=='string'||!entry.id||wanted.has(entry.id)){
          issues.push({id:entry?.id||null,reason:'invalid_or_duplicate_id'});continue;
        }
        wanted.set(entry.id,entry);
      }
      for(const [id,current] of [...loaded]){
        const next=wanted.get(id);
        if(!next||next.asset_id!==current.assetId||!next.available||!next.asset)release(id);
      }
      for(const [id,entry] of wanted){
        if(!validTransform(entry.transform)){
          issues.push({id,reason:'invalid_transform'});release(id);continue;
        }
        const ready=loaded.get(id);
        if(ready){
          host.setTransform(id,entry.transform);
          ready.root.visible=entry.visible!==false;
          continue;
        }
        if(!entry.available||!entry.asset){issues.push({id,reason:'unavailable_model'});continue;}
        let model=null,detached=false;
        try{
          model=await loadInstance({instanceId:id,asset:entry.asset,projectId:data.project_id,token});
          if(token!==epoch||closed||projectId!==data.project_id){
            model?.dispose?.();return {stale:true,...status(),issues};
          }
          if(!model?.root||typeof model.dispose!=='function')throw TypeError('Loader must return root and dispose');
          host.mount(id,model.root,{evaluate:model.evaluate||(()=>{}),dispose:()=>model.dispose()});
          loaded.set(id,{assetId:entry.asset_id,root:model.root});
          host.setTransform(id,entry.transform);
          model.root.visible=entry.visible!==false;
          notify();
        }catch(error){
          // Mount succeeded but update failed: host releases the instance.
          if(loaded.has(id)){release(id);detached=true;}
          if(!detached)try{model?.dispose?.();}catch(_){}
          if(token!==epoch||closed)return {stale:true,...status(),issues};
          issues.push({id,reason:'load_failed',message:String(error?.message||error)});
          onError({id,error});
        }
      }
      if(token!==epoch||closed)return {stale:true,...status(),issues};
      notify();
      return {...status(),issues,stale:false};
    }
    function seek(seconds){
      if(closed)throw Error('Multi-model preview is closed');
      return host.evaluateAt(seconds);
    }
    function dispose(){if(closed)return;clear();host.close?.();closed=true;notify();}
    return {reconcile,seek,clear,dispose,status};
  }
  return {createController,validTransform};
});
