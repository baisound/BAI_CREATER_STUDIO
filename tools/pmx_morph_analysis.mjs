// Read-only PMX mouth morph measurements. No name is guessed to be a vowel.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MMDParser} from '../node_modules/three/examples/jsm/libs/mmdparser.module.js';
export {strengthCandidates} from '../studio/v05/js/pmx-morph-strength.mjs';

const percentile=(sorted,p)=>{
  if(!sorted.length)return 0;
  const at=(sorted.length-1)*p,lo=Math.floor(at),hi=Math.ceil(at);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(at-lo);
};

export function analyzeMouthMorphs(pmx){
  if(!pmx||!Array.isArray(pmx.morphs)||!Number.isSafeInteger(pmx.metadata?.vertexCount))
    throw new Error('Invalid PMX morph data');
  const entries=[];
  const vertices=new Map();
  for(let id=0;id<pmx.morphs.length;id++){
    const morph=pmx.morphs[id];
    if(morph.panel!==3)continue;
    if(entries.length>=256)throw new Error('Too many PMX mouth morphs');
    const item={id,name:morph.name,type:morph.type,elementCount:morph.elements.length,
      affectedVertices:0,median:0,p95:0,manualRequired:morph.type!==1};
    if(morph.type===1){
      const sums=new Map();
      for(const element of morph.elements){
        const index=element.index,delta=element.position;
        if(!Number.isSafeInteger(index)||index<0||index>=pmx.metadata.vertexCount||
           !Array.isArray(delta)||delta.length!==3||delta.some(v=>!Number.isFinite(v)))
          throw new Error('Invalid PMX vertex morph offset');
        const previous=sums.get(index)||[0,0,0];
        sums.set(index,previous.map((v,i)=>v+delta[i]));
      }
      const lengths=[];
      const moved=new Set();
      for(const [index,delta] of sums){
        const length=Math.hypot(...delta);
        if(!Number.isFinite(length))throw new Error('Invalid PMX vertex morph length');
        if(length>0){lengths.push(length);moved.add(index);}
      }
      lengths.sort((a,b)=>a-b);
      item.affectedVertices=moved.size;
      item.median=percentile(lengths,0.5);
      item.p95=percentile(lengths,0.95);
      item.manualRequired=lengths.length===0;
      vertices.set(id,moved);
    }
    entries.push(item);
  }
  const overlaps=[];
  const vertexEntries=entries.filter(row=>row.type===1&&row.affectedVertices);
  for(let a=0;a<vertexEntries.length;a++)for(let b=a+1;b<vertexEntries.length;b++){
    const left=vertexEntries[a],right=vertexEntries[b];
    const ls=vertices.get(left.id),rs=vertices.get(right.id);
    let shared=0;
    for(const index of ls)if(rs.has(index))shared++;
    overlaps.push({leftId:left.id,rightId:right.id,sharedVertices:shared,
      unionVertices:ls.size+rs.size-shared,
      jaccard:shared/(ls.size+rs.size-shared)});
  }
  return {schema:1,vertexCount:pmx.metadata.vertexCount,morphs:entries,overlaps};
}

export function analyzePmxBytes(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length>300*1024*1024)
    throw new Error('PMX input is unavailable or too large');
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const analysis=analyzeMouthMorphs(new MMDParser.Parser().parsePmx(buffer,true));
  return {...analysis,
    modelHash:crypto.createHash('sha256').update(bytes).digest('hex'),
    analysisHash:crypto.createHash('sha256').update(JSON.stringify(analysis)).digest('hex')};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3)process.exit(2);
  process.stdout.write(JSON.stringify(analyzePmxBytes(fs.readFileSync(process.argv[2]))));
}
