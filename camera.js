(()=>{'use strict';const $=id=>document.getElementById(id),ctx=$('preview').getContext('2d');let project,frame=0,selected=null,playing=false,raf=0,lastTime=0,playhead=0,history=[],cursor=-1,dirty=false,rangeStart=0,rangeSize=300,previewPose=null,sceneYaw=.6,scenePitch=.37;const clone=x=>JSON.parse(JSON.stringify(x)),status=t=>$('status').textContent=t;const presets={front:{position:[0,1.6,5],target:[0,1,0],fov:40},close:{position:[0,1.6,1.7],target:[0,1.5,0],fov:32},side:{position:[5,1.7,0],target:[0,1,0],fov:40},overhead:{position:[0,7,2],target:[0,1,0],fov:50},orbit:{position:[-3,2,4],target:[0,1,0],fov:38}};
function sample(f){const keys=project.keys;if(!keys.length)return clone(presets.front);if(f<=keys[0].frame)return clone(keys[0]);if(f>=keys.at(-1).frame)return clone(keys.at(-1));let i=keys.findIndex(k=>k.frame>=f),a=keys[i-1],b=keys[i],t=(f-a.frame)/(b.frame-a.frame);if(a.interpolation==='hold')t=0;else if(a.interpolation==='smooth')t=t*t*(3-2*t);return {position:a.position.map((n,j)=>n+(b.position[j]-n)*t),target:a.target.map((n,j)=>n+(b.target[j]-n)*t),fov:a.fov+(b.fov-a.fov)*t}}
function effectivePose(f){
 const cut=window.BAICameraSequencePlayback?.activeShot(project,f);
 return cut?cut.pose:sample(f);
}
function checkpoint(){history=history.slice(0,cursor+1);history.push(clone(project));if(history.length>80)history.shift();cursor=history.length-1;dirty=true}
function stagePose(p){previewPose=clone(p);for(const part of ['position','target'])p[part].forEach((v,i)=>$(part+i).value=v.toFixed(3));$('fov').value=p.fov.toFixed(1);draw();window.dispatchEvent(new CustomEvent('bai-camera-pose',{detail:{pose:p}}));status('構図を調整しました。キー化で登録できます')}
function commitPose(p){if($('auto-key').checked)writeKey(p);else stagePose(p)}
function setFrame(v){renderCustomPresets();frame=Math.max(0,Math.min(project.duration,Math.round(v)));$('frame').value=frame;$('frame-number').value=frame;$('frame-label').textContent=frame+' / '+project.duration;previewPose=null;const p=effectivePose(frame);for(const part of ['position','target'])p[part].forEach((val,i)=>$(part+i).value=val.toFixed(3));$('fov').value=p.fov.toFixed(1);const active=project.keys.find(k=>k.frame===frame);$('interpolation').value=active?.interpolation||'linear';$('sample').textContent=JSON.stringify({frame,...p},null,2);renderTrack();draw();window.dispatchEvent(new CustomEvent('bai-camera-frame',{detail:{frame,fps:project.fps,pose:effectivePose(frame),source:window.BAICameraSequencePlayback?.activeShot(project,frame)?'sequence':'keys'}}))}
function writeKey(p){if(!Number.isFinite(p.fov)||p.fov<5||p.fov>150||!p.position.concat(p.target).every(Number.isFinite))throw Error('数値を確認してください');if(Math.hypot(...p.position.map((x,i)=>x-p.target[i]))<.0001)throw Error('位置と注視点は異なる必要があります');const idx=project.keys.findIndex(k=>k.frame===frame);const old=project.keys.find(k=>k.frame===frame);const value={frame,...p,interpolation:$('interpolation').value||old?.interpolation||'linear'};if(idx<0)project.keys.push(value);else project.keys[idx]=value;project.keys.sort((a,b)=>a.frame-b.frame);selected=frame;checkpoint();setFrame(frame);status('未保存の編集があります')}
function inputPose(){return {position:[0,1,2].map(i=>Number($('position'+i).value)),target:[0,1,2].map(i=>Number($('target'+i).value)),fov:Number($('fov').value)}}
function renderTrack(){const track=$('track');track.replaceChildren();for(const k of project.keys){if(k.frame<rangeStart||k.frame>rangeStart+rangeSize)continue;const b=document.createElement('button');b.type='button';b.textContent='◆';b.style.left=(100*(k.frame-rangeStart)/rangeSize)+'%';b.className=k.frame===selected?'active':'';b.title='フレーム '+k.frame;b.onclick=()=>{selected=k.frame;setFrame(k.frame)};b.draggable=true;b.ondragstart=e=>e.dataTransfer.setData('text/plain',String(k.frame));track.append(b)}}
function updateRangeControls(){rangeSize=Math.max(1,Math.min(project.duration,Math.round(rangeSize)||1));rangeStart=Math.max(0,Math.min(Math.max(0,project.duration-rangeSize),Math.round(rangeStart)));$('range-start').value=rangeStart;$('range-size').value=rangeSize;$('range-label').textContent=`表示範囲: ${rangeStart} ～ ${Math.min(project.duration,rangeStart+rangeSize)} / 全${project.duration}フレーム（◆はキー、キー間は補間）`;renderTrack()}
$('duration-apply').onclick=()=>{const n=Number($('duration').value);if(!Number.isInteger(n)||n<1||n>1000000){status('1～1000000の整数を指定してください');return}if(project.keys.some(k=>k.frame>n)){status('尺より後ろにキーがあります。先にキーを移動または削除してください');return}project.duration=n;checkpoint();$('frame').max=n;$('frame-number').max=n;updateRangeControls();setFrame(Math.min(frame,n));status('尺を更新しました。保存ボタンで確定してください')};
$('range-apply').onclick=()=>{rangeStart=Number($('range-start').value);rangeSize=Number($('range-size').value);if(!Number.isFinite(rangeStart)||!Number.isFinite(rangeSize)){status('表示範囲は数値で指定してください');return}updateRangeControls()};
$('range-prev').onclick=()=>{rangeStart-=Math.max(1,Math.floor(rangeSize*.8));updateRangeControls()};
$('range-next').onclick=()=>{rangeStart+=Math.max(1,Math.floor(rangeSize*.8));updateRangeControls()};
$('track').addEventListener('click',e=>{if(e.target!==$('track'))return;const r=$('track').getBoundingClientRect();setFrame(rangeStart+Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*rangeSize))});
let pointer=null;
$('preview').addEventListener('pointerdown',e=>{if(e.button!==0||!project)return;pointer={x:e.clientX,y:e.clientY,pose:sample(frame),shift:e.shiftKey};$('preview').setPointerCapture(e.pointerId)});
$('preview').addEventListener('pointerup',e=>{if(!pointer)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,base=pointer.pose,shift=pointer.shift;pointer=null;if(Math.hypot(dx,dy)<2)return;try{let p;if(shift){p=moveCamera(base,'pan',-dx*.01);p.position[1]+=dy*.01;p.target[1]+=dy*.01}else{p=moveCamera(base,'orbit',-dx*.35);const eye=p.position,tar=p.target,d=eye.map((n,i)=>n-tar[i]),radius=Math.hypot(...d),az=Math.atan2(d[0],d[2]),el=Math.max(-1.45,Math.min(1.45,Math.asin(Math.max(-1,Math.min(1,d[1]/radius)))+dy*.004));p.position=[tar[0]+radius*Math.cos(el)*Math.sin(az),tar[1]+radius*Math.sin(el),tar[2]+radius*Math.cos(el)*Math.cos(az)]}commitPose(p)}catch(err){status(err.message)}});
$('preview').addEventListener('pointercancel',()=>pointer=null);
$('preview').addEventListener('wheel',e=>{if(!project)return;e.preventDefault();try{const p=previewPose||sample(frame),r=Math.hypot(...p.position.map((n,i)=>n-p.target[i])),step=Math.sign(e.deltaY)*-Math.min(r*.15,1);commitPose(moveCamera(p,'dolly',step))}catch(err){status(err.message)}},{passive:false});
$('track').ondragover=e=>e.preventDefault();$('track').ondrop=e=>{e.preventDefault();const old=Number(e.dataTransfer.getData('text/plain'));if(!project.keys.some(k=>k.frame===old))return;const rect=$('track').getBoundingClientRect(),next=Math.round(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*rangeSize+rangeStart);if(project.keys.some(k=>k.frame===next&&next!==old)){status('同じフレームにキーがあります');return}project.keys.find(k=>k.frame===old).frame=next;project.keys.sort((a,b)=>a.frame-b.frame);selected=next;checkpoint();setFrame(next)};
let modelFramingBounds=null;
window.addEventListener('bai-camera-model-bounds',e=>{modelFramingBounds=e.detail;drawFramingDiagnostic()});
function drawFramingDiagnostic(){
 const out=$('framing-result');if(!$('framing-enabled').checked){out.textContent='診断OFF';return}
 try{const pose=previewPose||sample(frame);const diagnostic={...(modelFramingBounds||{}),aspect:Number($('framing-aspect').value),margin:Number($('framing-margin').value)/100};const useBox=Array.isArray(diagnostic.min)&&Array.isArray(diagnostic.max);const result=useBox?window.BAICameraFraming.framingBox(pose,diagnostic):window.BAICameraFraming.framing(pose,diagnostic);
 const label=modelFramingBounds?(useBox?'実モデルの包囲箱':'実モデルの包囲球'):'ガイド人体';const mode=$('framing-mode').value;const description=result.behind?'対象の一部がカメラ背面または近距離です':result.inside?'対象の包囲範囲は設定余白内です':'対象の包囲範囲が画面外に達しています';out.textContent=label+'：'+description+(mode==='full'&&!result.inside?'（全身収めチェックの条件外）':'')+'。構図の良否は判定しません。';out.style.color='';
 }catch(e){out.textContent='診断不可: '+e.message;out.style.color='#ffb570'}
}
for(const id of ['framing-enabled','framing-aspect','framing-margin','framing-mode'])$(id).addEventListener('change',drawFramingDiagnostic);
window.addEventListener('bai-camera-frame',drawFramingDiagnostic);
window.addEventListener('bai-camera-pose',drawFramingDiagnostic);
let focusPoint=null,focusPointFrame=null,diagnosticVmdPose=null,diagnosticVmdFrame=null;
window.addEventListener('bai-camera-vmd-preview',e=>{diagnosticVmdPose=e.detail?.pose||null;diagnosticVmdFrame=e.detail?.frame??null;drawFocusDiagnostic()});
$('vmd-follow-timeline').addEventListener('change',()=>{if(!$('vmd-follow-timeline').checked){diagnosticVmdPose=null;diagnosticVmdFrame=null;}drawFocusDiagnostic()});
window.addEventListener('bai-camera-focus-target',e=>{focusPoint=e.detail?.point||null;focusPointFrame=e.detail?.frame??null;drawFocusDiagnostic()});
function diagnosticCameraPose(f){
 if($('vmd-follow-timeline').checked){
  if(!nativeLocalSampler)throw Error('VMD追従中ですがVMDカメラが未読込です');
  return nativeLocalSampler.preview(f);
 }
 return previewPose&&f===frame?previewPose:effectivePose(f);
}
function focusDiagnosticAt(f,point,focusOverride=null){const pose=diagnosticCameraPose(f);return window.BAICameraFocusConsistency.diagnose({frame:f,pose,lens:$('focus-lens').value,aperture:$('focus-aperture').value,focus:focusOverride??$('focus-distance').value,target:$('focus-subject').value,point});}
function drawFocusDiagnostic(){const result=$('focus-result'),color=$('focus-color-status');if(!$('focus-enabled').checked){result.textContent='診断OFF';color.textContent='色分け OFF';window.dispatchEvent(new CustomEvent('bai-camera-focus-diagnostic',{detail:{enabled:false}}));return}
 try{if($('focus-follow-bone').checked&&!(focusPointFrame===frame&&Array.isArray(focusPoint)))throw Error('現在フレームの追従ボーン位置が未取得です。ガイド位置で代用しません');const r=focusDiagnosticAt(frame,focusPointFrame===frame?focusPoint:null);const labels={front:'マゼンタ／手前ボケ',focus:'青／焦点面',within:'緑／許容範囲',back:'橙／奥ボケ'};
 result.textContent=`${r.inside?'許容被写界深度内':'被写界深度外'} / 被写体 ${r.actual.toFixed(2)}m / 合焦 ${r.focus.toFixed(2)}m / 許容 ${r.near.toFixed(2)}–${Number.isFinite(r.far)?r.far.toFixed(2):'∞'}m`;
 color.textContent='色分け: '+labels[r.classification]+(focusPointFrame===frame?'（実ボーン）':'（ガイド位置）');color.style.color={front:'#f08ad0',focus:'#75b8ff',within:'#77e0a8',back:'#ffb570'}[r.classification];result.style.color=r.inside?'#77e0a8':'#ffb570';window.dispatchEvent(new CustomEvent('bai-camera-focus-diagnostic',{detail:{enabled:true,classification:r.classification,point:r.point,focus:r.focus,frame,near:r.near,far:r.far}}));
 }catch(err){result.textContent='診断できません: '+err.message;color.textContent='色分け判定不能';color.style.color='';window.dispatchEvent(new CustomEvent('bai-camera-focus-diagnostic',{detail:{enabled:false}}));}}

$('vmd-inspect-button').onclick=async()=>{const result=$('vmd-inspect-result'),file=$('vmd-inspect-input').files[0];if(!file){result.textContent='VMDファイルを選択してください';return}if(file.size>32*1024*1024){result.textContent='32MB以下のファイルのみ対応';return}result.textContent='VMDを検査中…';try{const response=await fetch('/api/camera/vmd/inspect',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:await file.arrayBuffer()});const data=await response.json();if(!response.ok)throw Error(data.error||'HTTP '+response.status);result.textContent=`カメラキー ${data.camera_count} 件 / 範囲 ${data.first_camera_frame??'-'}〜${data.last_camera_frame??'-'} / 画角 ${data.fov_range?.join('〜')||'-'}°（読み取りのみ）`}catch(error){result.textContent='VMD検査失敗: '+error.message}};
let nativeVmdTrack=null;
// Experimental preview stays separate from editable project keys. Rate-limit async
// requests and drop stale responses when the user scrubs or changes the track.
let nativeLocalSampler=null;
const nativeFollow=$('vmd-follow-timeline'),nativeFollowStatus=$('vmd-timeline-status');
function cancelNativeFollow(){nativeFollowStatus.textContent='追従OFF';}
function requestNativeFrame(f){
 if(!nativeFollow.checked||!nativeLocalSampler)return;
 try{
  const pose=nativeLocalSampler.preview(Math.max(0,Math.round(f)));
  window.dispatchEvent(new CustomEvent('bai-camera-vmd-preview',{detail:{pose,frame:f}}));
  nativeFollowStatus.textContent=`試験VMDローカル追従: ${Math.round(f)}F（保存なし・互換性未検証）`;
 }catch(error){nativeFollow.checked=false;cancelNativeFollow();nativeFollowStatus.textContent='追従停止: '+error.message}
}
nativeFollow.onchange=()=>{cancelNativeFollow();if(nativeFollow.checked)requestNativeFrame(frame)};
window.addEventListener('bai-camera-frame',event=>requestNativeFrame(event.detail.frame));

$('vmd-native-import').onclick=async()=>{const el=$('vmd-native-input'),out=$('vmd-native-status'),file=el.files[0];cancelNativeFollow();nativeFollow.checked=false;nativeFollow.disabled=true;nativeVmdTrack=null;nativeLocalSampler=null;$('vmd-native-export').disabled=true;$('vmd-native-sample').disabled=true;$('vmd-preview-pose').disabled=true;if(!file){out.textContent='VMDファイルを選択してください';return}if(file.size>32*1024*1024){out.textContent='32MB以下にしてください';return}out.textContent='カメラデータを読み込み中…';try{const response=await fetch('/api/camera/vmd/native/import',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:await file.arrayBuffer()});const data=await response.json();if(!response.ok)throw Error(data.error||'HTTP '+response.status);nativeLocalSampler=window.BAIVmdLocal.createSampler(data);nativeVmdTrack=data;nativeFollow.disabled=false;$('vmd-native-export').disabled=false;$('vmd-native-sample').disabled=false;$('vmd-preview-pose').disabled=false;out.textContent=`ネイティブキー ${data.keys.length}件 / MMD座標 / 試験プレビュー追従は任意ON・原本非破壊`;}catch(error){out.textContent='VMD読込失敗: '+error.message}};
$('vmd-native-sample').onclick=async()=>{const out=$('vmd-native-sample-result');if(!nativeVmdTrack)return;const requested=Number($('vmd-native-frame').value);if(!Number.isInteger(requested)||requested<0||requested>4294967295){out.textContent='不正なフレーム番号';return}try{const response=await fetch('/api/camera/vmd/native/sample',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({track:nativeVmdTrack,frame:requested})});const data=await response.json();if(!response.ok)throw Error(data.error||'HTTP '+response.status);out.textContent='MMD座標の補間値（撮影カメラへは未適用）\n'+JSON.stringify(data,null,2)}catch(error){out.textContent='補間値取得失敗: '+error.message}};
$('vmd-preview-pose').onclick=async()=>{const out=$('vmd-native-sample-result');if(!nativeVmdTrack)return;const requested=Number($('vmd-native-frame').value);if(!Number.isInteger(requested)||requested<0||requested>4294967295){out.textContent='不正なフレーム番号';return}try{const response=await fetch('/api/camera/vmd/preview-pose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({track:nativeVmdTrack,frame:requested})});const data=await response.json();if(!response.ok)throw Error(data.error||'HTTP '+response.status);window.dispatchEvent(new CustomEvent('bai-camera-pose',{detail:{pose:data}}));out.textContent='試験表示のみ（MMD互換未検証・キー保存なし）\n'+JSON.stringify(data,null,2)}catch(error){out.textContent='試験表示失敗: '+error.message}};
$('vmd-native-export').onclick=async()=>{if(!nativeVmdTrack)return;const out=$('vmd-native-status');try{const response=await fetch('/api/camera/vmd/native/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(nativeVmdTrack)});if(!response.ok){const data=await response.json();throw Error(data.error||'HTTP '+response.status)}const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='bai-camera-native-roundtrip.vmd';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);out.textContent='VMD書き出し完了（MMDネイティブキー）'}catch(error){out.textContent='VMD書出失敗: '+error.message}};
$('focus-range-check').onclick=()=>{const result=$('focus-range-result');result.textContent='フレーム範囲を診断中…';
 try{const step=Math.max(1,Math.ceil((project.duration+1)/10000)),samples=[];
 for(let f=0;f<=project.duration;f+=step){let point=null;
  if($('focus-follow-bone').checked){let response=null;window.dispatchEvent(new CustomEvent('bai-camera-query-focus-target',{detail:{frame:f,resolve:value=>{response=value}}}));if(!response?.point)throw Error('実ボーンの評価に失敗しました。固定ガイドへ置換せず診断を中止します');point=response.point;}
  const override=point&&$('focus-follow-bone').checked?window.BAICameraFocusConsistency.diagnose({frame:f,pose:diagnosticCameraPose(f),lens:$('focus-lens').value,aperture:$('focus-aperture').value,focus:$('focus-distance').value,point}).actual:null;
  samples.push(focusDiagnosticAt(f,point,override));}
 const failures=samples.filter(x=>!x.inside),ranges=[];for(let i=0;i<failures.length;i++){const f=failures[i].frame;if(ranges.length&&f-failures[i-1]?.frame===step)ranges.at(-1)[1]=f;else ranges.push([f,f]);}
 result.textContent=`${samples.length}サンプル / 被写界深度外 ${failures.length}サンプル / 区間: ${ranges.slice(0,12).map(([a,b])=>a===b?a:a+'〜'+b).join(', ')||'なし'}（${$('focus-follow-bone').checked?'選択ボーン':'ガイド位置'}・同一光学計算・${step}フレーム間隔）`;
 }catch(err){result.textContent='診断エラー: '+err.message}};
for(const id of ['focus-lens','focus-aperture','focus-distance','focus-subject','focus-enabled'])$(id).addEventListener('change',drawFocusDiagnostic);
function draw(){if(project)drawFocusDiagnostic();if(project)window.dispatchEvent(new CustomEvent('bai-camera-pose',{detail:{pose:previewPose||effectivePose(frame)}}));const shell=document.querySelector('.preview-shell'),overlay=document.querySelector('.camera-frame');if(shell&&overlay){const width=Math.max(1,Math.min(shell.clientWidth*.90,shell.clientHeight*.84*16/9));overlay.style.width=width+'px';overlay.style.height=(width*9/16)+'px'}const cvs=$('preview'),r=cvs.getBoundingClientRect(),scale=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.floor(r.width*scale)),h=Math.max(1,Math.floor(r.height*scale));if(cvs.width!==w||cvs.height!==h){cvs.width=w;cvs.height=h}ctx.clearRect(0,0,w,h);ctx.fillStyle='#101b2c';ctx.fillRect(0,0,w,h);const p=previewPose||effectivePose(frame),eye=p.position,tar=p.target,front=norm(tar.map((v,i)=>v-eye[i]));let right=norm([front[2],0,-front[0]]);if(!right.some(v=>Math.abs(v)>.01))right=[1,0,0];const up=cross(right,front);const s=Math.min(w,h)*.85/Math.tan(p.fov*Math.PI/360);function point(v){const d=v.map((x,i)=>x-eye[i]),z=dot(d,front);if(z<=.03)return null;return [w/2+s*dot(d,right)/z,h/2-s*dot(d,up)/z]}
function line(a,b,col='#47617e'){const x=point(a),y=point(b);if(!x||!y)return;ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(...x);ctx.lineTo(...y);ctx.stroke()}
for(let i=-6;i<=6;i++){line([i,0,-6],[i,0,6]);line([-6,0,i],[6,0,i])}ctx.lineWidth=2;line([0,0,0],[0,2.3,0],'#f1b665');line([0,1.7,0],[-.7,1.15,0],'#f1b665');line([0,1.7,0],[.7,1.15,0],'#f1b665');line([0,1.2,0],[-.55,.2,0],'#f1b665');line([0,1.2,0],[.55,.2,0],'#f1b665');const head=point([0,2.45,0]);if(head){ctx.beginPath();ctx.arc(...head,Math.max(4,Math.min(45,s*.12/Math.max(1,Math.hypot(...eye)))),0,2*Math.PI);ctx.strokeStyle='#f1b665';ctx.stroke()}ctx.font=`${13*scale}px system-ui`;ctx.fillStyle='#aec7dc';ctx.fillText('撮影構図ガイド  |  FOV '+p.fov.toFixed(1)+'°',15*scale,25*scale);drawScene()}

function drawScene(){const canvas=$('scene'),c=canvas.getContext('2d'),r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}c.fillStyle='#101b2c';c.fillRect(0,0,w,h);const unit=Math.min(w,h)/16;function project3(v){const x=v[0]*Math.cos(sceneYaw)-v[2]*Math.sin(sceneYaw),z=v[0]*Math.sin(sceneYaw)+v[2]*Math.cos(sceneYaw);return [w/2+x*unit,h*.62+(z*Math.sin(scenePitch)-v[1]*Math.cos(scenePitch))*unit]}function line(a,b,color='#415d77',th=1){const x=project3(a),y=project3(b);c.strokeStyle=color;c.lineWidth=th*dpr;c.beginPath();c.moveTo(...x);c.lineTo(...y);c.stroke()}for(let i=-8;i<=8;i++){line([i,0,-8],[i,0,8]);line([-8,0,i],[8,0,i])}line([0,0,0],[2,0,0],'#dd7777',2);line([0,0,0],[0,2,0],'#7acf92',2);line([0,0,0],[0,0,2],'#7eb4e8',2);line([0,0,0],[0,2.2,0],'#edb765',3);line([0,1.7,0],[-.6,1.1,0],'#edb765',3);line([0,1.7,0],[.6,1.1,0],'#edb765',3);line([0,1.1,0],[-.4,.15,0],'#edb765',3);line([0,1.1,0],[.4,.15,0],'#edb765',3);const p=previewPose||sample(frame),eye=p.position,tar=p.target;line(eye,tar,'#f5d476',2);const cp=project3(eye),tp=project3(tar);c.fillStyle='#ebbd52';c.beginPath();c.arc(...cp,6*dpr,0,Math.PI*2);c.fill();c.fillStyle='#e9f3fa';c.font=`${12*dpr}px system-ui`;c.fillText('CAM',cp[0]+8*dpr,cp[1]-8*dpr);c.fillText('TARGET',tp[0]+5*dpr,tp[1]+14*dpr);for(let i=1;i<project.keys.length;i++){line(project.keys[i-1].position,project.keys[i].position,'#72caf8',2)}c.fillStyle='#a9c4d9';c.fillText('ガイドモデル（実3D未接続）',12*dpr,h-12*dpr)}
let sceneDrag=null;$('scene').addEventListener('pointerdown',e=>{if(e.button!==2&&e.button!==0)return;sceneDrag={x:e.clientX,y:e.clientY,yaw:sceneYaw,pitch:scenePitch};e.currentTarget.setPointerCapture(e.pointerId)});$('scene').addEventListener('pointermove',e=>{if(!sceneDrag)return;sceneYaw=sceneDrag.yaw+(e.clientX-sceneDrag.x)*.008;scenePitch=Math.max(.12,Math.min(1.45,sceneDrag.pitch+(e.clientY-sceneDrag.y)*.005));drawScene()});$('scene').addEventListener('pointerup',()=>sceneDrag=null);$('scene').addEventListener('pointercancel',()=>sceneDrag=null);$('scene').addEventListener('contextmenu',e=>e.preventDefault());$('scene-reset').onclick=()=>{sceneYaw=.6;scenePitch=.37;drawScene()};$('scene-focus').onclick=()=>{sceneYaw=.6;scenePitch=.6;drawScene()};
function dot(a,b){return a.reduce((s,n,i)=>s+n*b[i],0)}function norm(a){const len=Math.hypot(...a);return len?a.map(x=>x/len):[0,0,0]}function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]]}
for(const part of ['position','target'])for(let i=0;i<3;i++){const label=document.createElement('label');label.textContent='XYZ'[i];const el=document.createElement('input');el.type='number';el.step='.1';el.id=part+i;label.append(el);$(part+'-fields').append(label)}
$('frame').oninput=e=>setFrame(+e.target.value);$('frame-number').onchange=e=>setFrame(+e.target.value);$('prev').onclick=()=>setFrame(frame-1);$('next').onclick=()=>setFrame(frame+1);$('add').onclick=()=>{try{writeKey(sample(frame))}catch(e){status(e.message)}};$('key-save').onclick=()=>{try{writeKey(inputPose())}catch(e){status(e.message)}};$('remove').onclick=()=>{if(selected===null)return;const k=project.keys.findIndex(x=>x.frame===selected);if(k<0)return;project.keys.splice(k,1);checkpoint();selected=null;setFrame(frame)};
function moveCamera(p,operation,amount){if(!Number.isFinite(amount)||Math.abs(amount)>360)throw Error('操作量は-360～360');const eye=[...p.position],tar=[...p.target],d=eye.map((x,i)=>x-tar[i]),radius=Math.hypot(...d);if(radius<.0001)throw Error('注視点と位置を離してください');const front=d.map(x=>-x/radius);let right=[front[2],0,-front[0]];right=norm(right);if(Math.hypot(...right)<.01)right=[1,0,0];const rot=(v,axis,a)=>{const c=Math.cos(a),sn=Math.sin(a),dt=dot(v,axis),cr=cross(axis,v);return v.map((x,i)=>c*x+sn*cr[i]+(1-c)*dt*axis[i])};let pos=eye,target=tar;switch(operation){case'orbit':pos=rot(d,[0,1,0],amount*Math.PI/180).map((x,i)=>tar[i]+x);break;case'dolly':if(radius-amount<=.05)throw Error('注視点を通過できません');pos=eye.map((x,i)=>x+front[i]*amount);break;case'pan':pos=eye.map((x,i)=>x+right[i]*amount);target=tar.map((x,i)=>x+right[i]*amount);break;case'tilt':target=rot(front.map(x=>x*radius),right,amount*Math.PI/180).map((x,i)=>eye[i]+x);break;default:throw Error('不明なカメラ操作')}return {position:pos,target,fov:p.fov}}
document.querySelectorAll('[data-camera-move]').forEach(b=>b.onclick=()=>{try{commitPose(moveCamera(previewPose||sample(frame),b.dataset.cameraMove,Number($('move-amount').value)));status(b.textContent+($('auto-key').checked?'のキーを登録しました（未保存）':'の構図を調整しました（キー未登録）'))}catch(e){status(e.message)}});
$('interpolation').addEventListener('change',()=>{if(!project.keys.some(k=>k.frame===frame)){status('先に現在のフレームをキーとして保存してください');return}try{writeKey(inputPose())}catch(e){status(e.message)}});
function rigVector(id){const v=$(id).value.split(',').map(n=>Number(n.trim()));if(v.length!==3||!v.every(Number.isFinite))throw Error('座標はX,Y,Zの3数値で指定してください');return v}
$('rig-apply').onclick=()=>{try{const base=previewPose||sample(frame),type=$('rig-type').value,amount=Number($('rig-amount').value),start=rigVector('rig-start'),end=rigVector('rig-end');if(!Number.isFinite(amount))throw Error('操作量は数値で指定してください');const rig=window.BAICameraRig;let p;if(type==='orbit')p=rig.orbit(base,{center:start,azimuth:amount});else if(type==='crane')p=rig.crane(base,{pivot:start,angle:amount});else if(type==='parent')p=rig.parentTransform(base,{pivot:start,translation:end,yaw:amount});else if(type==='rail')p=rig.rail(base,{start,end,t:amount});else if(type==='curve')p=rig.curvedRail(base,{start,control:rigVector('rig-control'),end,t:amount,constantSpeed:$('rig-constant-speed').checked});else if(type==='follow')p=rig.follow(base,{subject:end});else throw Error('不明なリグ');commitPose(p);$('rig-status').textContent=type+' 適用（'+($('auto-key').checked?'キー登録':'プレビューのみ')+'）'}catch(e){$('rig-status').textContent='エラー: '+e.message}};
window.addEventListener('bai-camera-query-pose',event=>{if(project&&Number.isInteger(event.detail?.frame)&&typeof event.detail.resolve==='function')event.detail.resolve(sample(event.detail.frame))});
window.addEventListener('bai-camera-follow-bake',event=>{
 const report=$('camera-follow-bake-status');
 try{
  if(!project)throw Error('プロジェクトが未読込です');
  const {positions,offset,basePose}=event.detail||{};
  if(!Array.isArray(positions)||positions.length<2||positions.length>2000||!Array.isArray(offset)||offset.length!==3||!offset.every(Number.isFinite))throw Error('追従サンプルが不正です');
  if(!basePose||!Array.isArray(basePose.position)||!Array.isArray(basePose.target))throw Error('開始構図が不正です');
  const frames=positions.map(p=>p.frame);
  if(frames.some((f,i)=>!Number.isInteger(f)||f<0||f>project.duration||(i>0&&f<=frames[i-1])))throw Error('生成範囲が不正です');
  if(project.keys.some(k=>k.frame>=frames[0]&&k.frame<=frames.at(-1)))throw Error('区間に既存キーがあります。上書きせず中止しました');
  const delta=basePose.position.map((x,i)=>x-basePose.target[i]);
  const keys=positions.map(({frame,target})=>{
   if(!Array.isArray(target)||target.length!==3||!target.every(Number.isFinite))throw Error('ボーン位置が不正です');
   return {frame,target:[...target],position:target.map((x,i)=>x+delta[i]+offset[i]),fov:basePose.fov,interpolation:'linear'};
  });
  project.keys.push(...keys);project.keys.sort((a,b)=>a.frame-b.frame);selected=keys[0].frame;checkpoint();updateRangeControls();setFrame(selected);
  report.textContent=`追従${keys.length}キー生成（未保存・Undoで一括取消）`;
 }catch(err){report.textContent='生成失敗: '+err.message}
});
$('rig-bake').onclick=()=>{try{
 const from=Number($('rig-bake-from').value),to=Number($('rig-bake-to').value),step=Number($('rig-bake-step').value);
 if(!Number.isInteger(from)||!Number.isInteger(to)||to>project.duration)throw Error('区間を総フレーム内で指定してください');
 const collisions=project.keys.filter(k=>k.frame>=from&&k.frame<=to);
 if(collisions.length)throw Error(`範囲内に既存キーが${collisions.length}個あります。上書きを避けるため中止しました`);
 const start=rigVector('rig-start'),end=rigVector('rig-end');
 const keys=window.BAICameraRig.bake(sample(from),{type:$('rig-type').value,from,to,step,start,end,control:rigVector('rig-control'),amount:Number($('rig-amount').value),craneFromAngle:Number($('rig-crane-from').value),easing:$('rig-bake-ease').value,constantSpeed:$('rig-constant-speed').checked});
 // One edit = one undo checkpoint. Do not rewrite imported VMD data.
 project.keys.push(...keys);project.keys.sort((a,b)=>a.frame-b.frame);selected=from;checkpoint();updateRangeControls();setFrame(from);
 $('rig-bake-status').textContent=`${keys.length}キーを作成しました（未保存）。Undoで一括取消できます`;
 }catch(e){$('rig-bake-status').textContent='エラー: '+e.message}
};
// Persist rig controls inside the canonical camera project; config edits are undoable.
const rigFields=['rig-type','rig-amount','rig-start','rig-control','rig-end','rig-constant-speed','rig-show-path','rig-bake-from','rig-bake-to','rig-bake-step','rig-bake-ease','rig-crane-from'];
function collectRig(){return {type:$('rig-type').value,amount:Number($('rig-amount').value),start:rigVector('rig-start'),control:rigVector('rig-control'),end:rigVector('rig-end'),constant_speed:$('rig-constant-speed').checked,show_path:$('rig-show-path').checked,bake_from:Number($('rig-bake-from').value),bake_to:Number($('rig-bake-to').value),bake_step:Number($('rig-bake-step').value),bake_ease:$('rig-bake-ease').value,crane_from_angle:Number($('rig-crane-from').value)}}
function restoreRig(){if(!project?.rig)return;const r=project.rig;for(const [id,key] of [['rig-type','type'],['rig-amount','amount'],['rig-start','start'],['rig-control','control'],['rig-end','end'],['rig-bake-from','bake_from'],['rig-bake-to','bake_to'],['rig-bake-step','bake_step'],['rig-bake-ease','bake_ease'],['rig-crane-from','crane_from_angle']])$(id).value=Array.isArray(r[key])?r[key].join(','):(r[key]??(key==='crane_from_angle'?0:''));$('rig-constant-speed').checked=r.constant_speed;$('rig-show-path').checked=r.show_path;notifyRailPath()}
function saveRigEdit(){if(!project)return;try{const next=collectRig();if(JSON.stringify(next)===JSON.stringify(project.rig))return;project.rig=next;checkpoint();status('リグ設定に未保存の変更があります')}catch(e){$('rig-status').textContent='設定エラー: '+e.message}}
for(const id of rigFields)$(id).addEventListener('change',saveRigEdit);
// A separate visualization event; invalid numeric edits hide the path rather than crashing the workspace.
function notifyRailPath(){try{const parse=id=>rigVector(id);window.dispatchEvent(new CustomEvent('bai-camera-rail-path',{detail:{visible:$('rig-show-path').checked&&$('rig-type').value==='curve',start:parse('rig-start'),control:parse('rig-control'),end:parse('rig-end')}}))}catch(_){window.dispatchEvent(new CustomEvent('bai-camera-rail-path',{detail:{visible:false}}))}}
for(const id of ['rig-type','rig-start','rig-control','rig-end','rig-show-path'])$(id).addEventListener('input',notifyRailPath);
notifyRailPath();window.addEventListener('bai-camera-rail-ready',notifyRailPath);
// Rail handles edit rig configuration only; no camera key is written during dragging.
const railInputIds={start:'rig-start',control:'rig-control',end:'rig-end'};
window.addEventListener('bai-camera-rail-handle-preview',event=>{
 const d=event.detail,id=railInputIds[d?.name];if(!id||!Array.isArray(d.position))return;
 $(id).value=d.position.map(v=>Number(v.toFixed(4))).join(',');notifyRailPath();
});
window.addEventListener('bai-camera-rail-handle-end',event=>{
 const d=event.detail,id=railInputIds[d?.name];if(!id||!Array.isArray(d.position))return;
 $(id).value=d.position.map(v=>Number(v.toFixed(4))).join(',');notifyRailPath();
 if(d.commit)saveRigEdit();else restoreRig();
});

$('preset-apply').onclick=()=>{try{commitPose(clone(presets[$('preset').value]))}catch(e){status(e.message)}};
// Owner-approved user-defined camera shots live in the project JSON, not browser-only storage.
function renderCustomPresets(){renderSequence();const sel=$('custom-preset-list'),current=sel.value;sel.replaceChildren();sel.add(new Option('選択してください',''));for(const item of project?.custom_presets||[])sel.add(new Option(item.name,item.name));if([...sel.options].some(o=>o.value===current))sel.value=current;}
function customPresetError(e){$('custom-preset-status').textContent='エラー: '+e.message;}
$('custom-preset-save').onclick=()=>{try{if(!project)throw Error('プロジェクト未読込');const name=$('custom-preset-name').value.trim();if(!name||name.length>48)throw Error('名前は1〜48文字');const list=project.custom_presets||[],pose=clone(previewPose||inputPose());if(!Number.isFinite(pose.fov)||pose.fov<5||pose.fov>150||!pose.position.concat(pose.target).every(Number.isFinite)||Math.hypot(...pose.position.map((v,i)=>v-pose.target[i]))<.0001)throw Error('構図が不正です');if(list.some(p=>p.name===name))throw Error('同名の登録があります');if(list.length>=64)throw Error('登録数は64件まで');project.custom_presets=[...list,{name,pose}];checkpoint();renderCustomPresets();$('custom-preset-list').value=name;$('custom-preset-status').textContent='登録しました（プロジェクト保存が必要）';}catch(e){customPresetError(e)}};
$('custom-preset-apply').onclick=()=>{try{const name=$('custom-preset-list').value,item=(project?.custom_presets||[]).find(p=>p.name===name);if(!item)throw Error('登録を選択してください');commitPose(clone(item.pose));$('custom-preset-status').textContent='構図を適用しました';}catch(e){customPresetError(e)}};
// CAM-015: edit the approved, persisted cut decision list; do not modify camera keys.
function renderSequence(){
 const sel=$('sequence-list'),current=sel.value;sel.replaceChildren();
 const names=$('sequence-preset'),picked=names.value;names.replaceChildren();names.add(new Option('選択してください',''));
 for(const item of project?.custom_presets||[])names.add(new Option(item.name,item.name));
 if([...names.options].some(o=>o.value===picked))names.value=picked;
 (project?.sequence||[]).forEach((cut,i)=>sel.add(new Option(`${cut.start}–${cut.end}: ${cut.preset} [CUT]`,String(i))));
 if([...sel.options].some(o=>o.value===current))sel.value=current;
}
function validCutInput(){
 if(!project)throw Error('プロジェクト未読込');
 const start=Number($('sequence-start').value),end=Number($('sequence-end').value),preset=$('sequence-preset').value;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>project.duration)throw Error('開始・終了フレームが不正です');
 if(!(project.custom_presets||[]).some(p=>p.name===preset))throw Error('登録済みショットを選んでください');
 const current=project.sequence||[];
 if(current.length>=256)throw Error('最大256区間です');
 if(current.some(c=>start<c.end&&end>c.start))throw Error('既存区間と重複しています');
 return {start,end,preset,transition:'cut'};
}
$('sequence-add').onclick=()=>{try{const cut=validCutInput();project.sequence=[...(project.sequence||[]),cut].sort((a,b)=>a.start-b.start);checkpoint();renderSequence();setFrame(frame);$('sequence-status').textContent='区間を追加しました（未保存）';}catch(e){$('sequence-status').textContent='エラー: '+e.message}};
$('sequence-delete').onclick=()=>{try{const i=Number($('sequence-list').value);if(!Number.isInteger(i)||i<0||i>=(project?.sequence||[]).length)throw Error('削除する区間を選択してください');project.sequence=project.sequence.filter((_,j)=>i!==j);checkpoint();renderSequence();setFrame(frame);$('sequence-status').textContent='区間を削除しました（未保存）';}catch(e){$('sequence-status').textContent='エラー: '+e.message}};
$('sequence-jump').onclick=()=>{const i=Number($('sequence-list').value),cut=project?.sequence?.[i];if(!cut){$('sequence-status').textContent='区間を選択してください';return}setFrame(cut.start);$('sequence-status').textContent=`${cut.start}フレームへ移動しました`};
$('custom-preset-delete').onclick=()=>{try{const name=$('custom-preset-list').value;if(!name||!(project?.custom_presets||[]).some(p=>p.name===name))throw Error('登録を選択してください');if((project.sequence||[]).some(c=>c.preset===name))throw Error('カット区間で使用中です。先に該当区間を削除してください');project.custom_presets=project.custom_presets.filter(p=>p.name!==name);checkpoint();renderCustomPresets();$('custom-preset-status').textContent='削除しました（プロジェクト保存が必要）';}catch(e){customPresetError(e)}};

$('undo').onclick=()=>{if(cursor<=0)return;cursor--;project=clone(history[cursor]);$('duration').value=project.duration;$('frame').max=project.duration;$('frame-number').max=project.duration;updateRangeControls();restoreRig();renderCustomPresets();setFrame(frame);status('元に戻しました（未保存）')};$('redo').onclick=()=>{if(cursor>=history.length-1)return;cursor++;project=clone(history[cursor]);$('duration').value=project.duration;$('frame').max=project.duration;$('frame-number').max=project.duration;updateRangeControls();restoreRig();renderCustomPresets();setFrame(frame);status('やり直しました（未保存）')};
// Phase E: explicit, validated project-bundle UI bridge. No implicit write on load.
window.addEventListener('bai-camera-bundle-snapshot',event=>{if(project&&typeof event.detail?.resolve==='function')event.detail.resolve(clone(project))});
window.addEventListener('bai-camera-bundle-restore',event=>{try{const next=event.detail?.project;if(!next||!Array.isArray(next.keys)||!Number.isInteger(next.duration)||next.duration<1)throw Error('カメラ状態が不正です');if(dirty&&!event.detail?.confirmed)throw Error('未保存のカメラ編集があります');playing=false;cancelAnimationFrame(raf);$('play').textContent='▶ 再生';project=clone(next);history=[clone(project)];cursor=0;dirty=false;previewPose=null;selected=null;$('duration').value=project.duration;$('frame').max=project.duration;$('frame-number').max=project.duration;rangeSize=Math.min(300,project.duration);rangeStart=0;updateRangeControls();restoreRig();renderCustomPresets();setFrame(Math.min(event.detail?.frame??0,project.duration));window.dispatchEvent(new CustomEvent('bai-camera-project-loaded',{detail:{project}}));event.detail?.resolve?.(true);status('統合プロジェクトを再読み込みしました')}catch(error){event.detail?.reject?.(error)}});
$('save').onclick=async()=>{try{window.dispatchEvent(new CustomEvent('bai-camera-before-save',{detail:{project}}));const r=await fetch('/api/camera/project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(project)});const j=await r.json();if(!r.ok)throw Error(j.error);dirty=false;status('保存しました')}catch(e){status('保存失敗: '+e.message)}};
$('copy').onclick=()=>{const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bai-camera-project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'■ 停止':'▶ 再生';lastTime=0;playhead=frame;if(playing)raf=requestAnimationFrame(tick);else cancelAnimationFrame(raf)};function tick(t){if(!playing)return;if(lastTime)playhead+=Math.min(250,t-lastTime)*project.fps/1000;lastTime=t;setFrame(playhead);if(frame>=project.duration){playing=false;$('play').textContent='▶ 再生';return}raf=requestAnimationFrame(tick)}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});window.addEventListener('resize',()=>{if(project)draw()});if(typeof ResizeObserver!=='undefined'){new ResizeObserver(()=>{if(project)draw()}).observe(document.querySelector('.dual-views'))};
// Approved lens presets: convert 35mm full-frame focal length to vertical FOV.
$('lens-apply').addEventListener('click',()=>{try{
 if(!project)throw Error('プロジェクトを読み込んでください');
 const preset=window.BAICameraLens.presets[$('lens-preset').value];
 if(!preset)throw Error('レンズ設定が見つかりません');
 const fov=window.BAICameraLens.focalToVerticalFov(preset.mm);
 $('focus-lens').value=preset.mm;$('focus-aperture').value=preset.aperture;
 commitPose({...clone(previewPose||sample(frame)),fov});
 drawFocusDiagnostic();
 $('lens-result').textContent=`${preset.mm}mm / f${preset.aperture} / 垂直画角 ${fov.toFixed(2)}°（実ボケは未対応）`;
 }catch(e){$('lens-result').textContent='エラー: '+e.message}
});
fetch('/api/camera/project').then(r=>r.json()).then(p=>{project=p;history=[clone(project)];cursor=0;$('frame').max=project.duration;$('frame-number').max=project.duration;$('duration').value=project.duration;rangeSize=Math.min(300,project.duration);updateRangeControls();restoreRig();setFrame(0);window.dispatchEvent(new CustomEvent('bai-camera-project-loaded',{detail:{project}}));status('カメラ編集を開始できます（AI不要）')}).catch(e=>status('読み込みエラー: '+e.message));
})();
