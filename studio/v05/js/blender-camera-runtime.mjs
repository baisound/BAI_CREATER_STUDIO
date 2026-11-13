/* Evaluated Blender camera samples, in native source time. No VMD/FOV approximation. */
export function createBlenderCameraSampler(THREE,track,mapping){
  if(track?.format!=='bai-blender-camera-v1'||!Array.isArray(track.samples)||track.samples.length<2)
    throw Error('Blenderカメラの評価済み標本がありません');
  const scale=mapping?.scale,offset=mapping?.offset;
  if(!Number.isFinite(scale)||scale<=0||!Array.isArray(offset)||offset.length!==3||offset.some(x=>!Number.isFinite(x)))
    throw Error('カメラの単位・オフセットが不正です');
  const samples=track.samples,aspect=track.resolution[0]*track.pixel_aspect[0]/(track.resolution[1]*track.pixel_aspect[1]);
  const basis=new THREE.Matrix4().set(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1);
  return seconds=>{
    if(!Number.isFinite(seconds)||seconds< -1e-7||seconds>samples.at(-1).time+.0001)throw Error('カメラの元区間外です');
    const t=Math.max(0,Math.min(samples.at(-1).time,seconds));
    let lo=0,hi=samples.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(samples[mid].time<=t+1e-10)lo=mid+1;else hi=mid;}
    const left=samples[Math.max(0,lo-1)],right=samples[Math.min(samples.length-1,lo)];
    const blend=left.camera===right.camera&&left.type===right.type&&right.time>left.time?
      Math.min(1,Math.max(0,(t-left.time)/(right.time-left.time))):0;
    const a=new THREE.Matrix4().fromArray(left.world),b=new THREE.Matrix4().fromArray(right.world);
    const pa=new THREE.Vector3(),pb=new THREE.Vector3(),qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),s=new THREE.Vector3();
    a.decompose(pa,qa,s);b.decompose(pb,qb,s);pa.lerp(pb,blend);qa.slerp(qb,blend).normalize();
    const world=new THREE.Matrix4().compose(pa,qa,new THREE.Vector3(1,1,1)).premultiply(basis);
    world.elements[12]=world.elements[12]*scale+offset[0];
    world.elements[13]=world.elements[13]*scale+offset[1];
    world.elements[14]=world.elements[14]*scale+offset[2];
    const projection=left.projection.map((n,i)=>n+(right.projection[i]-n)*blend);
    if(left.type==='PERSP')projection[14]*=scale;
    else for(const i of [0,5,10])projection[i]/=scale;
    return {world:world.toArray(),projection,aspect,type:left.type,camera:left.camera,
      near:left.lens.clip_start*scale,far:left.lens.clip_end*scale};
  };
}
