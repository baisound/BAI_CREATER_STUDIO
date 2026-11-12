"""Only the two isolated recovery-test ports may enable these storage faults."""
import errno
import os
import sys
from pathlib import Path


def install():
    if os.environ.get('BAI_RENDER_FAILURE_TEST')!='render-protection-20261112':return
    if not sys.argv or sys.argv[-1] not in ('9260','9261'):return
    data=Path(os.environ.get('BAI_DATA_DIR','')).resolve()
    if not data.name.startswith('bai-p2-'):raise RuntimeError('Recovery fault injection requires an isolated harness directory')
    control=data/'render-fault-control.txt'
    def mode():
        try:return control.read_text(encoding='utf-8').strip()
        except OSError:return ''
    from bai_studio.v05.render import media_render as render, render_names as names
    atomic=render._atomic;name_atomic=names._atomic
    def write_job(path,value):
        selected=mode()
        if Path(path).parent==data/'studio_v05_media_renders'/'jobs':
            if selected=='all-job-writes' or selected=='queued' and value.get('status')=='queued':
                raise OSError(errno.ENOSPC,'isolated queued/history storage fault')
            if selected=='final-save-once' and value.get('status')=='succeeded':
                control.unlink();raise OSError(errno.ENOSPC,'isolated committed-job state storage fault')
        return atomic(path,value)
    def write_name(path,value):
        if mode()=='name-index' and Path(path).parent==data/'studio_v05_media_renders'/'names':
            raise OSError(errno.ENOSPC,'isolated name-index storage fault')
        return name_atomic(path,value)
    import threading
    from types import SimpleNamespace
    def thread(*args,**kwargs):
        if mode()=='thread-launch' and kwargs.get('target') is render._worker:
            class BrokenThread:
                def start(self):raise RuntimeError('isolated worker launch fault')
            return BrokenThread()
        return threading.Thread(*args,**kwargs)
    render._atomic=write_job;names._atomic=write_name
    render.threading=SimpleNamespace(Thread=thread)


install()
