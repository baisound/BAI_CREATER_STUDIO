/* Phase E: approved focal length and f-stop presets. 36x24 mm full-frame reference. */
(function(root){'use strict';
 const presets=Object.freeze({wide:{label:'広角・空間を広く (35mm / f4)',mm:35,aperture:4},standard:{label:'標準・自然な距離感 (50mm / f2.8)',mm:50,aperture:2.8},portrait:{label:'中望遠・人物アップ (80mm / f2.8)',mm:80,aperture:2.8},tele:{label:'望遠・遠くから (135mm / f4)',mm:135,aperture:4}});
 function focalToVerticalFov(mm,sensorHeight=24){if(!Number.isFinite(mm)||mm<=0||!Number.isFinite(sensorHeight)||sensorHeight<=0)throw Error('焦点距離・センサー寸法は正の数を指定してください');return 2*Math.atan(sensorHeight/(2*mm))*180/Math.PI}
 function verticalFovToFocal(degrees,sensorHeight=24){if(!Number.isFinite(degrees)||degrees<=0||degrees>=180)throw Error('画角が不正です');return sensorHeight/(2*Math.tan(degrees*Math.PI/360))}
 root.BAICameraLens={presets,focalToVerticalFov,verticalFovToFocal};
})(typeof window!=='undefined'?window:globalThis);
