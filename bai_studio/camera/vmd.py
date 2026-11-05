"""Bounded, read-only MMD VMD camera key extraction.

Preserves raw camera attributes; preview conversion is deliberately separate.
"""
import math
import struct

MAX_FILE = 16 * 1024 * 1024
MAX_COUNT = 100000
BONE_SIZE = 111
MORPH_SIZE = 23
CAMERA_SIZE = 61


def parse_camera_vmd(blob):
    if not isinstance(blob, bytes) or len(blob) > MAX_FILE or len(blob) < 58:
        raise ValueError('invalid VMD file size')
    if not blob[:30].startswith(b'Vocaloid Motion Data '):
        raise ValueError('not a VMD file')
    offset = 50  # 30-byte signature + 20-byte model label
    def count_and_skip(record_size):
        nonlocal offset
        if offset + 4 > len(blob):
            raise ValueError('truncated VMD section count')
        count, = struct.unpack_from('<I', blob, offset)
        offset += 4
        if count > MAX_COUNT or count * record_size > len(blob) - offset:
            raise ValueError('invalid/truncated VMD section')
        start = offset
        offset += count * record_size
        return count, start
    bones, _ = count_and_skip(BONE_SIZE)
    morphs, _ = count_and_skip(MORPH_SIZE)
    total, start = count_and_skip(CAMERA_SIZE)
    keys = []
    seen = set()
    for i in range(total):
        p = start + i * CAMERA_SIZE
        frame, distance, x, y, z, rx, ry, rz = struct.unpack_from('<I7f', blob, p)
        interp = list(blob[p + 32:p + 56])
        view_angle, perspective = struct.unpack_from('<IB', blob, p + 56)
        if not all(map(math.isfinite, (distance,x,y,z,rx,ry,rz))):
            raise ValueError('non-finite VMD camera value')
        if frame in seen:
            raise ValueError('duplicate VMD camera frame')
        if frame > 1000000 or not 1 <= view_angle <= 180 or perspective not in (0, 1):
            raise ValueError('invalid VMD camera frame, angle or perspective')
        seen.add(frame)
        keys.append({'frame': frame, 'distance': distance,
                     'center':[x,y,z], 'rotation':[rx,ry,rz],
                     'interpolation': interp, 'viewAngle': view_angle,
                     'perspective': perspective})
    keys.sort(key=lambda k: k['frame'])
    return {'format': 'VMD-camera', 'modelName': blob[30:50].split(b'\0')[0].decode('shift_jis','replace'),
            'boneFrames': bones, 'morphFrames': morphs, 'cameraFrames': total,
            'keys': keys, 'preservesRawCameraValues': True,
            'note': 'MMD camera center/distance/rotation are raw values. Browser pose conversion is not yet verified.'}


def _vmd_bezier(progress, control):
    """Invert MMD's cubic x(t), then evaluate y(t) (control bytes x1,y1,x2,y2)."""
    if progress <= 0:
        return 0.0
    if progress >= 1:
        return 1.0
    if len(control) != 4 or any(not isinstance(v, int) or not 0 <= v <= 127 for v in control):
        raise ValueError('invalid camera interpolation control points')
    x1, y1, x2, y2 = (v / 127.0 for v in control)
    def cubic(t, a, b):
        return 3 * (1-t)**2 * t * a + 3 * (1-t) * t*t * b + t**3
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo+hi)/2
        if cubic(mid,x1,x2) < progress:
            lo = mid
        else:
            hi = mid
    return cubic((lo+hi)/2,y1,y2)


def sample_camera_vmd(parsed, frame):
    """Sample raw MMD camera channels without assuming a scene coordinate transform.

    Camera interpolation is stored as six 4-byte cubic Bezier curves in order
    X,Y,Z,rotation,distance,view-angle; the destination key owns the curve.
    The rotation channels are MMD Euler radians, not converted browser Euler.
    """
    if not isinstance(frame, (int, float)) or isinstance(frame, bool) or not math.isfinite(frame) or frame < 0:
        raise ValueError('invalid sample frame')
    keys = parsed['keys']
    if not keys:
        raise ValueError('no camera frames')
    if frame <= keys[0]['frame']:
        return {k:v for k,v in keys[0].items() if k != 'interpolation'} | {'frame':frame}
    if frame >= keys[-1]['frame']:
        return {k:v for k,v in keys[-1].items() if k != 'interpolation'} | {'frame':frame}
    for a,b in zip(keys,keys[1:]):
        if a['frame'] <= frame <= b['frame']:
            fraction = (frame-a['frame'])/(b['frame']-a['frame'])
            ctrl = b['interpolation']
            rates = [_vmd_bezier(fraction, ctrl[i*4:i*4+4]) for i in range(6)]
            def blend(x,y,t): return x+(y-x)*t
            return {'frame':frame,
                    'center':[blend(a['center'][i],b['center'][i],rates[i]) for i in range(3)],
                    'rotation':[blend(a['rotation'][i],b['rotation'][i],rates[3]) for i in range(3)],
                    'distance':blend(a['distance'],b['distance'],rates[4]),
                    'viewAngle':blend(a['viewAngle'],b['viewAngle'],rates[5]),
                    'perspective':a['perspective']}
    raise ValueError('sample frame outside key intervals')


def export_camera_only_vmd(parsed):
    """Serialize inspected camera keys to a camera-only VMD 0002 file.

    This does NOT preserve bones, morphs, lights, shadows or IK toggle sections.
    It intentionally never claims whole-file round-tripping.
    """
    if not isinstance(parsed, dict) or not isinstance(parsed.get('keys'), list):
        raise ValueError('invalid camera data')
    keys = parsed['keys']
    if len(keys) > MAX_COUNT:
        raise ValueError('too many camera frames')
    output = bytearray(b'Vocaloid Motion Data 0002'.ljust(30, b'\0'))
    name = str(parsed.get('modelName', 'Camera')).encode('shift_jis', 'replace')[:20]
    output.extend(name.ljust(20, b'\0'))
    output.extend(struct.pack('<III', 0, 0, len(keys)))
    seen = set()
    for key in sorted(keys, key=lambda k: k['frame']):
        frame = key['frame']
        if type(frame) is not int or not 0 <= frame <= 1000000 or frame in seen:
            raise ValueError('invalid or duplicate camera frame')
        seen.add(frame)
        center, rotation = key['center'], key['rotation']
        values = [key['distance'], *center, *rotation]
        if len(center) != 3 or len(rotation) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) for v in values):
            raise ValueError('invalid camera channels')
        interpolation = key['interpolation']
        if len(interpolation) != 24 or any(type(v) is not int or not 0 <= v <= 127 for v in interpolation):
            raise ValueError('invalid camera interpolation')
        angle, perspective = key['viewAngle'], key['perspective']
        if type(angle) is not int or not 1 <= angle <= 180 or type(perspective) is not int or perspective not in (0,1):
            raise ValueError('invalid camera angle or perspective')
        try:
            output.extend(struct.pack('<I7f', frame, *values))
        except (OverflowError, struct.error) as e:
            raise ValueError('camera channel outside float32 range') from e
        output.extend(bytes(interpolation))
        output.extend(struct.pack('<IB', angle, perspective))
    output.extend(struct.pack('<III', 0, 0, 0))  # light, self-shadow, IK counts
    if len(output) > MAX_FILE:
        raise ValueError('export exceeds VMD limit')
    return bytes(output)
