"""Run in Blender: blender -b --python tools/extract_fbx_motion_blender.py -- input.fbx output.json"""
import bpy, json, sys
from pathlib import Path

def main(src,dst):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=str(Path(src).resolve()),use_anim=True)
    arm=next((o for o in bpy.context.scene.objects if o.type=='ARMATURE' and o.animation_data and o.animation_data.action),None)
    if arm is None:raise ValueError('Animated Armature not found')
    scene=bpy.context.scene; action=arm.animation_data.action
    low,high=map(int,action.frame_range); fps=scene.render.fps/scene.render.fps_base
    tracks=[]
    for b in arm.pose.bones:
        for path in ('translation','rotation'):
            tracks.append({'clip':action.name,'node':b.name,'path':path,'interpolation':'LINEAR','keys':[]})
    for f in range(low,high+1):
        scene.frame_set(f)
        for i,b in enumerate(arm.pose.bones):
            # Rest-local basis as Blender evaluated: downstream calibration still required.
            q=b.matrix_basis.to_quaternion();p=b.matrix_basis.to_translation()
            tracks[2*i]['keys'].append({'time':(f-low)/fps,'value':list(p)})
            tracks[2*i+1]['keys'].append({'time':(f-low)/fps,'value':[q.x,q.y,q.z,q.w]})
    result={'format':'FBX','schema':1,'channels':tracks,'channel_count':len(tracks),'warnings':['Evaluated Blender pose basis; requires source/target rest calibration and coordinate conversion before PMX use']}
    Path(dst).write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')

if __name__=='__main__':
    argv=sys.argv[sys.argv.index('--')+1:];main(*argv[:2])
