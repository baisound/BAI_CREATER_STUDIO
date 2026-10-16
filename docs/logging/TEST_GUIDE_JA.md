# 検証ガイド

`python -m unittest discover -s tests -v` を実行。
`python server.py 8765` で起動し、ビューワーの「診断ログ」タブで更新を確認。
ブラウザ開発者ツールで意図的な例外を発生させてログが記録されることを確認。
実FBX/PMX、WebGL描画・Blender変換・MCPからの操作は利用者のWindows/Linux環境で追加検証すること。
