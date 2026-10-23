/* v54: server-approved inbox paths only; original files remain untouched. */
(async function () {
  'use strict';
  const host=document.getElementById('bai-library') || document.getElementById('assetPanel');
  if (!host) return;
  const pane=document.createElement('section');
  pane.id='v54-assets';
  pane.style.cssText='margin:10px 0;padding:12px;border:1px solid #5a6b82;border-radius:8px;background:#1c2b3d;color:#f2f5f8';
  const lang=localStorage.getItem('bai.ui.lang')==='en'?'en':'jp';
  let texts={};
  try {const r=await fetch('./locales/'+lang+'.json');if(r.ok)texts=(await r.json()).v54||{}} catch(_){}
  const t=(key)=>texts[key]||key;
  const heading=document.createElement('h3');heading.textContent=t('title');
  const help=document.createElement('p');help.textContent=t('hint');
  help.style.cssText='font-size:12px;line-height:1.5';
  const form=document.createElement('form');form.style.cssText='display:grid;gap:8px;max-width:560px';
  const field=(label,input)=>{const wrap=document.createElement('label');wrap.style.cssText='display:grid;gap:3px;font-size:12px';wrap.append(document.createTextNode(label));wrap.append(input);return wrap;};
  const path=document.createElement('input');path.required=true;path.maxLength=512;path.placeholder='music/theme.wav';
  const kind=document.createElement('select');
  for(const val of ['audio','video','image','material','stage','prop','fx']){const o=document.createElement('option');o.value=val;o.textContent=val;kind.append(o);}
  const mode=document.createElement('select');for(const [val,key] of [['reference','reference'],['copy','copy']]){const o=document.createElement('option');o.value=val;o.textContent=t(key);mode.append(o);}
  const id=document.createElement('input');id.placeholder='v05source:…';id.maxLength=80;
  form.append(field(t('path'),path),field(t('kind'),kind),field(t('mode'),mode),field(t('sourceId'),id));
  const bar=document.createElement('div');bar.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
  const b=(key)=>{const el=document.createElement('button');el.type='button';el.textContent=t(key);bar.append(el);return el;};
  const add=b('register'),link=b('relink'),refresh=b('reload');form.append(bar);
  const status=document.createElement('p');status.role='status';status.setAttribute('aria-live','polite');status.textContent=t('statusReady');
  const listing=document.createElement('ul');listing.style.cssText='max-height:170px;overflow:auto;font-size:12px';
  pane.append(heading,help,form,status,listing);host.prepend(pane);
  let revision=0,working=false;
  async function call(url,data){const result=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});let response=await result.json();if(!result.ok)throw Error(response.error||result.statusText);return response;}
  async function reload(){
    const r=await fetch('/api/studio/v05/asset-sources');if(!r.ok)throw Error('HTTP '+r.status);
    const data=await r.json();revision=data.revision;listing.replaceChildren();
    for(const item of data.items){
      const li=document.createElement('li');li.textContent=(item.available?'✓ ':'! ')+(item.name||'')+' — '+(item.id||'');
      const select=document.createElement('button');select.type='button';select.textContent='↳';select.title=t('sourceId');select.addEventListener('click',()=>{id.value=item.id;path.value=item.relative_path||'';});li.append(select);listing.append(li);
    }
    status.textContent=t('count')+': '+data.items.length+' · '+t('revision')+': '+revision;
  }
  async function run(action){
    if(working)return;working=true;[add,link,refresh].forEach(x=>x.disabled=true);status.textContent=t('statusBusy');
    try {
      if(action==='register') await call('/api/studio/v05/asset-sources/register',{relative_path:path.value,kind:kind.value,mode:mode.value,revision});
      if(action==='relink') await call('/api/studio/v05/asset-sources/relink',{asset_id:id.value,relative_path:path.value,revision});
      await reload();
    } catch(error){status.textContent=t('error')+': '+error.message;}
    finally{working=false;[add,link,refresh].forEach(x=>x.disabled=false);}
  }
  const languageChoice=document.getElementById('langChoice');
  languageChoice?.addEventListener('change',async e=>{
    try {
      const res=await fetch('./locales/'+(e.target.value==='en'?'en':'jp')+'.json');
      if(!res.ok)return;
      texts=(await res.json()).v54||{};
      heading.textContent=t('title');help.textContent=t('hint');
      const fieldKeys=['path','kind','mode','sourceId'];
      [...form.querySelectorAll(':scope > label')].forEach((el,i)=>{if(fieldKeys[i])el.firstChild.nodeValue=t(fieldKeys[i]);});
      [...mode.options].forEach(el=>{el.textContent=t(el.value);});
      add.textContent=t('register');link.textContent=t('relink');refresh.textContent=t('reload');
      await reload();
    }catch(_){/* keep last valid locale */}
  });
  add.addEventListener('click',()=>run('register'));
  link.addEventListener('click',()=>run('relink'));
  refresh.addEventListener('click',()=>run('refresh'));
  reload().catch(error=>{status.textContent=t('error')+': '+error.message;});
})();
