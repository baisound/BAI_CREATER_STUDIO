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

## 未検証と次のゲート

この段階は**入力とバイナリ互換性**の検証。実SRTの歌詞には漢字があり、読みの確定や明示無音を行っていない。作品内の採用、実PMXでの元VMDとの顔・身体比較、実曲と歌声を含む長尺MP4、歌声に対する境界の自然さは未検証。実SRTの全発話を自動で確定扱いにしない。次は隔離作品で原本を登録し、読み未確定の拒否を確かめた後、所有者が採用する読みと口形の判断を分けて検証する。

モデル区分: 実素材の診断と共有パーサーの限定修正は高性能モデル、試験と記録は標準モデル。
