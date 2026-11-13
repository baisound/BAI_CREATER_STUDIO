"""Local Blender helper: use real CinemaOperator, export its current baked state.

This file contains integration code only, never a copy of the addon.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
import uuid
import bpy

FOLDER=Path(os.environ['BAI_CINEMA_SESSION'])
if bpy.app.version[:2] not in ((5,1),(5,2)):raise ValueError('Blender5.1/5.2が必要です')
MANIFEST=json.loads((FOLDER/'manifest.json').read_text(encoding='utf-8'))
sys.path.insert(0,str(Path(__file__).parent))
from cinemaoperator_subjects import fingerprint
sys.path.insert(0,str(FOLDER/'addons'))
import cinema_operator
if tuple(cinema_operator.bl_info['version'])!=(0,7,183):raise ValueError('対応版が違います')
cinema_operator.register()
bpy.context.scene.cinema_operator.camera=bpy.context.scene.camera
from cinema_operator import sequencer,layers
if not sequencer.live_rows(bpy.context.scene):
    scene=bpy.context.scene;cfg=layers.sequence(scene)
    cfg.duration=(scene.frame_end-scene.frame_start+1)/(scene.render.fps/scene.render.fps_base)
    cfg.enabled=True;sequencer.add(scene,scene.camera,0,inherit_target=False)


def return_bake():
    s=bpy.context.scene;m=MANIFEST
    expected=json.loads((FOLDER/'session.json').read_text(encoding='utf-8'))['subject_sha256']
    if fingerprint(s)!=expected:raise ValueError('被写体のメッシュ・配置・表示が変更されています。Studioで作業コピーを準備し直してください')
    if s.get('bai_session_id')!=m['id'] or s.frame_start!=m['start_frame']+1 or s.frame_end!=m['end_frame']+1 or abs(s.render.fps/s.render.fps_base-m['fps'])>1e-5:
        raise ValueError('作品のFPS・フレーム範囲を元の作業コピーに戻してください')
    markers=sorted((marker for marker in s.timeline_markers if marker.camera),key=lambda marker:marker.frame)
    if len({marker.frame for marker in markers})!=len(markers):raise ValueError('同じFのカメラ切替が重複しています')
    cameras={marker.camera for marker in markers if marker.frame<=s.frame_end}
    if s.camera:cameras.add(s.camera)
    if not cameras:raise ValueError('CinemaOperatorでカメラをBakeしてください')
    for obj in cameras:
        if not obj.get('cinema_baked') or list(obj.get('cinema_bake_range',[]))!=[s.frame_start,s.frame_end] or obj.parent or obj.constraints:
            raise ValueError('CinemaOperatorのBake Camera to Keyframesで、作品の全区間をBakeしてください')
        from bpy_extras.anim_utils import action_get_channelbag_for_slot
        if not obj.animation_data or not obj.animation_data.action:raise ValueError('Bakeした位置/回転キーがありません')
        bag=action_get_channelbag_for_slot(obj.animation_data.action,obj.animation_data.action_slot)
        curves={(c.data_path,c.array_index):c for c in bag.fcurves} if bag else {}
        for name,count in [('location',3),('rotation_quaternion',4)]:
            for index in range(count):
                curve=curves.get((name,index))
                frames={round(k.co.x,6) for k in curve.keyframe_points} if curve else set()
                if curve and len(curve.modifiers) or not set(range(s.frame_start,s.frame_end+1))<=frames:raise ValueError('全フレームの位置/回転キーをCinemaOperatorでBakeし直してください')
    spec=importlib.util.spec_from_file_location('bai_camera_exporter',os.environ['BAI_CINEMA_EXPORTER']);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    track=module.export_scene(s,m['fps']);export_id=str(uuid.uuid4());blend=FOLDER/f'baked-{export_id}.blend';path=FOLDER/f'camera-{export_id}.json'
    # Snapshot the current in-memory state. No stale Ctrl-S version is read back.
    bpy.ops.wm.save_as_mainfile(filepath=str(blend),copy=True)
    raw=json.dumps(track,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode();path.write_bytes(raw)
    receipt={'export_id':export_id,'exported_at':time.time(),'manifest_sha256':hashlib.sha256((FOLDER/'manifest.json').read_bytes()).hexdigest(),'subject_sha256':expected,'blend_sha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'track_sha256':hashlib.sha256(raw).hexdigest(),'blender_version':bpy.app.version_string}
    temp=FOLDER/'receipt.tmp';temp.write_text(json.dumps(receipt),encoding='utf-8');temp.replace(FOLDER/'receipt.json')
    return receipt


class BAI_OT_return_bake(bpy.types.Operator):
    bl_idname='bai_studio.return_cinema_bake';bl_label='現在のBakeを候補へ送る'
    def execute(self,context):
        try:return_bake()
        except Exception as error:self.report({'ERROR'},str(error));return {'CANCELLED'}
        self.report({'INFO'},'現在の状態を別名保存しました。Studioで「送信済みBakeを受け取る」を押してください');return {'FINISHED'}


class BAI_PT_bridge(bpy.types.Panel):
    bl_label='Studioへカメラを戻す';bl_idname='BAI_PT_cinema_bridge';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='Studio'
    def draw(self,context):
        layout=self.layout
        layout.label(text=f"作品F {MANIFEST['start_frame']}–{MANIFEST['end_frame']} / {MANIFEST['fps']}fps")
        layout.label(text='1. CinemaOperatorで撮影を編集')
        layout.operator('cinema_operator.action',text='CinemaOperatorを開く').action='VIEW'
        layout.label(text='2. Bake Camera to Keyframesで確定')
        layout.operator('cinema_operator.bake',text='Bake Camera to Keyframes')
        layout.operator('bai_studio.return_cinema_bake',text='3. 現在のBakeを候補へ送る')
        layout.label(text='現在の画面を別名保存して送ります')
        layout.label(text='Studioで受取 → 比較 → 配置・保存')


bpy.utils.register_class(BAI_OT_return_bake);bpy.utils.register_class(BAI_PT_bridge)
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.show_region_ui=True;area.spaces.active.region_3d.view_perspective='CAMERA'
(FOLDER/'ready.json').write_text(json.dumps({'ready':True,'addon_version':list(cinema_operator.bl_info['version']),'blender_version':bpy.app.version_string}),encoding='utf-8')
