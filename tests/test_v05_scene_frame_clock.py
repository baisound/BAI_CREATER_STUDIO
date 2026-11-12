"""Real scene intermediate + production filter graph, including short ranges."""
import shutil
import pytest
from bai_studio.v05.render import media_render as render


def test_scene_sidecars_are_not_unreadable_render_jobs(tmp_path):
    import json
    from bai_studio.projects.catalog import _atomic
    jid='a'*32;(tmp_path/'jobs').mkdir()
    # These real capture-sidecar names live beside durable job records.
    for suffix in ['scene-config','scene-manifest']:
        _atomic(tmp_path/'jobs'/f'{jid}.{suffix}.json',{'projectId':'p'})
    _atomic(tmp_path/'jobs'/f'{jid}.json',{'id':jid,'project_id':'p','status':'failed','created_at':1})
    (tmp_path/'jobs'/('b'*32+'.json')).write_text('broken',encoding='utf8')
    result=render.list_jobs(tmp_path,'p')
    assert [j['id'] for j in result['jobs']]==[jid]
    assert result['unreadable_count']==1  # only the damaged UUID job


@pytest.mark.parametrize('fps',[24,29.97,30,60])
@pytest.mark.parametrize('frames',[1,3,17])
def test_scene_overlay_keeps_every_saved_frame(tmp_path,fps,frames):
    ffmpeg,probe=shutil.which('ffmpeg'),shutil.which('ffprobe')
    if not ffmpeg or not probe:pytest.skip('Real FFmpeg/ffprobe required')
    caps=render.capabilities(ffmpeg,probe,tmp_path/'caps');assert caps['available'],caps['reason']
    scene=tmp_path/'scene.mkv';output=tmp_path/'output.mp4';script=tmp_path/'graph.filter'
    made=render._run([ffmpeg,'-v','error','-f','lavfi','-i',f"color=black:s=16x16:r={fps},format=rgba,geq=r='8*N':g=80:b=140:a=128",
                      '-frames:v',str(frames),'-an','-c:v','ffv1','-level','3','-pix_fmt','bgra','-y',str(scene)],30)
    assert made.returncode==0,made.stderr
    start=15;end=start+frames
    graph,count,duration=render._graph([],fps,16,16,start,end,scene_input_index=2)
    script.write_text(graph,encoding='utf8')
    run=render._run([ffmpeg,'-v','error','-copyts','-f','lavfi','-i',f'color=magenta:s=16x16:r={fps}:d={render._num(end/fps)}',
                     '-f','lavfi','-i',f'anullsrc=r=48000:cl=stereo:d={render._num(end/fps)}','-i',str(scene),
                     caps['filter_complex_option'],str(script),'-map','[vout]','-map','[aout]',
                     '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-frames:v',str(count),
                     '-t',render._num(duration),'-y',str(output)],30)
    assert run.returncode==0,run.stderr
    assert render._verify(probe,output,frames,duration,16,16,fps)['frames']==frames
    # Distinct frame colors also detect a repeated/reordered end frame.
    import subprocess
    decoded=subprocess.run([ffmpeg,'-v','error','-i',str(output),'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,check=True).stdout
    assert len(decoded)==frames*16*16*3
    reds=[sum(decoded[i*768:(i+1)*768:3])/256 for i in range(frames)]
    assert all(b>a+1 for a,b in zip(reds,reds[1:])),reds
