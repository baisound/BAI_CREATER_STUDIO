"""Read evaluated Blender cameras without modifying/saving the source .blend.

blender --background --factory-startup --disable-autoexec source.blend
        --python export_blender_camera.py -- --output camera.json --sample-fps 60
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy


def export_scene(scene, sample_fps):
    rate=scene.render.fps/scene.render.fps_base
    first,last=scene.frame_start,scene.frame_end
    duration=(last+1-first)/rate
    if not 1<=sample_fps<=240 or not 1<=rate<=240 or not 0<duration<=120:
        raise ValueError('120秒以内、1〜240fpsのカメラを指定してください')
    if not scene.camera:
        raise ValueError('Blenderシーンに撮影カメラがありません')
    times={min(i/sample_fps,duration) for i in range(math.ceil(duration*sample_fps)+1)}
    cuts=[]
    for marker in scene.timeline_markers:
        if marker.camera and first<=marker.frame<=last:
            t=(marker.frame-first)/rate;cuts.append({'time':t,'source_frame':marker.frame,'camera':marker.camera.name})
            times.add(t)
            if t>0:times.add(max(0,t-1e-7))
    if len(times)>30000:raise ValueError('カメラの標本数が上限を超えています。区間を短くしてください')
    render=scene.render
    result={'format':'bai-blender-camera-v1','blender_version':bpy.app.version_string,
        'source_fps':render.fps,'source_fps_base':render.fps_base,
        'source_start_frame':first,'source_end_frame':last,'sample_fps':sample_fps,
        'resolution':[render.resolution_x,render.resolution_y],
        'pixel_aspect':[render.pixel_aspect_x,render.pixel_aspect_y],
        'unit_scale':scene.unit_settings.scale_length if scene.unit_settings.system!='NONE' else 1,
        'cuts':sorted(cuts,key=lambda c:(c['time'],c['camera'])),'samples':[]}
    old_frame,old_subframe,old_camera=scene.frame_current,scene.frame_subframe,scene.camera
    flat=lambda matrix:[float(matrix[row][col]) for col in range(4) for row in range(4)]
    try:
        for t in sorted(times):
            f=first+t*rate;integer=math.floor(f+1e-9)
            scene.frame_set(integer,subframe=max(0,f-integer))
            graph=bpy.context.evaluated_depsgraph_get()
            camera=scene.camera.evaluated_get(graph);data=camera.data
            if data.type not in ('PERSP','ORTHO'):
                raise ValueError('透視または平行投影のカメラが必要です（パノラマは未対応）')
            world=camera.matrix_world.normalized()
            projection=camera.calc_matrix_camera(graph,x=render.resolution_x,y=render.resolution_y,
                scale_x=render.pixel_aspect_x,scale_y=render.pixel_aspect_y)
            result['samples'].append({'time':t,'camera':camera.original.name,'type':data.type,
                'world':flat(world),'projection':flat(projection),
                'lens':{'lens_mm':data.lens,'sensor_width':data.sensor_width,'sensor_height':data.sensor_height,
                    'sensor_fit':data.sensor_fit,'shift_x':data.shift_x,'shift_y':data.shift_y,
                    'ortho_scale':data.ortho_scale,'clip_start':data.clip_start,'clip_end':data.clip_end,
                    'dof':{'enabled':data.dof.use_dof,'focus_distance':data.dof.focus_distance,
                        'fstop':data.dof.aperture_fstop}}})
            if bpy.app.autoexec_fail:
                raise ValueError('スクリプトドライバーを安全に評価できません。信頼したBlender内で評価済みJSONを書き出してください')
    finally:
        scene.frame_set(old_frame,subframe=old_subframe);scene.camera=old_camera
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--sample-fps',type=float,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    data=export_scene(bpy.context.scene,args.sample_fps)
    Path(args.output).write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf-8')
