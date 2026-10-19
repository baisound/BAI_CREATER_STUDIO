/* CAM-005: a single optical/target evaluator for overlay and timeline checks. */
(function(root){'use strict';
 const proxies={face:[0,2.4,0],chest:[0,1.5,0],hips:[0,1,0]};
 function diagnose({frame=0,pose,lens,aperture,focus,target='face',point}){
  lens=Number(lens);aperture=Number(aperture);focus=Number(focus);
  if(!pose||!Array.isArray(pose.position)||pose.position.length!==3||!pose.position.every(Number.isFinite))throw Error('撮影カメラ姿勢がありません');
  if(!(lens>=1&&lens<=500&&aperture>=.5&&aperture<=64&&focus>.001))throw Error('レンズ・F値・合焦距離が不正です');
  const subject=point||proxies[target];
  if(!Array.isArray(subject)||subject.length!==3||!subject.every(Number.isFinite))throw Error('被写体位置が不正です');
  const f=lens/1000,c=.00003,H=f*f/(aperture*c)+f;
  if(focus<=f)throw Error('合焦距離は焦点距離より長くしてください');
  const near=H*focus/(H+(focus-f)),far=focus>=H?Infinity:H*focus/(H-(focus-f));
  const direction=pose.target?.map((v,i)=>v-pose.position[i]);
  const length=direction&&Math.hypot(...direction);
  if(!(length>1e-8))throw Error('撮影カメラの光軸が不正です');
  const actual=subject.reduce((sum,v,i)=>sum+(v-pose.position[i])*direction[i]/length,0);
  if(actual<=0)throw Error('被写体はカメラ背面です');
  const classification=actual<near?'front':actual>far?'back':Math.abs(actual-focus)<=.01?'focus':'within';
  return {frame,classification,inside:classification==='focus'||classification==='within',actual,focus,near,far,point:subject};
 }
 function intervals(samples){const fail=samples.filter(s=>!s.inside).map(s=>s.frame),ranges=[];let previous=null;
  for(const f of fail){if(previous!==null&&f===previous+1)ranges.at(-1)[1]=f;else ranges.push([f,f]);previous=f;}return ranges;}
 root.BAICameraFocusConsistency={diagnose,intervals,proxies};
})(typeof window!=='undefined'?window:globalThis);
