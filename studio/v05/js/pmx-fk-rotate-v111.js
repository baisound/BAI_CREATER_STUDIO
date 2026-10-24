/* Local 3D rotation handle for the selected real PMX bone. Persistence stays in the FK editor. */
export function createPmxFkRotate({controls,viewport,getContext,onGoToFrame,onRotate,onCancel,onModeChange,onError}){
  const row=document.createElement('div');row.id='v111-fk-gizmo-controls';
  const goto=document.createElement('button');goto.type='button';goto.id='v111-fk-gizmo-goto';
  goto.textContent='このFを3D表示';
  const toggle=document.createElement('button');toggle.type='button';toggle.id='v111-fk-gizmo-toggle';
  toggle.textContent='3D回転ハンドルを表示';toggle.setAttribute('aria-pressed','false');
  const status=document.createElement('small');status.id='v111-fk-gizmo-status';status.setAttribute('role','status');
  status.textContent='対象骨の姿勢をドラッグで仮表示します。保存は「このFをキー化」。';
  row.append(goto,toggle,status);controls.append(row);
  let gizmo=null,helper=null,wanted=false,disposed=false,loading=false,drag=null;
  function deactivate(){
    wanted=false;toggle.setAttribute('aria-pressed','false');toggle.textContent='3D回転ハンドルを表示';
    if(drag){drag.bone.quaternion.copy(drag.start);drag=null;onCancel();}
    gizmo?.detach();if(gizmo)gizmo.enabled=false;
    if(viewport.controls)viewport.controls.enabled=true;
    onModeChange(false);viewport.invalidate();
  }
  function refresh(){
    if(disposed)return;
    const context=controls.open?getContext():null;
    toggle.disabled=loading||!context||Boolean(context.reason);
    if(!controls.open&&wanted){deactivate();return;}
    if(wanted&&(!context||context.reason)){deactivate();return;}
    if(wanted&&gizmo&&!drag&&gizmo.object!==context.bone){
      gizmo.attach(context.bone);onModeChange(true,context);viewport.invalidate();
    }
    if(!wanted)status.textContent=context?.reason||
      '対象骨の姿勢をドラッグで仮表示します。保存は「このFをキー化」。';
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
    gizmo.setMode('rotate');gizmo.setSpace('local');gizmo.setSize(.8);gizmo.enabled=false;
    helper=typeof gizmo.getHelper==='function'?gizmo.getHelper():gizmo;
    // The helper belongs to the scene, outside viewport.content and its fit bounds.
    viewport.scene.add(helper);
    gizmo.addEventListener('dragging-changed',event=>{
      if(viewport.controls)viewport.controls.enabled=!event.value;
    });
    gizmo.addEventListener('mouseDown',()=>{
      const context=getContext();
      if(!wanted||!context||context.reason||context.bone!==gizmo.object){
        fail(context?.reason||'対象骨が変わりました');deactivate();return;
      }
      drag={context,bone:context.bone,start:context.bone.quaternion.clone(),cancelled:false};
    });
    gizmo.addEventListener('objectChange',()=>{if(drag)viewport.invalidate();});
    gizmo.addEventListener('mouseUp',()=>{
      const current=drag;drag=null;
      if(!current)return;
      const desired=current.bone.quaternion.clone();
      if(current.cancelled){current.bone.quaternion.copy(current.start);onCancel();return;}
      if(current.start.angleTo(desired)<1e-5){onCancel();return;}
      queueMicrotask(async()=>{
        try{
          await onRotate(desired,current.context);
          status.textContent='回転を仮表示中。確認してから「このFをキー化」で保存してください。';
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
      wanted=true;gizmo.enabled=true;gizmo.attach(current.bone);
      toggle.setAttribute('aria-pressed','true');toggle.textContent='3D回転ハンドルを隠す';
      status.textContent='骨の回転リングをドラッグ。Escで仮補正を破棄します。';
      onModeChange(true,current);viewport.invalidate();
    }catch(error){fail(error);deactivate();}
    finally{loading=false;refresh();}
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
    drag.cancelled=true;drag.bone.quaternion.copy(drag.start);viewport.invalidate();
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
  return {refresh,dispose};
}
