"""Read-only projection of saved model clips onto the existing shared scene.

The arrangement owns existence/time. Scene overrides own transform/face edits.
Never add a projected instance to the persistent instance list on a read.
"""
import copy
from bai_studio.v05.timeline.arrangement import read as read_arrangement
from bai_studio.v05.timeline.scene_model import supported_model

PREFIX='timeline:'


def instance_id(clip_id):
    return PREFIX+clip_id


def project(scene, arrangement_root, catalog, project_id, assets):
    arranged=read_arrangement(arrangement_root,catalog,project_id)
    result=copy.deepcopy(scene)
    lookup={a['id']:a for a in (assets or [])}
    instances={i['id']:i for i in result['instances']}
    rows=[]
    for clip in arranged['clips']:
        if clip.get('track')!='model' or clip.get('category')!='model':continue
        linked=clip.get('target_scene_instance_id')
        rid=linked or instance_id(clip['id'])
        existing=instances.get(rid)
        asset=lookup.get(clip['asset_id'])
        status='ready'
        if linked and (not existing or existing['asset_id']!=clip['asset_id']):status='linked_model_missing'
        elif assets is not None and not supported_model(asset):status='model_unavailable'
        elif not existing and len(instances)>=32:status='scene_limit'
        if status=='ready':
            if existing is None:
                override=result.get('timeline_overrides',{}).get(rid)
                if override and override['asset_id']!=clip['asset_id']:override=None
                existing={'id':rid,'asset_id':clip['asset_id'],
                          'transform':{'position':[0,0,0],'rotation':[0,0,0],'scale':[1,1,1]},
                          'visible':True,'locked':False,'parent_id':None}
                if override:existing.update(copy.deepcopy(override))
                if assets is not None:existing.update(available=True,asset=copy.deepcopy(asset))
                existing['timeline_clip_id']=clip['id']
                existing['name']=clip.get('name',clip['id'])
                result['instances'].append(existing);instances[rid]=existing
            existing.setdefault('timeline_windows',[]).append({'start':clip['start'],'duration':clip['duration'],'clip_id':clip['id']})
        rows.append({'clip_id':clip['id'],'instance_id':rid,'asset_id':clip['asset_id'],
                     'name':clip.get('name',clip['id']),'start':clip['start'],'duration':clip['duration'],'status':status})
    result['timeline_models']=rows
    result['arrangement_revision']=arranged['revision']
    if assets is not None:
        from bai_studio.v05.timeline.timeline_effects import plan as effects_plan
        result['timeline_effects']=effects_plan(arrangement_root.parent,result,arranged['clips'],assets)
    return result
