/** Deterministic follow-target smoothing with seek/reset protection. Units: seconds and world units. */
export function validateSmoothing(value){
 const seconds=Number(value);
 if(!Number.isFinite(seconds)||seconds<0||seconds>5||String(value).trim()==='')throw Error('追従平滑化は0〜5秒で指定してください');
 return seconds;
}
export function advanceFollow(state,target,frame,fps,smoothingSeconds){
 const seconds=validateSmoothing(smoothingSeconds);
 if(!Array.isArray(target)||target.length!==3||!target.every(Number.isFinite))throw Error('追従座標が不正です');
 if(!Number.isFinite(frame)||!Number.isFinite(fps)||fps<=0)throw Error('フレーム情報が不正です');
 // Nonsequential jumps and reversals represent user scrubbing, not physical tracking.
 // On a seek, snap to the target to keep timeline previews deterministic.
 const previous=state?.target;
 const delta=frame-(state?.frame??frame);
 const reset=!previous||delta<=0||delta>Math.max(2,Math.round(fps*.25));
 const alpha=reset||seconds===0?1:1-Math.exp(-delta/(fps*seconds));
 const result=target.map((v,i)=>reset?v:previous[i]+(v-previous[i])*alpha);
 return {target:result,frame};
}
