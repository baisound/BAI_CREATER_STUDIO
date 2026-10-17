# v0.16.6 Phase B 統合検証（限定ゲート）

## 実装

`qa/phase_b_gate.py` は、ユーザーが指定するBVHの実バイト列から左右の足関節のワールド位置をサンプリングし、両足接地・滑り・衝突候補の診断を実施する。同じソースの明示的な骨対応表に基づくVMD書き出しを一時ディレクトリで実施し、バイナリ再読み込みとレコード数の照合をする。元BVHのSHA-256を前後で確認する。

```bash
python -m qa.phase_b_gate --source /path/to/motion.bvh --left LeftFoot --right RightFoot --bone-map /path/to/bone_map.json --report /path/to/report.json
python -m unittest discover -s tests -q
```

骨名・骨対応表は実ファイルに合わせて指定する。入力のY軸が上であることと、地面高さの数値が入力単位と整合することは使用者側で確認する。足首と靴底が一致するとは限らない。

## 品質ゲートの意味

`passed_limited_binary_and_diagnostic_checks` は BVH骨格サンプリング・両足診断・VMD保存/バイナリ読戻しの最低限の整合性のみを表す。`phase_b_status` は **NOT_COMPLETE 固定**。PMX/VRMで正常に踊ること、MMDの座標系・初期姿勢が一致すること、足IKが働くことを示さない。

## 未完了の必須項目

- 実PMX/VRMの骨格・基準姿勢を使用した変換と視覚確認
- FBX/GLBの実データを使う変換の総合検証
- 接地補正のボーンIKへの反映と非破壊補正レイヤー/出力VMDへの転写
- ブラウザの操作テスト、WebMCP/標準MCPの実クライアントテスト
- 現実のアセットでの品質基準・回帰試験

## テスト実績

v0.16.6時点で `python -m unittest discover -s tests -q` のテスト **56件成功**。本版のゲートはCLIであり、UIやMCPへ新規操作を公開するものではない。
