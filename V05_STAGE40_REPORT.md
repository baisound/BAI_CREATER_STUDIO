# v0.5 UI Overhaul 40 実装記録

## 実装
- `studio/v05/js/focus-visual-audit-v40.js`: カメラ・ボーンの同時刻スナップショットから距離誤差・赤緑の診断区分を決定。
- `analyzeFocusInterval()`: 複数フレームを同一評価器で集計。時刻・作品不一致を無効結果として記録。
- `bai:focus-visual-diagnostic-v40` イベントとして画面・診断UIが結果を受け取れるようにした。
- 既存 `studio/v05/index.html` にモジュール読込を追加。

## テスト
- `node test_v05_focus_visual_v40.mjs` — 7 assertions PASS
- `node test_v05_focus_v39.mjs` — 6 checks PASS
- JavaScript構文検査 PASS

## 制限
- カラー診断は現状イベントと緑・赤の分類値で、撮影ビューポートへのカラーマスク描画は未実装。
- 区間診断は与えられたフレーム配列の集計。タイムライン範囲を走査して自動取得するGUI／APIは未接続。
- GPUレンダリングの画素比較、実WebGL、MCP/WebMCP実通信は未検証。
- 既存MCP/WebMCPの再生位置操作経路は維持し、重複ツール追加は行わない。
- 複数モデル対応は設計・ロードマップのみ。実装しない。
