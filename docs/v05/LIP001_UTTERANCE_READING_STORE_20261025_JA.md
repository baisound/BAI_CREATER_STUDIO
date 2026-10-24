# LIP-001 発話ごとの読み・明示無音の分離保存（Issue #187）

## 変更範囲

登録済みSRTとは別の `data/studio_v05_lip_readings/<project_id>.json` に、作品単位のrevision付き発話データを保存する。`POST /api/studio/v05/lip/readings` はSRT原本ID/hash、番号、読み状態、かな、明示無音を受け、登録済み原本の内容ハッシュとキュー時刻を再照合する。保存する発話には元の `[sourceStartMs,sourceEndMs)` を複写し、読みの版を更新する。`GET` は再読込時に保存済み発話の原本状態 `valid`/`changed`/`missing` を返す。

未確定は読み無し、提案・確定は日本語かなだけ、明示無音は未確定・読み無しという組合せに限定した。漢字入りの読み、存在しないキュー、古いrevision、異なる原本hash、改変・欠損した原本では更新しない。明示無音はSRT本文を消さない。APIは字幕本文・かなを診断ログに送らない。

これは保存APIまでの限定接続。v0.5画面での読み編集、かな→口形候補、明示無音のVMD出力反映、別名VMD書出・再読込、統合production.lip、WebMCP/標準MCPは後続。LIP-001を完成としない。

## 試験

- `python -m pytest -q tests/test_studio_v05_lip_readings.py`: 隔離WindowsループバックHTTP 1/1成功。実バイトの人工日本語SRTを登録後、漢字本文に対するかな確定、別発話の明示無音、提案への更新、版数、作品分離、原SRTバイト不変、古いrevision・誤hash・不正かな・存在しない番号・原本改変時の拒否を確認。
- `python -m py_compile studio_v05_lip_readings.py server.py`、差分検査は成功。
- 実ユーザーSRT、画面操作、VMD生成、Linuxは未試験。
