import subprocess,json,array,sys,math
from pathlib import Path
prefix='/mnt/d' if sys.platform!='win32' else 'D:'
root=Path(prefix+'/BAI/BAI_CREATER_STUDIO/worktrees/test-temp/long-webm-20261112')
source=root/'windows-native/real-derived-long-webm.webm'
def run(args):return subprocess.check_output(['ffmpeg','-hide_banner','-loglevel','error',*args])
def pcm(args):
 a=array.array('h');a.frombytes(run([*args,'-ar','8000','-ac','1','-f','s16le','pipe:1']));return a
ref=pcm(['-i',str(source),'-map','0:a:0'])
checks=[]
for opts in [[],['-copyts'],['-copyts','-start_at_zero']]:
 for start in [1.1,113.3]:
  actual=pcm([*opts,'-i',str(source),'-af',f'atrim=start={start}:duration=2,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo'])
  best=(-2,None)
  for shift in range(-160,161):
   dot=aa=bb=0
   for i in range(400,14000,4):
    a=ref[round(start*8000)+i+shift];b=actual[i];dot+=a*b;aa+=a*a;bb+=b*b
   corr=dot/math.sqrt(aa*bb or 1)
   if corr>best[0]:best=(corr,shift)
  checks.append({'options':opts,'start':start,'correlation':best[0],'sourceSampleOffset':best[1]})
frames=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','a:0','-read_intervals','%+0.1','-show_frames','-of','json',str(source)]))['frames']
result={'platform':sys.platform,'ffmpeg':subprocess.check_output(['ffmpeg','-version']).decode().splitlines()[0],'audioFirstFrame':frames[0],'trimChecks':checks}
(root/('diagnostic-'+sys.platform+'.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
