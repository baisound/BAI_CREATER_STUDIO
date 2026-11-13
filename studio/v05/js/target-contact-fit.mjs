/* MOTION-011/012. A bounded, target-rig contact candidate, never a recovered
 * source skeleton. evaluate() always starts from VMD + existing saved layers. */
export function contactRig(THREE, mesh, side) {
  const fail=message=>{throw Error(message);};
  if(!['左','右'].includes(side)||!mesh?.isSkinnedMesh)fail('左右の足と実PMXを選択してください');
  const bones=mesh.skeleton?.bones||[],iks=mesh.geometry?.userData?.MMD?.iks||[];
  const bone=name=>{
    const found=bones.filter(b=>b.name===name);
    if(found.length!==1)fail(`実PMXの「${name}」骨を一意に確認できません`);
    return found[0];
  };
  const hip=bone(side+'足'),knee=bone(side+'ひざ'),ankle=bone(side+'足首');
  const targets=iks.filter(ik=>[side+'足ＩＫ',side+'足IK'].includes(bones[ik.target]?.name)&&
    bones[ik.effector]===ankle&&ik.links?.length===2&&
    ik.links.some(l=>bones[l.index]===hip)&&ik.links.some(l=>bones[l.index]===knee));
  if(targets.length!==1||knee.parent!==hip||ankle.parent!==knee)fail('標準の足IKチェーンが必要です。手動IKで確認してください');
  const ik=targets[0],target=bones[ik.target];
  if(ik.links.some(l=>l.enabled===false))fail('足IKが無効です。IKモードへ戻してください');
  mesh.updateWorldMatrix(true,true);
  const vec=()=>new THREE.Vector3(),world=b=>b.getWorldPosition(vec());
  const scale=mesh.getWorldScale(vec());
  if(Math.min(scale.x,scale.y,scale.z)<=0||Math.max(scale.x,scale.y,scale.z)-Math.min(scale.x,scale.y,scale.z)>1e-6)
    fail('接地補正には正の均一スケールが必要です');
  const lengths=[world(hip).distanceTo(world(knee)),world(knee).distanceTo(world(ankle))];
  const leg=lengths[0]+lengths[1],tolerance=Math.max(.0001,leg*.003);
  if(!Number.isFinite(leg)||Math.min(...lengths)<=1e-6)fail('実PMXの脚長を測れません');
  const attrs=mesh.geometry.attributes,footIndices=new Set();
  bones.forEach((b,i)=>{if([side+'足首',side+'足首D',side+'足先EX',side+'つま先'].includes(b.name))footIndices.add(i);});
  if(!attrs.skinIndex||!attrs.skinWeight||!attrs.position)fail('足裏のウェイト付き頂点がありません');
  const vertices=[];
  for(let i=0;i<attrs.position.count;i++){
    let weight=0;
    for(let k=0;k<4;k++)if(footIndices.has(attrs.skinIndex.getComponent(i,k)))weight+=attrs.skinWeight.getComponent(i,k);
    if(weight>=.5)vertices.push(i);
  }
  if(vertices.length<3)fail('足裏を測れる実頂点が足りません。手動IKで調整してください');
  const vertex=i=>mesh.getVertexPosition(i,vec()).applyMatrix4(mesh.matrixWorld);
  // Choose the same rest-geometry sole vertices even when the VMD tilts a shoe.
  // Every measurement below still skins those actual vertices in the current pose.
  const lowest=vertices.map(i=>({i,y:attrs.position.getY(i)})).sort((a,b)=>a.y-b.y);
  const soleIds=lowest.filter(v=>v.y<=lowest[0].y+leg/scale.y*.01).map(v=>v.i);
  if(soleIds.length<3)fail('足裏の面を確認できません。床高と対象モデルを確認してください');
  // All non-permitted bones are checked, including the other foot, hands/head.
  const allowed=new Set([target]);
  const descendants=b=>{allowed.add(b);for(const c of b.children)if(c.isBone)descendants(c);};
  descendants(hip);descendants(target);
  let changed=true;
  const grants=mesh.geometry.userData.MMD.grants||[];
  while(changed){changed=false;for(const g of grants)if(allowed.has(bones[g.parentIndex])&&!allowed.has(bones[g.index])){
    descendants(bones[g.index]);changed=true;
  }}
  const other=side==='左'?'右':'左';
  const protectedPart=b=>['頭','首','左手首','右手首'].includes(b.name)||
    [other+'足',other+'ひざ',other+'足首',other+'つま先',other+'足先'].some(name=>b.name.startsWith(name));
  const observers=bones.filter(b=>!allowed.has(b)||protectedPart(b));
  function sample(){
    mesh.updateWorldMatrix(true,true);
    const points=vertices.map(vertex),sole=vec();
    if(points.some(p=>p.toArray().some(n=>!Number.isFinite(n))))fail('足裏の実頂点に不正な座標があります');
    for(const i of soleIds)sole.add(vertex(i));
    sole.multiplyScalar(1/soleIds.length);
    sole.y=Math.min(...points.map(p=>p.y));
    const a=world(hip),b=world(knee),c=world(ankle);
    const normal=b.clone().sub(a).cross(c.clone().sub(b));
    const observed=observers.map(b=>({p:world(b),q:b.getWorldQuaternion(new THREE.Quaternion())}));
    if([a,b,c,world(target),...observed.flatMap(v=>[v.p,v.q])].some(v=>v.toArray().some(n=>!Number.isFinite(n))))
      fail('骨の評価に不正な座標があります');
    return {sole,normal,ankle:c,target:world(target),
      lengths:[a.distanceTo(b),b.distanceTo(c)],
      angles:ik.links.map(link=>({x:bones[link.index].rotation.x,y:bones[link.index].rotation.y,z:bones[link.index].rotation.z})),
      observers:observed,
      morphs:[...(mesh.morphTargetInfluences||[])]};
  }
  function unchanged(a,b){
    let max=0;
    a.observers.forEach((v,i)=>{
      max=Math.max(max,v.p.distanceTo(b.observers[i].p));
      if(1-Math.abs(v.q.dot(b.observers[i].q))>1e-10)fail('対象外の骨の回転が変化したため保存できません');
    });
    if(max>1e-5||a.morphs.length!==b.morphs.length||a.morphs.some((v,i)=>Math.abs(v-b.morphs[i])>1e-6))
      fail('反対の足・手・頭・表情が変化したため保存できません');
    return max;
  }
  function validate(baseline,after,fullyApplied=true){
    const delta=unchanged(baseline,after);
    if(after.lengths.some((n,i)=>Math.abs(n-lengths[i])>Math.max(1e-6,lengths[i]*.001)))
      fail('脚の長さが変化したため保存できません');
    if(baseline.normal.length()>leg*leg*.0001&&after.normal.length()>leg*leg*.0001&&baseline.normal.dot(after.normal)<0)
      fail('膝の曲がる方向が反転します。区間を短くしてください');
    ik.links.forEach((link,i)=>{
      for(const axis of ['x','y','z']){
        const violation=value=>Math.max(0,link.rotationMin?link.rotationMin[axis]-value:0,
          link.rotationMax?value-link.rotationMax[axis]:0);
        const excess=violation(after.angles[i][axis]);
        // Outside/fade frames inherit the original VMD pose. Do not introduce
        // a new violation there, nor rewrite source poses just to clamp them.
        if(excess>1e-5&&(fullyApplied||excess>violation(baseline.angles[i][axis])+1e-5))
          fail('PMXの足IK角度制限を超えています');
      }
    });
    return delta;
  }
  function localDelta(delta){
    const p=world(target),parent=target.parent;
    return parent.worldToLocal(p.clone().add(delta)).sub(parent.worldToLocal(p));
  }
  return {leg,tolerance,targetName:target.name,sample,validate,localDelta,
    vertexCount:vertices.length,soleVertexCount:soleIds.length};
}

export async function buildContactCandidate({THREE,mesh,side,first,end,floor,fps,identity,
  evaluate,setLayer,assertCurrent,yieldFrame=()=>Promise.resolve()}){
  const fade=Math.ceil(fps*.1);
  if(!Number.isInteger(first)||!Number.isInteger(end)||!Number.isFinite(floor)||Math.abs(floor)>100000||
    !Number.isFinite(fps)||fps<1||fps>240||end-first>Math.ceil(2*fps)||end-first-2*fade<2)
    throw Error('区間は2秒以内で、前後0.1秒を除いた内側に2F以上が必要です');
  const low=Math.ceil(identity.start*fps-1e-7),high=Math.ceil((identity.start+identity.duration)*fps-1e-7);
  if(first<low||end>high)throw Error('指定区間を同じVMDクリップの中へ収めてください');
  assertCurrent();setLayer(null);evaluate((first+fade)/fps);
  const rig=contactRig(THREE,mesh,side),base=new Map();
  // Include the adjacent outside frames. The layer's half-open bounds also
  // protect all fractional times outside the interval in the shared evaluator.
  const frames=Array.from({length:end-first+2},(_,i)=>first+i-1).filter(f=>f>=low&&f<high);
  for(const f of frames){assertCurrent();evaluate(f/fps);base.set(f,rig.sample());}
  const anchor=base.get(first+fade).sole.clone();anchor.y=floor;
  const layer={...identity,id:crypto.randomUUID(),name:`${side}足の接地 Y=${floor}`,weight:1,muted:false,solo:false,
    start_frame:first,end_frame:end,fade_in_frames:0,fade_out_frames:0,
    keys:Array.from({length:end-first},(_,i)=>({frame:first+i,bone:rig.targetName,
      rotation:[0,0,0,1],position:[0,0,0]}))};
  const report={frames:end-first,interiorFrames:0,legLength:rig.leg,tolerance:rig.tolerance,
    vertexCount:rig.vertexCount,soleVertexCount:rig.soleVertexCount,
    beforeHeight:0,beforeSlide:0,maxHeight:0,maxSlide:0,maxIkResidual:0,maxCorrection:0,maxOtherChange:0};
  setLayer(layer);
  try{
    for(let i=0;i<layer.keys.length;i++){
      const key=layer.keys[i],baseline=base.get(key.frame);
      let after;
      for(let iteration=0;iteration<18;iteration++){
        assertCurrent();evaluate(key.frame/fps);after=rig.sample();
        const error=anchor.clone().sub(after.sole);
        if(error.length()<=rig.tolerance*.25)break;
        const step=rig.localDelta(error),position=new THREE.Vector3().fromArray(key.position).add(step);
        // Use the observed world displacement too: a malformed parent scale
        // must not turn a small local key into a large model displacement.
        const correction=after.target.clone().sub(baseline.target).add(error).length();
        if(correction>rig.leg*.1+1e-8)throw Error('補正が脚長の10%を超えます。床高を確認し、接地区間を短くしてください');
        key.position=position.toArray();
      }
      evaluate(key.frame/fps);after=rig.sample();
      if(after.sole.distanceTo(anchor)>rig.tolerance)throw Error('指定した床へ足が届きません。区間を短くするか手動IKで調整してください');
      report.maxCorrection=Math.max(report.maxCorrection,after.target.distanceTo(baseline.target));
      if(i%4===3){await yieldFrame();assertCurrent();}
    }
    layer.fade_in_frames=fade;layer.fade_out_frames=fade;
    for(const f of frames){
      assertCurrent();evaluate(f/fps);const after=rig.sample(),baseline=base.get(f);
      const interior=f>=first+fade&&f<=end-fade;
      report.maxOtherChange=Math.max(report.maxOtherChange,rig.validate(baseline,after,interior));
      if(f>=first+fade&&f<=end-fade){
        report.interiorFrames++;
        report.beforeHeight=Math.max(report.beforeHeight,Math.abs(baseline.sole.y-floor));
        report.beforeSlide=Math.max(report.beforeSlide,Math.hypot(baseline.sole.x-anchor.x,baseline.sole.z-anchor.z));
        report.maxHeight=Math.max(report.maxHeight,Math.abs(after.sole.y-floor));
        report.maxSlide=Math.max(report.maxSlide,Math.hypot(after.sole.x-anchor.x,after.sole.z-anchor.z));
        report.maxIkResidual=Math.max(report.maxIkResidual,after.ankle.distanceTo(after.target));
      }
      if(f<first||f>=end){
        if(after.sole.distanceTo(baseline.sole)>1e-5||after.ankle.distanceTo(baseline.ankle)>1e-5)
          throw Error('区間外に変化が出たため保存できません');
      }
    }
    if(Math.max(report.maxHeight,report.maxSlide,report.maxIkResidual)>rig.tolerance)
      throw Error('接地・滑り・IK残差が許容値を超えています。床高と区間を確認してください');
    return {layer,report,contact:{side,start_frame:first,end_frame:end,ground_y:floor}};
  }catch(error){setLayer(null);throw error;}
}
