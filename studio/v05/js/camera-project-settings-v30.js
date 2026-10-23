/* v30: project FPS resolution and camera focus metadata handoff.
 * No GPU depth-of-field is claimed unless a registered renderer acknowledges it. */
(function(root){'use strict';
const validFps=x=>typeof x==='number'&&Number.isFinite(x)&&x>=1&&x<=240;
function resolveFps(project, fallback=60){
 const candidates=[project?.settings?.frameRate,project?.settings?.fps,project?.frameRate,project?.fps];
 for(const value of candidates)if(validFps(value))return {fps:value,source:'project'};
 return {fps:fallback,source:'fallback',warning:'Project FPS is not configured'};
}
function create({emit=()=>{},log=()=>{}}={}){
 let current=null,consumer=null,rev=0;
 function applyProject(project){const result=resolveFps(project);current={projectId:project?.id??null,...result};rev++;
  emit('bai:project-frame-rate',{fps:result.fps,source:result.source,projectId:current.projectId});
  if(result.warning)log({level:'warn',category:'camera',code:'project_fps_missing',projectId:current.projectId});
  return current;
 }
 function registerFocusRenderer(renderer){if(typeof renderer!=='function')throw new TypeError('Focus renderer must be a function');consumer=renderer;return ()=>{if(consumer===renderer)consumer=null;};}
 function applyFocus(state){const lens=state?.lens||{};const frame=state?.frame;
  if(!Number.isFinite(lens.fStop)||lens.fStop<=0||!Number.isFinite(lens.focusDistance)||lens.focusDistance<=0){
   log({level:'warn',category:'camera',code:'focus_parameters_unavailable',frame});return {applied:false,reason:'invalid_focus'};
  }
  if(!consumer){log({level:'info',category:'camera',code:'dof_renderer_not_connected',frame});return {applied:false,reason:'renderer_not_connected'};}
  try{const result=consumer({fStop:lens.fStop,focusDistance:lens.focusDistance,focalLengthMm:lens.focalLengthMm,frame,seconds:state.seconds});
   const ok=result===true||result?.applied===true;
   if(!ok)log({level:'warn',category:'camera',code:'dof_renderer_not_applied',frame});
   return {applied:ok,reason:ok?'ok':'renderer_not_applied'};
  }catch(error){log({level:'error',category:'camera',code:'dof_renderer_error',frame,message:String(error?.message||error)});return {applied:false,reason:'renderer_error'};}
 }
 return Object.freeze({applyProject,registerFocusRenderer,applyFocus,status:()=>({project:current,focusRendererConnected:!!consumer,revision:rev})});
}
function install(){const runtime=create({emit:(type,detail)=>root.dispatchEvent(new CustomEvent(type,{detail})),log:data=>root.dispatchEvent(new CustomEvent('bai:diagnostic',{detail:data}))});
 root.addEventListener('bai:project-selected',e=>runtime.applyProject(e.detail?.project));
 root.addEventListener('bai:camera-v29-state',e=>runtime.applyFocus(e.detail));
 // Evaluated focus-follow state overrides the basic focal distance for the same timestamp.
 root.addEventListener('bai:camera-focus-follow-resolved',e=>runtime.applyFocus(e.detail));
 return runtime;
}
root.BAIStudioCameraProjectV30=Object.freeze({create,resolveFps,install});
})(typeof window!=='undefined'?window:globalThis);
