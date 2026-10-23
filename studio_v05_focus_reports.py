"""Versioned, project-scoped focus interval diagnostic reports. No simulated GPU results."""
import json, os, tempfile, threading, math, re
from pathlib import Path
from studio_v05_arrangement import _project
LOCK=threading.RLock()
ID=re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
class FocusReportError(ValueError): pass
def _path(root,project_id):
    if not isinstance(project_id,str) or not ID.fullmatch(project_id): raise FocusReportError('invalid_project_id')
    return Path(root)/(project_id+'.json')
def read(root,catalog,project_id):
    _project(catalog,project_id); path=_path(root,project_id)
    if not path.exists(): return {'project_id':project_id,'revision':0,'reports':[]}
    try:
        data=json.loads(path.read_text(encoding='utf-8'))
        if data['project_id']!=project_id or type(data['revision']) is not int or not isinstance(data['reports'],list):raise ValueError()
        return data
    except (KeyError,TypeError,ValueError) as e:raise FocusReportError('corrupt_report_store_original_preserved') from e
def _validate(report):
    if not isinstance(report,dict):raise FocusReportError('invalid_report')
    for key in ('startFrame','endFrame','fps','count','maximumError','problemFrames'):
        if key not in report:raise FocusReportError('missing_'+key)
    a,b=report['startFrame'],report['endFrame']
    if type(a) is not int or type(b) is not int or a<0 or b<a or b-a>9999:raise FocusReportError('invalid_frame_range')
    if type(report['fps']) not in (int,float) or not math.isfinite(report['fps']) or not 1<=report['fps']<=240:raise FocusReportError('invalid_fps')
    if type(report['count']) is not int or report['count']!=b-a+1:raise FocusReportError('invalid_count')
    if type(report['maximumError']) not in (int,float) or not math.isfinite(report['maximumError']) or report['maximumError']<0:raise FocusReportError('invalid_error')
    if not isinstance(report['problemFrames'],list) or len(report['problemFrames'])>report['count']:raise FocusReportError('invalid_problem_frames')
    for item in report['problemFrames']:
        if not isinstance(item,dict) or type(item.get('frame')) is not int or not a<=item['frame']<=b or not isinstance(item.get('reason'),str) or len(item['reason'])>160:raise FocusReportError('invalid_problem_frame')
        err=item.get('error')
        if err is not None and (type(err) not in (int,float) or not math.isfinite(err) or err<0):raise FocusReportError('invalid_frame_error')
    samples=report.get('samples')
    if samples is not None:
        if not isinstance(samples,list) or len(samples)!=report['count']:raise FocusReportError('invalid_samples_count')
        for i,sample in enumerate(samples):
            if not isinstance(sample,dict) or type(sample.get('frame')) is not int or sample['frame']!=a+i or type(sample.get('ok')) is not bool:raise FocusReportError('invalid_sample_frame')
            error=sample.get('error')
            if sample['ok']:
                if type(error) not in (int,float) or not math.isfinite(error) or error<0 or type(sample.get('withinTolerance')) is not bool:raise FocusReportError('invalid_sample_error')
            elif error is not None or not isinstance(sample.get('reason'),str) or not sample['reason'] or len(sample['reason'])>160:raise FocusReportError('invalid_sample_failure')
    if report.get('evaluatedAgainstGPU') is not False:raise FocusReportError('gpu_claim_not_verified')
    return {**{k:report[k] for k in ('startFrame','endFrame','fps','count','maximumError','problemFrames','evaluatedAgainstGPU')}, **({'samples':samples} if samples is not None else {})}
def save(root,catalog,project_id,revision,report):
    if type(revision) is not int or revision<0:raise FocusReportError('invalid_revision')
    cleaned=_validate(report)
    with LOCK:
        old=read(root,catalog,project_id)
        if old['revision']!=revision:raise FocusReportError('revision_conflict')
        new={'project_id':project_id,'revision':revision+1,'reports':(old['reports']+[{'id':'focus-%06d'%(revision+1),**cleaned}])[-30:]}
        root=Path(root);root.mkdir(parents=True,exist_ok=True)
        fd,temp=tempfile.mkstemp(prefix='.focus-report-',suffix='.tmp',dir=root)
        try:
            with os.fdopen(fd,'w',encoding='utf-8') as f:
                json.dump(new,f,ensure_ascii=False,allow_nan=False);f.flush();os.fsync(f.fileno())
            os.replace(temp,_path(root,project_id))
        finally:
            if os.path.exists(temp):os.unlink(temp)
        return new
