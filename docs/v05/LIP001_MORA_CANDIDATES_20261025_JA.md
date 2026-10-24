# LIP-001 SRTかなからの口形候補計算（Issue #187）

## 限定した計算

`GET /api/studio/v05/lip/candidates?project_id=...&source_id=...&srt_index=...` は、登録SRT原本と別保存した発話読みをハッシュ・時刻で再照合し、読みがある一発話に限ってレビュー用の口形区間を返す。原文の `[startMs,endMs)` をモーラ数で等分し、各境界を元開始時刻から直接算出する。作品FPSの整数フレームへも各時刻から一回だけ換算する。端数を前区間から積み上げない。

ひらがな/カタカナを正規化し、小書き仮名を前音と合わせる。母音A/I/U/E/O、促音「っ」と撥音「ん」のClosed、長音「ー」の直前母音、ま・ぱ・ば系列の短い先行Closedを候補とする。原時刻が短すぎてミリ秒やフレームに衝突する場合、未知のモーラや既存SRTの時間重なりは警告に残し `needs_review` とする。未確定発話は候補なし、明示無音も候補なし。提案読みは形だけ示すが `proposed` であり、全結果に `candidateOnly=true` を付ける。候補を制作キーやVMDへ自動採用しない。

この配分は音声アラインメントではない。利用者が時刻・形・強度を確認して修正する画面、確定キー、モーフ専用別名VMDと再読込、WebMCP/標準MCP、統合production.lipは後続。LIP-001完成とは扱わない。

## 試験

- `python -m pytest -q tests/test_studio_v05_lip_candidates.py`: 2/2成功。`まっすぐー` のClosed/A/Closed/U/U/U、小書き仮名、24fps変換、未知モーラと短区間衝突を単体確認。隔離HTTPで未確定→提案→確定、明示無音、原時刻1000〜6000msと作品F24〜144、原本改変時409と原本バイト不変を確認。
- `python -m py_compile studio_v05_lip_candidates.py server.py`、差分検査は成功。
- 実ユーザーSRT/歌音声との同期、画面表示、任意FPS、VMD書出、Linuxは未確認。
