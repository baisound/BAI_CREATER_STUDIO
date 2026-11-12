/* AUDIO-001 / DATA-008: audition -> explicit current-project placement.
   Effect racks describe the preserved, unconnected mixer; no fake processing. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text) => {const e=document.createElement(tag);if(text)e.textContent=text;return e;};
  const request = async(url, options) => {const r=await fetch(url,options);const d=await r.json();if(!r.ok)throw Error(d.error || 'HTTP '+r.status);return d;};
  function setup() {
    const page=$('bai-audio'),layout=page.querySelector('.baiAudio'),cards=[...layout.children];
    const source=cards[0],wave=cards[1],placement=cards[2],select=$('baiAudioSelect');
    page.querySelector('.baiSub').textContent='音声を試聴して頭出しを調整し、選択中の作品へ配置します。';
    source.querySelector('h2').textContent='音声を選ぶ';
    source.querySelector('h2').after(document.querySelector('label[for=baiAudioSelect]'),select);
    const note=el('p','EQ・VSTの設定は「エフェクト・ミキサー」にまとめています。');note.className='baiTiny';source.append(note);
    const tabs=el('div');tabs.className='uiAudioTabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','音声編集の表示');
    const arrange=el('button','音声素材・配置'),effects=el('button','エフェクト・ミキサー');
    arrange.type=effects.type='button';arrange.id='uiAudioArrangeTab';effects.id='uiAudioEffectsTab';
    const rack=el('section');rack.id='uiAudioRack';rack.hidden=true;
    const legacy=el('details');legacy.id='uiLegacyAudio';legacy.append(el('summary','旧音楽・ダンスの保存・試作設定'));rack.append(legacy);page.append(rack);
    for(const id of ['baiLegacyAudioSources','baiLegacyTrackDetail','baiAudioSave','baiAudioReload'])if($(id))legacy.append($(id));
    $('baiAudioSave').textContent='旧音楽・ダンスへ保存';$('baiAudioReload').textContent='旧音楽・ダンスの保存を読み込む';
    if($('baiAudioRecord'))legacy.append($('baiAudioRecord'));
    if($('baiAudioSnap'))legacy.append($('baiAudioSnap').closest('label'));
    const sourceHint=source.querySelector('.baiTiny');if(sourceHint)sourceHint.textContent='音声を登録・選択し、頭出しと開始位置を調整します。';
    legacy.append(el('p','この互換保存は旧音楽・ダンス画面と共有します。作品への追加は「この作品に配置」を使います。'));
    // Keep all original mixer/EQ/VST fields, grouped by signal path rather than
    // presenting unconnected controls as an editable track configuration.
    const mixer=$('baiMixer'),mixerCard=mixer?.closest('.baiCard');
    const heading=el('div');heading.className='uiRackHeading';heading.append(el('h2','エフェクト・ミキサー'),el('p','VSTホスト・音量処理は未接続です。現在の試聴と動画出力には適用されません。'));rack.append(heading);
    if(mixer){
      for(const channel of mixer.children){
        channel.classList.add('uiChannelStrip');
        const chain=el('section');chain.className='uiInsertChain';chain.append(el('h3','インサート'),el('p','エフェクトなし'));
        const add=el('button','＋ VSTを追加');add.type='button';add.disabled=true;add.title='ネイティブVSTホスト未接続';chain.append(add);
        channel.querySelector('strong').after(el('small','入力 → インサート → 音量 → マスター'),chain);
        const level=channel.querySelector('input[type=range]');if(level){level.setAttribute('aria-label',channel.querySelector('strong').textContent+'の音量（未接続）');}
      }
      const desk=el('div');desk.className='uiDawDesk';
      const inspector=el('aside');inspector.className='uiEffectInspector';
      const inspectorTitle=el('h3','楽曲のエフェクト');
      inspector.append(inspectorTitle,el('p','選択チャンネルのインサートを上から順に表示します。'));
      const empty=el('div','エフェクトは追加されていません');empty.className='uiEffectEmpty';inspector.append(empty);
      const host=el('p','VSTホスト未接続');host.className='uiHostState';inspector.append(host);
      const configure=el('button','プラグインを管理');configure.type='button';configure.disabled=true;configure.title='VSTホスト未接続';inspector.append(configure);
      for(const [index,channel] of [...mixer.children].entries()){
        const title=channel.querySelector('strong'),name=title.textContent;
        const selectChannel=el('button');selectChannel.type='button';selectChannel.className='uiChannelName';selectChannel.setAttribute('aria-pressed',String(index===0));title.before(selectChannel);selectChannel.append(title);
        selectChannel.addEventListener('click',()=>{for(const b of mixer.querySelectorAll('.uiChannelName'))b.setAttribute('aria-pressed',String(b===selectChannel));inspectorTitle.textContent=name+'のエフェクト';});
        channel.querySelector(':scope>small').textContent=index===3?'ステレオ出力':'入力 → FX → マスター';
        const source=el('button',index===3?'マスター出力 ▾':'音声入力 ▾');source.type='button';source.disabled=true;source.className='uiChannelInput';selectChannel.after(source);
        const chain=channel.querySelector('.uiInsertChain'),message=chain.querySelector('p');message.remove();
        const slots=el('ol');slots.className='uiInsertSlots';for(let slot=0;slot<2;slot++)slots.append(el('li','—'));chain.querySelector('h3').after(slots);
        const range=channel.querySelector('input[type=range]'),controls=channel.querySelector('.baiLegacyChannel');
        const row=controls.querySelector('div');
        const fader=el('div');fader.className='uiFaderSection';
        const scale=el('div');scale.className='uiDbScale';scale.setAttribute('aria-hidden','true');for(const db of ['+6','0','−12','−24','−∞'])scale.append(el('span',db));
        const meters=el('div');meters.className='uiInactiveMeter';meters.setAttribute('aria-hidden','true');meters.append(el('i'),el('i'));
        fader.append(scale,range,meters);
        const readout=el('div','— dB');readout.className='uiGainReadout';readout.title='音量処理・メーター未接続';
        row.className='uiChannelMute';channel.append(fader,readout,row);controls.remove();
        if(index===3)channel.classList.add('uiMasterStrip');
      }
      desk.append(mixer,inspector);rack.append(desk);mixerCard.remove();
    }
    rack.append(legacy);
    function fitRack(){const desk=rack.querySelector('.uiDawDesk');if(!desk||rack.hidden)return;if(innerWidth<=730){desk.style.height='';return;}desk.style.height=Math.max(420,innerHeight-26-desk.getBoundingClientRect().top-12)+'px';}
    window.addEventListener('resize',fitRack);
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitRack).observe(page.querySelector('.baiToolbar'));
    page.querySelector('.baiToolbar').before(tabs);tabs.append(arrange,effects);
    page.append(rack);
    for(const [tab,target] of [[arrange,layout],[effects,rack]]){
      tab.setAttribute('role','tab');tab.setAttribute('aria-controls',target.id || (target.id='uiAudioArrangement'));
      tab.addEventListener('click',()=>{layout.hidden=target!==layout;rack.hidden=target!==rack;for(const b of [arrange,effects]){b.setAttribute('aria-selected',String(b===tab));b.tabIndex=b===tab?0:-1;}requestAnimationFrame(fitRack);});
      tab.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?arrange:e.key==='End'?effects:tab===arrange?effects:arrange;next.click();next.focus();}});
    }
    arrange.click();
    placement.querySelector('h2').textContent='この作品に配置';
    const target=el('p');target.id='uiAudioTargetProject';placement.querySelector('h2').after(target);
    const trackLabel=el('label','配置先');trackLabel.htmlFor='uiAudioTargetTrack';
    const track=el('select');track.id='uiAudioTargetTrack';track.append(new Option('音声トラック','audio'),new Option('楽曲トラック','music'));
    const laneLabel=el('label','行'),lane=el('select');lane.id='uiAudioTargetLane';laneLabel.htmlFor=lane.id;lane.append(new Option('1','1'));
    target.after(trackLabel,track,laneLabel,lane);
    let rows=[];
    const updateLanes=()=>{const previous=lane.value;lane.replaceChildren();for(const r of rows.filter(r=>r.track===track.value))lane.append(new Option(r.name,String(r.lane)));if(!lane.options.length)lane.append(new Option('1','1'));if([...lane.options].some(o=>o.value===previous))lane.value=previous;};
    track.addEventListener('change',updateLanes);window.addEventListener('bai:v05-audio-rows',e=>{if(e.detail.project_id!==$('v06project').value)return;rows=e.detail.rows;updateLanes();});
    document.querySelector('label[for=baiAudioStart]').textContent='作品上の開始（30fps基準・フレーム）';
    document.querySelector('label[for=baiAudioSource]').textContent='頭出し（30fps基準・フレーム）';
    const summary=el('p');summary.id='uiAudioPlacementSummary';summary.className='baiTiny';
    const status=el('p');status.id='uiAudioPlaceStatus';status.role='status';
    const place=el('button','この作品に配置');place.type='button';place.id='uiAudioPlace';place.className='primary';
    const go=el('button','配置した音声をタイムラインで見る');go.type='button';go.addEventListener('click',()=>window.baiGo('edit'));
    placement.append(summary,place,go,status);
    for(const p of [...placement.querySelectorAll('p')])if(p!==target&&p!==summary&&p!==status&&p.id!=='baiAudioStatus')p.remove();
    const update=()=>{const selected=$('v06project')?.selectedOptions[0];target.textContent='配置先の作品：'+(selected?.textContent || '作品を選択してください');summary.textContent='開始 '+(Number($('baiAudioStart').value)/30).toFixed(2)+' 秒 / 元音声 '+(Number($('baiAudioSource').value)/30).toFixed(2)+' 秒から末尾まで';place.disabled=!selected?.value||!select.value;};
    select.addEventListener('change',update);for(const id of ['baiAudioStart','baiAudioSource'])$(id).addEventListener('input',update);
    window.addEventListener('bai:v05-workspace-changed',update);window.addEventListener('bai:v05-arrangement-loaded',update);window.addEventListener('bai:v05-audio-availability',update);
    place.addEventListener('click',async()=>{
      const projectId=$('v06project').value,assetId=select.value;
      const startFrame=Number($('baiAudioStart').value),sourceFrame=Number($('baiAudioSource').value);
      if(!assetId||!projectId)return;
      if(![startFrame,sourceFrame].every(n=>Number.isInteger(n)&&n>=0&&n<=216000)){status.textContent='フレームは0〜216000の整数で指定してください。';return;}
      const start=startFrame/30,sourceStart=sourceFrame/30;
      place.disabled=true;status.textContent='作品への配置を保存中…';window.dispatchEvent(new CustomEvent('bai:v05-save-state',{detail:{projectId,state:'saving'}}));
      try{
        const [media,arrangement]=await Promise.all([request('/api/studio/v05/media-info?id='+encodeURIComponent(assetId)),request('/api/studio/v05/arrangement?id='+encodeURIComponent(projectId))]);
        const duration=Math.round((media.duration_seconds-sourceStart)*10000)/10000;
        if(!(duration>0))throw Error('頭出し位置は音声の末尾より前を指定してください。');
        if($('v06project').value!==projectId||select.value!==assetId)throw Error('作品または音声が変わりました。配置先を確認して再実行してください。');
        const result=await request('/api/studio/v05/arrangement/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,asset_id:assetId,track:track.value,lane:Number(lane.value),start,duration,source_start:sourceStart,revision:arrangement.revision})});
        status.textContent='この作品に配置しました。頭出しと開始位置は保存済みです。';
        window.dispatchEvent(new CustomEvent('bai:v05-save-state',{detail:{projectId,state:'saved'}}));
        if($('v06project').value===projectId){window.baiGo('edit');await window.BAIStudioV05Arrangement.refreshArrangement();window.dispatchEvent(new CustomEvent('bai:v05-clip-selected',{detail:{projectId,clip:result.clip}}));}
      }catch(e){status.textContent='配置できません：'+e.message;window.dispatchEvent(new CustomEvent('bai:v05-save-state',{detail:{projectId,state:'error'}}));}
      finally{update();}
    });update();
  }
  window.BAIStudioAudioClarity=Object.freeze({setup});
})();
