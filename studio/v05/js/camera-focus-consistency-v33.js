/* Shared v0.5 camera focus snapshot for diagnostics and preview.
 * This module does not render optical depth of field. */
(function(root){'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function normalize(state){
 const lens=state?.lens||{},pose=state?.pose||{};
 const seconds=state?.seconds,frame=state?.frame,fps=state?.fps;
 if(!finite(seconds)||seconds<0||!Number.isInteger(frame)||frame<0||!finite(fps)||fps<=0)throw new RangeError('Invalid camera time');
 const focalLengthMm=lens.focalLengthMm, fStop=lens.fStop, focusDistance=lens.focusDistance;
 const focusValid=[focalLengthMm,fStop,focusDistance].every(x=>finite(x)&&x>0);
 return Object.freeze({projectId:state?.projectId??null,seconds,frame,fps,pose,lens:Object.freeze({...lens}),focusValid,
  focusReason:focusValid?'ok':'missing_or_invalid_lens',dofRendered:false});
}
function create({emit=()=>{},diagnostic=()=>{}}={}){
 let current=null;
 function accept(state){const snapshot=normalize(state);current=snapshot;
  emit(snapshot);
  if(!snapshot.focusValid)diagnostic({level:'info',category:'camera',code:'focus_snapshot_incomplete',frame:snapshot.frame});
  return snapshot;
 }
 return Object.freeze({accept,current:()=>current});
}
function install(){const runtime=create({
 emit:snapshot=>root.dispatchEvent(new CustomEvent('bai:camera-focus-snapshot',{detail:snapshot})),
 diagnostic:detail=>root.dispatchEvent(new CustomEvent('bai:diagnostic',{detail}))
 });
 const onState=event=>{try{runtime.accept(event.detail)}catch(error){root.dispatchEvent(new CustomEvent('bai:diagnostic',{detail:{level:'warn',category:'camera',code:'focus_snapshot_invalid',message:String(error.message)}}));}};
 root.addEventListener('bai:camera-v29-state',onState);
 return Object.freeze({current:runtime.current,dispose:()=>root.removeEventListener('bai:camera-v29-state',onState)});
}
root.BAIStudioCameraFocusV33=Object.freeze({normalize,create,install});
})(typeof window!=='undefined'?window:globalThis);
