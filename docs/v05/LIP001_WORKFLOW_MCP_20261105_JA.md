# LIP-001 SRTから採用までの標準MCP・WebMCP（Issue #187）

2026-11-05。v0.5の画面が使う保存APIへ、SRT取込、読み、候補、下書き、モーフ専用VMD、採用操作を接続した。どの操作も同じ作品IDとrevisionを使う。SRT・PMX・元VMDの原本を書き換えない。候補の生成だけでは作品へ採用しない。

## ツールと呼出し順

| 手順 | ツール | 使う値 |
|---|---|---|
| 1 | `bai_studio_srt_sources_get` → `bai_studio_srt_import` | 作品ID、現在のsource revision、`.srt`名、`utf-8`/`utf-8-bom`/`cp932`、原本バイトの正規Base64 |
| 2 | `bai_studio_lip_readings_get` → `bai_studio_lip_reading_set` | source ID/hash、発話番号、現在のreading revision、読みの状態・かな・明示無音 |
| 3 | `bai_studio_lip_candidate_propose` | 保存した読みから未採用の区間候補を計算 |
| 4 | `bai_studio_lip_drafts_get` → `bai_studio_lip_draft_save` | 現在のdraft revision、source hash、pronunciation version、作品FPS。区間は `startFrame,endFrame,mouthShape,weight` の4項目 |
| 5 | `bai_studio_lip_vmd_candidate_create` | source/reading/draft/PMX対応表のrevision。`dry_run=true` で検査、`false` で別名VMD候補作成 |
| 6 | `bai_studio_lip_adoptions_get` → `bai_studio_lip_adoption_mutate` | 対象3Dモデルと採用revision。`adopt`、`remove`、`undo`、`redo` は明示操作 |

元VMDとの合成候補は既存の [`bai_studio_lip_composite_candidate_create`](LIP001_COMPOSITE_MCP_20261105_JA.md) を使う。各読み取り結果のrevisionを次の保存へ渡し、409なら読み直す。出力APIの422は未確定読み・モーフ欠落・衝突などの理由を返す。SRTは任意のローカルパスをMCPへ渡せず、最大8 MiBのバイトをBase64で渡す。WebMCPは画面内で復号して画面と同じ `/srt/import` へ送り、標準MCPも同じHTTP APIへ原本バイトを送る。両者とも形式とサイズを送信前に検査する。

## 検証

- `node --check webmcp.js`、`python -m py_compile mcp_server.py`、`npm run typecheck` は成功。
- `CHROMIUM_PATH` を Chrome 156.0.8078.80 に指定し、`node tests/run-guarded.cjs tests/studio-v05-lip-mcp.test.cjs` を実行。隔離Chrome 1件成功、失敗0、スキップ0。9ツールの重複登録なし、標準MCPとWebMCPの取得値一致、双方からのSRT取込、読み保存、候補計算、下書き保存、別名VMD、採用・Undo・Redo・解除を確認。誤Base64と古いrevisionを拒否し、原SRT・PMXのバイトを保持した。
- `node tests/run-guarded.cjs tests/studio-v05-lip-composite-ui.test.cjs tests/studio-v05-render-mcp.test.cjs` は2件成功、失敗0、スキップ0。ガード対象の `data/` 5ファイルと `exports/` は前後で一致。

## 残る範囲

WebMCP対応ブラウザのネイティブ呼出し、利用者の標準MCPクライアント設定、Linux、実歌声SRT・実楽曲元VMD・長尺完成MP4、別PMXの自然な口形は未検証。AIの操作結果は保存値・バイナリの検査であり、表情の自然さやOwner採用を示さない。LIP-001全体は部分実装のまま。

モデル区分: 既存APIの照合・実装・隔離試験は標準モデル。
