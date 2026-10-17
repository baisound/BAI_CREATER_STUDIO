// Optional UI enhancement for the v0.16.33-35 review slider.
// Intentionally does not animate a production VRM timeline: it advances the
// existing per-frame non-destructive experimental scrubber.
(() => {
  const init = () => {
    const host = document.getElementById('skeleton-lab');
    if (!host) return;
    const slider = [...host.querySelectorAll('input[type="range"]')]
      .find(x => x.getAttribute('aria-label') === '比較フレーム');
    if (!slider || slider.dataset.baiPlaybackAdded === '1') return;
    slider.dataset.baiPlaybackAdded = '1';
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0';
    const play = document.createElement('button'); play.type = 'button'; play.textContent = '試験フレーム再生';
    const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = '停止';
    const step = document.createElement('button'); step.type = 'button'; step.textContent = '次のフレーム';
    const fps = document.createElement('select'); fps.setAttribute('aria-label', 'プレビュー更新速度');
    for (const n of [5, 10, 15]) { const opt=document.createElement('option'); opt.value=String(n); opt.textContent=n+' FPS'; fps.append(opt); }
    fps.value='10';
    const label = document.createElement('span'); label.textContent = '未検証プレビュー・モデル保存なし';
    toolbar.append(play,stop,step,fps,label);
    slider.parentNode.insertBefore(toolbar,slider);
    let running = false, timer = null;
    const halt=()=>{running=false;if(timer!==null){clearTimeout(timer);timer=null;}play.disabled=false;};
    const tick=()=>{if(!running)return;if(slider.disabled){halt();return;}let next=Number(slider.value)+1;
      if(next>Number(slider.max))next=Number(slider.min);slider.value=String(next);
      slider.dispatchEvent(new Event('input',{bubbles:true}));timer=setTimeout(tick,1000/Number(fps.value));};
    play.onclick=()=>{if(slider.disabled)return;halt();running=true;play.disabled=true;tick();};
    stop.onclick=halt;
    step.onclick=()=>{halt();if(slider.disabled)return;let next=Number(slider.value)+1;
      if(next>Number(slider.max))next=Number(slider.min);slider.value=String(next);slider.dispatchEvent(new Event('input',{bubbles:true}));};
    document.addEventListener('visibilitychange',()=>{if(document.hidden)halt();});
  };
  document.readyState==='loading' ? document.addEventListener('DOMContentLoaded',init) : init();
})();
