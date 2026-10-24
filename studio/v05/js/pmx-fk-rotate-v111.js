/* 3D PMX bone handles. IK translation uses a world-space effector proxy; persistence stays in the editor. */
export function createPmxFkRotate({controls,viewport,getContext,onGoToFrame,onTransform,onPoleTransform,onArmTransform,onArmDragStart,onCancel,onModeChange,onError}){
  const row=document.createElement('div');row.id='v111-fk-gizmo-controls';
  const goto=document.createElement('button');goto.type='button';goto.id='v111-fk-gizmo-goto';
  goto.textContent='このFを3D表示';
  const mode=document.createElement('select');mode.id='v113-fk-gizmo-mode';
  mode.setAttribute('aria-label','骨の3D操作');
  mode.add(new Option('回転','rotate'));mode.add(new Option('位置','translate'));
  mode.add(new Option('膝方向','pole'));
  mode.add(new Option('腕の手先','arm-hand'));
  mode.add(new Option('腕のひじ方向','arm-elbow'));
  const toggle=document.createElement('button');toggle.type='button';toggle.id='v111-fk-gizmo-toggle';
  toggle.textContent='3D回転ハンドルを表示';toggle.setAttribute('aria-pressed','false');
  const status=document.createElement('small');status.id='v111-fk-gizmo-status';status.setAttribute('role','status');
  status.textContent='対象骨の回転・位置をドラッグで仮表示します。保存は「このFをキー化」。';
  const reach=document.createElement('small');reach.id='v111-fk-ik-reach';
  reach.setAttribute('role','status');reach.hidden=true;
  const limits=document.createElement('small');limits.id='v127-fk-ik-limits';limits.hidden=true;
  row.append(goto,mode,toggle,status,reach,limits);controls.append(row);
  let gizmo=null,helper=null,proxy=null,proxyContext=null,attachedContext=null;
  let wanted=false,disposed=false,loading=false,drag=null;
  const label=()=>mode.value==='translate'?'位置':mode.value==='pole'?'膝方向':
    mode.value==='arm-hand'?'腕の手先':mode.value==='arm-elbow'?'腕のひじ方向':'回転';
  const armMode=()=>mode.value==='arm-hand'||mode.value==='arm-elbow';
  const sameContext=(a,b)=>Boolean(a&&b&&a.projectId===b.projectId&&
    a.instanceId===b.instanceId&&a.clipId===b.clipId&&a.frame===b.frame&&
    a.bone===b.bone&&a.effectorBone===b.effectorBone&&
    a.poleKneeBone===b.poleKneeBone&&a.armElbowBone===b.armElbowBone&&
    a.armWristBone===b.armWristBone&&a.armSide===b.armSide);
  function updateLimits(context){
    if(!context||context.reason||!context.effectorBone){limits.hidden=true;limits.textContent='';return;}
    const bones=context.target.object.skeleton.bones;
    const iks=context.target.object.geometry?.userData?.MMD?.iks;
    const ik=Array.isArray(iks)?iks.find(item=>bones[item.target]===context.bone):null;
    const label=[];
    const degrees=radians=>(radians*180/Math.PI).toFixed(1);
    for(const link of ik?.links||[]){
      const bone=bones[link.index];
      if(!bone?.name)continue;
      if(link.rotationMin&&link.rotationMax&&
          ['x','y','z'].every(axis=>Number.isFinite(link.rotationMin[axis])&&
            Number.isFinite(link.rotationMax[axis]))){
        const axes=['x','y','z'].map(axis=>{
          const min=degrees(link.rotationMin[axis]);
          const max=degrees(link.rotationMax[axis]);
          return min===max?`${axis.toUpperCase()} ${min}°固定`:
            `${axis.toUpperCase()} ${min}°〜${max}°`;
        });
        label.push(`${bone.name}: ${axes.join('、')}`);
      }else if(link.limitation){
        label.push(`${bone.name}: 回転軸の制限あり`);
      }
    }
    limits.hidden=false;
    limits.textContent=label.length?`PMXのIK関節制限: ${label.join(' / ')}。`:
      'PMXのIK関節角度制限は定義されていません。';
  }
  function updateReach(context){
    updateLimits(context);
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
    const proxyBone=mode.value==='arm-hand'?context.armWristBone:
      mode.value==='arm-elbow'?context.armElbowBone:
      mode.value==='pole'?context.poleKneeBone:
      mode.value==='translate'?context.effectorBone:null;
    if(!proxyBone){
      clearProxy();gizmo.setSpace('local');
      if(gizmo.object!==context.bone)gizmo.attach(context.bone);
    }else{
      if(!proxy||!sameContext(proxyContext,context)){
        clearProxy();proxy=new context.target.libs.THREE.Object3D();
        viewport.scene.add(proxy);proxyContext=context;
      }
      context.target.object.updateWorldMatrix(true,true);
      proxy.position.copy(proxyBone.getWorldPosition(
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
    if(drag){cancelLiveFrame(drag);drag.bone.quaternion.copy(drag.startRotation);drag.bone.position.copy(drag.startPosition);
      drag.handle.position.copy(drag.startHandlePosition);const current=drag;drag=null;cancelDrag(current);}
    gizmo?.detach();clearProxy();attachedContext=null;if(gizmo)gizmo.enabled=false;
    if(viewport.controls)viewport.controls.enabled=true;
    onModeChange(false);viewport.invalidate();
  }
  function refresh(){
    if(disposed)return;
    const context=controls.open?getContext():null;
    toggle.disabled=loading||!context||Boolean(context.reason)||
      (mode.value==='pole'&&!context.poleKneeBone)||
      (mode.value==='arm-hand'&&!context.armWristBone)||
      (mode.value==='arm-elbow'&&!context.armElbowBone);
    mode.disabled=loading||Boolean(drag)||Boolean(context?.armPreviewActive);
    if(!controls.open&&wanted){deactivate();return;}
    if(wanted&&(!context||context.reason||
        (mode.value==='pole'&&!context.poleKneeBone)||
        (mode.value==='arm-hand'&&!context.armWristBone)||
        (mode.value==='arm-elbow'&&!context.armElbowBone))){deactivate();return;}
    if(wanted&&gizmo&&!drag){
      const previous=gizmo.object;
      attachFor(context);
      if(previous!==gizmo.object)onModeChange(true,context);
    }
    if(!drag)updateReach(context);
    if(!wanted)status.textContent=context?.reason||
      (armMode()&&!(mode.value==='arm-hand'?context?.armWristBone:context?.armElbowBone)?
        '腕の手先・ひじ方向は対応するPMXの腕IKで使えます。':
      mode.value==='pole'&&!context?.poleKneeBone?'膝方向は対応する2リンク足IKの太もも骨で使えます。':
      '対象骨の回転・位置をドラッグで仮表示します。保存は「このFをキー化」。');
  }
  function fail(error){
    const message=String(error?.message||error);
    status.textContent=message;onError(message);
  }
  function cancelLiveFrame(current){
    if(current?.liveFrame!==null&&current?.liveFrame!==undefined){
      cancelAnimationFrame(current.liveFrame);current.liveFrame=null;
    }
  }
  function cancelDrag(current){
    if(!current||current.cancelRestored)return;
    current.cancelRestored=true;onCancel(current);
  }
  function scheduleArmPreview(current){
    if(current.liveFrame!==null||current.cancelled)return;
    current.liveFrame=requestAnimationFrame(()=>{
      current.liveFrame=null;
      if(drag!==current||current.cancelled)return;
      const desired=current.handle.position.clone();
      if(current.startHandlePosition.distanceTo(desired)<1e-5)return;
      Promise.resolve(onArmTransform(desired,current.kind,current.context)).then(result=>{
        if(drag!==current||current.cancelled)return;
        status.textContent=`ドラッグ中の腕IK仮表示。手首残差 ${result.residual.toFixed(4)} シーン単位。`;
        viewport.invalidate();
      }).catch(error=>{if(drag===current)fail(error);});
    });
  }
  async function ensureGizmo(){
    if(gizmo)return;
    const {TransformControls}=await import('three/addons/controls/TransformControls.js');
    if(disposed)return;
    gizmo=new TransformControls(viewport.camera,viewport.renderer.domElement);
    gizmo.setMode(mode.value==='pole'||armMode()?'translate':mode.value);
    gizmo.setSpace('local');gizmo.setSize(.8);gizmo.enabled=false;
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
        startRotation:context.bone.quaternion.clone(),startPosition:context.bone.position.clone(),
        cancelled:false,liveFrame:null,
        armPreviewAtStart:armMode()?onArmDragStart?.()||null:null};
      mode.disabled=true;
    });
    gizmo.addEventListener('objectChange',()=>{
      if(!drag)return;
      if(drag.kind==='arm-hand'||drag.kind==='arm-elbow')scheduleArmPreview(drag);
      viewport.invalidate();
    });
    gizmo.addEventListener('mouseUp',()=>{
      const current=drag;cancelLiveFrame(current);drag=null;
      if(!current)return;
      mode.disabled=false;
      const desired=current.kind==='pole'||current.kind==='arm-hand'||
        current.kind==='arm-elbow'?current.handle.position.clone():
        current.kind==='translate'?
        (current.handle===current.bone?current.bone.position.clone():localTargetAfterWorldDrag(current)):
        current.bone.quaternion.clone();
      if(current.cancelled){current.bone.quaternion.copy(current.startRotation);
        current.bone.position.copy(current.startPosition);
        current.handle.position.copy(current.startHandlePosition);cancelDrag(current);refresh();return;}
      if(current.kind==='pole'||current.kind==='arm-hand'||current.kind==='arm-elbow'?
          current.startHandlePosition.distanceTo(desired)<1e-5:
          current.kind==='translate'?current.startPosition.distanceTo(desired)<1e-5:
          current.startRotation.angleTo(desired)<1e-5){cancelDrag(current);return;}
      queueMicrotask(async()=>{
        try{
          const result=current.kind==='arm-hand'||current.kind==='arm-elbow'?
            await onArmTransform(desired,current.kind,current.context):current.kind==='pole'?
            await onPoleTransform(desired,current.context):
            await onTransform(desired,current.kind,current.context);
          status.textContent=current.kind==='arm-hand'||current.kind==='arm-elbow'?
            `腕IKを仮表示中。手首残差 ${result.residual.toFixed(4)} シーン単位。${result.unreachableDistance>1e-8?
              `指定位置は到達範囲外で、差 ${result.unreachableDistance.toFixed(4)}。`:''}確認後にキー化してください。`:
            current.kind==='pole'?
            `膝方向を仮表示中。指定との差 ${result.score.toFixed(1)}°。確認してから「このFをキー化」で保存してください。`:
            `${current.kind==='translate'?'位置':'回転'}を仮表示中。確認してから「このFをキー化」で保存してください。`;
          if(wanted)onModeChange(true,getContext());
        }catch(error){cancelDrag(current);fail(error);}
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
      if(mode.value==='pole'&&!current.poleKneeBone)throw Error('対応する膝ポールがありません。');
      if(mode.value==='arm-hand'&&!current.armWristBone)throw Error('対応する手首骨がありません。');
      if(mode.value==='arm-elbow'&&!current.armElbowBone)throw Error('対応するひじ骨がありません。');
      wanted=true;gizmo.enabled=true;
      gizmo.setMode(mode.value==='pole'||armMode()?'translate':mode.value);attachFor(current);
      toggle.setAttribute('aria-pressed','true');toggle.textContent=`3D${label()}ハンドルを隠す`;
      status.textContent=armMode()?`現在の${mode.value==='arm-hand'?'手首':'ひじ'}位置から3Dハンドルをドラッグ。離すと腕・ひじ2キーを仮評価します。`:
        mode.value==='pole'?'現在の膝位置から方向ハンドルをドラッグ。マウスを離すと実IKを仮評価します。':
        proxy?'追従骨の現在位置からIKハンドルをドラッグ。Escで取り消します。':
        `骨の${label()}ハンドルをドラッグ。Escで操作を取り消します。`;
      onModeChange(true,current);viewport.invalidate();
    }catch(error){fail(error);deactivate();}
    finally{loading=false;refresh();}
  });
  mode.addEventListener('change',()=>{
    if(drag)return;
    gizmo?.setMode(mode.value==='pole'||armMode()?'translate':mode.value);
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
    cancelLiveFrame(drag);
    if(drag.kind==='arm-hand'||drag.kind==='arm-elbow')cancelDrag(drag);
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
      poleKnee:attachedContext.poleKneeBone?.name||null,
      poleKneeWorld:attachedContext.poleKneeBone?.getWorldPosition(new THREE.Vector3()).toArray()||null,
      armSide:attachedContext.armSide||null,
      armElbowWorld:attachedContext.armElbowBone?.getWorldPosition(new THREE.Vector3()).toArray()||null,
      armWristWorld:attachedContext.armWristBone?.getWorldPosition(new THREE.Vector3()).toArray()||null,
      handleWorld:gizmo.object.getWorldPosition(new THREE.Vector3()).toArray(),
      effectorWorld:attachedContext.effectorBone?.getWorldPosition(new THREE.Vector3()).toArray()||null,
      targetWorld:attachedContext.bone.getWorldPosition(new THREE.Vector3()).toArray()};
  },setMode(next){
    if(!['rotate','translate','pole','arm-hand','arm-elbow'].includes(next))
      throw Error('Unknown PMX bone handle mode');
    if(drag)throw Error('骨のドラッグ中は操作を切り替えられません');
    if(mode.value===next)return;
    mode.value=next;mode.dispatchEvent(new Event('change'));
  }};
}
