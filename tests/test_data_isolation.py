"""P2-WP-00a-1 データ隔離：テストが実 data/ と exports/ に触れないことを確かめる。"""
import hashlib
import importlib
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import bai_paths  # noqa: E402

# conftest.py が import 前に設定した値（セッション開始時点で記録）
SESSION_DIR = os.environ.get('BAI_DATA_DIR')


def tree_hash(path):
    path = Path(path)
    if not path.exists():
        return 'absent'
    digest = hashlib.sha256()
    for f in sorted(p for p in path.rglob('*') if p.is_file()):
        digest.update(str(f.relative_to(path)).replace('\\', '/').encode('utf8'))
        digest.update(b'\0')
        digest.update(f.read_bytes())
        digest.update(b'\0')
    return digest.hexdigest()


# モジュール読込時＝テスト収集時＝全テスト実行前のハッシュ
REAL_DATA = ROOT / 'data'
REAL_EXPORTS = ROOT / 'exports'
BEFORE = (tree_hash(REAL_DATA), tree_hash(REAL_EXPORTS))


def test_conftest_points_to_temp_dir():
    assert SESSION_DIR
    assert Path(SESSION_DIR).resolve() != REAL_DATA.resolve()
    assert bai_paths.data_dir() == Path(SESSION_DIR).resolve()


def test_default_is_repo_data(monkeypatch):
    monkeypatch.delenv('BAI_DATA_DIR', raising=False)
    assert bai_paths.data_dir() == ROOT / 'data'


def test_modules_resolve_from_data_dir():
    import server
    import diagnostic_logging
    import qa_capture
    base = bai_paths.data_dir()
    assert server.DATA == base
    assert server.RETARGET_FILE == base / 'retarget_profiles.json'
    assert server.AI_CONFIG == base / 'bai_ai_config.json'
    assert diagnostic_logging.LOG_DIR == base / 'logs'
    assert qa_capture.ROOT == base / 'ui_qa'
    for name in ('FILES', 'MMD_DIR', 'META', 'FAVORITES', 'PROJECT', 'CUSTOM_ASSETS',
                 'CUSTOM_INDEX', 'EDITOR_FILE', 'LAYER_FILE', 'CONVERT_STATUS', 'SYNC_FILE'):
        assert str(getattr(server, name)).startswith(str(base)), name


def test_reload_without_env_uses_repo_data(monkeypatch):
    # 後方互換：環境変数が無ければ従来の場所（パス計算のみ。mkdir を伴う import はしない）
    monkeypatch.delenv('BAI_DATA_DIR', raising=False)
    importlib.reload(bai_paths)
    try:
        assert bai_paths.data_dir() == ROOT / 'data'
    finally:
        monkeypatch.setenv('BAI_DATA_DIR', SESSION_DIR)
        importlib.reload(bai_paths)


def test_real_data_and_exports_unchanged():
    assert (tree_hash(REAL_DATA), tree_hash(REAL_EXPORTS)) == BEFORE
