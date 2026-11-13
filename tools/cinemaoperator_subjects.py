"""Fingerprint the static subjects; camera/helper edits are intentionally separate."""
import hashlib
import json
import struct
import bpy
from bpy_extras.anim_utils import action_get_channelbag_for_slot


TAG='bai_studio_subject'


def fingerprint(scene):
    sha=hashlib.sha256();rows=sorted((o for o in scene.objects if o.get(TAG)),key=lambda o:o[TAG])
    if not rows or len({o[TAG] for o in rows})!=len(rows):raise ValueError('被写体の構成が変わっています。Studioで作業コピーを準備し直してください')
    if any(o.type=='MESH' and not o.get(TAG) for o in scene.objects):raise ValueError('追加したメッシュは戻せません。Studioで被写体を配置し、作業コピーを準備し直してください')
    for obj in rows:
        if obj.parent and not obj.parent.get(TAG):raise ValueError('被写体の親子関係が変更されています。作業コピーを準備し直してください')
        if obj.constraints or (obj.modifiers and not obj.get('bai_studio_cache')) or obj.type=='MESH' and obj.data.shape_keys:raise ValueError('被写体の変形は未対応です。Studioで作業コピーを準備し直してください')
        animation=obj.animation_data;curves=[]
        if animation:
            if animation.drivers or animation.nla_tracks:raise ValueError('被写体のアニメーションは未対応です')
            if animation.action:
                bag=action_get_channelbag_for_slot(animation.action,animation.action_slot)
                for curve in bag.fcurves if bag else []:
                    if curve.data_path not in ('hide_render','hide_viewport', 'modifiers["Studio evaluated geometry"].eval_frame') or curve.modifiers:raise ValueError('被写体のアニメーションは未対応です')
                    curves.append([curve.data_path,curve.array_index,curve.mute,curve.extrapolation,getattr(curve.group,'mute',False),
                        [[float(k.co.x),float(k.co.y),k.interpolation,list(k.handle_left),list(k.handle_right)] for k in curve.keyframe_points]])
        item={'id':obj[TAG],'type':obj.type,'parent':obj.parent.get(TAG) if obj.parent else None,
              'basis':[round(float(obj.matrix_basis[r][c]),9) for r in range(4) for c in range(4)],
              'parent_inverse':[round(float(obj.matrix_parent_inverse[r][c]),9) for r in range(4) for c in range(4)],
              'action_state':[getattr(animation,name,None) for name in ('action_blend_type','action_extrapolation','action_influence')] if animation else None,
              'hide_set':obj.hide_get(),'visibility':sorted(curves)}
        if obj.get('bai_studio_cache'):
            from cinemaoperator_cached_subjects import fingerprint as cache_fingerprint
            item['cache']=cache_fingerprint(obj)
        if not curves:item['visible']=[obj.hide_render,obj.hide_viewport]
        sha.update(json.dumps(item,sort_keys=True,separators=(',',':')).encode())
        if obj.type=='MESH':
            sha.update(struct.pack('<II',len(obj.data.vertices),len(obj.data.polygons)))
            for vertex in obj.data.vertices:sha.update(struct.pack('<3f',*vertex.co))
            for polygon in obj.data.polygons:
                sha.update(struct.pack('<I',len(polygon.vertices)))
                for index in polygon.vertices:sha.update(struct.pack('<I',index))
    return sha.hexdigest()
