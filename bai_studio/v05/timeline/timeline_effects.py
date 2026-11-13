"""Resolve camera and face VMD clips, preserving native source keys and clocks."""
import hashlib
import struct
from pathlib import Path

from bai_studio.v05.motion.vmd_morph_rewrite import inspect_morph_section
from bai_studio.camera.vmd_codec import decode_camera_track


def plan(data_root,scene,clips,assets):
    from bai_studio.v05.render.media_render import _source
    root=Path(data_root);lookup={a['id']:a for a in assets};instances={i['id']:i for i in scene['instances']}
    rows=[]
    for clip in clips:
        track=clip.get('track')
        if track not in ('camera','expression','lip'):continue
        asset=lookup.get(clip['asset_id']);target=instances.get(clip.get('target_scene_instance_id'))
        row={'clip_id':clip['id'],'asset_id':clip['asset_id'],'name':clip.get('name',clip['id']),
             'track':track,'start':clip['start'],'duration':clip['duration'],
             'target_scene_instance_id':clip.get('target_scene_instance_id'),'status':'ready'}
        try:
            if not asset or not asset.get('available') or str(asset.get('format','')).upper()!='VMD':raise ValueError('登録済みVMDが必要です')
            source=_source(asset,root/'library_assets',root/'studio_v05_asset_sources',root/'asset_inbox',root/'integrated_v02/assets')
            if source is None or source.stat().st_size>32*1024*1024:raise ValueError('VMDを読み込めません')
            raw=source.read_bytes();sections=inspect_morph_section(raw)
            row['source_sha256']=hashlib.sha256(raw).hexdigest()
            if track=='camera':
                tail=sections['tail'];count=sections['tailCounts'].get('camera',0)
                if not count:raise ValueError('VMDにカメラキーがありません')
                native=decode_camera_track(raw[:50]+b'\0'*8+tail[:4+count*61])
                if any(any(n>127 for n in key['interpolation']) or not 5<=key['fov']<=150 for key in native['keys']):raise ValueError('カメラの補間または画角が対応範囲外です')
                row['camera_track']=native
                # VMD stores MMD units regardless of the formats sharing the scene.
                row['world_scale']=.08
            else:
                if not target:raise ValueError('対象モデルを割り当ててください')
                if target.get('asset',{}).get('format')!='PMX':raise ValueError('表情VMDにはPMXが必要です')
                if not sections['rows']:raise ValueError('VMDに表情キーがありません')
                model=target['asset'];model_source=_source(model,root/'library_assets',root/'studio_v05_asset_sources',root/'asset_inbox',root/'integrated_v02/assets')
                from bai_studio.v05.assets.pmx_morphs import names as morph_names
                if model_source is None:raise ValueError('対象PMXを読み込めません')
                absent={key['name'] for key in sections['rows']}-set(morph_names(model_source))
                if absent:raise ValueError('対象PMXにない表情: '+', '.join(sorted(absent)[:8]))
                row['morph_keys']=[{k:value[k] for k in ('name','frame','weight')} for value in sections['rows']]
        except (ValueError,OSError,KeyError,TypeError) as exc:
            row['status']='unready';row['reason']=str(exc)
        rows.append(row)
    # Ambiguous camera ownership and same-morph overlays are explicit conflicts.
    ready=[row for row in rows if row['status']=='ready']
    for i,a in enumerate(ready):
        for b in ready[i+1:]:
            if max(a['start'],b['start'])>=round(min(a['start']+a['duration'],b['start']+b['duration']),4):continue
            conflict=a['track']==b['track']=='camera'
            if a['track']!='camera' and b['track']!='camera' and a['target_scene_instance_id']==b['target_scene_instance_id']:
                conflict=bool({k['name'] for k in a['morph_keys']}&{k['name'] for k in b['morph_keys']})
            if conflict:
                a['status']=b['status']='overlap';a['reason']=b['reason']='同じ時刻のカメラまたは表情が重なっています'
    return rows
