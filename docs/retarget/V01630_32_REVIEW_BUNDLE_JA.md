# v0.16.30〜v0.16.32 暫定転写レビュー

## 実装
- v0.16.30: GLB/VRMの転写候補をフレーム・Humanoidロール単位で整理する一覧 (`timeline`)
- v0.16.31: 角速度、未サンプリング区間、未対応骨を含む品質レポート。高角速度720°/秒は注意喚起の閾値であり品質保証ではない
- v0.16.32: ローカル画面で読み取り専用JSON検証パッケージを取得・ダウンロードする操作
- HTTP: `POST /api/retarget/review-bundle`
- WebMCP / 標準MCP: `bai_retarget_review_bundle`

## 制約（必読）
このJSONはアニメーション本体ではなく、未校正の候補回転と検証情報を示すレポートである。VRM標準化姿勢、関節のひねり、スキニング、座標系自動校正、root移動、position/scale、実PMX、足IK、VMD出力には対応しない。ソースキー時刻の評価であり密な全フレーム再生ではない。`quality_gate=blocked_for_production` は必ず維持する。

## 検証
単体テストを含む全116件成功。Python構文検査・JS構文検査成功。Windows実機・ブラウザ描画・MCP通信実機テストは未実施。
