"""Guarded project snapshot activation with durable pre-switch backup.

Limitations: underlying legacy two-file save_bundle is best-effort rollback, not
power-loss atomic. This module never deletes the original snapshot.
"""
import json, os, uuid
from pathlib import Path
from datetime import datetime, timezone
from project_state_bundle import read_bundle, save_bundle, bundle_revision, validate_bundle
from studio_project_snapshots import read as read_snapshot

class ActivationConflict(ValueError):pass

def preview(snapshot_dir, catalog, project_id, live_combination, live_camera):
    snap=read_snapshot(snapshot_dir,catalog,project_id)
    desired=validate_bundle(snap['bundle'])
    live=read_bundle(live_combination,live_camera,strict=True)
    return {'project_id':project_id,'saved_at':snap['saved_at'], 'expected_revision':bundle_revision(live),
            'changes':{part:live.get(part)!=desired.get(part) for part in ('combination','camera','workspace')},
            'snapshot_is_read_only':True, 'requires_explicit_activation':True}

def activate(snapshot_dir, catalog, project_id, live_combination, live_camera, backup_dir, expected_revision):
    if not isinstance(expected_revision,str) or not expected_revision:raise ActivationConflict('Expected revision required')
    snap=read_snapshot(snapshot_dir,catalog,project_id)
    desired=validate_bundle(snap['bundle'])
    current=read_bundle(live_combination,live_camera,strict=True)
    if bundle_revision(current)!=expected_revision:raise ActivationConflict('Live project changed; preview again')
    # Refuse activation over uninitialized legacy state: no reliable rollback target.
    if current.get('combination') is None:raise ActivationConflict('Live combination uninitialized')
    current_clean=validate_bundle({k:current[k] for k in ('schema','combination','camera','workspace') if k in current and (k!='workspace' or current[k] is not None)})
    backup_dir=Path(backup_dir);backup_dir.mkdir(parents=True,exist_ok=True)
    backup_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex
    dest=backup_dir/(backup_id+'.json');temp=backup_dir/(backup_id+'.tmp')
    try:
        with temp.open('w',encoding='utf8') as f:
            json.dump({'schema':1,'before_project_activation':project_id,'bundle':current_clean,'revision':expected_revision},f,ensure_ascii=False,indent=2)
            f.flush();os.fsync(f.fileno())
        os.replace(temp,dest)
    finally:
        temp.unlink(missing_ok=True)
    save_bundle(live_combination,live_camera,desired)
    return {'ok':True,'project_id':project_id,'backup_file':dest.name,'revision':bundle_revision(read_bundle(live_combination,live_camera,strict=True)),
            'warning':'Legacy multi-file save is not power-loss atomic.'}
