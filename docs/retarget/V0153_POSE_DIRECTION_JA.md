# v0.15.3 ボーン基準方向差の推定・非破壊検証

## このリリースで利用できること
- PMXとFBX/GLB/VRM/BVHの解析済み座標が揃う場合に、左右腕・脚の連続ボーン等の方向差を計算する。
- 方向をそろえるためのクォータニオン(x,y,z,w)候補をJSONで返す。
- 画面「骨格解析・リターゲティング準備」の「骨の方向差を解析」から取得できる。
- 同等の読み取りツール `mixamo_retarget_pose_proposal` をWebMCPと標準MCPに公開する。
- `retarget_pose.transform_samples()` にローカル回転の差分サンプルを渡せる（純粋関数、オリジナルファイル不変）。

## 重要な限界
本機能は **暫定補正候補** であり、高精度の完成したリターゲティングではない。
座標系の左右・上下、PMXの骨の軸まわりのひねり、ローカルのレストポーズ、可動関節の制約を骨の位置だけでは確定できない。PMX/FBXの一致しない座標系を自動で同一視してはならない。
GLB/VRMの既存解析にはボーン頭位置の詳細情報がないケースもある。その場合、推定できたフレームだけ返し、未解決部分を明示する。FBXはBlenderによる解析が必要。
VMD出力、IK、足接地、転写済み3Dプレビューはこのリリースには含まれない。推定値を直接PMXへ焼き込んではならない。

## API
`GET /api/retarget/pose-proposal?source=<登録済み素材ID>&target=<登録済み素材ID>`
返却: `pose_correction.direction_offsets` の役割ごとに `world_direction_alignment_xyzw`、`source_bone`、`target_bone`。解析不可は `skipped` に収録。
元ファイルと保存済み変換プロファイルは変更されない。

## 検証
`python -m unittest discover -s tests -p test_retarget_pose.py -v`
誤認を防ぐため、ゼロ長方向の拒否、同一方向、直角、欠落ボーン、基礎変換を確認。

## 次段階
本当のアニメーション変換には座標系同定、バインド/レスト行列、モデル別ねじり軸補正、転写済みポーズの3D確認、IK/接地、VMD出力の検証が必要。
