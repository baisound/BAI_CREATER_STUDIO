# ローカルGit履歴とタグ

このZIPには `.git/` を含み、コードをローカルで管理できます。Gitのリモートへの送信はしていません。

## タグ
- `v0.9.0-mcp-sync`：MCP双方向同期版のソース基準点
- `v0.10.0-vmd-auto`：MCP経由Blender実行・VMD登録・PMXプレビュー指示の追加

## 基本操作
```bash
git log --oneline --decorate --graph
git tag --list
git status
git show v0.10.0-vmd-auto
```

FBX、PMX、VMD、制作データは履歴肥大化とプライバシー対策で `.gitignore` により対象外。ZIPには既存素材が引き続き同梱されます。Gitで以前のコードへ戻してもデータのバックアップにはなりません。変更前に `data/` を別途バックアップしてください。
