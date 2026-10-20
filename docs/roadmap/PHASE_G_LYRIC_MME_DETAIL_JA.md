# Phase G リリック・JIZURA・MMDエフェクト 詳細設計 v1

対象 LYRIC-001〜007、RENDER-011〜015。ステージ関連LYRIC-008〜010はHと境界を共有。MMDエフェクトはF後に前倒し。

## JIZURA・ライセンス
外部素材は `AssetSource {uri, version, license, author, attribution, permitted_uses, imported_at, checksum}` として管理。取り込み時に利用権確認が取れない場合、閲覧と仮プレビューは許しても再配布パックには含めない。外部形式を無理に実行せず安全な中間表現へ変換。

## リリック設計
`LyricCue {text, language, in_frame, out_frame, style_id, anchor, animation_curve, layer_id}`。字幕文字と演出文字を分け、2D画面固定・3Dワールド固定を選択。拍マーカーと音声波形へスナップ、重複/見切れチェックを提供。フォント権利と不足時代替を出力時に検証。

## エフェクト互換レベル
(A) MME素材の登録/管理、(B) 内蔵相当効果としてBloom/DOF/MotionBlur/AutoLuminous等を再現、(C) MMD向け設定書/素材参照を出力。MMEの.fxをそのままアプリで動かせるとは約束しない。各効果の対応度をnative / approximated / export-only / unsupportedで表示。描画順は stage → opaque → alpha → emission → postprocessing → overlay の明示的依存グラフで管理。

所有者決定 `O-MMD-01/02/03=A/A/A` に従い、Ray-MMDは初期に登録とMMD向け設定出力を扱い、ブラウザー内蔵効果とは分ける。見た目の優先候補は霧、細かな塵、桜の花びら、きらめき、影の強調、ボケ／ブラー。`RENDER-012` は発光・Bloom・DOF・MotionBlur・影、`RENDER-013` は霧・粒子・花びら・きらめきの区間／イベント、`RENDER-014` は対象・強度・順序・キーを担う。奥行き霧と体積霧、ピントのボケと動きのブラーは別に判定する。代表フレームの目視と効果別測定を併用し、プレビューと動画出力の結果を分けて記録する。許諾不明の持込素材はローカル参照だけを保持し、配布パックには含めない。詳細は [`A3_VISUAL_EFFECT_PRIORITY_JA.md`](../specs/A3_VISUAL_EFFECT_PRIORITY_JA.md)。

## 操作・試験
`import_lyric_source`/`add_lyric_cue`/`set_lyric_animation`/`place_world_text`/`register_mme_asset`/`set_effect_stack`/`export_mmd_effect_manifest`。権利不足、欠損素材、アルファ、BloomとDOFの重ね、動画出力、保存再読込、MCP等価性を検証。
