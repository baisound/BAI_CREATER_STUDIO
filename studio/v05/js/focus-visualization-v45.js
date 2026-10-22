/* Focus report visualization. Never interpolate unrecorded samples. */
export function buildFocusPlot(report) {
  const start=Number(report?.startFrame),end=Number(report?.endFrame);
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start)throw new RangeError('invalid_focus_range');
  const raw=Array.isArray(report?.problems)?report.problems:[];
  const points=raw.map(p=>({frame:Number(p.frame),error:p.error==null?null:Number(p.error),reason:String(p.reason||'unknown')}))
    .filter(p=>Number.isInteger(p.frame)&&p.frame>=start&&p.frame<=end)
    .map(p=>({...p,error:p.error!==null&&Number.isFinite(p.error)&&p.error>=0?p.error:null}))
    .sort((a,b)=>a.frame-b.frame);
  const max=Math.max(1,...points.filter(p=>p.error!==null).map(p=>p.error));
  return {start,end,points,max,observed:points.length,unobserved:end-start+1-points.length};
}
export function createFocusPlot(doc,report,{onJump=()=>{}}={}) {
  const data=buildFocusPlot(report),ns='http://www.w3.org/2000/svg';
  const root=doc.createElement('div');root.className='v45-focus-plot';
  const caption=doc.createElement('p');caption.textContent=`記録された問題点 ${data.observed}件（未記録フレームは正常と判定しません）`;root.append(caption);
  const svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 170');svg.setAttribute('role','img');svg.setAttribute('aria-label','保存済みフォーカス問題フレームの誤差プロット');svg.style.cssText='width:100%;height:auto;max-height:180px;background:#172233;border:1px solid #43516b;border-radius:6px';
  const line=(x1,y1,x2,y2,color)=>{const l=doc.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1,y1,x2,y2,stroke:color}))l.setAttribute(k,String(v));svg.append(l);};
  line(32,12,32,143,'#8291a5');line(32,143,628,143,'#8291a5');
  const span=Math.max(1,data.end-data.start);
  const x=f=>32+(f-data.start)/span*596;
  for(const p of data.points){const cx=x(p.frame),cy=p.error===null?20:143-Math.min(1,p.error/data.max)*116;
    const circle=doc.createElementNS(ns,'circle');circle.setAttribute('cx',cx);circle.setAttribute('cy',cy);circle.setAttribute('r','5');circle.setAttribute('fill',p.error===null?'#f0be62':'#f06e72');circle.style.cursor='pointer';circle.setAttribute('tabindex','0');circle.setAttribute('role','button');circle.setAttribute('aria-label',`${p.frame}フレーム、${p.reason}、誤差${p.error??'不明'}、移動`);
    circle.addEventListener('click',()=>onJump(p.frame));circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onJump(p.frame);}});svg.append(circle);
  }
  root.append(svg);return root;
}
