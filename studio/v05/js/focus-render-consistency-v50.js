/* v50: checks whether focus diagnostics and shooting renderer use matching
 * project/time/lens values. This does NOT prove actual GPU pixels. */
const finitePositive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
export function focusIdentity(state) {
  const lens = state?.lens || state || {};
  const { projectId, frame, seconds, fps } = state || {};
  const { focalLengthMm, fStop, focusDistance } = lens;
  if (!Number.isInteger(frame) || frame < 0 || !Number.isFinite(seconds) || seconds < 0 || !finitePositive(fps) || ![focalLengthMm,fStop,focusDistance].every(finitePositive)) return null;
  return { projectId: projectId ?? null, frame, seconds, fps, focalLengthMm, fStop, focusDistance };
}
export function compareFocusStates(diagnostic, rendered, {epsilon=1e-5}={}) {
  const a=focusIdentity(diagnostic), b=focusIdentity(rendered);
  if(!a || !b) return {consistent:false,reason:'invalid_snapshot'};
  const mismatches=[];
  for(const key of ['projectId','frame']) if(a[key]!==b[key]) mismatches.push(key);
  for(const key of ['seconds','fps','focalLengthMm','fStop','focusDistance']) if(Math.abs(a[key]-b[key])>epsilon) mismatches.push(key);
  if(Math.abs(a.seconds-a.frame/a.fps)>1/a.fps+epsilon || Math.abs(b.seconds-b.frame/b.fps)>1/b.fps+epsilon) mismatches.push('time_frame_alignment');
  return {consistent:mismatches.length===0,reason:mismatches.length?'state_mismatch':'ok',mismatches};
}
export function createFocusRenderAudit({notify=()=>{}}={}) {
  let diagnostic=null, rendered=null;
  const check=()=>{
    const result=compareFocusStates(diagnostic,rendered);
    if(diagnostic&&rendered&&!result.consistent) notify({level:'warn',category:'camera',code:'focus_render_state_mismatch',details:result.mismatches||[result.reason]});
    return result;
  };
  return {setDiagnostic:s=>{diagnostic=s;return rendered?check():{consistent:false,reason:'renderer_not_ready'};},setRendered:s=>{rendered=s;return diagnostic?check():{consistent:false,reason:'diagnostic_not_ready'};},check};
}
