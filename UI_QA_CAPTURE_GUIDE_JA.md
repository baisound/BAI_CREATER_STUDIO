# 実ブラウザUIテストのON/OFFと記録管理

- 診断タブの「画面テスト記録」をONにしてから実行してください。初期状態はOFFです。
- ONにしただけでは録画・画像収集は始まりません。テストの実行時だけ結果とJPEGを保存します。
- Windows: `py -m pip install playwright` → `py -m playwright install chromium` → サーバーを起動 → `py tools/run_ui_qa.py`
- Linux: `python3 -m pip install playwright` → `python3 -m playwright install chromium` → サーバーを起動 → `python3 tools/run_ui_qa.py`
- 保存先：`data/ui_qa/<実行日時>/`。上限100MiB、10回、7日。古い実行記録から削除します。ログは外部へ自動送信されません。
- 実行結果は `results.json` に、各画面サイズのスクリーンショットはJPEGで保存。1920×1080、1366×768、1024×700を検査します。
- OFF時は記録を新規作成しません。従来のサーバー診断ログは別機能です。OFFでも通常のエラー診断ログは従来通り動作します。
- テスト結果に`needs_review`または`error`がある場合は合格扱いにしません。現在は表示と入口の基本的なスモークテストです。全ボタンのE2E検証ではありません。
