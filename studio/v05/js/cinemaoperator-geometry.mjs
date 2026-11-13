/* Read evaluated world vertices, using Three's own morph+skin implementation. */
function bytes(array){
 const data=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);let out='';
 for(let i=0;i<data.length;i+=16384)out+=String.fromCharCode(...data.subarray(i,i+16384));
 return btoa(out);
}
function textureImage(map){
 if(!map)return null;
 const image=map.image;if(!image?.width||!image?.height)throw Error('テクスチャを読み込めません。登録素材と参照画像を確認してください。');
 const scale=Math.min(1,4096/Math.max(image.width,image.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
 const ctx=canvas.getContext('2d');
 if(image.data){
  if(scale!==1)throw Error('大きなDataTextureは撮影コピーに未対応です。');
  if(!(image.data instanceof Uint8Array)||![3,4].includes(image.data.length/(image.width*image.height)))throw Error('このテクスチャ形式は撮影コピーに未対応です。');
  const channels=image.data.length/(image.width*image.height),rgba=new Uint8ClampedArray(image.width*image.height*4);
  for(let i=0;i<image.width*image.height;i++){rgba.set(image.data.subarray(i*channels,i*channels+3),i*4);rgba[i*4+3]=channels===4?image.data[i*channels+3]:255;}
  ctx.putImageData(new ImageData(rgba,image.width,image.height),0,0);
 }else ctx.drawImage(image,0,0,canvas.width,canvas.height);
 return canvas.toDataURL('image/png');
}
const rgba=m=>[...(m.color?.toArray()||[1,1,1]),m.opacity??1];
export async function evaluatedGeometry(instances,getLoaded,{topology=false}={}){
 if(topology){
  const maps=new Set();
  for(const instance of instances)getLoaded(instance.id)?.root?.traverse(o=>{if(o.isMesh)for(const material of Array.isArray(o.material)?o.material:[o.material])if(material.map)maps.add(material.map);});
  const deadline=Date.now()+30000;
  while([...maps].some(map=>!map.image?.width||!map.image?.height)){if(Date.now()>deadline)throw Error('テクスチャを読み込めません。登録素材と参照画像を確認してください。');await new Promise(resolve=>setTimeout(resolve,25));}
  await Promise.all([...maps].map(map=>typeof map.image.decode==='function'?map.image.decode():undefined));
 }
 const meshes=[];let vertexCount=0,uvValues=0,textureBytes=0;
 for(const instance of instances){
  const target=getLoaded(instance.id);if(!target?.root)throw Error('撮影するモデルを読み込めません。');
  const THREE=target.libs.THREE;target.root.updateWorldMatrix(true,true);let meshIndex=0;
  target.root.traverse(object=>{
   if(!object.isMesh)return;
   if(object.isInstancedMesh||!object.geometry?.attributes.position)throw Error('このメッシュ形式は撮影コピーに未対応です。');
   const geometry=object.geometry,count=geometry.attributes.position.count;vertexCount+=count;
   if(vertexCount>1000000||meshes.length>=256)throw Error('頂点100万・メッシュ256個以内になるよう、対象モデルを減らして準備してください。');
   object.skeleton?.update();const p=new THREE.Vector3(),positions=new Float32Array(count*3);
   for(let i=0;i<count;i++){
    object.getVertexPosition(i,p).applyMatrix4(object.matrixWorld);
    positions.set([p.x,-p.z,p.y],i*3);
   }
   if(!positions.every(Number.isFinite))throw Error('モデルの評価済み頂点に不正な値があります。');
   let visible=true;for(let n=object;n;n=n.parent)visible=visible&&n.visible;
   const materials=Array.isArray(object.material)?object.material:[object.material];
   uvValues+=count*2;
   if(materials.length>256||uvValues>4000000)throw Error('撮影コピーの材質やUVが多すぎます。対象モデルを減らして準備してください。');
   const row={id:instance.id+':mesh-'+meshIndex++,instance_id:instance.id,name:object.name||'Mesh',count,
    positions:bytes(positions),visible,colors:materials.map(rgba)};
   {
    const index=geometry.index?Array.from(geometry.index.array):Array.from({length:count},(_,i)=>i);
    if(index.length%3||index.some(i=>!Number.isInteger(i)||i<0||i>=count))throw Error('三角形メッシュが必要です。');
    const uv=geometry.attributes.uv;
    const groups=geometry.groups.map(g=>({...g}));
    const fixed={indices:index,groups,uv:geometry.attributes.uv?Array.from(geometry.attributes.uv.array):null};
    row.topology_source=fixed;
    if(topology){row.indices=index;row.groups=groups;
    row.uv=uv?Array.from({length:count},(_,i)=>[uv.getX(i),uv.getY(i)]):null;
    const images=new Map();
    row.materials=materials.map(m=>{
      const map=m.map;if(map)map.updateMatrix();let png=null;
      if(map){
       if(images.has(map.image))png=images.get(map.image);
       else{png=textureImage(map);textureBytes+=png?.length||0;if(textureBytes>64*1024*1024)throw Error('撮影コピーのテクスチャが多すぎます。対象モデルやテクスチャのサイズを減らしてください。');images.set(map.image,png);}
      }
      return {color:rgba(m),side:m.side,alphaTest:m.alphaTest||0,map:png,uv_matrix:map?map.matrix.toArray():[1,0,0,0,1,0,0,0,1],flip_y:map?!map.flipY:false};
    });
    }
   }
   meshes.push(row);
  });
 }
 if(!meshes.length)throw Error('撮影するメッシュがありません。');
 for(const row of meshes){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(row.topology_source)));row.topology_sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');delete row.topology_source;}
 return {meshes,vertex_count:vertexCount};
}
