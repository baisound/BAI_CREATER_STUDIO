# v0.16.33–35 実モデル比較・校正警告・キー候補

## 追加
- 0.16.33: GLB/VRMを同一ファイルから2個ロードし、左静止姿勢・右は特定フレームの暫定回転キーを適用するフレームスライダーを追加。アニメーション連続再生ではない。実ブラウザ検証は未実施。
- 0.16.34: `blocked_for_production` の品質ゲートを強制し、基準姿勢・軸ひねり・VRM正規化・足IKが未校正であることを明記。校正処理そのものは実装していない。
- 0.16.35: `/api/retarget/keyframe-review` および `bai_retarget_keyframe_review` を追加。キーの入力検査・正規化・重複排除と、安全な未検証JSONのダウンロードを追加。VMDではない。

## 注意
実VRMの見た目・スキニング・リターゲットの正しさはまだ未検証。元のGLB/VRMは変更せず、Ollama不要。補正済みVMD出力を許可しない。

## テスト
`python -m unittest discover -s tests -q`、`node --check v01633_35_scrub.js`。API/MCP/ブラウザ実通信、Windows実機テストは別途必要。
