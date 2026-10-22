(()=>{
'use strict';
const code=localStorage.getItem('bai.ui.lang')==='en'?'en':'jp';
let language=code,dict=null;
const source=new WeakMap(),rendered=new WeakMap(),tooltipOriginal=new WeakMap();
const ID_TOOLTIP={'viewMode':'perspective','litMode':'lighting','spaceMode':'coordinate','splitMode':'pip','addKey':'keyframe'};
const ui=(k)=>dict?.ui?.[k]||k;
function trans(s){if(!dict)return s;const trimmed=s.trim();const m=/^([^\w\p{L}\p{N}]*)(.*?)(\s*[▾▼]*)$/u.exec(trimmed);const core=m?m[2]:trimmed;const direct=dict.labels[trimmed]??dict.labels[core];if(direct===undefined)return s;return s.replace(trimmed, m&&dict.labels[core]!==undefined?m[1]+direct+m[3]:direct)}
function localize(){if(!dict)return;
 observer.disconnect();
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 let n;while(n=walker.nextNode()){
   if(n.parentElement?.closest('script,style,option#langChoice,textarea'))continue;
   const now=n.nodeValue;const prev=rendered.get(n);
   if(!source.has(n)||prev!==now)source.set(n,now);
   const target=trans(source.get(n));if(now!==target)n.nodeValue=target;rendered.set(n,target);
 }
 document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>{
   ['placeholder','title','aria-label'].forEach(attr=>{if(!el.hasAttribute(attr))return;const key='data-i18n-original-'+attr; if(!el.hasAttribute(key))el.setAttribute(key,el.getAttribute(attr));el.setAttribute(attr,trans(el.getAttribute(key)))});
 });
 const settings=document.getElementById('settingsOpen');if(settings)settings.textContent=language==='jp'?'⚙ 設定':'⚙ Settings';
 const field=document.getElementById('langFieldLabel');if(field)field.textContent=language==='jp'?'表示言語':'Language';
 const title=document.getElementById('langTitle');if(title)title.textContent=language==='jp'?'設定':'Settings';
 const note=document.getElementById('langNote');if(note)note.textContent=language==='jp'?'表示言語を変更すると、メニュー・ボタン・説明が切り替わります。':'Switch the display language for menus, buttons and explanations.';
 const close=document.getElementById('langClose');if(close)close.textContent=language==='jp'?'閉じる':'Close';
 for(const [id,helpkey] of Object.entries(ID_TOOLTIP)){const el=document.getElementById(id);if(!el)continue;el.title=dict.help[helpkey];el.classList.add('term-help')}
 document.documentElement.lang=language==='jp'?'ja':'en';
 observer.observe(document.body,{childList:true,subtree:true,characterData:true});
}
const observer=new MutationObserver(()=>localize());
async function load(lang){try{const res=await fetch('./locales/'+lang+'.json',{cache:'no-store'});if(!res.ok)throw Error(res.status);dict=await res.json();language=lang;localStorage.setItem('bai.ui.lang',lang);document.getElementById('langChoice').value=lang;localize();}catch(error){console.warn('Language pack not loaded',error);document.getElementById('langNote').textContent='JSONを読み込めません。start_server.batから開いてください。 / Open using start_server.bat';}}
document.getElementById('settingsOpen').addEventListener('click',()=>document.getElementById('langDialog').hidden=false);
document.getElementById('langClose').addEventListener('click',()=>document.getElementById('langDialog').hidden=true);
document.getElementById('langDialog').addEventListener('click',e=>{if(e.target.id==='langDialog')e.currentTarget.hidden=true});
document.getElementById('langChoice').addEventListener('change',e=>load(e.target.value));
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('langDialog').hidden=true});
load(code);
})();