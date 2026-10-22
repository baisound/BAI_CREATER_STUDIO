/* v0.5 stage 06: registered local asset workflow, isolated arrangement. */
(()=>{'use strict';
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const host=document.getElementById('assetPanel');if(!host)return;
 const box=document.createElement('section');box.style.cssText='padding:10px;border-top:1px solid #536377;background:#172536';
 box.innerHTML='<h3>実素材 → タイムライン（枝番06）</h3><label>作品 <select id="v06project" style="width:100%"></select></label><label>種類 <select id="v06cat" style="width:100%"><option value="all">すべて</option><option value="model">3Dモデル</option><option value="motion">モーション</option><option value="camera">カメラ</option><option value="audio">音声</option><option value="video">動画</option><option value="image">画像</option><option value="other">その他</option></select></label><input id="v06query" placeholder="素材名を検索" style="width:100%"><div id="v06results" style="max-height:150px;overflow:auto"></div><label>配置先 <select id="v06track"><option value="motion">ダンス・動き</option><option value="model">3Dモデル</option><option value="camera">カメラ</option><option value="audio">音声</option><option value="video">映像</option><option value="image">画像</option><option value="effect">効果</option></select></label><label>開始（秒）<input id="v06start" type="number" min="0" step="0.1" value="0"></label><label>長さ（秒）<input id="v06duration" type="number" min="0.1" step="0.1" value="5"></label><button id="v06place" type="button">選択素材を配置・保存</button><p id="v06status" role="status" style="white-space:normal;color:#c7d8ed">既存エンジンとは未接続の配置データです。</p><div id="v06clips"></div><dialog id="v08dialog" style="background:#1d2d40;color:#fff;border:1px solid #7689a1;border-radius:8px;padding:18px"><form method="dialog" id="v08form"><h3>クリップ編集</h3><p id="v08name"></p><label>配置先<select id="v08track"><option value="motion">ダンス・動き</option><option value="model">3Dモデル</option><option value="camera">カメラ</option><option value="audio">音声</option><option value="video">映像</option><option value="image">画像</option><option value="effect">効果</option><option value="expression">表情</option><option value="lip">口</option><option value="music">楽曲</option><option value="light">照明</option></select></label><label>開始（秒）<input id="v08start" type="number" min="0" step="0.1" required></label><label>長さ（秒）<input id="v08duration" type="number" min="0.1" step="0.1" required></label><label id="v20targetwrap">適用する3Dモデル<select id="v20target"><option value="">対象を解除</option></select></label><button type="button" id="v20targetsave">対象モデルを保存</button><div style="display:flex;gap:6px;margin-top:8px"><button type="button" id="v08save">変更を保存</button><button type="button" id="v08delete">削除</button><button value="cancel">キャンセル</button></div></form></dialog><div id="v07timeline" aria-label="保存済み素材の時間軸" style="overflow:auto;max-width:100%;border-top:1px solid #536377;margin-top:8px"></div>';
 host.append(box);
 const $=id=>box.querySelector('#'+id);let assets=[],selected=null,revision=0;
 const linkCheck=document.createElement('button');
 linkCheck.type='button';linkCheck.id='v18linkCheck';linkCheck.textContent='実モーション接続を確認';
 linkCheck.title='素材とクリップの対応を検査します。読込処理が未登録の場合は再生しません。';
 box.insertBefore(linkCheck,$('v07timeline'));
 linkCheck.addEventListener('click',async()=>{
   try {
     const project_id=$('v06project').value;
     if(!project_id) throw Error('作品を選択してください');
     const [arr,inventory]=await Promise.all([
       request('/api/studio/v05/arrangement?id='+encodeURIComponent(project_id)),
       request('/api/studio/v05/assets?category=all&query=')
     ]);
     const runtime=window.BAIStudioAssetRuntime;
     if(!runtime) throw Error('再生接続モジュールを読めません');
     const result=await runtime.reconcile({project_id,clips:arr.clips,assets:inventory.items});
     await window.BAIStudioPersistedSeek?.configure(project_id,arr.clips);
     await window.BAIStudioPersistedSeek?.evaluate(playheadSeconds,'after-loader-ready');
     const reasons=result.issues.map(issue=>issue.reason).join(', ');
     status('モーション接続 '+result.connected+'件 / 待機 '+(result.pending||0)+'件'+(reasons?' / '+reasons:''));
   } catch(err) {status('接続検査失敗: '+err.message)}
 });

 async function request(url,opt){const res=await fetch(url,opt);const data=await res.json();if(!res.ok)throw Error(data.error||'HTTP '+res.status);return data}
 function status(s){$('v06status').textContent=s}
 async function projects(){try{const d=await request('/api/studio/v05/projects');$('v06project').innerHTML=d.projects.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');await arrangement()}catch(e){status('作品取得不可: '+e.message)}}
 async function arrangement(){if(!$('v06project').value)return;remoteSync?.select($('v06project').value);selectedClips.clear();try{const d=await request('/api/studio/v05/arrangement?id='+encodeURIComponent($('v06project').value));revision=d.revision;await window.BAIStudioPersistedSeek?.configure($('v06project').value,d.clips);$('v06clips').innerHTML='<h4>配置履歴（保存済み）</h4>'+d.clips.map(c=>`<p>${esc(c.name)}: ${c.start}s / ${c.duration}s → ${esc(c.track)}</p>`).join('');await loadLayout();await loadPlayhead();await window.BAIStudioPersistedSeek?.evaluate(playheadSeconds,'persisted-restore');await drawTimeline()}catch(e){status('配置読み込み失敗: '+e.message)}}
 let playheadSeconds=0,playheadRevision=0;
 const remoteSync=window.BAIStudioRemotePlayhead?.create({
   read:id=>request('/api/studio/v05/playhead?id='+encodeURIComponent(id)),
   apply:async(seconds,remoteRevision,id)=>{
     if($('v06project').value!==id)return;
     playheadSeconds=seconds;playheadRevision=remoteRevision;
     await window.BAIStudioPersistedSeek?.evaluate(seconds,'external-api-playhead');
     await drawTimeline();
   },
   onError:e=>status('外部の再生位置確認に失敗: '+e.message)
 });
 // No requests when document is hidden. Stop requests after page unload.
 let pollTimer=setInterval(()=>{if(!document.hidden)void remoteSync?.poll()},2000);
 window.addEventListener('pagehide',()=>{clearInterval(pollTimer);remoteSync?.select(null)},{once:true});
 async function loadPlayhead(){const id=$('v06project').value;if(!id)return;try{const p=await request('/api/studio/v05/playhead?id='+encodeURIComponent(id));playheadSeconds=p.seconds;playheadRevision=p.revision;remoteSync?.select(id,p.revision)}catch(e){status('再生位置取得失敗: '+e.message)}}
 async function setPlayhead(seconds){const id=$('v06project').value;remoteSync?.suspend(true);try{const p=await request('/api/studio/v05/playhead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,seconds,revision:playheadRevision})});playheadSeconds=p.seconds;playheadRevision=p.revision;remoteSync?.localWrite(p.revision);await window.BAIStudioPersistedSeek?.evaluate(playheadSeconds,'persisted-playhead');await drawTimeline()}catch(e){status('再生位置保存失敗: '+e.message);await loadPlayhead();await drawTimeline()}finally{remoteSync?.suspend(false)}}
 let currentClip=null;
 let timelineZoom=12,snapSeconds=0.5,dragBusy=false,trackLayout=null,layoutHistory=[],selectedClips=new Map(),lastClips=[];
 const allTracks=['audio','camera','effect','expression','image','light','lip','model','motion','music','video'];
 async function loadLayout(){const id=$('v06project').value;if(!id)return;trackLayout=await request('/api/studio/v05/timeline/layout?id='+encodeURIComponent(id));layoutHistory=[]}
 async function saveLayout(order,heights){if(!trackLayout)return;const previous=trackLayout;try{trackLayout=await request('/api/studio/v05/timeline/layout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:$('v06project').value,revision:trackLayout.revision,order,heights})});layoutHistory.push(previous);await drawTimeline()}catch(e){status('トラック設定保存失敗: '+e.message);await loadLayout();await drawTimeline()}}
 async function moveTrack(track,direction){if(!trackLayout)return;const order=[...trackLayout.order],i=order.indexOf(track),j=i+direction;if(j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];await saveLayout(order,{...trackLayout.heights})}
 async function resizeTrack(track,height){await saveLayout([...trackLayout.order],{...trackLayout.heights,[track]:Math.max(28,Math.min(160,Math.round(height)))})};
 const roundSnap=x=>Math.max(0,Math.round(x/snapSeconds)*snapSeconds);
 async function dragCommit(c,track,start,duration){
  if(dragBusy)return;dragBusy=true;
  try{await request('/api/studio/v05/arrangement/clip/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:$('v06project').value,clip_id:c.id,revision,action:'update',track,start,duration})});status('ドラッグ変更を保存しました: '+c.name);}
  catch(e){status('変更を保存できません: '+e.message)}
  finally{dragBusy=false;await arrangement()}
 }

 async function openClip(c){currentClip=c;$('v20targetwrap').hidden=c.category!=='motion';$('v20targetsave').hidden=c.category!=='motion';if(c.category==='motion'){try{const d=await request('/api/studio/v05/assets?category=model&query=');$('v20target').innerHTML='<option value="">対象を解除</option>'+d.items.filter(a=>a.available).map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');$('v20target').value=c.target_model_id||'';}catch(e){status('モデル一覧取得失敗: '+e.message)}}$('v08name').textContent=c.name;$('v08track').value=c.track;$('v08start').value=c.start;$('v08duration').value=c.duration;$('v08dialog').showModal()}
 async function editClip(action){if(!currentClip)return;const body={project_id:$('v06project').value,clip_id:currentClip.id,revision,action};if(action==='update')Object.assign(body,{track:$('v08track').value,start:Number($('v08start').value),duration:Number($('v08duration').value)});if(action==='delete'&&!confirm('このクリップを削除しますか？'))return;try{await request('/api/studio/v05/arrangement/clip/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});$('v08dialog').close();status(action==='delete'?'クリップを削除しました':'クリップを変更しました');await arrangement()}catch(e){status('編集できません: '+e.message);await arrangement()}}
 $('v20targetsave').addEventListener('click',async()=>{if(!currentClip||currentClip.category!=='motion')return;try{await request('/api/studio/v05/arrangement/clip/target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:$('v06project').value,clip_id:currentClip.id,revision,target_model_id:$('v20target').value||null})});$('v08dialog').close();status('対象モデルを保存しました');await arrangement()}catch(e){status('対象モデル保存失敗: '+e.message);await arrangement()}});
 $('v08save').addEventListener('click',()=>editClip('update'));$('v08delete').addEventListener('click',()=>editClip('delete'));
 async function drawTimeline(){
  const el=$('v07timeline'),id=$('v06project').value;if(!id){el.replaceChildren();return}
  try{
   const d=await request('/api/studio/v05/timeline/view?id='+encodeURIComponent(id));lastClips=d.tracks.flatMap(t=>t.clips);
   const scale=timelineZoom,duration=Math.max(30,Math.ceil(d.duration/10)*10),width=Math.ceil(duration*scale);
   el.replaceChildren();
   const header=document.createElement('div');header.style.cssText='background:#18283a;padding:6px';header.textContent='保存済みタイムライン — '+d.clip_count+'件（実再生は未接続）';el.append(header);
   const toolbar=document.createElement('div');toolbar.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
   const zoomLabel=document.createElement('label');zoomLabel.textContent='時間倍率 ';const slider=document.createElement('input');slider.type='range';slider.min='4';slider.max='40';slider.value=String(scale);slider.id='v07zoom';slider.addEventListener('input',()=>{timelineZoom=Number(slider.value);drawTimeline()});zoomLabel.append(slider);toolbar.append(zoomLabel);
   const snapLabel=document.createElement('label');snapLabel.textContent='吸着間隔 ';const snap=document.createElement('select');snap.id='v09snap';[[0.1,'0.1秒'],[0.5,'0.5秒'],[1,'1秒'],[5,'5秒']].forEach(([value,label])=>{const option=document.createElement('option');option.value=String(value);option.textContent=label;snap.append(option)});snap.value=String(snapSeconds);snap.addEventListener('change',()=>{snapSeconds=Number(snap.value)});snapLabel.append(snap);toolbar.append(snapLabel);el.append(toolbar);
   const help=document.createElement('p');help.textContent='Ctrl+クリック＝複数選択　選択済みをドラッグ＝一括移動　M＝ミュート／鍵＝ロック　Undo＝直前の一括移動';help.style.cssText='font-size:11px;color:#c7d8ed';el.append(help);
   const tracks=(trackLayout?.order||allTracks).map(track=>d.tracks.find(t=>t.track===track)||{track,clips:[]});
 const actions=document.createElement('div');actions.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin:4px 0';
   const batchUndo=document.createElement('button');batchUndo.textContent='直前の一括移動を戻す';batchUndo.addEventListener('click',async()=>{try{await request('/api/studio/v05/arrangement/undo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,revision})});status('一括移動を取り消しました');await arrangement()}catch(e){status('Undo失敗: '+e.message)}});actions.append(batchUndo);
   const selectionInfo=document.createElement('span');selectionInfo.textContent='選択: '+selectedClips.size+'件';actions.append(selectionInfo);el.append(actions);
   async function toggleFlag(track,flag){if(!trackLayout)return;const locked=new Set(trackLayout.locked||[]),muted=new Set(trackLayout.muted||[]);const target=flag==='locked'?locked:muted;target.has(track)?target.delete(track):target.add(track);try{trackLayout=await request('/api/studio/v05/timeline/flags',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,revision:trackLayout.revision,locked:[...locked],muted:[...muted]})});await drawTimeline()}catch(e){status('変更失敗: '+e.message);await loadLayout();await drawTimeline()}}
 const undo=document.createElement('button');undo.textContent='トラック配置を戻す';undo.disabled=!layoutHistory.length;undo.addEventListener('click',async()=>{const prev=layoutHistory.pop();if(prev)await saveLayout(prev.order,prev.heights)});toolbar.append(undo);
   const transport=document.createElement('div');transport.style.cssText='display:flex;gap:8px;align-items:center;margin:6px 0';
   const timeLabel=document.createElement('span');timeLabel.textContent='再生位置: '+playheadSeconds.toFixed(2)+'秒（エンジン非連動）';
   const timeInput=document.createElement('input');timeInput.type='number';timeInput.min='0';timeInput.max='86400';timeInput.step='0.1';timeInput.value=String(playheadSeconds);timeInput.setAttribute('aria-label','再生位置 秒');
   const seek=document.createElement('button');seek.textContent='指定秒へ移動';seek.addEventListener('click',()=>setPlayhead(Number(timeInput.value)));
   transport.append(timeLabel,timeInput,seek);el.append(transport);
   const ticks=document.createElement('div');ticks.style.cssText='position:relative;height:25px;margin-left:94px;width:'+width+'px;border-bottom:1px solid #71859b';
   for(let sec=0;sec<=duration;sec+=10){const mark=document.createElement('span');mark.textContent=sec+'秒';mark.style.cssText='position:absolute;left:'+sec*scale+'px;font-size:10px;color:#cad7e6';ticks.append(mark)}el.append(ticks);
   const cursor=document.createElement('div');cursor.style.cssText='position:absolute;pointer-events:none;left:'+playheadSeconds*scale+'px;top:0;bottom:0;border-left:2px solid #ffcc63;z-index:5';
   ticks.append(cursor);ticks.title='クリックで再生位置を保存';ticks.addEventListener('click',e=>{const r=ticks.getBoundingClientRect();setPlayhead(Math.max(0,Math.min(86400,Math.round((e.clientX-r.left)/scale*10)/10)))});
   tracks.forEach(row=>{const wrap=document.createElement('div');wrap.style.cssText='display:flex;min-height:35px;border-bottom:1px solid #35475d';const height=trackLayout?.heights?.[row.track]||35;wrap.style.minHeight=height+'px';const name=document.createElement('div');name.style.cssText='min-width:94px;max-width:94px;overflow:hidden;font-size:11px;display:flex;align-items:center';const label=document.createElement('span');label.textContent=row.track;label.style.flex='1';name.append(label);const up=document.createElement('button');up.textContent='↑';up.title='トラックを上へ';up.addEventListener('click',()=>moveTrack(row.track,-1));const down=document.createElement('button');down.textContent='↓';down.title='トラックを下へ';down.addEventListener('click',()=>moveTrack(row.track,1));const lock=document.createElement('button');lock.textContent=(trackLayout?.locked||[]).includes(row.track)?'🔒':'🔓';lock.title='トラックの編集をロック';lock.addEventListener('click',()=>toggleFlag(row.track,'locked'));name.append(lock);const mute=document.createElement('button');mute.textContent=(trackLayout?.muted||[]).includes(row.track)?'消':'音';mute.title='トラックをミュート';mute.addEventListener('click',()=>toggleFlag(row.track,'muted'));name.append(mute);const grip=document.createElement('button');grip.textContent='↕';grip.title='上下ドラッグで並べ替え';grip.draggable=true;grip.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',row.track)});name.addEventListener('dragover',e=>e.preventDefault());name.addEventListener('drop',e=>{e.preventDefault();const source=e.dataTransfer.getData('text/plain');if(source&&source!==row.track&&trackLayout){const order=[...trackLayout.order];order.splice(order.indexOf(source),1);order.splice(order.indexOf(row.track),0,source);saveLayout(order,{...trackLayout.heights})}});name.append(grip,up,down);wrap.append(name);const handle=document.createElement('button');handle.textContent='⋯';handle.title='ドラッグして行の高さを変更';handle.style.cssText='width:16px;cursor:ns-resize';let origin=null;handle.addEventListener('pointerdown',e=>{origin={y:e.clientY,h:height};handle.setPointerCapture(e.pointerId)});handle.addEventListener('pointerup',e=>{if(origin){const v=origin.h+e.clientY-origin.y;origin=null;resizeTrack(row.track,v)}});wrap.append(handle);const lane=document.createElement('div');lane.dataset.track=row.track;lane.style.cssText='position:relative;width:'+width+'px;min-width:'+width+'px;background:#26384b';
    row.clips.forEach(c=>{const clip=document.createElement('button');clip.type='button';clip.dataset.clipId=c.id;clip.textContent=c.name;clip.title=c.name+' / '+c.start+'秒〜'+(c.start+c.duration)+'秒';clip.style.cssText='position:absolute;top:3px;height:28px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;border:1px solid #b8d7ff;border-radius:4px;background:#355e81;color:#fff;touch-action:none;cursor:grab;left:'+c.start*scale+'px;width:'+Math.max(8,c.duration*scale-2)+'px';
     let drag=null;
     clip.addEventListener('pointerdown',e=>{if(e.button!==0||dragBusy||(trackLayout?.locked||[]).includes(c.track))return;if(e.ctrlKey||e.metaKey){selectedClips.has(c.id)?selectedClips.delete(c.id):selectedClips.set(c.id,c);clip.style.outline=selectedClips.has(c.id)?'3px solid #ffd167':'';e.preventDefault();return}if(!selectedClips.has(c.id)){selectedClips.clear();selectedClips.set(c.id,c)}const r=clip.getBoundingClientRect();const edge=7;const mode=e.clientX-r.left<edge?'trim-left':r.right-e.clientX<edge?'trim-right':'move';drag={mode,x:e.clientX,y:e.clientY,start:c.start,duration:c.duration,track:c.track,moved:false};clip.setPointerCapture(e.pointerId)});
     clip.addEventListener('pointermove',e=>{if(!drag)return;const delta=(e.clientX-drag.x)/scale;if(Math.abs(e.clientX-drag.x)>3||Math.abs(e.clientY-drag.y)>3)drag.moved=true;if(!drag.moved)return;
      if(drag.mode==='move'){drag.start=roundSnap(c.start+delta);const target=[...el.querySelectorAll('[data-track]')].find(n=>{const b=n.getBoundingClientRect();return e.clientY>=b.top&&e.clientY<=b.bottom});if(target&&tracks.some(t=>t.track===target.dataset.track))drag.track=target.dataset.track}
      if(drag.mode==='trim-left'){const end=c.start+c.duration;drag.start=Math.min(end-0.1,roundSnap(c.start+delta));drag.duration=Math.round((end-drag.start)*100)/100}
      if(drag.mode==='trim-right')drag.duration=Math.max(0.1,roundSnap(c.duration+delta));
      clip.style.left=drag.start*scale+'px';clip.style.width=Math.max(8,drag.duration*scale-2)+'px';clip.style.opacity='.72';clip.title='仮配置: '+drag.track+' / '+drag.start+'秒 / '+drag.duration+'秒';
     });
     clip.addEventListener('pointerup',e=>{if(!drag)return;const v=drag;drag=null;clip.style.opacity='1';if(v.moved){e.preventDefault();if(v.mode==='move'&&selectedClips.size>1){const diff=v.start-c.start;const edits=[...selectedClips.values()].map(item=>({clip_id:item.id,start:Math.max(0,roundSnap(item.start+diff)),duration:item.duration,track:item.id===c.id?v.track:item.track}));dragBusy=true;request('/api/studio/v05/arrangement/batch-move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:id,revision,edits})}).then(()=>status('複数クリップを移動しました')).catch(err=>status('一括移動失敗: '+err.message)).finally(()=>{dragBusy=false;arrangement()})}else dragCommit(c,v.track,v.start,v.duration)}else status('選択: '+c.name+' / '+c.start+'秒 / '+c.duration+'秒')});
     clip.addEventListener('pointercancel',()=>{drag=null;drawTimeline()});
     clip.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){drag=null;drawTimeline();e.preventDefault()}});
     clip.addEventListener('lostpointercapture',()=>{if(drag){drag=null;drawTimeline()}});
     clip.addEventListener('dblclick',()=>{if(!dragBusy)openClip(c)});if(selectedClips.has(c.id))clip.style.outline='3px solid #ffd167';lane.append(clip)});wrap.append(lane);el.append(wrap)});
  }catch(e){el.textContent='タイムライン取得失敗: '+e.message}
 }
 async function search(){try{const d=await request('/api/studio/v05/assets?category='+encodeURIComponent($('v06cat').value)+'&query='+encodeURIComponent($('v06query').value));assets=d.items;selected=null;$('v06results').innerHTML=assets.map((a,i)=>`<button type="button" data-i="${i}" style="display:block;width:100%;text-align:left">${esc(a.name)} (${esc(a.category)}) ${a.available?'':'— 使用不可'}</button>`).join('')||'<p>該当する実素材はありません</p>';status(d.count+'件の登録素材');}catch(e){status('素材取得不可: '+e.message)}}
 $('v06results').addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(!b)return;const a=assets[Number(b.dataset.i)];selected=a?.available?a:null;status(selected?'選択中: '+selected.name:'使用できない素材です');});
 $('v06cat').addEventListener('change',search);$('v06query').addEventListener('input',()=>search());$('v06project').addEventListener('change',arrangement);
 $('v06place').addEventListener('click',async()=>{if(!selected){status('使用可能な素材を選んでください');return}const body={project_id:$('v06project').value,asset_id:selected.id,track:$('v06track').value,start:Number($('v06start').value),duration:Number($('v06duration').value),revision};try{const r=await request('/api/studio/v05/arrangement/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});revision=r.revision;status('配置しました（保存済み／実エンジンには未反映）');await arrangement()}catch(e){status('配置失敗: '+e.message);await arrangement()}});
 projects();search();
})();
