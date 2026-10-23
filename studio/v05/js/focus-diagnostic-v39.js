/* Pure focus diagnostic helpers. Values are derived from the same evaluated
   state sent to DOF, not from a second camera/animation evaluation. */
export function diagnoseFocus(snapshot, target) {
  if (!snapshot || !Number.isFinite(snapshot.seconds) || !Number.isInteger(snapshot.frame))
    return {ok:false, reason:'invalid_snapshot'};
  if (!target || snapshot.seconds !== target.seconds || snapshot.frame !== target.frame)
    return {ok:false, reason:'time_mismatch'};
  if (snapshot.projectId != null && target.projectId != null && snapshot.projectId !== target.projectId)
    return {ok:false, reason:'wrong_project'};
  const position = snapshot.pose?.position || snapshot.pose?.location;
  const vector = value => Array.isArray(value) ? value : [value?.x,value?.y,value?.z];
  const camera=vector(position), point=vector(target.worldPosition);
  if (![...camera,...point].every(Number.isFinite)) return {ok:false,reason:'position_unavailable'};
  const focusDistance=Math.hypot(...camera.map((v,i)=>v-point[i]));
  const lens=snapshot.lens || {};
  if (!(focusDistance>0) || !(lens.fStop>0) || !(lens.focalLengthMm>0))
    return {ok:false,reason:'invalid_lens_or_distance'};
  return {ok:true,seconds:snapshot.seconds,frame:snapshot.frame,projectId:snapshot.projectId,
    focusDistance, lens:{...lens,focusDistance},targetId:target.targetId||null,
    rendererVerified:false,diagnosticKind:'geometric_distance'};
}
export function createFocusDiagnostic({emit=()=>{}}={}) {
  let snapshot=null,target=null,last=null;
  function compute() { const result=diagnoseFocus(snapshot,target);last=result.ok?result:null;if(result.ok)emit(result);return result; }
  return {setSnapshot(v){snapshot=v;return compute();},setTarget(v){target=v;return compute();},current(){return last;}};
}
export function installFocusDiagnostic(win=window) {
  const runtime=createFocusDiagnostic({emit:d=>win.dispatchEvent(new CustomEvent('bai:focus-diagnostic-v39',{detail:d}))});
  const onSnapshot=e=>runtime.setSnapshot(e.detail);
  const onTarget=e=>runtime.setTarget(e.detail);
  win.addEventListener('bai:camera-focus-snapshot',onSnapshot);
  win.addEventListener('bai:camera-focus-target-position',onTarget);
  return {runtime,dispose(){win.removeEventListener('bai:camera-focus-snapshot',onSnapshot);win.removeEventListener('bai:camera-focus-target-position',onTarget);}};
}

if(typeof window!=="undefined") window.BAIStudioFocusDiagnosticV39=installFocusDiagnostic(window);
