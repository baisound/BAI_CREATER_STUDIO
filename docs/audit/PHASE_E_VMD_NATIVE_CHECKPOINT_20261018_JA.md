# Phase E — カメラVMDネイティブ入出力：開発チェックポイント

## 今回の変更
- MMD VMD 0002 のカメラ専用ファイルからフレーム・ターゲット・距離・Euler回転・24バイト補間・FOV・投影フラグを読み取る。
- VMDカメラ専用ファイルへの書き出し。入力を編集せず再出力した場合の数値往復検証を自動テスト化。
- REST API `POST /api/camera/vmd/native/import`（バイナリ → JSON）および `/api/camera/vmd/native/export`（JSON → バイナリ）。
- カメラ画面のネイティブ読込・ダウンロードボタン。UIでMMD座標のままであることを明示。
- 不正ヘッダー、切り詰め、非有限数、キー重複、サイズ制限をチェック。

## 未完了（Phase E完成ではない）
- MMD座標系とBAI/Three.js座標の厳密な変換、回転の順序、カメラ距離符号の照合。
- MMD 6チャンネルの独立Bezier補間および透視/平行投影切替を撮影プレビューへ反映。
- VMDキー編集とBAIカメラタイムラインへの正規保存、カメラVMDからの可逆書き出し。
- FBX/VMD再生の接続、リグ/親子/軌跡、カメラプリセットとレンズDOF実描画、WebMCP/標準MCP、実GPUブラウザ検証。
- **外部素材の実VMDとの照合は未実施。** カメラ専用ではないVMDや追加セクションを持つファイルはこの入出力では明示的に拒否する。

## 検証
`python -m unittest -q test_camera_vmd_codec test_camera_vmd_inspect test_bai_camera test_camera_3d_focus_contract test_camera_focus test_camera_move test_camera_interpolation`
`python -m py_compile server.py camera_vmd_codec.py`
`node --check camera.js`

## 再開時の最優先
MMDカメラ変換の仕様と実データに基づく再生照合を追加し、ネイティブVMDキーと通常カメラキーを混ぜずに連携する。Phase E全完了までユーザーへの動作確認依頼は行わない。
