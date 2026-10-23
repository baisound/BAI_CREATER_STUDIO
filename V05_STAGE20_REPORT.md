# v0.5 枝番20 結果

ブランチ `feature/v05-ui-overhaul-20`（枝番19から派生）

- モーションの適用先モデルIDを保存・解除する新API: `POST /api/studio/v05/arrangement/clip/target`
- JSON入力は project_id, clip_id, revision, target_model_id（文字列またはnull）に限定。
- 素材台帳上の存在・形式・利用可否、トラックロック、リビジョン競合を検査。
- v0.5タイムラインのクリップ編集ダイアログに対象モデル選択を追加。
- MCP/WebMCP: `bai_studio_clip_target_set` を実装。実通信試験は未実施。
- Pythonテスト12件成功。構文検査はPython/JSいずれも成功。

制限: 実モデルの自動ロード・リターゲティング・姿勢描画、ブラウザE2E、MCP/WebMCP実通信は未検証・未完了。既存未コミット変更は保持。UI翻訳キーによる新規文言管理は未完成。
