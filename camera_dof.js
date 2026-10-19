/* Phase E approved DOF diagnostics: bounded inputs for preview-only BokehPass. */
(function(root){'use strict';
 function settings(focal, fNumber, focusMeters){
  const mm=Number(focal), f=Number(fNumber), distance=Number(focusMeters);
  if(!Number.isFinite(mm)||mm<8||mm>300||!Number.isFinite(f)||f<.7||f>32||!Number.isFinite(distance)||distance<=0||distance>100000)throw Error('DOF設定値が範囲外です');
  // Three BokehPass aperture uses a rendering-specific coefficient rather than f-number.
  // This is a visual approximation, NOT physically calibrated depth of field.
  return {focus:distance,aperture:Math.min(.0005,Math.max(.000001,0.00004*(2.8/f)*(mm/50))),maxblur:.008};
 }
 root.BAICameraDOF={settings};
})(typeof window!=='undefined'?window:globalThis);
