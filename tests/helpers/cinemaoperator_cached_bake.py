"""Real Blender/native-addon fixture for the evaluated PMX movie."""
import json
import os
from pathlib import Path
import bpy
from cinema_operator import sequencer,layers
from cinemaoperator_subjects import fingerprint

s=bpy.context.scene;folder=Path(os.environ['BAI_CINEMA_SESSION']);m=json.loads((folder/'manifest.json').read_text())
expected=fingerprint(s);assert expected==json.loads((folder/'session.json').read_text())['subject_sha256'],'Reload changed subjects';mesh=next(o for o in s.objects if o.type=='MESH')
probe=[]
for frame in [s.frame_start,s.frame_start+7,s.frame_start+18,s.frame_start+30,s.frame_end,s.frame_start+18]:
    s.frame_set(frame);bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get();evaluated=mesh.evaluated_get(deps)
    probe.append({'frame':frame,'visible':not mesh.hide_viewport,'vertices':[list(v.co) for v in evaluated.data.vertices]})
    assert fingerprint(s)==expected,'Fingerprint must be independent of the sampled frame'
(folder/'geometry-probe.json').write_text(json.dumps(probe))

assert fingerprint(s)==expected,'Probe changes subjects'
layers.sequence(s).keys.clear();layers.sequence(s).selected=-1
cam=bpy.data.objects.get('Studio starting camera');sequencer.add(s,cam,0,inherit_target=False)
seconds=(s.frame_end-s.frame_start)/(s.render.fps/s.render.fps_base)
layers.sequence(s).enabled=True;layers.sequence(s).preview=True
assert bpy.ops.cinema_operator.bake('EXEC_DEFAULT',source_start=(s.frame_start-1)/m['fps'],source_end=(s.frame_end-1)/m['fps'],keep_time=True,create_marker=True,use_camera=True,shot_name='Generated PMX Bake')=={'FINISHED'}

assert fingerprint(s)==expected,'Native Bake changes subjects'

def refuses():
    try:
        assert bpy.ops.bai_studio.return_cinema_bake()=={'CANCELLED'}
    except RuntimeError:pass
    assert not (folder/'receipt.json').exists()

modifier=mesh.modifiers[0];modifier.factor=.5;refuses();modifier.factor=1
assert fingerprint(s)==expected,'factor restore'
cache=Path(bpy.path.abspath(modifier.filepath));raw=cache.read_bytes();cache.write_bytes(raw[:-1]+bytes([raw[-1]^1]));refuses();cache.write_bytes(raw)
assert fingerprint(s)==expected,'cache restore'
uv=mesh.data.uv_layers[0].data[0];original=uv.uv.copy();uv.uv.x+=.1;refuses();mesh.data.uv_layers[0].data[0].uv=original
assert fingerprint(s)==expected,'UV restore'
material=mesh.data.materials[0];material.use_backface_culling=not material.use_backface_culling;refuses();material.use_backface_culling=not material.use_backface_culling
assert fingerprint(s)==expected,'Material restore'
tree=material.node_tree;tree.animation_data.action_influence=.5;refuses();tree.animation_data.action_influence=1
assert fingerprint(s)==expected,'Material action restore'
node=next(n for n in tree.nodes if n.type=='TEX_IMAGE');node.mute=True;refuses();node.mute=False
assert fingerprint(s)==expected,'Material node restore'
assert bpy.ops.bai_studio.return_cinema_bake()=={'FINISHED'}
