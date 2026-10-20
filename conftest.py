"""pytest 全体のデータ隔離（P2-WP-00a-1）。

どのプロジェクトモジュールの import よりも前に BAI_DATA_DIR を一時ディレクトリへ向け、
実 data/ を読み書きしない。セッション終了時に一時ディレクトリを削除する。
個別テストが独自の一時ディレクトリを使う場合は monkeypatch.setenv + importlib.reload。

あわせて、実 data/ と exports/ のハッシュを「どのテストモジュールの import よりも前」と
「全テストの終了後」に取り、違えばセッションを失敗にする（テストの並び順に依存しない最後の砦）。
"""
import hashlib
import json
import logging
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


def close_handlers_under(directory):
    """directory の中のファイルを開いている logging のハンドラーを閉じて外す（P2-WP-00a-2）。

    Windows では開いたままのファイルは削除できず、%TEMP% にゴミが残る。閉じたハンドラー数を返す。
    """
    root = os.path.normcase(os.path.realpath(str(directory)))
    loggers = [logging.getLogger()] + [
        lg for lg in logging.Logger.manager.loggerDict.values() if isinstance(lg, logging.Logger)]
    closed = 0
    for lg in loggers:
        for handler in list(lg.handlers):
            target = getattr(handler, 'baseFilename', None)
            if not target:
                continue
            path = os.path.normcase(os.path.realpath(target))
            if path == root or path.startswith(root + os.sep):
                lg.removeHandler(handler)
                try:
                    handler.close()
                except Exception:
                    pass
                closed += 1
    return closed


def remove_tree(directory):
    """ハンドラーを閉じてから directory を削除する。消えていれば True、残れば警告を出して False。"""
    close_handlers_under(directory)
    shutil.rmtree(str(directory), ignore_errors=True)
    if Path(directory).exists():
        print('\n[cleanup] 警告: 一時ディレクトリを削除できませんでした。手で消してください: ' + str(directory))
        return False
    return True


def pytest_sessionfinish(session, exitstatus):
    remove_tree(_TMP)
    if hasattr(session.config, 'workerinput'):
        return  # pytest-xdist のワーカーでは比べない（親プロセスが全体の終了後に比べる）
    changed = [str(p) for p, before in zip(_REAL, _BEFORE) if _tree_hash(p) != before]
    if changed:
        print('\n[data isolation] 実データが変わりました: ' + ', '.join(changed))
        session.exitstatus = 1
