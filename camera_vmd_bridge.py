"""Opt-in experimental MMD camera to Y-up Three.js viewing pose.

Assumptions: native MMD camera target and radians rotation are in a
left-handed +Z-forward camera frame. Reflect the Z axis to a right-handed
Three.js world; distance travels along the camera's local +Z direction.
This is NOT an MMD compatibility certification and does not modify VMD data.
"""
import math
from camera_vmd_playback import sample_native_camera


def _rotate_xyz(vector, angles):
    """Apply native XYZ Euler to a vector before handedness reflection."""
    vx, vy, vz = vector
    x, y, z = (float(n) for n in angles)
    vy, vz = vy*math.cos(x)-vz*math.sin(x), vy*math.sin(x)+vz*math.cos(x)
    vx, vz = vx*math.cos(y)+vz*math.sin(y), -vx*math.sin(y)+vz*math.cos(y)
    vx, vy = vx*math.cos(z)-vy*math.sin(z), vx*math.sin(z)+vy*math.cos(z)
    return vx, vy, vz

def preview_pose(track, frame):
    value = sample_native_camera(track, frame)
    target = value['target']; angles = value['rotation']; distance = value['distance']
    if any(not math.isfinite(float(x)) for x in [*target, *angles, distance, value['fov']]):
        raise ValueError('nonfinite native camera value')
    # Apply the same transform to the viewing offset and camera up vector.
    # lookAt(position, target) alone discards native camera roll.
    vx, vy, vz = _rotate_xyz((0., 0., float(distance)), angles)
    ux, uy, uz = _rotate_xyz((0., 1., 0.), angles)
    up = [ux, uy, -uz]
    focus = [float(target[0]), float(target[1]), -float(target[2])]
    position = [focus[0]+vx, focus[1]+vy, focus[2]-vz]
    if math.dist(position, focus) < 1e-5:
        raise ValueError('VMD distance too close to zero for viewing pose')
    fov = float(value['fov'])
    if not 5 <= fov <= 150:
        raise ValueError('unsupported VMD preview FOV')
    return {'frame': frame, 'position': position, 'target': focus,
            'fov': fov, 'perspective': value['perspective'], 'up': up,
            'preview_only': True, 'coordinate_space': 'BAI-THREE-EXPERIMENTAL'}
