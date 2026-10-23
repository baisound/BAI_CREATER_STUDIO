/* v55: one real 3D model per project, using the existing model-loader and scene preview. */
(async () => {
  'use strict';
  const host=document.getElementById('assetPanel');
  if(!host)return;
  const project=document.getElementById('v06project');
  const wrap=document.createElement('section');
  wrap.id='v55-scene-model';
  wrap.style.cssText='padding:12px;background:#1b2939;border:1px solid #53647a;margin:9px 0;border-radius:8px;display:grid;gap:7px';
  const tkeys=(await (async()=>{
    try {const lang=localStorage.getItem('bai.ui.lang')==='en'?'en':'jp';
      const res=await fetch('./locales/'+lang+'.json');return (await res.json()).v55||{};
    } catch(_){return {};}
  })());
  const t=(k)=>tkeys[k]||k;
  const heading=document.createElement('h3'); heading.textContent=t('title');
  const subtitle=document.createElement('p');subtitle.textContent=t('singleModelNote');
  const assetLabel=document.createElement('label');assetLabel.textContent=t('model');
  const picker=document.createElement('select');picker.id='v55-model';picker.style.width='100%';assetLabel.append(picker);
  const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
  function button(label){const e=document.createElement('button');e.type='button';e.textContent=t(label);buttons.append(e);return e;}
  const save=button('save'),preview=button('preview'),remove=button('remove'),reload=button('reload');
  const panel=document.createElement('div');panel.style.cssText='display:grid;gap:5px';
  const fields={};
  for(const name of ['position','rotation','scale']){
    const row=document.createElement('div');row.style.cssText='display:grid;grid-template-columns:75px repeat(3,minmax(0,1fr));gap:4px';
    const label=document.createElement('span');label.textContent=t(name);row.append(label);
    fields[name]=[];
    for(const axis of ['X','Y','Z']){
      const input=document.createElement('input');input.type='number';input.step=name==='rotation'?'1':'0.01';
      input.setAttribute('aria-label',t(name)+' '+axis);
      input.value=name==='scale'?'1':'0';input.style.minWidth='0';row.append(input);fields[name].push(input);
    }
    panel.append(row);
  }
  const info=document.createElement('p');info.setAttribute('role','status');info.style.cssText='white-space:pre-wrap;color:#c4d7eb';
  wrap.append(heading,subtitle,assetLabel,panel,buttons,info);host.prepend(wrap);
  let candidates=[],revision=0,lastProject='',busy=false;
  const defaults=()=>({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
  function values(){
    const tr={};
    for(const name of Object.keys(fields))tr[name]=fields[name].map(x=>Number(x.value));
    if(Object.values(tr).some(xs=>xs.some(x=>!Number.isFinite(x))))throw new Error(t('invalidTransform'));
    return tr;
  }
  function fill(tr){
    tr=tr||defaults();
    for(const [name,arr] of Object.entries(fields))arr.forEach((input,i)=>{input.value=tr[name][i]});
  }
  async function request(url,options){
    const res=await fetch(url,options);const body=await res.json();
    if(!res.ok)throw new Error(body.error||'HTTP '+res.status);
    return body;
  }
  function report(message){info.textContent=message;}
  async function load() {
    const id=project?.value;
    const token=id;
    if(!id){report(t('chooseProject'));return;}
    try {
      const [models,scene]=await Promise.all([
        request('/api/studio/v05/scene/model-candidates'),
        request('/api/studio/v05/scene/model?id='+encodeURIComponent(id))
      ]);
      if(project.value!==token)return;
      candidates=models.items||[];
      revision=scene.revision;lastProject=id;
      picker.replaceChildren(new Option(t('chooseModel'),''));
      for(const item of candidates)picker.add(new Option(item.name+' ('+item.format+')',item.id));
      picker.value=scene.model?.asset_id||'';
      fill(scene.model?.transform);
      if(scene.model&&!scene.model.available){
        const opt=new Option(t('missingModel')+': '+scene.model.asset_id,scene.model.asset_id);
        picker.add(opt);picker.value=scene.model.asset_id;
      }
      // Other projects must never inherit the previous project's rendered model.
      const active=window.BAIStudioScenePreview?.getStatus();
      if(active?.active && active.projectId!==id)window.BAIStudioScenePreview?.close();
      report(scene.model?.available?t('savedModelReady'):scene.model?t('missingModel'):t('emptyScene'));
    }catch(err){report(t('loadError')+': '+err.message);}
  }
  function spin(value){busy=value;[picker,save,preview,remove,reload,...Object.values(fields).flat()].forEach(el=>el.disabled=value);}
  async function commit(assetId,transform) {
    if(!project?.value)throw Error(t('chooseProject'));
    return request('/api/studio/v05/scene/model',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:project.value,asset_id:assetId,transform,revision})});
  }
  save.addEventListener('click',async()=>{
    if(busy)return;
    const assetId=picker.value;const asset=candidates.find(x=>x.id===assetId);
    if(!asset){report(t('chooseModel'));return;}
    spin(true);
    try{
      const result=await commit(assetId,values());revision=result.revision;
      const active=window.BAIStudioScenePreview?.getStatus();
      if(active?.active&&active.assetId===assetId&&active.projectId===project.value)
        window.BAIStudioScenePreview.applyTransform(result.model.transform);
      else if(active?.active)window.BAIStudioScenePreview.close();
      report(t('saved')+' · '+asset.name);
    }catch(err){report(t('saveError')+': '+err.message);}finally{spin(false);}
  });
  preview.addEventListener('click',async()=>{
    if(busy)return;
    const id=project?.value;const asset=candidates.find(x=>x.id===picker.value);
    if(!id||!asset){report(t('chooseModel'));return;}
    spin(true);
    try {
      const scene=await request('/api/studio/v05/scene/model?id='+encodeURIComponent(id));
      if(scene.model?.asset_id!==asset.id){throw Error(t('saveFirst'));}
      await window.BAIStudioScenePreview.show(id,asset,scene.model.transform);
      if(project?.value!==id)window.BAIStudioScenePreview.close();
      else report(t('previewReady')+' · '+asset.name);
    } catch(e){report(t('previewError')+': '+e.message);} finally {spin(false);}
  });
  remove.addEventListener('click',async()=>{
    if(busy)return;
    if(!window.confirm(t('confirmRemove')))return;
    spin(true);
    try {
      const result=await commit(null,null);revision=result.revision;
      window.BAIStudioScenePreview?.close();
      picker.value='';fill();report(t('emptyScene'));
    }catch(e){report(t('saveError')+': '+e.message);}finally{spin(false);}
  });
  reload.addEventListener('click',load);
  project?.addEventListener('change',load);
  // Delay startup until v06 has loaded its projects.
  for(let retry=0;retry<25&&!project?.value;retry++)await new Promise(resolve=>setTimeout(resolve,120));
  if(project?.value)await load();
})();
