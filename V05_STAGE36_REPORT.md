# BAI Creator Studio v0.5 — 枝番36

## 実装範囲
- モデルとボーンを指定し、モーション評価後にThree.jsのワールド座標を取得する接続を追加。
- カメラの診断スナップショットとモデル姿勢イベントの秒数・作品IDが一致した場合のみ対象位置を発行。
- 既存のフォーカス追従処理はこの位置からピント距離を算出する。旧プレイヤーのアニメーション実装は維持。
- モデル破棄時・作品切り替え時の接続解除と、未登録ボーン・未読込モデル等の診断を追加。

## 検証
- `node test_v05_model_bone_focus_v36.mjs`: PASS（模擬Three.js 8 assertions）
- `node --check studio/v05/js/model-bone-focus-v36.js`: PASS
- `node --check studio/v05/js/actual-motion-loader-v22.js`: PASS

## 未完了・リスク
- 実VRM/PMXモデルとGPUによるWebGL表示を使ったE2E検証は未実施。
- フォーカス用ボーン選択UI／外部API・MCP・WebMCPのボーン選択操作は未実装。
- 共通時刻のイベント順序や非同期描画による実際のフォーカスとDOFの一致は未検証。
- GPUぼかしと焦点診断の画像レベルでの同一性は未確認。
- 既存の大量の未コミット変更は触らず保持する。
