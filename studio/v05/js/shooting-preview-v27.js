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
  const unregister=cameraRuntime.registerShootingCamera(camera,{navigationCamera:navigation});
  const measure=()=>{const w=Math.max(1,parent.clientWidth),h=Math.max(1,parent.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
  const draw=()=>{frame=0;if(disposed)return;measure();renderer.render(host.scene,camera);};
  function invalidate(){if(disposed||frame)return;frame=win.requestAnimationFrame(draw);}
  const offInvalidate=host.onInvalidate?.(invalidate);
  const onPose=()=>{linked=true;invalidate();};
  win.addEventListener('bai:camera-pose-evaluated',onPose);
  const observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(invalidate):null;
  observer?.observe(parent);
  const previous=cameraRuntime.status?.().last;
  if(previous?.pose){cameraRuntime.apply(previous.pose,previous.meta);linked=true;}
  invalidate();
  return Object.freeze({camera,invalidate,status:()=>({linked,disposed}),dispose(){if(disposed)return;disposed=true;win.removeEventListener('bai:camera-pose-evaluated',onPose);observer?.disconnect();offInvalidate?.();unregister();if(frame)win.cancelAnimationFrame(frame);renderer.dispose();renderer.domElement.remove();}});
}
