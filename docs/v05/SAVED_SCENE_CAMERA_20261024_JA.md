# v0.5 作品別の静的3Dカメラ — 2026-10-24

関連: Issue #63、`DATA-008`、`RENDER-001`。最短制作経路の同一シーン・プレビュー・書き出しの部分接続であり、カメラワーク全体の完成ではない。

## 接続範囲

- 複数モデルの3D表示で構図を動かし、「この視点を保存」を押すと、位置・注視点・画角を同じ作品のシーンrevisionと一緒に保存する。「保存視点に戻す」で再読込した視点へ戻せる。保存しない視点移動は作品を変更しない。保存後はモデル一覧側も読み直し、次の配置操作に古いrevisionを渡さない。
- 旧シーンファイルにはカメラ欄がなくても読める。未保存の作品は従来の自動構図で表示・出力する。保存操作はrevision競合、非数値・無限大、無効な画角、位置と注視点の一致を拒否し、原本を保持する。既存のモデル操作でも保存カメラを維持する。
- プレビューを開き直したときと限定3D MP4の別ブラウザ描画で、同じ保存済み視点を適用する。MP4開始時のシーンrevision照合にカメラも含まれ、古いrevisionの書き出しは拒否する。書き出し画面は保存視点か自動構図かを表示する。
- 手動UI、共通scene API、既存のWebMCP・標準MCPのscene mutate入口に`camera`操作を追加した。MCPからのGPU描画とカメラのキー編集はこの段階の対象外。

## 試験と根拠

- `python -m pytest -q test_v05_scene_instances_v57.py`: 7件成功。旧形式、保存と再読込、他作品への非混入、revision競合、無効な値と原ファイルhash不変、HTTPを確認。既存テストのUTF-8ファイル読込も明示した。
- `BAI_TEST_CONCURRENCY=1 node tests/run-guarded.cjs tests/studio-v05-scene-mp4.test.cjs tests/studio-v05-composite-scene-preview.test.cjs tests/studio-v05-real-pmx-vmd.test.cjs`: 逐次5/5成功。隔離Chromeでマウスによる視点移動、ボタン保存、ページ再読込と位置一致、古いscene revisionによるMP4要求拒否、保存視点版と自動構図版のデコード画素差を確認。GLB＋画像の限定MP4、実PMX＋短いVMDのF0/F120骨・プレビュー画素差およびF0/F240出力画素差も回帰確認。
- 実PMX SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`、実VMD `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234` は隔離試験の前後で一致。3D出力側はNVIDIA RTX 4070 SUPER/D3D11、プレビュー側はSwiftShaderと報告。`run-guarded`の利用者data 7ファイルとexportsは前後同hash。

## 残る条件

保存できるのは一つの静止視点。カメラの時間キー、カット、レール、焦点距離/F値・被写界深度、VMDカメラ、照明・ステージとの連動設定、Undo/Redoは未接続。表示言語の全動的メッセージ、Linux、ブラウザ実運用のMCP、長尺出力、全区間の音画1F同期も未検証。`CAM-003/005/015`や最短制作経路全体を完了扱いしない。

段階別モデル区分: カメラ保存契約・実装・試験・文書は標準モデル。
