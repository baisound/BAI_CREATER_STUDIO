/* v0.5 actual WebGL viewer: explicitly opt in. The existing reconciliation loop
 * will call the same model/motion loaders after they have been registered. */
import {createActualMotionLoaders} from './actual-motion-loader-v22.js';
const open=document.getElementById('v22-open');
const close=document.getElementById('v22-close');
const panel=document.getElementById('v22-panel');
const status=document.getElementById('v22-status');
let instance=null;
let sceneTarget=null, sceneAsset=null,sceneProject=null,sceneUnbind=null;

function announce(message) {status.textContent=message;}
function stop(){
  sceneUnbind?.();sceneUnbind=null;sceneTarget=null;sceneAsset=null;sceneProject=null;
  window.BAIStudioAssetRuntime?.setLoader(null);
  window.BAIStudioAssetRuntime?.setModelLoader(null);
  window.BAIStudioAssetRuntime?.detachAll();
  instance?.dispose();instance=null;panel.classList.remove('open');
  announce('3Dプレビューを終了しました。');
}
open?.addEventListener('click',()=>{
  if(instance){stop();return;}
  window.BAIStudioMultiScenePreview?.close();
  panel.classList.add('open');
  instance=createActualMotionLoaders(document.getElementById('v22-preview'),announce);
  const runtime=window.BAIStudioAssetRuntime;
  if(!runtime){announce('素材の管理機構が利用できません。');stop();return;}
  runtime.setModelLoader(instance.loadTarget);
  runtime.setLoader(instance.loadMotion);
  announce('実3Dローダーを接続しました。素材の更新または再読み込み時に描画します。');
  document.dispatchEvent(new CustomEvent('bai:v22-loader-ready'));
  document.getElementById('v18linkCheck')?.click();
});
close?.addEventListener('click',stop);
window.addEventListener('pagehide',stop,{once:true});

// Reuse the existing single-model runtime. Scene placement and motion previews
// share the same target object; no second Three.js renderer is invented.
window.BAIStudioScenePreview={
  async show(projectId,asset,transform){
    if(!projectId || !asset || !transform) throw new Error('作品とモデル・配置情報が必要です');
    if(!instance || sceneAsset!==asset.id || sceneProject!==projectId){
      if(instance)stop();
      open?.click();
    }
    if(!instance)throw new Error('3D描画エンジンを起動できません');
    const target=await instance.loadTarget({modelId:asset.id,asset});
    if(!instance)throw new Error('3Dプレビューは閉じられました');
    sceneUnbind?.();sceneUnbind=null;
    sceneAsset=asset.id;sceneProject=projectId;sceneTarget=target;
    window.BAIStudioCurrentProjectId=projectId;
    sceneUnbind=window.BAIStudioAssetRuntime?.bindTarget(asset.id,target)||null;
    this.applyTransform(transform);
    document.getElementById('v18linkCheck')?.click();
    announce('3Dモデルを配置しました: '+asset.name);
    return true;
  },
  applyTransform(transform){
    if(!sceneTarget)throw new Error('表示中のモデルはありません');
    const o=sceneTarget.object;
    for(const [name,field] of [['position','position'],['rotation','rotation'],['scale','scale']]){
      const v=transform[name];
      if(!Array.isArray(v)||v.length!==3||v.some(n=>typeof n!=='number'||!Number.isFinite(n)))
        throw new TypeError('Invalid '+name);
      if(field==='rotation')o.rotation.set(...v.map(n=>n*Math.PI/180));
      else o[field].set(...v);
    }
    o.updateMatrixWorld(true);sceneTarget.invalidate?.();
  },
  close(){if(instance)stop();},
  getStatus(){return {active:!!sceneTarget,assetId:sceneAsset,projectId:sceneProject};}
};
