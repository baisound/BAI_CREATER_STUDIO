# Phase C 複数ダンサー・フォーメーション 詳細設計 v1

対象: DANCE-001〜007（DANCE-008〜012は主にH）。B未完成は維持し、E/Fを先行。

## データモデル
`DancerInstance {id, model_asset_id, skeleton_profile_id, root_transform, track_ids, render_visibility}`、`Formation {id, members:[{dancer_id,anchor,offset}], pivot, space, duration}`、`MotionClip {source_asset_id, in_frame, out_frame, time_scale, bone_mask, mirror, blend}`。タイムラインは共通フレーム/FPS基準、ダンサーごとに独立トラック。

## UI
Scene Viewから複数体を選択、ドラッグで配置。ダンサー一覧で表示・選択・ロック、位置交換A↔B、整列プリセット（横並び・円・V字・前後）、ゴースト・接触警告。カノンは開始オフセット、ミラーは軸と左右ボーンテーブル、主役交代は指定区間を操作。カメラ撮影画面で全員が見切れていないか確認。

## 操作契約
`create_dancer`/`set_dancer_transform`/`swap_dancers`/`apply_formation`/`offset_dancer_clip`/`set_motion_mirror`/`export_dancer_vmd_batch`。各操作はdry-run、revision、undo、対象IDを必須扱い。VMDは個別ファイルで保存し失敗しても元モーションを変更しない。

2026-10-20 所有者決定 `O-DANCE-01/02/03=A/A/A` により、`DANCE-002/006` の交換・回避は候補経路→手動補正→明示確定→適用後再評価までを一つの非破壊操作とする。警告のみは未完成。`DANCE-012` は登録済み小道具の実骨接続と持ち替えまで扱い、二重保持・消失・欠損骨を検知する。`DANCE-007` のVMD一括出力はダンサー別の成功・失敗を保持し、1件でも失敗すればバッチを「一部成功」と表示する。原本・既存完成物は黙って上書きしない。詳細は [B1判断資料](../specs/B1_MULTI_DANCER_DECISIONS_JA.md)。いずれも実装・実モデル検証は未完で、P2 → E → リップ・表情・歌音声 → F → MMD FX → C の順序は変えない。

## 判定
複数実モデル読み込み、別モーション同時再生、2体交換、区間カノン、ミラー、保存再読込、ダンサー別VMD往復。接触警告は距離の近さを示すだけで精密な物理衝突保証ではない。
