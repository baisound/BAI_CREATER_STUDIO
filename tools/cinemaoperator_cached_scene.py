"""Load a bounded, evaluated Studio world-space movie for camera editing."""
import hashlib
import json
import struct
from pathlib import Path
import bpy
from cinemaoperator_subjects import TAG


def load(folder,manifest):
    movie=json.loads((folder/'geometry.json').read_text(encoding='utf-8'))
    if movie['frame_count']!=manifest['end_frame']-manifest['start_frame']+1 or movie['fps']!=manifest['fps']:
        raise ValueError('形状コピーの時刻が一致しません')
    scene=bpy.context.scene;result=[]
    for row in movie['meshes']:
        raw=(folder/row['file']).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=row['sha256']:raise ValueError('形状コピーが変更されています')
        frames,count=struct.unpack_from('>ii',raw)
        if frames!=movie['frame_count'] or count!=row['count'] or len(raw)!=8+4*frames+frames*count*12:
            raise ValueError('形状コピーの頂点数が一致しません')
        offset=8+4*frames
        vertices=[struct.unpack_from('>fff',raw,offset+i*12) for i in range(count)]
        mesh=bpy.data.meshes.new(row['name']);indices=row['indices']
        mesh.from_pydata(vertices,[],[indices[i:i+3] for i in range(0,len(indices),3)]);mesh.update()
        obj=bpy.data.objects.new(row['name'],mesh);scene.collection.objects.link(obj);obj[TAG]=row['id'];obj['bai_studio_cache']=True
        uv_layers={}
        for index,source in enumerate(row['materials']):
            material=bpy.data.materials.new('Studio material');material.use_nodes=True
            bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=1
            bsdf.inputs['Base Color'].default_value=source['color'];bsdf.inputs['Alpha'].default_value=source['color'][3]
            material.use_backface_culling=source['side']==0
            if source['map']:
                file=folder/source['map']
                if hashlib.sha256(file.read_bytes()).hexdigest()!=source['map_sha256']:raise ValueError('テクスチャが変更されています')
                image=bpy.data.images.load(str(file),check_existing=True);image.pack()
                node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
                multiply=material.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
                material.node_tree.links.new(node.outputs['Color'],multiply.inputs[1]);multiply.inputs[2].default_value=source['color']
                material.node_tree.links.new(multiply.outputs[0],bsdf.inputs['Base Color'])
                alpha=material.node_tree.nodes.new('ShaderNodeMath');alpha.operation='MULTIPLY';alpha.inputs[1].default_value=source['color'][3]
                material.node_tree.links.new(node.outputs['Alpha'],alpha.inputs[0]);material.node_tree.links.new(alpha.outputs[0],bsdf.inputs['Alpha'])
            mesh.materials.append(material)
            uv=row['uv']
            if uv:
                key=tuple(source['uv_matrix'])+(source['flip_y'],)
                if key not in uv_layers:
                    if len(uv_layers)>=8:raise ValueError('異なるUV変換は8種類までです')
                    from mathutils import Matrix,Vector
                    matrix=Matrix([source['uv_matrix'][i::3] for i in range(3)])
                    layer=mesh.uv_layers.new(name=f'UV-{len(uv_layers)}');uv_layers[key]=layer
                    for loop in mesh.loops:
                        u,v=uv[loop.vertex_index];point=matrix@Vector((u,v,1));layer.data[loop.index].uv=(point.x,1-point.y if source['flip_y'] else point.y)
                layer=uv_layers[key]
                if source['map']:
                    uv_node=material.node_tree.nodes.new('ShaderNodeUVMap');uv_node.uv_map=layer.name
                    material.node_tree.links.new(uv_node.outputs[0],node.inputs['Vector'])
        for polygon in mesh.polygons:
            polygon.use_smooth=True
            for group in row['groups']:
                if group['start']<=polygon.index*3<group['start']+group['count']:
                    polygon.material_index=group['materialIndex'];break
        modifier=obj.modifiers.new('Studio evaluated geometry','MESH_CACHE');modifier.cache_format='MDD';modifier.filepath=str(folder/row['file'])
        modifier.play_mode='CUSTOM';modifier.time_mode='FRAME';modifier.forward_axis='POS_Y';modifier.up_axis='POS_Z'
        for index,state in enumerate(row['states']):
            frame=manifest['start_frame']+index+1
            modifier.eval_frame=float(index);modifier.keyframe_insert('eval_frame',frame=frame)
            obj.hide_viewport=not state['visible'];obj.hide_render=not state['visible']
            obj.keyframe_insert('hide_viewport',frame=frame);obj.keyframe_insert('hide_render',frame=frame)
            for mi,rgba in enumerate(state['colors']):
                tree=mesh.materials[mi].node_tree;principled=tree.nodes.get('Principled BSDF')
                color=next((n.inputs[2] for n in tree.nodes if n.type=='MIX_RGB'),principled.inputs['Base Color'])
                alpha=next((n.inputs[1] for n in tree.nodes if n.type=='MATH'),principled.inputs['Alpha'])
                color.default_value=rgba;color.keyframe_insert('default_value',frame=frame)
                alpha.default_value=rgba[3];alpha.keyframe_insert('default_value',frame=frame)
        from bpy_extras.anim_utils import action_get_channelbag_for_slot
        animation=obj.animation_data;bag=action_get_channelbag_for_slot(animation.action,animation.action_slot)
        for curve in bag.fcurves:
            for key in curve.keyframe_points:key.interpolation='LINEAR' if curve.data_path.endswith('.eval_frame') else 'CONSTANT'
        result.append({'instance_id':row['instance_id'],'mesh_id':row['id'],'vertices':count})
    scene['bai_studio_geometry_sha256']=hashlib.sha256((folder/'geometry.json').read_bytes()).hexdigest()
    return result
