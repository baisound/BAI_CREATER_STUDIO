# BAI Creator Studio — AI実装用設計仕様 v0.5

status: **PROPOSED / NOT APPROVED FOR AUTOMATIC IMPLEMENTATION**
updated: 2026-10-22
language: ja-JP

## 最小読み込み規則（トークン節約）
1. まずこの `INDEX.md` だけを読む。
2. 対象画面 `screens/<screen-id>.md` を読む。
3. 共通操作に関係する場合だけ `shared/interaction.md`、データ処理が必要なら `shared/data-model.md`、表示文字列なら `locales/*.json` を読む。
4. 実装検証時だけ `tests/acceptance.md` の関係する識別子を読む。
5. `references/` の画像は画面の見た目を検証するときだけ読む。画像の読み込みを標準動作としない。
6. 全ファイル一括読み込み禁止。作業が関係する範囲を必要最小限にする。

## 画面ルーティング
| ID | 対象 | 仕様 |
|---|---|---|
| SCR-HOME | ホーム | [screens/home.md](screens/home.md) |
| SCR-DASH | ダッシュボード | [screens/dashboard.md](screens/dashboard.md) |
| SCR-PROJ | プロジェクト一覧 | [screens/projects.md](screens/projects.md) |
| SCR-EDIT | 統合3D・映像編集 | [screens/editor.md](screens/editor.md) |
| SCR-AUDIO | 音声編集 | [screens/audio.md](screens/audio.md) |
| SCR-ASSETS | 専用素材管理 | [screens/assets.md](screens/assets.md) |
| SCR-EXPORT | 書き出し | [screens/export.md](screens/export.md) |
| SCR-SET | 設定・保存管理 | [screens/settings.md](screens/settings.md) |

## 横断仕様
- [shared/interaction.md](shared/interaction.md) — 選択・XYZ・タイムライン・ショートカット・Undo
- [shared/data-model.md](shared/data-model.md) — 永続データと責務、共通状態
- [shared/i18n.md](shared/i18n.md) — 日英言語仕様
- [shared/architecture.md](shared/architecture.md) — 実装境界、MCPと既存互換性
- [tests/acceptance.md](tests/acceptance.md) — テスト項目
- [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) — 開発AIへの指示

## 決定事項
- 日本語既定、英語切替。画面文言は `locales/jp.json`、`locales/en.json`。
- 3Dモデル、カメラ、ライト、空間エフェクトは共通のXYZギズモ・位置/回転/倍率UI。
- プロジェクト全体の時間軸は単一。画面ごとに別状態を生成しない。
- ホーム・管理系と各制作ワークスペースを分離する。
- 原則：クリック=選択、ダブルクリック=詳細、右クリック=関連操作。状況による例外は明記。
- 構図線・セーフエリアは編集用で通常レンダーに焼き込まない。

## 留保事項
- これは仕様書であり動作保証ではない。モックはプロトタイプ。`studio.zip` の実装範囲とバックエンド状態は着手前に監査する。
- 既存ロードマップ、MCP仕様、保存形式、VST/描画エンジンの技術的制約を勝手に変更しない。
