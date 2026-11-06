# LIP-001 実歌声SRTと実曲VMDの入力互換性（Issue #187）

2026-11-05。所有者の `KYOKAI_LEAD_VOCALS_FORCED_ALIGNED.srt` と同じ曲の `KYOKAI_DANCE_MASTER_LIPSYNC_BLINK.vmd` を読み取り専用で確認した。実SRTは54発話・警告0件、最終終了228.365秒。実VMDは骨351,951キー・口形4,760キー、骨の最終F6900（230秒）。両者の時刻軸は約1.635秒の差で終わる。歌詞の読みや口形の自然さを、この時刻一致だけで認定しない。

## 空のモデル名欄

実VMDの20バイトのモデル名欄は先頭NULで、後続のバイトは残っている。従来の `studio_v05_vmd_rewrite._sections` は空のモデル名として拒否していた。VMDのこの欄は固定長のNUL終端文字列とされる（[OpenMMDの形式記述](https://github.com/dskjal/OpenMMD/blob/main/docs/specification/vmd-specification.md)）。現行のThree.js MMDParserも20バイトを文字列として読むため、空欄そのものを理由に拒否しない。これらと実ファイルから、入力のモデル名だけ空欄を許す判断とした。骨名と不正なCP932バイトは引き続き拒否する。原本ヘッダーの20バイトを正規化せず、候補へバイト保持する。

## 確認結果

- `BAI_REAL_LIP_SRT` と `BAI_REAL_LIP_VMD` に上記の原本パス、`BAI_REAL_MMD_DATA` に登録素材の `data/` を指定し、`python -m pytest -q tests/test_studio_v05_lip_real_song_inputs.py tests/test_studio_v05_vmd_morph_rewrite.py tests/test_studio_v05_vmd_rewrite.py` を実行。17件成功、失敗0、スキップ0。
- 実VMDの口形区画へ試験キーをメモリ上で1件追加し、骨・補間を含むprefixと後続区画がバイト一致すること、再読込で口形キーが4,761件になることを確認。原本SRT SHA-256 `6f6015eb7bfaf74f386f2cfea187ce2d2084034bce107195e874e1e76cf46e27`、原本VMD SHA-256 `61ce920e647c38e30d3f9738259e9d56b3bcf2f165243a4ec08770c35f896939` は試験前後一致。
- `BAI_REAL_MMD_DATA` を指定した `python -m pytest -q tests/test_studio_v05_lip_composite_candidate.py tests/test_studio_v05_lip_vmd_composite.py` は22件成功・失敗0・スキップ0。
- 同じ曲の身体のみVMDも空モデル名で、骨351,951キー・口形0キー。1キーをメモリ上で追加して全区画を再読込し、原本SHA-256 `6ec3818663ce3b6df36be47c37f5b9ee2c3f24296acc8e3c56e5f014c570a271` とprefix・後続区画を保持した。

## 隔離作品への登録と未確定読みの拒否

実PMX、実歌声SRT、実曲VMDを原本から隔離サーバーに複製し、製品のHTTP APIで空の作品を作成した。実PMXの「あ」モーフを解析して作品内の口形マップを保存し、SRTを取り込んで再読込した。54発話と最終228.365秒、保存された原本バイトのSHA-256が一致した。読みを指定していない発話の候補は `unresolved` で区間は空。別名口形VMD候補の試行はHTTP 422で拒否され、54発話すべてが `reading_missing` と診断された。実VMDは同じ作品のモーショントラックへ配置し、実PMXインスタンスに割り当てた。保存後の複数モーション計画は1件で `ready`、形式はVMDだった。これは計画の受理であり、実描画・動作の合格判定ではない。

`BAI_REAL_MMD_DATA`、`BAI_REAL_LIP_SRT`、`BAI_REAL_LIP_VMD` に原本パスを指定し、`node tests/run-guarded.cjs tests/studio-v05-lip-real-song-api.test.cjs` を実行。1件成功、失敗0、スキップ0。`run-guarded` は共有 `data/` 5ファイルと `exports/` の前後ハッシュ一致を報告した。隔離側でもPMX、VMD、保存されたSRT原本バイトのSHA-256を照合し、3つの外部原本の前後ハッシュは一致した。実PMX原本のSHA-256は `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`。試験サーバーは隔離データを使用した。

## 実PMX・実VMDの3D表示と1フレームMP4

同じ実PMX、登録テクスチャ139件、実曲VMDを隔離作品に複製し、Chrome 156.0.8078.80（`C:/Program Files/Google/Chrome/Application/chrome.exe`）のSwiftShaderで製品のv0.5画面を開いた。0秒と4秒のプレビューでセンター・上半身・頭・両腕・両足の骨姿勢に差があり、キャンバス画像のSHA-256も異なった。口モーフ「あ」は0秒で0、90秒で約0.001055に変化した。これは動作と値の実測であり、歌詞に合う口形や自然さの評価ではない。

製品の出力APIで作品F240の1フレームを720pのMP4に出力し、再読込でH.264/AAC、1280×720、1フレーム、約0.016667秒を確認した。復号した画面には輝度32超の画素が57,152点あり、キャプチャ記録に頭の姿勢と実VMDのSHA-256が残った。原本PMXとVMD、共有 `data/` の前後ハッシュは一致。`CHROMIUM_PATH` に上記Chrome、`TEMP` と `TMP` に書込可能な隔離フォルダー、`BAI_REAL_MMD_DATA` と `BAI_REAL_LIP_VMD` に実素材パスを指定した `node tests/run-guarded.cjs tests/studio-v05-lip-real-song-preview.test.cjs` は1件成功、失敗0、スキップ0。

初回はPlaywrightの既定Chromiumが未導入で起動失敗。Chrome指定後、出力のFFmpeg能力確認がサンドボックスの一時フォルダーへの書込拒否で503になった。書込可能な `TEMP`/`TMP` を指定し、FFmpeg能力確認を再実行して成功。3フレーム試行は試験側の待機上限を超えたため、1フレームへ絞った。最終試験では3Dキャプチャ・エンコード・MP4再読込まで成功した。3フレーム試行自体は未完走として残す。

## 54発話の読み確認準備

[仮読み確認表](LIP001_REAL_SONG_READING_REVIEW_20261105_JA.md)を作成した。原本の時刻・hashと対応を照合し、54行すべてを製品のかな入力規則で検査した。複数読みの可能性がある語を個別に示した。**全行がOwner未確認**で、作品の `readingState` は変更していない。

## 標準MCPの継続セッション

[両MCPの操作記録](LIP001_WORKFLOW_MCP_20261105_JA.md#実srtの継続stdioセッション2026-11-05)に実歌声SRTのstdioセッション試験を追加した。隔離作品で54発話の取込・再読込と#1の `proposed` 保存を確認し、Ownerの確定・採用は行っていない。

## Ubuntu WSLの限定検証

Ubuntu WSL（Python 3.12.3、pytest 7.4.4、Node 26.4.0）で、実SRT/VMDを読み取り専用に指定し、`python3 -m pytest -q tests/test_studio_v05_lip_real_song_inputs.py tests/test_studio_v05_vmd_morph_rewrite.py tests/test_studio_v05_vmd_rewrite.py tests/test_studio_v05_lip_composite_candidate.py tests/test_studio_v05_lip_vmd_composite.py` を実行。39件成功、失敗0、スキップ0。さらに `node tests/run-guarded.cjs tests/studio-v05-lip-real-song-stdio.test.cjs` と `tests/studio-v05-lip-real-song-api.test.cjs` を各1件実行し、両方成功、失敗0、スキップ0。各ガードで共有 `data/` 5ファイルと `exports/` の前後ハッシュ一致を確認し、実SRT/VMD原本のSHA-256もWindows側の記録と一致した。これはLinuxの計算・HTTP・標準MCP入口の限定確認であり、Linuxのブラウザー/GPU/MP4出力、他のMCP機能は未検証。

## 未検証と次のゲート

ここまでで**入力・隔離作品への保存・実VMD単体の表示と1フレーム出力**を確認した。実SRTの歌詞には漢字があり、読みの確定や明示無音を行っていない。作品内の採用、実歌声SRTに合わせた口形と元VMDの合成、実曲と歌声を含む長尺MP4、歌声に対する境界の自然さは未検証。実PMXと元VMD単体の3D表示および1フレームMP4は上記の範囲で確認済み。実SRTの全発話を自動で確定扱いにしない。次は所有者が確認する読み・無音の判断を発話ごとに確定した範囲で、採用口形と実曲VMDの合成、歌声に合わせた表示と出力を検証する。

モデル区分: 実素材の診断と共有パーサーの限定修正は高性能モデル、試験と記録は標準モデル。

2026-11-06追補：Ownerは既存VMDの口形を使うことを選択した。実歌声全区間との非0開始/29.97fpsの約231秒MP4を実GPUで検証済み。元口形9点/画素/190音声窓と保存再読込を照合。既存口形が約212秒で終わり最後4発話を含まないことを監査した。54発話の読みは未確定のままで、口形の無断補完・新規採用はしていない。[後続の実測](LIP001_REAL_VOCAL_LONG_20261106_JA.md)。
