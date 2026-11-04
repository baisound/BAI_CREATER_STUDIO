(()=>{'use strict';
// WP-L6 旧保存の取込（設計書 docs/roadmap/LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md §7）。
// 作品カードの［旧保存を取り込む…］（workspaces-v05.js）から呼ばれ、HTTP窓口 /api/studio/v05/project/legacy-import… を使う。
// 画面に出す文はサーバーが返すもの（§3.4・§3.5）をそのまま使い、内部の名前は出さない。
const API='/api/studio/v05/project/legacy-import';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TERMS={
 'スナップショット':'スナップショット＝［現行編集を保存］で作品に残した、旧画面の保存の写し',
 'FPS':'FPS＝1秒あたりのコマ数',
 '取込記録':'取込記録＝何をどこへ写し、何を写さなかったかの記録。取消に使います'
};
// 用語は、画面に出るすべての場所で abbr にする（サーバーの文も同じ）。
const rich=text=>esc(text).replace(/スナップショット|FPS|取込記録/g,t=>`<abbr title="${esc(TERMS[t])}">${t}</abbr>`);
// 設計書 §3.4 で区分が「警告」のコード。取込結果の「注意」の件数に使う（サーバーの summary.warnings と同じ数え方）。
const WARNING_CODES=['UNIT_SEMANTICS_DIFFER','PLACED_AT_ORIGIN','MOTION_TARGET_UNSET','NAME_DUPLICATE_LAST_WINS','BLEND_DROPPED','FPS_KEPT_USER_CHANGE'];
const CONFIRM_TEXT={
 apply:'この作品へ取り込みます。あとで［取込を取消］で戻せます。',
 revert:'取り込んだキャラクター・ステージ・クリップを、あとで動かした分も含めて削除します。再生位置はそのままです。表情キーのUndo履歴は空になります。',
 interrupted:'前回の操作が途中で止まっています。取込前に戻します。'
};
const INCLUDE_ORDER=['music_dance','timeline_editor'];

function jst(value){
 if(typeof value!=='string'||!value)return '日時不明';
 const text=value.replace(/(\.\d{3})\d+/,'$1');
 const parsed=Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/.test(text)?text:text+'Z');
 if(!Number.isFinite(parsed))return '日時不明';
 return new Date(parsed+9*60*60*1000).toISOString().slice(0,19).replace('T',' ')+' JST';
}
const quoted=label=>{const m=/「(.*)」/.exec(label||'');return m?m[1]:null};

let dialog=null,body=null,state=null,seq=0;

function installStyle(){
 if(document.getElementById('v188LegacyImportStyle'))return;
 const style=document.createElement('style');style.id='v188LegacyImportStyle';
 style.textContent=`
#v188LegacyImport{padding:0;border:1px solid #53667b;border-radius:12px;background:#1d2938;color:var(--ink,#e9edf4);width:min(780px,94vw);max-height:min(660px,calc(100vh - 40px));overflow:hidden}
#v188LegacyImport[open]{display:flex;flex-direction:column}
#v188LegacyImport::backdrop{background:rgba(5,9,15,.6)}
#v188LegacyImport .v188-head{flex:none;padding:16px 22px 10px;border-bottom:1px solid #364252}
#v188LegacyImport h2{font-size:16px;margin:0}
#v188LegacyImport .v188-body{flex:1 1 auto;min-height:0;overflow:auto;padding:12px 22px;line-height:1.7}
#v188LegacyImport .v188-foot{flex:none;padding:10px 22px 16px;border-top:1px solid #364252}
#v188LegacyImport p{margin:6px 0}
#v188LegacyImport .v188-source{color:#c9d6e6}
#v188LegacyImport .v188-reject{border:1px solid #c9803c;background:#3a2a1c;border-radius:7px;padding:8px 10px}
#v188LegacyImport .v188-extra{border:1px solid #364252;border-radius:8px;margin:10px 0;padding:8px 12px}
#v188LegacyImport .v188-extra legend{padding:0 6px;font-weight:600}
#v188LegacyImport .v188-extra label{display:block;margin:4px 0}
#v188LegacyImport .v188-extra .off{color:#7f8da0}
#v188LegacyImport .v188-note{font-size:11px;color:#a2b5c9}
#v188LegacyImport table{width:100%;border-collapse:collapse;font-size:11px;margin-top:6px}
#v188LegacyImport th,#v188LegacyImport td{border-bottom:1px solid #364252;padding:4px 6px;text-align:left;vertical-align:top}
#v188LegacyImport abbr{text-decoration:underline dotted;cursor:help}
#v188LegacyImport .v188-confirm{border:1px solid #4a607a;background:#16202d;border-radius:8px;padding:8px 12px;margin-bottom:8px}
#v188LegacyImport .v188-buttons{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;align-items:center}
#v188LegacyImport .v188-status{min-height:1.6em;margin:0 0 6px}
#v188LegacyImport button.primary{background:#2f6fb0;border-color:#5fb0ff}
#v188LegacyImport button:focus-visible,#v188LegacyImport input:focus-visible,#v188LegacyImport summary:focus-visible{outline:2px solid #f2b84e;outline-offset:2px}
#v188LegacyImport button:disabled{opacity:.55;cursor:default}`;
 document.head.appendChild(style);
}
function ensureDialog(){
 if(dialog)return;
 installStyle();
 dialog=document.createElement('dialog');dialog.id='v188LegacyImport';dialog.setAttribute('aria-labelledby','v188Title');
 dialog.innerHTML='<div class="v188-head"><h2 id="v188Title">旧画面の保存を、この作品へ取り込む</h2></div><div class="v188-body" data-role="body"></div><div class="v188-foot" data-role="foot"></div>';
 document.body.appendChild(dialog);
 body=dialog.querySelector('[data-role="body"]');
 dialog.addEventListener('click',onClick);
 dialog.addEventListener('change',onChange);
 dialog.addEventListener('close',()=>{seq++;state=null});
}

async function request(url,options){
 let response;
 try{response=await fetch(url,{cache:'no-store',...options})}catch(error){return {ok:false,status:0,data:{error:'サーバーに接続できませんでした。［閉じる］を押して、画面を開き直してください。'}}}
 let data=null;try{data=await response.json()}catch{data={error:'サーバーの応答を読めませんでした。［閉じる］を押して、画面を開き直してください。'}}
 return {ok:response.ok,status:response.status,data};
}
const includeList=()=>INCLUDE_ORDER.filter(key=>state.include[key]);
function previewUrl(include){
 const query=new URLSearchParams({id:state.project.id,include:include.join(','),fps_policy:state.fpsPolicy});
 return `${API}-preview?${query}`;
}

// 記録と確認を読み直す。keepMessage のときは、直前の拒否の文と結果の行を残す。
async function load({keepMessage=false}={}){
 const token=++seq,current=state;
 current.loading=true;if(!keepMessage){current.error=null;current.status=''}
 current.confirming=null;render();
 const [record,preview]=await Promise.all([request(`${API}?id=${encodeURIComponent(current.project.id)}`),request(previewUrl(includeList()))]);
 if(token!==seq||state!==current)return;
 current.loading=false;current.record=record.ok?record.data.record:null;
 current.recordError=record.ok?null:record.data.error;
 current.preview=null;current.previewError=null;current.probe=null;
 if(preview.ok)current.preview=preview.data;else current.previewError=preview.data;
 if(current.preview?.ok){
  const probe=await request(previewUrl(INCLUDE_ORDER));
  if(token!==seq||state!==current)return;
  current.probe=probe.ok?probe.data:null;
 }
 render();
}

function viewMode(){
 if(state.loading)return 'loading';
 if(state.recordError||state.previewError)return 'error';
 const recordState=state.record?.state;
 if(recordState==='applied')return 'applied';
 if(['applying','reverting','undo_failed'].includes(recordState))return 'interrupted';
 if(state.error&&['SOURCE_CHANGED','TARGET_CHANGED'].includes(state.error.code))return 'recheck';
 if(state.preview?.ok)return 'ready';
 if(state.preview?.reject?.code==='FPS_CONFLICT')return 'fps';
 return 'rejected';
}

function sourceLine(mode){
 if(mode==='applied'||mode==='interrupted'){
  const record=state.record;if(!record?.source)return '';
  const items=record.items||[];
  const title=record.source.bundle?.combination?.title||'（名前なし）';
  const character=quoted(items.find(i=>i.id==='M3')?.label)||'なし',stage=quoted(items.find(i=>i.id==='M4')?.label)||'なし';
  return line(title,record.source.snapshot?.saved_at,character,stage);
 }
 const info=state.preview?.source_info;if(!info)return '';
 return line(info.title,info.snapshot_saved_at,info.character||'なし',info.stage||'なし');
}
const line=(title,savedAt,character,stage)=>`<p class="v188-source" data-role="source">${rich(`旧保存の名前：${title}／スナップショットを保存した日時：${jst(savedAt)}／キャラクター：${character}／ステージ：${stage}`)}</p>`;

function summaryHtml(summary){
 const mapped=summary.mapped?.length?summary.mapped.join('、'):'なし',kept=summary.kept?.length?summary.kept.join('、'):'なし';
 return `<p data-role="mapped">${rich(`写るもの：${mapped}`)}</p><p data-role="kept">${rich(`写らないもの（取込記録に残ります）：${kept}`)}</p>`;
}
function recordSummary(record){
 const items=record.items||[];
 const labels=status=>[...new Set(items.filter(i=>i.status===status).map(i=>i.label))];
 return {mapped:labels('mapped'),kept:labels('kept')};
}
function extraHtml(){
 const probe=state.probe;
 const info=probe?.source_info||{};
 const hasItem=prefix=>(probe?.items||[]).some(i=>i.id.startsWith(prefix));
 const music={exists:!!info.music_dance_updated||hasItem('S0'),updated:info.music_dance_updated};
 const timeline={exists:!!info.timeline_editor_updated||hasItem('T0')||hasItem('T1')||hasItem('T2'),updated:info.timeline_editor_updated,
  count:(probe?.items||[]).filter(i=>i.id==='T1'||i.id==='T2').length};
 const row=(key,label,data)=>`<label class="${data.exists?'':'off'}"><input type="checkbox" data-include="${key}" ${state.include[key]&&data.exists?'checked':''} ${data.exists&&!state.busy?'':'disabled'}> ${rich(label)}${data.exists?'':'　（保存がありません）'}</label>`;
 return `<fieldset class="v188-extra"><legend>追加の取込（選ばなければ取り込みません）</legend>`+
  row('music_dance',`曲とダンスの画面（SCR-10）の曲とダンスも取り込む${music.exists?`（最終更新：${jst(music.updated)}）`:''}`,music)+
  row('timeline_editor',`旧タイムライン編集の動作も取り込む${timeline.exists?`（${timeline.count}件、最終更新：${jst(timeline.updated)}）`:''}`,timeline)+
  `<p class="v188-note">この2つは作品ごとではなく、パソコン全体で1つの保存です。取り込みたい作品の内容になっているか、旧画面で確かめてから選んでください。</p></fieldset>`;
}
function detailsHtml(items){
 const rows=items.map(item=>{
  const result=item.status==='kept'?'写さない':(item.messages?.length?'注意':'写す');
  return `<tr><td>${rich(item.label)}</td><td>${result}</td><td>${item.messages?.length?item.messages.map(rich).join('<br>'):'―'}</td></tr>`;
 }).join('');
 return `<details data-role="details"><summary>詳細（${items.length}項目）</summary><table><thead><tr><th>項目</th><th>結果</th><th>理由</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

function render(focusSelector){
 if(!state||!body)return;
 const mode=viewMode(),foot=dialog.querySelector('[data-role="foot"]');
 let html='';
 if(mode==='loading'){html='<p role="status">読み込み中です…</p>'}
 else if(mode==='error'){
  const error=state.recordError||state.previewError?.error||'読み込めませんでした。［閉じる］を押して、画面を開き直してください。';
  html=`<p class="v188-reject" data-role="reject">${rich(error)}</p>`;
 }else{
  html+=sourceLine(mode);
  if(mode==='ready'){
   html+=summaryHtml(state.preview.summary)+extraHtml()+detailsHtml(state.preview.items||[]);
  }else if(mode==='applied'||mode==='interrupted'){
   const message=state.preview?.reject?.message;
   if(message)html+=`<p class="v188-reject" data-role="reject">${rich(message)}</p>`;
   if(mode==='applied'&&state.record)html+=summaryHtml(recordSummary(state.record));
  }else{
   const message=state.error?.message||state.preview?.reject?.message;
   if(message)html+=`<p class="v188-reject" data-role="reject">${rich(message)}</p>`;
  }
  if((mode==='applied'||mode==='interrupted'||mode==='ready')&&state.error)html+=`<p class="v188-reject" data-role="reject">${rich(state.error.message)}</p>`;
 }
 body.innerHTML=html;
 foot.innerHTML=footHtml(mode);
 const target=focusSelector&&dialog.querySelector(focusSelector);
 if(target)target.focus();
}
function footHtml(mode){
 const disabled=state.busy?'disabled':'';
 let confirm='',primary='';
 if(state.confirming){
  const kind=state.confirming,confirmLabel=kind==='apply'?'取り込む（確定）':'取消（確定）';
  confirm=`<div class="v188-confirm" data-role="confirm"><p>${rich(CONFIRM_TEXT[kind])}</p><div class="v188-buttons"><button type="button" class="primary" data-act="confirm-${kind}" ${disabled}>${rich(confirmLabel)}</button><button type="button" data-act="cancel-confirm" ${disabled}>やめる</button></div></div>`;
 }else if(mode==='ready')primary=`<button type="button" class="primary" data-act="start-apply" ${disabled}>取り込む</button>`;
 else if(mode==='fps')primary=`<button type="button" class="primary" data-act="start-apply-fps" ${disabled}>${rich(`作品のFPSを${state.preview.reject.params?.legacy}fpsに変えて取り込む`)}</button>`;
 else if(mode==='recheck')primary=`<button type="button" class="primary" data-act="recheck" ${disabled}>もう一度確認する</button>`;
 else if(mode==='applied')primary=`<button type="button" class="primary" data-act="start-revert" ${disabled}>取込を取消</button>`;
 else if(mode==='interrupted')primary=`<button type="button" class="primary" data-act="start-interrupted" ${disabled}>取込を取消</button>`;
 return `<p class="v188-status" role="status" data-role="status">${rich(state.status||'')}</p>${confirm}<div class="v188-buttons">${primary}<button type="button" data-act="close">閉じる</button></div>`;
}

function onChange(event){
 const box=event.target.closest('[data-include]');if(!box||!state||state.busy)return;
 state.include[box.dataset.include]=box.checked;
 state.error=null;
 void load().then(()=>{dialog.querySelector(`[data-include="${box.dataset.include}"]`)?.focus()});
}
async function onClick(event){
 const button=event.target.closest('[data-act]');if(!button||!state||state.busy)return;
 const act=button.dataset.act;
 if(act==='close'){dialog.close();return}
 if(act==='start-apply'||act==='start-apply-fps'){
  state.fpsPolicy=act==='start-apply-fps'?'use_legacy':'keep_if_same';
  state.confirming='apply';state.error=null;render('[data-act="confirm-apply"]');return;
 }
 if(act==='start-revert'){state.confirming='revert';state.error=null;render('[data-act="confirm-revert"]');return}
 if(act==='start-interrupted'){state.confirming='interrupted';state.error=null;render('[data-act="confirm-interrupted"]');return}
 if(act==='cancel-confirm'){ // 何も送らない
  const kind=state.confirming;state.confirming=null;
  render(kind==='apply'?'[data-act="start-apply"],[data-act="start-apply-fps"]':'[data-act="start-revert"],[data-act="start-interrupted"]');return;
 }
 if(act==='recheck'){state.error=null;state.status='';await load();return}
 if(act==='confirm-apply'){await run('apply');return}
 if(act==='confirm-revert'||act==='confirm-interrupted'){await run('revert')}
}
async function run(kind){
 const current=state;current.busy=true;render();
 const payload=kind==='apply'
  ?{id:current.project.id,expected:current.preview.expected,include:includeList(),fps_policy:current.fpsPolicy,confirm:true}
  :{id:current.project.id,confirm:true};
 const result=await request(`${API}/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 if(state!==current)return;
 current.busy=false;
 if(!result.ok){
  current.error={code:result.data.error_code,message:result.data.error||'操作に失敗しました。［閉じる］を押して、画面を開き直してください。'};
  current.confirming=null;current.status='';
  if(['SOURCE_CHANGED','TARGET_CHANGED'].includes(current.error.code)){render('[data-act="recheck"]');return}
  await load({keepMessage:true});return;
 }
 const record=result.data.record;
 if(kind==='apply'){
  const items=record.items||[];
  const warnings=items.reduce((sum,item)=>sum+(item.codes||[]).filter(code=>WARNING_CODES.includes(code)).length,0);
  current.status=`取り込みました：写したもの${items.filter(i=>i.status==='mapped').length}件、写さなかったもの${items.filter(i=>i.status==='kept').length}件、注意${warnings}件`;
 }else{
  const notes=(record.undo?.warnings||[]).map(w=>w.message).filter(Boolean);
  current.status=['取込を取り消しました',...notes].join(' ');
 }
 current.error=null;
 notifyScreens(current.project.id,result.data.project);
 await load({keepMessage:true});
 dialog.querySelector('[data-act="start-revert"],[data-act="start-apply"],[data-act="close"]')?.focus();
}
// 設計書 §7.3：ほかの画面への知らせ（順番も同じ）。
function notifyScreens(projectId,project){
 window.dispatchEvent(new CustomEvent('bai:v57-scene-changed',{detail:{projectId}}));
 const select=document.getElementById('v06project');
 if(select&&select.value===projectId)select.dispatchEvent(new Event('change'));
 if(project)window.dispatchEvent(new CustomEvent('bai:project-selected-fps',{detail:{project}}));
}

function open(project){
 if(!project?.id)return;
 ensureDialog();
 state={project,include:{music_dance:false,timeline_editor:false},fpsPolicy:'keep_if_same',loading:true,busy:false,confirming:null,error:null,status:'',record:null,preview:null,probe:null};
 if(!dialog.open)dialog.showModal();
 void load().then(()=>dialog.querySelector('[data-act]:not([data-act="close"])')?.focus());
}
window.addEventListener('bai:v05-legacy-import-open',event=>open(event.detail?.project));
window.BAIStudioLegacyImportV188={open};
})();
