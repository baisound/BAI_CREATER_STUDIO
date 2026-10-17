// Non-destructive preview guard. Node indices must be valid for the user-selected GLB.
export function inspectPreviewKeys(keys, nodeCount) {
 const errors=[];
 if(!Array.isArray(keys)) errors.push('キー一覧がありません');
 if(!Number.isSafeInteger(nodeCount)||nodeCount<1) errors.push('比較モデルにノードがありません');
 if(Array.isArray(keys)) {
  if(keys.length>100000) errors.push('キー数が上限を超えています');
  for(const [i,k] of keys.entries()) {
   if(!k||!Number.isSafeInteger(k.frame)||k.frame<0||!Number.isSafeInteger(k.target_node)||k.target_node<0||k.target_node>=nodeCount||!Array.isArray(k.rotation_xyzw)||k.rotation_xyzw.length!==4||k.rotation_xyzw.some(v=>typeof v!=='number'||!Number.isFinite(v))||Math.hypot(...k.rotation_xyzw)<1e-8) {errors.push(`キー ${i} が不正か、転写先ノードが存在しません`);break;}
  }
 }
 return {ok:errors.length===0,errors,keyCount:Array.isArray(keys)?keys.length:0};
}
