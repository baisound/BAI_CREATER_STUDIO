"""Synthetic evaluated camera JSON for API validation; Blender fixtures are separate."""
import math


def track(fps=60,dof=False):
    near,far=.1,100
    a=1/math.tan(math.radians(50)/2)
    perspective=[a/(16/9),0,0,0,0,a,0,0,.14,-.08,-(far+near)/(far-near),-1,0,0,-2*far*near/(far-near),0]
    ortho=[.4,0,0,0,0,.4*16/9,0,0,0,0,-2/(far-near),0,-.14,.08,-(far+near)/(far-near),1]
    times=sorted({i/fps for i in range(int(fps)+1)}|{.5-1e-7,.5,1})
    return {'format':'bai-blender-camera-v1','blender_version':'synthetic','source_fps':30,'source_fps_base':1,
        'source_start_frame':11,'source_end_frame':40,'sample_fps':fps,'resolution':[640,360],
        'pixel_aspect':[1,1],'unit_scale':1,'cuts':[{'time':0,'source_frame':11,'camera':'A'},
        {'time':.5,'source_frame':26,'camera':'B'}],
        'samples':[{'time':t,'camera':'A' if t<.5 else 'B','type':'PERSP' if t<.5 else 'ORTHO',
            'world':[1,0,0,0,0,1,0,0,0,0,1,0,t,0,5,1],
            'projection':perspective.copy() if t<.5 else ortho.copy(),
            'lens':{'lens_mm':50,'sensor_width':36,'sensor_height':24,'sensor_fit':'AUTO',
                'shift_x':.07,'shift_y':-.04,'ortho_scale':5,'clip_start':near,'clip_end':far,
                'dof':{'enabled':dof,'focus_distance':5,'fstop':2.8}}} for t in times]}
