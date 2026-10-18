# Phase H 格闘・演出・ステージ 詳細設計 v1

対象 DANCE-008〜012、LYRIC-008〜010、MOTION-021〜022（格闘関連は多Phase間依存）。E/Fをブロックしない。

## 格闘
`InteractionPair {attacker_id, defender_id, attack_clip_id, reaction_clip_id, contact_events, root_alignment, safety_distance}`。拳・足・武器・掴み対象の接触点をローカル骨参照＋ワールド変換で保存。攻撃開始・接触・反応・回復のイベントをタイムラインで合わせる。打撃や衝突の見た目を優先する編集と、実物理判定は区別。

## ステージ
`.blend/.fbx/.glb`の取り込みは単位・座標・階層・マテリアル・テクスチャの変換ログを残す。PMX出力は変換可能な幾何・マテリアルに限定し、Blender modifier、物理、ノード全互換を保証しない。大型ステージは空間チャンクとLOD、接地床コライダ、扉の可動ピボット、ギミックイベントを個別管理。

## MMD物理ベイク
シミュレーションのバージョン/seed/時間刻み/入力ハッシュを記録し、衣装/髪/身体の部分再計算をサポート設計。ベイク結果は新規レイヤーとして保存し、元の生データは保持する。異常貫通やピクつきはレポートで可視化。

## 操作・テスト
`create_combat_pair`/`align_contact_event`/`set_grab_constraint`/`import_stage`/`configure_stage_chunk`/`bake_physics_layer`/`detect_intersections`。2体格闘ループ・手指・武器・ステージ扉の開閉・分割ステージ表示・ベイク差分比較・VMD/動画出力で検証。
