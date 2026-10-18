/** Non-destructive camera bone-follow preferences. No keyframe mutations. */
export const FOLLOW_STORAGE_KEY='bai-camera-follow-v1';
export const ALIASES={head:['head','j_head','頭'],neck:['neck','首'],chest:['chest','upperchest','spine2','胸','上半身2'],hips:['hips','pelvis','hip','センター','下半身']};
export function classifyBone(name){const n=String(name||'').toLowerCase().replace(/[\s_.-]/g,'');for(const [role,names] of Object.entries(ALIASES)){if(names.some(alias=>n===alias.toLowerCase().replace(/[\s_.-]/g,'')))return role}return null}
export function parseOffset(values){if(!Array.isArray(values)||values.length!==3||!values.every(v=>Number.isFinite(Number(v))&&String(v).trim()!==''&&Math.abs(Number(v))<=10000))throw Error('XYZオフセットは有限数値3件（±10000以内）です');return values.map(Number)}
export function validFollowConfig(input){const config=input&&typeof input==='object'?input:{};return {boneName:typeof config.boneName==='string'?config.boneName.slice(0,256):'',role:['head','neck','chest','hips'].includes(config.role)?config.role:'',offset:parseOffset(config.offset??[0,0,0]),enabled:config.enabled===true}}
export function pickBone(nodes,config){return nodes.find(n=>n.name===config.boneName)||nodes.find(n=>classifyBone(n.name)===config.role)||null}
