# 画像の複数行：両MCPと完成MP4（2026-11-06）

Issue #80/#81、DATA-002/CORE-004、出力の照合はRENDER-001/006。既存の手動画像行操作を、同じ保存APIから両MCPでも扱えるようにする。動画・音声などの行を増設する機能は追加しない。

## 操作

`bai_studio_track_layout_get` で作品の最新revisionと `image_lane_ids` を取得する。`bai_studio_track_layout_set` の共通入力は `project_id` と `revision`。

| action | 追加入力 | 結果 |
|---|---|---|
| 省略 / `update` | `order`, `heights` | 従来通り行順と高さを保存 |
| `add_image_lane` | なし | 新しい安定IDの画像行を末尾に追加（最大16行） |
| `remove_image_lane` | `lane` | 指定IDの空の画像行だけ削除 |

既存の呼出し形式は維持する。クリップを移すときは既存の `bai_studio_clip_edit` に `track:"image"` と移動先 `lane` を指定する。クリップのある行・最後の1行・存在しない行の削除、古いrevisionは拒否する。削除したIDを次の追加に再利用しない。原本画像と他クリップは変更しない。

標準MCPとWebMCPのアダプターはactionを既存の `/timeline/layout`・`/timeline/image-lanes`・`/timeline/image-lanes/remove` へ振り分け、action自体は送信本文から除く。APIの厳密な入力検査・ロック順・保存を維持する。WebMCPで従来誤ってreadOnlyと示していた更新ツールも、変更操作として登録する。

## 受入れ試験

`tests/studio-v05-image-lanes-native-mcp.test.cjs` は公式SDK 2.4の継続stdioクライアント（CP932起動条件）と、実Chromeの `--enable-features=WebMCPTesting` を使う。API注入は行わない。

同じ作品へ赤の背景画像1と緑の前景画像2を置き、前景クリップを画像3へ移して空の画像2を削除、新規画像4を追加する。行ID `[1,3,4]`、次ID5、クリップの時刻/長さ/ID/素材、行順/高さを保存再読込で照合する。占有行・消した行・最終行・古いrevision・不正actionと消した行への再配置の拒否後、保存が不変であることも確認する。

30fpsのF0〜59の完成H.264/AAC MP4を取得し、F0/15/30/45/59の中央画素が赤/緑/緑/赤/赤であること、60フレーム、MP4のhashを照合する。ネイティブ試験では再読込後の手動タイムラインの行IDと、同5時刻の実プレビュー画素も同じ色であることを確認する。入力2枚と登録後のSHA-256を照合し、共有data/exportsはガードで保護する。

初回試験はactionを既存APIへそのまま送り、厳密な本文検査で400を返して失敗した。アダプターでactionだけを除いて再実行した。制限付きPython試験は一時ディレクトリ権限で起動できず、許可された隔離実行で再試験した。途中の失敗や未実行を成功へ数えない。

## 最終結果と未検証

最終Windowsは新試験2成功・0失敗・0skip（公式SDK127ツール、ネイティブWebMCPは63ツールのまま）。既存の手動画像行/出力MCPは2成功、Pythonの画像行/配置は20成功。Ubuntu WSLは公式SDK/60F MP4が1成功、ネイティブブラウザーは1skip、Python20成功。型検査と差分空白検査は成功。Windows/Linux両方でガードdata5ファイル/exports無しと入力画像hashが一致した。

Windows実行: CHROMIUM_PATHをインストール済みChromeへ、BAI_NATIVE_WEBMCP=1、BAI_TEST_CONCURRENCY=1を指定し、`node tests/run-guarded.cjs tests/studio-v05-image-lanes-native-mcp.test.cjs`。既存回帰は `tests/studio-v05-direct-timeline.test.cjs tests/studio-v05-render-mcp.test.cjs`。Pythonは `python -X utf8 -m pytest -q tests/test_v05_track_layout.py tests/test_studio_v05_arrangement.py`。Ubuntuは同じ作業ツリーを/mnt/dで開き、ネイティブ用環境変数を付けずNodeとPythonを実行した。

生成した2枚と2秒の重なりに限定する。実ユーザー作品・全素材の複雑な重なり・Linuxブラウザー/ネイティブWebMCP・利用者のクライアント設定は未検証。画像行以外の追加/削除、全行操作のUndo/Redo、レイアウト変更を開いた別画面へ即時反映することは今回の完成主張に含めない。作品選択または再読込後に保存値を使用する。

## 前段のmain反映

PR #251をmain `bcac4c0`へマージし、利用者mainと開発ブランチをfast-forwardした。素材詳細の変更JS/CSSとv0.5ページは8765番の配信とバイト一致。利用者515ファイル・変更一覧は不変、集約hash `89b7599826236e16936fcb87ea33d705d29801d3515c1d8e78474896cfe4286d`。利用者データを書き換える実画面操作は行っていない。

モデル区分: 実装・検証・記録は標準モデル相当。
