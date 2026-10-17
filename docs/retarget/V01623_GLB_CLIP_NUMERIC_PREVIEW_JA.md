# v0.16.23 GLBアニメーションクリップ数値プレビュー

既存のGLBアニメーションの回転キーを抽出し、元ローカル基準回転に対する差分へ変換します。VRM Humanoidロールを照合して、既存ワールド基準姿勢の数値変換に渡す処理です。

* 操作: 骨格解析・リターゲティング準備に「GLB実アニメーションから回転デルタを数値プレビュー」を追加。
* API: POST `/api/retarget/glb-clip-rest-preview`。source, target, clip(省略可・単一クリップ時のみ), fps(既定30), coordinate_convention_confirmed=true。
* 同じAPIを WebMCP と標準MCP に追加。
* 未実装: 真の親アニメーション回転追跡、ターゲットVRMのローカル回転、メッシュ再生、スキニング/逆バインド行列、足IK、VMD出力。
* 制限: GLB埋め込みBIN、FLOAT密配列、LINEAR/STEP回転キーのみ。CUBICSPLINE、外部バッファなどは非対応。複数クリップは明示指定。
* 元ファイルは変更せず、Ollama不要。時刻→フレームは丸めのみで補間リサンプリングは行わない。
* テスト: 合成GLBについてキー抽出、未承認拒否、存在しないクリップ、上限、FPS値検証。実ブラウザおよび実VRM再生は未検証。
