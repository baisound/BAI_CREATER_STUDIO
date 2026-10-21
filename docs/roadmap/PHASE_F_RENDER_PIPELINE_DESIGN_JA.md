# Phase F — 動画・透過・FFmpeg・制作連携 詳細設計（第1稿）

**位置づけ:** Phase Bの全完了を待たず、Phase Eの描画シーン・共通タイムラインを利用してFを優先する。これは仕様設計であり実装完了を示さない。

2026-10-20の後続所有者決定により、現在の実装順は P2 → Phase E → リップシンク・表情・歌音声配置 → Phase F。A2の `O-RENDER-01/02/03` は **A/A/A** で確定した。MP4は環境別の短い試験エンコード・再読込を通った映像・音声encoderの組合せだけ提示する。同名完成物は版名を提案し、明示置換時だけ旧版を退避する。透過の初期受入はRGBA PNG連番で、EXR・アルファ動画は実書出し・再読込後に提示する。詳細は [A2決定記録](../specs/A2_RENDER_DECISIONS_JA.md)。

## データと編集契約
- `RenderJob`: id, projectRevision, sceneSnapshotHash, rangeStartFrame, rangeEndExclusive, fpsNum, fpsDen, width, height, outputKind, codecPresetId, alphaMode, background, colorSpace, audioAssetId?, outputDir, status, progress, diagnosticLogId, manifestPath。
- 範囲は`[start,end)`、フレーム数は`end-start`。時間は整数フレームと有理数FPSで扱い、非整数FPSによる尺の丸め誤差を避ける。
- 同一プロジェクト編集をジョブに混入させないため、投入時点のシーンスナップショットとハッシュを固定。素材は参照IDと出典ハッシュで追跡。原本データは不変更。
- 状態遷移: draft→queued→preparing→rendering→encoding→verifying→completed、またはfailed/canceled。中断再開可否は個別形式の機能能力に応じて表示。キャンセルは子プロセスも停止。

## v0.16.56 基本レンダリング
- 撮影Camera Viewと**同じカメラ評価**、被写体モーション・カメラ・照明・背景をフレーム番号基準でサンプリング。
- UI: 解像度、縦横比、FPS、フレーム範囲、保存先、推定容量/検査警告、プレビュー、ジョブ実行。AIなしで操作可。
- 画面描画とオフライン出力の一致を比較し、レンダー時に隠れたガイド/ギズモ/自由視点カメラを焼き付けない。

## v0.16.57 クロマキー・透過
- 背景タイプ: 単色、画像/動画、透過。クロマキー緑は選択プリセットであり背景色を任意指定可能。
- 透過はRGBA PNG/EXR連番を基準形式にする。動画コンテナ・コーデックはアルファ対応のときだけ選択可能にし、対応しない組合せは保存前に明示エラー。
- premultiplied / straight alphaをメタデータに保持。エッジのハロー・透過輪郭を検証。

## v0.16.58 高品質・FFmpeg・キュー
- 出力: PNG連番、サポートする場合にEXR連番、MP4等のコーデック別プリセット。利用環境のFFmpeg機能を起動時に照会し、存在しないencoderを提示しない。
- FFmpeg呼出しはshell文字列連結禁止・引数配列実行、明示入力の検証、実行ログ・終了コード・タイムアウト・ディスク容量監視。テンポラリに生成し完成後アトミック確定。
- 投稿用MP4は `AUDIO-001` の確定配置を参照する。音声encoder欠如時に映像だけへ黙って切り替えない。ジョブ完成は実ファイル再読込・検品後とし、同名衝突では版名を提案する。明示置換時は旧版の復元可能な退避と安全な確定ができる場合だけ置換する。
- ジョブは優先度/依存関係/リトライ（失敗理由つき）と再開可能な連番チェックポイントを保持。完成物と中間物を区別。

## v0.16.59 BAI VIDEO PRODUCTION連携
- `ProductionExchangeManifest` (schemaVersion、sourceProject、projectRevision、fps、durationFrames、assetURIs、cameraShots、videoOutputs、alphaMode、audioSyncOffsetFrames、provenance、checksums)。
- 受け渡しは可搬性のある相対パスとマニフェストを第一候補にする。受け側の対応が確認できるまで独自編集形式のインポート成功を断言しない。
- 外部連携が利用不能でも本体で保存・ローカルレンダリング・再生は続行可能。

## v0.16.60 受入品質ゲート
- 出力を実際に再読込して、画面サイズ、FPS（有理数）、期待フレーム数、映像尺、透過の可否、色空間、音ズレ、ファイル破損を機械検査。
- 手動比較: フレーム0/中央/末尾、カメラ切替境界、動きの速い区間、透明毛先/衣装。レンダーとプレビューの差を記録。
- UI/API/WebMCP/標準MCPが同じRenderServiceとバリデーションを使い、`createJob`, `validateJob`, `startJob`, `cancelJob`, `getJob`, `listJobs`, `verifyOutput`を同値に公開する。
- 回帰テスト: 不正パス、無効FPS、アルファ不可codec、FFmpeg欠如、ジョブ再実行、同時編集、キャンセル、ストレージ不足、Ollama停止時。
