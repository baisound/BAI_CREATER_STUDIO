/* Saved PMX FK keys on the shared project motion track. */
(() => {
  'use strict';
  const project=document.getElementById('v06project');
  const timeline=document.getElementById('v07timeline');
  const message=document.getElementById('v06status');
  if(!project||!timeline)return;
  let generation=0,writing=false;
  const say=value=>{if(message)message.textContent=value};
  async function json(url,options){
    const response=await fetch(url,options),data=await response.json();
    if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
    return data;
  }
  function select(projectId,layer,key){
    window.dispatchEvent(new CustomEvent('bai:v106-fk-key-select',{detail:{
      projectId,instanceId:layer.instance_id,clipId:layer.clip_id,layerId:layer.id,key}}));
  }
  async function move(projectId,revision,layer,key,toFrame){
    if(writing||toFrame===key.frame||project.value!==projectId)return;
    writing=true;
    try{
      await json('/api/studio/v05/motion-edits',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:projectId,revision,action:'move',
          instance_id:layer.instance_id,clip_id:layer.clip_id,layer_id:layer.id,key,to_frame:toFrame})});
      say(`FKキーをF${toFrame}へ移動・保存しました`);
      window.dispatchEvent(new CustomEvent('bai:v106-fk-saved',{detail:{projectId}}));
    }catch(error){say('FKキー移動失敗: '+String(error.message||error));
      void window.BAIStudioV05Arrangement?.refreshTimeline?.();}
    finally{writing=false;}
  }
  async function draw(detail){
    const token=++generation,id=detail?.projectId;
    if(!id||id!==project.value)return;
    const lane=timeline.querySelector('[data-track="motion"]');
    if(!lane)return;
    try{
      const [edits,fpsData]=await Promise.all([
        json('/api/studio/v05/motion-edits?id='+encodeURIComponent(id)),
        json('/api/studio/v05/project/fps?id='+encodeURIComponent(id))]);
      if(token!==generation||project.value!==id||!lane.isConnected)return;
      const fps=fpsData.configured?Number(fpsData.fps):60;
      const layers=edits.layers.filter(layer=>!layer.disabled);
      const groups=[...new Set(layers.flatMap(layer=>layer.keys.map(key=>layer.id+'\u0000'+key.bone)))];
      const height=Math.max(39,38+groups.length*24);
      lane.style.minHeight=height+'px';lane.parentElement.style.minHeight=height+'px';
      const locked=(detail.lockedTracks||[]).includes('motion');
      for(const layer of layers)for(const key of layer.keys){
        const button=document.createElement('button');
        button.type='button';button.className='v106-fk-marker';
        button.dataset.fkFrame=String(key.frame);button.dataset.fkBone=key.bone;
        button.dataset.fkLayer=layer.id;
        button.textContent=`◆ ${layer.name} / ${key.bone} F${key.frame}`;
        button.title=`FK補正 ${layer.name} / ${key.bone} / 作品F${key.frame}（クリックで3D編集、左右へドラッグまたは矢印キーで移動）`;
        button.setAttribute('aria-label',button.title);
        button.style.left=(key.frame/fps*detail.scale)+'px';
        button.style.top=(36+groups.indexOf(layer.id+'\u0000'+key.bone)*24)+'px';
        if(locked)button.classList.add('v106-fk-locked');
        const first=Math.ceil(layer.start*fps-1e-7);
        const end=Math.ceil((layer.start+layer.duration)*fps-1e-7);
        let drag=null,ignoreClickUntil=0;
        function destination(dx){
          const raw=key.frame+dx/detail.scale*fps;
          const snapped=detail.snapEnabled?
            Math.round(raw/fps/detail.snapSeconds)*detail.snapSeconds*fps:raw;
          return Math.max(first,Math.min(end-1,Math.round(snapped)));
        }
        button.addEventListener('pointerdown',event=>{
          if(event.button!==0||writing||locked)return;
          drag={x:event.clientX,frame:key.frame,moved:false};button.setPointerCapture(event.pointerId);
        });
        button.addEventListener('pointermove',event=>{
          if(!drag)return;
          const dx=event.clientX-drag.x;
          if(Math.abs(dx)>4)drag.moved=true;
          if(!drag.moved)return;
          drag.frame=destination(dx);
          button.style.left=(drag.frame/fps*detail.scale)+'px';
          button.title=`仮移動: 作品F${drag.frame}`;
        });
        button.addEventListener('pointerup',()=>{
          if(!drag)return;
          const {frame,moved}=drag;drag=null;
          if(moved&&frame!==key.frame){ignoreClickUntil=Date.now()+350;
            void move(id,edits.revision,layer,key,frame);}
          else {button.style.left=(key.frame/fps*detail.scale)+'px';
            button.title=`FK補正 ${layer.name} / ${key.bone} / 作品F${key.frame}`;}
        });
        button.addEventListener('pointercancel',()=>{drag=null;void window.BAIStudioV05Arrangement?.refreshTimeline?.();});
        button.addEventListener('click',()=>{
          if(Date.now()<ignoreClickUntil)return;
          select(id,layer,key);
        });
        button.addEventListener('keydown',event=>{
          if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
            event.preventDefault();
            if(locked){say('モーション行はロック中です');return;}
            const step=detail.snapEnabled?Math.max(1,Math.round(detail.snapSeconds*fps)):1;
            void move(id,edits.revision,layer,key,
              Math.max(first,Math.min(end-1,key.frame+(event.key==='ArrowRight'?step:-step))));
          }
        });
        lane.append(button);
      }
    }catch(error){
      if(token===generation&&project.value===id)say('FKキー表示失敗: '+String(error.message||error));
    }
  }
  window.addEventListener('bai:v98-timeline-drawn',event=>{void draw(event.detail)});
  window.addEventListener('bai:v106-fk-saved',event=>{
    if(event.detail?.projectId===project.value)void window.BAIStudioV05Arrangement?.refreshTimeline?.();
  });
  project.addEventListener('change',()=>{generation++;});
  if(project.value&&timeline.querySelector('[data-track="motion"]'))
    void window.BAIStudioV05Arrangement?.refreshTimeline?.();
})();
