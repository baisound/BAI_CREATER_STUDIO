"""Local evaluated-scene capture and its immutable dependency receipt."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess


MAX_BYTES=512*1024*1024


def sha_file(path):
    sha=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):sha.update(block)
    return sha.hexdigest()


def evaluator_hash():
    root=Path(__file__).resolve().parents[3];sha=hashlib.sha256()
    for base in (root/'studio/js',root/'studio/v05/js',root/'tools'):
        for file in sorted(base.rglob('*')):
            if file.is_file() and file.suffix in ('.js','.mjs','.cjs','.py'):
                sha.update(file.relative_to(root).as_posix().encode());sha.update(bytes.fromhex(sha_file(file)))
    return sha.hexdigest()


def dependencies(data,project_id,inputs):
    data=Path(data).resolve();paths={Path(row['path']).resolve() for row in inputs}
    # Persisted per-project sources include FK/IK modes, lip adoption and morph maps.
    for directory in data.glob('studio_v05_*'):
        if not directory.is_dir() or directory.name in ('studio_v05_blender_sessions','studio_v05_media_renders'):continue
        direct=directory/(project_id+'.json')
        if direct.is_file():paths.add(direct.resolve())
        project_folder=directory/project_id
        if project_folder.is_dir():paths.update(p.resolve() for p in project_folder.rglob('*') if p.is_file())
    result=[]
    for path in sorted(paths):
        if not path.is_relative_to(data):raise ValueError('登録素材の参照が保存領域外です')
        result.append({'file':path.relative_to(data).as_posix(),'sha256':sha_file(path)})
    if sum(p.stat().st_size for p in paths)>1024*1024*1024:raise ValueError('元素材とテクスチャの合計が1GiBを超えます。対象モデルを減らしてください。')
    return {'files':result,'evaluator_sha256':evaluator_hash()}


def capture(folder,server_port):
    from .blender_addons import AddonError,script
    node=shutil.which('node')
    if not node or type(server_port) is not int or not 1<=server_port<=65535:
        raise AddonError('scene_capture_unavailable','StudioのローカルサーバーとNode/Chromeが必要です。サーバーから再準備してください。')
    from ..render.process_scope import RenderProcessScope
    try:
        with RenderProcessScope() as scope:
            process=scope.spawn([node,str(script('capture_cinemaoperator_geometry.cjs')),str(folder)],
                stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),start_new_session=os.name!='nt')
            try:
                stdout,stderr=process.communicate(timeout=600)
            except BaseException:
                if os.name!='nt':
                    import signal
                    os.killpg(process.pid,signal.SIGKILL)
                else:process.kill()
                process.communicate()
                raise
            result=subprocess.CompletedProcess(process.args,process.returncode,stdout,stderr)
    except subprocess.TimeoutExpired as exc:
        raise AddonError('scene_capture_failed','形状の準備が時間内に終わりませんでした。終了Fを短くして再準備してください。') from exc
    (folder/'geometry-capture.log').write_bytes(result.stdout+b'\n'+result.stderr)
    if result.returncode:
        message=result.stderr.decode('utf-8',errors='replace').splitlines()
        raise AddonError('scene_capture_failed','形状を準備できません。'+(message[0][:1000] if message else '登録素材と区間を確認してください。'))
    if not (folder/'geometry.json').is_file():raise AddonError('scene_capture_failed','形状の準備が完了していません。再準備してください。')
    movie=json.loads((folder/'geometry.json').read_text(encoding='utf-8'))
    if not movie.get('meshes') or sum(p.stat().st_size for p in folder.iterdir() if p.suffix in ('.mdd','.png') or p.name=='geometry.json')>MAX_BYTES:
        raise AddonError('scene_capture_failed','形状コピーの上限512MiBを超えています。終了Fを短くして再準備してください。')
    return movie
