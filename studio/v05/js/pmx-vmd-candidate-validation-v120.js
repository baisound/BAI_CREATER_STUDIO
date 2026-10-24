// @ts-check
// MOTION-010: read-only, physics-off real-PMX round trip for a review-only VMD candidate.
import {loadModel,disposeObject,modelSource} from '../../js/viewport/model-loader.js';
import {loadVmdClip,vmdUrl} from '../../js/motion/vmd.js';
import {createPmxVmdPreview} from '../../js/motion/pmx-vmd-preview.js';

const MAX_FRAMES=6000;
const MAX_SAMPLES=10000;
const POSITION_LIMIT=1e-3;
const ANGLE_LIMIT_DEGREES=0.01;

function checkCurrent(signal,isCurrent){
  if(signal?.aborted||!isCurrent())throw Error('作品・候補の変更または中止により検証を終了しました');
}

async function verifyHash(url,expected,signal){
  if(!/^[0-9a-f]{64}$/.test(expected))throw Error('候補のSHA-256が不正です');
  const response=await fetch(url,{cache:'no-store',signal});
  if(!response.ok)throw Error(`検証素材を取得できません: HTTP ${response.status}`);
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>256*1024*1024)throw Error('検証素材が256MiBを超えます');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const actual=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(actual!==expected)throw Error('候補作成後にPMX、元VMDまたは候補VMDの内容が変わりました');
}

/** Compare independent PMX skeletons after their IK/grant evaluation. */
export function comparePmxBones(source,candidate,THREE){
  const a=source?.skeleton?.bones,b=candidate?.skeleton?.bones;
  if(!a?.length||a.length!==b?.length)throw Error('実PMXの骨数が一致しません');
  source.updateMatrixWorld(true);candidate.updateMatrixWorld(true);
  const ap=new THREE.Vector3(),bp=new THREE.Vector3();
  const aq=new THREE.Quaternion(),bq=new THREE.Quaternion();
  let position=0,angle=0,positionBone='',angleBone='';
  for(let i=0;i<a.length;i++){
    if(a[i].name!==b[i].name)throw Error(`実PMXの骨順が一致しません: ${i}`);
    a[i].getWorldPosition(ap);b[i].getWorldPosition(bp);
    a[i].getWorldQuaternion(aq);b[i].getWorldQuaternion(bq);
    const p=ap.distanceTo(bp);
    // Matrix decomposition can return a quaternion with a tiny norm error.
    // Compare orientation, not that norm, especially after large arm edits.
    if(!Number.isFinite(aq.lengthSq())||!Number.isFinite(bq.lengthSq())||
        aq.lengthSq()<1e-12||bq.lengthSq()<1e-12)
      throw Error(`実PMXの回転が非有限です: ${a[i].name}`);
    aq.normalize();bq.normalize();
    const dot=Math.min(1,Math.abs(aq.dot(bq)));
    const degrees=2*Math.acos(dot)*180/Math.PI;
    if(!Number.isFinite(p)||!Number.isFinite(degrees))throw Error(`実PMXの姿勢が非有限です: ${a[i].name}`);
    if(p>position){position=p;positionBone=a[i].name;}
    if(degrees>angle){angle=degrees;angleBone=a[i].name;}
  }
  return {position,angle,positionBone,angleBone,bones:a.length};
}

/**
 * Review only. Loads two independent copies; never writes either PMX or project data.
 * @param {any} input
 */
export async function validatePmxVmdCandidate(input){
  const {libs,modelAsset,motionAsset,row,layers,candidate,signal,isCurrent,onProgress}=input;
  if(!libs?.THREE||!modelAsset||!motionAsset||!candidate?.download_url||
      modelAsset.format!=='PMX'||motionAsset.format!=='VMD')throw Error('実PMXと元VMDの候補が必要です');
  if(!Array.isArray(layers)||!layers.length||!Number.isFinite(row?.start)||
      !Number.isFinite(row?.duration)||!Number.isFinite(input.fps)||input.fps<1)
    throw Error('作品フレームと保存済み補正が必要です');
  const first=Math.ceil(row.start*input.fps-1e-7);
  const end=Math.ceil((row.start+row.duration)*input.fps-1e-7);
  const firstVmd=Math.ceil(row.start*30-1e-7);
  const endVmd=Math.ceil((row.start+row.duration)*30-1e-7);
  const denseSpan=candidate.export_mode==='whole'&&candidate.sampling_report?.mode==='whole'?
    candidate.sampling_report.vmd_frame_span:0;
  if(denseSpan&&(!Number.isInteger(denseSpan)||denseSpan<1||denseSpan>18001))
    throw Error('全フレーム候補のVMD範囲が不正です');
  const untilVmd=Math.max(endVmd,firstVmd+denseSpan);
  const count=end-first,vmdCount=untilVmd-firstVmd,total=count+vmdCount;
  if(count<1||count>MAX_FRAMES||vmdCount<1||total>MAX_SAMPLES)
    throw Error(`全フレーム検証は作品1〜${MAX_FRAMES}F、合計${MAX_SAMPLES}標本までです（対象${count}+${vmdCount}）。間引き検証はしません。`);
  checkCurrent(signal,isCurrent);
  const pmxUrl=modelSource(modelAsset).url,sourceUrl=vmdUrl(motionAsset);
  await verifyHash(pmxUrl,candidate.model_sha256,signal);
  await verifyHash(sourceUrl,candidate.source_motion_sha256,signal);
  await verifyHash(candidate.download_url,candidate.output_sha256,signal);
  checkCurrent(signal,isCurrent);
  let source=null,output=null,sourcePlayer=null,outputPlayer=null;
  try{
    source=await loadModel(modelAsset,libs);checkCurrent(signal,isCurrent);
    output=await loadModel(modelAsset,libs);checkCurrent(signal,isCurrent);
    const sourceClip=await loadVmdClip(libs,sourceUrl,source.object);
    checkCurrent(signal,isCurrent);
    const outputClip=await loadVmdClip(libs,candidate.download_url,output.object);
    checkCurrent(signal,isCurrent);
    sourcePlayer=createPmxVmdPreview(libs.THREE,libs.MMDAnimationHelper,source.object,sourceClip,'source');
    outputPlayer=createPmxVmdPreview(libs.THREE,libs.MMDAnimationHelper,output.object,outputClip,'candidate');
    sourcePlayer.setCorrectionLayers(layers);
    let maxPosition=0,maxAngle=0,positionFrame=first,angleFrame=first;
    let positionClock='作品',angleClock='作品',positionBone='',angleBone='',bones=0,done=0;
    for(const [clock,from,until,rate] of [['作品',first,end,input.fps],['VMD',firstVmd,untilVmd,30]]){
      for(let frame=from;frame<until;frame++){
        checkCurrent(signal,isCurrent);
        const seconds=frame/rate-row.start;
        // VMDLoader stores key times as float32. JS frame/30 can land just
        // before a dense key, so evaluate a frame boundary inside that key.
        const atVmdFrame=denseSpan>0&&Math.abs(seconds*30-Math.round(seconds*30))<1e-7;
        const sampleSeconds=atVmdFrame?seconds+1e-6:seconds;
        sourcePlayer.seek(sampleSeconds);outputPlayer.seek(sampleSeconds);
        const diff=comparePmxBones(source.object,output.object,libs.THREE);
        bones=diff.bones;done++;
        if(diff.position>maxPosition){maxPosition=diff.position;positionFrame=frame;positionClock=clock;positionBone=diff.positionBone;}
        if(diff.angle>maxAngle){maxAngle=diff.angle;angleFrame=frame;angleClock=clock;angleBone=diff.angleBone;}
        if(done%24===0||done===total){
          onProgress?.(done,total);
          // Yield for paint and cancellation without skipping any frame.
          if(done!==total)await new Promise(resolve=>setTimeout(resolve,0));
        }
      }
    }
    checkCurrent(signal,isCurrent);
    await verifyHash(pmxUrl,candidate.model_sha256,signal);
    await verifyHash(sourceUrl,candidate.source_motion_sha256,signal);
    await verifyHash(candidate.download_url,candidate.output_sha256,signal);
    checkCurrent(signal,isCurrent);
    return {passed:maxPosition<=POSITION_LIMIT&&maxAngle<=ANGLE_LIMIT_DEGREES,
      checkedFrames:count,checkedVmdFrames:vmdCount,bones,maxPosition,maxAngle,
      positionFrame,angleFrame,positionClock,angleClock,
      positionBone,angleBone,positionLimit:POSITION_LIMIT,angleLimitDegrees:ANGLE_LIMIT_DEGREES};
  }finally{
    sourcePlayer?.dispose();outputPlayer?.dispose();
    if(source)disposeObject(source.object);
    if(output)disposeObject(output.object);
  }
}
