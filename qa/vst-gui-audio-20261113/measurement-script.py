from pathlib import Path
import json,urllib.request,subprocess,hashlib,time,math
import numpy as np
out=Path('qa/vst-gui-audio-20261113');f=json.loads((out/'fixture-local.json').read_text(encoding='utf-8'))
def api(p,b=None):
 req=urllib.request.Request(f['base']+'/api/studio/v05/'+p,data=json.dumps(b).encode() if b is not None else None,headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=90) as r:return json.load(r)
saved=api('audio/settings?project_id='+f['project_id']);insert=saved['tracks']['audio:1']['inserts'][0]
assert saved['revision']==2 and insert.get('state_id')
changed=[k for k,v in f['parameters'].items() if v!=insert['parameters'].get(k)];assert changed==['output_gain_db'],changed
wet=api('audio/prepare',{'project_id':f['project_id']})
with urllib.request.urlopen(f['base']+wet['url'],timeout=20) as r:(out/'gui-minus3.wav').write_bytes(r.read())
def decode(p):
 b=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-f','f32le','-acodec','pcm_f32le','pipe:1'],creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));return np.frombuffer(b,dtype='<f4').reshape(-1,2)
def rms(a):return float(np.sqrt(np.mean(a[48000:240000].astype('float64')**2)))
before=decode(out/'baseline.wav');after=decode(out/'gui-minus3.wav');ratio=rms(after)/rms(before);delta=20*math.log10(ratio);assert abs(delta+3)<.1,(ratio,delta)
with urllib.request.urlopen(f['base']+'/api/library-assets/file/'+f['asset_id'],timeout=20) as r:original=r.read()
assert original==(out/'original.wav').read_bytes()
a=api('arrangement?id='+f['project_id']);r=api('timeline/range?id='+f['project_id'])
job=api('render/jobs',{'project_id':f['project_id'],'arrangement_revision':a['revision'],'range_revision':r['revision'],'resolution':'720p','name':'固有GUI変更後の実音声検証'})
(out/'pending-render.json').write_text(json.dumps(job,ensure_ascii=False,indent=2),encoding='utf-8')
report={'gui_input':'Real TDR Nova output knob drag through CUA; no parameter API writes after fixture setup','display_before_db':0,'display_after_db':-3,'changed_parameters':changed,'saved_revision':saved['revision'],'normalized_before':f['parameters']['output_gain_db'],'normalized_after':insert['parameters']['output_gain_db'],'state_id':insert['state_id'],'baseline_audio_id':f['baseline']['id'],'changed_audio_id':wet['id'],'rms_before':rms(before),'rms_after':rms(after),'amplitude_ratio':ratio,'measured_delta_db':delta,'expected_ratio':10**(-3/20),'lufs_before':f['baseline']['meters']['master']['lufs_integrated'],'lufs_after':wet['meters']['master']['lufs_integrated'],'original_unchanged':True,'original_sha256':hashlib.sha256(original).hexdigest(),'prepared_cache_reused':api('audio/prepare',{'project_id':f['project_id']})['id']==wet['id'],'mp4_job_id':job['id'],'saved_settings_unchanged_after_processing':api('audio/settings?project_id='+f['project_id'])==saved}
assert abs(report['lufs_after']-report['lufs_before']+3)<.1
(out/'measurements.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
