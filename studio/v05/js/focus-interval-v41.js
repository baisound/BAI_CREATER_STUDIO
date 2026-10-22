/* Interval focus evaluation: caller must supply a real per-frame evaluator.
 * No simulated camera pose or GPU verification is performed. */
import {analyzeFocusFrame,analyzeFocusInterval} from './focus-visual-audit-v40.js';
export function createFocusIntervalRunner({evaluateFrame,onProgress=()=>{},onComplete=()=>{}}={}) {
  if(typeof evaluateFrame!=='function') throw new TypeError('evaluateFrame is required');
  let generation=0,latest=null,running=false;
  async function run({projectId,startFrame,endFrame,fps,tolerance=0.1,signal,maxFrames=10000}={}) {
    if(running) throw new Error('focus_scan_in_progress');
    if(!Number.isInteger(startFrame)||!Number.isInteger(endFrame)||startFrame<0||endFrame<startFrame||
      !Number.isFinite(fps)||fps<=0||!Number.isFinite(tolerance)||tolerance<0||
      endFrame-startFrame+1>maxFrames) throw new RangeError('invalid_scan_range');
    const token=++generation, entries=[];running=true;
    try {
      for(let frame=startFrame;frame<=endFrame;frame++) {
        if(token!==generation||signal?.aborted) throw new Error('focus_scan_cancelled');
        let snapshot,target;
        try { ({snapshot,target}=await evaluateFrame({projectId,frame,seconds:frame/fps,fps,signal})); }
        catch(e){if(token!==generation||signal?.aborted)throw new Error('focus_scan_cancelled');entries.push({snapshot:null,target:null,reason:String(e?.message||e)});onProgress({completed:entries.length,total:endFrame-startFrame+1,frame});continue;}
        if(snapshot?.frame!==frame || (projectId!=null && snapshot?.projectId!=null && snapshot.projectId!==projectId) ||
          Math.abs((snapshot?.seconds??NaN)-frame/fps)>1e-6 || Math.abs((target?.seconds??NaN)-frame/fps)>1e-6) {
          entries.push({snapshot:null,target:null,reason:'evaluation_time_mismatch'});
        } else entries.push({snapshot,target});
        onProgress({completed:entries.length,total:endFrame-startFrame+1,frame});
      }
      const summary=analyzeFocusInterval(entries,{tolerance});
      latest=Object.freeze({...summary,projectId,startFrame,endFrame,fps,tolerance,
        maximumError:Math.max(0,...summary.results.filter(x=>x.ok).map(x=>x.error)),
        problemFrames:summary.results.flatMap((r,i)=>!r.ok||!r.withinTolerance?[{frame:startFrame+i,reason:r.ok?'out_of_focus':entries[i].reason||r.reason,error:r.ok?r.error:null}]:[]),
        samples:summary.results.map((r,i)=>({frame:startFrame+i,ok:Boolean(r.ok),error:r.ok?r.error:null,withinTolerance:r.ok?Boolean(r.withinTolerance):null,reason:r.ok?null:(entries[i].reason||r.reason||"evaluation_failed")})),
        evaluatedAgainstGPU:false});
      onComplete(latest);return latest;
    } finally {if(token===generation)running=false;}
  }
  return {run,cancel(){generation++;running=false;},get running(){return running;},current(){return latest;}};
}
export function installFocusInterval(win=window){
  let evaluator=null;
  const runner=createFocusIntervalRunner({evaluateFrame:args=>{
    if(!evaluator)throw new Error('frame_evaluator_not_registered');
    return evaluator(args);
  },onProgress:d=>win.dispatchEvent(new CustomEvent('bai:focus-interval-progress',{detail:d})),onComplete:d=>win.dispatchEvent(new CustomEvent('bai:focus-interval-complete',{detail:d}))});
  const api={registerEvaluator(fn){if(typeof fn!=='function')throw new TypeError('evaluator must be a function');evaluator=fn;return()=>{if(evaluator===fn)evaluator=null;};},run:options=>runner.run(options),cancel:()=>runner.cancel(),current:()=>runner.current()};
  win.BAIStudioFocusIntervalV41=api;return api;
}
if(typeof window!=='undefined')installFocusInterval(window);
