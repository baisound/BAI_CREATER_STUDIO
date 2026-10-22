/* Persist focus target selection; applying a pose requires a loaded 3D model. */
(function(root){'use strict';
function controller({read,save,apply=()=>{},notify=()=>{}}){
 let id=null,revision=0,epoch=0;
 async function select(project){const n=++epoch;id=project?.id||null;revision=0;if(!id)return null;
   try{const data=await read(id);if(n!==epoch)return null;if(data.project_id!==id)throw Error('Project mismatch');revision=data.revision;apply(data);return data;}
   catch(e){if(n===epoch)notify('追従設定の読込失敗: '+e.message);return null;}}
 async function set(values){if(!id)throw Error('作品を選択してください');const current=id,n=epoch;
   const data=await save({...values,project_id:current,revision});if(n!==epoch||id!==current)return null;
   if(data.project_id!==current||data.revision!==revision+1)throw Error('Invalid save response');revision=data.revision;apply(data);return data;}
 return {select,set};
}
function createSelectionRegistry(){
 const models=new Map();
 function normalizeBones(object){
   const bones=new Set();object?.traverse?.(node=>{if(node?.name&&(node.isBone||node.type==='Bone'))bones.add(node.name);});
   return [...bones].sort((a,b)=>a.localeCompare(b));
 }
 return {add(id,object){if(!id||!object)throw new TypeError('Loaded model required');models.set(id,{bones:normalizeBones(object)});},remove(id){models.delete(id);},list(){return [...models].map(([id,value])=>({id,bones:[...value.bones]}));},bones(id){return [...(models.get(id)?.bones||[])];}};
}
function install(){const panel=document.createElement('section');panel.id='v37-focus-target';panel.style.cssText='padding:12px;border:1px solid #35475b;border-radius:8px;margin:10px;background:#1b2531;color:#e8edf5';
 panel.innerHTML='<strong>ピント追従先（作品ごと）</strong><p style="font-size:11px;color:#aabbd0">3Dモデルと必要ならボーン名を指定。実際の追従にはモデル読込が必要です。</p><label>モデル <select id="v37-model"></select></label> <label>追従ボーン <select id="v37-bone"></select></label> <label><input id="v37-enabled" type="checkbox"> ピント追従を有効にする</label> <button id="v37-save" type="button">保存</button><div id="v37-status" role="status">作品を選択してください</div>';
 const right=document.querySelector('.right')||document.body;right.append(panel);
 const get=k=>panel.querySelector('#v37-'+k),status=get('status');
 const registry=createSelectionRegistry();
 let storedModel='',storedBone='';
 function option(value,label){const el=document.createElement('option');el.value=value;el.textContent=label;return el;}
 function renderModels(){const sel=get('model'),current=sel.value||storedModel;sel.replaceChildren(option('','モデルを選択'));for(const model of registry.list())sel.append(option(model.id,model.id));if(current&&!registry.list().some(m=>m.id===current))sel.append(option(current,current+'（未読込）'));sel.value=current||'';renderBones();}
 function renderBones(){const sel=get('bone'),model=get('model').value,desired=storedModel===model?storedBone:sel.value;sel.replaceChildren(option('','モデル全体（原点）'));for(const bone of registry.bones(model))sel.append(option(bone,bone));if(desired&&!registry.bones(model).includes(desired))sel.append(option(desired,desired+'（未確認）'));sel.value=desired||'';}
 get('model').addEventListener('change',()=>{storedModel=get('model').value;storedBone='';renderBones();});
 get('bone').addEventListener('change',()=>{storedBone=get('bone').value;});
 root.addEventListener('bai:focus-model-available',e=>{if(e.detail?.modelId&&e.detail?.object){registry.add(e.detail.modelId,e.detail.object);renderModels();if(storedModel===e.detail.modelId&&get('enabled').checked)root.BAIStudioFocusFollowRuntime?.setTarget?.(storedModel,storedBone);}});
 root.addEventListener('bai:focus-model-removed',e=>{if(e.detail?.modelId){registry.remove(e.detail.modelId);renderModels();}});
 renderModels();
 const req=async(url,opts)=>{const r=await fetch(url,opts);const d=await r.json();if(!r.ok)throw Error(d.error||('HTTP '+r.status));return d};
 const ctl=controller({read:id=>req('/api/studio/v05/focus-target?id='+encodeURIComponent(id)),save:data=>req('/api/studio/v05/focus-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),apply:data=>{storedModel=data.model_id||'';storedBone=data.bone_name||'';renderModels();get('enabled').checked=!!data.enabled;root.BAIStudioFocusFollowRuntime?.setTarget?.(data.enabled?data.model_id:null,data.bone_name||'');root.dispatchEvent(new CustomEvent('bai:focus-target-setting',{detail:data}));status.textContent=data.model_id&&!registry.list().some(m=>m.id===data.model_id)?'追従設定保存済み：対象モデルは未読込':'追従設定を読み込みました'},notify:msg=>status.textContent=msg});
 root.addEventListener('bai:project-selected',e=>{void ctl.select(e.detail?.project)});
 get('save').addEventListener('click',async()=>{get('save').disabled=true;try{const model=get('model').value.trim()||null,bone=get('bone').value.trim()||null;const r=await ctl.set({model_id:model,bone_name:bone,enabled:get('enabled').checked});status.textContent=r?'追従先を保存しました':'作品切替により保存結果を破棄';}catch(e){status.textContent='保存失敗: '+e.message}finally{get('save').disabled=false}});
 return {...ctl,registry};
}
root.BAIStudioFocusTargetV37={controller,createSelectionRegistry,install};
})(typeof window!=='undefined'?window:globalThis);
