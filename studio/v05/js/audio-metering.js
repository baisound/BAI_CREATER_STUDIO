/* Meter the prepared post-fader signal at the same project/asset clock. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),analyses=new Map();
  let owner='timeline',windowData=null,windowId='',windowStart=-1,loading=false,preparing=false,project='',generation=0;
  let note,masterLine,lastUpdate=0;
  const pid=()=>$('v06project')?.value||'';
  const field=(v,suffix='')=>Number.isFinite(v)?v.toFixed(1)+suffix:'—';
  const db=v=>v>0?20*Math.log10(v):-Infinity;
  const setText=(element,value)=>{if(element.textContent!==value)element.textContent=value;};
  const percent=v=>Math.min(100,Math.max(0,(db(v)+60)/66*100));
  async function request(path,body){const r=await fetch('/api/studio/v05/audio/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'音量計測を読めません');return d;}
  function reset(){++generation;project=pid();analyses.clear();windowData=null;windowId='';windowStart=-1;loading=preparing=false;}
  async function ensureAnalysis(){
    if(preparing||!pid())return;
    const id=pid(),mine=generation;preparing=true;note.textContent='音量・LUFSを計測中…';
    try{const result=await request('prepare',{project_id:id,analysis_only:true});if(mine!==generation||id!==pid())return;analyses.set('timeline',result);note.textContent='処理後の100msピークとラウドネス。M 400ms / S 3秒 / I 先頭から再生位置まで。';}
    catch(e){if(mine===generation)note.textContent='計測できません：'+e.message;}
    finally{if(mine===generation)preparing=false;}
  }
  async function loadWindow(analysis,seconds){
    if(loading)return;const id=pid(),mine=generation,start=Math.max(0,Math.floor(seconds/5)*5);loading=true;
    try{const result=await request('meter-window?id='+analysis.id+'&start='+start+'&seconds=8');if(mine!==generation||id!==pid())return;windowData=result;windowId=analysis.id;windowStart=start;}
    catch(e){if(mine===generation)note.textContent='計測データを読めません：'+e.message;}
    finally{if(mine===generation)loading=false;}
  }
  function clock(){
    if(owner==='asset'){
      const frame=Number($('baiAudioFrame')?.value),start=Number($('baiAudioStart')?.value),end=Number($('baiAudioHead')?.max),active=frame>=start&&frame<end;
      return {seconds:Math.max(0,(frame-start+Number($('baiAudioSource')?.value))/30),playing:active&&!$('baiAudioPause')?.disabled,active,kind:'asset'};
    }
    if(owner==='mixer'){const audio=$('vstMixerAudition');return {seconds:audio?.currentTime||0,playing:audio&&!audio.paused&&!audio.ended,kind:'timeline'};}
    const state=window.BAIStudioMediaPreviewV68?.status?.();return {seconds:state?state.frame/state.fps:0,playing:Boolean(state?.playing),kind:'timeline'};
  }
  function renderMeters(analysis,time){
    const point=Math.floor(time.seconds*10),local=point-(windowData?.start_index||0),previous=local-1;
    for(const strip of document.querySelectorAll('.uiChannelStrip[data-channel]')){
      const key=strip.dataset.channel,series=windowId===analysis?.id?windowData?.rows[key]:null;
      const peak=time.active===false?null:series?.[local],lufs=time.active===false?null:series?.[previous];
      const left=time.playing?(peak?.[0]||0):0,right=time.playing?(peak?.[1]||0):0;
      const meter=strip.querySelector('.uiInactiveMeter');meter.classList.add('vstMeasuredMeter');meter.dataset.over=String(Math.max(left,right)>1);meter.dataset.meterTime=time.seconds.toFixed(3);
      meter.style.setProperty('--vst-left',percent(left)+'%');meter.style.setProperty('--vst-right',percent(right)+'%');meter.style.setProperty('--vst-peak',percent(Math.max(left,right))+'%');meter.setAttribute('role','img');meter.removeAttribute('aria-hidden');
      const text='L '+field(db(left),' dBFS')+' / R '+field(db(right),' dBFS');meter.title=text;meter.setAttribute('aria-label',key+' '+text);
      let readout=strip.querySelector('.vstLoudness');if(!readout){readout=document.createElement('output');readout.className='vstLoudness';readout.setAttribute('aria-live','off');strip.querySelector('.uiGainReadout').after(readout);}
      setText(readout,'M '+field(lufs?.[2])+' LUFS');readout.title='M: 直前400ms / S: '+field(lufs?.[3])+' / I: '+field(lufs?.[4])+' LUFS（先頭から現在位置）';readout.dataset.momentary=String(lufs?.[2]??'');readout.dataset.integrated=String(lufs?.[4]??'');readout.setAttribute('aria-label',key+'のラウドネス '+readout.textContent);
      if(key==='master')setText(masterLine,'マスター　M '+field(lufs?.[2])+' / S '+field(lufs?.[3])+' / I '+field(lufs?.[4])+' LUFS　TP '+field(lufs?.[5])+' dBTP');
    }
  }
  function tick(now){
    requestAnimationFrame(tick);if(now-lastUpdate<50||!$('uiAudioRack')||$('uiAudioRack').hidden)return;lastUpdate=now;
    if(project!==pid())reset();const time=clock(),analysis=analyses.get(time.kind);
    if(!analysis){if(time.playing&&time.kind==='timeline')void ensureAnalysis();renderMeters(null,time);return;}
    if(windowId!==analysis.id||time.seconds<windowStart||time.seconds>=windowStart+6)void loadWindow(analysis,time.seconds);
    renderMeters(analysis,time);
  }
  function setup(){
    const rack=$('uiAudioRack');if(!rack)return;project=pid();note=document.createElement('small');note.id='vstMeterNote';note.textContent='再生すると音量・LUFSを表示します。';
    masterLine=document.createElement('output');masterLine.id='vstMasterLoudness';masterLine.setAttribute('aria-live','off');masterLine.textContent='マスター　M — / S — / I — LUFS　TP — dBTP';
    rack.querySelector('.vstMixerPlayback').append(masterLine,note);
    const accept=(e,kind)=>{if(e.detail?.projectId!==pid()||!e.detail.result?.id)return;analyses.set(kind,e.detail.result);windowId='';note.textContent='100msピーク / M 400ms / S 3秒 / I 先頭から現在位置（素材試聴は元音声基準）';};
    window.addEventListener('bai:v05-audio-prepared',e=>accept(e,'timeline'));
    window.addEventListener('bai:v05-audio-measured',e=>accept(e,e.detail.kind||'timeline'));
    window.addEventListener('bai:v05-audio-focus',e=>{owner=e.detail.owner;});
    window.addEventListener('bai:v05-mixer-saved',reset);
    window.addEventListener('bai:v05-track-layout-changed',e=>{if(e.detail?.project_id===pid()&&analyses.get('timeline')?.layout_revision!==e.detail.revision)reset();});
    window.addEventListener('bai:v05-arrangement-loaded',reset);
    $('v06project').addEventListener('change',reset);requestAnimationFrame(tick);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
