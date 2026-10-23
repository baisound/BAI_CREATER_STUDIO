(()=>{'use strict';
const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The navigation can wrap at desktop as well as narrow widths. Keep the
// supplemental page layer below its measured height so it cannot cover tabs.
const topBar=document.querySelector('.top'), pageLayer=$('baiPages');
if(topBar){topBar.style.height='auto';topBar.style.minHeight='53px';}
function positionPageLayer(){
 if(!topBar||!pageLayer)return;
 const height=Math.ceil(topBar.getBoundingClientRect().height);
 pageLayer.style.top=`${height}px`;
 const main=document.querySelector('.main');
 if(main)main.style.height=window.innerWidth>730?`calc(100vh - ${height+26}px)`:'';
}
positionPageLayer();
if(topBar&&typeof ResizeObserver!=='undefined')new ResizeObserver(positionPageLayer).observe(topBar);
window.addEventListener('resize',positionPageLayer);
const storeKey='bai.mock.v05.projects';let projects=JSON.parse(localStorage.getItem(storeKey)||'null')||[{name:'LAST CHASE MV',status:'draft',image:'proj-sakura-dance.webp',modified:'2026-10-22'},{name:'2027 新春企画',status:'draft',image:'proj-virtual-stage.webp',modified:'2026-10-21'},{name:'ダンス映像制作',status:'done',image:'proj-blue-resonance.webp',modified:'2026-10-19'}];let selectedProject=0,sortAsc=true,assetCount=0;
const catalogApi='/api/studio/v05/projects';
let catalogConnected=false;
async function fetchCatalog(){
 try{const r=await fetch(catalogApi,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
 const body=await r.json();if(!Array.isArray(body.projects))throw Error('Invalid response');
 catalogConnected=true;projects=body.projects.map(p=>({...p,image:'proj-virtual-stage.webp'}));selectedProject=0;renderProjects();window.dispatchEvent(new CustomEvent('bai:project-selected',{detail:{project:projects[selectedProject]||null}}));
 }catch(error){catalogConnected=false;console.warn('[v0.5] catalog API unavailable; project cards are demo-only',error);notify('プロジェクト一覧はデモ表示です（API未接続）')}}
async function createCatalogProject(name,kind){
 if(!catalogConnected)throw Error('サーバー未接続。作品の作成は保存されません');
 const r=await fetch(catalogApi,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,kind})});
 const body=await r.json();if(!r.ok)throw Error(body.error||'保存失敗');await fetchCatalog();return body.project;
}
function notify(s){let el=$('toast');if(el){el.textContent=s;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400)} }
function page(which){if(which==='assets')which='edit';if(which==='edit'&&projects[selectedProject]?.id)window.dispatchEvent(new CustomEvent('bai:project-selected',{detail:{project:projects[selectedProject]}}));const legacy=['edit','motion','camera'];$('baiPages').classList.toggle('visible',!legacy.includes(which));document.querySelectorAll('.baiPage').forEach(e=>e.classList.toggle('active',e.id==='bai-'+which));document.querySelectorAll('#nav .tab').forEach(e=>e.classList.toggle('on',e.dataset.page===which||e.dataset.workspace===which)); if(which==='output')drawOverlay();}
window.baiGo=page;
document.querySelectorAll('#nav [data-page]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();page(b.dataset.page)},true));document.querySelectorAll('#nav [data-workspace]').forEach(b=>b.addEventListener('click',()=>page(b.dataset.workspace)));document.addEventListener('click',e=>{const go=e.target.closest('[data-go]');if(go){e.stopPropagation();page(go.dataset.go)}const act=e.target.closest('[data-action]');if(act){e.stopPropagation();action(act.dataset.action)}});
const card=(p,i)=>`<div class="baiCard clickable" tabindex="0" data-project="${i}"><img src="assets/${esc(p.image)}" alt="作品サムネイル"><h3>${esc(p.name)}</h3><p class="baiTiny">${p.status==='draft'?'制作中':'完成済み'}　｜　${esc(p.modified)}</p><button data-openproject="${i}">編集する ↗</button>${p.id?`<div class="baiRow"><button class="small" data-v05-snapshot="${i}" data-snapshot-action="save">現行編集を保存</button><button class="small" data-v05-snapshot="${i}" data-snapshot-action="read">保存状態を確認</button></div>`:''}</div>`;
function renderProjects(){let q=($('baiProjectSearch')?.value||'').toLowerCase(), f=$('baiProjectFilter')?.value||'all';let rows=projects.map((p,i)=>({p,i})).filter(x=>x.p.name.toLowerCase().includes(q)&&(f==='all'||x.p.status===f));if(!sortAsc)rows.reverse();$('baiProjectList').innerHTML=rows.map(x=>card(x.p,x.i)).join('')||'<p>該当する作品はありません。</p>';$('baiRecent').innerHTML=projects.slice(0,3).map(card).join('');$('baiStats').innerHTML=[['登録素材',assetCount],['作品',projects.length]].map(([n,v])=>`<div class="baiCard"><p class="baiTiny">${n}</p><div class="baiStat">${v}</div></div>`).join('');$('baiProgress').innerHTML='<p class="baiTiny">制作工程の接続状況は素材・タイムライン・書き出しの各画面で確認してください。</p>'}
window.addEventListener('bai:v05-assets-loaded',event=>{assetCount=event.detail.count;renderProjects()});
$('baiProjectList').addEventListener('click',e=>{let open=e.target.closest('[data-openproject]');if(open){selectedProject=+open.dataset.openproject;notify('編集中：'+projects[selectedProject].name);page('edit');return}let item=e.target.closest('[data-project]');if(item){selectedProject=+item.dataset.project;item.style.borderColor='#6cb8f3'}});// v0.5 Phase04: non-destructive capture/view. These do not activate or restore an engine project.
$('baiProjectList').addEventListener('click',async e=>{
 const btn=e.target.closest('[data-v05-snapshot]');if(!btn)return;
 e.stopPropagation();const item=projects[+btn.dataset.v05Snapshot];if(!catalogConnected||!item?.id){notify('保存用プロジェクトIDがありません');return}
 try{
  if(btn.dataset.snapshotAction==='save'){
   const r=await fetch('/api/studio/v05/project/snapshot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'保存不可');notify('現行の制作データを作品のスナップショットへ保存しました');
  }else{
   const r=await fetch('/api/studio/v05/project/snapshot?id='+encodeURIComponent(item.id));const data=await r.json();if(!r.ok)throw Error(data.error||'読み込み不可');
   notify('保存データを検査しました。編集中の作品には適用されません');
  }
 }catch(err){notify('スナップショット操作失敗：'+err.message)}
},true);
$('baiProjectList').addEventListener('dblclick',e=>{const a=e.target.closest('[data-project]');if(a){selectedProject=+a.dataset.project;page('edit')}});
$('baiRecent').addEventListener('click',e=>{let item=e.target.closest('[data-project]');if(item){selectedProject=+item.dataset.project;page('edit')}});
$('baiProjectSearch').oninput=renderProjects;$('baiProjectFilter').onchange=renderProjects;$('baiProjectSort').onclick=()=>{sortAsc=!sortAsc;renderProjects()};
function drawOverlay(){let guide=$('baiGuide').value, safe=$('baiSafeToggle').checked;let paths=guide==='thirds'?'<path d="M106 0V180 M213 0V180 M0 60H320 M0 120H320"/>':guide==='diagonal'?'<path d="M0 0L320 180 M320 0L0 180"/>':guide==='dynamic'?'<path d="M0 0L320 180 M320 0L0 180 M0 0L198 180 M320 0L122 180 M0 180L198 0 M320 180L122 0"/>':'';$('baiOutputOverlay').innerHTML=`<svg viewBox="0 0 320 180" preserveAspectRatio="none"><g stroke="#f1d652" stroke-width="1" fill="none" opacity=".75">${paths}</g>${safe?'<rect x="18" y="10" width="284" height="160" fill="none" stroke="#faf0d0" stroke-dasharray="5 3"/>':''}</svg>`}['baiGuide','baiSafeToggle'].forEach(id=>$(id).onchange=drawOverlay);
let dialogCallback=null;function dialog(title,fields,done){$('baiDialogTitle').textContent=title;$('baiDialogBody').innerHTML=fields;$('baiDialog').hidden=false;dialogCallback=done}$('baiDialogCancel').onclick=()=>{$('baiDialog').hidden=true};$('baiDialogOK').onclick=()=>{if(dialogCallback)dialogCallback()};
function jsonDownload(name,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function action(name){$('baiFileDropdown').hidden=true;if(name==='newProject'){dialog('新規プロジェクト','<label>作品名</label><input id="baiNewName" placeholder="作品名" maxlength="80"><label>作品の種類</label><select id="baiNewType"><option>3Dダンス動画</option><option>MV・シネマティック</option><option>一般動画</option><option>空のプロジェクト</option></select><label>解像度</label><select><option>1920 × 1080</option><option>1080 × 1920</option></select><label>FPS</label><select><option>60</option><option>30</option></select>',()=>{let n=$('baiNewName').value.trim();if(!n){notify('作品名を入力してください');return}const k={'3Dダンス動画':'dance','MV・シネマティック':'mv','一般動画':'video','空のプロジェクト':'empty'}[$('baiNewType').value]||'empty';createCatalogProject(n,k).then(()=>{$('baiDialog').hidden=true;page('projects');notify('作品一覧に保存しました。編集データは別途管理されます')}).catch(e=>notify('作成失敗：'+e.message))});return}
if(name.startsWith('save')){const kind=name==='saveProject'?'project':name==='saveProfile'?'profile':'workspace';let payload=kind==='project'?{name:projects[selectedProject]?.name,projects,selectedProject,notice:'UI状態のみ。3Dエンジン・モーション実データは含まれません'}:kind==='profile'?{language:localStorage.getItem('bai.ui.lang')||'jp',version:'0.5'}:{workspace:document.querySelector('#nav .tab.on')?.dataset.workspace||'edit',version:'0.5'};jsonDownload('BAI_'+kind+'_mock_v05.json',{kind,version:'0.5',payload});return}
if(name.startsWith('load')){$('baiFileInput').dataset.kind=name==='loadProject'?'project':name==='loadProfile'?'profile':'workspace';$('baiFileInput').click()}}
$('baiFileMenu').onclick=()=>{$('baiFileDropdown').hidden=!$('baiFileDropdown').hidden};$('baiFileInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());if(data.kind!==e.target.dataset.kind||data.version!=='0.5')throw Error('形式が一致しません');if(data.kind==='project'){projects=data.payload.projects;selectedProject=data.payload.selectedProject||0;localStorage.setItem(storeKey,JSON.stringify(projects));renderProjects();notify('作品リストのUI状態を読み込みました')}else if(data.kind==='workspace'){page(data.payload.workspace);notify('画面レイアウトの試作設定を読み込みました')}else notify('利用者設定の試作JSONを確認しました（表示言語変更は設定画面で実行）')}catch(err){notify('読み込み失敗：'+err.message)}e.target.value=''};
const navExport=document.querySelector('#nav [data-workspace="export"]');if(navExport)navExport.addEventListener('click',e=>{e.stopImmediatePropagation();e.preventDefault();page('output')},true);
renderProjects();drawOverlay();page('home');fetchCatalog();
})();
