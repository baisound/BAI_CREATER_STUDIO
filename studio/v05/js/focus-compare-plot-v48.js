/* Plot only pairs of actually observed measurements. No imputation. */
export function buildFocusComparisonPlot(result) {
  if (!result || !Array.isArray(result.frames) || !Number.isInteger(result.startFrame) || !Number.isInteger(result.endFrame)) throw new TypeError('invalid_comparison');
  const points = result.frames.filter(p => p.status !== 'unavailable' && Number.isFinite(p.beforeError) && Number.isFinite(p.afterError))
    .map(p => ({frame:p.frame,before:p.beforeError,after:p.afterError,delta:p.delta,status:p.status}));
  const max=Math.max(1,...points.flatMap(p=>[p.before,p.after]));
  const runs=[];let run=[];
  for(const p of points){if(run.length && p.frame!==run[run.length-1].frame+1){runs.push(run);run=[];}run.push(p);}
  if(run.length)runs.push(run);
  return {start:result.startFrame,end:result.endFrame,points,runs,max,unavailable:result.frames.filter(p=>p.status==='unavailable').length};
}
export function createFocusComparisonPlot(doc,result,{onJump=()=>{},onRange=()=>{}}={}){
  const data=buildFocusComparisonPlot(result),ns='http://www.w3.org/2000/svg';
  const wrap=doc.createElement('section');wrap.className='v48-focus-comparison-plot';
  const legend=doc.createElement('p');legend.textContent=`診断前＝青 / 診断後＝橙 / 改善＝緑 / 悪化＝赤 / 比較不可 ${data.unavailable}件（GPU未検証）`;wrap.append(legend);
  const svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 660 205');svg.setAttribute('role','img');svg.setAttribute('aria-label','診断前後の実測ピント誤差の比較');svg.style.cssText='width:100%;max-height:240px;background:#172233;border:1px solid #43516b;border-radius:6px;touch-action:none';
  const span=Math.max(1,data.end-data.start),left=35,right=643,top=14,bottom=175;
  const x=f=>left+(f-data.start)/span*(right-left),y=v=>bottom-v/data.max*(bottom-top);
  const axis=doc.createElementNS(ns,'path');axis.setAttribute('d',`M${left} ${top}V${bottom}H${right}`);axis.setAttribute('fill','none');axis.setAttribute('stroke','#a7b6c9');svg.append(axis);
  for(const run of data.runs){for(const [field,color] of [['before','#5fb4ff'],['after','#ffb663']]){
    if(run.length<2)continue;
    const path=doc.createElementNS(ns,'polyline');path.setAttribute('points',run.map(p=>`${x(p.frame)},${y(p[field])}`).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke',color);path.setAttribute('stroke-width','2');svg.append(path);
  }}
  for(const p of data.points){const dot=doc.createElementNS(ns,'circle');dot.setAttribute('cx',String(x(p.frame)));dot.setAttribute('cy',String(y(p.after)));dot.setAttribute('r','4');dot.setAttribute('fill',p.status==='improved'?'#58d49a':p.status==='worsened'?'#f47777':'#b5bfd0');dot.setAttribute('tabindex','0');dot.setAttribute('role','button');dot.setAttribute('aria-label',`${p.frame}フレーム ${p.status} 前${p.before} 後${p.after}`);dot.style.cursor='pointer';dot.addEventListener('click',()=>onJump(p.frame));dot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onJump(p.frame);}});svg.append(dot);}
  let start=null;
  const toFrame=e=>{const r=svg.getBoundingClientRect();const t=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));return Math.round(data.start+t*(data.end-data.start));};
  svg.addEventListener('pointerdown',e=>{if(e.target!==svg)return;start=toFrame(e);});
  svg.addEventListener('pointerup',e=>{if(start===null)return;const end=toFrame(e);onRange(Math.min(start,end),Math.max(start,end));start=null;});
  svg.addEventListener('pointercancel',()=>{start=null;});
  wrap.append(svg);return wrap;
}
