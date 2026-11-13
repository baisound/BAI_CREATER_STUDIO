"""Generated .blend/GLB/evaluated cameras and Blender-rendered references."""
import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

args=argparse.ArgumentParser();args.add_argument('--output',required=True);args.add_argument('--sample-fps',type=float,default=60);args.add_argument('--fps-base',type=float,default=1);args.add_argument('--width',type=int,default=640);args.add_argument('--height',type=int,default=360);args.add_argument('--pixel-aspect-x',type=float,default=1);args.add_argument('--render',action='store_true')
options=args.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(options.output);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
scene.frame_start=11;scene.frame_end=40;scene.render.fps=30;scene.render.fps_base=options.fps_base
scene.render.resolution_x=options.width;scene.render.resolution_y=options.height;scene.render.resolution_percentage=100;scene.render.pixel_aspect_x=options.pixel_aspect_x
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False
scene.render.film_transparent=True;scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
meshes=[];points=[]
for name,position,size,color in [('Red',(-.7,0,.45),(.45,.4,.9),(1,0,0,1)),('Green',(.65,.2,.6),(.5,.4,1.2),(0,1,0,1)),('Blue',(0,-.2,1.45),(.4,.4,.7),(0,0,1,1))]:
    bpy.ops.mesh.primitive_cube_add(size=1,location=position);obj=bpy.context.object;obj.name=name;obj.scale=size
    material=bpy.data.materials.new(name);material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(0,0,0,1)
    shader.inputs['Emission Color'].default_value=color;shader.inputs['Emission Strength'].default_value=1
    obj.data.materials.append(material);meshes.append(obj);points.append(list(position))
target=bpy.data.objects.new('Target',None);target.location=(0,0,1);scene.collection.objects.link(target)
parent=bpy.data.objects.new('CameraParent',None);scene.collection.objects.link(parent)
for f,x,angle in [(11,0,0),(40,.25,.05)]:
    parent.location.x=x;parent.rotation_euler.z=angle;parent.keyframe_insert('location',frame=f);parent.keyframe_insert('rotation_euler',frame=f)
cameras=[]
for name,position,kind in [('A',(3,-6,3),'PERSP'),('B',(-3,-6,2.5),'ORTHO')]:
    data=bpy.data.cameras.new(name);data.type=kind;data.sensor_fit='HORIZONTAL' if kind=='PERSP' else 'VERTICAL';data.shift_x=.07;data.shift_y=-.04;data.ortho_scale=5.5
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=position
    obj.rotation_euler=(target.location-obj.location).to_track_quat('-Z','Y').to_euler()
    if kind=='PERSP':
        obj.parent=parent;constraint=obj.constraints.new('TRACK_TO');constraint.target=target;constraint.track_axis='TRACK_NEGATIVE_Z';constraint.up_axis='UP_Y'
        for f,lens in [(11,40),(40,46)]:data.lens=lens;data.keyframe_insert('lens',frame=f)
    else:obj.rotation_euler.rotate_axis('Z',.15)
    cameras.append(obj)
scene.camera=cameras[0]
for frame,camera in [(11,cameras[0]),(26,cameras[1])]:scene.timeline_markers.new(camera.name,frame=frame).camera=camera
scene.frame_set(11);bpy.ops.wm.save_as_mainfile(filepath=str(out/'camera-source.blend'))
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:obj.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.export_scene.gltf(filepath=str(out/'stage.glb'),export_format='GLB',use_selection=True,export_cameras=False,export_animations=False)
script=Path(__file__).resolve().parents[2]/'tools'/'export_blender_camera.py'
spec=importlib.util.spec_from_file_location('camera_exporter',script);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
track=exporter.export_scene(scene,options.sample_fps);(out/'camera.json').write_text(json.dumps(track,separators=(',',':')),encoding='utf-8')
frames=[0,15,29,30,31,58,59];references=[];rate=30/options.fps_base
for frame in frames:
    time=frame/options.sample_fps
    if time>=track['samples'][-1]['time']:continue
    native=scene.frame_start+time*rate;integer=math.floor(native+1e-9);scene.frame_set(integer,subframe=max(0,native-integer));graph=bpy.context.evaluated_depsgraph_get();camera=scene.camera.evaluated_get(graph)
    matrix=camera.calc_matrix_camera(graph,x=options.width,y=options.height,scale_x=options.pixel_aspect_x,scale_y=1)@camera.matrix_world.normalized().inverted()
    ndc=[]
    for point in points:
        p=matrix@Vector((*point,1));ndc.append([p[i]/p.w for i in range(3)])
    references.append({'frame':frame,'source_frame':native,'camera':scene.camera.name,'ndc':ndc})
    if options.render:
        scene.render.filepath=str(out/f'reference-{frame}.png');bpy.ops.render.render(write_still=True)
corners=[obj.matrix_world@Vector(corner) for obj in meshes for corner in obj.bound_box]
minimum=[min(p[i] for p in corners) for i in range(3)];maximum=[max(p[i] for p in corners) for i in range(3)]
scale=2/(maximum[2]-minimum[2]);offset=[-(minimum[0]+maximum[0])*scale/2,-minimum[2]*scale,(minimum[1]+maximum[1])*scale/2]
(out/'reference.json').write_text(json.dumps({'points':points,'references':references,'source_fps_base':options.fps_base,
    'normalized_mapping':{'scale':scale,'offset':offset}}),encoding='utf-8')
print('BLENDER_CAMERA_FIXTURE_OK')
