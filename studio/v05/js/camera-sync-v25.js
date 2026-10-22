/* V25: evaluate the existing camera sequence at the shared timeline time.
 * Only publishes a camera pose; renderer integration requires explicit registration.
 * The existing camera project is read-only in this module.
 */
(function(root){'use strict';
function create({fetchEvaluation,frameRate=60,onPose=()=>{},onError=()=>{}}){
 if(typeof fetchEvaluation!=='function')throw new TypeError('fetchEvaluation required');
 if(!Number.isFinite(frameRate)||frameRate<=0)throw new RangeError('Invalid frame rate');
 let generation=0,last=null,enabled=true;
 async function seek(seconds,context={}){
  if(!enabled)return null;
  if(!Number.isFinite(seconds)||seconds<0)throw new RangeError('Invalid seconds');
  const current=++generation;
  try{
   const result=await fetchEvaluation(seconds*frameRate,context);
   if(current!==generation||!enabled)return null;
   if(!result||!result.pose||typeof result.pose!=='object')throw new TypeError('Missing camera pose');
   last={seconds,frame:seconds*frameRate,result};
   onPose(result.pose,last);
   return last;
  }catch(err){if(current===generation)onError(err);return null;}
 }
 function stop(){enabled=false;generation++;}
 function start(){enabled=true;generation++;}
 return Object.freeze({seek,stop,start,status:()=>({enabled,last})});
}
function install({frameRate=60}={}){
 const runtime=create({frameRate,
  fetchEvaluation:async frame=>{
   const response=await fetch('/api/camera/sequence/evaluate?frame='+encodeURIComponent(frame),{credentials:'same-origin'});
   if(!response.ok)throw new Error('Camera evaluation HTTP '+response.status);
   return response.json();
  },
  onPose:(pose,meta)=>root.dispatchEvent(new CustomEvent('bai:camera-pose-evaluated',{detail:{pose,...meta}})),
  onError:error=>root.dispatchEvent(new CustomEvent('bai:camera-sync-error',{detail:{message:String(error.message||error)}}))
 });
 root.addEventListener('bai:timeline-seek',event=>{
  const seconds=event.detail?.seconds;if(Number.isFinite(seconds))void runtime.seek(seconds,{source:event.detail?.source});
 });
 return runtime;
}
root.BAIStudioCameraSync=Object.freeze({create,install});
})(typeof window!=='undefined'?window:globalThis);
