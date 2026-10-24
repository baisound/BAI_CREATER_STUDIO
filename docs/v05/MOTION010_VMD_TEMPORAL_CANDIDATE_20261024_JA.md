# MOTION-010 時間変化FK補正の別名VMD候補

2026-10-24、Issue #106。作品FPSで保存した複数FKキー、レイヤーの区間・なじませをVMDの30fps時刻へ写し、元VMDとは別名の**検証前候補**を作る。前段の全区間一定補正は、元の骨キーと補間を維持する既存経路のまま扱う。どちらも原VMD/PMXを変更しない。

時間変化候補は原VMD骨キーの時刻と補間を保持し、補正キー・区間境界・なじませ境界を30fpsへ丸めた時刻に追加する。Three.js MMDLoaderは**隣接するVMDフレーム間で前キーを保持**するため、対象骨を機械的に全30fpsへ密化すると、元の曲線運動まで60fpsの中間時刻で大きく変わる。原キー間隔を残し、候補を読み戻して全作品フレームの局所位置・回転と比較する。最大位置差が`1e-3` MMD単位、最大角度差が`0.01°`を超えればHTTP 422で候補作成を拒否する。エラーは最大値と該当作品フレームを示す。1作品クリップのVMD期間を最大18000フレーム、骨サンプル25万件、比較12万件に制限し、長尺ジョブ化は後続とする。

候補のメタデータは`sampling_report`にVMD時刻幅、追加/更新した骨サンプル数、比較した作品フレーム数、最大誤差と時刻を持つ。画面もその結果と、実PMX往復・作品配置が未確認であることを表示する。登録素材や作品のモーション行へ自動昇格しない。

実PMXで3本のVMDを同じモデルへ読み込む試験により、3本目の初期姿勢へ前クリップの補正が残る問題を検出した。各VMDプレイヤーの生成前に共有モデルを基準姿勢へ戻す修正を加えた。これは既存の複数クリップ再生でも必要な初期条件であり、補正データ・rig・weightsには触れない。

## 検証

- `BAI_REAL_MMD_DATA`に登録済み実素材を指定し、`python -m pytest -q tests/test_studio_v05_vmd_temporal.py tests/test_studio_v05_vmd_constant.py tests/test_studio_v05_vmd_rewrite.py tests/test_v0163_vmd_readback.py`：29件成功。60→30fpsの標本化、1作品フレームの位置/角度スパイク拒否、実VMDの元補間・非骨suffix保持、原本不変を確認。
- `BAI_TEST_CONCURRENCY=1 node tests/run-guarded.cjs tests/studio-v05-vmd-constant-real.test.cjs tests/studio-v05-pmx-fk-edit-real.test.cjs`：隔離Chrome/SwiftShaderで2件成功。実PMX＋実VMDで、一定補正300 VMDフレーム、時間変化補正600作品フレーム、保存再読込、画面の誤差表示を確認。時間変化候補と画面元動作の頭骨ワールド位置の最大成分差`1.5892113248506048e-7`、四元数の最大成分差`2.97766233892105e-8`。本番`data/`7ファイルと`exports/`0ファイルの前後ハッシュ一致。元PMX SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`、元VMD SHA-256 `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234`。
- `npm run typecheck`、Python/Node構文、`git diff --check`成功。初回の隔離ブラウザ起動はsandboxの通信制限で起動失敗し、許可済み実行で再試験した。最初の実PMX比較は3本目に前クリップの姿勢が残り失敗し、読込前の姿勢リセットを加えて再試験で通した。

## 残る確認

局所骨チャネルの計算ゲートは実PMXのIK/grant結果と同義ではない。今回の実PMX往復は1モデル・頭骨1本・60fps作品・10秒・SwiftShaderに限る。他骨、足IK、別モデル、別FPS、区間/なじませの実PMX往復、長尺ジョブ、実GPU、Linux、標準MCP実呼出し、候補採用/作品配置、Owner採用は未確認。要件`MOTION-010`全体は「要検証」のまま。

画像・動画成果物は作成しておらず、Eagle登録対象はない。モデル区分：設計判断と実装・試験に標準モデル区分を使用。
