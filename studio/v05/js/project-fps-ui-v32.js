/* FPS UI: catalog readback is authoritative. Never treat a failed request as saved. */
(function(root){'use strict';
function controller({load,save,apply=()=>{},notify=()=>{}}){
 let project=null,serial=0,current=null;
 async function select(item){const ticket=++serial;project=item?.id||null;current=null;
  if(!project)return null;
  try{const r=await load(project);if(ticket!==serial)return null;
   if(!r||r.project_id!==project)throw Error('FPS project mismatch');
   current={id:project,fps:r.configured?r.fps:null,configured:!!r.configured};
   apply({id:project,settings:r.configured?{fps:r.fps}:{}});return current;
  }catch(e){if(ticket===serial){apply({id:project,settings:{}});notify('FPS読み込み失敗：'+e.message);}return null;}
 }
 async function set(value){const id=project,ticket=serial;
  if(!id)throw Error('作品が未選択です');const fps=Number(value);
  if(!Number.isFinite(fps)||fps<1||fps>240)throw Error('FPSは1〜240の数値で指定してください');
  const r=await save(id,fps);if(ticket!==serial||id!==project)return null;
  if(r?.project?.id!==id||r.project.fps!==fps)throw Error('FPS保存結果が一致しません');
  current={id,fps,configured:true};apply({id,settings:{fps}});return current;
 }
 return {select,set,get:()=>current,active:()=>project};
}
function install(){const dialog=document.getElementById('langDialog'),card=dialog?.querySelector('.language-card');if(!card)return null;
 const wrap=document.createElement('section');wrap.id='v32-fps-settings';wrap.innerHTML='<label for="v32-fps">作品のフレームレート（FPS）</label><div style="display:flex;gap:6px"><input id="v32-fps" type="number" min="1" max="240" step="0.01" style="min-width:0;width:120px" aria-describedby="v32-fps-status"><button type="button" id="v32-fps-save">保存</button></div><small id="v32-fps-status" role="status">作品を選択してください</small>';card.insertBefore(wrap,document.getElementById('langClose'));
 const input=wrap.querySelector('#v32-fps'),status=wrap.querySelector('#v32-fps-status'),btn=wrap.querySelector('#v32-fps-save');
 const request=async(url,opts)=>{const r=await fetch(url,opts);const data=await r.json();if(!r.ok)throw Error(data.error||`HTTP ${r.status}`);return data};
 const api=controller({load:id=>request('/api/studio/v05/project/fps?id='+encodeURIComponent(id)),save:(project_id,fps)=>request('/api/studio/v05/project/fps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id,fps})}),apply:project=>root.dispatchEvent(new CustomEvent('bai:project-selected-fps',{detail:{project}})),notify:msg=>status.textContent=msg});
 const originalApply=async item=>{btn.disabled=true;status.textContent='FPSを読み込み中…';const r=await api.select(item);input.value=r?.configured?String(r.fps):'';input.placeholder='既定値 60';status.textContent=r?(r.configured?'保存済みFPS: '+r.fps:'FPS未設定。カメラ評価は既定値60を利用'):'FPSを取得できません';btn.disabled=!api.active();};
 root.addEventListener('bai:project-selected',event=>{void originalApply(event.detail?.project)});
 root.addEventListener('bai:project-selected-fps',event=>root.BAIStudioCameraProjectRuntime?.applyProject(event.detail.project));
 btn.addEventListener('click',async()=>{btn.disabled=true;try{const result=await api.set(input.value);status.textContent=result?'FPSを保存しました: '+result.fps:'作品が変更されました';}catch(e){status.textContent='保存失敗: '+e.message;}finally{btn.disabled=!api.active();}});
 return api;
}
root.BAIStudioFPSV32={controller,install};
})(typeof window!=='undefined'?window:globalThis);
