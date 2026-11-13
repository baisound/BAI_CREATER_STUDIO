"""Build the supported Studio scene copy, without executing addon code."""
import argparse
import json
import math
import os
from pathlib import Path
import sys
import bpy
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).parent))
from cinemaoperator_subjects import fingerprint,TAG


def build(folder):
    m=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    if bpy.app.version[:2] not in ((5,1),(5,2)):raise ValueError('Blender5.1/5.2が必要です')
    # Only write defaults inside the explicit per-session profile, never global prefs.
    if os.environ.get('BAI_CINEMA_ISOLATED_PROFILE')=='1':
        config=Path(os.environ['BLENDER_USER_CONFIG'])
        if config.resolve().is_relative_to(folder.resolve()) and not (config/'userpref.blend').exists():
            bpy.context.preferences.view.show_splash=False;bpy.ops.wm.save_userpref()
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene;scene.frame_start=m['start_frame']+1;scene.frame_end=m['end_frame']+1
    scene.render.fps=round(m['fps']);scene.render.fps_base=round(m['fps'])/m['fps']
    scene.render.resolution_x,scene.render.resolution_y=m['resolution'];scene.render.resolution_percentage=100
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    basis=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    result=[]
    for item in m['assets']:
        before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(folder/item['file']))
        imported=set(scene.objects)-before
        if not imported or any(o.type in ('ARMATURE','CAMERA') for o in imported):raise ValueError('静的メッシュGLBが必要です')
        vertices=[o.matrix_world@Vector(corner) for o in imported if o.type=='MESH' for corner in o.bound_box]
        if not vertices:raise ValueError('GLBにメッシュがありません')
        lo=Vector(tuple(min(v[k] for v in vertices) for k in range(3)));hi=Vector(tuple(max(v[k] for v in vertices) for k in range(3)))
        norm=bpy.data.objects.new('Studio normalization',None);scene.collection.objects.link(norm)
        norm[TAG]=item['instance_id']+':normalize'
        for index,obj in enumerate(sorted(imported,key=lambda o:o.name)):obj[TAG]=item['instance_id']+f':object-{index}'
        for obj in imported:
            if obj.parent not in imported:obj.parent=norm
        if item.get('units')!='legacy':
            scale=2/max(.001,hi.z-lo.z);norm.scale=(scale,)*3
            norm.location=(-.5*(lo.x+hi.x)*scale,-.5*(lo.y+hi.y)*scale,-lo.z*scale)
        outer=bpy.data.objects.new(item['instance_id'],None);scene.collection.objects.link(outer);norm.parent=outer
        outer[TAG]=item['instance_id']+':placement'
        t=item['transform'];p=t['position'];r=t['rotation'];s=t['scale']
        matrix=Matrix.Translation(Vector(p))
        for angle,axis in zip(r,'XYZ'):matrix=matrix@Matrix.Rotation(math.radians(angle),4,axis)
        matrix=matrix@Matrix.Diagonal((*s,1));outer.matrix_world=basis@matrix@basis.inverted()
        windows=item.get('windows',[])
        for obj in imported:
            for frame in range(scene.frame_start,scene.frame_end+2):
                seconds=(frame-1)/m['fps'];visible=item['visible'] and (not windows or any(clip['start']<=seconds<round(clip['start']+clip['duration'],4) for clip in windows))
                obj.hide_render=not visible;obj.hide_viewport=not visible
                obj.keyframe_insert('hide_render',frame=frame);obj.keyframe_insert('hide_viewport',frame=frame)
        scene.frame_set(scene.frame_start);bpy.context.view_layer.update()
        world=[o.matrix_world@v.co for o in imported if o.type=='MESH' for v in o.data.vertices]
        result.append({'instance_id':item['instance_id'],'bounds_blender':[[min(v[k] for v in world) for k in range(3)],[max(v[k] for v in world) for k in range(3)]]})
    pose=m.get('camera') or {'position':[3,2,6],'target':[0,1,0],'fov':45}
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Studio starting camera'
    cam.location=basis.to_3x3()@Vector(pose['position']);target=basis.to_3x3()@Vector(pose['target'])
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='PERSP';cam.data.sensor_fit='VERTICAL';cam.data.sensor_height=24
    cam.data.lens=12/math.tan(math.radians(pose['fov'])/2);scene.camera=cam
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
    scene['bai_session_id']=m['id'];scene.frame_set(scene.frame_start)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/'work.blend'))
    (folder/'scene-result.json').write_text(json.dumps({'blender_version':bpy.app.version_string,'instances':result,'subject_sha256':fingerprint(scene)}),encoding='utf-8')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--session',required=True);args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);build(Path(args.session))
