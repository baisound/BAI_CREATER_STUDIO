/* Saved project buses -> isolated offline VST3 processing -> shared PCM. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), buses=['music','audio','video','master'];
  const names={music:'楽曲',audio:'音声',video:'映像音',master:'マスター'};
  const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
  const copy=x=>JSON.parse(JSON.stringify(x));
  async function request(path,body){const r=await fetch('/api/studio/v05/audio/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'音声処理に失敗しました');return data;}
  let settings=null, selected='music', selectedInsert=0, caps=null, dirty=false, busy=false, serial=0;
  const drafts=new Map(), history=[];
  let status, inspector, detail, saveButton, undoButton, prepareButton, projectLabel;
  const projectId=()=>$('v06project')?.value||'';
  const current=()=>settings&&settings.project_id===projectId();
  function say(text){status.textContent=text;}
  function modified(){dirty=true;history.splice(32);render();say('未保存の変更があります。「作品へ保存」で試聴と出力へ反映します。');}
  function remember(){history.unshift(copy(settings));}
  function edit(fn){if(!current()||busy)return;const before=copy(settings);fn();if(JSON.stringify(before)===JSON.stringify(settings))return;history.unshift(before);modified();}
  function controls(){saveButton.disabled=busy||!current()||!dirty;undoButton.disabled=busy||!current()||!history.length;prepareButton.disabled=busy||!current()||!caps?.available;prepareButton.textContent=dirty?'保存して処理・試聴':'作品の音を処理して試聴';$('vstMixerEnabled').disabled=busy||!current();}
  function render(){
    const valid=current();for(const strip of document.querySelectorAll('.uiChannelStrip'))strip.inert=!valid;detail.inert=!valid;$('uiAudioRack').setAttribute('aria-busy',String(busy));
    if(!valid){projectLabel.textContent='対象作品：読み込み中…';controls();return;}const focus=document.activeElement?.dataset.focusKey;projectLabel.textContent='対象作品：'+($('v06project').selectedOptions[0]?.textContent||'');
    $('vstMixerEnabled').checked=settings.enabled;
    for(const [index,b] of buses.entries()){
      const strip=document.querySelectorAll('.uiChannelStrip')[index],config=settings.channels[b];
      strip.dataset.channel=b;strip.querySelector('strong').textContent=names[b];
      const name=strip.querySelector('.uiChannelName');name.dataset.focusKey='channel-'+b;name.setAttribute('aria-pressed',String(b===selected));
      const input=strip.querySelector('.uiChannelInput');input.textContent=b==='master'?'全バス → 出力':b==='music'?'全楽曲トラック':b==='audio'?'全音声トラック':'全動画の音声';input.title='保存済み作品のトラック種類ごとにまとめます';
      const range=strip.querySelector('input[type=range]');range.disabled=busy;range.min='-60';range.max='6';range.step='.1';range.value=String(config.gain_db);range.setAttribute('aria-label',names[b]+'の音量（dB）');range.setAttribute('aria-valuetext',config.gain_db+' dB');
      strip.querySelector('.uiGainReadout').textContent=config.gain_db.toFixed(1)+' dB';strip.querySelector('.uiGainReadout').title='−60〜+6 dB。ミュートで完全に消音します';
      const buttons=strip.querySelectorAll('.uiChannelMute button');
      for(const [i,field] of ['mute','solo'].entries())if(buttons[i]){buttons[i].textContent=i?'S':'M';buttons[i].disabled=busy||(b==='master'&&i===1);buttons[i].hidden=b==='master'&&i===1;buttons[i].setAttribute('aria-label',names[b]+(i?'をソロ':'をミュート'));buttons[i].setAttribute('aria-pressed',String(config[field]));}
      const slots=strip.querySelector('.uiInsertSlots');slots.replaceChildren();
      for(const [i,insert] of config.inserts.entries()){
        const li=node('li'),button=node('button',(insert.bypass?'[OFF] ':'')+(caps?.plugins.find(p=>p.id===insert.plugin_id)?.name||'未検出VST3'));button.type='button';button.disabled=busy;button.dataset.focusKey='insert-'+b+'-'+i;button.title=button.textContent;button.setAttribute('aria-pressed',String(b===selected&&i===selectedInsert));button.onclick=()=>{selected=b;selectedInsert=i;render();};li.append(button);slots.append(li);
      }
      if(!config.inserts.length)slots.append(node('li','エフェクトなし'));
      const add=strip.querySelector('.uiInsertChain>button');add.disabled=busy||!caps?.available||config.inserts.length>=8;add.title='検出したVST3エフェクトを追加';
    }
    renderInspector();controls();if(focus){const target=[...document.querySelectorAll('[data-focus-key]')].find(e=>e.dataset.focusKey===focus&&!e.disabled&&!e.hidden);(target||document.querySelector('.uiChannelStrip[data-channel='+selected+'] .uiChannelName'))?.focus();}
  }
  function renderInspector(){
    inspector.querySelector('h3').textContent=names[selected]+'のエフェクト';detail.replaceChildren();
    const inserts=settings.channels[selected].inserts,insert=inserts[selectedInsert];
    if(!insert){detail.append(node('p','「＋ VSTを追加」でエフェクトを選びます。'));return;}
    const actions=node('div');actions.className='vstInsertActions';
    const bypass=node('button',insert.bypass?'有効にする':'バイパス');bypass.type='button';bypass.onclick=()=>edit(()=>{insert.bypass=!insert.bypass;});
    const up=node('button','上へ'),down=node('button','下へ'),remove=node('button','取り外す');
    up.disabled=selectedInsert===0;down.disabled=selectedInsert===inserts.length-1;
    for(const [button,delta] of [[up,-1],[down,1]]){button.type='button';button.onclick=()=>edit(()=>{const to=selectedInsert+delta;[inserts[selectedInsert],inserts[to]]=[inserts[to],inserts[selectedInsert]];selectedInsert=to;});}
    remove.type='button';remove.onclick=()=>edit(()=>{inserts.splice(selectedInsert,1);selectedInsert=Math.max(0,selectedInsert-1);});
    actions.append(bypass,up,down,remove);detail.append(actions);
    for(const [key,button] of [['bypass',bypass],['up',up],['down',down],['remove',remove]]){button.dataset.focusKey=key;if(busy)button.disabled=true;}
    const params=Object.keys(insert.parameters),label=node('label','パラメーター');label.htmlFor='vstParameter';
    const select=node('select');select.id='vstParameter';select.name='vstParameter';for(const id of params)select.append(new Option(id,id));
    const value=node('input');value.type='number';value.min='0';value.max='1';value.step='.001';value.name='vstParameterValue';value.id='vstParameterValue';
    const valueLabel=node('label','値（0〜1）');valueLabel.htmlFor=value.id;
    const description=node('p','VSTが公開する汎用パラメーターです。値は正規化された0〜1です。');
    const show=()=>{value.value=String(insert.parameters[select.value]??0);};select.onchange=show;show();
    value.onchange=()=>{const v=Number(value.value);if(!Number.isFinite(v)||v<0||v>1){say('パラメーターは0〜1で指定してください。');show();return;}remember();insert.parameters[select.value]=v;dirty=true;controls();say('パラメーターを変更しました。作品へ保存してください。');};
    select.disabled=value.disabled=busy;value.dataset.focusKey='parameter-value';select.dataset.focusKey='parameter-select';const change=value.onchange;value.onchange=e=>{if(!busy)change(e);};
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
      settings=drafts.get(pid)||saved;dirty=drafts.has(pid);history.length=0;selectedInsert=0;
      say(dirty?'この作品の未保存の変更を復元しました。':'保存済み設定。処理を有効にして音量やVSTを調整します。');
    }catch(e){if(mine===serial){settings=null;say(e.message);}}
    finally{if(mine===serial){busy=false;render();controls();}}
  }
  async function save(){
    if(!current()||busy)return false;
    const mine=serial,pid=settings.project_id,body={project_id:pid,revision:settings.revision,channels:copy(settings.channels),enabled:settings.enabled};busy=true;render();say('作品へ保存中…');
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
    const result=await request('prepare',{project_id:pid,asset_id:assetId,channel:$('uiAudioTargetTrack')?.value||'audio'});
    if(pid!==projectId()||assetId!==$('baiAudioSelect').value)throw Error('作品または音声が変わりました。再生し直してください');
    if(result.enabled)showMeters(result);return result;
  }
  function showMeters(result){
    for(const [i,b] of buses.entries()){
      const meter=document.querySelectorAll('.uiChannelStrip')[i].querySelector('.uiInactiveMeter'),data=result.meters[b];
      meter.style.setProperty('--vst-peak',Math.min(100,Math.max(0,((data.peak_db??-60)+60)/66*100))+'%');meter.classList.add('vstMeasuredMeter');meter.dataset.over=String(data.peak>1);meter.title='処理区間のピーク：'+(data.peak_db===null?'−∞':data.peak_db)+' dBFS（ライブメーターではありません）';meter.setAttribute('role','img');meter.removeAttribute('aria-hidden');meter.setAttribute('aria-label',names[b]+' '+meter.title);
    }
    const over=result.meters.master.over_samples;return over?'マスターが0 dBFSを超えています。音量を下げてください。':'';
  }
  function chooser(b){
    if(!current()||busy)return;
    selected=b;render();detail.replaceChildren();
    const label=node('label','検出したVST3');label.htmlFor='vstPluginSelect';
    const select=node('select');select.id='vstPluginSelect';select.name='vstPluginSelect';for(const p of caps.plugins)select.append(new Option(p.name,p.id));
    const add=node('button','読み込んで追加');add.type='button';add.disabled=!caps.plugins.length;
    const refresh=node('button','再検出');refresh.type='button';refresh.onclick=async()=>{try{caps=await request('capabilities');chooser(b);}catch(e){say(e.message);}};
    add.onclick=async()=>{const pid=projectId(),mine=serial,target=settings,pluginId=select.value;busy=true;render();say('VST3を別プロセスで確認中…');try{const p=await request('inspect',{plugin_id:pluginId});if(pid!==projectId()||mine!==serial||target!==settings)return;remember();settings.enabled=true;settings.channels[b].inserts.push({plugin_id:pluginId,bypass:false,parameters:Object.fromEntries(p.parameters.map(v=>[v.id,v.raw]))});selectedInsert=settings.channels[b].inserts.length-1;modified();say(p.name+'を追加しました。作品へ保存して試聴できます。');}catch(e){if(mine===serial)say('追加できません：'+e.message+'。別のVST3を選択してください。');}finally{if(mine===serial){busy=false;render();}}};
    detail.append(label,select,add,refresh,node('p','VST3音声エフェクトを読み込みます。VSTi・VST2・固有画面には未対応です。'));select.focus();
  }
  function setup(){
    const rack=$('uiAudioRack');if(!rack)return;
    const heading=rack.querySelector('.uiRackHeading');heading.querySelector('p').textContent='入力 → VST3 → 音量 → マスター。保存した設定を処理後の試聴と動画出力に使います。';
    const toolbar=node('div');toolbar.className='vstMixerToolbar';
    projectLabel=node('span');projectLabel.id='vstMixerProject';
    const label=node('label','処理を有効にする'),enabled=node('input');enabled.type='checkbox';enabled.id='vstMixerEnabled';enabled.onchange=()=>edit(()=>{settings.enabled=enabled.checked;});label.prepend(enabled);
    saveButton=node('button','作品へ保存');saveButton.type='button';saveButton.id='vstMixerSave';saveButton.className='primary';saveButton.onclick=()=>void save();
    undoButton=node('button','変更を戻す');undoButton.type='button';undoButton.id='vstMixerUndo';undoButton.onclick=()=>{if(history.length&&!busy){const previous=history.shift();settings={...settings,channels:previous.channels,enabled:previous.enabled};modified();}};
    const reload=node('button','保存済みを読み直す');reload.type='button';reload.onclick=()=>{if(busy)return;if(dirty&&!confirm('未保存のミキサー変更を破棄して読み直しますか？'))return;drafts.delete(projectId());dirty=false;settings=null;void load();};
    prepareButton=node('button','作品の音を処理して試聴');prepareButton.type='button';prepareButton.id='vstMixerPrepare';prepareButton.onclick=async()=>{if(!current()||busy)return;const mine=serial,pid=projectId();if(dirty&&!(await save()))return;if(mine!==serial||pid!==projectId())return;if(!settings?.enabled){say('「処理を有効にする」を選択して作品へ保存してください。');return;}busy=true;render();say('作品の音声を処理中…');try{const result=await request('prepare',{project_id:pid});if(pid!==projectId()||mine!==serial)return;const warning=showMeters(result);const audio=$('vstMixerAudition');audio.src=result.url;if(!rack.hidden&&$('bai-audio').classList.contains('active'))await audio.play();say('処理後音声を準備しました。'+warning);}catch(e){if(mine===serial)say('処理できません：'+e.message);}finally{if(mine===serial){busy=false;render();}}};
    toolbar.append(projectLabel,label,saveButton,undoButton,reload,prepareButton);heading.after(toolbar);
    const playback=node('div');playback.className='vstMixerPlayback';const audio=node('audio');audio.id='vstMixerAudition';audio.controls=true;audio.setAttribute('aria-label','作品の処理後音声');
    status=node('p');status.id='vstMixerStatus';status.setAttribute('role','status');playback.append(status,audio,node('small','メーターは直前に処理した区間のピークです。残響を残す場合は作品末尾へ余白を追加します。'));toolbar.after(playback);
    inspector=rack.querySelector('.uiEffectInspector');inspector.querySelector('.uiEffectEmpty').remove();inspector.querySelector('.uiHostState').remove();inspector.querySelector('button').remove();
    detail=node('div');detail.className='vstEffectDetail';inspector.append(detail);inspector.querySelector('p').textContent='上から順に処理します。パラメーターは汎用表示です。';
    for(const [i,strip] of [...document.querySelectorAll('.uiChannelStrip')].entries()){
      const b=buses[i];strip.querySelector('.uiChannelName').addEventListener('click',()=>{selected=b;selectedInsert=0;render();});
      strip.querySelector('.uiInsertChain>button').onclick=()=>chooser(b);
      const range=strip.querySelector('input[type=range]');range.oninput=()=>{strip.querySelector('.uiGainReadout').textContent=Number(range.value).toFixed(1)+' dB';};range.onchange=()=>edit(()=>{settings.enabled=true;settings.channels[b].gain_db=Number(range.value);});
      for(const [j,button] of [...strip.querySelectorAll('.uiChannelMute button')].entries())button.onclick=()=>edit(()=>{settings.enabled=true;settings.channels[b][j?'solo':'mute']=!settings.channels[b][j?'solo':'mute'];});
    }
    window.addEventListener('beforeunload',e=>{if(dirty||drafts.size){e.preventDefault();e.returnValue='';}});
    $('v06project').addEventListener('change',()=>{audio.pause();void load();});
    audio.addEventListener('play',()=>window.dispatchEvent(new CustomEvent('bai:v05-audio-focus',{detail:{owner:'mixer'}})));
    window.addEventListener('bai:v05-audio-focus',e=>{if(e.detail.owner!=='mixer')audio.pause();});
    window.addEventListener('bai:v05-workspace-changed',()=>audio.pause());
    window.addEventListener('pagehide',()=>audio.pause());
    window.addEventListener('bai:v05-arrangement-loaded',()=>void load());
    new MutationObserver(()=>{if($('uiAudioRack').hidden)audio.pause();}).observe(rack,{attributes:true,attributeFilter:['hidden']});
    request('capabilities').then(data=>{caps=data;if(!caps.available)say(caps.reason);render();}).catch(e=>say(e.message));void load();
  }
  window.BAIStudioAudioMixer=Object.freeze({prepareAsset});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
