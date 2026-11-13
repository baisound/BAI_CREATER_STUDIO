# Mixamo統合制作スタジオ — 開発文書（正本）

**このフォルダーは「提案と実装報告の取りこぼしを防ぐ」ための文書専用コミットです。**

- [`../v05/VST_GUI_AUDIO_E2E_20261113_JA.md`](../v05/VST_GUI_AUDIO_E2E_20261113_JA.md) — 実VST固有GUIのゲイン変更から保存/再表示・実再生・WAV/MP4まで追加通し検証PASS
- [`../v05/VST_NATIVE_EDITOR_METERS_20261113_JA.md`](../v05/VST_NATIVE_EDITOR_METERS_20261113_JA.md) — インサート直接起動・固有GUI状態回収と再生連動ピーク/LUFS。代表検証と未達を区別
- [`CURRENT_POSITION_AND_TASKS_20261108_JA.md`](CURRENT_POSITION_AND_TASKS_20261108_JA.md) — 最新の7段階一覧・順3現在地・細分化と着手タスク
- [`../v05/VST_MIXER_PROCESSING_20261113_JA.md`](../v05/VST_MIXER_PROCESSING_20261113_JA.md) — Owner指定のVST3・作品ミキサー実処理、試聴/MP4/両MCPと素材一覧高さの修正。後続のモデル/カメラ/動き・表情の配置連動と二重ヘッダー改善は別途進行
- [`../v05/UI_AUDIT_20261113_JA.md`](../v05/UI_AUDIT_20261113_JA.md) — 監査時点の番号付き現状/提案。後続の実装は次項、順3 G3-F1は未完のまま保持
- [`../v05/UI_FIXES_20261113_JA.md`](../v05/UI_FIXES_20261113_JA.md) — 監査後にOwnerが最優先で承認したUI改修と音声配置・DAW形式ミキサーの実装、変更前後・検証・限界
- [`00_OVERVIEW_JA.md`](00_OVERVIEW_JA.md) — フェーズ別の概要と機能リンク
- [`FEATURE_DETAIL_JA.md`](FEATURE_DETAIL_JA.md) — 全機能IDの詳細・受け入れ条件
- [`FEATURE_REGISTER.csv`](FEATURE_REGISTER.csv) / [`FEATURE_REGISTER.json`](FEATURE_REGISTER.json) — 機械可読の機能台帳
- [`ROADMAP_JA.md`](ROADMAP_JA.md) — 推奨開発順序・依存性
- [`V05_MINIMUM_WORKFLOW_20261023_JA.md`](V05_MINIMUM_WORKFLOW_20261023_JA.md) — 2026-10-23 Owner指定のv0.5最短制作経路と確認ゲート
- [`V05_REBUILT_ROADMAP_20261102_JA.md`](V05_REBUILT_ROADMAP_20261102_JA.md) — 上記指定を維持した現在の実施順・欠落・次の縦断ゲート
- [`CURRENT_POSITION_AND_EFFORT_20261106_JA.md`](CURRENT_POSITION_AND_EFFORT_20261106_JA.md) — 全体の現在地と残り作業量を簡単な言葉で説明した見積もり
- [`TRACEABILITY_JA.md`](TRACEABILITY_JA.md) — 会話要求とIDの対応表
- [`IMPLEMENTATION_AUDIT_JA.md`](IMPLEMENTATION_AUDIT_JA.md) — 検証・実装状態の基準
- [`../specs/SPEC_PROGRESS_JA.md`](../specs/SPEC_PROGRESS_JA.md) — 承認済みバックログの仕様・UIモック進捗と未検証点

- [`../v05/TIMELINE_SCENE_LINK_20261113_JA.md`](../v05/TIMELINE_SCENE_LINK_20261113_JA.md) — タイムライン由来モデルとカメラ・動き・表情/口の実評価・MP4、番号付き実画面と検証限界
- [`CINEMAOPERATOR_BLENDER_ADDON_IMPORT_DESIGN_20261106_JA.md`](CINEMAOPERATOR_BLENDER_ADDON_IMPORT_DESIGN_20261106_JA.md) — CAM-019の既存承認設計を正本へ復帰。Owner指定でBlenderカメラ取込B1を現連動の次へ繰上げ。B1直接取込は代表検証済み、実アドオンの静的GLB往復を代表検証、PMX/動作橋渡しは未完

- [`../v05/PMX_ACCESSORY_PHYSICS_FIX_20261113_JA.md`](../v05/PMX_ACCESSORY_PHYSICS_FIX_20261113_JA.md) — 実動作プレビューの髪/紐の伸び対策。元データを保持し、物理の回転と骨長を両立
- [`../v05/TARGET_MODEL_CONTACT_FIT_20261113_JA.md`](../v05/TARGET_MODEL_CONTACT_FIT_20261113_JA.md) — 元モデル不明VMDを適用先PMXで調整する設計。3視点批評を反映、未実装

## 変更時の規則

新規要求があれば最初に類似のIDを探し、統合可能ならそのIDの詳細仕様を更新。独立している場合のみ新IDを発番。概要・詳細・CSV/JSON・トレーサビリティ・テストを同時に修正する。

**全機能をAI不要の手動UIとWebMCP/標準MCPの共通APIで扱うこと。**

## 追加監査
[添付アプリ分析](ATTACHMENT_20261015_V02_ANALYSIS_JA.md) / [統合フェーズ](PHASE_00_INTEGRATION_JA.md)

## 最新の未実装・合意済み決定
- **Phase 00の最初の実装はログ出力・ログローテーション**：[仕様](PHASE_00_LOGGING_FIRST_JA.md)。手動UI/WebMCP/標準MCPすべて対応し、実機診断ZIPを用意する。

## 全開発エージェント・UI/UX設計の入口
- [`../../AGENTS.md`](../../AGENTS.md) — ローカル開発者・Codex向けの最初に読む規則
- [`UI_UX_DESIGN_STANDARD_JA.md`](UI_UX_DESIGN_STANDARD_JA.md) — 新規決定された横断UI/UX基準（UX-001〜008）

- [Blenderカメラ取込B1の操作・試験・制限](../v05/BLENDER_CAMERA_IMPORT_B1_20261113_JA.md) — `.blend`/評価済みJSON→比較/採用→同じカメラ行/MP4。

- [CinemaOperator本体の登録・起動・Bake連携](../v05/CINEMAOPERATOR_BRIDGE_20261113_JA.md) — 静的GLBの代表経路を検証。PMX/動作等の橋渡しは未完。

- [CinemaOperatorのPMX・動き・表情の撮影コピー](../v05/CINEMAOPERATOR_ANIMATED_SCENE_20261114_JA.md) — 両OSのBake/両MCP/60F MP4とWindows実PMX GUIを代表検証。二次物理など残件を保持。
