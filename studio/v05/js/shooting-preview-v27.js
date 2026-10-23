import { createShootingDOF } from './shooting-dof-v34.js';
import { createFocusRenderAudit } from './focus-render-consistency-v50.js';
/* v27: cinematic picture-in-picture shares the live model scene, but uses an
 * independent camera and renderer. Navigation controls/camera are untouched. */
export function createShootingPreview({THREE,host,parent,cameraRuntime,win=window}) {
  if(!THREE?.PerspectiveCamera || !THREE?.WebGLRenderer || !host?.scene || !host?.camera || !parent || !cameraRuntime) throw new TypeError('Live viewport, Three.js and camera runtime required');
  const navigation=host.camera;
  const camera=new THREE.PerspectiveCamera(50,16/9,.03,2000);
  camera.position.copy(navigation.position);
  camera.quaternion.copy(navigation.quaternion);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(win.devicePixelRatio||1,1.5));
  renderer.domElement.style.cssText='width:100%;height:100%;display:block';
  renderer.domElement.setAttribute('aria-label','撮影カメラのリアルタイムプレビュー');
  parent.appendChild(renderer.domElement);
  let disposed=false,frame=0,linked=false;
  const dof=createShootingDOF({THREE,renderer,camera,scene:host.scene});
  const focusAudit=createFocusRenderAudit({notify:detail=>win.dispatchEvent(new CustomEvent('bai:diagnostic',{detail}))});
  const onFocusSnapshot=e=>focusAudit.setDiagnostic(e.detail);
  win.addEventListener('bai:camera-focus-snapshot',onFocusSnapshot);
  const unregisterDof=win.BAIStudioCameraProjectRuntime?.registerFocusRenderer?.(settings=>{const result=dof?.setFocus(settings)||{applied:false};if(result.applied)focusAudit.setRendered(settings);invalidate();return result;})||(()=>{});
  const onDiagnostic=e=>{const opts=e?.detail||{};dof?.setDiagnosticMode(Boolean(opts.enabled),{tolerance:opts.tolerance??0.1});invalidate();};
  win.addEventListener('bai:shooting-focus-color-mode',onDiagnostic);
  const unregister=cameraRuntime.registerShootingCamera(camera,{navigationCamera:navigation});
  const unregisterLens=win.BAIStudioCameraLensRuntime?.register(camera,{navigationCamera:navigation}) || (()=>{});
  const measure=()=>{const w=Math.max(1,parent.clientWidth),h=Math.max(1,parent.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
  const draw=()=>{frame=0;if(disposed)return;measure();if(dof && (dof.status().enabled||dof.status().diagnostic))dof.render(Math.round(parent.clientWidth*renderer.getPixelRatio()),Math.round(parent.clientHeight*renderer.getPixelRatio()));else renderer.render(host.scene,camera);};
  function invalidate(){if(disposed||frame)return;frame=win.requestAnimationFrame(draw);}
  const offInvalidate=host.onInvalidate?.(invalidate);
  const onPose=()=>{linked=true;invalidate();};
  win.addEventListener('bai:camera-pose-evaluated',onPose);
  const observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(invalidate):null;
  observer?.observe(parent);
  const previous=cameraRuntime.status?.().last;
  if(previous?.pose){cameraRuntime.apply(previous.pose,previous.meta);linked=true;}
  invalidate();
  return Object.freeze({camera,invalidate,status:()=>({linked,disposed}),dispose(){if(disposed)return;disposed=true;win.removeEventListener('bai:camera-pose-evaluated',onPose);win.removeEventListener('bai:shooting-focus-color-mode',onDiagnostic);win.removeEventListener('bai:camera-focus-snapshot',onFocusSnapshot);observer?.disconnect();offInvalidate?.();unregisterDof();dof?.dispose();unregisterLens();unregister();if(frame)win.cancelAnimationFrame(frame);renderer.dispose();renderer.domElement.remove();}});
}
