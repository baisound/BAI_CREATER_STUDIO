# A2 動画・連番・音声付き書出し 実装設計 v1

状態: **実装設計、未実装・未検証**。対象 `RENDER-001`〜`010`。所有者のA/A/A判断は [A2記録](A2_RENDER_DECISIONS_JA.md)、要求は [A2親仕様](RENDER_EXPORT_SPEC_JA.md)、時刻・保存・共通APIは [共通契約](IMPLEMENTATION_COMMON_CONTRACT_JA.md)。Phase Fで実装。A3 MMD FX の内蔵効果はその後に同じ固定フレーム描画へ差し込む。`NF-016`〜`018` のAOV等は対象外。

## 1. 処理の所有と実装順

現行 `server.py` に動画レンダージョブはなく、SCR-17はモック。既存VMD変換ジョブやカメラVMD出力を動画描画と混同しない。`studio` のP2プレビューが使うシーン評価関数を抽出し、描画時刻を整数Fで渡す。長時間のレンダーはサーバーにマニフェスト/キュー/完成物を保持し、**同一アプリの専用レンダータブ**が実際のWebGLフレームを描いて逐次送る。最初の実装ではタブ/ブラウザーを閉じるとジョブは `waiting_for_renderer` で停止し、再開時に検証済みフレームの次から描く。バックグラウンドで描画し続けたと表示しない。キューは1 GPUセッションを直列で実行し、同名の同時確定をロックする。頭なしブラウザーの自動実行は別の検証を通るまで既定にしない。

| WP | ID | 実装物と完了ゲート |
|---|---|---|
| F-01 | `RENDER-001/002/003/005` | 読み取り専用シーンsnapshot、固定F evaluator、RGBA frame readback、PNG連番。透過はstraight/premultipliedを明示し実ファイル再読込 |
| F-02 | `RENDER-004/006` | FFmpeg能力検出と短い試験、H.264+検証済み音声encoder、音声時刻計算、MP4再読込。音声を黙って落とさない |
| F-03 | `RENDER-007/008/010` | キュー、ジョブ復元、取消、フレームhash再利用/失効。MP4途中バイトから再開しない |
| F-04 | `RENDER-009` | 実ファイルの寸法/FPS/フレーム数/音声と黒・無音・ちらつき候補の検品結果。候補を人が確認できる位置へ結ぶ |

IDの作業位置: `RENDER-001`固定F、`RENDER-002`背景/透明、`RENDER-003`寸法/FPS、`RENDER-004`codec能力、`RENDER-005`PNG/EXR連番、`RENDER-006`音声多重化、`RENDER-007`キュー、`RENDER-008`差分再利用、`RENDER-009`検品、`RENDER-010`取消/再開。初期受入に含まれない形式は各IDの部分実装として残す。

## 2. `production.render.schema=1` とファイル配置

```json
{"schema":1,"presetVersion":1,"jobs":[],"queue":[],"capabilityCache":[]}
```

`RenderJob`: `id,createdAt,projectRevision,snapshotHash,assetHashes,range:{startFrame,endFrame},fps:{num,den},width,height,background:{kind,color,alphaMode},format,requestedVideoCodec,selectedEncoder,requestedAudioCodec,selectedAudioEncoder,audioClipId|null,audioAssetHash|null,outputHandle,outputName,state,verifiedFrameCount,expectedFrameCount,manifestRelPath,diagnosticId,verification`。`format` は `png-sequence/mp4` が初期受入、EXR/アルファ動画は能力と再読込の独立合格後だけ選択可能。`expectedFrameCount=endFrame-startFrame`、範囲 `[start,end)`。幅・高さは偶数で `16..8192`、FPSは有理数 `1..120`、フレーム数は1ジョブ最大36,000、推定中間容量が選択領域の空き容量を超えるなら投入拒否。720p/1080p/4K・横/縦プリセットはこの範囲で保持する。可変FPS動画は作らない。

`data/render_jobs/<jobId>/snapshot.json` は投入時のproduction/カメラ/素材参照・評価器版とhashを固定、`manifest.json` は各フレームのF/幅/高さ/sha256/状態を保持、`frames/<F>.png.part` から検証後 `<F>.png` へ確定、`output.part` と `verification.json` を持つ。最終成果物は利用者が許可した出力領域へ版名付きで移す。中間ディレクトリは管理下に限定し、任意パスをMCPへ公開しない。制作状態にはジョブID/状態/最終成果物IDと検品要約だけを保存する。ジョブ本体は再起動後も読み取れる管理ファイルで、`snapshotHash` が変わる編集は既存ジョブに混入しない。

状態遷移は `draft→queued→preparing→rendering→encoding→verifying→completed`。レンダータブ不在は `waiting_for_renderer`、利用者取消は `canceled`、失敗は `failed`。`completed` は **実ファイルの再読込検証成功後だけ**。どの状態でも `jobId`、最終成功F、工程、再試行可否、失敗コードをUIへ返す。`failed/canceled` の部分成果物を完成ファイル一覧に混ぜない。ジョブは変更不可、再試行は元jobのsnapshotを参照した新attempt IDを作る。

## 3. 固定フレーム描画と透過

- `evaluateScene(snapshot, frame)` はP2/Phase Eのカメラ・人物・ステージ・モーション、A1音声参照、導入済みA3効果を **壁時計・再生ヘッド・UI選択に依存せず**評価する。プレビューもレンダーも同じ関数。レンダーはショットのカメラを使い、ガイド/ギズモ/編集ハイライトを描画レイヤーから外す。素材ID/hashと評価器版が不一致ならフレームを描かない。
- 専用レンダータブはジョブの読み取り専用snapshotを取得し、出力寸法のWebGLRenderTargetへ `startFrame..endFrame-1` を順に描く。`readRenderTargetPixels` のRGBAを行方向/色空間/アルファ方式に従ってPNG化する。`canvas.captureStream()` や実時間MediaRecorderをフレームの正本にしない。GPU context loss、描画例外、ピクセルサイズ差、PNG化失敗は該当Fで停止。1フレーム最大64MiB、送信時に寸法/sha256を付け、サーバーはPNGシグネチャと再読込寸法・hashを確認してからマニフェストを進める。
- 単色/クロマキーは `alpha=1`、透過は `RGBA PNG + alphaMode=straight` を初期契約とし、ブラウザー内部のpremultiply設定と読み戻し結果を透明エッジのテスト画像で検証する。背景0alphaでも背景色のRGBを残す必要がある組合せは実測で判定し、未対応なら透過ジョブを投入拒否。H.264 MP4では透過を選べない。
- 長いレンダーを再開するときはsnapshot/評価器版/GPU能力/寸法/既存フレームhashを照合し、検証済みの連続prefix以外を再利用しない。入力が変われば別job。差分レンダー `RENDER-008` はショットごとの `camera/asset/motion/effect/audio` 依存hashとF範囲が一致した場合だけ既存PNGを再利用し、影響範囲が判定不能なら全区間再描画する。別GPUの画素一致を推測しない。

## 4. FFmpeg・音声・完成ファイル

- FFmpeg実行ファイルは管理設定から allowlist、版/hashを診断に記録。UI起動時 `listCapabilities` はバイナリ存在だけで可とせず、候補encoderごとに短い試験映像+試験音声を引数**配列**で作成し、`ffprobe` または同等の実再読込でcodec/寸法/FPS/音声を確認。H.264 + 利用環境で通った音声encoderをMP4の既定にする。H.265/VP9/AV1/ProRes/EXRは実ファイル往復が通った組合せだけ候補に追加する。能力結果はOS/FFmpeg版/GPU/driverごとに失効する。
- 音声は `AUDIO-001` の確定 `AudioClip` を使う。出力時刻0が`startFrame`。各出力サンプル `n` の絶対プロジェクト時刻 `t=startFrame*fps.den/fps.num+n/outputSampleRate` から、配置 `clip.startFrame` と `sourceStartSample` を使って元音声位置を**有理数**で求める。クリップ開始前/終了後は無音を生成し、範囲前から始まる場合は元サンプルをスキップ。音声原本を再エンコードする場合も配置値/hashをマニフェストに固定。選択音声が欠損/デコード不能/encoder不可なら音声付きジョブは拒否し、無音へ黙って変更しない。音声なしは利用者の明示 `silent=true` が必須。
- FFmpegは固定テンプレートの引数配列でPNG連番とPCM/WAV一時音声から `output.part` を作り、終了コード0でも完成扱いしない。再読込で動画codec/画素形式/幅/高さ/有理数FPS/フレーム数/尺/音声codec/チャンネル/サンプルレートを期待値と照合。先頭・中間・末尾の既知映像イベントと音声試験パルスの差を各1F以内として検品記録に残す。
- 同名成果物は `name-v2` のような空き版名を提案する。明示置換時は既存完成物を同一ボリュームの退避名に原子的に移動し、新成果物の検証・置換完了後も退避版を復元可能に保つ。退避/空き容量/同時ロックが保証できなければ置換拒否。失敗時は既存完成物を元名へ戻す。削除は利用者の別操作で、ジョブの取消が既存完成物を消さない。

## 5. コマンドと三経路

| `type` | target / payload | 結果 |
|---|---|---|
| `render.listCapabilities` | なし、dryRun | 実測encoder/形式/透過/最大寸法・失効理由 |
| `render.createJob` | なし、`{startFrame,endFrame,fps,width,height,background,format,videoCodec,audioCodec,audioClipId|null,silent,outputHandle,outputName}` | `draft` jobId、容量と互換警告。revision/snapshot固定 |
| `render.validateJob` | jobId、dryRun | 素材hash、GPU/encoder、容量、アルファ、音声検査。失敗時投入不可 |
| `render.startJob` | jobId、`{}` | 202、queued/renderer URL。状態遷移開始 |
| `render.submitFrame` | jobId+F、許可済みrendererセッションとPNGストリーム/hash | 検証済みF。一般MCPへ公開しない内部経路 |
| `render.cancelJob` | jobId、`{}` | 子FFmpeg/レンダータブ停止、部分成果物は未完成 |
| `render.resumeJob` | jobId、`{}` | hash検査後の次F/再エンコード可否。MP4バイト途中から再開しない |
| `render.getJob/listJobs` | jobId/なし、dryRun | 状態・進捗・失敗コード・検品・診断ID |
| `render.verifyOutput` | jobId、dryRun | 実ファイル再読込と黒/無音/ちらつき候補F。候補は人が確認 |

外部UI/WebMCP/標準MCPは同じProductionServiceの `render.*` を呼ぶ。`submitFrame` はサーバーが発行した期限付きjob/sessionトークンと同一originでのみ使用可能で、MCPの公開ツールにしない。MCPは任意FFmpeg引数や任意書込パスを渡せない。ジョブ作成・取消・再開はcommandIdで冪等、状態読取は副作用なし。ログはjobId/F/工程/エラーコード/処理時間、個人パス・音声本文・秘密値は記録しない。

## 6. SCR-17 と受け入れ試験

SCR-17に、入力snapshot、プリセット/能力、範囲/音声、透過可否、短区間実レンダー、キュー/進捗/検品の順で置く。開始ボタンは検証成功後のみ有効。進捗は検証済みF/期待Fと工程名を表示し、`waiting_for_renderer` ならレンダータブ再開の導線を示す。SCR-07は入口だけ、SCR-10の確定音声を参照し、SCR-16のショットID/範囲をコピーではなく参照する。実機能が接続されるまで「◇ 未実装」。

| ID | 自動/実機試験 |
|---|---|
| `RENDER-001/003` | 30/60/30000/1001fps、横/縦/4K、先頭/中間/末尾/ショット境界、プレビューと固定F描画の差、ガイド非混入、GPU喪失 |
| `RENDER-002/005` | RGB単色・クロマキー・RGBA透明エッジ、PNG欠番/破損、未対応透過codec拒否。EXRは実往復まで候補外 |
| `RENDER-004/006` | FFmpeg有無/encoder変化、音声先行/遅延/途中終了/頭出し、無音明示、試験音声の3点同期、MP4再読込、終了コード0でも破損の例 |
| `RENDER-007/008/010` | 2ショットキュー、編集途中のsnapshot不変、同名同時投入、取消・子プロセス停止、ブラウザー終了→再開、hash差で再利用失効 |
| `RENDER-009` | 黒/無音/ちらつき/欠番の意図的サンプルと誤検出、候補Fへ遷移、実ファイルの寸法/FPS/尺・音声報告 |

UI/API/WebMCP/標準MCP、Windows/Linux、実GPU、音声付き1080p60の完成ファイルを別々に報告する。データだけのテスト合格をGPU動画の実機合格としない。
