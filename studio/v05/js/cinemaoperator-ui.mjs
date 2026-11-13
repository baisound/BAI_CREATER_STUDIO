/* Real addon workflow; camera comparison/adoption stays in the existing B1 UI. */
const project=document.getElementById('v06project');
const panel=document.createElement('section');panel.id='cinemaoperator-panel';panel.setAttribute('aria-label','CinemaOperator連携');panel.hidden=true;
panel.innerHTML=`<h3>CinemaOperatorで撮影する</h3>
 <input id="co-file" type="file" accept=".zip" hidden>
 <button id="co-inspect" type="button">BlenderアドオンZIPを選ぶ…</button>
 <div id="co-inspected" hidden><label for="co-inner">登録するインストール用ZIP</label><select id="co-inner"></select><p id="co-inspect-info"></p><button id="co-register" type="button">この版を登録</button></div>
 <label for="co-addon">登録済みアドオン</label><select id="co-addon"></select><p id="co-support"></p>
 <details><summary>版・権利の詳細</summary><p id="co-license"></p><code id="co-hash"></code><button id="co-remove" type="button">参照のない版を登録解除</button></details>
 <h4>Blenderへ渡す作品</h4><p id="co-project"></p><p>PMX・GLB・VRMの動き・表情・口を撮影用コピーへ固定します。Blenderではカメラを編集し、カメラだけをStudioへ戻します。音声・画像・動画はStudio側で合成します。</p>
 <div class="co-range"><label>開始F<input id="co-start" type="number" min="0" step="1" value="0"></label><label>終了F（含む）<input id="co-end" type="number" min="0" step="1" value="59"></label></div>
 <details><summary>撮影コピーの対応範囲</summary><p>骨の編集はできません。形状はタイムラインと同じ評価結果です。タイムライン未対応の二次物理は含みません。撮影用テクスチャは最大4096pxです。トゥーン・輪郭線・照明はBlenderとStudioで異なり、Studio出力は元の素材を使います。</p><p>0.1〜120秒・形状512MiB以内。容量や時間を超えたら終了Fを短くし、頂点100万・メッシュ256個を超えたら対象モデルを減らして準備してください。</p></details><button id="co-prepare" type="button">別名の作業コピーを準備</button><p id="co-progress" role="status"></p>
 <label for="co-session">作業コピー・再開</label><select id="co-session"></select><p id="co-session-info"></p>
 <label><input id="co-ack" type="checkbox">この登録版のPythonコードをBlenderで実行する</label>
 <button id="co-open" type="button">Blenderで撮影を編集</button>
 <p>BlenderのStudioタブからCinemaOperatorを開き、撮影を編集 → Bake Camera to Keyframes →「現在のBakeを候補へ送る」。現在の画面を別名保存します。</p>
 <button id="co-return" type="button">送信済みBakeを受け取る</button>
 <button id="co-reload" type="button">登録版・作業コピーを再読込</button>
 <p id="co-status" role="status" tabindex="-1">最初にアドオンZIPを検査・登録してください。</p>`;
const nav=document.createElement('nav');nav.id='blender-workflow-tabs';nav.setAttribute('aria-label','Blenderカメラ制作');
nav.innerHTML='<button type="button" id="co-tab-import" aria-pressed="true">カメラ取込</button><button type="button" id="co-tab-addon" aria-pressed="false">CinemaOperator</button>';
const style=document.createElement('style');style.textContent=`#blender-workflow-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:7px 0}#blender-workflow-tabs [aria-pressed=true]{background:#245a82;border-color:#78beeb}#cinemaoperator-panel{min-width:0}#cinemaoperator-panel :is(p,code){overflow-wrap:anywhere;font-size:12px}#cinemaoperator-panel :is(h3,h4){margin:10px 0 6px}#cinemaoperator-panel p{margin:6px 0}#cinemaoperator-panel label{display:block;margin-top:7px;font-size:12px}#cinemaoperator-panel :is(select,input[type=number]){width:100%;min-width:0;max-width:100%;box-sizing:border-box;background:#152332;color:#e8f3ff}#cinemaoperator-panel button{margin:5px 0}#cinemaoperator-panel .co-range{display:grid;grid-template-columns:1fr 1fr;gap:5px}#cinemaoperator-panel :is(button,input,select):focus-visible,#blender-workflow-tabs button:focus-visible{outline:2px solid #8cdbff;outline-offset:2px}#co-status{white-space:pre-wrap}`;
document.head.append(style);
const $=id=>panel.querySelector('#co-'+id);let sourceFile=null,choices=[],addons=[],sessions=[],busy=false,mode='import',mounted=false;
const selectedAddon=()=>addons.find(a=>a.id===$('addon').value),selectedSession=()=>sessions.find(s=>s.id===$('session').value);
async function request(path,body,headers={}){
 const response=await fetch('/api/studio/v05/blender-addons'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':body instanceof Blob||body instanceof Uint8Array?'application/octet-stream':'application/json',...headers},body:body instanceof Blob||body instanceof Uint8Array?body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);return data;
}
function show(value){mode=value;workspace();}
function workspace(){const visible=document.body.dataset.workspace==='camera';nav.hidden=!visible;panel.hidden=!visible||mode!=='addon';const b1=document.getElementById('blender-camera-import');if(b1)b1.hidden=!visible||mode!=='import';nav.querySelector('#co-tab-import').setAttribute('aria-pressed',String(mode==='import'));nav.querySelector('#co-tab-addon').setAttribute('aria-pressed',String(mode==='addon'));}
function update(){
 const a=selectedAddon(),s=selectedSession();$('support').textContent=a?(a.supported?'登録済み・CinemaOperator連携に対応（Blender 5.1/5.2）':'登録済み・実行不可：'+a.reason):'未登録：ZIPを選んで検査してください。';
 $('license').textContent=a?.license||'';$('hash').textContent=a?.id||'';$('addon').title=a?.name||'';
 $('project').textContent='対象作品：'+(project?.selectedOptions[0]?.textContent||'作品を選択');
 $('session-info').textContent=s?`選択：${s.id.slice(0,8)} / ${new Intl.DateTimeFormat('ja-JP',{dateStyle:'short',timeStyle:'medium'}).format(new Date(s.created_at*1000))} / ${addons.find(a=>a.id===s.addon_id)?.name||'登録版なし'} ${addons.find(a=>a.id===s.addon_id)?.version.join('.')||''} / 作品F ${s.start_frame}–${s.end_frame}`:'';
 $('session').title=$('session-info').textContent;
 for(const el of panel.querySelectorAll('button,input,select'))el.disabled=busy;
 $('register').disabled=busy||!sourceFile||!choices.length;$('prepare').disabled=busy||!a?.supported||!project?.value;
 $('open').disabled=busy||!s||!$('ack').checked;$('return').disabled=busy||!s;$('remove').disabled=busy||!a;
 $('open').classList.toggle('primary',Boolean(s&&$('ack').checked));$('prepare').classList.toggle('primary',Boolean(a?.supported&&!s));
}
async function reload(keepSession=$('session').value,keepAddon=$('addon').value){
 const pid=project?.value;const data=await request('?'+new URLSearchParams(pid?{project_id:pid}:{}));if(pid!==project?.value)return;
 addons=data.addons;sessions=data.sessions;$('addon').replaceChildren(new Option(addons.length?'登録版を選択':'未登録',''));
 for(const a of addons)$('addon').add(new Option(`${a.name} ${a.version.join('.')} · ${a.supported?'対応':'未対応'}`,a.id));
 $('addon').value=addons.some(a=>a.id===keepAddon)?keepAddon:addons.find(a=>a.supported)?.id||addons[0]?.id||'';
 $('session').replaceChildren(new Option('作業コピーを選択',''));for(const s of sessions)$('session').add(new Option(`${s.id.slice(0,8)} · ${new Intl.DateTimeFormat('ja-JP',{dateStyle:'short',timeStyle:'medium'}).format(new Date(s.created_at*1000))} · F${s.start_frame}–${s.end_frame} / ${s.fps}fps · ${s.status==='candidate'?'候補あり':s.status==='opened'?'起動済み':'準備済み'}`,s.id));
 if(sessions.some(s=>s.id===keepSession))$('session').value=keepSession;update();
}
async function run(action){
 if(busy)return;const trigger=document.activeElement;busy=true;update();let focus=null;
 try{focus=await action();}catch(error){$('status').textContent=String(error.message||error);focus=error.field||$('status');}
 finally{$('progress').textContent='';panel.removeAttribute('aria-busy');busy=false;update();(focus||trigger)?.focus();}
}
function frames(){
 const result=[];for(const name of ['start','end']){const input=$(name),value=Number(input.value);input.removeAttribute('aria-invalid');if(input.value.trim()===''||!Number.isInteger(value)||value<0){input.setAttribute('aria-invalid','true');const e=Error('開始F・終了Fは0以上の整数にしてください');e.field=input;throw e;}result.push(value);}return result;
}
$('inspect').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',()=>void run(async()=>{
 sourceFile=$('file').files?.[0];if(!sourceFile)return;$('status').textContent='ZIPを静的に検査中…';choices=[];$('inspected').hidden=true;
 const result=await request('/inspect',sourceFile);choices=result.distribution?result.choices:[result];$('inner').replaceChildren();for(const c of choices)$('inner').add(new Option((c.member||sourceFile.name)+' · '+c.version.join('.'),c.member));$('inspected').hidden=false;
 $('inspect-info').textContent=choices[0].supported?'確認済みのCinemaOperator 0.7.183です。登録では実行しません。':'この版は登録できますが、実行と結果取込は未対応です。';$('status').textContent='内側ZIP・版を確認して「この版を登録」を押してください。';return $('inner');
}));
$('inner').addEventListener('change',()=>{$('inspect-info').textContent=choices.find(c=>c.member===$('inner').value)?.supported?'対応版です。登録では実行しません。':'この版は登録できますが、実行と結果取込は未対応です。';});
$('register').addEventListener('click',()=>void run(async()=>{const added=await request('/register?'+new URLSearchParams({member:$('inner').value}),sourceFile);await reload('',added.id);$('inspected').hidden=true;sourceFile=null;$('file').value='';$('status').textContent=added.supported?'登録しました。作品と区間を確認し、作業コピーを準備してください。':added.reason;return added.supported?$('start'):$('status');}));
$('prepare').addEventListener('click',()=>void run(async()=>{
 const [start_frame,end_frame]=frames(),pid=project.value;$('status').textContent='別名のBlender作業コピーを準備中…';
 $('progress').textContent='形状を準備中… モデルの量と区間に応じて数分かかります。';panel.setAttribute('aria-busy','true');
 const result=await request('/prepare',{project_id:pid,addon_id:$('addon').value,start_frame,end_frame});if(pid!==project.value)return;
 await reload(result.id);$('ack').checked=false;$('status').textContent=`準備済み：作品F ${result.start_frame}–${result.end_frame}。Blenderで撮影する版を確認してください。`;return $('ack');
}));
$('session').addEventListener('change',()=>{const s=selectedSession();if(s){$('start').value=String(s.start_frame);$('end').value=String(s.end_frame);$('addon').value=s.addon_id;}$('ack').checked=false;update();});
for(const el of [$('start'),$('end'),$('addon')])el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{$('session').value='';$('ack').checked=false;update();});
$('ack').addEventListener('change',update);
$('open').addEventListener('click',()=>void run(async()=>{
 const result=await request('/open',{session_id:$('session').value,acknowledged:$('ack').checked},{'X-BAI-Local-Action':'cinemaoperator'});
 if(result.requires_local_action)throw Error(result.message);$('status').textContent='Blenderを起動しました。StudioタブからCinemaOperatorを開いて編集・Bakeし、「現在のBakeを候補へ送る」で戻してください。';return $('return');
}));
$('return').addEventListener('click',()=>void run(async()=>{
 const pid=project.value;const c=await request('/import-bake',{session_id:$('session').value});if(pid!==project.value)return;
 await window.BAIStudioBlenderCamera.selectCandidate(c.id,c.start_frame);show('import');return document.getElementById('bc-go');
}));
$('reload').addEventListener('click',()=>void run(async()=>{await reload();$('status').textContent='登録版とこの作品の作業コピーを読み込みました。';}));
$('remove').addEventListener('click',()=>void run(async()=>{await request('/remove',{addon_id:$('addon').value});await reload();$('status').textContent='登録解除しました。原本ファイルは保持しています。';return $('inspect');}));
nav.querySelector('#co-tab-import').addEventListener('click',()=>show('import'));
nav.querySelector('#co-tab-addon').addEventListener('click',()=>{window.BAIStudioBlenderCamera?.cancelComparison();show('addon');});
function mount(){const b1=document.getElementById('blender-camera-import');if(!b1?.parentElement||mounted)return mounted;mounted=true;b1.before(nav);b1.after(panel);workspace();reload().catch(error=>{$('status').textContent=error.message;});return true;}
if(!mount()){const observer=new MutationObserver(()=>{if(mount())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}
new MutationObserver(workspace).observe(document.body,{attributes:true,attributeFilter:['data-workspace']});
window.addEventListener('bai:v05-project-changed',()=>{$('session').value='';$('ack').checked=false;$('status').textContent='作品を切り替えました。この作品の作業コピーを選ぶか準備してください。';reload().catch(error=>{$('status').textContent=error.message;});});

async function registerTools(){
 if(!document.modelContext?.registerTool)return;
 const fields={project_id:{type:'string'},addon_id:{type:'string'},start_frame:{type:'integer'},end_frame:{type:'integer'}};
 const tools=[
  ['bai_studio_blender_addons_list','Read registered addons and project shooting sessions.',{project_id:{type:'string'}},['project_id'],input=>request('?'+new URLSearchParams(input))],
  ['bai_studio_blender_addon_inspect','Statically inspect addon ZIP bytes; never execute code.',{archive_base64:{type:'string'}},['archive_base64'],input=>request('/inspect',Uint8Array.from(atob(input.archive_base64),c=>c.charCodeAt(0)))],
  ['bai_studio_blender_addon_register','Register a selected inspected ZIP without execution.',{archive_base64:{type:'string'},member:{type:'string'}},['archive_base64','member'],input=>request('/register?'+new URLSearchParams({member:input.member}),Uint8Array.from(atob(input.archive_base64),c=>c.charCodeAt(0)))],
  ['bai_studio_blender_addon_prepare','Prepare the supported project scene as a separate Blender working copy.',fields,Object.keys(fields),input=>request('/prepare',input)],
  ['bai_studio_blender_addon_open','Requires a manual local Studio action; MCP cannot execute addon code.',{session_id:{type:'string'}},['session_id'],()=>({requires_local_action:true,message:'Studioの「Blenderで編集」から対象版と作品を確認して起動してください'})],
  ['bai_studio_blender_addon_import_bake','Read the explicitly sent baked snapshot as an immutable camera candidate; comparison/adoption remain separate.',{session_id:{type:'string'}},['session_id'],input=>request('/import-bake',input)],
  ['bai_studio_blender_addon_remove','Unregister an unused version, preserving files; sessions block removal.',{addon_id:{type:'string'}},['addon_id'],input=>request('/remove',input)]
 ];
 for(const [name,description,properties,required,execute] of tools)try{document.modelContext.registerTool({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},async execute(input){return {content:[{type:'text',text:JSON.stringify(await execute(input))}]};}});}catch{}
}
registerTools();window.addEventListener('bai:webmcp-ready',registerTools,{once:true});
