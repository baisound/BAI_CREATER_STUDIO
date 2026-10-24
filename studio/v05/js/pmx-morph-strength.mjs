// A measured vertex displacement ratio is only a starting point for a person to preview.
export function strengthCandidates(analysis,mapping,reference){
  const referenceEntry=analysis?.morphs?.find(row=>row.id===reference);
  if(!referenceEntry||referenceEntry.type!==1||referenceEntry.manualRequired||
      !Number.isFinite(referenceEntry.median)||referenceEntry.median<=0)
    throw new Error('Reference morph needs measured vertex movement');
  const entries={};
  for(const [shape,id] of Object.entries(mapping)){
    if(!['A','I','U','E','O'].includes(shape))throw new Error('Unknown mouth shape');
    const row=analysis.morphs.find(item=>item.id===id);
    if(!row)throw new Error('Unknown mouth morph');
    const manualRequired=row.type!==1||row.manualRequired||!Number.isFinite(row.median)||row.median<=0;
    const ratio=manualRequired?null:referenceEntry.median/row.median;
    entries[shape]={morphId:id,median:row.median,
      candidate:ratio===null?null:Math.max(0,Math.min(1,ratio)),
      clipped:ratio!==null&&ratio>1,manualRequired};
  }
  return {referenceMorphId:reference,entries};
}
