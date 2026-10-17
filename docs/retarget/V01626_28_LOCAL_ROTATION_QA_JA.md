# BAI Creator Studio v0.16.26〜v0.16.28 まとめ

## v0.16.26 — 階層ローカル回転試算
- 既存のGLB回転キー補間と親階層ワールド回転を流用。
- 対応するVRM Humanoidロールについて共通座標系を確認した場合だけ、転写先の基準ワールド回転との差から暫定ローカル四元数を計算。
- 親ロールが存在しない、または校正できない場合はスキップし、勝手に補間・採用しない。

## v0.16.27 — UI / API / WebMCP / 標準MCP
- POST `/api/retarget/vrm-local-transfer-preview`: 登録済みVRM/GLB ID2件と `coordinate_convention_confirmed=true` 必須。
- WebMCP / STDIO: `bai_retarget_vrm_local_transfer_preview`。
- 手動UI: 「VRMローカル回転の仮転写・品質検査（読取のみ）」。

## v0.16.28 — 品質ゲート
- `quality_gate=blocked_for_production` とサンプル数・除外数・警告を返す。
- 実ボーンのスキニング・inverseBindMatrices・VRM正規化・関節軸のひねり・密なフレーム評価・CUBICSPLINE・PMX/VMD出力は**未対応**。
- 既存のモデル・プロジェクト・素材は変更しない。Ollama/AIに依存しない。
- 数値算出が成功しても実VRMへの適用やVMD出力を許可しない。

## 検証
- Python 111件の自動テスト成功（テスト検出範囲の結果）。
- JavaScript・Python構文検査通過。
- Windows/ブラウザ実操作、VRM描画、MCP実通信、実モデルでの見た目は未検証。
- 元ZIP内のGit履歴とカレントのソース状態に差分があり、正当な新規Gitコミット・タグは未作成。配布ZIPは累積パッチ版。
