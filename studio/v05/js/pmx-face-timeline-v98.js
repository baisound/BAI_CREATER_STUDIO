/* Show saved PMX face keys on the real, shared project timeline. */
(() => {
  'use strict';
  const project=document.getElementById('v06project');
  const timeline=document.getElementById('v07timeline');
  const message=document.getElementById('v06status');
  if(!project||!timeline)return;
  const say=text=>{if(message)message.textContent=text};
  const identity=key=>`${key.instance_id} / ${key.morph_name} / ${key.time.toFixed(3)}秒 / ${key.value.toFixed(2)}`;
  let snapshot=null;
  function snapTime(time,settings){
    const raw=Math.max(0,Math.min(86400,time));
    const snapped=settings.snapEnabled?Math.round(raw/settings.snapSeconds)*settings.snapSeconds:raw;
    return Math.round(snapped*1000)/1000;
  }
  async function moveKey(key,toTime){
    if(!snapshot||project.value!==snapshot.project_id)return;
    if(toTime===key.time)return;
    const id=snapshot.project_id;
    const response=await fetch('/api/studio/v05/scene/instances',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:id,action:'face-move',revision:snapshot.revision,
        face_key:{instance_id:key.instance_id,morph_name:key.morph_name,time:key.time,to_time:toTime}})
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
    snapshot=data;
    say(`表情キーを${toTime.toFixed(3)}秒へ移動・保存しました`);
    window.dispatchEvent(new CustomEvent('bai:v96-face-saved',{detail:{projectId:id,revision:data.revision}}));
    window.dispatchEvent(new CustomEvent('bai:v98-face-moved',{detail:{projectId:id,revision:data.revision}}));
  }
  function draw(detail){
    const scene=detail?.scene;
    if(!scene||detail.projectId!==project.value){snapshot=null;return;}
    snapshot=scene;
    const scale=detail.scale;
    for(const track of ['expression','lip']){
      const locked=(detail.lockedTracks||[]).includes(track);
      const lane=timeline.querySelector(`[data-track="${track}"]`);
      if(!lane)continue;
      const wrap=lane.parentElement;
      const keys=(scene.face_keys||[]).filter(key=>(key.track||'expression')===track);
      const sublanes=[...new Set(keys.map(key=>key.instance_id+'\u0000'+key.morph_name))];
      const height=Math.max(Number.parseInt(wrap?.style.minHeight||'35',10)||35,Math.max(1,sublanes.length)*23+8);
      wrap.style.minHeight=height+'px';lane.style.minHeight=height+'px';
      for(const key of keys){
        const button=document.createElement('button');
        button.type='button';button.className='v98-face-marker';
        button.dataset.faceMorph=key.morph_name;
        button.dataset.faceTime=String(key.time);
        button.dataset.faceTrack=track;
        if(locked)button.classList.add('v98-face-locked');
        button.textContent=`◆ ${key.morph_name} ${key.value.toFixed(2)}`;
        button.title=identity(key)+(locked?'（行ロック中：時刻移動不可）':'（クリックで編集、左右ドラッグで時刻移動）');
        button.setAttribute('aria-label',`${track==='lip'?'口':'表情'}キー ${identity(key)}`);
        button.style.left=Math.max(0,key.time*scale)+'px';
        button.style.top=(4+sublanes.indexOf(key.instance_id+'\u0000'+key.morph_name)*23)+'px';
        let drag=null;
        button.addEventListener('pointerdown',event=>{
          if(event.button!==0)return;
          if(locked){window.dispatchEvent(new CustomEvent('bai:v98-face-key-select',{
            detail:{projectId:scene.project_id,key}}));return;}
          drag={x:event.clientX,time:key.time,moved:false};
          button.setPointerCapture(event.pointerId);
        });
        button.addEventListener('pointermove',event=>{
          if(!drag)return;
          if(Math.abs(event.clientX-drag.x)>4)drag.moved=true;
          if(!drag.moved)return;
          const candidate=snapTime(key.time+(event.clientX-drag.x)/scale,detail);
          drag.time=candidate;
          button.style.left=(candidate*scale)+'px';
          button.title=`仮の時刻 ${candidate.toFixed(3)}秒`;
        });
        button.addEventListener('pointerup',event=>{
          if(!drag)return;
          const moved=drag.moved,toTime=drag.time;drag=null;
          if(moved){
            event.preventDefault();
            moveKey(key,toTime).catch(error=>{
              say('表情キー移動失敗: '+String(error.message||error));
              void window.BAIStudioV05Arrangement?.refreshTimeline?.();
            });
          }else window.dispatchEvent(new CustomEvent('bai:v98-face-key-select',{
            detail:{projectId:scene.project_id,key}
          }));
        });
        button.addEventListener('pointercancel',()=>{drag=null;button.style.left=(key.time*scale)+'px'});
        button.addEventListener('keydown',event=>{
          if(event.key==='Enter'||event.key===' '){event.preventDefault();window.dispatchEvent(
            new CustomEvent('bai:v98-face-key-select',{detail:{projectId:scene.project_id,key}}));}
          else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
            event.preventDefault();
            if(locked){say('この表情・口行はロック中です');return;}
            const delta=detail.snapEnabled?detail.snapSeconds:0.1;
            const time=snapTime(key.time+(event.key==='ArrowRight'?delta:-delta),detail);
            moveKey(key,time).catch(error=>{
              say('表情キー移動失敗: '+String(error.message||error));
              void window.BAIStudioV05Arrangement?.refreshTimeline?.();
            });
          }
        });
        lane.append(button);
      }
    }
  }
  window.addEventListener('bai:v98-timeline-drawn',event=>draw(event.detail));
  // The arrangement may complete before this script executes.
  if(project.value&&timeline.querySelector('[data-track="expression"]'))
    void window.BAIStudioV05Arrangement?.refreshTimeline?.();
})();
