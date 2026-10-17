# v0.15.6 共通アニメーションチャンネル（第1段階）

GLBの埋め込みBINにあるFLOATアニメーションのtranslation/rotation/scale（LINEAR/STEP）とBVHの位置・Euler回転チャンネルを読み取り、共通の`{schema,format,channels}` JSONで提供する。GLBのCUBICSPLINE/スパース/外部バッファやFBXの完全なキーフレーム抽出には未対応。音楽・物理・モーフの生成も未対応。

UI: 骨格解析画面で元素材を選択して「アニメーションキーを解析」。取得結果は冒頭3チャンネルの先頭4キーだけ表示（膨大なJSONを画面に表示しない）。

API: `GET /api/retarget/motion-channels?id=<registered-asset-id>`。WebMCP/標準MCP `mixamo_motion_channels`。元ファイル・制作状態は変更しない。

**現時点でFBX/GLB/BVHからPMX/VRMへ共通の転写が完成したわけではない。** BVH Euler→クォータニオン、GLBの各種補間、レスト姿勢・軸・IK・ルート変換およびVMD書き出しを実装する必要がある。

本改修は中間フォーマットの一部にとどまるため、v0.15.6の完成条件に対して部分達成。ブラウザの実レンダリングとモデル別リターゲティングは未検証。
