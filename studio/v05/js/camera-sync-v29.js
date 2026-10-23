/* v29: project frame-rate, physical lens and focus bridge.
   Rendering DOF is delegated to the active renderer; this module never pretends to draw blur. */
(function(root){'use strict';
const validFps=v=>Number.isFinite(v)&&v>=1&&v<=240;
const validPositive=v=>Number.isFinite(v)&&v>0;
function create({evaluate,onState=()=>{},onError=()=>{},fps=60}={}){
 if(typeof evaluate!=='function')throw new TypeError('evaluate required');
 if(!validFps(fps))throw new RangeError('Invalid FPS');
 let rate=fps,generation=0,disposed=false,last=null;
 function setFrameRate(value){if(!validFps(value))throw new RangeError('Invalid FPS');rate=value;generation++;return rate;}
 async function seek(seconds){
  if(disposed)return null;
  if(!Number.isFinite(seconds)||seconds<0)throw new RangeError('Invalid timeline time');
  const ticket=++generation,frame=Math.round(seconds*rate);
  try{
   const data=await evaluate(frame,{seconds,fps:rate});
   if(disposed||ticket!==generation)return null;
   const pose=data?.pose;
   if(!pose||typeof pose!=='object')throw new TypeError('Missing pose');
   const lens={};
   const focal=pose.focalLength??pose.focalLengthMm;
   const aperture=pose.fStop??pose.aperture;
   const focus=pose.focusDistance;
   if(focal!==undefined){if(!validPositive(focal))throw new RangeError('Invalid focal length');lens.focalLengthMm=focal;}
   if(aperture!==undefined){if(!validPositive(aperture))throw new RangeError('Invalid f-stop');lens.fStop=aperture;}
   if(focus!==undefined){if(!validPositive(focus))throw new RangeError('Invalid focus distance');lens.focusDistance=focus;}
   last={seconds,frame,fps:rate,pose,lens};onState(last);return last;
  }catch(error){if(ticket===generation&&!disposed)onError(error);return null;}
 }
 return Object.freeze({seek,setFrameRate,getFrameRate:()=>rate,status:()=>last,dispose(){disposed=true;generation++;}});
}
function install({fps=60}={}){
 const sync=create({fps,evaluate:async frame=>{
  const response=await fetch('/api/camera/sequence/evaluate?frame='+encodeURIComponent(frame),{credentials:'same-origin'});
  if(!response.ok)throw new Error('Camera evaluation HTTP '+response.status);
  return response.json();
 },onState:state=>{root.dispatchEvent(new CustomEvent('bai:camera-pose-evaluated',{detail:{pose:state.pose,seconds:state.seconds,frame:state.frame,fps:state.fps}}));root.dispatchEvent(new CustomEvent('bai:camera-v29-state',{detail:state}));},
 onError:error=>root.dispatchEvent(new CustomEvent('bai:camera-sync-error',{detail:{message:String(error.message||error)}}))});
 root.addEventListener('bai:timeline-seek',event=>{const seconds=event.detail?.seconds;if(Number.isFinite(seconds))void sync.seek(seconds);});
 root.addEventListener('bai:project-frame-rate',event=>{try{sync.setFrameRate(Number(event.detail?.fps));}catch(error){root.dispatchEvent(new CustomEvent('bai:camera-sync-error',{detail:{message:error.message}}));}});
 return sync;
}
root.BAIStudioCameraV29=Object.freeze({create,install});
})(typeof window!=='undefined'?window:globalThis);
