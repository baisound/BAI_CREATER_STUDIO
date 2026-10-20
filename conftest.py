"""pytest 全体のデータ隔離（P2-WP-00a-1）。

どのプロジェクトモジュールの import よりも前に BAI_DATA_DIR を一時ディレクトリへ向け、
実 data/ を読み書きしない。セッション終了時に一時ディレクトリを削除する。
個別テストが独自の一時ディレクトリを使う場合は monkeypatch.setenv + importlib.reload。
"""
import json
import os
import shutil
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix='bai_test_data_')
(Path(_TMP) / 'integrated_v02').mkdir(parents=True, exist_ok=True)
(Path(_TMP) / 'integrated_v02' / 'catalog.json').write_text(
    json.dumps({'models': [], 'motions': []}), encoding='utf8')
os.environ['BAI_DATA_DIR'] = _TMP


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_TMP, ignore_errors=True)
