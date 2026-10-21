# AUDIO-001 音楽と GLB ダンスの同期プレビュー（2026-10-21）

## Owner の最新指定

Issue [#39](https://github.com/baisound/BAI_CREATER_STUDIO/issues/39)。素材一覧の WAV/MP3 を音楽トラックへ置き、Baisound 通常 PMX に MVNT 出力の GLB モーションを当て、同じ時刻でプレビューする。先の FBX 指定は GLB に訂正された。手動の最終調整は、選択した音楽/モーションブロックを前後へ **1 フレーム**ずつ動かせること。従来の「AUDIO-001 はリップシンク段階まで待つ」順序より、この直接指定を優先する。リップシンク、EQ、書き出しはこの依頼に含めない。

## 実データの確認

Owner が実証対象として確定した登録素材:

| 役割 | 登録素材 | SHA-256 | 実測 |
|---|---|---|---|
| PMX | `mmd:A:Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx` | `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488` | 201 骨 |
| GLB | `integrated:cef762b38713abf09354.glb`（Dance of October 9 #1_motion） | `cef762b38713abf09354663fafa38c7ec196854166f1e353830da63ee8a01751` | 51 骨・153 トラック・60.034 秒 |
| WAV | `library:3be86086c554aeafc86fc914`（LAST CHASE） | `201f379be031b89245b4c5dbca039c1b29adb85d80307cb91e08dee66ccfdd0c` | 52,690,960 バイト・274.36 秒 |

PMX の骨名は「センター・腰・上半身・左足…」、GLB は `Hips/Spine/LeftUpLeg…`。単に GLB のクリップを PMX の mixer に渡しても骨名が一致せず踊らない。原本 PMX/GLB と weights は変更せず、プレビュー中にだけ骨の回転・センター移動を対応付ける。対応できない骨は状態欄で明示する。最初・中間・末尾、保存再読込、原本 hash を検証する。

## 実装契約

1. SCR-10 の実操作としてモデル（登録 PMX）、ダンス（アニメーション入り GLB）、曲（登録 WAV/MP3）を選択する。SCR-08 の選択素材から SCR-10 へ渡す導線も置く。音源デコード後に実波形を描く。
2. 音楽・ダンスの配置を 30 fps の整数フレームで持つ。各ブロックに開始フレームと素材内の頭出しフレームを保存する。選択ブロックの開始位置を ±1F、再生ヘッドを ±1F で動かせる。元素材のデータは動かさない。
3. 一つの `AudioContext.currentTime` を再生時刻の正本とし、音声は `AudioBufferSourceNode` を指定時刻・頭出し位置で再生成する。3D 姿勢は同じ時刻から毎フレーム評価する。停止・シーク・配置変更時は古い音声ノードを止める。
4. GLB の元の基準姿勢とその時刻の世界回転差を、PMX の対応する骨の基準姿勢へ写す。上半身・頭・腕・脚など対応できる主要骨のみ。GLB の Hips 移動は PMX センターへ身長比で写す。顔・装飾の weights は変更しない。
5. `data/music_dance_project.json` に登録 ID・整数フレームの配置だけを原子的に保存する。`GET/POST /api/music-dance/project` は revision/If-Match で外部更新を検知する。破損 JSON は黙って初期化せずエラーを表示する。素材欠損時は配置を保持して明示する。
6. Owner が曲を指定し、実ファイルは教示パスの下の `15-3rdシングル LAST CHASE/` に見つかった。元WAVの hash を確認して既存の素材APIで登録済み。短い CC0 見本でも機能試験し、実曲の先頭・中間・末尾を追加確認する。GPU・Linux・標準 MCP は別の未検証項目として残す。

## 段階別の現状

- 保存契約・API: `music_dance_project.py` と `GET/POST /api/music-dance/project`。整数フレームの検証、revision/If-Match、前版バックアップ、破損時の拒否。`tests/test_music_dance_project.py` の2件が成功。画面・同期再生は次段階で実装する。

## 受け入れの観測

- PMX/GLB の原本 hash は前後で同一。実3Dで異なる時点の姿勢が変わる。
- 曲と踊りの開始位置を別々に ±1F し、波形ブロック/ダンスブロックと出音/姿勢がそのフレームに追従する。
- 再生、停止、途中シーク、再開、画面再読込、保存復元、欠損素材、revision 競合を確認する。
- 自動試験は合成素材でフレーム写像と API を確かめ、Owner 実データで見た目と動作を確認する。実 GPU の確認と Owner 採用は別記録とする。
