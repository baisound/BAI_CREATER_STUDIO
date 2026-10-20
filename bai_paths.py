"""データ保存先の解決（P2-WP-00a-1 / Phase E WP-03 の前倒し）。

環境変数 BAI_DATA_DIR があればそのディレクトリ、無ければ従来どおり <リポジトリ>/data。
呼び出しのたびに環境変数を読むので、import 後に変えても反映される。
"""
import os
from pathlib import Path

BASE = Path(__file__).resolve().parent


def data_dir() -> Path:
    override = os.environ.get('BAI_DATA_DIR')
    return Path(override).expanduser().resolve() if override else BASE / 'data'
