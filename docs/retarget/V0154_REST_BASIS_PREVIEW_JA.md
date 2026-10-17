# v0.15.4 GLB→VRM 基準姿勢補正付き比較プレビュー（試験）

## 目的
統合素材のアニメーション付きGLBをVRMへ仮転写するとき、従来の単純なローカル回転差のコピーに加え、両モデルのレスト姿勢時の親ボーンのワールド回転を利用した座標変換を選べるようにしました。

## 手動操作
統合素材でGLBを開き、転写先VRMを選択。「転写方式」から「基準姿勢の軸補正（試験）」または「従来方式」を選び「VRMへ仮転写」。元GLBと対象VRMは既存の同期比較で確認できます。補正方式を切り替える場合は再度転写ボタンを押してください。

## 数学
source の親ボーンのレストワールド回転 Qs と target の親の Qt に対し B=Qt^-1 * Qs を求め、source local delta D=Rsource_rest^-1 * Rsource_anim を target local delta D'=B*D*B^-1 に移し、Rtarget_anim=Rtarget_rest*D' とします。

## 制限事項
現在のGLB/VRM直接プレビューのみ。Blender FBX、BVH、PMX、VMD変換への適用は今回の成果に含まれません。非均一スケール、PMX/MMDローカル軸・ボーンのひねり、正確な足IK・接地、ルート移動と相手との同期は未補正です。VRMのHumanoidボーンが十分に存在する必要があります。モーション/モデル原本は更新しません。3Dの見た目と再現精度の実機検証は未完了です。

## WebMCP
`mixamo_integrated_set_retarget_mode` で方式を選び、既存の `mixamo_integrated_retarget` で転写します。標準MCP側は既存の `mixamo_integrated_retarget` を引き続き使用しますが、方式指定の専用追加ツールは次回課題です。
