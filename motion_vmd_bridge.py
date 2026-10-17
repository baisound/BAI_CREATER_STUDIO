"""Explicitly mapped animation channels -> VMD, for inspection, not auto retargeting.

Only mapped bones are exported. Input GLB must have embedded buffers, while BVH
uses the order of its declared rotation channels. Output uses MMD 30fps timing.
"""
import json, math, struct, argparse
from pathlib import Path
from motion_interchange import analyze_motion
from vmd_readback import compare_vmd_bones


def mul(a,b):
    w,x,y,z=a; v,i,j,k=b
    return (w*v-x*i-y*j-z*k,w*i+x*v+y*k-z*j,w*j-x*k+y*v+z*i,w*k+x*j-y*i+z*v)

def axis_quat(axis, deg):
    rad=math.radians(deg)/2; a=math.sin(rad)
    return {'X':(math.cos(rad),a,0,0),'Y':(math.cos(rad),0,a,0),'Z':(math.cos(rad),0,0,a)}[axis]

def normalize(q):
    length=math.sqrt(sum(x*x for x in q))
    if length<1e-9:raise ValueError('Zero quaternion')
    return tuple(x/length for x in q)

def euler_channels_to_quat(ordered):
    q=(1.,0.,0.,0.)
    for name,angle in ordered:
        q=mul(q,axis_quat(name[0].upper(),angle))
    return normalize(q)

def pack_name(s,width):
    encoded=s.encode('cp932')
    if len(encoded)>width-1:raise ValueError(f'VMD bone name too long: {s}')
    return encoded+b'\x00'*(width-len(encoded))

def convert(source, bone_map, output, fps=30, scale=1., model_name='BAI Creator Studio', start_frame=0):
    if fps!=30:raise ValueError('Standard MMD VMD timeline requires 30fps in this bridge')
    if not isinstance(bone_map,dict) or not bone_map:raise ValueError('Explicit nonempty bone_map required')
    if not math.isfinite(scale) or not 0<scale<100:raise ValueError('Invalid scale')
    if Path(source).suffix.lower()=='.json':
        data=json.loads(Path(source).read_text(encoding='utf-8'))
        if data.get('format')!='FBX' or data.get('schema')!=1 or not isinstance(data.get('channels'),list):
            raise ValueError('Expected Blender FBX interchange JSON')
    else:
        data=analyze_motion(source)
    if data.get('format') not in ('BVH','GLB','FBX') or not data.get('channels'):
        raise ValueError('No supported motion channels; FBX requires Blender extraction to JSON')
    tracks={}; warnings=[]
    for c in data['channels']:
        node=c['node']; target=bone_map.get(node)
        if target is None:continue
        if c['path'] in ('translation','rotation'):
            for k in c['keys']:
                t=k['time'];f=start_frame+round(t*fps)
                value=k['value']; field='translation' if c['path']=='translation' else 'rotation'
                tracks.setdefault((target,f),{})[field]=value
        elif c['path'].endswith('rotation') and c['path'][0].upper() in 'XYZ':
            for k in c['keys']:
                f=start_frame+round(k['time']*fps)
                tracks.setdefault((target,f),{}).setdefault('bvh_rot',[]).append((c['path'],k['value'][0]))
        elif c['path'].endswith('position') and c['path'][0].upper() in 'XYZ':
            for k in c['keys']:
                f=start_frame+round(k['time']*fps)
                tracks.setdefault((target,f),{}).setdefault('bvh_pos',{})[c['path'][0].upper()]=k['value'][0]
    if not tracks:raise ValueError('No tracks matched explicit bone map')
    records=[]
    for (target,frame),values in sorted(tracks.items(),key=lambda x:(x[0][1],x[0][0])):
        pos=values.get('translation',[0,0,0]);rot=values.get('rotation',[0,0,0,1]);
        if 'bvh_pos' in values:pos=[values['bvh_pos'].get(ax,0) for ax in 'XYZ']
        if 'bvh_rot' in values:
            w,x,y,z=euler_channels_to_quat(values['bvh_rot']);rot=[x,y,z,w]
        if len(pos)!=3 or len(rot)!=4:raise ValueError('Invalid channel width')
        rot=normalize((rot[3],rot[0],rot[1],rot[2]))
        rot=[rot[1],rot[2],rot[3],rot[0]]
        if not all(math.isfinite(v) for v in [*pos,*rot]):raise ValueError('Nonfinite key')
        records.append((target,frame,[v*scale for v in pos],rot))
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    header=pack_name('Vocaloid Motion Data 0002',30)+pack_name(model_name,20)
    interpolation=bytes([20,20,107,107])*16
    with output.open('wb') as fd:
        fd.write(header);fd.write(struct.pack('<I',len(records)))
        for target,frame,pos,rot in records:
            fd.write(pack_name(target,15));fd.write(struct.pack('<I3f4f',frame,*pos,*rot));fd.write(interpolation)
        for _ in range(5):fd.write(struct.pack('<I',0))
    report={'status':'exported_requires_pmx_visual_validation','source':str(source),'output':str(output),'bone_keys':len(records),'matched_bones':sorted(set(r[0] for r in records)), 'warnings':['Raw channel coordinates are NOT PMX calibrated. Check axes, reference pose, IK and root translation before use.','VMD is not a universal skeleton animation format; explicit bone mapping alone cannot resolve bind pose differences.',*data.get('warnings',[])]}
    report['binary_readback']=compare_vmd_bones(output,records)
    output.with_suffix('.report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--bone-map',required=True);ap.add_argument('--output',required=True);ap.add_argument('--scale',type=float,default=1.)
    args=ap.parse_args(); print(json.dumps(convert(args.source,json.loads(Path(args.bone_map).read_text(encoding='utf-8')),args.output,scale=args.scale),ensure_ascii=False,indent=2))
