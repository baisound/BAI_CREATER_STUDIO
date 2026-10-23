/* v58 - real multi-instance Three.js preview.
 * Uses a single viewport renderer and physically separate loaded objects
 * (including skeletons) per scene instance. Animation wiring is stage 59.
 */
import {loadLibs,loadModel,disposeObject} from '../../js/viewport/model-loader.js';
import {normalizeModel} from '../../js/viewport/normalize.fork.js';
import {createViewport} from '../../js/viewport/three-host.js';

const project=document.getElementById('v06project');
let locale={};
const tr=(key)=>locale[key]||({
  title:'複数モデルの3D表示',renderingNote:'同じ3D空間で別々のモデルを表示します（実GPU動作は未検証）。',
  select:'表示対象モデル',refresh:'配置を再読み込み',focus:'選択モデルに注目',close:'閉じる',
  choose:'モデルを選択',loadedCount:'読込モデル',problems:'問題',chooseProject:'作品を選んでください',
  loading:'3Dモデルを読み込み中…',loadFailed:'読み込み失敗',runtimeError:'描画できません',mismatch:'作品が一致しません'
})[key]||key;
const section=document.getElementById('v57-scene-instances');
let controller=null,viewport=null,opened=false,nonce=0,selectedId='';
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
heading.append(title,choose,refreshBtn,focusBtn,closeBtn);
const canvasParent=document.createElement('div');
canvasParent.id='v58-canvas';
canvasParent.style.cssText='position:relative;min-height:230px;flex:1;background:#111827;overflow:hidden;border:1px solid #435a73;';
const footer=document.createElement('div');footer.style.cssText='display:flex;justify-content:space-between;gap:8px;';
const hint=document.createElement('small');
hint.textContent=tr('renderingNote');
footer.append(progress,hint);
panel.append(heading,canvasParent,footer);
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
        let disposed=false;
        return {root,dispose(){if(disposed)return;disposed=true;root.remove(object);disposeObject(object);}};
      }catch(error){disposeObject(object);throw error;}
    }
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
    updateStatus(controller.status(),result.issues||[]);
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
closeBtn.addEventListener('click',close);
project?.addEventListener('change',()=>{if(opened)reload();});
window.addEventListener('bai:v58-preview-open',()=>{open().catch(e=>progress.textContent=e.message);});
window.addEventListener('bai:v57-scene-changed',()=>{if(opened)reload();});
window.addEventListener('pagehide',close,{once:true});
window.BAIStudioMultiScenePreview=Object.freeze({
  open,refresh:reload,close,
  status:()=>({...controller?.status(),opened,rendererReady:Boolean(viewport),renderingVerified:false})
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
    if(controller)updateStatus(controller.status());
  }catch(error){console.warn('v58 locales',error);}
}
document.getElementById('langChoice')?.addEventListener('change',()=>{applyLanguage();});
applyLanguage();
