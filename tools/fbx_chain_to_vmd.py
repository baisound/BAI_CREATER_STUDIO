#!/usr/bin/env python3
"""Run inside Blender: blender -b -t 2 --python tools/fbx_chain_to_vmd.py -- --job job.json"""
import argparse, json, math, struct, sys, traceback
from pathlib import Path

# Blender uses native scene/action evaluation to sample genuine FBX bone animation.
import bpy
from mathutils import Quaternion, Vector

def bone_correction(q, bone, corrections):
    vals=corrections.get(bone)
    if vals is None:return q
    if len(vals)!=4:raise ValueError("bone_corrections require [w,x,y,z]")
    return (Quaternion(vals).normalized() @ q).normalized()


def field(s,n):
    b=s.encode('cp932',errors='replace')[:n];return b+b'\x00'*(n-len(b))
def write_vmd(path, frames, model_name='MixamoRetarget'):
    with open(path,'wb') as f:
        f.write(field('Vocaloid Motion Data 0002',30));f.write(field(model_name,20))
        f.write(struct.pack('<I',len(frames)))
        interp=bytes([20,20,107,107])*16
        for bone,frame,pos,q in frames:
            f.write(field(bone,15));f.write(struct.pack('<I3f4f',frame,*pos,*q));f.write(interp)
        f.write(struct.pack('<I',0)) # morphs
        f.write(struct.pack('<I',0)) # camera
        f.write(struct.pack('<I',0)) # light
        f.write(struct.pack('<I',0)) # self shadow
        f.write(struct.pack('<I',0)) # IK display

def find_arm(obj):
    if obj.type=='ARMATURE':return obj
    return next((c for c in obj.children_recursive if c.type=='ARMATURE'),None)

def import_fbx(path):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=str(path),use_anim=True)
    arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
    if not arms:raise RuntimeError('FBXにArmatureがありません: '+str(path))
    arm=arms[0]
    if not arm.animation_data or not arm.animation_data.action:raise RuntimeError('FBXにアニメーションがありません: '+str(path))
    return arm

def sample(arm, bone_map, fps, scale, root_names, corrections):
    scene=bpy.context.scene;scene.render.fps=fps
    act=arm.animation_data.action
    start,end=[int(round(v)) for v in act.frame_range]
    # Source animation FPS may be different: sample by time, not frame count.
    source_fps=scene.render.fps / scene.render.fps_base
    duration=(end-start)/source_fps
    n=max(1,int(math.ceil(duration*fps)))
    results=[];anchors={};previous_root=Vector((0,0,0))
    base_positions={}
    for frame in range(n+1):
        scene.frame_set(start+frame*source_fps/fps)
        for src,dest in bone_map.items():
            pose=arm.pose.bones.get(src)
            if pose is None:continue
            # Evaluation uses Blender pose transforms relative to each FBX bone's rest pose.
            q=bone_correction(pose.matrix_basis.to_quaternion().normalized(), dest, corrections)
            # MMD and FBX rest orientations can differ: optional per-bone calibration should be used.
            off=pose.matrix_basis.to_translation()
            if dest not in root_names:off=Vector((0,0,0))
            if frame==0:base_positions[dest]=off.copy()
            if dest in root_names: off=off-base_positions.get(dest,Vector((0,0,0)))
            pos=(off.x*scale,off.y*scale,off.z*scale)
            results.append((dest,frame,pos,(q.x,q.y,q.z,q.w)))
        # World displacement for chain continuity. Prefer hips/root source motion.
        hip=next((arm.pose.bones.get(nm) for nm in ['mixamorig:Hips','Hips','Root','root'] if arm.pose.bones.get(nm)),None)
        if hip:
            v=hip.matrix.translation.copy()*scale
            if frame==0:previous_root=v
            if frame==n:anchors['delta']=[v.x-previous_root.x,v.y-previous_root.y,v.z-previous_root.z]
    return results,n,anchors.get('delta',[0,0,0])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--job',required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);job=json.loads(Path(args.job).read_text(encoding='utf-8'))
    out=Path(job['output']).expanduser().resolve();out.parent.mkdir(parents=True,exist_ok=True)
    fps=int(job.get('fps',30));scale=float(job.get('scale',1));steps=job['steps'];mapping=job['bone_map']
    if not 1<=fps<=120 or not 0<scale<100 or not steps or not mapping:raise ValueError('invalid parameters')
    all_frames=[];offset=Vector((0,0,0));cursor=0;report=[];root_names=set(job.get('translation_bones',['センター','グルーブ','下半身']))
    corrections=job.get("bone_corrections",{})
    blend=int(job.get("blend_frames",6))
    if not 0<=blend<=60:raise ValueError("blend_frames must be 0..60")
    previous_end={}
    for step in steps:
        arm=import_fbx(step['file']);frames,length,delta=sample(arm,mapping,fps,scale,root_names,corrections)
        this_end={}
        for bone,fr,pos,q in frames:
            # All root coordinates are step-relative. Transfer final chain position.
            if bone in root_names:pos=tuple(Vector(pos)+offset)
            qobj=Quaternion((q[3],q[0],q[1],q[2])).normalized()
            if bone in previous_end and blend and fr<blend:
                oldpos,oldq=previous_end[bone]
                t=(fr+1)/float(blend+1);t=t*t*(3-2*t)
                qobj=oldq.slerp(qobj,t)
                if bone in root_names:
                    pos=tuple(Vector(oldpos).lerp(Vector(pos),t))
            qq=(qobj.x,qobj.y,qobj.z,qobj.w)
            # Frame zero of every subsequent clip occupies the next fresh frame.
            all_frames.append((bone,cursor+fr,pos,qq))
            if fr==length:this_end[bone]=(pos,qobj)
        previous_end=this_end
        report.append({'file':step['file'],'frames':length+1,'range':[cursor,cursor+length],'root_delta':delta,'blend_frames':blend if cursor else 0})
        cursor+=length+1
        offset+=Vector(delta)
    write_vmd(out,all_frames,job.get('model_name','MixamoRetarget'))
    result={'status':'exported_needs_visual_validation','output':str(out),'frames':cursor,'blend_frames':blend,'bone_frames':len(all_frames),'steps':report,'warnings':[
      'FBX bind pose and PMX bone orientation are not automatically calibrated; hand correction may be required.',
      'This is sampled bone mapping, not guaranteed valid PMX IK or ground contact.',
      'Root translation is inferred from the FBX hips world position; inspect and adjust.',
      'Short pose crossfade is enabled at clip starts, but full overlap blending is not implemented.',
      'Ground contact and IK are not fully solved; perform PMX-specific IK and collision checks.',
      'Do not overwrite or rely on an existing VMD without visual inspection in MMD.' ]}
    report_path=out.with_suffix('.report.json');report_path.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception as e:traceback.print_exc();sys.exit(1)
