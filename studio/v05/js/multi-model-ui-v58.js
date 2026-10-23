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

const project=document.getElementById('v06project');
let locale={};
const tr=(key)=>locale[key]||({
  title:'複数モデルの3D表示',renderingNote:'同じ3D空間で別々のモデルを表示します（実GPU動作は未検証）。',
  select:'表示対象モデル',refresh:'配置を再読み込み',focus:'選択モデルに注目',close:'閉じる',
  choose:'モデルを選択',loadedCount:'読込モデル',problems:'問題',chooseProject:'作品を選んでください',
  loading:'3Dモデルを読み込み中…',loadFailed:'読み込み失敗',runtimeError:'描画できません',mismatch:'作品が一致しません'
})[key]||key;
const section=document.getElementById('v57-scene-instances');
let controller=null,viewport=null,motionCoordinator=null,motionPlan=null,opened=false,nonce=0,selectedId='';
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
const closeBtn=document.createElement('button');closeBtn.textContent=tr('close');
const progress=document.createElement('span');progress.setAttribute('role','status');progress.style.cssText='color:#c8d9ea';
const clipSelect=document.createElement('select');clipSelect.setAttribute('aria-label','モーション');
const targetSelect=document.createElement('select');targetSelect.setAttribute('aria-label','適用するモデル');
const assignBtn=document.createElement('button');assignBtn.type='button';
const seekInput=document.createElement('input');seekInput.type='number';seekInput.min='0';seekInput.step='0.03333';seekInput.value='0';seekInput.style.width='75px';
const seekBtn=document.createElement('button');seekBtn.type='button';
const motionStatus=document.createElement('span');motionStatus.setAttribute('role','status');
heading.append(title,choose,refreshBtn,focusBtn,closeBtn);
const motionControls=document.createElement('div');motionControls.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap';
motionControls.append(clipSelect,targetSelect,assignBtn,seekInput,seekBtn,motionStatus);
const canvasParent=document.createElement('div');
canvasParent.id='v58-canvas';
canvasParent.style.cssText='position:relative;min-height:230px;flex:1;background:#111827;overflow:hidden;border:1px solid #435a73;';
const footer=document.createElement('div');footer.style.cssText='display:flex;justify-content:space-between;gap:8px;';
const hint=document.createElement('small');
hint.textContent=tr('renderingNote');
footer.append(progress,hint);
panel.append(heading,motionControls,canvasParent,footer);
document.body.append(panel);
panel.hidden=true;panel.style.display='none';

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
  motionStatus.textContent=motionCoordinator?`${tr('motionReady')}: ${motionCoordinator.status().loadedClips.length}`:'';
}
function currentSeek(){
  const persisted=window.BAIStudioPersistedSeek?.status?.();
  const value=persisted?.projectId===project?.value
    ?persisted.seconds:window.BAIStudioTimeline?.getTime?.();
  return Number.isFinite(value)&&value>=0?value:0;
}
function seekScene(seconds){
  if(!opened||!motionCoordinator)return;
  try{
    const result=motionCoordinator.seek(seconds);
    if(result?.errors?.length)motionStatus.textContent=result.errors.map(x=>String(x.error?.message||x.error)).join('; ');
    seekInput.value=String(seconds);
  }catch(error){motionStatus.textContent=String(error.message||error);}
}
async function setup(){
  const token=nonce;
  const libs=await loadLibs();
  if(token!==nonce||!opened)throw Error('プレビューは閉じられました');
  viewport=createViewport(canvasParent,libs,{freeDolly:true});
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
  motionCoordinator=window.BAIStudioMultiMotionV59.createCoordinator({
    controller,loadMotion:loadInstanceMotion,
    onChange:()=>{if(opened)redrawMotionControls();},
    onError:({clipId,error})=>{motionStatus.textContent=clipId+': '+String(error.message||error);}
  });
}
async function reload(){
  if(!opened)return;
  const id=project?.value;
  if(!id){progress.textContent=tr('chooseProject');return;}
  const thisNonce=++nonce;
  progress.textContent=tr('loading');
  try{
    if(!controller)await setup();
    if(thisNonce!==nonce||!opened)return;
    const data=await request('/api/studio/v05/scene/instances?id='+encodeURIComponent(id));
    if(thisNonce!==nonce||!opened||id!==project.value)return;
    const result=await controller.reconcile(data);
    if(thisNonce!==nonce||!opened)return;
    const plan=await request('/api/studio/v05/scene/multi-motion-plan?id='+encodeURIComponent(id));
    if(thisNonce!==nonce||!opened||id!==project.value)return;
    motionPlan=plan;
    const motionResult=await motionCoordinator.reconcile(plan);
    if(thisNonce!==nonce||!opened)return;
    updateStatus(controller.status(),[...(result.issues||[]),...(motionResult.issues||[])]);
    redrawMotionControls();
    seekScene(currentSeek());
    viewport.fit?.();
    viewport.invalidate?.();
  }catch(error){if(thisNonce===nonce&&opened)progress.textContent=tr('loadFailed')+': '+String(error?.message||error);}
}
async function open(){
  if(opened){await reload();return;}
  // The legacy viewport owns a globally singleton Three.js host.
  // End it first; never overlap two GL contexts and two animation owners.
  window.BAIStudioScenePreview?.close();
  opened=true;panel.hidden=false;panel.style.display='flex';
  await reload();
}
function close(){
  nonce++;opened=false;
  motionCoordinator?.dispose();motionCoordinator=null;motionPlan=null;
  controller?.dispose();controller=null;
  viewport?.dispose();viewport=null;
  panel.hidden=true;panel.style.display='none';choose.replaceChildren();
  progress.textContent='';
}
refreshBtn.addEventListener('click',reload);
choose.addEventListener('change',()=>{selectedId=choose.value;});
focusBtn.addEventListener('click',()=>{
  const id=choose.value;
  if(!id)return;
  request('/api/studio/v05/scene/instances?id='+encodeURIComponent(project.value)).then(data=>{
    if(!opened||project.value!==data.project_id)return;
    const entry=data.instances.find(x=>x.id===id);
    if(entry){viewport?.focusAt?.(entry.transform.position);viewport?.invalidate?.();}
  }).catch(e=>progress.textContent=String(e.message||e));
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
window.addEventListener('bai:studio-persisted-seek',event=>{
  if(opened&&event.detail?.projectId===project?.value&&Number.isFinite(event.detail?.seconds))
    seekScene(event.detail.seconds);
});
window.addEventListener('bai:remote-playhead-updated',event=>{
  if(opened&&event.detail?.projectId===project?.value&&Number.isFinite(event.detail?.seconds))
    seekScene(event.detail.seconds);
});
closeBtn.addEventListener('click',close);
project?.addEventListener('change',()=>{if(opened)reload();});
window.addEventListener('bai:v58-preview-open',()=>{open().catch(e=>progress.textContent=e.message);});
window.addEventListener('bai:v57-scene-changed',()=>{if(opened)reload();});
window.addEventListener('pagehide',close,{once:true});
window.BAIStudioMultiScenePreview=Object.freeze({
  open,refresh:reload,close,
  status:()=>({...controller?.status(),motion:motionCoordinator?.status(),opened,rendererReady:Boolean(viewport),renderingVerified:false})
});

// Browser-local WebMCP is deliberately separate from the saved scene tools.
// Standard MCP exposes a read-only placement plan; GPU canvas lives here.
if(document.modelContext?.registerTool){
  for(const spec of [
    {name:'bai_studio_multi_preview_open',description:'Open shared 3D preview for the currently selected project; local browser only.',
     inputSchema:{type:'object',properties:{project_id:{type:'string'}},required:['project_id'],additionalProperties:false},
     async execute({project_id}){if(!project_id||project?.value!==project_id)throw Error(tr('mismatch'));await open();return {ok:true,...window.BAIStudioMultiScenePreview.status()};}},
    {name:'bai_studio_multi_preview_status',description:'Read local browser multi-model preview state.',
     inputSchema:{type:'object',properties:{},additionalProperties:false},
     async execute(){return window.BAIStudioMultiScenePreview.status();}}
  ]) {
    Promise.resolve(document.modelContext.registerTool({
      name:spec.name,description:spec.description,inputSchema:spec.inputSchema,
      annotations:{readOnlyHint:spec.name.endsWith('_status')},
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
