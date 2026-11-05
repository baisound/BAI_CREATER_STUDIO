"""Read-only, bounded MMD VMD 0002 camera metadata inspection.

This does not transform MMD coordinates into the application's camera axes.
MMD perspective flag and interpolation bytes are preserved for inspection only.
"""
import math
import struct

CAM_SIZE=61
BONE_SIZE=111
MORPH_SIZE=23
MAX_INPUT=32*1024*1024

def inspect_camera_vmd(raw):
    if not isinstance(raw,bytes) or len(raw)>MAX_INPUT:raise ValueError('VMD input invalid or too large')
    if len(raw)<58 or not raw[:30].rstrip(b'\x00').startswith(b'Vocaloid Motion Data 0002'):
        raise ValueError('unsupported or truncated VMD header')
    model_name=raw[30:50].split(b'\0')[0].decode('cp932',errors='replace')
    offset=50
    def count_and_skip(record_size, label):
        nonlocal offset
        if len(raw)<offset+4:raise ValueError('truncated '+label+' count')
        count=struct.unpack_from('<I',raw,offset)[0];offset+=4
        if count>(len(raw)-offset)//record_size:raise ValueError('truncated '+label+' records')
        start=offset;offset+=count*record_size
        return count,start
    bones,_=count_and_skip(BONE_SIZE,'bone')
    morphs,_=count_and_skip(MORPH_SIZE,'morph')
    count,start=count_and_skip(CAM_SIZE,'camera')
    if count>100000:raise ValueError('too many camera records')
    frames=[];projections=set();ranges=[]
    for i in range(count):
        off=start+i*CAM_SIZE
        frame,distance,x,y,z,rx,ry,rz=struct.unpack_from('<I7f',raw,off)
        fov=struct.unpack_from('<I',raw,off+56)[0]
        perspective=raw[off+60]
        if not all(math.isfinite(v) for v in (distance,x,y,z,rx,ry,rz)):
            raise ValueError('nonfinite camera key')
        if not 1<=fov<=180 or perspective not in (0,1):raise ValueError('invalid camera projection')
        frames.append(frame);projections.add(perspective);ranges.append([distance, fov])
    return {'vmd_version':'0002','model_name':model_name,'bone_count':bones,'morph_count':morphs,
            'camera_count':count,'first_camera_frame':min(frames) if frames else None,
            'last_camera_frame':max(frames) if frames else None,
            'projection_flags':sorted(projections),
            'distance_range':[min(v[0] for v in ranges),max(v[0] for v in ranges)] if ranges else None,
            'fov_range':[min(v[1] for v in ranges),max(v[1] for v in ranges)] if ranges else None,
            'frames':sorted(frames),
            'converted_to_bai_camera':False,
            'warning':'Read-only inspection. MMD Euler rotation, target/distance axes and per-channel Bezier require explicit transformation before importing.'}
