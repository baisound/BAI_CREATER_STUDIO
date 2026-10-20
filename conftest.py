"""pytest 全体のデータ隔離（P2-WP-00a-1）。

どのプロジェクトモジュールの import よりも前に BAI_DATA_DIR を一時ディレクトリへ向け、
実 data/ を読み書きしない。セッション終了時に一時ディレクトリを削除する。
個別テストが独自の一時ディレクトリを使う場合は monkeypatch.setenv + importlib.reload。

あわせて、実 data/ と exports/ のハッシュを「どのテストモジュールの import よりも前」と
「全テストの終了後」に取り、違えばセッションを失敗にする（テストの並び順に依存しない最後の砦）。
"""
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path

_REPO = Path(__file__).resolve().parent


def _tree_hash(path):
    if not path.exists():
        return 'absent'
    digest = hashlib.sha256()
    for f in sorted(p for p in path.rglob('*') if p.is_file()):
        digest.update(str(f.relative_to(path)).replace('\\', '/').encode('utf8'))
        digest.update(b'\0')
        digest.update(f.read_bytes())
        digest.update(b'\0')
    return digest.hexdigest()


_REAL = (_REPO / 'data', _REPO / 'exports')
_BEFORE = tuple(_tree_hash(p) for p in _REAL)

_TMP = tempfile.mkdtemp(prefix='bai_test_data_')
(Path(_TMP) / 'integrated_v02').mkdir(parents=True, exist_ok=True)
(Path(_TMP) / 'integrated_v02' / 'catalog.json').write_text(
    json.dumps({'models': [], 'motions': []}), encoding='utf8')
os.environ['BAI_DATA_DIR'] = _TMP


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_TMP, ignore_errors=True)
    if hasattr(session.config, 'workerinput'):
        return  # pytest-xdist のワーカーでは比べない（親プロセスが全体の終了後に比べる）
    changed = [str(p) for p, before in zip(_REAL, _BEFORE) if _tree_hash(p) != before]
    if changed:
        print('\n[data isolation] 実データが変わりました: ' + ', '.join(changed))
        session.exitstatus = 1
