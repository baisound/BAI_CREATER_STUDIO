# LIP-004 VRM口形の一時実描画（Issue #175）

## 実装境界

登録VRM検査APIは、VRM 0.xのmesh番号・モーフ番号・0〜100のバインド重み、またはVRM 1.0のnode番号・モーフ番号・0〜1のバインド重みを、実在かつ0より大きいモーフ結合だけ `expressionBinds` に返す。元の解析hashは維持し、原本hashとの照合を続ける。GLTFLoaderが読み込んだObject3Dとのノード・メッシュ対応を、そのモデルインスタンスだけに保持する。画面に読み込んだバイト列のSHA-256を計算し、APIの原本hashと一致した場合だけ一時プレビューを許可する。

画面の7口形から選んだ表情と入力重みを、読み込み済みのモーフ値へ一時的に加える。バインド先の一部でも見つからない場合は全体を適用せず失敗表示する。元の値を保存し、明示的な復元、重み・割当の変更、時刻移動、モデル切替、画面閉鎖で戻す。sceneの表情キーや書き出しには混ぜない。VRM 1.0実例は母音の実バインドが空なので、一時表示もできない。材質表情バインドはこの段階の対象外。

## 検証

- `python -m pytest -q tests/test_studio_v05_vrm_maps.py tests/test_studio_v05_vrm_expressions.py`: 4/4成功。実VRM 0.xのAは mesh 0 / index 39 / 結合重み1、実VRM 1.0はモーフ結合なしを確認。原本2体のSHA-256は不変。
- `node --test tests/vrm-expression-preview.test.mjs`: 1/1成功。mesh/node番号の対応、同一モーフへの複数結合の加算、値の復元、バインド先不足時の部分適用なしを確認。
- `node tests/run-guarded.cjs tests/studio-v05-vrm-expression-ui.test.cjs tests/studio-v05-actual-preview.test.cjs`: 2/2成功。隔離Chrome 154.0.8037.100で、VRM 0.x原本SHA `21130746078bfaf0ce15f3438878381fe995ca14172df380b617ffbd754816c3` のAが7 primitiveに展開されることを観測。各モーフ値は基準0→重み0.8→0、重み0.4→0へ変わり、0.8/0.4の画面PNGは異なった。時刻移動とモデル切替でも0に復元。VRM 1.0原本SHA `0ff97e827ca8e9ad1a9db81795366319a478139fc3bc7e524fbb29605dcfee02` は未結合のためプレビュー不可。既存GLB表示は1/1成功。監視対象data 7ファイル・exports 0ファイルの前後hashは一致。
- `npm run typecheck`、Python/JS構文、JSON・差分検査を確認。

初回実VRM試験は mesh 0 が1個の描画物になると仮定して失敗した。GLTFLoaderはこの実モデルを7 primitiveへ展開するため、全7メッシュの値を照合する試験に直した。モデル・原本は変更していない。

一時表示は利用者による自然さの採用ではない。VRM表情のタイムラインキー・MP4書き出し、別VRMの有効結合、VRM材質表情、WebMCP/標準MCP、Linux、統合productionの保存耐障害性は未実装・未検証。LIP-004全体は未完成。
