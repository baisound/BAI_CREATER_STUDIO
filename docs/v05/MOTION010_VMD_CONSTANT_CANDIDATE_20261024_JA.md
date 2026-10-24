# MOTION-010 全区間一定補正の別名VMD候補

2026-10-24、Issue #106。保存済みのPMX＋VMDクリップで、対象骨ごとに補正キーが1個だけ、レイヤーが全区間・なじませなし・非ミュートの場合に限定し、別名VMD候補を作る。旧VMDの骨キーの位置・四元数へ、v0.5プレビューと同じ重み付き差分を合成する。元の骨キー時刻と補間を保ち、元にない対象骨はF0を追加する。Three.js MMDParserの左右座標変換に合わせ、位置Zと四元数X/Yを戻してから書く。

作品・クリップ・モデルの実在、ロック、原PMX/VMDの登録IDとSHA-256、作品FPSと配置、保存revision、レイヤーの全区間一定条件を確認する。候補は`data/studio_v05_vmd_candidates/<作品UUID>/<候補UUID>.vmd`へ別名保存し、同名置換や原本変更を行わない。画面のリグ区画と共通API、WebMCP、標準MCPから同じ候補作成APIを使う。候補のメタデータは`candidate_requires_real_pmx_validation`、`registered_asset=false`、`placed_in_project=false`とし、ダウンロードリンクにも「検証前」と表示する。時間変化するキー・区間/なじませ・ミュートなどは拒否する。

## 実行した試験

- `python -m pytest -q tests/test_studio_v05_vmd_constant.py tests/test_studio_v05_vmd_rewrite.py tests/test_v0163_vmd_readback.py`: 24件成功。全区間一定の合成、複数レイヤー、元VMDの未編集骨/非骨suffix保持、実VMD、異常入力を検査。
- `BAI_TEST_CONCURRENCY=1 node tests/run-guarded.cjs tests/studio-v05-vmd-constant-real.test.cjs tests/studio-v05-pmx-fk-edit-real.test.cjs`: 2件成功。隔離Chrome/SwiftShaderで実PMX＋実VMDを使用。元VMD＋保存補正と候補VMDをF0〜299の300フレームで比較し、頭骨の局所位置最大差`1.1920928966180355e-8`、四元数成分最大差`6.789418194319552e-8`。候補APIのSHA-256、ダウンロード、画面ボタン、旧revisionと不正IDの拒否、時間変化キーの拒否、既存FK数値編集の回帰を確認。元PMX SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`、元VMD SHA-256 `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234`。`run-guarded`で利用者`data/`7ファイルと`exports/`0ファイルの前後ハッシュ一致。
- `npm run typecheck`、変更Python/JSの構文確認、`git diff --check`成功。初回のブラウザ試験はテスト終了時の`server.close`誤呼出しで失敗し、`server.stop`へ直して再実行した。API試験の初回は候補を作業ツリーの`exports/`へ置き、ガードが新規ファイルを検出した。孤立した4試験ファイルだけを確認して削除し、隔離`DATA`への保存に変更して再実行した。

## 残る範囲

今回の実PMX比較は1モデル・頭骨1本・300 VMDフレーム・一定補正・SwiftShader。別モデル/別骨/足IKの候補再生、30fps以外の作品フレームでの誤差、時間変化する補正、長尺、不正CP932ヘッダーの長尺VMD、実GPU、Linux、MCP実呼出し、全フレーム実PMX判定の一般化、候補の採用/作品配置、Owner採用は未確認。候補ファイルは実際に生成できるが、完成VMD・承認済み素材へ自動昇格しない。画像・動画成果物はないためEagle登録対象はない。

モデル区分: 標準モデル区分で実装・試験・記録を実施。
