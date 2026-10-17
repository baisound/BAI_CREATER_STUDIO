# v0.16.19 — 明示的な基準姿勢を使用した回転デルタ変換

- `POST /api/retarget/explicit-rest-preview`: `rest_pairs` にボーンロール別 `source_rest_xyzw` / `target_rest_xyzw` と転写先ボーン名を指定し、`samples` に回転デルタを指定する。
- `coordinate_convention_confirmed: true` が必須。これはユーザーによる確認であり、プログラムが座標系を検証できたことは意味しない。
- 各ロールの基底 `B = inverse(targetRest) * sourceRest`、出力デルタ `B * sourceDelta * inverse(B)` を算出する。四元数は `(x,y,z,w)`。
- 両方のRest四元数が**共通の参照座標系で与えられる場合のみ**数式に意味がある。親ボーン階層、逆バインド行列、PMXの骨軸、ねじり、補間曲線は未解決。
- UI：骨格解析パネルの「基準姿勢を指定した回転転写（試験）」から数値入力・確認・プレビュー。
- MCP：`bai_retarget_explicit_rest_preview`、WebMCP同名。
- 非破壊。GLB/VRMメッシュやVMDへの適用・保存はしない。AI/Ollama不要。
- 自動テスト：`python -m unittest discover -s tests -p 'test*.py'`。実モデルでのブラウザ比較・正確性は未検証。

## 次工程

実GLB/VRMボーンのrest回転と親変換から共通フレーム校正値を導出する専用処理、実モデル再生比較、および実PMXを対象とした検証を行う。
