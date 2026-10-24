import {createSpatialEditor} from './spatial-ui-v61.js';
import {createPmxBonePicker} from './pmx-bone-picker-v110.js';
import {createPmxFkRotate} from './pmx-fk-rotate-v111.js';
import {listPmxIkTargets} from './pmx-ik-targets-v114.js';
/* v58 - real multi-instance Three.js preview.
 * Uses a single viewport renderer and physically separate loaded objects
 * (including skeletons) per scene instance. Animation wiring is stage 59.
 */
import {loadLibs,loadModel,disposeObject} from '../../js/viewport/model-loader.js';
import {normalizeModel} from '../../js/viewport/normalize.fork.js';
import {createViewport} from '../../js/viewport/three-host.js';
import {createGenericGlbPreview} from '../../js/motion/generic-glb-preview.js';
import {createPmxGlbPreview} from '../../js/motion/pmx-glb-preview.js';
import {createPmxVmdPreview} from '../../js/motion/pmx-vmd-preview.js';
import {loadVmdClip,vmdUrl} from '../../js/motion/vmd.js';
import {validatePmxVmdCandidate} from './pmx-vmd-candidate-validation-v120.js';
import {morphValues,resetMorphs,applyFaceKeys} from './pmx-face-keys-v96.js';

const project=document.getElementById('v06project');
// A separate, short-lived headless page uses this mode for exact saved frames.
// It never writes the edit playhead or scene data.
const captureMode=new URLSearchParams(location.search).get('scene_capture')==='1';
let locale={};
const tr=(key)=>locale[key]||({
  title:'複数モデルの3D表示',renderingNote:'同じ3D空間で別々のモデルを表示します（実GPU動作は未検証）。',
  select:'表示対象モデル',refresh:'配置を再読み込み',focus:'選択モデルに注目',
  saveCamera:'この視点を保存',restoreCamera:'保存視点に戻す',close:'閉じる',
  choose:'モデルを選択',loadedCount:'読込モデル',problems:'問題',chooseProject:'作品を選んでください',
  loading:'3Dモデルを読み込み中…',loadFailed:'読み込み失敗',runtimeError:'描画できません',mismatch:'作品が一致しません'
})[key]||key;
const section=document.getElementById('v57-scene-instances');
let controller=null,viewport=null,motionCoordinator=null,motionPlan=null,opened=false,composite=false,reloadReady=false,nonce=0,selectedId='';
let spatialEditor=null,bonePicker=null,rotateGizmo=null,sceneSnapshot=null,motionEdits=null,projectFps=60,previewFk=null,activePole=null;
let vmdCandidate=null,candidateValidation=null;
const panel=document.createElement('section');
panel.id='v58-multi-preview';
panel.hidden=true;
panel.style.cssText='position:fixed;inset:9% 8%;z-index:1100;background:#172231;border:1px solid #6584a0;border-radius:11px;padding:12px;box-shadow:0 20px 80px #000d;display:flex;flex-direction:column;gap:8px;';
panel.setAttribute('aria-label','複数モデル3Dプレビュー');
const heading=document.createElement('div');
heading.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
const title=document.createElement('strong');title.textContent=tr('title');
const choose=document.createElement('select');choose.setAttribute('aria-label',tr('select'));
const refreshBtn=document.createElement('button');refreshBtn.textContent=tr('refresh');
const focusBtn=document.createElement('button');focusBtn.textContent=tr('focus');
const saveCameraBtn=document.createElement('button');saveCameraBtn.type='button';saveCameraBtn.textContent=tr('saveCamera');
const restoreCameraBtn=document.createElement('button');restoreCameraBtn.type='button';restoreCameraBtn.textContent=tr('restoreCamera');
saveCameraBtn.id='v58-save-camera';restoreCameraBtn.id='v58-restore-camera';
const modeBtn=document.createElement('button');modeBtn.type='button';modeBtn.textContent='同じ画面に重ねる';
const closeBtn=document.createElement('button');closeBtn.textContent=tr('close');
const progress=document.createElement('span');progress.setAttribute('role','status');progress.style.cssText='color:#c8d9ea';
const cameraStatus=document.createElement('small');cameraStatus.setAttribute('role','status');
const clipSelect=document.createElement('select');clipSelect.setAttribute('aria-label','モーション');
const targetSelect=document.createElement('select');targetSelect.setAttribute('aria-label','適用するモデル');
const assignBtn=document.createElement('button');assignBtn.type='button';
const seekInput=document.createElement('input');seekInput.type='number';seekInput.min='0';seekInput.step='0.03333';seekInput.value='0';seekInput.style.width='75px';
seekInput.id='v58-motion-seek';
const seekBtn=document.createElement('button');seekBtn.type='button';
const motionStatus=document.createElement('span');motionStatus.setAttribute('role','status');
const faceControls=document.createElement('div');faceControls.id='v96-face-controls';
faceControls.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap;border-top:1px solid #435a73;padding-top:6px';
const footControls=document.createElement('details');footControls.id='v105-foot-qa';
footControls.style.cssText='border-top:1px solid #435a73;padding-top:4px';
const footSummary=document.createElement('summary');footSummary.textContent='実動作の足接地を診断（読み取りのみ）';
const footGround=document.createElement('input');footGround.id='v105-ground-y';
footGround.type='number';footGround.step='0.01';footGround.value='0';footGround.style.width='75px';
footGround.setAttribute('aria-label','床のY座標（シーン単位）');
const footRun=document.createElement('button');footRun.id='v105-foot-run';footRun.type='button';
footRun.textContent='現在位置から2秒を診断';
const footStatus=document.createElement('span');footStatus.id='v105-foot-status';
footStatus.setAttribute('role','status');
footStatus.style.display='block';
const footDetails=document.createElement('pre');footDetails.id='v105-foot-details';
footDetails.style.cssText='white-space:pre-wrap;max-height:160px;overflow:auto;font-size:11px';
footControls.append(footSummary,document.createTextNode('床のY '),footGround,footRun,
  document.createTextNode(' 左右のつま先骨を測定。足裏の形状・接触力・IKは評価しません。'),footStatus,footDetails);
const fkControls=document.createElement('details');fkControls.id='v106-fk-edit';
fkControls.style.cssText='border-top:1px solid #435a73;padding-top:4px';
const fkSummary=document.createElement('summary');fkSummary.textContent='リグ：PMX骨の回転・位置補正（IKターゲット含む）';
const fkRow=document.createElement('div');fkRow.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 0';
const fkContext=document.createElement('small');fkContext.id='v106-fk-context';
fkContext.style.cssText='display:block;color:#c8d9ea';
const ikRow=document.createElement('div');ikRow.id='v114-ik-targets';
ikRow.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 0';
const ikSelect=document.createElement('select');ikSelect.id='v114-ik-select';
ikSelect.setAttribute('aria-label','PMXのIKターゲット骨');
const ikChoose=document.createElement('button');ikChoose.type='button';ikChoose.id='v114-ik-choose';
ikChoose.textContent='IK骨を選択';
const poleChoose=document.createElement('button');poleChoose.type='button';poleChoose.id='v128-knee-pole-choose';
poleChoose.textContent='膝方向を編集';
const ikStatus=document.createElement('small');ikStatus.id='v114-ik-status';ikStatus.setAttribute('role','status');
ikRow.append(document.createTextNode('PMX IK '),ikSelect,ikChoose,poleChoose,ikStatus);
const limbRow=document.createElement('div');limbRow.id='v123-limb-mode';
limbRow.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 0';
const limbSelect=document.createElement('select');limbSelect.id='v123-limb';
limbSelect.setAttribute('aria-label','FK/IKを切り替える部位');
for(const [value,label] of [['left_arm','左腕'],['right_arm','右腕'],
  ['left_leg','左脚'],['right_leg','右脚']])limbSelect.add(new Option(label,value));
limbSelect.value='left_leg';
const limbMode=document.createElement('select');limbMode.id='v123-limb-mode-select';
limbMode.setAttribute('aria-label','部位の編集方法');
limbMode.add(new Option('FK','FK'));limbMode.add(new Option('IK','IK'));
const limbSave=document.createElement('button');limbSave.type='button';limbSave.id='v123-limb-mode-save';
limbSave.textContent='編集方法を切替';
const limbStatus=document.createElement('small');limbStatus.id='v123-limb-mode-status';
limbStatus.setAttribute('role','status');
limbRow.append(document.createTextNode('部位 '),limbSelect,limbMode,limbSave,limbStatus);
const fkBone=document.createElement('select');fkBone.id='v106-fk-bone';fkBone.setAttribute('aria-label','補正するPMX骨');
const fkFrame=document.createElement('input');fkFrame.id='v106-fk-frame';fkFrame.type='number';
fkFrame.min='0';fkFrame.step='1';fkFrame.value='0';fkFrame.style.width='78px';
fkFrame.setAttribute('aria-label','作品フレーム');
const fkHere=document.createElement('button');fkHere.type='button';fkHere.textContent='現在位置のF';
const fkAxes=['X','Y','Z'].map(axis=>{
  const input=document.createElement('input');input.type='number';input.id='v106-fk-'+axis.toLowerCase();
  input.step='1';input.min='-180';input.max='180';input.value='0';input.style.width='64px';
  input.setAttribute('aria-label',`元VMDからの${axis}回転差分（度）`);return input;
});
const fkPosition=['X','Y','Z'].map(axis=>{
  const input=document.createElement('input');input.type='number';input.id='v112-fk-position-'+axis.toLowerCase();
  input.step='0.01';input.value='0';input.style.width='72px';
  input.setAttribute('aria-label',`元VMDからの${axis}位置差分（モデル単位）`);return input;
});
const fkPreview=document.createElement('button');fkPreview.type='button';fkPreview.id='v106-fk-preview';fkPreview.textContent='仮プレビュー';
const fkSave=document.createElement('button');fkSave.type='button';fkSave.id='v106-fk-save';fkSave.textContent='このFをキー化';
const fkCancel=document.createElement('button');fkCancel.type='button';fkCancel.id='v106-fk-cancel';fkCancel.textContent='仮補正を破棄';
const fkUndo=document.createElement('button');fkUndo.type='button';fkUndo.id='v106-fk-undo';fkUndo.textContent='戻す';
const fkRedo=document.createElement('button');fkRedo.type='button';fkRedo.id='v106-fk-redo';fkRedo.textContent='やり直す';
const fkSaved=document.createElement('select');fkSaved.id='v106-fk-saved';fkSaved.setAttribute('aria-label','保存済みFKキー');
const fkRemove=document.createElement('button');fkRemove.type='button';fkRemove.id='v106-fk-remove';fkRemove.textContent='選択キーを削除';
const fkStatus=document.createElement('span');fkStatus.id='v106-fk-status';fkStatus.setAttribute('role','status');
fkStatus.style.cssText='display:block;color:#c8d9ea';
const fkLayerRow=document.createElement('div');fkLayerRow.id='v106-fk-layer';
fkLayerRow.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 0';
const fkWeight=document.createElement('input');fkWeight.id='v106-fk-weight';fkWeight.type='number';fkWeight.min='0';fkWeight.max='100';fkWeight.step='1';fkWeight.value='100';fkWeight.style.width='65px';
const fkStart=document.createElement('input');fkStart.id='v106-fk-start';fkStart.type='number';fkStart.step='1';fkStart.style.width='78px';
const fkEnd=document.createElement('input');fkEnd.id='v106-fk-end';fkEnd.type='number';fkEnd.step='1';fkEnd.style.width='78px';
const fkFadeIn=document.createElement('input');fkFadeIn.id='v106-fk-fade-in';fkFadeIn.type='number';fkFadeIn.min='0';fkFadeIn.step='1';fkFadeIn.style.width='65px';
const fkFadeOut=document.createElement('input');fkFadeOut.id='v106-fk-fade-out';fkFadeOut.type='number';fkFadeOut.min='0';fkFadeOut.step='1';fkFadeOut.style.width='65px';
const fkMuted=document.createElement('input');fkMuted.id='v106-fk-muted';fkMuted.type='checkbox';
const fkLayerSave=document.createElement('button');fkLayerSave.id='v106-fk-layer-save';fkLayerSave.type='button';fkLayerSave.textContent='レイヤーを保存';
const fkCandidateRow=document.createElement('div');fkCandidateRow.id='v116-vmd-candidate';
fkCandidateRow.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 0';
const fkCandidate=document.createElement('button');fkCandidate.id='v116-vmd-candidate-create';
fkCandidate.type='button';fkCandidate.textContent='一定補正の別名VMD候補を作成';
const fkCandidateLink=document.createElement('a');fkCandidateLink.id='v116-vmd-candidate-download';
fkCandidateLink.textContent='検証前の候補をダウンロード';fkCandidateLink.hidden=true;
const fkCandidateStatus=document.createElement('small');fkCandidateStatus.id='v116-vmd-candidate-status';
fkCandidateStatus.setAttribute('role','status');
fkCandidateStatus.textContent='保存済み補正から候補を作成し、実PMXで全フレーム検査できます。';
const fkValidate=document.createElement('button');fkValidate.id='v120-vmd-candidate-validate';
fkValidate.type='button';fkValidate.textContent='実PMXで全骨・全Fを検査';fkValidate.disabled=true;
fkCandidateRow.append(fkCandidate,fkCandidateLink,fkValidate,fkCandidateStatus);
fkLayerRow.append(document.createTextNode('重み % '),fkWeight,document.createTextNode('区間 F '),fkStart,
  document.createTextNode('〜'),fkEnd,document.createTextNode('前なじませ F '),fkFadeIn,
  document.createTextNode('後なじませ F '),fkFadeOut,document.createTextNode('ミュート '),fkMuted,fkLayerSave);
fkRow.append(document.createTextNode('骨 '),fkBone,document.createTextNode('F '),fkFrame,fkHere,
  ...fkAxes.flatMap((input,index)=>[document.createTextNode(`${['X','Y','Z'][index]}° `),input]),
  ...fkPosition.flatMap((input,index)=>[document.createTextNode(`${['X','Y','Z'][index]}位置 `),input]),
  fkPreview,fkSave,fkCancel,fkUndo,fkRedo,fkSaved,fkRemove);
fkControls.append(fkSummary,fkContext,limbRow,ikRow,fkRow,fkLayerRow,fkCandidateRow,fkStatus);
const faceLabel=document.createElement('strong');faceLabel.textContent='PMX表情・口';
const faceName=document.createElement('select');faceName.id='v96-face-name';faceName.setAttribute('aria-label','実PMXのモーフ名');
const faceTrack=document.createElement('select');faceTrack.id='v98-face-track';
faceTrack.setAttribute('aria-label','保存先の表情・口行');
faceTrack.add(new Option('表情行','expression'));faceTrack.add(new Option('口行','lip'));
const faceTime=document.createElement('input');faceTime.id='v96-face-time';faceTime.type='number';
faceTime.min='0';faceTime.max='86400';faceTime.step='0.001';faceTime.value='0';faceTime.style.width='82px';
faceTime.setAttribute('aria-label','表情キーの時刻（秒）');
const faceUseSeek=document.createElement('button');faceUseSeek.type='button';faceUseSeek.textContent='現在のシーク位置';
const faceValue=document.createElement('input');faceValue.id='v96-face-value';faceValue.type='range';
faceValue.min='0';faceValue.max='1';faceValue.step='0.01';faceValue.value='0';faceValue.setAttribute('aria-label','表情モーフの強さ');
const faceValueText=document.createElement('output');faceValueText.textContent='0.00';
const faceSave=document.createElement('button');faceSave.id='v96-face-save';faceSave.type='button';faceSave.textContent='このキーを保存';
const faceSaved=document.createElement('select');faceSaved.id='v96-face-saved';faceSaved.setAttribute('aria-label','保存済み表情キー');
const faceDelete=document.createElement('button');faceDelete.id='v96-face-delete';faceDelete.type='button';faceDelete.textContent='選択キーを削除';
const faceUndo=document.createElement('button');faceUndo.id='v99-face-undo';faceUndo.type='button';faceUndo.textContent='表情キーを戻す';
const faceRedo=document.createElement('button');faceRedo.id='v99-face-redo';faceRedo.type='button';faceRedo.textContent='表情キーをやり直す';
const faceStatus=document.createElement('span');faceStatus.setAttribute('role','status');
faceControls.append(faceLabel,faceName,faceTrack,faceTime,faceUseSeek,faceValue,faceValueText,faceSave,
  faceSaved,faceDelete,faceUndo,faceRedo,faceStatus);
heading.append(title,choose,refreshBtn,focusBtn,saveCameraBtn,restoreCameraBtn,modeBtn,closeBtn);
const motionControls=document.createElement('div');motionControls.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap';
motionControls.append(clipSelect,targetSelect,assignBtn,seekInput,seekBtn,motionStatus);
const canvasParent=document.createElement('div');
canvasParent.id='v58-canvas';
canvasParent.style.cssText='position:relative;min-height:230px;flex:1;background:#111827;overflow:hidden;border:1px solid #435a73;';
const footer=document.createElement('div');footer.style.cssText='display:flex;justify-content:space-between;gap:8px;';
const hint=document.createElement('small');
hint.textContent=tr('renderingNote');
footer.append(progress,cameraStatus,hint);
if(captureMode){saveCameraBtn.hidden=true;restoreCameraBtn.hidden=true;}
panel.append(heading,motionControls,faceControls,fkControls,footControls,canvasParent,footer);
if(captureMode){footControls.hidden=true;fkControls.hidden=true;}
document.body.append(panel);
panel.hidden=true;panel.style.display='none';
const normalPanelStyle=panel.style.cssText;
const normalCanvasStyle=canvasParent.style.cssText;

function mountComposite(){
  const stage=document.getElementById('v68stage');
  if(!stage)return false;
  window.BAIStudioMediaPreviewV68?.sceneOverlay?.(true);
  stage.append(canvasParent,panel);
  canvasParent.style.cssText='position:absolute;inset:0;width:100%;height:100%;min-height:0;background:transparent;border:0;overflow:hidden;z-index:2';
  panel.style.cssText='position:absolute;top:8px;right:8px;left:auto;bottom:auto;z-index:3;width:min(560px,calc(100% - 16px));max-height:52%;overflow:auto;background:#172231ee;border:1px solid #6584a0;border-radius:9px;padding:8px;box-shadow:0 8px 28px #0009;display:flex;flex-direction:column;gap:5px';
  return true;
}
function unmountComposite(){
  window.BAIStudioMediaPreviewV68?.sceneOverlay?.(false);
  panel.insertBefore(canvasParent,footer);
  document.body.append(panel);
  canvasParent.style.cssText=normalCanvasStyle;
  panel.style.cssText=normalPanelStyle;
}
function setBoneEditPanel(enabled,context){
  if(!composite)return;
  if(!enabled){
    panel.style.width='min(560px,calc(100% - 16px))';panel.style.maxHeight='52%';
    panel.style.left='auto';panel.style.right='8px';return;
  }
  const bone=context?.bone,THREE=context?.target?.libs?.THREE;
  if(!bone||!THREE)return;
  context.target.object.updateMatrixWorld(true);
  viewport.camera.updateMatrixWorld(true);
  const point=bone.getWorldPosition(new THREE.Vector3()).project(viewport.camera);
  panel.style.width='min(300px,45%)';panel.style.maxHeight='85%';
  if(point.x<0){panel.style.left='auto';panel.style.right='8px';}
  else{panel.style.left='8px';panel.style.right='auto';}
}

const request=async(url)=>{
  const response=await fetch(url,{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw Error(data?.error||`HTTP ${response.status}`);
  return data;
};
function updateStatus(s,issues=[]){
  progress.textContent=`${tr('loadedCount')}: ${s.loaded}`+(issues.length?` / ${tr('problems')}: ${issues.map(x=>x.reason+'('+x.id+')').join(', ')}`:'');
  if(!opened)return;
  const old=choose.value||selectedId;
  choose.replaceChildren(new Option(tr('choose'),''));
  for(const id of s.ids)choose.add(new Option(id,id));
  if(s.ids.includes(old))choose.value=old;
  else if(s.ids.length)choose.value=s.ids[0];
  selectedId=choose.value;
}
async function loadInstanceMotion({row,target}){
  if(!row.motion_asset)throw Error('モーション素材がありません');
  const asset=row.motion_asset,libs=target.libs;
  const modelFormat=String(target.format||'').toUpperCase();
  const motionFormat=String(asset.format||'').toUpperCase();
  let source,player;
  try{
    if(motionFormat==='VMD'){
      if(modelFormat!=='PMX')throw Error('このモデルにVMDは適用できません');
      const vmd=await loadVmdClip(libs,vmdUrl(asset),target.object);
      player=createPmxVmdPreview(libs.THREE,libs.MMDAnimationHelper,target.object,vmd,asset.id);
    }else if(motionFormat==='GLB'||motionFormat==='FBX'){
      source=await loadModel(asset,libs);
      if(!source.animations?.length)throw Error('モーションにアニメーションがありません');
      player=modelFormat==='PMX'
        ?createPmxGlbPreview(libs.THREE,target.object,source.object,source.animations[0])
        :createGenericGlbPreview(libs.THREE,target.object,source.object,source.animations[0]);
    }else throw Error('未対応のモーション形式');
    let closed=false;
    return {
      duration:player.duration,
      setCorrectionLayers(layers,preview){player.setCorrectionLayers?.(layers,preview);},
      seek(seconds){
        if(closed)return;
        player.seek(Math.min(Math.max(0,seconds),Math.max(0,(player.duration||0)-1e-6)));
      },
      dispose(){if(closed)return;closed=true;player.dispose?.();if(source)disposeObject(source.object);}
    };
  }catch(error){player?.dispose?.();if(source)disposeObject(source.object);throw error;}
}
function redrawMotionControls(){
  const oldClip=clipSelect.value,oldInstance=targetSelect.value;
  clipSelect.replaceChildren(new Option(tr('chooseMotion'),''));
  for(const row of motionPlan?.rows||[])clipSelect.add(new Option(row.name+' ['+row.status+']',row.clip_id));
  if((motionPlan?.rows||[]).some(r=>r.clip_id===oldClip))clipSelect.value=oldClip;
  else if(clipSelect.options.length>1)clipSelect.selectedIndex=1;
  const selected=(motionPlan?.rows||[]).find(r=>r.clip_id===clipSelect.value);
  targetSelect.replaceChildren(new Option(tr('unassigned'),''));
  for(const inst of motionPlan?.instances||[])targetSelect.add(new Option(inst.id,inst.id));
  if(selected?.target_scene_instance_id)targetSelect.value=selected.target_scene_instance_id;
  else if(oldInstance&&(motionPlan?.instances||[]).some(x=>x.id===oldInstance))targetSelect.value=oldInstance;
  assignBtn.disabled=!clipSelect.value||!motionPlan;
  const motionState=motionCoordinator?.status();
  const failure=motionState?.issues.find(issue=>issue.message);
  motionStatus.textContent=failure
    ?`モーション未読込: ${failure.message}`
    :motionState?`${tr('motionReady')}: ${motionState.loadedClips.length}`:'';
}
function redrawFaceControls(){
  const instanceId=choose.value||selectedId;
  const target=controller?.getLoaded(instanceId);
  const priorName=faceName.value;
  const names=target?.format==='PMX'?[...morphValues(target.object).keys()]:[];
  faceName.replaceChildren(new Option(names.length?'モーフを選択':'PMXモデルを選択',''));
  for(const name of names)faceName.add(new Option(name,name));
  if(names.includes(priorName))faceName.value=priorName;
  const priorKey=faceSaved.value;
  faceSaved.replaceChildren(new Option('保存済みキー',''));
  for(const [index,key] of (sceneSnapshot?.face_keys||[]).entries()){
    if(key.instance_id===instanceId)faceSaved.add(new Option(
      `${key.time.toFixed(3)}秒 ${key.morph_name} ${key.value.toFixed(2)}`,String(index)));
  }
  if([...faceSaved.options].some(x=>x.value===priorKey))faceSaved.value=priorKey;
  faceSave.disabled=!names.length;
  faceDelete.disabled=!faceSaved.value;
  faceUndo.disabled=!(sceneSnapshot?.face_history?.undo?.length);
  faceRedo.disabled=!(sceneSnapshot?.face_history?.redo?.length);
  faceStatus.textContent=names.length?`${names.length}件の実在モーフ`:'PMXモデルを選んでください';
}
function currentSeek(){
  const media=window.BAIStudioMediaPreviewV68?.status?.();
  if(media?.ready&&media.projectId===project?.value)return media.frame/media.fps;
  const persisted=window.BAIStudioPersistedSeek?.status?.();
  const value=persisted?.projectId===project?.value
    ?persisted.seconds:window.BAIStudioTimeline?.getTime?.();
  return Number.isFinite(value)&&value>=0?value:0;
}
function activeFkRow(frame=Number(fkFrame.value)){
  const instanceId=choose.value||selectedId;
  const target=controller?.getLoaded(instanceId);
  const instance=(motionPlan?.instances||[]).find(item=>item.id===instanceId);
  if(target?.format!=='PMX'||!Number.isInteger(frame)||frame<0||
      !Number.isFinite(projectFps)||projectFps<1||instance?.asset?.source!=='mmd')return null;
  const seconds=frame/projectFps;
  const candidates=(motionPlan?.rows||[]).filter(row=>row.status==='ready'&&
    row.model_format==='PMX'&&row.motion_format==='VMD'&&
    row.motion_asset?.source==='mmd'&&
    row.target_scene_instance_id===instanceId&&
    seconds>=row.start&&seconds<row.start+row.duration&&
    motionCoordinator?.status().loadedClips.includes(row.clip_id));
  return candidates.length===1?candidates[0]:null;
}
function setFkFrameFromSeek(){
  fkFrame.value=String(Math.max(0,Math.round(currentSeek()*projectFps)));
  redrawFkControls();
}
function kneePoleFor(target,name){
  if(target?.format!=='PMX'||!['左足ＩＫ','右足ＩＫ'].includes(name))return null;
  const bones=target.object?.skeleton?.bones,iks=target.object?.geometry?.userData?.MMD?.iks;
  if(!Array.isArray(bones)||!Array.isArray(iks))return null;
  const matches=iks.filter(ik=>bones[ik.target]?.name===name&&ik.links?.length===2);
  if(matches.length!==1)return null;
  const ik=matches[0],knee=bones[ik.links[0].index],thigh=bones[ik.links[1].index];
  const ankle=bones[ik.effector],targetBone=bones[ik.target],side=name[0];
  const lower=ik.links[0].rotationMin,upper=ik.links[0].rotationMax;
  if(!knee?.isBone||!thigh?.isBone||!ankle?.isBone||!targetBone?.isBone||
      knee.parent!==thigh||ankle.parent!==knee||
      knee.name!==side+'ひざ'||thigh.name!==side+'足'||ankle.name!==side+'足首'||
      !lower||!upper||!['x','y','z'].every(axis=>
        Number.isFinite(lower[axis])&&Number.isFinite(upper[axis]))||
      Math.abs(lower.y)>1e-5||Math.abs(upper.y)>1e-5||
      Math.abs(lower.z)>1e-5||Math.abs(upper.z)>1e-5)return null;
  return {knee,thigh,ankle,targetBone,limb:side==='左'?'left_leg':'right_leg'};
}
function limbBones(target,limb){
  if(target?.format!=='PMX'||!limb.endsWith('_leg'))return null;
  const side=limb==='left_leg'?'左':'右';
  const bones=target.object?.skeleton?.bones||[];
  const fkName=side+'足';
  const fkMatches=bones.filter(bone=>bone.name===fkName);
  const ikTargets=listPmxIkTargets(target.object).filter(ik=>
    (ik.name===side+'足ＩＫ'||ik.name===side+'足IK')&&ik.effector===side+'足首');
  return {fkName:fkMatches.length===1?fkName:null,
    ikName:ikTargets.length===1?ikTargets[0].name:null};
}
function redrawLimbMode(target,instanceId,row){
  const limb=limbSelect.value;
  const stored=motionEdits?.fk_ik_modes?.[instanceId]?.[limb]||
    (limb.endsWith('_leg')?'IK':'FK');
  limbMode.value=stored;
  const bones=limbBones(target,limb);
  const locked=sceneSnapshot?.instances?.find(item=>item.id===instanceId)?.locked;
  const available=Boolean(bones?.fkName);
  limbMode.disabled=!row||!available||Boolean(locked);
  limbSave.disabled=!row||!available||Boolean(locked)||Boolean(previewFk)||
    Boolean(motionEdits?.issues?.length)||(stored==='IK'&&!bones?.ikName);
  limbStatus.textContent=limb.endsWith('_arm')?
    '腕IKの3D解法は未実装です。腕はFKのみです。':
    !bones?.fkName?'このPMXに標準の脚骨がないため切替不可です。':
    !bones.ikName?'このPMXに標準の足IK定義がないためIKへは切替不可です。':
    `現在 ${stored}。切替だけでは姿勢・キー・Undoを変更しません。`;
}
function worldBonePose(target){
  const THREE=target.libs.THREE;
  target.object.updateWorldMatrix(true,true);
  return target.object.skeleton.bones.map(bone=>({
    position:bone.getWorldPosition(new THREE.Vector3()),
    rotation:bone.getWorldQuaternion(new THREE.Quaternion())}));
}
function worldPoseDifference(before,after){
  if(before.length!==after.length)return Infinity;
  let difference=0;
  for(let index=0;index<before.length;index++)difference=Math.max(difference,
    before[index].position.distanceTo(after[index].position),
    before[index].rotation.angleTo(after[index].rotation));
  return difference;
}
function redrawFkControls(){
  const instanceId=choose.value||selectedId;
  const target=controller?.getLoaded(instanceId);
  const boneNames=target?.format==='PMX'?target.object.skeleton.bones.map(bone=>bone.name):[];
  const nameCounts=new Map();
  for(const name of boneNames)nameCounts.set(name,(nameCounts.get(name)||0)+1);
  const names=boneNames.filter(name=>nameCounts.get(name)===1);
  const previous=fkBone.value;
  fkBone.replaceChildren(new Option(names.length?'骨を選択':'実PMXを選択',''));
  for(const name of names)fkBone.add(new Option(name,name));
  if(names.includes(previous))fkBone.value=previous;
  else if(names.includes('頭'))fkBone.value='頭';
  const ikTargets=target?.format==='PMX'?listPmxIkTargets(target.object):[];
  const previousIk=ikSelect.value;
  ikSelect.replaceChildren(new Option(ikTargets.length?'IK骨を選択':'IK定義なし',''));
  for(const ik of ikTargets)ikSelect.add(new Option(`${ik.name} → ${ik.effector}`,ik.name));
  if(ikTargets.some(ik=>ik.name===previousIk))ikSelect.value=previousIk;
  ikSelect.disabled=!ikTargets.length;ikChoose.disabled=!ikSelect.value;
  ikStatus.textContent=ikTargets.length?
    `実PMXのIK定義 ${ikTargets.length}件。選択後「このFを3D表示」から位置ハンドルを使えます。`:
    '実PMXのIK定義を読み込むと選択できます。';
  const row=activeFkRow();
  redrawLimbMode(target,instanceId,row);
  const pole=kneePoleFor(target,ikSelect.value);
  const poleMode=pole&&((motionEdits?.fk_ik_modes?.[instanceId]?.[pole.limb])||'IK');
  poleChoose.disabled=!row||!pole||poleMode!=='IK'||Boolean(previewFk)||
    Boolean(motionEdits?.issues?.length)||
    Boolean(sceneSnapshot?.instances?.find(item=>item.id===instanceId)?.locked);
  const layer=motionEdits?.layers?.find(item=>item.instance_id===instanceId&&item.clip_id===row?.clip_id&&!item.disabled);
  const first=row?Math.ceil(row.start*projectFps-1e-7):0;
  const end=row?Math.ceil((row.start+row.duration)*projectFps-1e-7):0;
  fkWeight.value=String(Math.round((layer?.weight??1)*100));
  fkStart.value=String(layer?.start_frame??first);fkEnd.value=String(layer?.end_frame??end);
  fkFadeIn.value=String(layer?.fade_in_frames??0);fkFadeOut.value=String(layer?.fade_out_frames??0);
  fkMuted.checked=Boolean(layer?.muted);fkLayerSave.disabled=!layer;
  fkCandidate.disabled=!row||!layer||Boolean(motionEdits?.issues?.length)||Boolean(previewFk)||Boolean(candidateValidation);
  const previousKey=fkSaved.value;
  fkSaved.replaceChildren(new Option('保存済みFKキー',''));
  for(const key of layer?.keys||[])fkSaved.add(new Option(`F${key.frame} ${key.bone}`,JSON.stringify([key.frame,key.bone])));
  if([...fkSaved.options].some(option=>option.value===previousKey))fkSaved.value=previousKey;
  fkContext.textContent=row
    ?`作品F${fkFrame.value} / ${projectFps}fps、モデル ${instanceId}、VMD ${row.name}、レイヤー ${layer?.name||'FK補正（未作成）'}。元VMDからの局所回転差分と位置差分（モデル単位）です。`
    :'この位置で読み込み済みのPMX＋VMDとモデルを選択してください。';
  if(names.length<boneNames.length)fkContext.textContent+=' 同名の骨は編集対象外です。';
  const editable=Boolean(row&&names.length&&fkBone.value&&
    !(sceneSnapshot?.instances||[]).find(item=>item.id===instanceId)?.locked);
  fkPreview.disabled=!editable;fkSave.disabled=!editable;
  fkCancel.disabled=!previewFk;fkRemove.disabled=!fkSaved.value;
  fkUndo.disabled=!motionEdits?.can_undo;fkRedo.disabled=!motionEdits?.can_redo;
  if(motionEdits?.issues?.length)fkStatus.textContent='補正を停止: '+motionEdits.issues.map(x=>x.reason).join('; ');
  else if(!row)fkStatus.textContent='対象VMDのある作品フレームへ移動してください。';
  bonePicker?.refresh();
  rotateGizmo?.refresh();
}
function fkGizmoContext(){
  const instanceId=choose.value||selectedId,frame=Number(fkFrame.value),name=fkBone.value;
  const row=activeFkRow(frame),target=controller?.getLoaded(instanceId);
  if(!opened||!row||!target?.object?.skeleton||!name)return {reason:'実PMX骨と有効なVMDのある作品フレームを選択してください。'};
  if(Math.abs(Number(seekInput.value)-frame/projectFps)>1/(projectFps*100))
    return {reason:'3D骨操作は表示中の作品フレームで行います。タイムラインを対象Fへ移動してください。'};
  if(sceneSnapshot?.instances?.find(item=>item.id===instanceId)?.locked)
    return {reason:'ロック中のモデルは補正できません。'};
  if(motionEdits?.issues?.length)return {reason:'補正データの不一致を解決してください。'};
  const matches=target.object.skeleton.bones.filter(bone=>bone.name===name);
  if(matches.length!==1)return {reason:'同名または存在しない骨は3D操作できません。'};
  const ikTarget=listPmxIkTargets(target.object).find(item=>item.name===name);
  const effectors=ikTarget?target.object.skeleton.bones.filter(bone=>bone.name===ikTarget.effector):[];
  const pole=['左足ＩＫ','右足ＩＫ'].map(ikName=>kneePoleFor(target,ikName))
    .find(item=>item?.thigh===matches[0]&&
      (motionEdits?.fk_ik_modes?.[instanceId]?.[item.limb]||'IK')==='IK'&&
      activePole?.projectId===project.value&&activePole?.instanceId===instanceId&&
      activePole?.clipId===row.clip_id&&activePole?.frame===frame&&
      activePole?.bone===name);
  const layers=(motionEdits?.layers||[]).filter(layer=>!layer.disabled&&
    layer.instance_id===instanceId&&layer.clip_id===row.clip_id);
  if(layers.length>1)return {reason:'複数レイヤーの同時補正は3D操作に未対応です。'};
  const layer=layers[0];
  if(layer){
    const from=layer.start_frame??Math.ceil(row.start*projectFps-1e-7);
    const until=layer.end_frame??Math.ceil((row.start+row.duration)*projectFps-1e-7);
    if(layer.weight!==1||layer.muted||frame<from+(layer.fade_in_frames||0)||
        frame>=until-(layer.fade_out_frames||0))
      return {reason:'3D骨操作は重み100%で有効区間のなじませ外にあるFKレイヤーに対応します。'};
  }
  return {projectId:project.value,instanceId,clipId:row.clip_id,frame,boneName:name,
    bone:matches[0],effectorBone:effectors.length===1?effectors[0]:null,
    poleKneeBone:pole?.knee||null,poleAnkleBone:pole?.ankle||null,
    poleTargetBone:pole?.targetBone||null,target,row,layer};
}
function previewCurrentFk(){
  const {row,frame,key}=fkPayload();
  const layer=motionEdits?.layers?.find(item=>!item.disabled&&
    item.instance_id===row.target_scene_instance_id&&item.clip_id===row.clip_id);
  previewFk={projectId:project.value,instanceId:row.target_scene_instance_id,
    clipId:row.clip_id,key:{...key,layer_id:layer?.id||'preview'}};
  applyAllMotionEdits();seekScene(frame/projectFps);redrawFkControls();
  fkStatus.textContent='仮補正を表示中。保存する場合は「このFをキー化」、破棄はEscです。';
}
async function previewFromGizmo(desired,kind,started){
  const current=fkGizmoContext();
  if(current.reason||current.bone!==started.bone||current.projectId!==started.projectId||
      current.instanceId!==started.instanceId||current.clipId!==started.clipId||current.frame!==started.frame)
    throw Error(current.reason||'ドラッグ中に作品・骨・フレームが変わりました。');
  const {bone,row,layer,frame,target}=current,THREE=target.libs.THREE;
  const previousAxes=fkAxes.map(input=>input.value);
  const previousPosition=fkPosition.map(input=>input.value),previousPreview=previewFk;
  const source=previewFk?.projectId===current.projectId&&previewFk?.instanceId===current.instanceId&&
    previewFk?.clipId===current.clipId&&previewFk?.key?.frame===frame&&previewFk?.key?.bone===current.boneName
    ?previewFk.key:layer?.keys.find(key=>key.frame===frame&&key.bone===current.boneName);
  const filtered=layer?[{...layer,keys:layer.keys.filter(key=>key.bone!==current.boneName)}]:[];
  let base;
  try{
    motionCoordinator.setCorrectionLayers(row.clip_id,filtered,null);
    const result=motionCoordinator.seek(frame/projectFps);
    if(result?.errors?.length)throw Error('元姿勢を評価できません');
    base={rotation:bone.quaternion.clone(),position:bone.position.clone()};
  }finally{
    applyAllMotionEdits();motionCoordinator.seek(frame/projectFps);
  }
  try{
    if(kind==='translate'){
      if(source?.rotation){
        const euler=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(source.rotation),'XYZ');
        [euler.x,euler.y,euler.z].forEach((value,index)=>{
          fkAxes[index].value=String(Math.round(value*180/Math.PI*10000)/10000);
        });
      }
      const delta=desired.clone().sub(base.position);
      [delta.x,delta.y,delta.z].forEach((value,index)=>{
        fkPosition[index].value=String(Math.round(value*10000)/10000);
      });
    }else{
      if(source)fkPosition.forEach((input,index)=>input.value=String(source.position?.[index]??0));
      const delta=base.rotation.invert().multiply(desired).normalize();
      const euler=new THREE.Euler().setFromQuaternion(delta,'XYZ');
      [euler.x,euler.y,euler.z].forEach((value,index)=>{
        fkAxes[index].value=String(Math.round(value*180/Math.PI*10000)/10000);
      });
    }
    previewCurrentFk();
    const mismatch=kind==='translate'?bone.position.distanceTo(desired):bone.quaternion.angleTo(desired);
    if(!Number.isFinite(mismatch)||mismatch>(kind==='translate'?0.001:0.01))
      throw Error(`3D${kind==='translate'?'位置':'回転'}の再評価差が${mismatch.toFixed(4)}のため仮補正を破棄しました。`);
  }catch(error){
    previewFk=previousPreview;
    fkAxes.forEach((input,index)=>input.value=previousAxes[index]);
    fkPosition.forEach((input,index)=>input.value=previousPosition[index]);
    applyAllMotionEdits();seekScene(frame/projectFps);redrawFkControls();
    throw error;
  }
}
function projectedPoleDirection(point,hip,axis){
  const radial=point.clone().sub(hip).addScaledVector(axis,-point.clone().sub(hip).dot(axis));
  return radial.length()>1e-5?radial.normalize():null;
}
async function previewPoleFromGizmo(desiredWorld,started){
  const current=fkGizmoContext();
  if(current.reason||current.bone!==started.bone||current.poleKneeBone!==started.poleKneeBone||
      current.projectId!==started.projectId||current.instanceId!==started.instanceId||
      current.clipId!==started.clipId||current.frame!==started.frame)
    throw Error(current.reason||'ドラッグ中に作品・膝・フレームが変わりました。');
  const {target,poleKneeBone:knee,poleAnkleBone:ankle,poleTargetBone:ikTarget,bone}=current;
  if(!knee||!ankle||!ikTarget)throw Error('このPMXの膝ポール構造には未対応です。');
  const THREE=target.libs.THREE;
  target.object.updateWorldMatrix(true,true);
  const hipWorld=bone.getWorldPosition(new THREE.Vector3());
  const axis=ankle.getWorldPosition(new THREE.Vector3()).sub(hipWorld);
  if(axis.length()<1e-4)throw Error('股関節と足首が重なり、膝方向を定義できません。');
  axis.normalize();
  const desired=projectedPoleDirection(desiredWorld,hipWorld,axis);
  if(!desired)throw Error('膝方向が脚の軸と重なっています。別の位置へ動かしてください。');
  const otherName=knee.name.startsWith('左')?'右足首':'左足首';
  const other=target.object.skeleton.bones.find(item=>item.name===otherName);
  if(!other)throw Error('未編集側の足首を照合できません。');
  const otherStart=other.getWorldPosition(new THREE.Vector3());
  const previousAxes=fkAxes.map(input=>input.value);
  const previousPreview=previewFk;
  const center=Number(fkAxes[1].value);
  if(!Number.isFinite(center))throw Error('太ももY回転差分を読み取れません。');
  let best=null,baseline=null;
  const measured=new Map();
  function measure(value){
    const angle=Math.max(-180,Math.min(180,Math.round(value*10000)/10000));
    if(measured.has(angle))return measured.get(angle);
    fkAxes[1].value=String(angle);
    previewCurrentFk();
    target.object.updateWorldMatrix(true,true);
    const direction=projectedPoleDirection(knee.getWorldPosition(new THREE.Vector3()),hipWorld,axis);
    const reach=ankle.getWorldPosition(new THREE.Vector3()).distanceTo(
      ikTarget.getWorldPosition(new THREE.Vector3()));
    const otherDrift=other.getWorldPosition(new THREE.Vector3()).distanceTo(otherStart);
    const score=direction?Math.acos(Math.max(-1,Math.min(1,direction.dot(desired))))*180/Math.PI:Infinity;
    const result={angle,score,reach,otherDrift,
      valid:Number.isFinite(score)&&reach<=0.001&&otherDrift<=1e-4};
    measured.set(angle,result);
    if(result.valid&&(!best||result.score<best.score-1e-6||
        (Math.abs(result.score-best.score)<=1e-6&&
          Math.abs(result.angle-center)<Math.abs(best.angle-center))))best=result;
    return result;
  }
  try{
    baseline=measure(center);
    if(!baseline.valid)throw Error('現在の足IKが目標へ届いていないため膝方向を変更できません。');
    if(baseline.score<0.5)throw Error('膝方向は既に指定位置付近です。');
    for(let offset=-60;offset<=60;offset+=10)measure(center+offset);
    if(!best||best.score>=baseline.score-0.5)
      throw Error('膝方向を改善できる太もも回転が見つかりません。');
    for(const step of [5,2.5,1.25,0.625]){
      const around=best.angle;
      measure(around-step);measure(around+step);
    }
    if(best.score>15)throw Error(`膝方向の指定差 ${best.score.toFixed(1)}° が大きく、仮補正を破棄しました。`);
    const final=measure(best.angle);
    fkAxes[1].value=String(final.angle);
    previewCurrentFk();
    fkStatus.textContent=`膝方向を仮表示中。目標との差 ${final.score.toFixed(1)}°、足首残差 ${final.reach.toFixed(4)} シーン単位。キー化前に確認してください。`;
    return final;
  }catch(error){
    fkAxes.forEach((input,index)=>input.value=previousAxes[index]);
    previewFk=previousPreview;
    applyAllMotionEdits();seekScene(current.frame/projectFps);redrawFkControls();
    throw error;
  }
}
function applyAllMotionEdits(){
  if(!motionCoordinator||!motionPlan)return;
  for(const row of motionPlan.rows){
    if(row.status!=='ready'||row.motion_format!=='VMD')continue;
    const layers=(motionEdits?.layers||[]).filter(layer=>!layer.disabled&&
      layer.instance_id===row.target_scene_instance_id&&layer.clip_id===row.clip_id);
    let preview=null;
    if(previewFk?.projectId===project?.value&&previewFk?.instanceId===row.target_scene_instance_id&&
       previewFk?.clipId===row.clip_id){
      preview=previewFk.key;
      if(!layers.some(layer=>layer.id===preview.layer_id))layers.push({
        id:preview.layer_id,start:row.start,fps:projectFps,weight:1,muted:false,keys:[]});
    }
    motionCoordinator.setCorrectionLayers(row.clip_id,layers,preview);
  }
}
function discardFkPreview(){
  if(!previewFk)return;
  previewFk=null;applyAllMotionEdits();seekScene(Number(seekInput.value)||currentSeek());
  redrawFkControls();
}
function fkPayload(){
  const frame=Number(fkFrame.value),row=activeFkRow(frame),bone=fkBone.value;
  if(!row||!bone)throw Error('作品F・実PMX骨・読み込み済みVMDを選択してください');
  const target=controller.getLoaded(row.target_scene_instance_id);
  if(!target?.object?.skeleton.getBoneByName(bone))throw Error('実PMXにない骨です');
  const degrees=fkAxes.map(input=>Number(input.value));
  if(fkAxes.some(input=>input.value.trim()==='')||degrees.some(x=>!Number.isFinite(x)||Math.abs(x)>180))
    throw Error('X/Y/Zの角度を−180〜180度の数値で指定してください');
  const THREE=target.libs.THREE;
  const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(
    ...degrees.map(x=>x*Math.PI/180),'XYZ')).normalize().toArray();
  const position=fkPosition.map(input=>Number(input.value));
  if(fkPosition.some(input=>input.value.trim()==='')||position.some(x=>!Number.isFinite(x)||Math.abs(x)>100000))
    throw Error('X/Y/Zの位置差分を±100000以内の数値で指定してください');
  return {row,frame,key:{frame,bone,rotation:quaternion,
    ...(position.some(x=>x!==0)?{position}:{})}};
}
async function writeFk(action,key=null,row=null,extra={}){
  const id=project?.value,revision=motionEdits?.revision;
  if(!id||!opened||!Number.isInteger(revision))throw Error('作品の補正データを再読み込みしてください');
  const body={project_id:id,revision,action};
  if(row){body.instance_id=row.target_scene_instance_id;body.clip_id=row.clip_id;body.key=key;}
  Object.assign(body,extra);
  if(body.key===null)delete body.key;
  const response=await fetch('/api/studio/v05/motion-edits',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
  if(!opened||project?.value!==id)return;
  motionEdits=data;previewFk=null;applyAllMotionEdits();
  const displayTime=row?Number(fkFrame.value)/projectFps:Number(seekInput.value);
  seekScene(Number.isFinite(displayTime)&&displayTime>=0?displayTime:currentSeek());
  redrawFkControls();
  window.dispatchEvent(new CustomEvent('bai:v106-fk-saved',{detail:{projectId:id,revision:data.revision}}));
}
function seekScene(seconds){
  if(!opened||!motionCoordinator)return;
  try{
    for(const instance of sceneSnapshot?.instances||[]){
      const target=controller?.getLoaded(instance.id);
      if(target?.format==='PMX')resetMorphs(target.object);
    }
    const result=motionCoordinator.seek(seconds);
    if(result?.errors?.length)motionStatus.textContent=result.errors.map(x=>String(x.error?.message||x.error)).join('; ');
    const missing=applySavedFace(seconds);
    if(missing.length)motionStatus.textContent='未読込の表情モーフ: '+missing.join(', ');
    seekInput.value=String(seconds);
  }catch(error){motionStatus.textContent=String(error.message||error);}
}
async function sampleFootContact(instanceId,groundY){
  if(!opened||!controller||!motionCoordinator||!sceneSnapshot||!motionPlan||
     sceneSnapshot.project_id!==project?.value)throw Error('作品の3Dプレビューを読み込んでください');
  if(!Number.isFinite(groundY))throw Error('床のY座標を数値で指定してください');
  const target=controller.getLoaded(instanceId);
  if(target?.format!=='PMX'||!target.object?.skeleton)throw Error('実PMXモデルを選んでください');
  const bones=new Map(target.object.skeleton.bones.map(bone=>[bone.name,bone]));
  const left=bones.get('左つま先'),right=bones.get('右つま先');
  if(!left||!right)throw Error('このPMXに左右の「つま先」骨がありません');
  const originalNonce=nonce,projectId=project.value;
  const media=window.BAIStudioMediaPreviewV68?.status?.();
  if(media?.projectId===project.value&&media.playing)throw Error('再生を一時停止してから診断してください');
  const fpsData=await request('/api/studio/v05/project/fps?id='+encodeURIComponent(projectId));
  if(!opened||nonce!==originalNonce||project.value!==projectId)
    throw Error('作品が変わったため診断を中断しました');
  const fps=fpsData.configured?Number(fpsData.fps):60;
  if(!Number.isFinite(fps)||fps<1||fps>240)throw Error('作品FPSを取得できません');
  // The 3D preview may already have followed a timeline seek while the media
  // panel's frame cache still points at its prior position.
  const shownTime=Number(seekInput.value);
  const originalTime=Number.isFinite(shownTime)&&shownTime>=0?shownTime:currentSeek();
  const row=motionPlan.rows.find(item=>item.status==='ready'&&
    item.target_scene_instance_id===instanceId&&
    item.start<=originalTime&&originalTime<item.start+item.duration&&
    motionCoordinator.status().loadedClips.includes(item.clip_id));
  if(!row)throw Error('現在位置に読み込み済みのPMX動作がありません');
  const startFrame=Math.max(0,Math.ceil(originalTime*fps-1e-6));
  const lastFrame=Math.min(startFrame+Math.ceil(2*fps),
    Math.floor((row.start+row.duration-1e-6)*fps));
  if(lastFrame<=startFrame)throw Error('動作の終了直前です。少し前へ移動してください');
  const stride=Math.max(1,Math.ceil(fps/30));
  const frames=[];
  for(let frame=startFrame;frame<=lastFrame;frame+=stride)frames.push(frame);
  if(frames.at(-1)!==lastFrame)frames.push(lastFrame);
  const samples={left:[],right:[]};
  const point=new target.libs.THREE.Vector3();
  try{
    for(let i=0;i<frames.length;i++){
      if(!opened||nonce!==originalNonce||project.value!==projectId||
         controller.getLoaded(instanceId)!==target||
         window.BAIStudioMediaPreviewV68?.status?.()?.playing)
        throw Error('作品または再生状態が変わったため診断を中断しました');
      const frame=frames[i];
      const result=motionCoordinator.seek(frame/fps);
      if(result?.errors?.length)throw Error('動作を評価できません: '+String(result.errors[0].error));
      target.root.updateMatrixWorld(true);
      for(const [side,bone] of [['left',left],['right',right]]){
        bone.getWorldPosition(point);
        const position=point.toArray();
        if(position.some(value=>!Number.isFinite(value)))throw Error('足骨の座標が不正です');
        samples[side].push({frame,position});
      }
      if(i%8===7)await new Promise(resolve=>requestAnimationFrame(resolve));
    }
  }finally{
    if(opened&&nonce===originalNonce&&project.value===projectId&&
       controller.getLoaded(instanceId)===target)seekScene(originalTime);
  }
  return {projectId,instanceId,clipId:row.clip_id,token:originalNonce,
    arrangementRevision:motionPlan.arrangement_revision,fps,startFrame,lastFrame,
    groundY,samples,point:'PMX 左つま先 / 右つま先（足裏の代理点）'};
}
function applySavedFace(seconds){
  const missing=[];
  for(const instance of sceneSnapshot?.instances||[]){
    const target=controller?.getLoaded(instance.id);
    if(target?.format!=='PMX')continue;
    missing.push(...applyFaceKeys(target.object,sceneSnapshot.face_keys,instance.id,seconds));
  }
  viewport?.invalidate?.();
  return missing;
}
async function setup(){
  const token=nonce;
  const libs=await loadLibs();
  if(token!==nonce||!opened)throw Error('プレビューは閉じられました');
  viewport=createViewport(canvasParent,libs,{freeDolly:true,transparent:composite,
    preserveDrawingBuffer:captureMode});
  const shared=window.BAIStudioSharedSceneV57?.createHost({
    scene:viewport.content,
    // Draw once via the viewport's RAF, not an extra direct renderer call.
    renderer:{render:()=>viewport?.invalidate()},
    camera:viewport.camera,
    onError:({id,error})=>{progress.textContent=`モデル ${id}: ${String(error?.message||error)}`;}
  });
  if(!shared)throw Error('共有シーン管理を利用できません');
  controller=window.BAIStudioMultiModelV58.createController({
    host:shared,
    onChange:s=>updateStatus(s),
    onError:({id,error})=>{progress.textContent=`読込失敗 ${id}: ${String(error?.message||error)}`;},
    async loadInstance({asset,instanceId}){
      // NEVER cache by asset ID: each character needs its own bone tree and mixer.
      const loaded=await loadModel(asset,libs);
      const object=loaded.object;
      try{
        if(loaded.format==='PMX'){
          object.scale.setScalar(.08);
          object.updateMatrixWorld(true);
          const box=new libs.THREE.Box3().setFromObject(object,true);
          object.position.y-=box.min.y;
        }else normalizeModel(object,loaded.format,libs.THREE);
        const root=new libs.THREE.Group();
        root.name=`BAI_Inst_${instanceId}`;root.add(object);
        const rest=[];
        object.traverse?.(node=>{if(node.isBone)rest.push({
          bone:node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()
        });});
        let disposed=false;
        return {
          root,object,format:loaded.format,libs,
          resetPose(){
            for(const part of rest){
              part.bone.position.copy(part.position);
              part.bone.quaternion.copy(part.quaternion);
              part.bone.scale.copy(part.scale);
            }
            object.updateMatrixWorld(true);
          },
          dispose(){if(disposed)return;disposed=true;root.remove(object);disposeObject(object);}
        };
      }catch(error){disposeObject(object);throw error;}
    }
  });
  // v61: common XYZ inspector acts on actual scene instance roots.
  // Persist only through the existing revisioned v57 scene API.
  if(!captureMode)spatialEditor=createSpatialEditor({
    panel,viewport,controller,project,
    getSceneData:()=>sceneSnapshot,
    async saveTransform(instanceId,transform){
      const id=project?.value;
      if(!id||!sceneSnapshot||sceneSnapshot.project_id!==id)
        throw Error('No current project');
      const originalRevision=sceneSnapshot.revision;
      const response=await fetch('/api/studio/v05/scene/instances',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:id,action:'update',revision:originalRevision,
          instance_id:instanceId,transform})
      });
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'HTTP '+response.status);
      if(project?.value!==id)throw Error('Project changed');
      sceneSnapshot=data;
      window.dispatchEvent(new CustomEvent('bai:v61-transform-saved',{detail:{projectId:id,instanceId}}));
      return data;
    }
  });
  if(!captureMode)bonePicker=createPmxBonePicker({
    container:canvasParent,controls:fkControls,viewport,
    getModel:()=>controller?.getLoaded(choose.value||selectedId),
    getSelected:()=>fkBone.value,
    onSelect(name){
      discardFkPreview();
      fkBone.value=name;
      fkControls.open=true;
      redrawFkControls();
    }
  });
  if(!captureMode)rotateGizmo=createPmxFkRotate({
    controls:fkControls,viewport,getContext:fkGizmoContext,
    async onGoToFrame(){
      const frame=Number(fkFrame.value);
      if(!activeFkRow(frame))throw Error('有効なPMX＋VMDの作品フレームを選択してください。');
      const media=window.BAIStudioMediaPreviewV68?.status?.();
      if(media?.ready&&media.projectId===project.value)
        await window.BAIStudioMediaPreviewV68.seek(frame);
      else seekScene(frame/projectFps);
    },
    onTransform:previewFromGizmo,
    onPoleTransform:previewPoleFromGizmo,
    onCancel:()=>seekScene(Number(seekInput.value)||0),
    onModeChange:(enabled,context)=>{
      spatialEditor?.setGizmoEnabled(!enabled);
      setBoneEditPanel(enabled,context);
    },
    onError:message=>{fkStatus.textContent=message;}
  });
  motionCoordinator=window.BAIStudioMultiMotionV59.createCoordinator({
    controller,loadMotion:loadInstanceMotion,
    onChange:()=>{if(opened)redrawMotionControls();},
    onError:({clipId,error})=>{motionStatus.textContent=clipId+': '+String(error.message||error);}
  });
}
async function reload(){
  if(!opened)return;
  activePole=null;
  candidateValidation?.abort();candidateValidation=null;vmdCandidate=null;
  fkValidate.disabled=true;fkValidate.textContent='実PMXで全骨・全Fを検査';
  fkCandidateLink.hidden=true;
  fkCandidateStatus.textContent='保存済み補正から候補を作成し、実PMXで全フレーム検査できます。';
  const id=project?.value;
  if(!id){progress.textContent=tr('chooseProject');return;}
  const thisNonce=++nonce;
  reloadReady=false;
  progress.textContent=tr('loading');
  try{
    if(!controller)await setup();
    if(thisNonce!==nonce||!opened)return;
    const data=await request('/api/studio/v05/scene/instances?id='+encodeURIComponent(id));
    if(thisNonce!==nonce||!opened||id!==project.value)return;
    const result=await controller.reconcile(data);
    if(thisNonce!==nonce||!opened)return;
    sceneSnapshot=data;
    await spatialEditor?.update(data.instances);
    spatialEditor?.select(choose.value||selectedId||data.instances?.[0]?.id);
    if(thisNonce!==nonce||!opened)return;
    const plan=await request('/api/studio/v05/scene/multi-motion-plan?id='+encodeURIComponent(id));
    if(thisNonce!==nonce||!opened||id!==project.value)return;
    motionPlan=plan;
    const [fpsResult,edits]=await Promise.all([
      request('/api/studio/v05/project/fps?id='+encodeURIComponent(id)),
      request('/api/studio/v05/motion-edits?id='+encodeURIComponent(id))]);
    if(thisNonce!==nonce||!opened||id!==project.value)return;
    projectFps=fpsResult.configured?Number(fpsResult.fps):60;
    motionEdits=edits;previewFk=null;
    const motionResult=await motionCoordinator.reconcile(plan);
    if(thisNonce!==nonce||!opened)return;
    applyAllMotionEdits();
    updateStatus(controller.status(),[...(result.issues||[]),...(motionResult.issues||[])]);
    redrawMotionControls();
    seekScene(currentSeek());
    redrawFaceControls();
    setFkFrameFromSeek();
    viewport.fit?.();
    if(data.camera)viewport.applyCameraPose(data.camera);
    cameraStatus.textContent=data.camera?'保存済みカメラを反映（視点変更後は再保存）':'カメラ未保存：自動構図で表示・出力';
    saveCameraBtn.disabled=controller.status().loaded<1;
    viewport.invalidate?.();
    if(composite)window.BAIStudioMediaPreviewV68?.sceneOverlay?.(true);
    reloadReady=true;
    window.dispatchEvent(new CustomEvent('bai:v58-scene-reloaded',{detail:{projectId:id,loaded:controller.status().loaded}}));
  }catch(error){
    if(thisNonce===nonce&&opened){
      motionEdits=null;previewFk=null;motionPlan=null;
      motionCoordinator?.clear();
      for(const instance of sceneSnapshot?.instances||[])controller?.getLoaded(instance.id)?.resetPose?.();
      viewport?.invalidate?.();redrawFkControls();
      progress.textContent=tr('loadFailed')+': '+String(error?.message||error);
    }
  }
}
async function open(options={}){
  const requestedComposite=Boolean(options?.composite);
  if(opened){
    if(requestedComposite===composite){await reload();return;}
    close();
  }
  // The legacy viewport owns a globally singleton Three.js host.
  // End it first; never overlap two GL contexts and two animation owners.
  window.BAIStudioScenePreview?.close();
  opened=true;composite=requestedComposite&&mountComposite();
  modeBtn.textContent=composite?'単独画面で表示':'同じ画面に重ねる';
  panel.hidden=false;panel.style.display='flex';
  await reload();
}
function close(){
  nonce++;opened=false;reloadReady=false;
  candidateValidation?.abort();candidateValidation=null;vmdCandidate=null;
  rotateGizmo?.dispose();rotateGizmo=null;
  bonePicker?.dispose();bonePicker=null;
  spatialEditor?.dispose();spatialEditor=null;sceneSnapshot=null;
  motionCoordinator?.dispose();motionCoordinator=null;motionPlan=null;
  motionEdits=null;previewFk=null;activePole=null;
  controller?.dispose();controller=null;
  viewport?.dispose();viewport=null;
  if(composite)unmountComposite();
  composite=false;
  panel.hidden=true;panel.style.display='none';choose.replaceChildren();
  progress.textContent='';
}
refreshBtn.addEventListener('click',reload);
choose.addEventListener('change',()=>{
  discardFkPreview();
  selectedId=choose.value;
  spatialEditor?.select(selectedId);
  redrawFaceControls();
  setFkFrameFromSeek();
});
fkHere.addEventListener('click',setFkFrameFromSeek);
fkFrame.addEventListener('change',()=>{activePole=null;redrawFkControls();});
fkBone.addEventListener('change',()=>{activePole=null;discardFkPreview();redrawFkControls();});
limbSelect.addEventListener('change',redrawFkControls);
limbMode.addEventListener('change',()=>{
  const target=controller?.getLoaded(choose.value||selectedId);
  const bones=limbBones(target,limbSelect.value);
  const unsupported=limbMode.value==='IK'&&(!bones?.ikName||limbSelect.value.endsWith('_arm'));
  const instanceId=choose.value||selectedId;
  const locked=sceneSnapshot?.instances?.find(item=>item.id===instanceId)?.locked;
  limbSave.disabled=!activeFkRow()||!bones?.fkName||Boolean(locked)||Boolean(previewFk)||
    Boolean(motionEdits?.issues?.length)||limbSelect.value.endsWith('_arm')||unsupported;
  if(unsupported)limbStatus.textContent='この部位のIK解法・ターゲットには未対応です。';
});
limbSave.addEventListener('click',async()=>{
  const id=project?.value,instanceId=choose.value||selectedId,limb=limbSelect.value;
  const row=activeFkRow(),target=controller?.getLoaded(instanceId);
  const mode=limbMode.value,bones=limbBones(target,limb);
  if(!id||!row||!target||!Number.isInteger(motionEdits?.revision)||
      previewFk||motionEdits?.issues?.length||
      document.getElementById('v111-fk-gizmo-toggle')?.getAttribute('aria-pressed')==='true'){
    limbStatus.textContent='仮補正を破棄し、3Dハンドルを隠してから切り替えてください。';return;
  }
  if(limb.endsWith('_arm')||!bones?.fkName||(mode==='IK'&&!bones.ikName)){
    limbStatus.textContent='このPMX・部位の編集方法には未対応です。';return;
  }
  const name=mode==='IK'?bones.ikName:bones.fkName;
  if(![...fkBone.options].some(option=>option.value===name)){
    limbStatus.textContent='対象骨を選べません。PMXを再読込してください。';return;
  }
  limbSave.disabled=true;
  const revision=motionEdits.revision;
  let resultMessage='';
  try{
    const response=await fetch('/api/studio/v05/motion-edits',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:id,revision,action:'mode-set',
        instance_id:instanceId,clip_id:row.clip_id,limb,mode})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
    if(!opened||project?.value!==id||choose.value!==instanceId)return;
    const before=worldBonePose(target);
    motionEdits=data;activePole=null;fkBone.value=name;
    rotateGizmo?.setMode(mode==='IK'?'translate':'rotate');
    redrawFkControls();
    const difference=worldPoseDifference(before,worldBonePose(target));
    if(difference>1e-4)throw Error(`切替前後の姿勢差 ${difference.toExponential(2)} が上限を超えました`);
    resultMessage=`${limbSelect.selectedOptions[0]?.textContent}を${mode}で編集。姿勢差 ${difference.toExponential(2)}、キー・Undo追加なし。`;
    window.dispatchEvent(new CustomEvent('bai:v106-fk-saved',{detail:{projectId:id,revision:data.revision}}));
  }catch(error){resultMessage='切替失敗: '+String(error.message||error);}
  finally{redrawFkControls();limbStatus.textContent=resultMessage;}
});
ikSelect.addEventListener('change',()=>{redrawFkControls();});
ikChoose.addEventListener('click',()=>{
  const target=controller?.getLoaded(choose.value||selectedId);
  const selected=listPmxIkTargets(target?.object).find(ik=>ik.name===ikSelect.value);
  if(!selected||![...fkBone.options].some(option=>option.value===selected.name)){
    ikStatus.textContent='IK骨を選び直してください。';return;
  }
  discardFkPreview();fkBone.value=selected.name;
  activePole=null;
  fkControls.open=true;rotateGizmo?.setMode('translate');redrawFkControls();
  ikStatus.textContent=`${selected.name}を選択。${selected.effector}の追従は仮表示で確認してください。`;
});
poleChoose.addEventListener('click',()=>{
  const instanceId=choose.value||selectedId,target=controller?.getLoaded(instanceId);
  const pole=kneePoleFor(target,ikSelect.value);
  if(!pole||poleChoose.disabled||![...fkBone.options].some(option=>option.value===pole.thigh.name)){
    ikStatus.textContent='このPMXの膝方向操作は利用できません。IK定義と編集方法を確認してください。';return;
  }
  discardFkPreview();
  fkBone.value=pole.thigh.name;
  const frame=Number(fkFrame.value),row=activeFkRow(frame);
  const layer=motionEdits?.layers?.find(item=>!item.disabled&&
    item.instance_id===instanceId&&item.clip_id===row?.clip_id);
  const key=layer?.keys.find(item=>item.frame===frame&&item.bone===pole.thigh.name);
  const THREE=target.libs.THREE;
  const euler=key?new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().fromArray(key.rotation),'XYZ'):null;
  fkAxes.forEach((input,index)=>input.value=String(euler?[euler.x,euler.y,euler.z][index]*180/Math.PI:0));
  fkPosition.forEach((input,index)=>input.value=String(key?.position?.[index]??0));
  activePole={projectId:project.value,instanceId,clipId:row.clip_id,frame,bone:pole.thigh.name};
  fkControls.open=true;rotateGizmo?.setMode('pole');redrawFkControls();
  ikStatus.textContent=`${pole.knee.name}の現在位置を膝方向ハンドルに設定。ドラッグ後は仮表示を確認し、キー化してください。`;
});
fkPreview.addEventListener('click',()=>{
  try{
    previewCurrentFk();
  }catch(error){fkStatus.textContent='仮補正失敗: '+String(error.message||error);}
});
fkCancel.addEventListener('click',()=>{discardFkPreview();fkStatus.textContent='仮補正を破棄しました';});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&previewFk&&!rotateGizmo?.isDragging?.()){
    event.preventDefault();event.stopPropagation();
    discardFkPreview();fkStatus.textContent='仮補正を破棄しました';
  }
},true);
fkSave.addEventListener('click',async()=>{
  fkSave.disabled=true;
  try{
    const {row,key}=fkPayload();
    await writeFk('set',key,row);
    fkStatus.textContent='FKキーを作品に保存しました';
  }catch(error){fkStatus.textContent='FK保存失敗: '+String(error.message||error);}
  finally{redrawFkControls();}
});
fkSaved.addEventListener('change',()=>{
  if(!fkSaved.value){fkRemove.disabled=true;return;}
  const [frame,bone]=JSON.parse(fkSaved.value);
  const row=activeFkRow(frame);
  const layer=motionEdits?.layers?.find(item=>!item.disabled&&item.clip_id===row?.clip_id&&
    item.instance_id===(choose.value||selectedId));
  const key=layer?.keys.find(item=>item.frame===frame&&item.bone===bone);
  if(!key)return;
  activePole=null;fkFrame.value=String(frame);fkBone.value=bone;
  const target=controller.getLoaded(row.target_scene_instance_id),THREE=target.libs.THREE;
  const euler=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(key.rotation),'XYZ');
  fkAxes.forEach((input,index)=>input.value=String(Math.round([euler.x,euler.y,euler.z][index]*180/Math.PI*100)/100));
  fkPosition.forEach((input,index)=>input.value=String(key.position?.[index]??0));
  fkRemove.disabled=false;redrawFkControls();
});
fkRemove.addEventListener('click',async()=>{
  try{
    if(!fkSaved.value)throw Error('削除する保存キーを選択してください');
    const [frame,bone]=JSON.parse(fkSaved.value),row=activeFkRow(frame);
    const layer=motionEdits?.layers?.find(item=>!item.disabled&&item.clip_id===row?.clip_id&&
      item.instance_id===(choose.value||selectedId));
    const key=layer?.keys.find(item=>item.frame===frame&&item.bone===bone);
    if(!row||!key)throw Error('保存キーが見つかりません');
    await writeFk('remove',key,row);fkStatus.textContent='FKキーを削除しました';
  }catch(error){fkStatus.textContent='FK削除失敗: '+String(error.message||error);}
});
fkLayerSave.addEventListener('click',async()=>{
  const row=activeFkRow();
  const layer=motionEdits?.layers?.find(item=>!item.disabled&&item.instance_id===(choose.value||selectedId)&&item.clip_id===row?.clip_id);
  if(!row||!layer){fkStatus.textContent='保存済みレイヤーを選択してください';return;}
  const numbers=[fkWeight,fkStart,fkEnd,fkFadeIn,fkFadeOut].map(input=>Number(input.value));
  if([fkWeight,fkStart,fkEnd,fkFadeIn,fkFadeOut].some(input=>input.value.trim()==='')||
      numbers.some(n=>!Number.isFinite(n))||numbers.slice(1).some(n=>!Number.isInteger(n))){
    fkStatus.textContent='重みと区間・なじませを数値で指定してください';return;
  }
  fkLayerSave.disabled=true;
  try{await writeFk('layer-update',null,row,{layer_id:layer.id,settings:{
    weight:numbers[0]/100,start_frame:numbers[1],end_frame:numbers[2],
    fade_in_frames:numbers[3],fade_out_frames:numbers[4],muted:fkMuted.checked}});
    fkStatus.textContent='FKレイヤーを保存しました';
  }catch(error){fkStatus.textContent='レイヤー保存失敗: '+String(error.message||error);}
  finally{redrawFkControls();}
});
fkCandidate.addEventListener('click',async()=>{
  const row=activeFkRow(),id=project?.value;
  if(!row||!id||previewFk){fkCandidateStatus.textContent='保存済みキーのあるVMDクリップを選択し、仮補正を破棄してください。';return;}
  candidateValidation?.abort();candidateValidation=null;vmdCandidate=null;
  fkValidate.disabled=true;fkCandidate.disabled=true;fkCandidateLink.hidden=true;
  try{
    const response=await fetch('/api/studio/v05/motion/vmd-candidate',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        project_id:id,revision:motionEdits?.revision,
        instance_id:row.target_scene_instance_id,clip_id:row.clip_id})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
    if(project?.value!==id||!opened)return;
    vmdCandidate=data;
    fkCandidateLink.href=data.download_url;
    fkCandidateLink.download='MOTION010-検証前候補-'+data.candidate_id+'.vmd';
    fkCandidateLink.hidden=false;
    const sampling=data.sampling_report;
    const gate=sampling?`作品${sampling.checked_project_frames}Fを30fps候補と比較し、局所位置最大${sampling.max_position_error.toExponential(2)}・角度最大${sampling.max_angle_error_degrees.toExponential(2)}°。`:'';
    fkCandidateStatus.textContent=`別名候補を作成。骨${data.replaced_bone_keys}件を更新、${data.added_bone_keys}件を追加。${gate}元VMDは不変。実PMX往復の確認前で、作品への配置はしていません。`;
    fkValidate.disabled=false;
  }catch(error){fkCandidateStatus.textContent='候補作成不可: '+String(error.message||error);}
  finally{redrawFkControls();}
});
fkValidate.addEventListener('click',async()=>{
  if(candidateValidation){candidateValidation.abort();return;}
  const data=vmdCandidate,id=project?.value,row=activeFkRow();
  const instance=sceneSnapshot?.instances?.find(item=>item.id===data?.instance_id);
  const target=controller?.getLoaded(data?.instance_id);
  if(!data||!id||!row||row.clip_id!==data.clip_id||
      motionEdits?.revision!==data.revision||previewFk||!instance?.asset||!target){
    fkCandidateStatus.textContent='候補作成時の作品・補正・PMX・VMDを再確認してください。';return;
  }
  const layers=(motionEdits.layers||[]).filter(layer=>layer.instance_id===data.instance_id&&
    layer.clip_id===data.clip_id);
  const initial={id,revision:data.revision,sceneRevision:sceneSnapshot.revision,
    arrangementRevision:motionPlan?.arrangement_revision,nonce};
  const isCurrent=()=>opened&&project?.value===initial.id&&vmdCandidate===data&&
    (choose.value||selectedId)===data.instance_id&&
    motionEdits?.revision===initial.revision&&sceneSnapshot?.revision===initial.sceneRevision&&
    motionPlan?.arrangement_revision===initial.arrangementRevision&&nonce===initial.nonce;
  const abort=new AbortController();candidateValidation=abort;
  fkValidate.textContent='検査を中止';fkCandidate.disabled=true;
  try{
    fkCandidateStatus.textContent='候補・元VMD・PMXのSHA-256を照合中…';
    const report=await validatePmxVmdCandidate({libs:target.libs,modelAsset:instance.asset,
      motionAsset:row.motion_asset,row,layers,candidate:data,fps:projectFps,
      signal:abort.signal,isCurrent,onProgress:(done,total)=>{
        if(isCurrent())fkCandidateStatus.textContent=`実PMX全骨検査 ${done}/${total}標本。作品データは変更しません。`;
      }});
    if(!isCurrent())return;
    const location=`位置: ${report.positionClock}F${report.positionFrame} ${report.positionBone}、角度: ${report.angleClock}F${report.angleFrame} ${report.angleBone}`;
    fkCandidateStatus.textContent=`${report.passed?'実PMX検査合格':'実PMX検査不合格'}（物理OFF）。作品${report.checkedFrames}F＋VMD${report.checkedVmdFrames}F × ${report.bones}骨、位置最大${report.maxPosition.toExponential(3)}（上限${report.positionLimit}）、角度最大${report.maxAngle.toExponential(3)}°（上限${report.angleLimitDegrees}°）。${location}。候補は未登録・作品未配置です。`;
  }catch(error){
    if(isCurrent())fkCandidateStatus.textContent='実PMX検査を完了できません: '+String(error.message||error);
  }finally{
    if(candidateValidation===abort){candidateValidation=null;fkValidate.textContent='実PMXで全骨・全Fを検査';
      fkValidate.disabled=!vmdCandidate;redrawFkControls();}
  }
});
for(const [button,action] of [[fkUndo,'undo'],[fkRedo,'redo']])button.addEventListener('click',async()=>{
  button.disabled=true;
  try{await writeFk(action);fkStatus.textContent=action==='undo'?'FKキーを戻しました':'FKキーをやり直しました';}
  catch(error){fkStatus.textContent='FK履歴失敗: '+String(error.message||error);}
  finally{redrawFkControls();}
});
faceUseSeek.addEventListener('click',()=>{faceTime.value=String(Math.round(currentSeek()*1000)/1000);});
faceValue.addEventListener('input',()=>{faceValueText.textContent=Number(faceValue.value).toFixed(2);});
faceSaved.addEventListener('change',()=>{
  const key=sceneSnapshot?.face_keys?.[Number(faceSaved.value)];
  if(!faceSaved.value||!key)return;
  faceName.value=key.morph_name;faceTime.value=String(key.time);
  faceTrack.value=key.track||'expression';
  faceValue.value=String(key.value);faceValueText.textContent=key.value.toFixed(2);
  faceDelete.disabled=false;
});
async function writeFace(action,key){
  const id=project?.value;
  if(!id||!sceneSnapshot||sceneSnapshot.project_id!==id)throw Error('作品を選んでください');
  const response=await fetch('/api/studio/v05/scene/instances',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({project_id:id,action,revision:sceneSnapshot.revision,face_key:key})
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
  if(project?.value!==id||!opened)return;
  sceneSnapshot=data;
  redrawFaceControls();
  seekScene(currentSeek());
  window.dispatchEvent(new CustomEvent('bai:v96-face-saved',{detail:{projectId:id,revision:data.revision}}));
}
faceSave.addEventListener('click',async()=>{
  const instanceId=choose.value,name=faceName.value,time=Number(faceTime.value),value=Number(faceValue.value);
  if(!morphValues(controller?.getLoaded(instanceId)?.object).has(name)){
    faceStatus.textContent='実PMXにあるモーフを選んでください';return;
  }
  faceSave.disabled=true;
  try{await writeFace('face-set',{instance_id:instanceId,morph_name:name,time,value,
    track:faceTrack.value});
    faceStatus.textContent='表情キーを保存しました';
  }catch(error){faceStatus.textContent='保存失敗: '+String(error.message||error);}
  finally{faceSave.disabled=false;}
});
faceDelete.addEventListener('click',async()=>{
  const key=sceneSnapshot?.face_keys?.[Number(faceSaved.value)];
  if(!faceSaved.value||!key)return;
  faceDelete.disabled=true;
  try{await writeFace('face-remove',{instance_id:key.instance_id,morph_name:key.morph_name,time:key.time});
    faceStatus.textContent='表情キーを削除しました';
  }catch(error){faceStatus.textContent='削除失敗: '+String(error.message||error);}
  finally{faceDelete.disabled=!faceSaved.value;}
});
for(const [button,action] of [[faceUndo,'face-undo'],[faceRedo,'face-redo']]){
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{
      const id=project?.value;
      if(!id||sceneSnapshot?.project_id!==id)throw Error('作品を選んでください');
      const response=await fetch('/api/studio/v05/scene/instances',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:id,action,revision:sceneSnapshot.revision})
      });
      const data=await response.json();
      if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
      if(project?.value!==id||!opened)return;
      sceneSnapshot=data;redrawFaceControls();seekScene(currentSeek());
      faceStatus.textContent=action==='face-undo'?'表情キーを戻しました':'表情キーをやり直しました';
      window.dispatchEvent(new CustomEvent('bai:v96-face-saved',{detail:{projectId:id,revision:data.revision}}));
    }catch(error){redrawFaceControls();faceStatus.textContent='表情履歴の操作に失敗: '+String(error.message||error);}
  });
}
focusBtn.addEventListener('click',()=>{
  const id=choose.value;
  if(!id)return;
  request('/api/studio/v05/scene/instances?id='+encodeURIComponent(project.value)).then(data=>{
    if(!opened||project.value!==data.project_id)return;
    const entry=data.instances.find(x=>x.id===id);
    if(entry){viewport?.focusAt?.(entry.transform.position);viewport?.invalidate?.();}
  }).catch(e=>progress.textContent=String(e.message||e));
});
saveCameraBtn.addEventListener('click',async()=>{
  const id=project?.value;
  if(!id||!viewport||!sceneSnapshot||sceneSnapshot.project_id!==id||controller?.status().loaded<1)return;
  saveCameraBtn.disabled=true;
  cameraStatus.textContent='撮影視点を保存中…';
  try{
    const response=await fetch('/api/studio/v05/scene/instances',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:id,action:'camera',revision:sceneSnapshot.revision,
        camera:viewport.getCameraPose()})
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
    if(!opened||project?.value!==id)return;
    sceneSnapshot=data;
    viewport.applyCameraPose(data.camera);
    cameraStatus.textContent='撮影視点を作品へ保存しました';
    window.dispatchEvent(new CustomEvent('bai:v58-camera-saved',{detail:{projectId:id,revision:data.revision}}));
  }catch(error){cameraStatus.textContent='撮影視点を保存できません: '+String(error.message||error);}
  finally{saveCameraBtn.disabled=false;}
});
restoreCameraBtn.addEventListener('click',()=>{
  if(!viewport||!sceneSnapshot)return;
  if(sceneSnapshot.camera)viewport.applyCameraPose(sceneSnapshot.camera);
  else viewport.fit?.();
  cameraStatus.textContent=sceneSnapshot.camera?'保存済みカメラへ戻しました':'保存カメラがないため自動構図へ戻しました';
});
clipSelect.addEventListener('change',()=>{
  const row=(motionPlan?.rows||[]).find(x=>x.clip_id===clipSelect.value);
  targetSelect.value=row?.target_scene_instance_id||'';
});
assignBtn.addEventListener('click',async()=>{
  if(!motionPlan||!project?.value||!clipSelect.value)return;
  const originalProject=project.value;
  assignBtn.disabled=true;
  try{
    const response=await fetch('/api/studio/v05/scene/motion-target',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:originalProject,clip_id:clipSelect.value,
        instance_id:targetSelect.value||null,revision:motionPlan.arrangement_revision})
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'HTTP '+response.status);
    if(project.value!==originalProject)return;
    await reload();
  }catch(error){motionStatus.textContent=String(error.message||error);}
  finally{assignBtn.disabled=false;}
});
seekBtn.addEventListener('click',()=>{
  const seconds=Number(seekInput.value);
  if(!Number.isFinite(seconds)||seconds<0){motionStatus.textContent=tr('badTime');return;}
  if(window.BAIStudioTimeline?.seek)window.BAIStudioTimeline.seek(seconds,'multi-preview');
  else seekScene(seconds);
});
window.addEventListener('bai:timeline-seek',event=>{
  if(opened&&(event.detail?.projectId==null||event.detail?.projectId===project?.value)
    &&Number.isFinite(event.detail?.seconds))seekScene(event.detail.seconds);
});
window.addEventListener('bai:v05-media-frame',event=>{
  if(opened&&event.detail?.projectId===project?.value&&Number.isFinite(event.detail?.seconds))
    seekScene(event.detail.seconds);
});
window.addEventListener('bai:studio-persisted-seek',event=>{
  if(opened&&event.detail?.projectId===project?.value&&Number.isFinite(event.detail?.seconds))
    seekScene(event.detail.seconds);
});
window.addEventListener('bai:remote-playhead-updated',event=>{
  if(opened&&event.detail?.projectId===project?.value&&Number.isFinite(event.detail?.seconds))
    seekScene(event.detail.seconds);
});
closeBtn.addEventListener('click',close);
modeBtn.addEventListener('click',()=>{open({composite:!composite}).catch(e=>progress.textContent=e.message);});
footRun.addEventListener('click',async()=>{
  if(!footGround.value.trim()||!Number.isFinite(Number(footGround.value))){
    footStatus.textContent='床のY座標を数値で指定してください';return;
  }
  footRun.disabled=true;footStatus.textContent='実ポーズを測定中…';footDetails.textContent='';
  try{
    const sample=await sampleFootContact(choose.value||selectedId,Number(footGround.value));
    const response=await fetch('/api/qa/dual-foot-preview',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({left_samples:sample.samples.left,right_samples:sample.samples.right,
        ground_y:sample.groundY})
    });
    const report=await response.json();
    if(!response.ok)throw Error(report.error||`HTTP ${response.status}`);
    if(!opened||project?.value!==sample.projectId||nonce!==sample.token||
       motionPlan?.arrangement_revision!==sample.arrangementRevision||
       controller?.getLoaded(sample.instanceId)==null||
       (choose.value||selectedId)!==sample.instanceId){
      if(opened)footStatus.textContent='作品または選択が変わったため診断結果を破棄しました';
      return;
    }
    const count=side=>`${side.contact_intervals.length}区間・滑り${side.drift_frames.length}F・床下${side.penetrations.length}F`;
    const yRange=side=>{
      const heights=sample.samples[side].map(row=>row.position[1]);
      return [Math.min(...heights),Math.max(...heights)];
    };
    const ranges={left:yRange('left'),right:yRange('right')};
    footStatus.textContent=`F${sample.startFrame}〜${sample.lastFrame}：左 ${count(report.left)}／右 ${count(report.right)}。両足補正の競合${report.conflict_frames.length}F。`+
      ` つま先Y 左${ranges.left.map(x=>x.toFixed(3)).join('〜')}・右${ranges.right.map(x=>x.toFixed(3)).join('〜')}。`+
      (!report.left.contact_intervals.length&&!report.right.contact_intervals.length?' 接地区間なし。床Yと動作区間を確認してください。':'');
    footDetails.textContent=JSON.stringify({point:sample.point,clipId:sample.clipId,
      fps:sample.fps,startFrame:sample.startFrame,lastFrame:sample.lastFrame,
      samplesPerFoot:sample.samples.left.length,groundY:sample.groundY,heightRange:ranges,
      left:report.left,right:report.right,conflictFrames:report.conflict_frames,
      limitations:report.limitations},null,2);
  }catch(error){footStatus.textContent='診断失敗: '+String(error?.message||error);}
  finally{footRun.disabled=false;}
});
project?.addEventListener('change',()=>{if(opened)reload();});
window.addEventListener('bai:v58-preview-open',()=>{open().catch(e=>progress.textContent=e.message);});
window.addEventListener('bai:v57-scene-changed',()=>{if(opened)reload();});
window.addEventListener('bai:v98-face-moved',event=>{
  if(opened&&event.detail?.projectId===project?.value)void reload();
});
window.addEventListener('bai:v101-face-value',async event=>{
  const id=event.detail?.projectId,time=event.detail?.time;
  if(!opened||id!==project?.value)return;
  await reload();
  if(opened&&id===project?.value&&Number.isFinite(time))seekScene(time);
});
window.addEventListener('bai:v98-face-key-select',async event=>{
  const key=event.detail?.key,projectId=event.detail?.projectId;
  if(captureMode||!key||projectId!==project?.value)return;
  try{
    await open({composite:true});
    if(project?.value!==projectId||!opened)return;
    choose.value=key.instance_id;
    selectedId=key.instance_id;
    spatialEditor?.select(selectedId);
    redrawFaceControls();
    const index=sceneSnapshot?.face_keys?.findIndex(row=>row.instance_id===key.instance_id&&
      row.morph_name===key.morph_name&&row.time===key.time);
    if(index>=0){faceSaved.value=String(index);faceSaved.dispatchEvent(new Event('change'));}
    if(window.BAIStudioTimeline?.seek)await window.BAIStudioTimeline.seek(key.time,'face-key');
    else seekScene(key.time);
  }catch(error){faceStatus.textContent='表情キーを開けません: '+String(error.message||error);}
});
window.addEventListener('bai:v106-fk-saved',async event=>{
  const id=event.detail?.projectId;
  if(!opened||!id||project?.value!==id||motionEdits?.revision===event.detail?.revision)return;
  try{
    const data=await request('/api/studio/v05/motion-edits?id='+encodeURIComponent(id));
    if(!opened||project?.value!==id)return;
    motionEdits=data;previewFk=null;applyAllMotionEdits();
    seekScene(Number(seekInput.value)||currentSeek());redrawFkControls();
  }catch(error){fkStatus.textContent='FK補正再読込失敗: '+String(error.message||error);}
});
window.addEventListener('bai:v106-fk-key-select',async event=>{
  const {projectId,instanceId,clipId,key} = event.detail||{};
  if(captureMode||projectId!==project?.value||!key)return;
  try{
    await open({composite:true});
    if(!opened||project.value!==projectId)return;
    choose.value=instanceId;selectedId=instanceId;spatialEditor?.select(instanceId);
    fkFrame.value=String(key.frame);fkBone.value=key.bone;
    if(window.BAIStudioTimeline?.seek)await window.BAIStudioTimeline.seek(key.frame/projectFps,'fk-key');
    else seekScene(key.frame/projectFps);
    fkControls.open=true;redrawFkControls();
    const layer=motionEdits?.layers?.find(item=>item.instance_id===instanceId&&item.clip_id===clipId);
    if(layer?.keys.some(saved=>saved.frame===key.frame&&saved.bone===key.bone)){
      fkSaved.value=JSON.stringify([key.frame,key.bone]);fkSaved.dispatchEvent(new Event('change'));
    }
  }catch(error){fkStatus.textContent='FKキーを開けません: '+String(error.message||error);}
});
window.addEventListener('pagehide',close,{once:true});
window.BAIStudioMultiScenePreview=Object.freeze({
  open,refresh:reload,close,
  sampleFootContact,
  status:()=>({...controller?.status(),motion:motionCoordinator?.status(),opened,composite,ready:reloadReady,
    rendererReady:Boolean(viewport),renderer:viewport?.rendererName||null,
    cameraSaved:Boolean(sceneSnapshot?.camera),camera:viewport?.getCameraPose?.()||null,
    gizmo:rotateGizmo?.probe?.()||null,renderingVerified:false}),
  poseProbe(instanceId,boneNames){
    if(!opened||!controller||!Array.isArray(boneNames)||boneNames.length>16||
       boneNames.some(name=>typeof name!=='string'||name.length>100))return null;
    const target=controller.getLoaded(instanceId);
    if(!target?.object)return null;
    const wanted=new Set(boneNames);
    const bones={};
    target.object.updateMatrixWorld(true);
    target.object.traverse(node=>{
      if(!node.isBone||!wanted.has(node.name))return;
      bones[node.name]={position:node.position.toArray(),quaternion:node.quaternion.toArray(),
        world:node.matrixWorld.elements.slice()};
    });
    return {projectId:project?.value,instanceId,bones};
  },
  morphProbe(instanceId){
    const target=controller?.getLoaded(instanceId);
    if(!opened||!target?.object||target.format!=='PMX')return null;
    const names=morphValues(target.object);
    return {projectId:project?.value,instanceId,morphs:Object.fromEntries(names)};
  },
  refit(){return viewport?.fit?.()||false;},
  captureFrame(frame,fps,width,height){
    if(!captureMode||!opened||!reloadReady||!composite||!viewport||!controller||
       project?.value!==sceneSnapshot?.project_id||!Number.isInteger(frame)||
       !Number.isFinite(fps)||fps<=0||!Number.isInteger(width)||!Number.isInteger(height)||
       width<16||height<16||width>1920||height>1080||controller.status().loaded<1)
      throw Error('3D capture is not ready for this saved project');
    const motion=motionCoordinator?.status();
    if(motion?.issues?.length)throw Error('3D motion has unresolved issues');
    for(const instance of sceneSnapshot?.instances||[]){
      const target=controller?.getLoaded(instance.id);
      if(target?.format==='PMX')resetMorphs(target.object);
    }
    const result=motionCoordinator?.seek(frame/fps);
    if(result?.errors?.length)throw Error('3D motion seek failed: '+result.errors.map(x=>String(x.error?.message||x.error)).join('; '));
    const missing=applySavedFace(frame/fps);
    if(missing.length)throw Error('Saved face morph not found: '+missing.join(', '));
    // The capture page has no transform gizmo. Render synchronously after the
    // exact motion seek; preserveDrawingBuffer keeps the transparent pixels.
    viewport.renderer.setPixelRatio(1);
    viewport.renderer.setSize(width,height,false);
    if(viewport.camera.isPerspectiveCamera){
      viewport.camera.aspect=width/height;
      viewport.camera.updateProjectionMatrix();
    }
    viewport.renderer.render(viewport.scene,viewport.camera);
    return viewport.renderer.domElement.toDataURL('image/png');
  },
  frameProbe(instanceId){
    const target=controller?.getLoaded(instanceId);
    if(!opened||!target?.root||!viewport)return null;
    const THREE=target.libs.THREE;
    const bounds=(object,precise=false)=>{
      const box=new THREE.Box3().setFromObject(object,precise);
      return box.isEmpty()?null:{min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new THREE.Vector3()).toArray()};
    };
    target.root.updateMatrixWorld(true);
    return {projectId:project?.value,instanceId,
      root:bounds(target.root),object:bounds(target.object),precise:bounds(target.object,true),
      camera:viewport.camera.position.toArray(),target:viewport.controls.target.toArray(),
      fov:viewport.camera.fov,cameraSaved:Boolean(sceneSnapshot?.camera),
      renderer:viewport.rendererName,canvas:[viewport.renderer.domElement.width,viewport.renderer.domElement.height]};
  }
});
window.dispatchEvent(new Event('bai:v58-ui-ready'));

// Browser-local WebMCP is deliberately separate from the saved scene tools.
// Standard MCP exposes a read-only placement plan; GPU canvas lives here.
if(document.modelContext?.registerTool){
  for(const spec of [
    {name:'bai_studio_multi_preview_open',description:'Open shared 3D preview for the currently selected project; local browser only.',
     inputSchema:{type:'object',properties:{project_id:{type:'string'}},required:['project_id'],additionalProperties:false},
     async execute({project_id}){if(!project_id||project?.value!==project_id)throw Error(tr('mismatch'));await open();return {ok:true,...window.BAIStudioMultiScenePreview.status()};}},
    {name:'bai_studio_multi_preview_status',description:'Read local browser multi-model preview state.',
     inputSchema:{type:'object',properties:{},additionalProperties:false},
     async execute(){return window.BAIStudioMultiScenePreview.status();}},
    {name:'bai_studio_pmx_fk_edits_get',description:'Read saved project PMX FK keys and source match status.',
     readOnly:true,inputSchema:{type:'object',properties:{project_id:{type:'string'}},
       required:['project_id'],additionalProperties:false},
     async execute({project_id}){return request('/api/studio/v05/motion-edits?id='+encodeURIComponent(project_id));}},
    {name:'bai_studio_pmx_fk_edits_mutate',description:'Save/remove/move a PMX correction key, atomically save an arm and elbow pair, update its layer or limb edit mode, or undo/redo with revision.',
     inputSchema:{type:'object',properties:{project_id:{type:'string'},revision:{type:'integer'},
       action:{type:'string',enum:['set','arm-set','remove','move','layer-update','mode-set','undo','redo']},instance_id:{type:'string'},clip_id:{type:'string'},
       limb:{type:'string',enum:['left_arm','right_arm','left_leg','right_leg']},mode:{type:'string',enum:['FK','IK']},
       layer_id:{type:'string'},to_frame:{type:'integer'},settings:{type:'object',properties:{
         name:{type:'string'},weight:{type:'number'},muted:{type:'boolean'},start_frame:{type:'integer'},
         end_frame:{type:'integer'},fade_in_frames:{type:'integer'},fade_out_frames:{type:'integer'}},additionalProperties:false},
       key:{type:'object',properties:{frame:{type:'integer'},bone:{type:'string'},
         rotation:{type:'array',items:{type:'number'},minItems:4,maxItems:4},
         position:{type:'array',items:{type:'number'},minItems:3,maxItems:3}},
         required:['frame','bone','rotation'],additionalProperties:false},
       keys:{type:'array',minItems:2,maxItems:2,items:{type:'object',properties:{
         frame:{type:'integer'},bone:{type:'string'},
         rotation:{type:'array',items:{type:'number'},minItems:4,maxItems:4},
         position:{type:'array',items:{type:'number'},minItems:3,maxItems:3}},
         required:['frame','bone','rotation'],additionalProperties:false}}},
       required:['project_id','revision','action'],additionalProperties:false},
     async execute(input){
       if(captureMode)throw Error('撮影中にFK補正は変更できません');
       const response=await fetch('/api/studio/v05/motion-edits',{
         method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
       const data=await response.json();
       if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
       if(opened&&project?.value===input.project_id){motionEdits=data;previewFk=null;
         applyAllMotionEdits();seekScene(Number(seekInput.value)||currentSeek());redrawFkControls();}
       window.dispatchEvent(new CustomEvent('bai:v106-fk-saved',{detail:{projectId:input.project_id,revision:data.revision}}));
       return data;
     }},
    {name:'bai_studio_pmx_vmd_candidate_create',
     description:'Create a review-only VMD from saved whole-clip constant PMX correction keys. PMX roundtrip and project placement are not performed.',
     inputSchema:{type:'object',properties:{project_id:{type:'string'},revision:{type:'integer'},
       instance_id:{type:'string'},clip_id:{type:'string'}},
       required:['project_id','revision','instance_id','clip_id'],additionalProperties:false},
     async execute(input){
       const response=await fetch('/api/studio/v05/motion/vmd-candidate',{
         method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
       const data=await response.json();
       if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
       return data;
     }}
  ]) {
    Promise.resolve(document.modelContext.registerTool({
      name:spec.name,description:spec.description,inputSchema:spec.inputSchema,
      annotations:{readOnlyHint:Boolean(spec.readOnly||spec.name.endsWith('_status'))},
      execute:async input=>{
        try{return {content:[{type:'text',text:JSON.stringify(await spec.execute(input||{}))}]};}
        catch(e){return {content:[{type:'text',text:JSON.stringify({ok:false,error:String(e.message||e)})}],isError:true};}
      }
    })).catch(error=>console.warn('v58 WebMCP registration',spec.name,error));
  }
}

// Language packs are the only source of translated user-facing labels.
async function applyLanguage(){
  const lang=localStorage.getItem('bai.ui.lang')==='en'?'en':'jp';
  try{
    const r=await fetch('./locales/'+lang+'.json');
    if(!r.ok)throw Error('Locale '+r.status);
    locale=(await r.json()).v58||{};
    title.textContent=tr('title');choose.setAttribute('aria-label',tr('select'));
    refreshBtn.textContent=tr('refresh');focusBtn.textContent=tr('focus');
    saveCameraBtn.textContent=tr('saveCamera');restoreCameraBtn.textContent=tr('restoreCamera');
    closeBtn.textContent=tr('close');hint.textContent=tr('renderingNote');
    assignBtn.textContent=tr('assignMotion');seekBtn.textContent=tr('seek');motionStatus.textContent='';
    clipSelect.setAttribute('aria-label',tr('chooseMotion'));
    targetSelect.setAttribute('aria-label',tr('chooseModel'));
    if(controller)updateStatus(controller.status());
    redrawMotionControls();
  }catch(error){console.warn('v58 locales',error);}
}
document.getElementById('langChoice')?.addEventListener('change',()=>{applyLanguage();});
applyLanguage();
