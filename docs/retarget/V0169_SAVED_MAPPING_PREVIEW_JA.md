# v0.16.9 保存済みボーン対応表を使う回転キーのプレビュー

## 対応範囲
- 元・転写先の登録アセットIDをペアのキーに使い、既存のモデル別プロファイルの `mapping` を読み込む。
- ソース/転写先の実骨名を骨格解析結果と照合し、不正な名前と転写先重複を拒否する。
- 入力サンプル `[{"bone":"LeftArm","frame":0,"rotation_xyzw":[0,0,0,1]}]` を、転写先のボーン名へ変換して表示する。
- 入力は変換せず、保存・モーション適用・VMD出力は行わない。
- `/api/retarget/mapping-preview`、画面「保存済みボーン対応表の回転プレビュー」、WebMCP・標準MCP `bai_retarget_mapping_preview` を提供。

## 重要な制限
この段階の動作は「ボーン名の割り当てをサンプル回転へ適用した数値プレビュー」であり、実モデルへアニメーションを適用する機能ではない。回転軸・基準姿勢差・ワールド/ローカル変換・ねじれ・スケール・リターゲティングの完成を意味しない。元アニメーションを読み込んでサンプルを自動供給する仕組みも未接続。変換元がPMXとBVHなど異なる場合も同様に保証しない。

## 実装・検査
- Python: `retarget_mapping_preview.py`, `tests/test_v0169_mapping_preview.py`
- HTTP API: `server.py`
- UI: `index.html`, `retarget_ui.js`
- MCP: `webmcp.js`, `mcp_server.py`
- `python -m unittest discover -s tests -q`、`node --check webmcp.js`、`node --check retarget_ui.js`
- 実ブラウザでのドラッグ操作、実PMX・VRMでの転写再生、実モデルでのVMD検証は未実施。

## 次の実装
実GLBのアニメーションキートラックと保存された対応表を直接結び、基準姿勢のクォータニオン補正・スキニング整合・3Dプレビューでの比較を実装する。
