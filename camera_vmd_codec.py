"""Lossless MMD camera-key record import/export (VMD 0002).

Coordinates remain in native MMD space. No implicit BAI coordinate transform is applied.
This module is a safe round-trip foundation, NOT a camera playback bridge.
"""
import math
import struct
from camera_vmd_inspect import MAX_INPUT, CAM_SIZE, BONE_SIZE, MORPH_SIZE

HEADER=b'Vocaloid Motion Data 0002'.ljust(30,b'\0')
MAX_KEYS=100000

def decode_camera_track(raw):
    if not isinstance(raw,bytes) or len(raw)<54 or len(raw)>MAX_INPUT or raw[:30]!=HEADER:
        raise ValueError('unsupported or oversized VMD 0002')
    pos=50
    def skip(size,label):
        nonlocal pos
        if pos+4>len(raw):raise ValueError('truncated '+label)
        n=struct.unpack_from('<I',raw,pos)[0];pos+=4
        if n>(len(raw)-pos)//size:raise ValueError('truncated '+label+' records')
        pos+=n*size
        return n
    if skip(BONE_SIZE,'bone') or skip(MORPH_SIZE,'morph'):
        raise ValueError('camera-track import requires a camera-only VMD')
    if pos+4>len(raw):raise ValueError('missing camera count')
    count=struct.unpack_from('<I',raw,pos)[0];pos+=4
    if count>MAX_KEYS or count>(len(raw)-pos)//CAM_SIZE:raise ValueError('invalid camera record count')
    result=[]
    for i in range(count):
        frame, distance,x,y,z,rx,ry,rz=struct.unpack_from('<I7f',raw,pos)
        interpolation=raw[pos+32:pos+56]
        fov,perspective=struct.unpack_from('<IB',raw,pos+56)
        if not all(math.isfinite(v) for v in (distance,x,y,z,rx,ry,rz)) or not 1<=fov<=180 or perspective not in (0,1):
            raise ValueError('invalid camera record')
        result.append({'frame':frame,'distance':distance,'target':[x,y,z],'rotation':[rx,ry,rz], 'interpolation':list(interpolation),'fov':fov,'perspective':perspective})
        pos+=CAM_SIZE
    # Camera-only export intentionally excludes lights, shadows and IK portions.
    if pos!=len(raw):raise ValueError('VMD has trailing non-camera sections; lossless camera-only import unavailable')
    if len({k['frame'] for k in result})!=len(result):raise ValueError('duplicate camera keyframes')
    return {'format':'mmd-vmd-camera-native-v1','keys':sorted(result,key=lambda k:k['frame']), 'coordinate_space':'MMD','units':'MMD model units','fps':30}

def encode_camera_track(track):
    if not isinstance(track,dict) or track.get('format')!='mmd-vmd-camera-native-v1':raise ValueError('invalid native camera track')
    keys=track.get('keys')
    if not isinstance(keys,list) or len(keys)>MAX_KEYS:raise ValueError('invalid camera keys')
    records=[];seen=set()
    for key in keys:
        if not isinstance(key,dict):raise ValueError('invalid key')
        frame=key.get('frame')
        if isinstance(frame,bool) or not isinstance(frame,int) or not 0<=frame<=4294967295 or frame in seen:raise ValueError('invalid frame')
        seen.add(frame)
        vectors=[key.get('target'),key.get('rotation')]
        if any(not isinstance(v,list) or len(v)!=3 or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or abs(x)>100000 for x in v) for v in vectors):raise ValueError('invalid vector')
        distance=key.get('distance');fov=key.get('fov');perspective=key.get('perspective');interp=key.get('interpolation')
        if isinstance(distance,bool) or not isinstance(distance,(int,float)) or not math.isfinite(distance) or abs(distance)>100000:raise ValueError('invalid distance')
        if isinstance(fov,bool) or not isinstance(fov,int) or not 1<=fov<=180 or perspective not in (0,1) or not isinstance(interp,list) or len(interp)!=24 or any(type(x)!=int or not 0<=x<=255 for x in interp):raise ValueError('invalid projection/interpolation')
        records.append(struct.pack('<I7f',frame,float(distance),*[float(x) for x in vectors[0]],*[float(x) for x in vectors[1]])+bytes(interp)+struct.pack('<IB',fov,perspective))
    raw=HEADER+b'Camera'.ljust(20,b'\0')+struct.pack('<III',0,0,len(keys))+b''.join(records)
    if len(raw)>MAX_INPUT:raise ValueError('VMD output too large')
    return raw
