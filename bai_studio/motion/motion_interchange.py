"""Read-only animation channel extractor. Does not imply MMD-ready retargeting."""
import json, math, re, struct
from pathlib import Path

def glb_channels(data, max_keys=120000):
    if len(data)<28 or data[:4]!=b'glTF':raise ValueError('GLB header invalid')
    _,version,total=struct.unpack_from('<4sII',data)
    if version!=2 or total>len(data):raise ValueError('GLB version/length invalid')
    size,kind=struct.unpack_from('<II',data,12)
    if kind!=0x4e4f534a or size>8_000_000:raise ValueError('GLB JSON chunk invalid')
    doc=json.loads(data[20:20+size]);off=20+size
    if off+8>len(data):raise ValueError('GLB BIN chunk missing')
    binlen,binkind=struct.unpack_from('<II',data,off)
    if binkind!=0x004e4942:raise ValueError('External buffers not supported; embed GLB BIN')
    binary=data[off+8:off+8+binlen];accessors=doc.get('accessors',[]);views=doc.get('bufferViews',[])
    def accessor(i):
        a=accessors[i];v=views[a['bufferView']]
        if a.get('sparse') or a.get('normalized') or a['componentType']!=5126:raise ValueError('Only dense FLOAT accessors supported')
        width={'SCALAR':1,'VEC3':3,'VEC4':4}.get(a['type'])
        if width is None:raise ValueError('Unsupported accessor shape')
        count=a['count'];stride=v.get('byteStride',4*width)
        start=v.get('byteOffset',0)+a.get('byteOffset',0)
        if count>max_keys or count<0 or stride<4*width:raise ValueError('Excessive/invalid key count')
        if count and start+(count-1)*stride+4*width>len(binary):raise ValueError('Accessor outside BIN')
        return [list(struct.unpack_from('<'+'f'*width,binary,start+j*stride)) for j in range(count)]
    nodes=doc.get('nodes',[]);results=[]
    for ai,anim in enumerate(doc.get('animations',[])):
        for channel in anim.get('channels',[]):
            target=channel['target'];path=target.get('path');idx=target.get('node',-1)
            if path not in ('translation','rotation','scale') or not 0<=idx<len(nodes):continue
            sampler=anim['samplers'][channel['sampler']];mode=sampler.get('interpolation','LINEAR')
            if mode not in ('LINEAR','STEP'):continue
            times=accessor(sampler['input']);values=accessor(sampler['output'])
            if len(times)!=len(values) or any(not math.isfinite(v) for row in times+values for v in row):raise ValueError('Invalid animation keys')
            results.append({'clip':anim.get('name',f'animation_{ai}'),'node':nodes[idx].get('name',f'node_{idx}'),'node_index':idx,'path':path,'interpolation':mode,'keys':[{'time':t[0],'value':v} for t,v in zip(times,values)]})
    return {'format':'GLB','schema':1,'channels':results,'channel_count':len(results),'warnings':['CUBICSPLINE and morph weight channels are not converted','Coordinates remain in source GLB local space; no PMX correction has been applied']}

def bvh_channels(data,max_frames=20000):
    lines=data.decode('utf-8-sig',errors='replace').splitlines()
    stack=[];pending=None;offsets={};channels=[];motion_line=None
    for i,line in enumerate(lines):
        s=line.strip()
        if s=='MOTION':motion_line=i;break
        m=re.match(r'^(ROOT|JOINT)\s+(.+)$',s)
        if m:pending=m.group(2).strip();continue
        if s=='{':
            if pending is not None:stack.append(pending);pending=None
            else:stack.append(None)
        elif s=='}':
            if stack:stack.pop()
        elif s.startswith('CHANNELS '):
            p=s.split();n=int(p[1]);name='/'.join(x for x in stack if x)
            if not name or n!=len(p[2:]):raise ValueError('Malformed BVH CHANNELS')
            for cname in p[2:]:channels.append((name,cname))
    if motion_line is None:raise ValueError('BVH MOTION missing')
    header='\n'.join(lines[motion_line+1:motion_line+6]);fm=re.search(r'Frames:\s*(\d+)',header);tm=re.search(r'Frame Time:\s*([0-9.]+)',header)
    if not fm or not tm:raise ValueError('BVH frame header missing')
    count=int(fm.group(1));step=float(tm.group(1));
    if count>max_frames or step<=0 or not math.isfinite(step):raise ValueError('BVH frame count/time invalid')
    frame_start=next(i for i in range(motion_line+1,len(lines)) if 'Frame Time:' in lines[i])+1
    rows=[]
    for line in lines[frame_start:]:
        if not line.strip():continue
        vals=list(map(float,line.split()))
        if len(vals)!=len(channels):raise ValueError('BVH channel count mismatch')
        if not all(math.isfinite(x) for x in vals):raise ValueError('Nonfinite BVH frame')
        rows.append(vals)
        if len(rows)==count:break
    if len(rows)!=count:raise ValueError('Incomplete BVH frames')
    out={}
    for ci,(bone,ctype) in enumerate(channels):
        key=(bone,ctype);out[key]=[{'time':round(f*step,9),'value':[row[ci]]} for f,row in enumerate(rows)]
    return {'schema':1,'format':'BVH','channels':[{'clip':'BVH Motion','node':k[0],'path':k[1],'interpolation':'LINEAR','keys':v} for k,v in out.items()],'channel_count':len(out),'warnings':['Euler rotations retain BVH channel order and degrees; conversion to target quaternion requires a calibrated skeleton']}

def analyze_motion(path):
    p=Path(path);data=p.read_bytes();fmt=p.suffix.lower()
    if fmt=='.glb':return glb_channels(data)
    if fmt=='.bvh':return bvh_channels(data)
    if fmt=='.fbx':return {'format':'FBX','schema':1,'channels':[],'channel_count':0,'status':'needs_blender_adapter','warnings':['FBX skeletal import exists but complete channel extraction is not yet connected to this API']}
    return {'format':fmt[1:].upper(),'schema':1,'channels':[],'channel_count':0,'status':'unsupported_motion_format','warnings':['This file is a model or lacks supported animation extraction']}
