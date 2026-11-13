"""Generated PMX legs of two lengths and the same VMD; no owner assets."""
import base64
import json
import math
import struct
from tools.make_test_pmx import _text as text, _f as floats
from tools.make_test_vmd import sjis


def pmx(length=1):
    bones=[('センター',(0,0,0),-1,None)]
    vertices=[]
    faces=[]
    for side,x in [('左',-.18),('右',.18)]:
        hip=len(bones);knee=hip+1;ankle=hip+2
        bones.extend([(side+'足',(x,.1+.9*length,0),0,None),
                      (side+'ひざ',(x,.1+.45*length,-.08*length),hip,None),
                      (side+'足首',(x,.1,0),knee,None),
                      (side+'足ＩＫ',(x,.1,0),0,(ankle,knee,hip)),
                      (side+'つま先',(x,.04,-.15),ankle,None)])
        start=len(vertices)
        for y in (.02,.12):
            for dx,z in [(-.06,.08),(.06,.08),(0,-.16)]:vertices.append(((x+dx,y,z),ankle))
        for f in [(0,1,2),(3,5,4),(0,3,1),(1,3,4),(1,4,2),(2,4,5)]:faces.extend(start+i for i in f)
    bones.extend([('頭',(0,.4+length,0),0,None),('左手首',(-.4,.5+length,0),0,None),('右手首',(.4,.5+length,0),0,None)])
    start=len(vertices)
    vertices.extend([((-.22,.1+length,0),0),((.22,.1+length,0),0),((0,.5+length,0),0)])
    faces.extend([start,start+1,start+2])
    out=bytearray(b'PMX '+floats(2)+bytes([8,0,0,1,1,1,1,1,1]))
    out+=text('接地試験')+text('contact test')+text('generated')+text('generated')
    out+=struct.pack('<i',len(vertices))
    for pos,b in vertices:out+=floats(*pos,0,1,0,0,0)+bytes([0,b])+floats(1)
    out+=struct.pack('<i',len(faces))+bytes(faces)+struct.pack('<ii',0,1)
    out+=text('試験材質')+text('test')+floats(.25,.8,.65,1,0,0,0,5,.4,.4,.4)+bytes([1])+floats(0,0,0,1,.1)
    out+=struct.pack('<bb',-1,-1)+bytes([0,1,0])+text('')+struct.pack('<i',len(faces))
    out+=struct.pack('<i',len(bones))
    for name,pos,parent,ik in bones:
        out+=text(name)+text('')+floats(*pos)+struct.pack('<biH',parent,0,0x1e|(0x20 if ik else 0))+floats(0,.1,0)
        if ik:
            eff,knee,hip=ik
            out+=struct.pack('<bifi',eff,100,1,2)
            out+=struct.pack('<bB',knee,1)+floats(-math.pi,0,0,-.001,0,0)+struct.pack('<bB',hip,0)
    # A stable facial morph ensures contact preserves source expressions too.
    out+=struct.pack('<i',1)+text('あ')+text('a')+bytes([3,1])+struct.pack('<i',1)+bytes([len(vertices)-1])+floats(0,.05,0)
    out+=struct.pack('<iii',0,0,0)
    return bytes(out)


def vmd():
    keys=[]
    for frame,x in [(0,0),(15,.015),(30,-.015),(45,0),(90,0)]:
        for name,pos in [('センター',(x,0,0)),('左足ＩＫ',(0,.02,0)),('右足ＩＫ',(0,0,0))]:
            keys.append(sjis(name,15)+struct.pack('<I7f',frame,*pos,0,0,0,1)+bytes([20]*8+[107]*8)*4)
    return sjis('Vocaloid Motion Data 0002',30)+sjis('generated',20)+struct.pack('<I',len(keys))+b''.join(keys)+struct.pack('<I',2)+b''.join(sjis('あ',15)+struct.pack('<If',f,v) for f,v in [(0,.2),(90,.8)])+struct.pack('<IIII',0,0,0,0)


if __name__=='__main__':
    files={'mmd/A/short.pmx':pmx(1),'mmd/B/long.pmx':pmx(1.4),'mmd/vmd/contact.vmd':vmd()}
    files['mmd_assets.json']=json.dumps({'A':[{'name':'short.pmx','size':len(files['mmd/A/short.pmx'])}],
        'B':[{'name':'long.pmx','size':len(files['mmd/B/long.pmx'])}],
        'vmd':[{'name':'contact.vmd','size':len(files['mmd/vmd/contact.vmd'])}]}).encode()
    print(json.dumps({p:base64.b64encode(b).decode() for p,b in files.items()}))
