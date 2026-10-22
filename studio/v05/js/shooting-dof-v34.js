/* GPU depth-aware photographic blur for the shooting preview only.
 * Approximation: not a calibrated optical circle-of-confusion renderer.
 * It uses exactly the camera snapshot handed to the focus runtime. */
export function createShootingDOF({THREE,renderer,camera,scene}) {
  if(!THREE?.DepthTexture || !THREE?.WebGLRenderTarget || !THREE?.ShaderMaterial || !THREE?.Scene || !THREE?.Mesh || !THREE?.PlaneGeometry || !THREE?.OrthographicCamera || !renderer?.setRenderTarget) return null;
  let width=0,height=0,target=null,disposed=false;
  let settings=null;
  const uniforms={tColor:{value:null},tDepth:{value:null},resolution:{value:new THREE.Vector2(1,1)},near:{value:camera.near},far:{value:camera.far},focus:{value:1},aperture:{value:0},enabled:{value:0}};
  const material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms,vertexShader:`varying vec2 uv0; void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader:`varying vec2 uv0; uniform sampler2D tColor,tDepth;uniform vec2 resolution;uniform float near,far,focus,aperture,enabled;
  float linearDepth(vec2 uv){float z=texture2D(tDepth,uv).x*2.-1.;return 2.*near*far/max(0.0001,(far+near-z*(far-near)));}
  void main(){vec4 base=texture2D(tColor,uv0);if(enabled<0.5){gl_FragColor=base;return;}
   float d=linearDepth(uv0);float coc=clamp(abs(d-focus)/max(d,0.01)*aperture,0.,7.);
   vec2 px=coc/resolution;vec3 rgb=base.rgb;float w=1.;
   for(int x=-2;x<=2;x++){for(int y=-2;y<=2;y++){if(x==0&&y==0)continue;
    vec2 u=clamp(uv0+vec2(float(x),float(y))*px*.45,vec2(0.),vec2(1.));
    float other=linearDepth(u);float weight=other<d&&other<focus?0.15:1.;
    rgb+=texture2D(tColor,u).rgb*weight;w+=weight;}}
   gl_FragColor=vec4(rgb/w,base.a);}`});
  const passScene=new THREE.Scene();const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);passScene.add(quad);
  const passCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  function measure(w,h){w=Math.max(1,Math.floor(w));h=Math.max(1,Math.floor(h));if(w===width&&h===height)return;width=w;height=h;target?.dispose();target=new THREE.WebGLRenderTarget(w,h,{depthBuffer:true});target.depthTexture=new THREE.DepthTexture(w,h);uniforms.tColor.value=target.texture;uniforms.tDepth.value=target.depthTexture;uniforms.resolution.value.set(w,h);}
  function setFocus(next){if(!next || !Number.isFinite(next.focusDistance)||next.focusDistance<=0||!Number.isFinite(next.fStop)||next.fStop<=0||!Number.isFinite(next.focalLengthMm)||next.focalLengthMm<=0){settings=null;uniforms.enabled.value=0;return {applied:false,reason:'invalid_focus'};}
   settings={...next};uniforms.focus.value=next.focusDistance;uniforms.aperture.value=Math.min(20,(next.focalLengthMm/50)**2*2.8/next.fStop*4);uniforms.enabled.value=1;return {applied:true};}
  function render(w,h){if(disposed)throw new Error('DOF disposed');measure(w,h);uniforms.near.value=camera.near;uniforms.far.value=camera.far;
    const prior=renderer.getRenderTarget?.()??null;
    try{renderer.setRenderTarget(target);renderer.clear?.();renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(passScene,passCamera);}finally{renderer.setRenderTarget(prior);}}
  function dispose(){if(disposed)return;disposed=true;target?.dispose();quad.geometry.dispose();material.dispose();}
  return {setFocus,render,dispose,status:()=>({enabled:!!settings,disposed,method:'gpu-depth-approximation'})};
}
