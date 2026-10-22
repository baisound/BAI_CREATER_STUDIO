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
function install(){const panel=document.createElement('section');panel.id='v37-focus-target';panel.style.cssText='padding:12px;border:1px solid #35475b;border-radius:8px;margin:10px;background:#1b2531;color:#e8edf5';
 panel.innerHTML='<strong>ピント追従先（作品ごと）</strong><p style="font-size:11px;color:#aabbd0">3Dモデルと必要ならボーン名を指定。実際の追従にはモデル読込が必要です。</p><label>モデルID <input id="v37-model" placeholder="model-001"></label> <label>ボーン名 <input id="v37-bone" placeholder="Head（省略可）"></label> <label><input id="v37-enabled" type="checkbox"> ピント追従を有効にする</label> <button id="v37-save" type="button">保存</button><div id="v37-status" role="status">作品を選択してください</div>';
 const right=document.querySelector('.right')||document.body;right.append(panel);
 const get=k=>panel.querySelector('#v37-'+k),status=get('status');
 const req=async(url,opts)=>{const r=await fetch(url,opts);const d=await r.json();if(!r.ok)throw Error(d.error||('HTTP '+r.status));return d};
 const ctl=controller({read:id=>req('/api/studio/v05/focus-target?id='+encodeURIComponent(id)),save:data=>req('/api/studio/v05/focus-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),apply:data=>{get('model').value=data.model_id||'';get('bone').value=data.bone_name||'';get('enabled').checked=!!data.enabled;root.BAIStudioFocusFollowRuntime?.setTarget?.(data.model_id,data.bone_name||'');root.dispatchEvent(new CustomEvent('bai:focus-target-setting',{detail:data}));status.textContent='選択設定を読み込みました（実描画への追従はモデル読込後）'},notify:msg=>status.textContent=msg});
 root.addEventListener('bai:project-selected',e=>{void ctl.select(e.detail?.project)});
 get('save').addEventListener('click',async()=>{get('save').disabled=true;try{const model=get('model').value.trim()||null,bone=get('bone').value.trim()||null;const r=await ctl.set({model_id:model,bone_name:bone,enabled:get('enabled').checked});status.textContent=r?'追従先を保存しました':'作品切替により保存結果を破棄';}catch(e){status.textContent='保存失敗: '+e.message}finally{get('save').disabled=false}});
 return ctl;
}
root.BAIStudioFocusTargetV37={controller,install};
})(typeof window!=='undefined'?window:globalThis);
