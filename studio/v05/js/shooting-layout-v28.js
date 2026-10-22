/* UI-only cinematic viewer layout. Owns no scene state or motion playback. */
export const VIEW_MODES = Object.freeze(['inset','split','full']);
export function createShootingLayout({viewport,shooting,controls,win=window,initial='inset',onChange=()=>{}}){
 if(!viewport||!shooting||!controls)throw new TypeError('Viewport, shooting view and controls required');
 let mode='inset',disposed=false;
 const buttons=[];
 const labels={inset:'小窓',split:'左右分割',full:'撮影ビュー最大化'};
 const original={viewport:viewport.getAttribute('data-shooting-layout'),shooting:shooting.getAttribute('style')};
 function setMode(next){
  if(disposed)throw new Error('Layout disposed');
  if(!VIEW_MODES.includes(next))throw new RangeError('Unknown shooting layout');
  mode=next;viewport.dataset.shootingLayout=next;
  for(const [name,button] of buttons){button.setAttribute('aria-pressed',String(name===next));}
  onChange(next);
  // ResizeObserver handles WebGL surface resizing; notify legacy hosts as well.
  if(typeof win.Event==='function')win.dispatchEvent(new win.Event('resize'));
  return mode;
 }
 for(const name of VIEW_MODES){
  const button=win.document.createElement('button');button.type='button';button.textContent=labels[name];button.setAttribute('data-camera-layout',name);
  button.setAttribute('title',name==='inset'?'自由視点に撮影映像を重ねる':name==='split'?'自由視点と撮影映像を並べる':'撮影映像を大きく表示');
  button.addEventListener('click',()=>setMode(name));controls.appendChild(button);buttons.push([name,button]);
 }
 setMode(initial);
 return Object.freeze({setMode,getMode:()=>mode,dispose(){if(disposed)return;disposed=true;for(const [,button] of buttons)button.remove();if(original.viewport===null)delete viewport.dataset.shootingLayout;else viewport.setAttribute('data-shooting-layout',original.viewport);if(original.shooting===null)shooting.removeAttribute('style');else shooting.setAttribute('style',original.shooting);}});
}
