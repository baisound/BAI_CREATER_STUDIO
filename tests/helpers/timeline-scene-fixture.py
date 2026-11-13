"""Small generated PMX/VMD/PNG inputs, no owner assets."""
import base64
import copy
import json
import struct
import zlib
from tools.make_test_pmx import build_pmx
from tools.make_test_vmd import build_vmd, sjis
from bai_studio.camera.vmd_codec import encode_camera_track


def png(width,height,rgb):
    def chunk(name,data):return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
    raw=(b'\0'+bytes(rgb)*width)*height
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')


def face(weights):
    return sjis('Vocaloid Motion Data 0002',30)+sjis('test',20)+struct.pack('<II',0,len(weights))+b''.join(sjis('あ',15)+struct.pack('<If',f,w) for f,w in weights)+struct.pack('<IIII',0,0,0,0)


camera={'format':'mmd-vmd-camera-native-v1','keys':[{'frame':f,'distance':-8,'target':[x,.5,0],'rotation':[0,0,roll],'fov':45,'perspective':projection,'interpolation':[20,20,107,107]*6} for f,x,roll,projection in [(0,0,0,0),(15,.3,.2,1),(30,0,.4,1)]]}
zero=copy.deepcopy(camera);zero['keys'][1]['distance']=0
files={'mmd/A/timeline.pmx':build_pmx(),'mmd/A/tex/a.png':png(8,8,(70,220,120)),
       'mmd/vmd/body.vmd':build_vmd(),'mmd/vmd/face.vmd':face([(0,1),(15,0),(30,1)]),
       'mmd/vmd/lip.vmd':face([(0,.2),(15,.6),(30,.1)]),'mmd/vmd/カメラ.vmd':encode_camera_track(camera),'mmd/vmd/zero-camera.vmd':encode_camera_track(zero)}
meta={'A':[{'name':'timeline.pmx','size':len(files['mmd/A/timeline.pmx'])},{'name':'tex/a.png','size':len(files['mmd/A/tex/a.png'])}],'B':[],'vmd':[{'name':name,'size':len(files['mmd/vmd/'+name])} for name in ['body.vmd','face.vmd','lip.vmd','カメラ.vmd','zero-camera.vmd']]}
files['mmd_assets.json']=json.dumps(meta,ensure_ascii=False).encode()
print(json.dumps({'seed':{p:base64.b64encode(raw).decode() for p,raw in files.items()},'background':base64.b64encode(png(16,9,(20,35,55))).decode()},ensure_ascii=False))
