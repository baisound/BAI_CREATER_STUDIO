/* 3D PMX bone handles. IK translation uses a world-space effector proxy; persistence stays in the editor. */
export function createPmxFkRotate({controls,viewport,getContext,onGoToFrame,onTransform,onCancel,onModeChange,onError}){
  const row=document.createElement('div');row.id='v111-fk-gizmo-controls';
  const goto=document.createElement('button');goto.type='button';goto.id='v111-fk-gizmo-goto';
  goto.textContent='このFを3D表示';
  const mode=document.createElement('select');mode.id='v113-fk-gizmo-mode';
  mode.setAttribute('aria-label','骨の3D操作');
  mode.add(new Option('回転','rotate'));mode.add(new Option('位置','translate'));
  const toggle=document.createElement('button');toggle.type='button';toggle.id='v111-fk-gizmo-toggle';
  toggle.textContent='3D回転ハンドルを表示';toggle.setAttribute('aria-pressed','false');
  const status=document.createElement('small');status.id='v111-fk-gizmo-status';status.setAttribute('role','status');
  status.textContent='対象骨の回転・位置をドラッグで仮表示します。保存は「このFをキー化」。';
  const reach=document.createElement('small');reach.id='v111-fk-ik-reach';
  reach.setAttribute('role','status');reach.hidden=true;
  row.append(goto,mode,toggle,status,reach);controls.append(row);
  let gizmo=null,helper=null,proxy=null,proxyContext=null,attachedContext=null;
  let wanted=false,disposed=false,loading=false,drag=null;
  const label=()=>mode.value==='translate'?'位置':'回転';
  const sameContext=(a,b)=>Boolean(a&&b&&a.projectId===b.projectId&&
    a.instanceId===b.instanceId&&a.clipId===b.clipId&&a.frame===b.frame&&
    a.bone===b.bone&&a.effectorBone===b.effectorBone);
  function updateReach(context){
    if(!context||context.reason||!context.effectorBone){reach.hidden=true;reach.textContent='';return;}
    const THREE=context.target.libs.THREE;
    context.target.object.updateWorldMatrix(true,true);
    const target=context.bone.getWorldPosition(new THREE.Vector3());
    const effector=context.effectorBone.getWorldPosition(new THREE.Vector3());
    const error=target.distanceTo(effector);
    reach.hidden=false;
    reach.dataset.reached=Number.isFinite(error)&&error<=0.001?'true':'false';
    reach.textContent=Number.isFinite(error)
      ?`IK目標と${context.effectorBone.name}の位置差: ${error.toFixed(4)} シーン単位。${error>0.001?'目標に一致していません。到達距離や関節制限を確認してください。':'目標付近にあります。'}`
      :'IK到達差を測定できません。';
  }
  function clearProxy(){
    if(!proxy)return;
    if(gizmo?.object===proxy)gizmo.detach();
    if(proxy.parent)proxy.parent.remove(proxy);
    proxy=null;proxyContext=null;
  }
  function attachFor(context){
    if(mode.value!=='translate'||!context.effectorBone){
      clearProxy();gizmo.setSpace('local');
      if(gizmo.object!==context.bone)gizmo.attach(context.bone);
    }else{
      if(!proxy||!sameContext(proxyContext,context)){
        clearProxy();proxy=new context.target.libs.THREE.Object3D();
        viewport.scene.add(proxy);proxyContext=context;
      }
      context.target.object.updateWorldMatrix(true,true);
      proxy.position.copy(context.effectorBone.getWorldPosition(
        new context.target.libs.THREE.Vector3()));
      gizmo.setSpace('world');
      if(gizmo.object!==proxy)gizmo.attach(proxy);
    }
    attachedContext=context;
    viewport.invalidate();
  }
  function localTargetAfterWorldDrag(current){
    const delta=current.handle.position.clone().sub(current.startHandlePosition);
    current.bone.parent.updateWorldMatrix(true,false);
    return current.bone.parent.worldToLocal(current.startBoneWorld.clone().add(delta));
  }
  function deactivate(){
    wanted=false;toggle.setAttribute('aria-pressed','false');toggle.textContent=`3D${label()}ハンドルを表示`;
    if(drag){drag.bone.quaternion.copy(drag.startRotation);drag.bone.position.copy(drag.startPosition);
      drag.handle.position.copy(drag.startHandlePosition);drag=null;onCancel();}
    gizmo?.detach();clearProxy();attachedContext=null;if(gizmo)gizmo.enabled=false;
    if(viewport.controls)viewport.controls.enabled=true;
    onModeChange(false);viewport.invalidate();
  }
  function refresh(){
    if(disposed)return;
    const context=controls.open?getContext():null;
    toggle.disabled=loading||!context||Boolean(context.reason);
    mode.disabled=loading||Boolean(drag);
    if(!controls.open&&wanted){deactivate();return;}
    if(wanted&&(!context||context.reason)){deactivate();return;}
    if(wanted&&gizmo&&!drag){
      const previous=gizmo.object;
      attachFor(context);
      if(previous!==gizmo.object)onModeChange(true,context);
    }
    if(!drag)updateReach(context);
    if(!wanted)status.textContent=context?.reason||
      '対象骨の回転・位置をドラッグで仮表示します。保存は「このFをキー化」。';
  }
  function fail(error){
    const message=String(error?.message||error);
    status.textContent=message;onError(message);
  }
  async function ensureGizmo(){
    if(gizmo)return;
    const {TransformControls}=await import('three/addons/controls/TransformControls.js');
    if(disposed)return;
    gizmo=new TransformControls(viewport.camera,viewport.renderer.domElement);
    gizmo.setMode(mode.value);gizmo.setSpace('local');gizmo.setSize(.8);gizmo.enabled=false;
    helper=typeof gizmo.getHelper==='function'?gizmo.getHelper():gizmo;
    // The helper belongs to the scene, outside viewport.content and its fit bounds.
    viewport.scene.add(helper);
    gizmo.addEventListener('dragging-changed',event=>{
      if(viewport.controls)viewport.controls.enabled=!event.value;
    });
    gizmo.addEventListener('mouseDown',()=>{
      const context=getContext();
      if(!wanted||!context||context.reason||!sameContext(context,attachedContext)||
          gizmo.object!==(proxy||context.bone)){
        fail(context?.reason||'対象骨が変わりました');deactivate();return;
      }
      context.target.object.updateWorldMatrix(true,true);
      drag={context,bone:context.bone,kind:mode.value,
        handle:gizmo.object,startHandlePosition:gizmo.object.position.clone(),
        startBoneWorld:context.bone.getWorldPosition(new context.target.libs.THREE.Vector3()),
        startRotation:context.bone.quaternion.clone(),startPosition:context.bone.position.clone(),cancelled:false};
      mode.disabled=true;
    });
    gizmo.addEventListener('objectChange',()=>{if(drag)viewport.invalidate();});
    gizmo.addEventListener('mouseUp',()=>{
      const current=drag;drag=null;
      if(!current)return;
      mode.disabled=false;
      const desired=current.kind==='translate'?
        (current.handle===current.bone?current.bone.position.clone():localTargetAfterWorldDrag(current)):
        current.bone.quaternion.clone();
      if(current.cancelled){current.bone.quaternion.copy(current.startRotation);
        current.bone.position.copy(current.startPosition);
        current.handle.position.copy(current.startHandlePosition);onCancel();refresh();return;}
      if(current.kind==='translate'?current.startPosition.distanceTo(desired)<1e-5:
          current.startRotation.angleTo(desired)<1e-5){onCancel();return;}
      queueMicrotask(async()=>{
        try{
          await onTransform(desired,current.kind,current.context);
          status.textContent=`${current.kind==='translate'?'位置':'回転'}を仮表示中。確認してから「このFをキー化」で保存してください。`;
          if(wanted)onModeChange(true,getContext());
        }catch(error){onCancel();fail(error);}
        finally{refresh();viewport.invalidate();}
      });
    });
  }
  toggle.addEventListener('click',async()=>{
    if(wanted){deactivate();refresh();return;}
    const context=getContext();
    if(!context||context.reason){fail(context?.reason||'実PMX骨を選択してください');return;}
    loading=true;refresh();
    try{
      await ensureGizmo();
      if(disposed||!controls.open)return;
      const current=getContext();
      if(!current||current.reason)throw Error(current?.reason||'対象骨が変わりました');
      wanted=true;gizmo.enabled=true;gizmo.setMode(mode.value);attachFor(current);
      toggle.setAttribute('aria-pressed','true');toggle.textContent=`3D${label()}ハンドルを隠す`;
      status.textContent=proxy?'追従骨の現在位置からIKハンドルをドラッグ。Escで取り消します。':
        `骨の${label()}ハンドルをドラッグ。Escで操作を取り消します。`;
      onModeChange(true,current);viewport.invalidate();
    }catch(error){fail(error);deactivate();}
    finally{loading=false;refresh();}
  });
  mode.addEventListener('change',()=>{
    if(drag)return;
    gizmo?.setMode(mode.value);
    toggle.textContent=`3D${label()}ハンドルを${wanted?'隠す':'表示'}`;
    status.textContent=wanted?`骨の${label()}ハンドルをドラッグ。Escで操作を取り消します。`:
      '対象骨の回転・位置をドラッグで仮表示します。保存は「このFをキー化」。';
    if(wanted){refresh();onModeChange(true,getContext());}
    viewport.invalidate();refresh();
  });
  goto.addEventListener('click',async()=>{
    goto.disabled=true;
    try{await onGoToFrame();refresh();}
    catch(error){fail(error);}
    finally{goto.disabled=false;}
  });
  const onKey=event=>{
    if(event.key!=='Escape'||!drag)return;
    event.preventDefault();event.stopPropagation();
    drag.cancelled=true;drag.bone.quaternion.copy(drag.startRotation);
    drag.bone.position.copy(drag.startPosition);
    drag.handle.position.copy(drag.startHandlePosition);viewport.invalidate();
    status.textContent='ドラッグを取り消しました。';
  };
  document.addEventListener('keydown',onKey,true);
  controls.addEventListener('toggle',refresh);
  function dispose(){
    if(disposed)return;deactivate();disposed=true;
    document.removeEventListener('keydown',onKey,true);
    controls.removeEventListener('toggle',refresh);
    gizmo?.dispose?.();if(helper?.parent)helper.parent.remove(helper);
    gizmo=null;helper=null;row.remove();
  }
  refresh();
  return {refresh,dispose,isDragging:()=>Boolean(drag),probe(){
    if(!wanted||!gizmo?.object||!attachedContext)return null;
    const THREE=attachedContext.target.libs.THREE;
    return {bone:attachedContext.bone.name,effector:attachedContext.effectorBone?.name||null,
      handleWorld:gizmo.object.getWorldPosition(new THREE.Vector3()).toArray(),
      effectorWorld:attachedContext.effectorBone?.getWorldPosition(new THREE.Vector3()).toArray()||null,
      targetWorld:attachedContext.bone.getWorldPosition(new THREE.Vector3()).toArray()};
  },setMode(next){
    if(next!=='rotate'&&next!=='translate')throw Error('Unknown PMX bone handle mode');
    if(drag)throw Error('骨のドラッグ中は操作を切り替えられません');
    if(mode.value===next)return;
    mode.value=next;mode.dispatchEvent(new Event('change'));
  }};
}
