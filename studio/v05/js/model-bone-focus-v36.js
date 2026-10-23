/* v36: derive a time-stamped focus target from the actual, evaluated Three.js scene graph.
 * This is a positioning bridge, not a claim of optical DOF parity. */
export function findFocusObject(root, boneName = '') {
  if (!root) return null;
  if (!boneName) return root;
  let found = null;
  root.traverse?.(node => { if (!found && node.name === boneName && (node.isBone || node.type === 'Bone')) found = node; });
  return found;
}
export function worldFocusPoint(object, THREE) {
  if (!object?.getWorldPosition || !THREE?.Vector3) return null;
  object.updateWorldMatrix?.(true, false);
  const point = object.getWorldPosition(new THREE.Vector3());
  const coords = [point.x, point.y, point.z];
  return coords.every(Number.isFinite) ? coords : null;
}
export function createModelBoneFocus({emit,diagnostic = () => {}, THREE} = {}) {
  if (typeof emit !== 'function') throw new TypeError('emit required');
  const models = new Map();
  let choice = null;
  let disposed = false;
  const fail = (reason) => { diagnostic({category:'camera',level:'info',code:'focus_target_unavailable',reason}); return {applied:false,reason}; };
  function update({seconds,frame,projectId} = {}) {
    if(disposed)return fail('disposed');
    if(!choice)return fail('target_not_selected');
    if(!Number.isFinite(seconds)||!Number.isInteger(frame)||frame<0)return fail('invalid_time');
    const model=models.get(choice.modelId);
    if(!model)return fail('model_not_loaded');
    if(model.projectId!==undefined&&projectId!==undefined&&model.projectId!==projectId)return fail('wrong_project');
    const bone=findFocusObject(model.object,choice.boneName);
    if(!bone)return fail('bone_not_found');
    model.object.updateMatrixWorld?.(true);
    const worldPosition=worldFocusPoint(bone,THREE);
    if(!worldPosition)return fail('position_unavailable');
    const detail={seconds,frame,projectId,targetId:choice.modelId+(choice.boneName?':'+choice.boneName:''),worldPosition};
    emit(detail);
    return {applied:true,detail};
  }
  return Object.freeze({
    bindModel(id,object,projectId){if(disposed)throw new Error('disposed');if(!id||!object)throw new TypeError('model id and object required'); models.set(id,{object,projectId}); return ()=>{if(models.get(id)?.object===object)models.delete(id);};},
    setTarget(modelId,boneName=''){choice=modelId?{modelId,boneName}:null;},
    update,dispose(){disposed=true;models.clear();choice=null;}
  });
}
export function installModelBoneFocus({win=window,THREE}={}) {
  const runtime=createModelBoneFocus({THREE,
    emit:detail=>win.dispatchEvent(new CustomEvent('bai:camera-focus-target-position',{detail})),
    diagnostic:detail=>win.dispatchEvent(new CustomEvent('bai:diagnostic',{detail}))});
  // Evaluated camera snapshots are cached so a model-pose update uses the identical frame.
  let snapshot=null;
  const onSnapshot=e=>{snapshot=e.detail;};
  const onPose=e=>{if(!snapshot||e.detail?.seconds!==snapshot.seconds||e.detail?.frame!==snapshot.frame||e.detail?.projectId!==snapshot.projectId)return;
    runtime.update({seconds:snapshot.seconds,frame:snapshot.frame,projectId:snapshot.projectId});};
  win.addEventListener('bai:camera-focus-snapshot',onSnapshot);
  win.addEventListener('bai:model-pose-evaluated',onPose);
  return Object.freeze({...runtime,dispose(){win.removeEventListener('bai:camera-focus-snapshot',onSnapshot);win.removeEventListener('bai:model-pose-evaluated',onPose);runtime.dispose();}});
}
