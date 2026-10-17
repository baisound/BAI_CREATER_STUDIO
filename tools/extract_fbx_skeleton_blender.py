"""Usage: blender -b --python tools/extract_fbx_skeleton_blender.py -- INPUT.fbx OUTPUT.json"""
import sys,json,pathlib,bpy
args=sys.argv[sys.argv.index('--')+1:]
if len(args)!=2:raise SystemExit('Require FBX source and output JSON')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(pathlib.Path(args[0]).resolve()))
bones=[];actions=[]
for arm in (o for o in bpy.data.objects if o.type=='ARMATURE'):
    for b in arm.data.bones:
        bones.append({'name':b.name,'armature':arm.name,'parent':b.parent.name if b.parent else None,'head_local':list(b.head_local),'tail_local':list(b.tail_local),'matrix_local':[list(row) for row in b.matrix_local]})
for act in bpy.data.actions:
    actions.append({'name':act.name,'frame_range':list(act.frame_range)})
result={'format':'FBX','bone_count':len(bones),'bones_detail':bones,'clips':actions,'warnings':['Blender-imported rest transforms may differ from raw FBX PreRotation; verify against source.']}
pathlib.Path(args[1]).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
