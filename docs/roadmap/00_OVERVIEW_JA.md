# 機能概要・要件台帳（正本）

**対象:** v0.11.0-standalone を起点に、2026-10-20 の追加決定を反映

最初の v0.11.0-standalone では118個の機能IDを整理した。その後の OBS・UX・REVIEW などと、2026-10-20に所有者が独立管理を承認した歌音声配置 `AUDIO-001` を含め、現行台帳は **148個**。件数と状態の正本は `FEATURE_REGISTER.json`。

## 読み方

1. 本書でフェーズと機能IDを把握
2. `FEATURE_DETAIL_JA.md` でID検索して受け入れ条件を確認
3. `FEATURE_REGISTER.csv/json` を管理台帳・機械可読な索引として使う
4. `IMPLEMENTATION_AUDIT_JA.md` の証拠に照らして実装状態を更新
5. `TRACEABILITY_JA.md` で元要求・統合先の確認

## 非交渉要件

- 手動UIがAI未接続でも使用できること。
- 原則、全機能にWebMCPおよび標準MCP操作経路を用意すること。ブラウザ権限のある操作はローカルAPI経由とする。
- 保存、Undo/Redo、素材の非破壊性、履歴、仕様書、テストを実装完了条件とする。
- VMDの物理/IK精度、映像品質は実データで検証する。構文チェックのみで完了扱いしない。
- 外部AIサービス、CDN、MMD実機に依存しない手動制作を原則とする（変換で必要なローカルツールは明記）。

## 優先度別の概要表

| Phase | 対象 | 件数 | 先行条件 |
|---|---|---:|---|
| 01 | CORE: 基盤・運用 | 13 | なし |
| 02 | DATA: 非破壊編集・プロジェクト | 15 | CORE |
| 03 | MOTION: モーション素材・変換・品質 | 22 | CORE,DATA |
| 04 | DANCE: マルチダンサー・接触 | 12 | MOTION,DATA |
| 05 | LIP: リップ・表情・音声 | 11 | MOTION,DATA |
| 05 | AUDIO: 歌音声の取込・配置・同期 | 1 | CORE,DATA |
| 06 | CAM: カメラ・撮影テンプレート | 18 | DATA,MOTION |
| 07 | RENDER: レンダリング・エフェクト | 15 | CORE,DATA,CAM |
| 08 | LYRIC: JIZURA・MV・ステージ | 12 | DATA,CAM,RENDER |

この表は Phase 01〜08 の制作機能を示す。残る横断ID（OBS・UX・REVIEW）は `FEATURE_REGISTER.json` で管理する。

## Phase 01 / CORE — 基盤・運用

- **[CORE-001](FEATURE_DETAIL_JA.md#core-001)** AI無しの全機能手動操作
- **[CORE-002](FEATURE_DETAIL_JA.md#core-002)** WebMCP共通操作
- **[CORE-003](FEATURE_DETAIL_JA.md#core-003)** 標準MCP（Codex/Claude Code）
- **[CORE-004](FEATURE_DETAIL_JA.md#core-004)** UI・WebMCP・MCP共通API
- **[CORE-005](FEATURE_DETAIL_JA.md#core-005)** 双方向同期
- **[CORE-006](FEATURE_DETAIL_JA.md#core-006)** ローカルサーバーWindows BAT・Linux SH
- **[CORE-007](FEATURE_DETAIL_JA.md#core-007)** 完全オフライン
- **[CORE-008](FEATURE_DETAIL_JA.md#core-008)** Git履歴・タグ管理
- **[CORE-009](FEATURE_DETAIL_JA.md#core-009)** 日本語仕様書・Codex引継ぎ
- **[CORE-010](FEATURE_DETAIL_JA.md#core-010)** 自動テスト・実機検証
- **[CORE-011](FEATURE_DETAIL_JA.md#core-011)** ユーザー権限・危険操作確認
- **[CORE-012](FEATURE_DETAIL_JA.md#core-012)** 同時編集競合検知
- **[CORE-013](FEATURE_DETAIL_JA.md#core-013)** 環境診断

## Phase 02 / DATA — 非破壊編集・プロジェクト

- **[DATA-001](FEATURE_DETAIL_JA.md#data-001)** 共通タイムライン
- **[DATA-002](FEATURE_DETAIL_JA.md#data-002)** クリップ追加・ドラッグ並び替え
- **[DATA-003](FEATURE_DETAIL_JA.md#data-003)** 補間・ブレンドカーブ
- **[DATA-004](FEATURE_DETAIL_JA.md#data-004)** 速度変更・リマップ
- **[DATA-005](FEATURE_DETAIL_JA.md#data-005)** レイヤー式動作合成
- **[DATA-006](FEATURE_DETAIL_JA.md#data-006)** 非破壊モーションスタック
- **[DATA-007](FEATURE_DETAIL_JA.md#data-007)** 部分VMD差分転写
- **[DATA-008](FEATURE_DETAIL_JA.md#data-008)** 制作プロジェクトの保存・読み込み
- **[DATA-009](FEATURE_DETAIL_JA.md#data-009)** Undo/Redoと任意履歴復元
- **[DATA-010](FEATURE_DETAIL_JA.md#data-010)** 自動保存・クラッシュ復元
- **[DATA-011](FEATURE_DETAIL_JA.md#data-011)** お気に入りコンビネーション
- **[DATA-012](FEATURE_DETAIL_JA.md#data-012)** 制作データのポータブルZIP
- **[DATA-013](FEATURE_DETAIL_JA.md#data-013)** 素材の重複検出
- **[DATA-014](FEATURE_DETAIL_JA.md#data-014)** モデル別VMDライブラリ
- **[DATA-015](FEATURE_DETAIL_JA.md#data-015)** 制作プロジェクト健全性検査

## Phase 03 / MOTION — モーション素材・変換・品質

- **[MOTION-001](FEATURE_DETAIL_JA.md#motion-001)** 格闘モーション50→100→82件履歴
- **[MOTION-002](FEATURE_DETAIL_JA.md#motion-002)** FBX/PMX/VMDのローカル保存と再利用
- **[MOTION-003](FEATURE_DETAIL_JA.md#motion-003)** FBX・GLB・BVH・VRM読込
- **[MOTION-004](FEATURE_DETAIL_JA.md#motion-004)** Mixamo→PMX骨格自動リターゲット
- **[MOTION-005](FEATURE_DETAIL_JA.md#motion-005)** ボーンマッピングの手動修正とモデル別プロファイル
- **[MOTION-006](FEATURE_DETAIL_JA.md#motion-006)** MMD/VMD入出力
- **[MOTION-007](FEATURE_DETAIL_JA.md#motion-007)** BlenderバックエンドVMD変換
- **[MOTION-008](FEATURE_DETAIL_JA.md#motion-008)** VMD一括・区間・部分変換
- **[MOTION-009](FEATURE_DETAIL_JA.md#motion-009)** PMX二体プレビュー
- **[MOTION-010](FEATURE_DETAIL_JA.md#motion-010)** 3Dポーズ・ボーン直接操作
- **[MOTION-011](FEATURE_DETAIL_JA.md#motion-011)** 足IK・接地・床貫通修正
- **[MOTION-012](FEATURE_DETAIL_JA.md#motion-012)** フットステップ・歩幅編集
- **[MOTION-013](FEATURE_DETAIL_JA.md#motion-013)** 重心・ルート座標累積
- **[MOTION-014](FEATURE_DETAIL_JA.md#motion-014)** ボーン軌跡と姿勢差分ゴースト
- **[MOTION-015](FEATURE_DETAIL_JA.md#motion-015)** モーション左右ミラー
- **[MOTION-016](FEATURE_DETAIL_JA.md#motion-016)** モーションサムネイル生成
- **[MOTION-017](FEATURE_DETAIL_JA.md#motion-017)** モーション分類・類似検索
- **[MOTION-018](FEATURE_DETAIL_JA.md#motion-018)** モーション継ぎ目検出
- **[MOTION-019](FEATURE_DETAIL_JA.md#motion-019)** モデル互換性診断・修復案
- **[MOTION-020](FEATURE_DETAIL_JA.md#motion-020)** 危険姿勢・異常関節チェック
- **[MOTION-021](FEATURE_DETAIL_JA.md#motion-021)** MMD物理ベイクと部分再計算（条件一致と再現性を確認した場合だけ再利用）
- **[MOTION-022](FEATURE_DETAIL_JA.md#motion-022)** 衣装・髪・身体の貫通検出

## Phase 04 / DANCE — マルチダンサー・接触

- **[DANCE-001](FEATURE_DETAIL_JA.md#dance-001)** 複数PMX個別トラック
- **[DANCE-002](FEATURE_DETAIL_JA.md#dance-002)** ダンサーA/B位置交換
- **[DANCE-003](FEATURE_DETAIL_JA.md#dance-003)** フォーメーションプリセット
- **[DANCE-004](FEATURE_DETAIL_JA.md#dance-004)** カノン・ミラー・主役交代
- **[DANCE-005](FEATURE_DETAIL_JA.md#dance-005)** 振付アレンジ・個別部位合成
- **[DANCE-006](FEATURE_DETAIL_JA.md#dance-006)** 複数ダンサー衝突回避
- **[DANCE-007](FEATURE_DETAIL_JA.md#dance-007)** ダンサー別VMD一括出力
- **[DANCE-008](FEATURE_DETAIL_JA.md#dance-008)** 2キャラ格闘攻防同期（接点差の数値と同一フレーム映像を併記）
- **[DANCE-009](FEATURE_DETAIL_JA.md#dance-009)** 掴み・接触コンストレイント（実在骨と小道具接点を参照）
- **[DANCE-010](FEATURE_DETAIL_JA.md#dance-010)** ノックダウン→Kip Up
- **[DANCE-011](FEATURE_DETAIL_JA.md#dance-011)** 格闘連続技チェイン
- **[DANCE-012](FEATURE_DETAIL_JA.md#dance-012)** 手指・小道具操作

`DANCE-002/006/007/012` の [B1所有者決定](../specs/B1_MULTI_DANCER_DECISIONS_JA.md) は A/A/A。候補経路を人が補正・確定し、登録済み小道具の骨接続・持ち替えを扱い、VMD一括出力の成功分は保持して一部成功を明示する。機能実装と実モデル検証は未完。

## Phase 05 / LIP — リップ・表情・音声

- **[AUDIO-001](FEATURE_DETAIL_JA.md#audio-001)** 歌音声の取込・配置・同期（リップシンクと同段階）
- **[LIP-001](FEATURE_DETAIL_JA.md#lip-001)** SRT読込→リップVMD
- **[LIP-002](FEATURE_DETAIL_JA.md#lip-002)** SRT＋歌声ステム音素同期
- **[LIP-003](FEATURE_DETAIL_JA.md#lip-003)** 日本語子音・長音・閉口補正
- **[LIP-004](FEATURE_DETAIL_JA.md#lip-004)** モデル別PMX口モーフ解析
- **[LIP-005](FEATURE_DETAIL_JA.md#lip-005)** 作者の手癖分析（選択VMD集合の傾向。本人性は推定しない）
- **[LIP-006](FEATURE_DETAIL_JA.md#lip-006)** リップ修正案提示と評価
- **[LIP-007](FEATURE_DETAIL_JA.md#lip-007)** リップ比較・適用前後プレビュー
- **[LIP-008](FEATURE_DETAIL_JA.md#lip-008)** モデル別VMD版管理
- **[LIP-009](FEATURE_DETAIL_JA.md#lip-009)** 表情・視線・瞬き編集
- **[LIP-010](FEATURE_DETAIL_JA.md#lip-010)** 身体と表情の感情同期
- **[LIP-011](FEATURE_DETAIL_JA.md#lip-011)** フェイシャルキャプチャ（元映像は既定で保存しない）

## Phase 06 / CAM — カメラ・撮影テンプレート

- **[CAM-001](FEATURE_DETAIL_JA.md#cam-001)** カメラVMDの読込・分割・登録
- **[CAM-002](FEATURE_DETAIL_JA.md#cam-002)** カメラ類似分類
- **[CAM-003](FEATURE_DETAIL_JA.md#cam-003)** キーフレーム・カーブ編集
- **[CAM-004](FEATURE_DETAIL_JA.md#cam-004)** カメラ矩形フレームと被写体見切れ検出
- **[CAM-005](FEATURE_DETAIL_JA.md#cam-005)** 焦点距離・F値・ピント距離
- **[CAM-006](FEATURE_DETAIL_JA.md#cam-006)** パン・ティルト・ロール・自転
- **[CAM-007](FEATURE_DETAIL_JA.md#cam-007)** ドリー・トラック・スライダー・ズーム
- **[CAM-008](FEATURE_DETAIL_JA.md#cam-008)** レール・曲線カメラパス
- **[CAM-009](FEATURE_DETAIL_JA.md#cam-009)** クレーン・ジブ・ブーム・ドローン
- **[CAM-010](FEATURE_DETAIL_JA.md#cam-010)** オービット・スパイラル・自転
- **[CAM-011](FEATURE_DETAIL_JA.md#cam-011)** 被写体追従・複数人自動構図
- **[CAM-012](FEATURE_DETAIL_JA.md#cam-012)** 映画演出カメラ
- **[CAM-013](FEATURE_DETAIL_JA.md#cam-013)** 撮影用途別テンプレートライブラリ
- **[CAM-014](FEATURE_DETAIL_JA.md#cam-014)** カメラプリセットお気に入り・タグ・検索
- **[CAM-015](FEATURE_DETAIL_JA.md#cam-015)** カメラ連結・カット・時間同期
- **[CAM-016](FEATURE_DETAIL_JA.md#cam-016)** MMDカメラVMD書出し
- **[CAM-017](FEATURE_DETAIL_JA.md#cam-017)** カメラ衝突回避・構図品質
- **[CAM-018](FEATURE_DETAIL_JA.md#cam-018)** 自動ディレクターとショット選択

## Phase 07 / RENDER — レンダリング・エフェクト

2026-10-20所有者決定: 動画出力は使用環境で試験エンコード・再読込を通ったMP4の組合せだけ提示し、同名完成物は版名を提案する。明示置換時は旧版を退避する。透過の初期受入はRGBA PNG連番とする。詳細は [A2決定記録](../specs/A2_RENDER_DECISIONS_JA.md)。機能は計画・未検証。

- **[RENDER-001](FEATURE_DETAIL_JA.md#render-001)** MMD無し動画書出し
- **[RENDER-002](FEATURE_DETAIL_JA.md#render-002)** 背景色/クロマキー/アルファ
- **[RENDER-003](FEATURE_DETAIL_JA.md#render-003)** 解像度・縦横比・FPS
- **[RENDER-004](FEATURE_DETAIL_JA.md#render-004)** 動画コーデック設定
- **[RENDER-005](FEATURE_DETAIL_JA.md#render-005)** PNG・EXR連番出力
- **[RENDER-006](FEATURE_DETAIL_JA.md#render-006)** FFmpeg変換と書出しプリセット
- **[RENDER-007](FEATURE_DETAIL_JA.md#render-007)** バッチ・レンダーキュー
- **[RENDER-008](FEATURE_DETAIL_JA.md#render-008)** 差分レンダリング
- **[RENDER-009](FEATURE_DETAIL_JA.md#render-009)** レンダリング自動検品
- **[RENDER-010](FEATURE_DETAIL_JA.md#render-010)** レンダリング停止・再開・進捗
- **[RENDER-011](FEATURE_DETAIL_JA.md#render-011)** Ray-MMD/MME素材登録
- **[RENDER-012](FEATURE_DETAIL_JA.md#render-012)** 発光・Bloom・MotionBlur・影
- **[RENDER-013](FEATURE_DETAIL_JA.md#render-013)** 発光・火花・煙・衝撃波
- **[RENDER-014](FEATURE_DETAIL_JA.md#render-014)** エフェクト設定・描画順・テンプレート
- **[RENDER-015](FEATURE_DETAIL_JA.md#render-015)** MME適用設定のMMD向け出力

`RENDER-011`〜`015` のA3所有者決定は [A3判断記録](../specs/A3_MMD_EFFECTS_DECISIONS_JA.md)。内蔵効果とRay-MMD素材の登録・MMD向け出力を区別し、効果別の測定と代表フレーム目視を併用する。見た目の優先候補は霧・塵・桜・きらめき・影・ボケ／ブラーで、[効果別候補](../specs/A3_VISUAL_EFFECT_PRIORITY_JA.md) に既存IDとの対応を記録した。ピントのボケはカメラの `CAM-005/E-FOCUS-01/02/F-DOF-01` が所有し、FXから同じ設定を参照する。機能実装とGPU実測は未完。

## Phase 08 / LYRIC — JIZURA・MV・ステージ

- **[LYRIC-001](FEATURE_DETAIL_JA.md#lyric-001)** JIZURAソース取り込み・ライセンス管理（監査後に必要部分を段階統合）
- **[LYRIC-002](FEATURE_DETAIL_JA.md#lyric-002)** リリックタイムライン統合
- **[LYRIC-003](FEATURE_DETAIL_JA.md#lyric-003)** JIZURA歌詞・演出パック管理
- **[LYRIC-004](FEATURE_DETAIL_JA.md#lyric-004)** 2D文字モーションと3D文字配置（フォント欠損時は差分から代替を選択）
- **[LYRIC-005](FEATURE_DETAIL_JA.md#lyric-005)** 歌詞テンプレート・お気に入り・タグ
- **[LYRIC-006](FEATURE_DETAIL_JA.md#lyric-006)** 音楽BPM・ビート・イベントマーカー（時刻付き拍マーカー列を同期正本にする）
- **[LYRIC-007](FEATURE_DETAIL_JA.md#lyric-007)** シーン・ショット・絵コンテ管理
- **[LYRIC-008](FEATURE_DETAIL_JA.md#lyric-008)** Blender .blend/.fbx/.glb→PMXステージ（確認後に欠落レポート付き部分出力）
- **[LYRIC-009](FEATURE_DETAIL_JA.md#lyric-009)** 大型ステージ分割・テクスチャ・床データ
- **[LYRIC-010](FEATURE_DETAIL_JA.md#lyric-010)** 可動ドア・ギミック・マップ物理（登録済み可動ピボットと時刻付きイベント）
- **[LYRIC-011](FEATURE_DETAIL_JA.md#lyric-011)** プロシージャル歩行/待機/呼吸
- **[LYRIC-012](FEATURE_DETAIL_JA.md#lyric-012)** 高度検索・振付ライブラリ管理

## 最優先の統合工程
[添付v02分析](ATTACHMENT_20261015_V02_ANALYSIS_JA.md) / [Phase 00計画](PHASE_00_INTEGRATION_JA.md)

## 最新の未実装・合意済み決定
- **Phase 00の最初の実装はログ出力・ログローテーション**：[仕様](PHASE_00_LOGGING_FIRST_JA.md)。手動UI/WebMCP/標準MCPすべて対応し、実機診断ZIPを用意する。
