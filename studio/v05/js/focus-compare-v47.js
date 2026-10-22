/* Compare measured focus frames only. Missing/failed samples are never inferred. */
export function compareFocusReports(before, after, {epsilon=1e-6}={}) {
  if (!Number.isFinite(epsilon)||epsilon<0) throw new RangeError('invalid_epsilon');
  const validate = (r) => {
    if(!r || !Number.isInteger(r.startFrame)||!Number.isInteger(r.endFrame)||r.endFrame<r.startFrame||!Number.isFinite(Number(r.fps))||Number(r.fps)<=0) throw new TypeError('invalid_focus_report');
    if(!Array.isArray(r.samples)) throw new TypeError('full_samples_required');
    const map=new Map();
    for(const s of r.samples){
      if(!s || !Number.isInteger(s.frame)||s.frame<r.startFrame||s.frame>r.endFrame||map.has(s.frame)) throw new TypeError('invalid_focus_samples');
      const measured=s.ok===true && typeof s.error==='number' && Number.isFinite(s.error) && s.error>=0;
      map.set(s.frame, measured?{ok:true,error:s.error}:{ok:false,reason:String(s.reason||'evaluation_failed')});
    }
    return map;
  };
  const a=validate(before),b=validate(after);
  if(Number(before.fps)!==Number(after.fps)) throw new RangeError('fps_mismatch');
  const start=Math.max(before.startFrame,after.startFrame), end=Math.min(before.endFrame,after.endFrame);
  if(start>end) throw new RangeError('no_overlap');
  const frames=[];const count={improved:0,worsened:0,unchanged:0,unavailable:0};let beforeTotal=0,afterTotal=0;
  for(let f=start;f<=end;f++){
    const p=a.get(f),q=b.get(f);
    if(!p?.ok||!q?.ok){frames.push({frame:f,status:'unavailable',reason:!p?'before_missing':!q?'after_missing':!p.ok?'before_failed':'after_failed'});count.unavailable++;continue;}
    const delta=q.error-p.error;
    const status=Math.abs(delta)<=epsilon?'unchanged':delta<0?'improved':'worsened';
    frames.push({frame:f,status,beforeError:p.error,afterError:q.error,delta});count[status]++;beforeTotal+=p.error;afterTotal+=q.error;
  }
  const measured=count.improved+count.worsened+count.unchanged;
  return {startFrame:start,endFrame:end,fps:Number(before.fps),beforeId:String(before.id||''),afterId:String(after.id||''),count,measured,meanBefore:measured?beforeTotal/measured:null,meanAfter:measured?afterTotal/measured:null,frames,gpuVerified:false};
}
export function createFocusComparison(doc,result,{onJump=()=>{}}={}){
  const panel=doc.createElement('section');panel.className='v47-focus-comparison';
  const title=doc.createElement('strong');title.textContent=`比較 ${result.beforeId} → ${result.afterId}`;panel.append(title);
  const summary=doc.createElement('p');summary.textContent=`改善 ${result.count.improved} / 悪化 ${result.count.worsened} / 変化なし ${result.count.unchanged} / 比較不可 ${result.count.unavailable}（GPU未検証）`;panel.append(summary);
  const list=doc.createElement('div');list.style.cssText='max-height:140px;overflow:auto';
  for(const item of result.frames.filter(f=>f.status==='worsened'||f.status==='improved')){
    const button=doc.createElement('button');button.type='button';button.textContent=`${item.frame}f ${item.status==='improved'?'改善':'悪化'} ${item.delta.toFixed(4)}`;
    button.addEventListener('click',()=>onJump(item.frame));list.append(button);
  }
  panel.append(list);return panel;
}
