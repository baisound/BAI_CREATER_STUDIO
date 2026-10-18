"""Read-only native MMD camera interpolation. No camera-space conversion.

Camera interpolation layout contains six groups of four bytes:
X,Y,Z,rotation,distance,view angle. Each group is x1,y1,x2,y2 in [0,127].
"""
from bisect import bisect_left
import math
from camera_vmd_codec import MAX_KEYS

FIELDS=('x','y','z','rotation','distance','fov')

def bezier_progress(u, control):
    if not 0 <= u <= 1 or not math.isfinite(u):
        raise ValueError('invalid progress')
    if len(control)!=4 or any(type(n)!=int or n<0 or n>127 for n in control):
        raise ValueError('invalid MMD camera interpolation point')
    x1,y1,x2,y2=(v/127 for v in control)
    def cubic(t,a,b):return 3*(1-t)**2*t*a+3*(1-t)*t*t*b+t**3
    lo,hi=0.,1.
    for _ in range(36):
        mid=(lo+hi)/2
        if cubic(mid,x1,x2)<u:lo=mid
        else:hi=mid
    return cubic((lo+hi)/2,y1,y2)

def sample_native_camera(track, frame):
    """Return interpolated MMD-local values (not converted to Three.js).

    MMD VMD destination-key interpolation governs the segment entering that key.
    Angular interpolation is linear in Euler channels following MMD's convention.
    """
    if not isinstance(track,dict) or track.get('format')!='mmd-vmd-camera-native-v1':
        raise ValueError('invalid track format')
    keys=track.get('keys')
    if not isinstance(keys,list) or not keys or len(keys)>MAX_KEYS:
        raise ValueError('camera track has no usable keys')
    if isinstance(frame,bool) or not isinstance(frame,(int,float)) or not math.isfinite(frame) or frame<0:
        raise ValueError('invalid frame')
    frames=[k['frame'] for k in keys]
    if frames!=sorted(set(frames)):
        raise ValueError('keys must be sorted and unique')
    i=bisect_left(frames,frame)
    def value(k):return {'frame':frame,'target':list(k['target']),'rotation':list(k['rotation']),'distance':k['distance'],'fov':k['fov'],'perspective':k['perspective'],'coordinate_space':'MMD'}
    if i==0:return value(keys[0])
    if i==len(keys):return value(keys[-1])
    if frames[i]==frame:return value(keys[i])
    a,b=keys[i-1],keys[i]
    u=(frame-a['frame'])/(b['frame']-a['frame'])
    interp=b['interpolation']
    if len(interp)!=24:raise ValueError('invalid interpolation data')
    t=[bezier_progress(u,interp[j*4:j*4+4]) for j in range(6)]
    lerp=lambda av,bv,f:av+(bv-av)*f
    return {'frame':frame,'target':[lerp(a['target'][j],b['target'][j],t[j]) for j in range(3)],
            'rotation':[lerp(a['rotation'][j],b['rotation'][j],t[3]) for j in range(3)],
            'distance':lerp(a['distance'],b['distance'],t[4]),
            'fov':lerp(a['fov'],b['fov'],t[5]),
            'perspective':a['perspective'],'coordinate_space':'MMD'}
