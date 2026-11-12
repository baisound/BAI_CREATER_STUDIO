import copy
import json
from pathlib import Path
import shutil
import subprocess
import wave

import pytest

from bai_studio.projects.catalog import create
from bai_studio.v05.audio import mixer


@pytest.fixture
def project(tmp_path):
    pid=create(tmp_path/'studio_v05_catalog.json','音声試験')['id']
    return tmp_path,pid


def test_state_validation_conflicts_and_original_preserved(project):
    root,pid=project
    before=mixer.read(root,pid)
    channels=copy.deepcopy(before['channels'])
    channels['audio']['gain_db']=-6
    saved=mixer.save(root,pid,0,channels)
    assert saved==mixer.read(root,pid)
    snapshot=mixer.project(root,pid).read_bytes()
    with pytest.raises(mixer.MixerError,match='変わりました'):
        mixer.save(root,pid,0,channels)
    for bad in [True,float('nan'),7,-61]:
        channels['audio']['gain_db']=bad
        with pytest.raises(mixer.MixerError):mixer.save(root,pid,1,channels)
        assert mixer.project(root,pid).read_bytes()==snapshot
    assert before['channels']['audio']['gain_db']==0


def test_missing_plugin_and_invalid_file_id(project):
    root,pid=project
    channels=mixer.defaults(pid)['channels']
    channels['audio']['inserts']=[{'plugin_id':'0'*64,'parameters':{},'bypass':False}]
    with pytest.raises(mixer.MixerError,match='見つかりません'):mixer._plugin_map(channels)
    channels['audio']['inserts'][0]['bypass']=True
    assert mixer._plugin_map(channels)=={}
    for value in ['../../outside','x',None]:
        with pytest.raises(mixer.MixerError):mixer.output_file(root,value)


@pytest.fixture
def pcm(project):
    np=pytest.importorskip('numpy')
    if not mixer.capabilities()['available']:pytest.skip('Optional native audio host/FFmpeg unavailable')
    root,pid=project
    inputs=[]
    for name,freq,track in [('one',440,'audio'),('two',880,'music')]:
        data=(np.sin(np.arange(96000)*freq*2*np.pi/48000)*5000).astype('<i2')
        path=root/(name+'.wav')
        with wave.open(str(path),'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(48000);f.writeframes(data.tobytes())
        inputs.append({'clip':{'id':name,'track':track,'start':.25,'source_start':.5,'duration':1.25},
                       'path':path,'kind':'audio','has_audio':True})
    return root,pid,inputs


def read_pcm(root,result):
    import numpy as np
    data=subprocess.check_output([shutil.which('ffmpeg'),'-v','error','-i',str(mixer.output_file(root,result['id'])),
                                  '-f','f32le','-acodec','pcm_f32le','-'])
    return np.frombuffer(data,dtype='<f4').reshape(-1,2)


def process(pcm,channels=None,inputs=None):
    root,pid,original=pcm
    settings=mixer.defaults(pid);settings['enabled']=True
    if channels:settings['channels']=channels
    return mixer.prepare(root,pid,inputs=inputs or original,settings=settings,muted=[],duration=2)


def test_real_gain_mute_solo_and_trim(pcm):
    import numpy as np
    root,pid,inputs=pcm
    hashes=[mixer.sha(p['path']) for p in inputs]
    channels=mixer.defaults(pid)['channels']
    dry=read_pcm(root,process(pcm,channels,inputs[:1]))
    assert np.max(np.abs(dry[:12000]))==0
    assert np.max(np.abs(dry[72000:]))==0
    # Existing FFmpeg stereo rematrix uses an equal-power mono conversion.
    assert .107<np.max(np.abs(dry[12000:72000]))<.109
    channels['audio']['gain_db']=-6
    wet=read_pcm(root,process(pcm,channels,inputs[:1]))
    assert np.max(np.abs(wet-dry*10**(-6/20)))<1e-6
    channels['master']['gain_db']=-3
    quieter=read_pcm(root,process(pcm,channels,inputs[:1]))
    assert np.max(np.abs(quieter-dry*10**(-9/20)))<1e-6
    channels['audio']['mute']=True
    assert np.max(np.abs(read_pcm(root,process(pcm,channels,inputs[:1]))))==0
    channels=mixer.defaults(pid)['channels'];channels['audio']['solo']=True
    solo=read_pcm(root,process(pcm,channels))
    assert np.max(np.abs(solo-dry))<1e-6
    channels['master']['mute']=True
    assert np.max(np.abs(read_pcm(root,process(pcm,channels))))==0
    assert hashes==[mixer.sha(p['path']) for p in inputs]


def test_real_vst_changes_pcm_bypass_and_cache(pcm):
    import numpy as np
    root,pid,inputs=pcm
    plugin=next((p for p in mixer.plugins() if p['name']=='TDR Nova'),None)
    if not plugin:pytest.skip('Installed TDR Nova not available on this OS')
    info=mixer.inspect(root,plugin['id'])
    params={p['id']:p['raw'] for p in info['parameters']}
    params['output_gain_db']=.25
    channels=mixer.defaults(pid)['channels']
    insert={'plugin_id':plugin['id'],'parameters':params,'bypass':False}
    channels['audio']['inserts']=[insert]
    result=process(pcm,channels,inputs[:1]);wet=read_pcm(root,result)
    assert process(pcm,channels,inputs[:1])['id']==result['id']
    insert['bypass']=True
    dry=read_pcm(root,process(pcm,channels,inputs[:1]))
    # Independent observation: a real native plug-in changed the stable PCM;
    # do not equate a successful host exit with an audible effect.
    a,b=wet[24000:60000],dry[24000:60000]
    ratio=float(np.sqrt(np.mean(a*a)/np.mean(b*b)))
    assert .2<ratio<.8,ratio
    assert np.max(np.abs(wet))>0


def test_worker_failure_never_falls_back(project):
    root,pid=project
    if not mixer.capabilities()['available']:pytest.skip('Optional host unavailable')
    with pytest.raises(mixer.MixerError,match='処理できません'):
        mixer._child(root,{'action':'inspect','plugin':{'path':str(root/'missing.vst3'),'id':'0'*64}},10)
