/* CAM-019-B1: import -> compare -> explicit atomic timeline adoption. */
const project=document.getElementById('v06project');
const panel=document.createElement('section');panel.id='blender-camera-import';panel.hidden=true;
panel.setAttribute('aria-label','Blenderカメラの取込');
panel.innerHTML=`<h3>Blenderカメラを取り込む</h3>
 <p>取込み後、同じ作品で構図を比較してカメラ行へ配置します。</p>
 <input id="bc-file" type="file" accept=".blend,.json" hidden>
 <div class="bc-actions"><button id="bc-import" type="button">.blend / カメラJSONを選ぶ…</button><button id="bc-reload" type="button">候補を再読込</button></div>
 <label for="bc-candidate">取込候補</label><select id="bc-candidate"><option value="">候補がありません</option></select>
 <label for="bc-start">配置開始F（作品上）</label><div class="bc-actions"><input id="bc-start" type="number" min="0" step="1" value="0"><button id="bc-here" type="button">現在位置</button></div>
 <p id="bc-time"></p>
 <details><summary>単位・原点を合わせる</summary><label for="bc-scale">Blender 1単位 → シーン単位</label><input id="bc-scale" type="number" min="0.000001" step="any" value="1">
 <div class="bc-offset">${['X','Y','Z'].map(axis=>`<label>${axis}オフセット<input id="bc-${axis}" type="number" step="any" value="0"></label>`).join('')}</div><small>BlenderのZ-upをY-upへ変換します。配置済みモデルは動かしません。</small></details>
 <div class="bc-actions"><button id="bc-before" type="button" aria-pressed="true">現在のカメラ</button><button id="bc-after" type="button" aria-pressed="false">取込候補を比較</button><button id="bc-go" type="button">候補の開始位置へ</button></div>
 <div id="bc-warnings" hidden><p id="bc-warning-text"></p><label><input id="bc-ack" type="checkbox">この差を了承して配置</label></div>
 <button id="bc-adopt" class="primary" type="button" disabled>カメラ行へ配置・保存</button>
 <p id="bc-status" role="status" tabindex="-1">未取込</p>`;
const style=document.createElement('style');style.textContent=`#blender-camera-import{border-top:1px solid #465c73;padding-top:10px;min-width:0}
 #blender-camera-import :is(p,small){overflow-wrap:anywhere}#blender-camera-import p{margin:6px 0;font-size:12px}
 #blender-camera-import label{display:block;margin-top:7px;font-size:12px}#blender-camera-import :is(select,input[type=number]){max-width:100%;width:100%;box-sizing:border-box;min-width:0}
 #blender-camera-import select{background:#152332;color:#e8f3ff}#blender-camera-import .bc-actions{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0;align-items:center}
 #blender-camera-import .bc-actions input{width:95px}#blender-camera-import .bc-offset{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
 #blender-camera-import button:focus-visible,#blender-camera-import input:focus-visible,#blender-camera-import select:focus-visible{outline:2px solid #8cdbff;outline-offset:2px}
 #bc-warnings{padding:6px;border-left:3px solid #e4bc6d}#bc-adopt{margin-top:8px}`;document.head.append(style);
const $=id=>panel.querySelector('#bc-'+id),status=$('status');
let candidates=[],prepared=null,verified=false,busy=false,epoch=0,focusAfter=null;
const fields=[$('start'),$('scale'),$('X'),$('Y'),$('Z')];
const pid=()=>project?.value;
const current=()=>candidates.find(c=>c.id===$('candidate').value);
async function request(path,body){
  const response=await fetch('/api/studio/v05/blender-camera'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);return data;
}
function values(){
  const invalid=(input,message)=>{input.setAttribute('aria-invalid','true');const error=Error(message);error.field=input;throw error;};
  for(const input of fields){input.removeAttribute('aria-invalid');if(input.value.trim()===''||!Number.isFinite(Number(input.value)))invalid(input,(input.id==='bc-start'?'配置開始F':input.id==='bc-scale'?'単位倍率':input.id.slice(3)+'オフセット')+'を数値で入力してください');}
  const frame=Number($('start').value),scale=Number($('scale').value);
  if(!Number.isInteger(frame)||frame<0)invalid($('start'),'配置開始Fは0以上の整数にしてください');
  if(scale<.000001||scale>10000)invalid($('scale'),'単位倍率は0.000001〜10000にしてください');
  for(const axis of ['X','Y','Z'])if(Math.abs(Number($(axis).value))>1000000)invalid($(axis),axis+'オフセットは±1000000以内にしてください');
  if(!current())throw Error('取込候補を選択してください');
  return {project_id:pid(),candidate_id:current().id,start_frame:frame,mapping:{scale,offset:['X','Y','Z'].map(k=>Number($(k).value))}};
}
function signature(){return JSON.stringify([pid(),$('candidate').value,...fields.map(input=>input.value)]);}
function disable(){
  $('import').disabled=busy;$('reload').disabled=busy;$('candidate').disabled=busy;
  $('after').disabled=busy||!current();$('before').disabled=busy;
  $('adopt').disabled=busy||!prepared||!verified||(current()?.warnings?.length&&!$('ack').checked);
}
function endComparison(message){
  epoch++;prepared=null;verified=false;
  window.BAIStudioMediaPreviewV68?.comparisonRange(null);
  try{if(window.BAIStudioMultiScenePreview?.status().opened)window.BAIStudioMultiScenePreview.setCameraCandidate(null);}catch{}
  $('before').setAttribute('aria-pressed','true');$('after').setAttribute('aria-pressed','false');
  if(message)status.textContent=message;disable();
}
function info(){
  const c=current();
  $('candidate').title=c?.name||'';
  $('time').textContent=c?`元F${c.source_start_frame} → 作品F${$('start').value} / 作品 ${c.sample_fps} fps / 終了F ${(Number($('start').value)+c.duration*c.sample_fps).toFixed(3)}（含まない） / 元 ${c.source_fps}/${c.source_fps_base} fps`:'候補を選ぶと元の時刻と作品上の配置を確認できます。';
  $('warnings').hidden=!c?.warnings?.length;$('warning-text').textContent=(c?.warnings||[]).join('、');
}
async function reload(selected){
  const id=pid(),token=epoch;if(!id)return;
  const data=await request('?'+new URLSearchParams({project_id:id}));if(id!==pid()||token!==epoch)return;
  candidates=data.candidates;$('candidate').replaceChildren(new Option(candidates.length?'候補を選択':'候補がありません',''));
  for(const c of candidates)$('candidate').add(new Option(`${c.name} · ${c.camera_count}カメラ / ${c.duration.toFixed(2)}秒`,c.id));
  if(candidates.some(c=>c.id===selected))$('candidate').value=selected;info();disable();
}
async function preview(input=values()){
  if(input.project_id!==pid())throw Error('同じ作品を選択してください');
  prepared=null;verified=false;status.textContent='候補の比較を準備中…';disable();
  const sig=signature(),token=epoch;
  const result=await request('/preview',input);
  if(token!==epoch||sig!==signature())throw Error('比較条件が変わりました。もう一度比較してください');
  window.BAIStudioMediaPreviewV68.comparisonRange({projectId:pid(),endFrame:Math.ceil(input.start_frame+result.candidate.duration*result.candidate.sample_fps)-1});
  await window.BAIStudioMultiScenePreview.open({composite:true,compact:true});
  if(token!==epoch||sig!==signature())throw Error('作品が変わりました。もう一度比較してください');
  const visible=window.BAIStudioMultiScenePreview.setCameraCandidate({projectId:pid(),row:result.camera_row});
  prepared={result,sig};verified=visible.inside;
  $('after').setAttribute('aria-pressed','true');$('before').setAttribute('aria-pressed','false');
  status.textContent=visible.inside?'候補・未採用：取込候補を表示中。比較中の再生位置は未保存です。':'候補区間外：現在のカメラを表示中。「候補の開始位置へ」で移動して再比較してください';disable();
  return {expected:result.expected,candidate:result.candidate.id,inside:visible.inside};
}
async function adopt(){
  if(!prepared||!verified||prepared.sig!==signature())throw Error('現在の条件で取込候補を比較してください');
  const input={...values(),expected:prepared.result.expected,allow_unsupported:$('ack').checked};
  const result=await request('/adopt',input);
  const frame=window.BAIStudioMediaPreviewV68.status().frame;
  endComparison();
  try{
    await window.BAIStudioV05Arrangement?.refreshArrangement();
    const deadline=performance.now()+15000;
    while(!window.BAIStudioMediaPreviewV68.status().ready&&performance.now()<deadline)await new Promise(resolve=>requestAnimationFrame(resolve));
    await window.BAIStudioMultiScenePreview.refresh();await window.BAIStudioMediaPreviewV68.seek(frame);
    status.textContent='配置済み：カメラ行へ保存しました。素材編集を戻す／やり直すで取消・復元できます。';
  }catch{status.textContent='配置済み：表示を再読込してください。保存したカメラは保持しています。';}
  focusAfter=$('import');return result;
}
async function run(action){
  if(busy)return;const trigger=document.activeElement;busy=true;disable();
  try{return await action();}catch(error){
    endComparison();status.textContent='拒否: '+String(error.message||error);
    focusAfter=error.field||status;if(error.field?.closest('details'))error.field.closest('details').open=true;throw error;
  }finally{busy=false;disable();const target=focusAfter||(panel.contains(trigger)&&trigger?.tagName==='BUTTON'?trigger:null);if(target)target.focus();focusAfter=null;}
}
$('import').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',()=>void run(async()=>{
  const file=$('file').files?.[0];if(!file)return;if(!pid())throw Error('作品を選んでください');
  endComparison();const id=pid(),token=epoch;status.textContent='Blenderカメラを評価・取込中…';
  const response=await fetch('/api/studio/v05/blender-camera/import?'+new URLSearchParams({project_id:id,name:file.name}),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
  const candidate=await response.json();if(!response.ok)throw Error(candidate.error||'取込に失敗しました');
  if(id!==pid()||token!==epoch)return;
  await reload(candidate.id);$('scale').value=String(candidate.unit_scale);$('ack').checked=false;
  status.textContent='候補・未採用：配置開始Fを確認し、「取込候補を比較」を押してください。';info();focusAfter=$('after');
}).catch(()=>{}).finally(()=>{$('file').value='';}));
$('reload').addEventListener('click',()=>void run(async()=>{const selected=$('candidate').value;endComparison('候補一覧を読込中…');await reload(selected);status.textContent=current()?'候補・未採用：現在の条件で比較してください。':'未取込';}).catch(()=>{}));
$('candidate').addEventListener('change',()=>{endComparison('候補・未採用：現在の条件で比較してください');$('scale').value=String(current()?.unit_scale||1);$('ack').checked=false;info();});
for(const input of fields)input.addEventListener('input',()=>{endComparison('条件を変更しました。取込候補を再比較してください。');info();});
$('ack').addEventListener('change',disable);
$('here').addEventListener('click',()=>{const s=window.BAIStudioMediaPreviewV68?.status();endComparison();$('start').value=String(s?.projectId===pid()?s.frame:0);info();});
$('after').addEventListener('click',()=>void run(()=>preview()).catch(()=>{}));
$('before').addEventListener('click',()=>{
  try{window.BAIStudioMultiScenePreview.setCameraCandidate(null);$('before').setAttribute('aria-pressed','true');$('after').setAttribute('aria-pressed','false');status.textContent='候補・未採用：現在の保存済みカメラを表示中';}catch(error){status.textContent=error.message;}
});
$('go').addEventListener('click',()=>void run(async()=>{
  const input=values(),c=current();window.BAIStudioMediaPreviewV68.comparisonRange({projectId:pid(),endFrame:Math.ceil(input.start_frame+c.duration*c.sample_fps)-1});
  await window.BAIStudioMediaPreviewV68.seek(input.start_frame);return preview(input);
}).catch(()=>{}));
$('adopt').addEventListener('click',()=>void run(adopt).catch(()=>{}));
function workspace(){
  const visible=document.body.dataset.workspace==='camera';
  if(!visible&&!panel.hidden)endComparison();panel.hidden=!visible;
}
function mount(){
  const inspector=document.getElementById('uiSelectedInspector');if(!inspector)return false;
  inspector.after(panel);workspace();reload().catch(error=>{status.textContent=error.message;});return true;
}
if(!mount()){const observer=new MutationObserver(()=>{if(mount())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}
new MutationObserver(workspace).observe(document.body,{attributes:true,attributeFilter:['data-workspace']});
window.addEventListener('bai:v05-project-changed',()=>{endComparison('未取込');candidates=[];$('candidate').replaceChildren();info();reload().catch(error=>{status.textContent=error.message;});});
window.addEventListener('bai:v58-scene-reloaded',()=>{if(prepared)endComparison('3Dを再読込しました。現在の条件で取込候補を再比較してください。');});
window.BAIStudioBlenderCamera=Object.freeze({preview,adopt,reload,state:()=>({projectId:pid(),candidateId:current()?.id,compared:verified,status:status.textContent})});

async function register(){
  if(!document.modelContext?.registerTool)return;
  const common={project_id:{type:'string'},candidate_id:{type:'string'},start_frame:{type:'integer'},mapping:{type:'object',properties:{scale:{type:'number'},offset:{type:'array',items:{type:'number'},minItems:3,maxItems:3}},required:['scale','offset'],additionalProperties:false}};
  const tools=[
    {name:'bai_studio_blender_camera_candidates',description:'Read immutable project camera candidates; optionally read the evaluated track.',inputSchema:{type:'object',properties:{project_id:{type:'string'},candidate_id:{type:'string'}},required:['project_id'],additionalProperties:false},execute:input=>request('?'+new URLSearchParams(input))},
    {name:'bai_studio_blender_camera_import_json',description:'Import evaluated Blender camera JSON as a separate candidate without modifying the project timeline.',inputSchema:{type:'object',properties:{project_id:{type:'string'},name:{type:'string'},track:{type:'object'}},required:['project_id','name','track'],additionalProperties:false},execute:input=>request('/import-json',input)},
    {name:'bai_studio_blender_camera_preview',description:'Read camera comparison conditions/track. Rendering is available in the local camera workspace through the manual comparison controls.',inputSchema:{type:'object',properties:common,required:Object.keys(common),additionalProperties:false},execute:input=>request('/preview',input)},
    {name:'bai_studio_blender_camera_adopt',description:'Explicitly place a compared camera candidate in the camera timeline using all expected comparison conditions; existing cameras are retained.',inputSchema:{type:'object',properties:{...common,expected:{type:'object'},allow_unsupported:{type:'boolean'}},required:[...Object.keys(common),'expected','allow_unsupported'],additionalProperties:false},execute:async input=>{const result=await request('/adopt',input);if(input.project_id===pid()){endComparison();await window.BAIStudioV05Arrangement?.refreshArrangement();await window.BAIStudioMultiScenePreview?.refresh();}return result;}}
  ];
  for(const tool of tools)try{document.modelContext.registerTool({...tool,async execute(input){return {content:[{type:'text',text:JSON.stringify(await tool.execute(input))}]};}});}catch{}
}
register();window.addEventListener('bai:webmcp-ready',register,{once:true});
