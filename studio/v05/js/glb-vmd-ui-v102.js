/* Registered GLB motion -> a PMX instance in the current v0.5 project. */
(()=>{'use strict';
 const host=document.getElementById('v06AssetPicker');
 if(!host)return;
 const panel=document.createElement('details');
 panel.id='v102-glb-vmd';
 panel.style.cssText='margin:12px 0;padding:10px;border:1px solid #52697e;border-radius:8px;background:#1a2b3e';
 panel.innerHTML='<summary style="cursor:pointer;font-weight:600">GLBダンス → PMX用VMD</summary>'+
   '<p>作品に配置済みのPMXを対象に、登録済みGLB動作から別名VMDを作成します。生成後は同じ作品のモーション行へ配置し、プレビューで姿勢と接地を確認してください。</p>'+
   '<label style="display:block;margin:6px 0">GLB動作 <select data-source style="width:100%"></select></label>'+
   '<label style="display:block;margin:6px 0">対象PMX <select data-target style="width:100%"></select></label>'+
   '<label style="display:block;margin:6px 0">配置開始（秒） <input data-start type="number" min="0" max="86400" step="0.0333" value="0" style="width:110px"></label>'+
   '<button data-refresh type="button">候補を更新</button> <button data-convert type="button" disabled>変換して配置</button>'+
   '<p data-status role="status" style="white-space:normal;color:#c7d8ed">候補を読み込みます。</p>';
 host.insertBefore(panel,document.getElementById('v06results'));
 const source=panel.querySelector('[data-source]'),target=panel.querySelector('[data-target]');
 const start=panel.querySelector('[data-start]'),button=panel.querySelector('[data-convert]');
 const status=panel.querySelector('[data-status]'),project=document.getElementById('v06project');
 let loadedProject='',converting=false;
 async function request(url,options){const response=await fetch(url,options);const body=await response.json();if(!response.ok)throw Error(body.error||'HTTP '+response.status);return body}
 const post=(url,body)=>request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 function fill(select,items,valueKey,label){const previous=select.value;select.replaceChildren();for(const item of items){const option=document.createElement('option');option.value=item[valueKey];option.textContent=label(item);select.append(option)}if(items.some(item=>item[valueKey]===previous))select.value=previous}
 async function refresh(){
  const id=project?.value;
  if(!id){status.textContent='作品を選択してください。';button.disabled=true;return}
  button.disabled=true;
  try{
   const data=await request('/api/studio/v05/motion/glb-vmd/candidates?id='+encodeURIComponent(id));
   if(project.value!==id)return;
   loadedProject=id;
   fill(source,data.sources,'id',item=>item.name);
   fill(target,data.targets,'instance_id',item=>item.name+'（この作品の3D）');
   button.disabled=converting||!data.sources.length||!data.targets.length;
   status.textContent=data.sources.length&&data.targets.length
    ?'変換後のVMDは確認用です。PMXのIK・接地・手指をプレビューで確認してください。'
    :(!data.sources.length?'登録済みGLB動作がありません。':'この作品の3DシーンへPMXを配置してください。');
  }catch(error){status.textContent='候補を取得できません: '+error.message}
 }
 panel.querySelector('[data-refresh]').addEventListener('click',refresh);
 panel.addEventListener('toggle',()=>{if(panel.open)void refresh()});
 project?.addEventListener('change',()=>{loadedProject='';if(panel.open)void refresh()});
 window.addEventListener('bai:v05-project-changed',()=>{loadedProject='';if(panel.open)void refresh()});
 button.addEventListener('click',async()=>{
  const id=project.value,sourceId=source.value,instanceId=target.value;
  const seconds=Number(start.value);
  if(id!==loadedProject||!sourceId||!instanceId||!Number.isFinite(seconds)||seconds<0||seconds>86400){status.textContent='作品・GLB・PMX・開始時刻を確認してください。';return}
  converting=true;button.disabled=true;status.textContent='Blenderで変換中です。作品や素材を切り替えずにお待ちください。';
  let converted;
  try{
   converted=await post('/api/studio/v05/motion/glb-vmd',{project_id:id,source_asset_id:sourceId,instance_id:instanceId});
   if(project.value!==id){status.textContent='VMDを別名登録しました。作品を切り替えたため、配置は保留しました: '+converted.asset_id;return}
   status.textContent='VMDを登録しました。作品へ配置しています。';
   const arrangement=await request('/api/studio/v05/arrangement?id='+encodeURIComponent(id));
   const placed=await post('/api/studio/v05/arrangement/place',{project_id:id,asset_id:converted.asset_id,track:'motion',start:seconds,duration:converted.duration_seconds,revision:arrangement.revision});
   await post('/api/studio/v05/scene/motion-target',{project_id:id,clip_id:placed.clip.id,revision:placed.revision,instance_id:instanceId});
   window.dispatchEvent(new CustomEvent('bai:v05-arrangement-refresh',{detail:{projectId:id}}));
   status.textContent='別名VMDを同じ作品へ配置しました（'+converted.mapped_bones+'骨）。3Dプレビューで姿勢・接地を確認してください。ID: '+converted.asset_id;
   document.getElementById('v70sceneOpen')?.click();
  }catch(error){status.textContent=(converted?'VMDは登録済みですが配置・結合に失敗しました: '+converted.asset_id+' / ':'変換失敗: ')+error.message;
  }finally{converting=false;button.disabled=project.value!==loadedProject||!source.options.length||!target.options.length}
 });
})();
