/* v0.5 unified focus diagnostic. Analysis only; never claims GPU pixels have been verified. */
const finite = Number.isFinite;
export function analyzeFocusFrame(snapshot, target, {tolerance=0.1}={}) {
  if (!snapshot || !target || !finite(snapshot.seconds) || !finite(target.seconds) || !Number.isInteger(snapshot.frame) || snapshot.frame!==target.frame || Math.abs(snapshot.seconds-target.seconds)>1e-6) return {ok:false,reason:'time_mismatch'};
  if (snapshot.projectId!=null && target.projectId!=null && snapshot.projectId!==target.projectId) return {ok:false,reason:'wrong_project'};
  const arr = v => Array.isArray(v)?v:[v?.x,v?.y,v?.z];
  const camera=arr(snapshot.pose?.position??snapshot.pose?.location), point=arr(target.worldPosition);
  const lens=snapshot.lens||{};
  if (![...camera,...point,lens.focalLengthMm,lens.fStop].every(finite) || lens.focalLengthMm<=0 || lens.fStop<=0) return {ok:false,reason:'invalid_pose_or_lens'};
  const geometricDistance=Math.hypot(...camera.map((v,i)=>v-point[i]));
  const selectedFocusDistance=lens.focusDistance;
  if (!(geometricDistance>0) || !finite(selectedFocusDistance) || selectedFocusDistance<=0) return {ok:false,reason:'invalid_focus_distance'};
  if (!finite(tolerance)||tolerance<0) return {ok:false,reason:'invalid_tolerance'};
  const error=Math.abs(geometricDistance-selectedFocusDistance);
  return Object.freeze({ok:true,projectId:snapshot.projectId??null,seconds:snapshot.seconds,frame:snapshot.frame,fps:snapshot.fps,focusDistance:selectedFocusDistance,targetDistance:geometricDistance,error,withinTolerance:error<=tolerance,color:error<=tolerance?'green':'red',lens:Object.freeze({...lens}),targetId:target.targetId??null,gpuVerified:false});
}
export function analyzeFocusInterval(frames, {tolerance=0.1}={}) {
  if (!Array.isArray(frames)) throw new TypeError('frames must be an array');
  const results=frames.map(entry=>analyzeFocusFrame(entry.snapshot,entry.target,{tolerance}));
  const valid=results.filter(x=>x.ok);
  return Object.freeze({count:results.length,valid:valid.length,invalid:results.length-valid.length,passed:valid.filter(x=>x.withinTolerance).length,failed:valid.filter(x=>!x.withinTolerance).length,results,gpuVerified:false});
}
export function installFocusVisualAudit(win=window) {
  const snapshots=new Map();let latest=null;
  const limit=240;
  const key = value => value?.projectId != null && Number.isInteger(value?.frame) ? JSON.stringify([value.projectId,value.frame]) : null;
  const onSnapshot=e=>{const s=e.detail,k=key(s);if(k===null)return;snapshots.set(k,s);if(snapshots.size>limit)snapshots.delete(snapshots.keys().next().value);};
  const onTarget=e=>{const target=e.detail,k=key(target);const snapshot=k===null?null:snapshots.get(k);latest=k===null?{ok:false,reason:'missing_project_or_frame'}:analyzeFocusFrame(snapshot,target);win.dispatchEvent(new CustomEvent('bai:focus-visual-diagnostic-v40',{detail:latest}));};
  win.addEventListener('bai:camera-focus-snapshot',onSnapshot);
  win.addEventListener('bai:camera-focus-target-position',onTarget);
  return {current:()=>latest,dispose(){win.removeEventListener('bai:camera-focus-snapshot',onSnapshot);win.removeEventListener('bai:camera-focus-target-position',onTarget);snapshots.clear();}};
}
if(typeof window!=='undefined')window.BAIStudioFocusVisualV40=installFocusVisualAudit(window);
