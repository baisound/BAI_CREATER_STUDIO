/* Shared data-only rules for legacy camera.html and the Studio project save. */
(function(root){'use strict';
const CAMERA_OWNED_WORKSPACE_FIELDS=Object.freeze([]);
function validateRestore(bundle){
 if(!bundle||!bundle.complete||!bundle.combination)throw Error('統合保存データがありません');
 const camera=bundle.camera,workspace=bundle.workspace;
 if(!camera||!Array.isArray(camera.keys)||!Number.isInteger(camera.duration)||camera.duration<1)throw Error('カメラ保存データが不正です');
 if(!workspace||!Number.isInteger(workspace.frame)||workspace.frame<0||workspace.frame>camera.duration)throw Error('保存された再生位置が不正です');
 if(workspace.asset!=null&&typeof workspace.asset!=='string')throw Error('素材参照が不正です');
 if(workspace.clip!=null&&(!Number.isInteger(workspace.clip)||workspace.clip<0))throw Error('クリップ参照が不正です');
 if(!workspace.asset&&workspace.clip!=null)throw Error('モデルのないクリップ参照です');
 return true;
}
function buildBundleBody({combination,camera,workspace}){
 const body={schema:1,combination,camera};
 if(workspace!==null&&workspace!==undefined)body.workspace=workspace;
 return body;
}
function mergeWorkspace(storeWorkspace,hostSnapshot){
 if(storeWorkspace===null||storeWorkspace===undefined)return null;
 const result=JSON.parse(JSON.stringify(storeWorkspace));
 for(const field of CAMERA_OWNED_WORKSPACE_FIELDS){
  if(hostSnapshot&&Object.prototype.hasOwnProperty.call(hostSnapshot,field))result[field]=hostSnapshot[field];
 }
 return result;
}
const api=Object.freeze({validateRestore,buildBundleBody,mergeWorkspace,CAMERA_OWNED_WORKSPACE_FIELDS});
root.BAICameraBundleCore=api;
if(typeof globalThis!=='undefined')globalThis.BAICameraBundleCore=api;
})(typeof window!=='undefined'?window:globalThis);
