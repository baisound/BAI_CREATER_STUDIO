# v0.5 動画・音声の素材尺に沿うタイムライン操作（Issue #77）

2026-10-24。`DATA-002` の追加部分接続。登録済み動画・音声を左の素材一覧から主タイムラインの対応行へドラッグすると、元素材の長さで任意位置に保存する。画像は従来どおり任意の長さにできる。動画・音声は左右端で使用範囲を短くでき、左端を動かすと `source_start` を更新する。左へ戻す場合も元素材の先頭を超えず、右端は元素材の末尾を超えない。旧クリップの `source_start` は0として読む。数値編集でも範囲外を拒否する。`media-info` は登録済みで利用可能な動画・音声だけを検査し、実ファイルパスを返さない。

画面プレビューは作品時刻から `source_start` を加えた媒体時刻へシークする。限定MP4は同じ位置から映像・音を切り出す。動画に音声が含まれる場合は従来どおり限定MP4出力を拒否し、音を黙って捨てない。配置と編集は作品のrevisionを照合し、原本媒体を変更しない。既存の保存形式はschema 1のまま任意項目を追加する。

## 検査

- Windows / インストール済みChrome / FFmpeg、隔離サーバーと一時素材。`python -m pytest -q tests/test_studio_v05_arrangement.py tests/test_studio_v05_timeline_view.py tests/test_studio_v05_render_range.py`：21件合格。
- `npm run typecheck`：合格（別作業ツリーの既存 `node_modules/.bin` をPATHへ追加）。JS構文検査：合格。
- `BAI_TEST_CONCURRENCY=1` で `node tests/run-guarded.cjs tests/studio-v05-media-specific-timeline.test.cjs tests/studio-v05-direct-timeline.test.cjs tests/studio-v05-media-render.test.cjs tests/studio-v05-project-media-preview.test.cjs`：4件合格。画像ドラッグ・複数行・保存再読込、動画/音声ドラッグ、音声の0.5秒左トリム、動画の1.5秒への右トリム、元尺超過の拒否、ページ再読込後の元位置・長さ、作品フレームでのプレビュー、60フレームの実MP4出力を確認。先頭0.5秒が無音の試験WAVをトリムし、MP4冒頭0.2秒のPCM RMSが300超であることを確認した。右トリムとページ再読込を追加した後の対象単独再実行も1件合格。`data/` 5ファイルと`exports/`無しのハッシュは前後一致。
- ソケット権限のため隔離試験は承認付き実行。初回の標準pytestは一時ディレクトリ権限で起動できず、承認付き再実行で合格。不存在の試験ファイルを指定した1回は0件実行で、上記の実在する3ファイルへ直して21件合格。標準PATHの`tsc`不足は既存依存のPATH追加で解消。

## 残る範囲

3D・モーション・カメラの直接配置、動画内音声の限定MP4、複数の動画・音声行、音量・フェード、Undo/Redo、WebMCP・標準MCP、Linux、実GPU、長尺/可変フレームレートの同期は未実装または未検証。画像・動画・音声を含む縦断経路全体を完成扱いにしない。
