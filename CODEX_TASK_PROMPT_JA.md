# Codexに渡す作業指示（そのまま使用可能）

このプロジェクトの `DEVELOPER_GUIDE_JA.md` を最初に全文確認してください。
私はMixamoのFBXをMMD向けVMDモーション制作に流用しています。

## あなたのタスク
1. このフォルダーの `server.py`、`index.html`、`MOTION_CATALOG_50.json` および `data/manifest.json`（存在すれば）を調べ、現状と未登録のFBXを把握する。
2. 私がダウンロードしたFBXの保存先を確認し、必要なものをモデルA/Bとモーションに分類する。既存データの上書き・削除を避ける。
3. FBXを `data/files` に正しく配置して `manifest.json` の `files` と `mapping` を更新する。サーバー起動時は原則 `/api/upload` を使い、直接編集時はサーバー停止・バックアップ・原子的更新を守る。
4. `MOTION_CATALOG_50.json` の英語モーション名に基づいて対応表を作る。現物FBXのファイル名が異なる場合、推測で誤割当しない。
5. `Kip Up`、`Corkscrew Kip Up`、`Knocked Down` を含むNo.46〜50を優先して動作を確認する。
6. 起動・再起動による自動復元、実FBXの読み込み、対応付けを検証し、失敗や未対応を列挙する。
7. MMD/PMX/VMDの既存環境を確認し、FBXからVMDへの安全な変換が可能な部分のみ実行する。ビューワーにVMD変換機能があると誤認しない。出力は既存のVMDを上書きせず別ファイルにする。
8. 実施結果を `CODEX_WORK_REPORT_JA.md` に、FBXごとの登録結果・割当・不足モーション・MMD変換検証を含めて保存する。

## 厳守
- 保存済みFBXとmanifestをバックアップせず削除しない。
- `mapping` は既存内容とのマージを徹底し、API全置換に注意する。
- 50パターンの参照は `MOTION_CATALOG_50.json`、実際のUI定義は `index.html` である。両者の不一致は明示する。
- FBX、PMX、VMDのボーンと姿勢の差異がある場合は補正・検証する。
- 未入手・未検証のモーションを完了扱いにしない。
- 元のMMD/VMDワークフローを壊さない。
