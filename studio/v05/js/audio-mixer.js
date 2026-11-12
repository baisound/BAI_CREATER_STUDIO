/* Saved project buses -> isolated offline VST3 processing -> shared PCM. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), buses=['music','audio','video','master'];
  const names={music:'楽曲',audio:'音声',video:'映像音',master:'マスター'};
  const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
  const copy=x=>JSON.parse(JSON.stringify(x));
  const attribute=(element,name,value)=>{element.setAttribute('data-i18n-original-'+name,value);element.setAttribute(name,value);};
  async function request(path,body){const r=await fetch('/api/studio/v05/audio/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'音声処理に失敗しました');return data;}
  let settings=null, selected='audio:1', selectedInsert=0, caps=null, dirty=false, busy=false, serial=0;
  const drafts=new Map(), history=[], strips=new Map();
  let timeline=null, rowSerial=0, template, mixer, busesArea, transportToken=0;
  const editorSessions=new Map(),pendingEditors=new Set();let editorBar;
  const stable=value=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(stable(value[key]))])):value);
  const editing=()=>[...editorSessions.values()].some(e=>e.project_id===projectId()&&['opening','editing'].includes(e.status));
  const blocked=()=>busy||pendingEditors.has(projectId())||editing();
  function returnEditorFocus(session){if(session.project_id!==projectId()||$('uiAudioRack').hidden||!$('bai-audio').classList.contains('active'))return;const strip=strips.get(session.key);([...strip?.querySelectorAll('.uiInsertSlots button')||[]][session.index]||strip?.querySelector('.uiChannelName'))?.focus();}
  function selectInsert(key,index){selected=key;selectedInsert=index;for(const [id,strip] of strips){strip.querySelector('.uiChannelName').setAttribute('aria-pressed',String(id===selected));for(const [i,button] of [...strip.querySelectorAll('.uiInsertSlots button')].entries())button.setAttribute('aria-pressed',String(id===selected&&i===selectedInsert));}renderInspector();controls();renderEditors();}
  function mergeEditorDraft(session,key,index){
    if(!current()||blocked()||session.project_id!==projectId())return false;
    const target=config(key).inserts[index];if(target?.plugin_id!==session.plugin_id)return false;
    edit(()=>{target.parameters=copy(session.parameters);target.state_id=session.state_id;settings.enabled=true;});
    session.status='draft_merged';renderEditors();say('VST画面の設定を編集内容へ反映しました。作品への保存は未完了です。');returnEditorFocus({...session,key,index});return true;
  }
  function renderEditors(){
    if(!editorBar)return;editorBar.replaceChildren();
    for(const session of editorSessions.values()){
      if(['applied','discarded','draft_merged'].includes(session.status))continue;
      const row=node('div'),labels={opening:'画面を開いています',editing:session.draft?'編集中。閉じると編集内容へ反映（未保存）':'編集中。閉じると作品へ反映',error:'画面を開けません',conflict:'回収した設定を保持中',draft_ready:'回収した設定を保持中（未保存）'};
      row.append(node('span',session.label+'：'+(labels[session.status]||session.status)));
      if(session.error)row.append(node('span',session.error));
      if(['opening','editing'].includes(session.status))for(const [text,mode,play] of [['反映して閉じる','apply',false],[session.draft?'保存して試聴':'反映して試聴','apply',true],['変更を破棄','discard',false]]){const button=node('button',text);button.type='button';button.onclick=async()=>{button.disabled=true;session.playAfter=play;try{await request('editor-close',{id:session.id,mode});}catch(e){say(e.message);button.disabled=false;}};row.append(button);}
      if(['conflict','draft_ready'].includes(session.status)){
        if(session.project_id===projectId()){
          const apply=node('button','選択中の同じVSTへ設定を反映（未保存）');apply.type='button';apply.disabled=blocked()||!current()||config(selected).inserts[selectedInsert]?.plugin_id!==session.plugin_id;apply.onclick=()=>mergeEditorDraft(session,selected,selectedInsert);row.append(apply);
        }
        const discard=node('button','回収した変更を破棄');discard.type='button';discard.onclick=async()=>{try{Object.assign(session,await request('editor-close',{id:session.id,mode:'discard'}));renderEditors();render();returnEditorFocus(session);}catch(e){say(e.message);}};row.append(discard);
      }
      editorBar.append(row);
    }
    window.dispatchEvent(new CustomEvent('bai:v05-mixer-layout-changed'));
  }
  async function pollEditor(session){
    try{
      const result=await request('editor-status?id='+session.id),changed=result.status!==session.status||result.error!==session.error;
      Object.assign(session,result);if(changed)renderEditors();
      if(result.status==='draft_ready'){
        session.polling=false;
        const target=current()&&result.project_id===projectId()?config(result.key).inserts[result.index]:null;
        if(target&&session.initial_insert&&stable(target)===stable(session.initial_insert)&&mergeEditorDraft(session,result.key,result.index)){if(session.playAfter)prepareButton.click();}
        else {render();renderEditors();}
        return;
      }
      if(result.status==='applied'){
        session.polling=false;
        if(result.project_id===projectId()&&current()){
          if(dirty){session.status='conflict';renderEditors();say('未保存の編集を保持しました。VSTの設定は作品に保存済みです。');return;}
          const mine=serial,saved=await request('settings?project_id='+encodeURIComponent(result.project_id));
          if(mine!==serial||result.project_id!==projectId())return;
          settings=saved;selected=result.key;selectedInsert=result.index;render();renderEditors();
          window.dispatchEvent(new CustomEvent('bai:v05-mixer-saved',{detail:saved}));returnEditorFocus(session);
          if(session.playAfter)prepareButton.click();
          say('VST画面の設定を作品へ保存しました。');
        }
        return;
      }
      if(['discarded','error','conflict'].includes(result.status)){session.polling=false;render();renderEditors();returnEditorFocus(session);return;}
    }catch(e){say('VST画面の状態を確認できません：'+e.message);}
    setTimeout(()=>void pollEditor(session),350);
  }
  function startEditorPoll(session){if(session.polling)return;session.polling=true;void pollEditor(session);}
  async function restoreEditors(){
    const pid=projectId(),mine=serial;if(!pid)return;
    try{
      const result=await request('editor-list?project_id='+encodeURIComponent(pid));if(mine!==serial||pid!==projectId())return;
      if(current()&&!dirty&&result.settings_revision!==settings.revision){const saved=await request('settings?project_id='+encodeURIComponent(pid));if(mine!==serial||pid!==projectId())return;settings=saved;}
      for(const record of result.sessions){
        let session=editorSessions.get(record.id);
        if(session?.status==='draft_merged')continue;
        if(!session){session={...record,label:$('v06project').selectedOptions[0]?.textContent+' / '+title(record.key)+' / '+record.name};editorSessions.set(record.id,session);}
        else Object.assign(session,record);
        if(['opening','editing','draft_ready'].includes(session.status))startEditorPoll(session);
      }
      render();renderEditors();
    }catch(e){if(mine===serial)say('VST画面の回収情報を読めません：'+e.message);}
  }
  async function openEditor(key,index){
    if(!current()||busy||pendingEditors.has(projectId()))return;
    const pid=projectId(),mine=serial,label=$('v06project').selectedOptions[0]?.textContent+' / '+title(key),initial=copy(config(key).inserts[index]);
    const body={project_id:pid,key,index,revision:settings.revision,...(dirty?{draft_insert:initial}:{})};
    pendingEditors.add(pid);render();
    try{
      const result=await request('editor-open',body);
      let session=editorSessions.get(result.id);
      if(!session){session={...result,label:label+' / '+result.name};editorSessions.set(result.id,session);startEditorPoll(session);}
      renderEditors();say('VST画面を開いています。'+(result.draft?'未保存の編集内容から開きます。':'閉じると作品へ反映します。'));
    }catch(e){if(pid===projectId())say('VST画面を開けません：'+e.message);}
    finally{pendingEditors.delete(pid);if(pid===projectId()&&mine===serial)render();}
  }
  const row=key=>timeline?.rows.find(r=>r.key===key);
  const title=key=>row(key)?.name||names[key]||key;
  const config=key=>key.includes(':')?(settings.tracks[key]||={gain_db:0,solo:false,inserts:[]}):settings.channels[key];
  async function refreshRows(){
    const pid=projectId(),mine=++rowSerial;
    if(!pid)return;
    try{const data=await request('tracks?project_id='+encodeURIComponent(pid));if(mine!==rowSerial||pid!==projectId())return;timeline=data;if(current())render();window.dispatchEvent(new CustomEvent('bai:v05-audio-rows',{detail:data}));}
    catch(e){if(mine===rowSerial)say('行情報を読み込めません：'+e.message);}
  }
  async function muteLane(key){
    if(!current()||blocked()||!timeline)return;
    const pid=projectId(),mine=serial,target=row(key);busy=true;render();
    try{const result=await request('lane-mute',{project_id:pid,revision:timeline.layout_revision,key,muted:!target.muted});window.dispatchEvent(new CustomEvent('bai:v05-track-layout-changed',{detail:result}));}
    catch(e){if(mine===serial)say('ミュートを保存できません：'+e.message);}
    finally{if(mine===serial){busy=false;await refreshRows();render();}}
  }
  function ensureStrip(key){
    if(strips.has(key))return strips.get(key);
    const strip=template.cloneNode(true);strip.classList.toggle('uiMasterStrip',key==='master');strip.dataset.channel=key;
    for(const e of strip.querySelectorAll('[id]'))e.removeAttribute('id');
    strip.querySelector('.uiChannelName').onclick=()=>{selected=key;selectedInsert=0;render();};
    strip.querySelector('.uiInsertChain>button').onclick=()=>chooser(key);
    const range=strip.querySelector('input[type=range]');range.dataset.focusKey='gain-'+key;range.oninput=()=>{strip.querySelector('.uiGainReadout').textContent=Number(range.value).toFixed(1)+' dB';};
    range.onchange=()=>edit(()=>{settings.enabled=true;config(key).gain_db=Number(range.value);});
    for(const [i,button] of [...strip.querySelectorAll('.uiChannelMute button')].entries())button.onclick=()=>{if(!i&&row(key))void muteLane(key);else edit(()=>{settings.enabled=true;const c=config(key),field=i?'solo':'mute';c[field]=!c[field];});};
    strip.querySelector('.uiChannelInput').onclick=()=>{const clip=row(key)?.clips[0];if(!clip)return;window.baiGo('edit');window.dispatchEvent(new CustomEvent('bai:v05-clip-selected',{detail:{projectId:projectId(),clip}}));void window.BAIStudioMediaPreviewV68?.seek(Math.round(clip.start*(window.BAIStudioMediaPreviewV68.status().fps||30)));};
    const notice=node('button','');notice.type='button';notice.className='vstTypeMuteNotice';notice.hidden=true;strip.querySelector('.uiChannelInput').after(notice);
    notice.onclick=()=>{if(row(key)?.bus_muted){window.baiGo('edit');const target=document.querySelector('[data-audio-mute-type="'+row(key).track+'"]');if(target){for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;target.scrollIntoView({block:'nearest'});target.focus();}}else{$('vstMixerBuses').open=true;const target=strips.get(row(key).track)?.querySelector('.uiChannelMute button');target?.scrollIntoView({block:'nearest'});target?.focus();}};
    strips.set(key,strip);return strip;
  }
  function syncStrips(){
    const keys=(timeline?.project_id===projectId()?timeline.rows:[]).map(r=>r.key);
    for(const [key,strip] of strips)if(!buses.includes(key)&&!keys.includes(key)){strip.remove();strips.delete(key);}
    const place=(parent,items)=>items.forEach((key,index)=>{const strip=ensureStrip(key);if(parent.children[index]!==strip)parent.insertBefore(strip,parent.children[index]||null);});
    place(mixer,[...keys,'master']);
    place(busesArea,buses.filter(b=>b!=='master'));
    if(!strips.has(selected)){selected=keys[0]||'master';selectedInsert=0;}
  }
  let status, inspector, detail, saveButton, undoButton, prepareButton, projectLabel;
  const projectId=()=>$('v06project')?.value||'';
  const current=()=>settings&&settings.project_id===projectId();
  function say(text){status.textContent=text;}
  function modified(){dirty=true;history.splice(32);render();say('未保存の変更があります。「作品へ保存」で試聴と出力へ反映します。');}
  function remember(){history.unshift(copy(settings));}
  function edit(fn){if(!current()||blocked())return;const before=copy(settings);fn();if(JSON.stringify(before)===JSON.stringify(settings))return;history.unshift(before);modified();}
  function controls(){saveButton.disabled=blocked()||!current()||!dirty;undoButton.disabled=blocked()||!current()||!history.length;prepareButton.disabled=blocked()||!current()||!caps?.available;prepareButton.textContent=dirty?'保存してタイムライン再生':'タイムライン再生';$('vstMixerEnabled').disabled=blocked()||!current();}
  function render(){
    const focus=document.activeElement?.dataset.focusKey,valid=current();if(valid)syncStrips();for(const strip of document.querySelectorAll('.uiChannelStrip'))strip.inert=!valid;detail.inert=!valid;$('uiAudioRack').setAttribute('aria-busy',String(busy));
    if(!valid){projectLabel.textContent='対象作品：読み込み中…';controls();return;}projectLabel.textContent='対象作品：'+($('v06project').selectedOptions[0]?.textContent||'');
    $('vstMixerEnabled').checked=settings.enabled;
    for(const [b,strip] of strips){
      const channel=config(b),lane=row(b);
      strip.dataset.channel=b;strip.querySelector('strong').textContent=title(b);strip.querySelector('.uiChannelName').title=title(b)+' ('+b+')';
      const name=strip.querySelector('.uiChannelName');name.dataset.focusKey='channel-'+b;name.setAttribute('aria-pressed',String(b===selected));
      const input=strip.querySelector('.uiChannelInput');input.textContent=b==='master'?'全バス → 出力':b==='music'?'全楽曲トラック':b==='audio'?'全音声トラック':'全動画の音声';input.textContent=lane?(lane.clips.map(c=>c.name).join(' / ')||'素材なし'):input.textContent;input.title=lane?input.textContent+'（クリックしてタイムラインへ）':'種類別バス。各行の処理後に適用します';input.disabled=!lane?.clips.length||busy;
      const range=strip.querySelector('input[type=range]');range.disabled=blocked();range.min='-60';range.max='6';range.step='.1';range.value=String(channel.gain_db);attribute(range,'aria-label',title(b)+'の音量（dB）');range.setAttribute('aria-valuetext',channel.gain_db+' dB');
      strip.querySelector('.uiGainReadout').textContent=channel.gain_db.toFixed(1)+' dB';attribute(strip.querySelector('.uiGainReadout'),'title','−60〜+6 dB。ミュートで完全に消音します');
      const buttons=strip.querySelectorAll('.uiChannelMute button');
      for(const [i,field] of ['mute','solo'].entries())if(buttons[i]){buttons[i].textContent=i?'S':'M';buttons[i].disabled=blocked()||(b==='master'&&i===1)||(!i&&!!lane?.bus_muted);buttons[i].hidden=b==='master'&&i===1;buttons[i].title=!i&&lane?.bus_muted?'種類全体のミュート中。タイムラインの「種類全体ミュート」で解除できます':'';buttons[i].setAttribute('aria-label',title(b)+(i?'をソロ':'をミュート'));buttons[i].setAttribute('aria-pressed',String(field==='mute'&&lane?(lane.muted||lane.bus_muted):channel[field]));}
      const notice=strip.querySelector('.vstTypeMuteNotice');notice.hidden=!lane||!(lane.bus_muted||(settings.enabled&&settings.channels[lane.track].mute));notice.textContent=lane?.bus_muted?'種類全体で消音中':notice.hidden?'':'種類バスで消音中';notice.title='消音の設定へ移動';const slots=strip.querySelector('.uiInsertSlots');slots.replaceChildren();
      for(const [i,insert] of channel.inserts.entries()){
        const li=node('li'),button=node('button',(insert.bypass?'[OFF] ':'')+(caps?.plugins.find(p=>p.id===insert.plugin_id)?.name||'未検出VST3'));button.type='button';button.disabled=busy;button.dataset.focusKey='insert-'+b+'-'+i;button.title=button.textContent;button.setAttribute('aria-pressed',String(b===selected&&i===selectedInsert));button.onclick=()=>selectInsert(b,i);button.ondblclick=()=>void openEditor(b,i);button.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();selectInsert(b,i);void openEditor(b,i);}};button.title+='（ダブルクリックまたはEnterで固有画面）';li.append(button);slots.append(li);
      }
      if(!channel.inserts.length)slots.append(node('li','エフェクトなし'));
      const add=strip.querySelector('.uiInsertChain>button');add.disabled=blocked()||!caps?.available||channel.inserts.length>=8;attribute(add,'title','検出したVST3エフェクトを追加');
    }
    renderInspector();controls();if(focus){const target=[...document.querySelectorAll('[data-focus-key]')].find(e=>e.dataset.focusKey===focus&&!e.disabled&&!e.hidden);(target||strips.get(selected)?.querySelector('.uiChannelName'))?.focus();}
  }
  function renderInspector(){
    inspector.querySelector('h3').textContent=title(selected)+'のエフェクト';detail.replaceChildren();
    const inserts=config(selected).inserts,insert=inserts[selectedInsert];
    if(!insert){detail.append(node('p','「＋ VSTを追加」でエフェクトを選びます。'));return;}
    detail.append(node('h4',caps?.plugins.find(p=>p.id===insert.plugin_id)?.name||'未検出VST3'));
    const open=node('button','VST画面を開く');open.type='button';open.id='vstNativeEditorOpen';open.dataset.focusKey='native-open';open.disabled=busy||pendingEditors.has(projectId())||!caps?.editor_available;open.onclick=()=>void openEditor(selected,selectedInsert);detail.append(open);
    const actions=node('div');actions.className='vstInsertActions';
    const bypass=node('button',insert.bypass?'有効にする':'バイパス');bypass.type='button';bypass.onclick=()=>edit(()=>{insert.bypass=!insert.bypass;});
    const up=node('button','上へ'),down=node('button','下へ'),remove=node('button','取り外す');
    up.disabled=selectedInsert===0;down.disabled=selectedInsert===inserts.length-1;
    for(const [button,delta] of [[up,-1],[down,1]]){button.type='button';button.onclick=()=>edit(()=>{const to=selectedInsert+delta;[inserts[selectedInsert],inserts[to]]=[inserts[to],inserts[selectedInsert]];selectedInsert=to;});}
    remove.type='button';remove.onclick=()=>edit(()=>{inserts.splice(selectedInsert,1);selectedInsert=Math.max(0,selectedInsert-1);});
    actions.append(bypass,up,down,remove);detail.append(actions);
    for(const [key,button] of [['bypass',bypass],['up',up],['down',down],['remove',remove]]){button.dataset.focusKey=key;if(blocked())button.disabled=true;}
    const params=Object.keys(insert.parameters),label=node('label','パラメーター');label.htmlFor='vstParameter';
    const select=node('select');select.id='vstParameter';select.name='vstParameter';for(const id of params)select.append(new Option(id,id));
    const value=node('input');value.type='number';value.min='0';value.max='1';value.step='.001';value.name='vstParameterValue';value.id='vstParameterValue';
    const valueLabel=node('label','値（0〜1）');valueLabel.htmlFor=value.id;
    const description=node('p','VSTが公開する汎用パラメーターです。値は正規化された0〜1です。');
    const show=()=>{value.value=String(insert.parameters[select.value]??0);};select.onchange=show;show();
    value.onchange=()=>{const v=Number(value.value);if(!Number.isFinite(v)||v<0||v>1){say('パラメーターは0〜1で指定してください。');show();return;}remember();insert.parameters[select.value]=v;dirty=true;controls();say('パラメーターを変更しました。作品へ保存してください。');};
    select.disabled=value.disabled=blocked();value.dataset.focusKey='parameter-value';select.dataset.focusKey='parameter-select';const change=value.onchange;value.onchange=e=>{if(!blocked())change(e);};
    if(params.length)detail.append(label,select,valueLabel,value,description);
    else detail.append(node('p','このVSTには公開パラメーターがありません。'));
  }
  async function load(){
    const pid=projectId();
    if(settings?.project_id===pid&&(dirty||busy))return;
    if(settings&&dirty)drafts.set(settings.project_id,copy(settings));
    const mine=++serial;
    if(!pid){settings=null;say('制作する作品を選択してください。');controls();return;}
    settings=null;dirty=false;busy=true;render();say('作品のミキサーを読み込み中…');
    try{
      const saved=await request('settings?project_id='+encodeURIComponent(pid));
      if(mine!==serial||projectId()!==pid)return;
      settings=drafts.get(pid)||saved;settings.tracks||={};selected='audio:1';dirty=drafts.has(pid);history.length=0;selectedInsert=0;
      say(dirty?'この作品の未保存の変更を復元しました。':'保存済み設定。処理を有効にして音量やVSTを調整します。');
    }catch(e){if(mine===serial){settings=null;say(e.message);}}
    finally{if(mine===serial){busy=false;await refreshRows();render();controls();renderEditors();await restoreEditors();}}
  }
  async function save(){
    if(!current()||blocked())return false;
    const mine=serial,pid=settings.project_id,body={project_id:pid,revision:settings.revision,channels:copy(settings.channels),tracks:copy(settings.tracks),enabled:settings.enabled};busy=true;render();say('作品へ保存中…');
    try{
      const result=await request('settings',body);drafts.delete(pid);
      if(mine===serial&&projectId()===pid){settings=result;dirty=false;say('作品へ保存しました。試聴・プレビュー・動画出力に適用します。');}
      window.dispatchEvent(new CustomEvent('bai:v05-mixer-saved',{detail:result}));return true;
    }catch(e){if(mine===serial)say('保存できません：'+e.message);return false;}
    finally{if(mine===serial){busy=false;render();}}
  }
  async function prepareAsset(assetId){
    const pid=projectId();if(!pid)return {enabled:false};
    if(dirty&&settings?.project_id===pid)throw Error('ミキサーに未保存の変更があります。「作品へ保存」を押してください');
    const result=await request('prepare',{project_id:pid,asset_id:assetId,channel:$('uiAudioTargetTrack')?.value||'audio',lane:Number($('uiAudioTargetLane')?.value||1),analysis_only:Boolean(caps?.available)});
    if(pid!==projectId()||assetId!==$('baiAudioSelect').value)throw Error('作品または音声が変わりました。再生し直してください');
    if(result.id)showMeters(result,'asset');return result;
  }
  function showMeters(result,kind='timeline'){
    window.dispatchEvent(new CustomEvent('bai:v05-audio-measured',{detail:{projectId:projectId(),result,kind}}));
    return result.meters?.master?.over_samples?'マスターが0 dBFSを超えています。音量を下げてください。':'';
  }
  function chooser(b){
    if(!current()||busy)return;
    selected=b;render();detail.replaceChildren();
    const label=node('label','検出したVST3');label.htmlFor='vstPluginSelect';
    const select=node('select');select.id='vstPluginSelect';select.name='vstPluginSelect';for(const p of caps.plugins)select.append(new Option(p.name,p.id));
    const add=node('button','読み込んで追加');add.type='button';add.disabled=!caps.plugins.length;
    const refresh=node('button','再検出');refresh.type='button';refresh.onclick=async()=>{try{caps=await request('capabilities');chooser(b);}catch(e){say(e.message);}};
    add.onclick=async()=>{const pid=projectId(),mine=serial,target=settings,pluginId=select.value;busy=true;render();say('VST3を別プロセスで確認中…');try{const p=await request('inspect',{plugin_id:pluginId});if(pid!==projectId()||mine!==serial||target!==settings)return;remember();settings.enabled=true;config(b).inserts.push({plugin_id:pluginId,bypass:false,parameters:Object.fromEntries(p.parameters.map(v=>[v.id,v.raw]))});selectedInsert=config(b).inserts.length-1;modified();say(p.name+'を追加しました。作品へ保存して試聴できます。');}catch(e){if(mine===serial)say('追加できません：'+e.message+'。別のVST3を選択してください。');}finally{if(mine===serial){busy=false;render();}}};
    detail.append(label,select,add,refresh,node('p','VST3音声エフェクトを読み込みます。固有画面はWindowsで開きます。VSTi・VST2は未対応です。'));select.focus();
  }
  function setup(){
    const rack=$('uiAudioRack');if(!rack)return;
    const heading=rack.querySelector('.uiRackHeading');heading.querySelector('p').textContent='タイムラインの各行 → VST3・音量 → 種類別バス → マスター。共通再生と動画出力へ反映します。';
    const toolbar=node('div');toolbar.className='vstMixerToolbar';
    projectLabel=node('span');projectLabel.id='vstMixerProject';
    const label=node('label','処理を有効にする'),enabled=node('input');enabled.type='checkbox';enabled.id='vstMixerEnabled';enabled.onchange=()=>edit(()=>{settings.enabled=enabled.checked;});label.prepend(enabled);
    saveButton=node('button','作品へ保存');saveButton.type='button';saveButton.id='vstMixerSave';saveButton.className='primary';saveButton.onclick=()=>void save();
    undoButton=node('button','変更を戻す');undoButton.type='button';undoButton.id='vstMixerUndo';undoButton.title='音量・VST・Sの変更を戻します。即保存の行Mは含みません';undoButton.onclick=()=>{if(history.length&&!blocked()){const previous=history.shift();settings={...settings,channels:previous.channels,tracks:previous.tracks,enabled:previous.enabled};modified();}};
      const reload=node('button','保存済みを読み直す');reload.type='button';reload.onclick=async()=>{if(blocked())return;if(dirty&&!confirm('未保存のミキサー変更を破棄して読み直しますか？'))return;const pid=projectId();try{for(const session of editorSessions.values())if(session.project_id===pid&&session.status==='draft_merged')Object.assign(session,await request('editor-close',{id:session.id,mode:'discard'}));if(pid!==projectId())return;drafts.delete(pid);dirty=false;settings=null;void load();}catch(e){say('未保存のVST変更を破棄できません：'+e.message);}};
    prepareButton=node('button','保存してタイムライン再生');prepareButton.type='button';prepareButton.id='vstMixerPrepare';
    prepareButton.onclick=async()=>{if(!current()||busy)return;const token=++transportToken,mine=serial,pid=projectId();if(dirty&&!(await save()))return;if(mine!==serial||pid!==projectId()||token!==transportToken)return;busy=true;render();say('共通再生の音声を準備中…');try{const result=await request('prepare',{project_id:pid,analysis_only:true});if(pid!==projectId()||mine!==serial)return;if(result.id){showMeters(result);audio.src=result.url;}await window.BAIStudioMediaPreviewV68.refresh();if(mine!==serial||pid!==projectId()||token!==transportToken)return;if(!rack.hidden&&$('bai-audio').classList.contains('active'))window.BAIStudioMediaPreviewV68.play();say('タイムラインと同じ時刻で再生します。'+(result.enabled?showMeters(result):'音声処理は無効です。'));}catch(e){if(mine===serial)say('再生できません：'+e.message);}finally{if(mine===serial){busy=false;render();}}};
    toolbar.append(projectLabel,label,saveButton,undoButton,reload);heading.after(toolbar);
    editorBar=node('section');editorBar.id='vstNativeEditors';editorBar.setAttribute('aria-label','開いているVST画面');toolbar.after(editorBar);
    const playback=node('div');playback.className='vstMixerPlayback';
    const pause=node('button','一時停止'),stop=node('button','停止');pause.type=stop.type='button';pause.id='vstTimelinePause';stop.id='vstTimelineStop';pause.onclick=()=>{++transportToken;window.BAIStudioMediaPreviewV68.pause();};stop.onclick=()=>{++transportToken;void window.BAIStudioMediaPreviewV68.stop();};
    const frameLabel=node('label','再生位置（F）'),frame=node('input');frame.id='vstTimelineFrame';frame.type='number';frame.min='0';frame.step='1';frameLabel.htmlFor=frame.id;frameLabel.append(frame);
    const seek=node('button','移動'),clock=node('output');seek.type='button';clock.id='vstTimelineClock';clock.setAttribute('aria-live','off');seek.onclick=()=>{++transportToken;const n=Number(frame.value);if(Number.isInteger(n)&&n>=0)void window.BAIStudioMediaPreviewV68.seek(n);};
    window.addEventListener('bai:v05-media-frame',e=>{if(e.detail.projectId!==projectId())return;const d=e.detail;if(document.activeElement!==frame)frame.value=String(d.frame);clock.textContent=d.seconds.toFixed(2)+' 秒 / '+d.fps+' fps'+(d.playing?'・再生中':'');});
    const audio=node('audio');audio.id='vstMixerAudition';audio.controls=true;audio.setAttribute('aria-label','処理後音声だけを確認（独立試聴）');
    const independent=node('details');independent.append(node('summary','処理後音声だけを確認'),audio);
    status=node('p');status.id='vstMixerStatus';status.setAttribute('role','status');playback.append(prepareButton,pause,stop,frameLabel,seek,clock,status);toolbar.after(playback);
    mixer=$('baiMixer');template=mixer.querySelector('.uiChannelStrip').cloneNode(true);mixer.replaceChildren();
    const advanced=node('details');advanced.id='vstMixerBuses';advanced.append(node('summary','種類別バス（全行の処理後）'));busesArea=node('div');busesArea.className='vstBusStrips';advanced.append(node('p','Mは即保存、音量・VST・Sは作品へ保存。メーターは保存済み音声の再生位置に追従します。'),busesArea,independent);rack.querySelector('.uiDawDesk').after(advanced);
    inspector=rack.querySelector('.uiEffectInspector');inspector.querySelector('.uiEffectEmpty').remove();inspector.querySelector('.uiHostState').remove();inspector.querySelector('button').remove();
    detail=node('div');detail.className='vstEffectDetail';inspector.append(detail);inspector.querySelector('p').textContent='上から順に処理します。パラメーターは汎用表示です。';
    window.addEventListener('beforeunload',e=>{if(dirty||drafts.size){e.preventDefault();e.returnValue='';}});
    $('v06project').addEventListener('change',()=>{++transportToken;audio.pause();void load();});
    audio.addEventListener('play',()=>window.dispatchEvent(new CustomEvent('bai:v05-audio-focus',{detail:{owner:'mixer'}})));
    window.addEventListener('bai:v05-audio-focus',e=>{if(e.detail.owner!=='mixer')audio.pause();});
    window.addEventListener('bai:v05-workspace-changed',()=>{++transportToken;audio.pause();});
    window.addEventListener('pagehide',()=>audio.pause());
    window.addEventListener('bai:v05-arrangement-loaded',()=>{void load();void refreshRows();});
    window.addEventListener('bai:v05-track-layout-changed',()=>void refreshRows());
    new MutationObserver(()=>{if($('uiAudioRack').hidden){++transportToken;audio.pause();}}).observe(rack,{attributes:true,attributeFilter:['hidden']});
    request('capabilities').then(data=>{caps=data;if(!caps.available)say(caps.reason);render();}).catch(e=>say(e.message));void load();
  }
  window.BAIStudioAudioMixer=Object.freeze({prepareAsset});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
