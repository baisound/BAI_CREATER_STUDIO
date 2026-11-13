"""Exercise the real installed addon on generated cameras; not an addon clone."""
import json
import math
from pathlib import Path
import os
import bpy
from mathutils import Vector
from cinema_operator import sequencer,layers

s=bpy.context.scene;folder=Path(os.environ['BAI_CINEMA_SESSION'])
layers.sequence(s).keys.clear();layers.sequence(s).selected=-1
a=s.camera;a.name='Generated shot A'
target=Vector((0,0,1));a.location=(3,-6,2.5);a.rotation_euler=(target-a.location).to_track_quat('-Z','Y').to_euler()
a.data.sensor_fit='VERTICAL';a.data.lens=36;a.data.shift_x=.06
b=a.copy();b.data=a.data.copy();b.name='Generated shot B';s.collection.objects.link(b)
b.location=(-2,-5,3);b.rotation_euler=(target-b.location).to_track_quat('-Z','Y').to_euler();b.data.lens=48
sequencer.add(s,a,0,inherit_target=False)
seconds=(s.frame_end-s.frame_start)/ (s.render.fps/s.render.fps_base)
sequencer.add(s,b,seconds,inherit_target=False)
layers.sequence(s).enabled=True;layers.sequence(s).preview=True
if os.environ.get('BAI_CINEMA_PROGRAM')=='1':
    s.cinema_ab.enabled=True;s.cinema_ab.edit='B'
    c=a.copy();c.data=a.data.copy();c.name='Generated program B';s.collection.objects.link(c);c.location.x-=.5
    sequencer.add(s,c,0,inherit_target=False);layers.sequence(s).enabled=True;layers.sequence(s).preview=True
    # Program range uses an inclusive final timestamp in the native addon.
    layers.sequence(s).duration=seconds;s.cinema_ab.edit='A';layers.sequence(s).duration=seconds
    cut=s.cinema_ab.cuts.add();cut.frame=31;cut.layer='B';s.cinema_ab.monitor='PROGRAM'
    s.frame_end=json.loads((folder/'manifest.json').read_text())['end_frame']+1
assert bpy.ops.cinema_operator.bake('EXEC_DEFAULT',source_start=0,source_end=seconds,keep_time=True,create_marker=True,use_camera=True,shot_name='Generated native Bake')=={'FINISHED'}
# Camera edits are allowed, subject edits must never silently return to Studio.
mesh=next(o for o in s.objects if o.type=='MESH');position=mesh.location.copy();mesh.location.x+=1
def refuses():
    try:
        result=bpy.ops.bai_studio.return_cinema_bake();assert result=={'CANCELLED'}
    except RuntimeError as error:assert '被写体' in str(error)
    assert not (folder/'receipt.json').exists()
refuses();mesh.location=position
from cinemaoperator_subjects import TAG
root=next(o for o in s.objects if o.get(TAG,'').endswith(':placement'))
empty=bpy.data.objects.new('Generated forbidden parent',None);s.collection.objects.link(empty);empty.location.x=1;root.parent=empty
refuses();root.parent=None;bpy.data.objects.remove(empty,do_unlink=True)
inverse=mesh.matrix_parent_inverse.copy();changed=inverse.copy();changed.translation.x+=1;mesh.matrix_parent_inverse=changed
refuses();mesh.matrix_parent_inverse=inverse
from bpy_extras.anim_utils import action_get_channelbag_for_slot
bag=action_get_channelbag_for_slot(mesh.animation_data.action,mesh.animation_data.action_slot);curve=bag.fcurves[0];curve.mute=True
refuses();curve.mute=False
assert bpy.ops.bai_studio.return_cinema_bake()=={'FINISHED'}
probe=[]
for frame in [s.frame_start,s.frame_start+15,s.frame_start+30,s.frame_end]:
    s.frame_set(frame);bpy.context.view_layer.update()
    probe.append({'frame':frame,'visible_meshes':sum(not obj.hide_viewport for obj in s.objects if obj.type=='MESH')})
    s.render.engine='CYCLES';s.cycles.samples=1;s.cycles.use_denoising=False;s.render.image_settings.file_format='PNG'
    s.render.filepath=str(folder/f'reference-{frame-s.frame_start}.png');bpy.ops.render.render(write_still=True)
(folder/'fixture-probe.json').write_text(json.dumps(probe),encoding='utf-8')
