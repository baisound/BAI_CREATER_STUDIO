"""PMX 2.0/2.1 bone metadata reader; bounded and read-only."""
import struct

class Reader:
    def __init__(self, data): self.data=data;self.pos=0
    def read(self,n):
        if n<0 or n>len(self.data)-self.pos:raise ValueError('PMX truncated or invalid offset')
        s=self.data[self.pos:self.pos+n];self.pos+=n;return s
    def unpack(self,fmt):return struct.unpack('<'+fmt,self.read(struct.calcsize('<'+fmt)))
    def index(self,size,signed=True):return int.from_bytes(self.read(size),'little',signed=signed)
    def count(self,limit=1000000):
        n=self.unpack('i')[0]
        if not 0<=n<=limit:raise ValueError('PMX invalid or excessive count')
        return n
    def text(self,codec):
        n=self.count(16_000_000)
        return self.read(n).decode(codec,errors='replace')

def parse(data):
    r=Reader(data)
    if r.read(4)!=b'PMX ':raise ValueError('PMX signature invalid')
    version=r.unpack('f')[0]
    if not 1.99<=version<=2.11:raise ValueError('Unsupported PMX version')
    header_size=r.unpack('B')[0]
    header=r.read(header_size)
    if len(header)<8:raise ValueError('Incomplete PMX header')
    codec='utf-16-le' if header[0]==0 else 'utf-8'
    if header[0] not in (0,1):raise ValueError('Unsupported PMX text encoding')
    extra_uv=header[1];vertex_size,texture_size,material_size,bone_size,morph_size,rigid_size=header[2:8]
    if extra_uv>4 or any(x not in (1,2,4) for x in (vertex_size,texture_size,material_size,bone_size,morph_size,rigid_size)):raise ValueError('Invalid PMX index width')
    names=[r.text(codec) for _ in range(4)]
    vertex_count=r.count(2_000_000)
    for _ in range(vertex_count):
        r.read(12+12+8+extra_uv*16)
        weight_type=r.unpack('B')[0]
        if weight_type==0:r.read(bone_size)
        elif weight_type==1:r.read(2*bone_size+4)
        elif weight_type in (2,4):r.read(4*bone_size+16)
        elif weight_type==3:r.read(2*bone_size+4+36)
        else:raise ValueError('Invalid PMX weight type')
        r.read(4)
    face_count=r.count(12_000_000)
    r.read(face_count*vertex_size)
    textures=[r.text(codec) for _ in range(r.count(200_000))]
    material_count=r.count(200_000)
    for _ in range(material_count):
        r.text(codec);r.text(codec)
        r.read(16+12+4+12+1+16+4+4+1+1)
        r.read(texture_size*2)
        toon_flag=r.unpack('B')[0]
        r.read(1 if toon_flag else texture_size)
        r.text(codec)
        r.read(4)
    count=r.count(200_000);bones=[]
    for i in range(count):
        name=r.text(codec);eng=r.text(codec)
        xyz=list(r.unpack('fff'));parent=r.index(bone_size);level=r.unpack('i')[0];flags=r.unpack('H')[0]
        bone={'index':i,'name':name,'name_en':eng,'parent_index':parent,'position':xyz,'deform_layer':level,'flags':flags}
        if flags&1:bone['tail_index']=r.index(bone_size)
        else:bone['tail_offset']=list(r.unpack('fff'))
        if flags&0x100 or flags&0x200:
            bone['inherit_parent_index']=r.index(bone_size);bone['inherit_ratio']=r.unpack('f')[0]
        if flags&0x400:bone['fixed_axis']=list(r.unpack('fff'))
        if flags&0x800:
            bone['local_axis_x']=list(r.unpack('fff'));bone['local_axis_z']=list(r.unpack('fff'))
        if flags&0x2000:bone['external_parent_key']=r.unpack('i')[0]
        if flags&0x20:
            ik_target=r.index(bone_size);loops=r.unpack('i')[0];limit=r.unpack('f')[0]
            if not 0<=loops<=100000:raise ValueError('Invalid PMX IK loop count')
            links=[]
            for _ in range(r.count(10000)):
                idx=r.index(bone_size);has_limit=r.unpack('B')[0];link={'bone_index':idx}
                if has_limit:link['min']=list(r.unpack('fff'));link['max']=list(r.unpack('fff'))
                links.append(link)
            bone['ik']={'target_index':ik_target,'iterations':loops,'angle_limit':limit,'links':links}
        bones.append(bone)
    return {'version':round(version,2),'model_name':names[0],'vertices':vertex_count,'faces':face_count//3,'textures':len(textures),'materials':material_count,'bones_detail':bones}
