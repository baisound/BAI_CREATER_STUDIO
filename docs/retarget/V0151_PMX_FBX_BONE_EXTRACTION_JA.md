# v0.15.1 PMX/FBX骨格抽出仕様

## 実装範囲
- `pmx_bones.py`: PMX 2.0/2.1のモデル情報とボーン定義を読取り。頂点/面/材質セクションを飛ばし、名前（日英）、親番号、変形階層、位置、終端、回転・移動付与、固定軸、ローカル軸、外部親、IK（リンク・制限角）を抽出。非破壊・読取り専用。
- `retarget_analysis.py`: PMX検査結果を既存の骨格解析APIと対応候補生成に接続。 `metadata.bones_detail` に詳細を格納。
- `tools/extract_fbx_skeleton_blender.py`: BlenderのFBXインポーターからArmatureのボーン名・親・head/tail・rest matrix、およびAction名・フレーム範囲をJSONに抽出。
- `retarget_analysis.py`: BlenderがPATHにある場合、FBXを一時ディレクトリ内で読込み、結果を取り込む。ない場合は `metadata_only` と理由を返す。

## 制約
- ボーン抽出はモーションリターゲティングの完成を意味しない。PMXだけでは正確なローカルレスト回転を一意に復元できず、モデル別校正が必要。
- Blender由来のFBX姿勢は元FBXのPreRotation・PostRotation等と一致を別途検証する必要がある。
- Blenderの実インポートはこの配布環境にBlenderがなく未検証。日本語名のPMX最小テストデータによるテストは合格。
- PMX ZIP登録の内部パスに対して直接本解析を呼ぶためには登録済みPMX本体への参照が必要。素材の種類に応じた参照先を用意する次フェーズで完結予定。
- ファイルや素材が不正な場合は解析失敗と明示し、修復・自動VMD出力はしない。

## API利用
既存の `GET /api/retarget/inspect?asset=<登録素材ID>` と比較APIを再利用。登録済みファイルを指定して抽出する。個別ローカルファイルの動作試験には `python -m unittest discover -s tests -p test_pmx_bones.py` を実行。

## 今後
モデル別ボーン対応の再利用、PMX ZIPアセット参照統合、Blender実機テスト、基準姿勢・軸校正、IK・接地補正、VMDへの焼き込みと比較QA。
