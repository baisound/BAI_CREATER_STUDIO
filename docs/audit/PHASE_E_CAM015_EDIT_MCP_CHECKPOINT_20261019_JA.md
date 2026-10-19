# Phase E CAM-015 編集API / MCP 継続チェックポイント

## 今回の変更
- `camera_sequence_edit.py`: add/update/remove の個別編集、`expected_sequence` による競合拒否。
- `server.py`: `POST /api/camera/sequence/edit`。`PROJECT_LOCK` の範囲で読み込み・編集検証・保存。
- `webmcp.js` / `mcp_server.py`: 同じAPIを使う書き込み操作を登録。
- `test_camera_sequence_edit.py`: 追加・更新・削除・競合・重複・参照失敗の検証。

## 完成扱いにしない理由
- ブラウザー・実MCPホストからの呼び出しは未検証。
- UIからMCP編集直後に自動反映する経路と、保存・再起動をまたぐ統合試験は未検証。
- VMDとの切替を伴う実描画、MMD互換性検証は未完了。

## 次の再開地点
承認済みCAM-015のMCP書き込み通信・シーケンスUIの整合を統合試験し、次にPhase E残件一覧から未完成項目を選ぶ。MASTER複数カメラは後順位。
