# UI OVERHAUL 30 実装・検証報告

## 対象
- `feature/v05-ui-overhaul-30`。元の main と枝番29を変更しない。
- `studio/v05/js/camera-project-settings-v30.js`: FPSの設定解決、`bai:project-selected` イベントからの反映、フォーカス描画用の登録口、診断イベント。
- `studio/v05/index.html`: モジュール読み込み。
- `test_v05_camera_v30.cjs`: FPS・DOF状態・未接続・不正値のテスト。

## 制限事項（重要）
- FPSはプロジェクト選択側から `bai:project-selected` にprojectオブジェクトが送られた場合に適用。既存のプロジェクト台帳にFPSの保存が保証されておらず、自動取得のエンドツーエンド対応は未完了。未設定は60fpsフォールバック＋警告。
- DOF描画実装は未接続。`registerFocusRenderer()` への実レンダラー登録が必要。設定の受渡しとボケ描画を同一視しない。
- 診断イベント `bai:diagnostic` はブラウザ内通知。永続JSONLログへの出力は未接続。
- 既存MCP/WebMCPのシーク経路に変更なし。実通信テストは未実施。
- ブラウザE2Eと実WebGL描画は未検証。

## 実施テスト
- `node test_v05_camera_v30.cjs` : PASS
- `node test_v05_camera_v29.cjs` : PASS
- `node --check studio/v05/js/camera-project-settings-v30.js` : PASS

## 次段階
- プロジェクトFPSの保存・読込APIに一意の参照元を設ける。UI・標準MCP・WebMCPから共通参照。
- 実DOFパスが存在するか監査してから接続し、描画あり／未接続を明示。
- 診断イベントを既存のシステムログ基盤と接続。
