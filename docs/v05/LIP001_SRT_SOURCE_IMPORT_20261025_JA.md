# LIP-001 日本語SRT原本の作品登録（Issue #187）

## 接続した範囲

作品IDを指定した `POST /api/studio/v05/srt/import` は、選択済みのSRTバイト列だけを受ける。クエリには `project_id`、`revision`、`name`、`encoding`（`utf-8`/`utf-8-bom`/`cp932`）を明示する。受け付ける原本は8 MiB以下、キューは最大10,000件。原本を変更せず作品専用の `data/studio_v05_srt_sources/<project_id>/sources/<sha256>.srt` に保存し、独立revisionの索引にSHA-256、元の名前、文字コード、各キューの `startMs` と `endMs`、本文を記録する。

`GET /api/studio/v05/srt/sources?project_id=...` は原本のハッシュを読み直し、`valid`/`changed`/`missing` を返す。番号の重複、終了<=開始、本文欠落、文字コード不一致は登録前に拒否する。時間が重なるキューは原時刻を変えず `time_overlap` 警告を返す。本文・利用者のファイルパスは診断ログへ送らない。

これは原本登録と読取APIだけの限定実装。手動UI、読みの確定、かなから口形候補、別名VMD書出・再読込、WebMCP/標準MCP、統合production.lip、Linuxと実ユーザーSRTの確認は続く。LIP-001の完成判定は行わない。

## 試験

- `python -m pytest -q tests/test_studio_v05_srt_sources.py`: 2/2成功（隔離WindowsループバックHTTP）。CP932/UTF-8 BOM解析、開始・終了ミリ秒、重なり警告、作品分離、保存再読込、revision競合、誤文字コード・不正名・未登録作品・原本ハッシュ変化時の拒否を確認。
- `python -m py_compile studio_v05_srt_sources.py server.py`、`git diff --check`: 成功。
- 原本試験は人工SRTで、一時作品内の登録前後の原本バイト一致を確認。実ユーザー素材、ブラウザー画面とVMD出力は未試験。
