/* A selected timeline clip edits the same revisioned assignment as the 3D editor. */
(() => {
 'use strict';
 const drafts=new Map(),pending=new Set();let generation=0,activeKey=null,focusAfter=null,activeError=null;
 const pid=()=>document.getElementById('v06project')?.value;
 const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
 async function request(route,body){const response=await fetch('/api/studio/v05/'+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'取得できません');return data;}
 function mount(inspector,clip,projectId){
  const token=++generation;if(!clip||!['motion','expression','lip'].includes(clip.track)&&clip.category!=='motion'){activeKey=focusAfter=null;return;}
  const key=projectId+':'+clip.id,host=el('section');host.className='uiMotionAssignment';host.id='uiMotionAssignment';
  if(activeKey!==key)focusAfter=null;activeKey=key;
  const title=el('h3','このクリップの適用先'),label=el('label','適用するモデル'),select=el('select');select.id='uiMotionTarget';select.name='motion_target';label.htmlFor=select.id;
  const save=el('button','適用先を保存'),preview=el('button','3Dで確認'),retry=el('button','適用先を再読込');retry.id='uiMotionTargetReload';for(const b of [save,preview,retry])b.type='button';save.className='primary';
  const status=el('p','適用先を読み込み中…');status.id='uiMotionTargetStatus';status.setAttribute('role','status');status.tabIndex=-1;
  const actions=el('div');actions.className='uiMotionActions';actions.append(save,preview,retry);host.append(title,label,select,actions,status);inspector.append(host);
  let plan,row,busy=false;const valid=()=>token===generation&&host.isConnected&&pid()===projectId;
  const setBusy=value=>{busy=value;select.disabled=save.disabled=preview.disabled=retry.disabled=value;};
  function changed(){const saved=row?.target_scene_instance_id||'',value=select.value;save.disabled=busy||value===saved;preview.disabled=busy||!saved||value!==saved;status.textContent=value!==saved?'変更あり・未保存。保存して3Dで確認できます。':saved?'適用先は作品に保存済みです。':'未割当：モデルを選び「適用先を保存」を押してください。';const target=plan?.instances?.find(i=>i.id===value);if(target?.timeline_windows?.length&&!target.timeline_windows.some(w=>Math.max(w.start,clip.start)<Math.min(w.start+w.duration,clip.start+clip.duration)))status.textContent+=' モデルとモーションの配置時間が重なっていません。';}
  async function load(){setBusy(true);status.textContent='適用先を読み込み中…';try{
   const [result,scene]=await Promise.all([request('scene/multi-motion-plan?id='+encodeURIComponent(projectId)),request('scene/instances?id='+encodeURIComponent(projectId))]);if(!valid())return;if(result.arrangement_revision!==scene.arrangement_revision)throw Error('配置が更新されました');plan=result;row=[...plan.rows,...(scene.timeline_effects||[]).filter(r=>['expression','lip'].includes(r.track)).map(r=>({...r,motion_format:'VMD'}))].find(r=>r.clip_id===clip.id);if(!row)throw Error('このクリップは変更されています。タイムラインで選び直してください。');
   select.replaceChildren(new Option('適用しない（割当解除）',''));
   (plan.instances||[]).forEach((instance,index)=>{const format=instance.asset?.format||'',where=instance.timeline_clip_id?'タイムライン':'シーン',reason=instance.locked?'ロック中':instance.available===false||instance.asset?.available===false?'素材なし':row.motion_format==='VMD'&&format!=='PMX'?'VMDにはPMXが必要':'';const option=new Option((instance.name||instance.asset?.name||'モデル')+' — '+where+' '+(index+1)+(reason?'（'+reason+'）':''),instance.id);option.disabled=!!reason;select.add(option);});
   const saved=row.target_scene_instance_id||'';if(saved&&![...select.options].some(o=>o.value===saved)){const missing=new Option('保存済みのモデル（現在は見つかりません）',saved);missing.disabled=true;select.add(missing);}
   const draft=drafts.get(key);select.value=draft!==undefined&&[...select.options].some(o=>o.value===draft&&!o.disabled)?draft:saved;
   if(pending.has(key)){setBusy(true);status.textContent='このクリップの適用先を保存中…';return;}
   setBusy(false);changed();if(!plan.instances?.length)status.textContent='モデルがありません。タイムラインへ3Dモデルを配置してください。';else if(![...select.options].some(o=>o.value&&!o.disabled))status.textContent='適用できるモデルがありません。VMDには未ロックのPMXモデルを配置してください。';else if(row.reason)status.textContent+=' '+row.reason;
   if(focusAfter===key){focusAfter=null;if(!host.closest('[inert]'))select.focus();}
  }catch(error){if(valid()){setBusy(false);select.disabled=save.disabled=preview.disabled=true;status.textContent='適用先を読み込めません: '+error.message+'。「適用先を再読込」で確認してください。';if(focusAfter===key){focusAfter=null;status.focus();}}}}
  activeError=(error,saved)=>{if(!valid())return;setBusy(false);changed();status.textContent=(saved?'適用先は保存しましたが再読込できません: ':'保存できません: ')+error.message+'。適用先を再読込して確認してください。';status.focus();};
  select.addEventListener('change',()=>{drafts.set(key,select.value);changed();});retry.addEventListener('click',()=>{focusAfter=key;void load();});
  save.addEventListener('click',async()=>{
   if(!valid()||busy||pending.has(key)||!plan)return;const input={project_id:projectId,clip_id:clip.id,instance_id:select.value||null,revision:plan.arrangement_revision};pending.add(key);setBusy(true);status.textContent='このクリップの適用先を保存中…';let saved=false;
   try{await request('scene/motion-target',input);saved=true;pending.delete(key);if(drafts.get(key)===(input.instance_id||''))drafts.delete(key);if(activeKey===key)focusAfter=key;await window.BAIStudioV05Arrangement?.refreshArrangement();if(valid()){await load();status.textContent='適用先を作品へ保存しました。';}}
   catch(error){pending.delete(key);if(activeKey===key)activeError?.(error,saved);}
  });
  preview.addEventListener('click',async()=>{if(!valid()||!row)return;try{await window.BAIStudioMultiScenePreview?.editMotion({clipId:clip.id,instanceId:row.target_scene_instance_id});}catch(error){if(valid())status.textContent='3Dを開けません: '+error.message;}});
  void load();
 }
 window.BAIStudioMotionAssignment=Object.freeze({mount});
})();
