/* v57: scene instance registry UI. Persisted placements only; no claim of GPU multi-model playback. */
(async () => {
  'use strict';
  const project = document.getElementById('v06project');
  const parent = document.getElementById('assetPanel');
  if (!project || !parent) return;
  const lang = localStorage.getItem('bai.ui.lang') === 'en' ? 'en' : 'jp';
  let lex = {};
  try { lex = (await (await fetch('./locales/'+lang+'.json')).json()).v57 || {}; }
  catch (_) { /* fallback key strings */ }
  const t = key => lex[key] || key;
  const section=document.createElement('section');
  section.id='v57-scene-instances';
  section.style.cssText='border:1px solid #596e83;padding:12px;border-radius:8px;background:#1a2836;display:grid;gap:8px';
  const title=document.createElement('h3');title.textContent=t('title');
  const note=document.createElement('p');note.textContent=t('notRendered');
  const asset=document.createElement('select');asset.setAttribute('aria-label',t('model'));
  const list=document.createElement('select');list.size=5;list.setAttribute('aria-label',t('instances'));list.style.width='100%';
  const fields={};
  for (const key of ['position','rotation','scale']) {
    const row=document.createElement('div');row.style.cssText='display:flex;gap:4px';
    const label=document.createElement('span');label.textContent=t(key);label.style.width='75px';row.append(label);
    fields[key]=[0,1,2].map((n) => {const e=document.createElement('input');e.type='number';e.step='0.01';e.style.width='calc((100% - 80px) / 3)';e.setAttribute('aria-label',key+' '+['X','Y','Z'][n]);e.value=key==='scale'?'1':'0';row.append(e);return e;});
    section.append(row);
  }
  const visibleControl=document.createElement('label');visibleControl.textContent=t('visible');
  const visibleBox=document.createElement('input');visibleBox.type='checkbox';visibleBox.checked=true;visibleControl.prepend(visibleBox);
  const lockedControl=document.createElement('label');lockedControl.textContent=t('locked');
  const lockedBox=document.createElement('input');lockedBox.type='checkbox';lockedBox.checked=false;lockedControl.prepend(lockedBox);
  const flags=document.createElement('div');flags.style.cssText='display:flex;gap:14px';
  flags.append(visibleControl,lockedControl);
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
  const mk=(key)=>{const b=document.createElement('button');b.type='button';b.textContent=t(key);actions.append(b);return b;};
  const add=mk('add'),save=mk('save'),remove=mk('remove'),refresh=mk('refresh');
  const status=document.createElement('p');status.setAttribute('role','status');
  section.prepend(title,note,asset,list);
  section.append(flags,actions,status);
  parent.append(section);
  let state=null, candidates=[],stamp=0;
  const blank=()=>({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
  const display=(message)=>status.textContent=message;
  const request=async(url,opts)=>{const r=await fetch(url,opts);const x=await r.json();if(!r.ok)throw Error(x.error||'HTTP '+r.status);return x;};
  const tr=()=>{
    const value={};
    for(const key of Object.keys(fields)){
      value[key]=fields[key].map(e=>e.value.trim()!==''?Number(e.value):NaN);
      if(value[key].some(x=>!Number.isFinite(x)) || (key==='scale'&&value[key].some(x=>x<=0)))throw Error(t('badTransform'));
    }
    return value;
  };
  const fill=(val)=>{for(const [key,inputs] of Object.entries(fields)){inputs.forEach((e,i)=>e.value=(val||blank())[key][i]);}};
  const selected=()=>state?.instances.find(x=>x.id===list.value);
  const refreshSelect=()=>{
    const selectedId=list.value;
    list.replaceChildren();
    for(const row of state.instances){const entry=new Option(row.id+' · '+row.asset_id+(row.available?'':' ('+t('missing')+')'),row.id);list.add(entry);}
    if(state.instances.some(x=>x.id===selectedId))list.value=selectedId;
    if(list.options.length&&!list.value)list.selectedIndex=0;
    fill(selected()?.transform);
    visibleBox.checked=selected()?.visible ?? true;
    lockedBox.checked=selected()?.locked ?? false;
    remove.disabled=!selected() || selected().locked;
    save.disabled=!selected();
  };
  async function reload(){
    const id=project.value, token=++stamp;
    if(!id){display(t('chooseProject'));return;}
    try {
      const [models,scene]=await Promise.all([
        request('/api/studio/v05/scene/model-candidates'),
        request('/api/studio/v05/scene/instances?id='+encodeURIComponent(id))
      ]);
      if(project.value!==id||token!==stamp)return;
      candidates=models.items||[];state=scene;
      const old=asset.value;
      asset.replaceChildren(new Option(t('chooseModel'),''));
      for(const item of candidates)asset.add(new Option(item.name+' ('+item.format+')',item.id));
      if(candidates.some(x=>x.id===old))asset.value=old;
      refreshSelect();
      display(t('loaded')+' · '+state.instances.length+' · '+t('notRendered'));
    } catch(e){if(project.value===id)display(t('loadError')+': '+e.message);}
  }
  async function modify(action, options) {
    if(!state||!project.value)return;
    const id=project.value;
    const payload={project_id:id,revision:state.revision,action,...options};
    for(const b of [add,save,remove,refresh])b.disabled=true;
    try {
      const result=await request('/api/studio/v05/scene/instances',
        {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(project.value!==id)return;
      state=result;refreshSelect();display(t('saved')+' · '+state.instances.length);
    }catch(e){display(t('saveError')+': '+e.message);await reload();}
    finally{refresh.disabled=false;add.disabled=false;refreshSelect();}
  }
  add.addEventListener('click',()=>{try{if(!asset.value){display(t('chooseModel'));return;}modify('add',{asset_id:asset.value,transform:tr()});}catch(e){display(e.message);}});
  save.addEventListener('click',()=>{
    const s=selected();if(!s)return;
    try{
      // Locked instances may only be explicitly unlocked; no hidden Transform change.
      if(s.locked) {
        if(lockedBox.checked){display(t('unlockFirst'));return;}
        modify('update',{instance_id:s.id,locked:false});
      } else modify('update',{instance_id:s.id,transform:tr(),visible:visibleBox.checked,locked:lockedBox.checked});
    }catch(e){display(e.message);}
  });
  remove.addEventListener('click',()=>{const s=selected();if(s&&confirm(t('confirmRemove')))modify('remove',{instance_id:s.id});});
  refresh.addEventListener('click',reload);
  list.addEventListener('change',()=>{fill(selected()?.transform);visibleBox.checked=selected()?.visible ?? true;lockedBox.checked=selected()?.locked ?? false;save.disabled=!selected();remove.disabled=!selected()||selected().locked;});
  project.addEventListener('change',reload);
  for(let i=0;i<30&&!project.value;i++)await new Promise(r=>setTimeout(r,100));
  if(project.value)reload();
})();
