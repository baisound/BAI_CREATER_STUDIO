"""Offline skeleton metadata inspector. No claim of fully corrected VMD export."""
import json,struct,re,unicodedata
from pathlib import Path

ALIASES={
'hips':['hips','pelvis','センター','下半身','腰'], 'spine':['spine','spine1','上半身'],
'chest':['chest','spine2','upperchest','上半身2'], 'neck':['neck','首'], 'head':['head','頭'],
'leftUpperArm':['leftarm','leftupperarm','左腕'], 'rightUpperArm':['rightarm','rightupperarm','右腕'],
'leftLowerArm':['leftforearm','leftlowerarm','左ひじ','左肘'], 'rightLowerArm':['rightforearm','rightlowerarm','右ひじ','右肘'],
'leftHand':['lefthand','左手首'], 'rightHand':['righthand','右手首'],
'leftUpperLeg':['leftupleg','leftupperleg','左足'], 'rightUpperLeg':['rightupleg','rightupperleg','右足'],
'leftLowerLeg':['leftleg','leftlowerleg','左ひざ','左膝'], 'rightLowerLeg':['rightleg','rightlowerleg','右ひざ','右膝'],
'leftFoot':['leftfoot','左足首'], 'rightFoot':['rightfoot','右足首']}

def normalized(s):return ''.join(c for c in unicodedata.normalize('NFKC',s).casefold() if c.isalnum()).replace('mixamorig','')
def propose(names):
  mapping={};unmatched=[]
  for role,aliases in ALIASES.items():
    matches=[n for n in names if normalized(n) in {normalized(a) for a in aliases}]
    if len(matches)==1:mapping[role]=matches[0]
    else:unmatched.append(role)
  return mapping,unmatched

def inspect(path):
  p=Path(path);fmt=p.suffix.lower();raw=p.read_bytes();bones=[];clips=[];meta={};warning=[]
  if fmt in ('.glb','.vrm'):
    if len(raw)<20 or raw[:4]!=b'glTF':raise ValueError('GLB header invalid')
    _,ver,length=struct.unpack_from('<4sII',raw)
    if ver!=2 or length>len(raw):raise ValueError('GLB version or length invalid')
    jsonsize,chunktype=struct.unpack_from('<II',raw,12)
    if chunktype!=0x4e4f534a or jsonsize>8_000_000:raise ValueError('GLB JSON chunk unavailable')
    doc=json.loads(raw[20:20+jsonsize].decode('utf-8'))
    nodes=doc.get('nodes',[]);skin_ids=set()
    for skin in doc.get('skins',[]):skin_ids.update(skin.get('joints',[]))
    bones=[nodes[i].get('name',f'node_{i}') for i in sorted(skin_ids) if i<len(nodes)]
    clips=[x.get('name',f'animation_{i}') for i,x in enumerate(doc.get('animations',[]))]
    meta={'nodes':len(nodes),'skins':len(doc.get('skins',[])),'animations':len(clips),'vrm_extension':any(k.startswith('VRM') for k in doc.get('extensions',{}))}
    if not bones:warning.append('Skin joints absent: cannot infer humanoid skeleton')
  elif fmt=='.bvh':
    text=raw[:5_000_000].decode('utf-8',errors='replace')
    bones=re.findall(r'^\s*(?:ROOT|JOINT)\s+([^\s{}]+)',text,re.M)
    match=re.search(r'Frames:\s*(\d+)',text)
    if match:meta['frames']=int(match.group(1));clips=['BVH Motion']
    if 'MOTION' not in text:warning.append('BVH MOTION section missing')
  elif fmt=='.fbx':
    if raw.startswith(b'Kaydara FBX Binary'):
      warning.append('Binary FBX requires Blender SDK/importer for verified skeleton extraction')
    else:
      text=raw[:8_000_000].decode('utf-8',errors='replace')
      bones=list(dict.fromkeys(re.findall(r'Model:\s*[^,]*,\s*"LimbNode"',text)))
      # ASCII FBX parsing is only heuristic; do not invent successful mapping.
      bones=[];warning.append('ASCII FBX: reliable skeleton parsing requires Blender')
  elif fmt=='.pmx':
    if raw[:4]!=b'PMX ':raise ValueError('PMX signature invalid')
    warning.append('PMX bone index/pose extraction requires full PMX parser; metadata only in this phase')
    meta={'signature':'PMX','version':round(struct.unpack_from('<f',raw,4)[0],2)}
  else:raise ValueError('Unsupported skeleton file type')
  mapping,unmatched=propose(bones)
  return {'filename':p.name,'format':fmt[1:].upper(),'size':len(raw),'bone_count':len(bones),'bones':bones[:500], 'clips':clips[:100], 'suggested_mapping':mapping,'unmatched_roles':unmatched,'metadata':meta,'warnings':warning,'status':'inspectable' if bones else 'metadata_only'}

def compare(source,target):
  a=set(source['suggested_mapping']);b=set(target['suggested_mapping'])
  shared=sorted(a&b)
  return {'common_roles':shared,'matched_count':len(shared),'missing_on_source':sorted(b-a),'missing_on_target':sorted(a-b),'needs_manual_review':True,'warning':'Name matching does not compensate bind pose, bone axis, scale, IK or root motion. Not a validated VMD conversion.'}
