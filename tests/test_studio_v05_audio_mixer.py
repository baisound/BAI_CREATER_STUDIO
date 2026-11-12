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


def test_disabled_analysis_matches_browser_mono_duplication(pcm):
    import numpy as np
    root,pid,inputs=pcm
    result=mixer.prepare(root,pid,inputs=inputs[:1],settings=mixer.defaults(pid),muted=[],duration=2,analysis_only=True)
    assert result['enabled'] is False
    decoded=read_pcm(root,result)
    # HTML/Web Audio mono speaker upmix duplicates the source at unity in L/R.
    assert abs(float(np.max(np.abs(decoded)))-5000/32768)<1e-6
    assert np.array_equal(decoded[:,0],decoded[:,1])


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


def test_independent_same_type_lanes_and_vst_routing(pcm):
    import numpy as np
    root,pid,inputs=pcm
    inputs=copy.deepcopy(inputs)
    for i,item in enumerate(inputs):item['clip'].update(track='audio',lane=i+1)
    settings=mixer.defaults(pid);settings['enabled']=True
    def render(muted=()):
        return read_pcm(root,mixer.prepare(root,pid,inputs=inputs,settings=settings,muted=list(muted),duration=2))
    def amps(data):
        signal=data[24000:48000,0];t=np.arange(len(signal))/48000
        return [float(2*abs(np.sum(signal*np.exp(-2j*np.pi*hz*t)))/len(signal)) for hz in (440,880)]
    dry=amps(render())
    settings['tracks']={'audio:1':{'gain_db':-6,'solo':False,'inserts':[]},'audio:2':{'gain_db':3,'solo':False,'inserts':[]}}
    got=amps(render())
    assert np.allclose(np.array(got)/dry,[10**(-6/20),10**(3/20)],atol=1e-5)
    settings['tracks']['audio:2']['solo']=True
    solo=amps(render());assert solo[0]<1e-7 and solo[1]>.1
    assert np.max(np.abs(render(['audio:2'])))==0
    settings['tracks']['audio:2']['solo']=False
    muted=amps(render(['audio:1']));assert muted[0]<1e-7 and muted[1]>.1
    assert np.max(np.abs(render(['audio'])))==0
    # Removed/empty lanes retain their settings but must not load absent VSTs.
    settings['tracks']['audio:99']={'gain_db':0,'solo':True,'inserts':[{'plugin_id':'0'*64,'bypass':False,'parameters':{}}]}
    assert np.allclose(amps(render()),got,atol=1e-6)
    plugin=next((p for p in mixer.plugins() if p['name']=='TDR Nova'),None)
    if plugin:
        params={p['id']:p['raw'] for p in mixer.inspect(root,plugin['id'])['parameters']};params['output_gain_db']=.25
        settings['tracks']['audio:1']['inserts']=[{'plugin_id':plugin['id'],'parameters':params,'bypass':False}]
        wet=amps(render());assert .2<wet[0]/got[0]<.8
        assert abs(wet[1]/got[1]-1)<1e-5  # second lane must not pass through lane 1's VST


def test_timeline_rows_labels_and_shared_lane_mute(project):
    from bai_studio.v05.timeline.track_layout import add_audio_music_lane,set_label,set_lane_mute,get,set_flags
    from bai_studio.v05.timeline.arrangement import place
    root,pid=project;catalog=root/'studio_v05_catalog.json';layout=root/'studio_v05_track_layouts'
    d=add_audio_music_lane(layout,catalog,pid,0,'audio')
    d=set_label(layout,catalog,pid,d['revision'],'audio:2','台詞')
    inventory=[{'id':'lib:one','name':'声A.wav','kind':'audio','available':True}]
    place(root/'studio_v05_arrangements',catalog,pid,'lib:one','audio',1,2,0,inventory,layout_root=layout,lane=2,source_duration=4)
    d=set_lane_mute(layout,catalog,pid,d['revision'],'audio:2',True)
    row=next(r for r in mixer.timeline_tracks(root,pid)['rows'] if r['key']=='audio:2')
    assert row['name']=='台詞' and row['clips'][0]['name']=='声A.wav' and row['muted']
    d=set_flags(layout,catalog,pid,d['revision'],[],['music'])
    assert get(layout,catalog,pid)['muted_lanes']==['audio:2']
    with pytest.raises(ValueError,match='conflict'):set_lane_mute(layout,catalog,pid,0,'audio:2',False)
    with pytest.raises(ValueError):set_lane_mute(layout,catalog,pid,d['revision'],'audio:999',False)
    assert get(layout,catalog,pid)['revision']==d['revision']
    state=mixer.defaults(pid);state['tracks']={'audio:2':{'gain_db':-3,'solo':False,'inserts':[]}}
    saved=mixer.save(root,pid,0,state['channels'],True,state['tracks'])
    # Older clients that send only the bus fields retain per-lane settings.
    result=mixer.save(root,pid,saved['revision'],saved['channels'],True)
    assert result['tracks']==state['tracks']


def test_native_opaque_state_restores_dsp_and_generic_values_can_override(pcm):
    import numpy as np
    import hashlib
    import pedalboard
    root,pid,inputs=pcm
    plugin=next((p for p in mixer.plugins() if p['name']=='TDR Nova'),None)
    if not plugin:pytest.skip('Real installed TDR Nova required')
    native=pedalboard.load_plugin(plugin['path']);native.parameters['output_gain_db'].raw_value=.25
    raw=native.raw_state;sid=hashlib.sha256(raw).hexdigest();folder=root/'studio_v05_audio/states';folder.mkdir(parents=True)
    (folder/(sid+'.bin')).write_bytes(raw)
    state=mixer.defaults(pid);state['enabled']=True
    def process():return read_pcm(root,mixer.prepare(root,pid,inputs=inputs,settings=state,muted=[],duration=2))
    dry=process()
    insert={'plugin_id':plugin['id'],'bypass':False,'parameters':{},'state_id':sid};state['channels']['music']['inserts']=[insert]
    wet=process()
    # Musical lane carries 880Hz, independent voice lane 440Hz.
    def amp(data,hz):
        a=data[24000:48000,0];t=np.arange(len(a))/48000
        return float(2*abs(np.sum(a*np.exp(-2j*np.pi*hz*t)))/len(a))
    assert .2<amp(wet,880)/amp(dry,880)<.8
    assert abs(amp(wet,440)/amp(dry,440)-1)<1e-5
    insert['parameters']={'output_gain_db':.5}
    restored=process();assert abs(amp(restored,880)/amp(dry,880)-1)<.01
    (folder/(sid+'.bin')).write_bytes(b'corrupt')
    with pytest.raises(mixer.MixerError,match='状態'):
        process()
