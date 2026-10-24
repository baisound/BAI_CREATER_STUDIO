# 実PMX口モーフ「あ」の手動UI保存・編集・削除（Issue #96）

## 確認範囲

既存の[三時点検査](PMX_FACE_THREE_POINT_20261024_JA.md)を実際の口形の手動操作まで広げた。隔離作品へ201骨・168モーフの実PMX（SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`）と10秒の頭振りVMD（SHA-256 `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234`）を配置する。表情「まばたき」は共通APIからF0/F120/F270へ1/0/1を保存し、合成編集画面で実モーフ「あ」と口行を選び、0秒/4秒/9秒へ0/1/0を手動保存した。

UIの各保存で`face-set`のHTTP応答とscene revisionを読み、APIから同じモーフ名・時刻・値・行を再読込する。画面の3D読込revisionとscene保存revisionは別なので混同しない。ページを再読込し、F0/F120/F270の両モーフ値、体VMDの頭骨姿勢、合成画面の中央顔領域と各1フレームMP4を無キーの同時刻と比較する。最後に保存済み4秒の「あ」を画面で選択し、値を1→0.8に再編集してから削除し、他5キーが残ることを確認する。

## 結果

`node tests/run-guarded.cjs tests/studio-v05-pmx-face-three-point.test.cjs`の最終実行は隔離Chrome 1/1成功。手動の3保存と値変更・削除はHTTP 200、scene revisionは最終9。再読込後の合成画面中央の画素差はF0/F120/F270で123/58/123、MP4の差は1,018/1,259/1,179。体VMDの頭骨姿勢はキー追加前後で一致した。MP4撮影はNVIDIA GeForce RTX 4070 SUPER、ブラウザは隔離Chrome。元PMX/VMDと監視対象の利用者data 7件・exports 0件のハッシュは前後で一致した。`python -m pytest -q test_v05_scene_instances_v57.py`は11/11成功、`npm run typecheck`、JS/JSON構文、差分検査も成功。画素数はこの素材・実行環境に限る。

途中の試験では3Dプレビューの読込revisionを顔キーの保存revisionとして待ったためタイムアウトした。UIの`face-set` HTTP応答と保存APIを検査するよう修正した。次の実行では3D・MP4・保存の全比較が通った後、ブラウザが`ERR_NO_BUFFER_SPACE`を記録して試験全体は失敗した。余分な単独/合成画面の往復を減らし、合成画面内で比較する経路へ改めて最終試験を成功させた。この経緯を失敗がなかった扱いにはしない。

Issue #96の実PMX口・表情キーについて、存在するモーフの表示、複数時刻の保存・再編集・削除、同じ作品でのシーク・再読込・3D・限定MP4、原本保護を確認した。存在しないモーフ・無効値・古いrevisionの拒否は[既存のPython/実PMX試験](PMX_FACE_THREE_POINT_20261024_JA.md)と合同結果で確認済み。任意PMX、長尺、Linux、標準MCP実通信、視線・自動リップ、頂点変位解析・母音強度最適化、Owner採用は未検証であり、LIP-004/009全体は未完了。
