"""Immutable geometry-cache settings, UVs, materials and image contents."""
import hashlib
import json
from pathlib import Path
import bpy
from bpy_extras.anim_utils import action_get_channelbag_for_slot


def curves(owner):
    animation=owner.animation_data
    if not animation:return []
    if animation.drivers or animation.nla_tracks:raise ValueError('被写体に追加したドライバー/NLAは戻せません')
    if not animation.action:return []
    bag=action_get_channelbag_for_slot(animation.action,animation.action_slot)
    result=[]
    for c in bag.fcurves if bag else []:
        if c.modifiers:raise ValueError('被写体の曲線変更は戻せません')
        result.append([c.data_path,c.array_index,c.mute,c.extrapolation,getattr(c.group,'mute',False),
                       [[float(k.co.x),float(k.co.y),k.interpolation,list(k.handle_left),list(k.handle_right)] for k in c.keyframe_points]])
    return sorted(result)


def file_sha(path):
    sha=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):sha.update(block)
    return sha.hexdigest()


def fingerprint(obj):
    if len(obj.modifiers)!=1 or obj.modifiers[0].type!='MESH_CACHE':raise ValueError('被写体の形状キャッシュ設定が変わっています')
    modifier=obj.modifiers[0];folder=Path(bpy.data.filepath).parent.resolve();path=Path(bpy.path.abspath(modifier.filepath)).resolve()
    if path.parent!=folder or not path.is_file():raise ValueError('被写体の形状キャッシュがありません')
    config={}
    for prop in modifier.bl_rna.properties:
        if prop.is_readonly or prop.identifier=='is_active':continue
        value=getattr(modifier,prop.identifier)
        # eval_frame is evaluated; its full animation curve is fingerprinted by the caller.
        if prop.identifier=='eval_frame':continue
        config[prop.identifier]=list(value) if getattr(prop,'is_array',False) else value
    materials=[]
    for material in obj.data.materials:
        tree=material.node_tree
        if not material.use_nodes or not tree:raise ValueError('被写体の材質設定が変わっています')
        animation=curves(tree);animated={r[0] for r in animation};nodes=[]
        for node in tree.nodes:
            sockets=[]
            for socket in node.inputs:
                if not hasattr(socket,'default_value'):continue
                value=socket.default_value;key=socket.path_from_id('default_value')
                if key in animated:value='animated'
                elif not isinstance(value,(str,int,float,bool)):value=list(value)
                sockets.append([socket.identifier,value])
            settings={name:getattr(node,name) for name in ('mute','operation','blend_type','use_clamp','uv_map','extension','interpolation','projection') if hasattr(node,name)}
            image=getattr(node,'image',None)
            if image:
                if not image.packed_file:raise ValueError('被写体の画像は作業コピー内の固定画像が必要です')
                settings['image']=[hashlib.sha256(image.packed_file.data).hexdigest(),image.colorspace_settings.name,image.alpha_mode]
            nodes.append([node.name,node.bl_idname,sockets,settings])
        links=sorted([[l.from_node.name,l.from_socket.identifier,l.to_node.name,l.to_socket.identifier] for l in tree.links])
        materials.append({'nodes':sorted(nodes),'links':links,'animation':animation,'culling':material.use_backface_culling,
                          'action_state':[getattr(tree.animation_data,name,None) for name in ('action_blend_type','action_extrapolation','action_influence')] if tree.animation_data else None,
                          'render':material.surface_render_method})
    uv=[{'name':layer.name,'values':[list(v.uv) for v in layer.data]} for layer in obj.data.uv_layers]
    return {'modifier':config,'cache_sha256':file_sha(path),'materials':materials,'uv':uv,
            'material_indices':[p.material_index for p in obj.data.polygons],
            'smooth':[p.use_smooth for p in obj.data.polygons]}
