# A1 歌音声・基本リップ・表情 実装設計 v1

状態: **実装設計、未実装・未検証**。対象 `AUDIO-001`、`LIP-001`〜`004`、`LIP-009`。所有者決定は [A1記録](A1_LIP_BGM_DECISIONS_JA.md)、要求は [A1親仕様](LIP_EXPRESSION_BGM_SPEC_JA.md)、保存/API/時刻は [共通契約](IMPLEMENTATION_COMMON_CONTRACT_JA.md)。A1はPhase Eの次、Fの前。`LIP-005`〜`008/010/011` と音声ミキサー `NF-002` を混ぜない。

## 1. 実装単位と現行コードとの差

| WP | ID | 実装 | 非重複境界 |
|---|---|---|---|
| A1-01 | `AUDIO-001` | 管理下への音声登録、実波形、歌音声クリップ配置、頭出し、同フレーム再生 | SCR-10の現在の波形は装飾。`NF-002` のEQ/ミキサーは作らない |
| A1-02 | `LIP-001/003` | SRT原本解析、読み確定、かな→口形候補、手動修正、モーフ専用VMDの書出/再読込 | 歌詞 `SCR-27` のキューと素材IDを共有してもキーは別レイヤー |
| A1-03 | `LIP-002` | 許諾済み歌声ステムの局所的音素アラインメント、品質/未確定表示、候補採用 | 推定不能でもA1-02の手動編集を塞がない |
| A1-04 | `LIP-004/009` | PMX/VRM実モーフ解析・対応、口/眉/目/視線/感情キーの優先合成 | VMD元キー、モデル原本、P2の表情再生を変更しない |

`motion_vmd_bridge.py` は骨キーVMDのみを出力し、`vmd_readback.py` は骨キーしか読まない。A1-02では新しいモーフレコード writer/readback を追加し、既存骨変換の成功を口形出力の証拠にしない。`studio/js/api.js` を入口にSCR-10/12/13から同じProductionServiceを呼ぶ。WebMCP/標準MCPはそのコマンドを写す。

## 2. `production.audio` / `production.lip` schema=1

```json
{
  "audio":{"schema":1,"assets":[],"clips":[],"selectedClipId":null},
  "lip":{"schema":1,"srtSources":[],"utterances":[],"morphMaps":[],"lipTracks":[],"expressionTracks":[]}
}
```

| レコード | 必須キー・不変条件 |
|---|---|
| `AudioAsset` | `id,sha256,relativePath,originalName,format,sampleRate,channels,sampleCount,decodeStatus`。原本最大400MiB、WAV PCM/MP3を初期受入。形式は拡張子だけで判定せず実デコードする。再読込でhash照合、欠損時は `missing` と表示。波形ピークは派生キャッシュとして原音声と分離 |
| `AudioClip` | `id,assetId,startFrame,sourceStartSample,sourceEndSample,enabled`。同一音声の複数配置を許すがA1の主歌音声は明示選択した1本。サンプル値は整数 `0<=start<end<=sampleCount`。`startFrame` はプロジェクト整数F。音量/EQキーは含めない |
| `SrtSource` | `id,sha256,relativePath,encoding,entries:[{index,startMs,endMs,text}]`。原本バイトと二時刻は不変。UTF-8 BOM/UTF-8/CP932を明示選択して解析し、曖昧な符号化を自動確定しない。番号重複、逆転、終了なしはエラー、時間重複は警告 |
| `Utterance` | `id,srtSourceId,srtIndex,readingKana|null,readingState,sourceStartMs,sourceEndMs,explicitSilence,pronunciationVersion`。`readingState` は `unresolved/proposed/confirmed`。本文中の漢字・未知記号・複数読みは未確定。明示無音は本文を削除せず `explicitSilence=true` |
| `MorphMap` | `id,modelAssetId,modelHash,entries:{A,I,U,E,O,Closed,Rest},analysisHash,confirmed`。entry は実モデルのモーフID/名称・重み範囲・PMX頂点変位指標/重なりまたはVRM expression定義。存在しないIDは拒否し、モデルhash変更で失効 |
| `LipTrack` | `id,modelInstanceId,utteranceIds,sourceAssetId,generatedKeys,manualKeys,enabled`。キーは `{id,frame,mouthShape,weight,source,confirmed,originId}`。source は `srt/aligner/manual`。手動 `weight=0` は有効値。候補は確定前に採用レイヤーへ入れない |
| `ExpressionTrack` | `id,modelInstanceId,keys:[{id,frame,morphId,weight,source,confirmed}],enabled`。眉・目・瞬き・視線・感情はモデルに実在する定義だけ。口と非口は同じモデルのモーフIDで衝突診断、身体ボーンキーに触れない |

上限は音声資産128、音声クリップ256、SRT発話10,000、モデルごとのキー100,000。長さは共通の上限1,000,000F。原音声/SRT/VMD/モデルのバイナリはproduction JSONへ埋め込まない。波形は各表示ズームに対してサンプル範囲の min/max を求める派生データで、キャッシュが失われても再生成できる。音声取込はUIで選択したファイルハンドルのみに限り、MCPはその許可済み assetIdを参照する。

## 3. 時刻・再生・SRT→口形の確定アルゴリズム

- 素材サンプル `s` のプロジェクト時刻は `t=(startFrame*fps.den/fps.num)+(s-sourceStartSample)/sampleRate`。逆変換は共通契約の一回限りの有理数丸め。AudioContextの壁時計を保存基準にしない。シークでは絶対時刻から再生成し、連続再生の誤差を積算しない。再生時の実測audio context driftは先頭/中間/末尾で記録し、1映像F超なら補正または失敗表示。欠損素材は黙って無音再生しない。
- SRTは各 `[startMs,endMs)` を独立に保存。歌詞画面のSRT時刻編集は原SRTを変更せず、リップには利用者が選んだ `SrtSource` の **確定版ID/hash** を明示して渡す。既に確定した口形キーは歌詞修正で自動再生成しない。差分を提示し、利用者の `regenerate` で候補レイヤーを作り直す。
- A1の標準読み規則: ひらがな/カタカナを正規化し、長音は直前母音を延長、促音「っ」は閉口候補、撥音「ん」は次音との境界で閉口候補、`ま/ぱ/ば` など唇閉鎖子音は母音開始前にClosedを置く。漢字・アルファベット・記号の読みは `unresolved` として利用者にかなを確定させる。辞書やLLMの補助候補を使う場合も確定前は発話をfinal出力させない。無音指定はその発話の口形キーを出さない。音声の無音検出だけで本文を削除しない。
- SRTだけの初期配分は確定したかなのモーラ数で `[start,end)` を等分し、先頭/終端を原時刻に固定して候補キーを作る。これは音声アラインメント結果ではないと表示する。手動で音素/口形境界をフレーム単位で移動できる。LIP-003の閉口長・子音先行・長音の変更は対象キーだけを変更し、他のモーフと原SRTは不変。
- LIP-002の初回局所エンジンは [Montreal Forced Aligner](https://montreal-forced-aligner.readthedocs.io/en/latest/) 3系と日本語 MFA acoustic/dictionary 3.0.0 を候補として固定し、実装コミットで実行版、モデルhash、[モデルのCC BY 4.0条件](https://mfa-models.readthedocs.io/en/latest/acoustic/Japanese/index.html)と依存の配布条件を監査する。実行は素材IDから管理下の一時音声/確定かなを作り、引数配列でローカルプロセスへ渡す。未導入・未対応OS・歌唱音声の推定不能時は `capability_unavailable`/`unresolved` とし、手動時刻を残す。時間境界の候補、解析版、音声hash、音素、未確定区間、品質値（計算不能なら `null` と理由）を保存し、確率と偽らない。歌唱データでの境界誤差は実測し、テストを通るまで高精度表示をしない。
- PMXは各口モーフの頂点オフセットの変位分布（median/95th percentile）と、共有頂点に対する母音間の重なりを実データから算出。強度候補はモデルごとに中央値比を基準モーフへ正規化し `[0,1]` に制限、ゼロ変位/グループモーフ/非頂点モーフは `manual_required` とする。VRMは定義済みexpression/bindを列挙し、欠けたA/I/U/E/Oを黙って他の表情へ対応づけない。分析値だけで自然さを決めず、実プレビューで利用者が確定する。
- 同一モデル・同一モーフ・同一Fの合成は **手動キー（0含む） > 確定済み生成キー > 元VMD** の値を選ぶ。キー間補間は採用元レイヤー内で行い、指定された発話区間外は元VMDへ戻す。未確定生成キーはプレビュー選択時だけ比較し、最終書出しに混ぜない。モデル上限へclipし、その事実を警告に残す。非口モーフも元VMDと手動表情の由来を表示する。Undoは手動/確定レイヤーのみ。

## 4. VMD書出しと共通コマンド

VMD初期受入は **モーフ専用の新規 `.vmd`**。VMD 0002 のCP932モデル名・モーフ名を厳格に符号化し、モーフレコード（名称15バイト、30fps整数F、float32重み）を昇順に書く。プロジェクトFPSが30以外なら共通時間を30fpsへ1回だけ変換し、複数キーが同じVMD Fになる場合は衝突を一覧にして確認なしで間引かない。CP932不可/長名/非有限/負フレーム/未確定読みに対して書出し拒否。現行 `motion_vmd_bridge.py` の骨キーwriterとは別モジュールとし、骨レコード0件、モーフ件数、後続セクション0件を正しく書く。`vmd_readback.py` をモーフ解析まで拡張して全キーを往復比較し、実PMXでの見た目は別に検証。原VMDを上書きせず、既存ファイル名衝突は版名を提案する。

| `type` | target / payload | 成功・失敗 |
|---|---|---|
| `audio.import` | 許可済みuploadハンドル、`{role:"vocal"|"music"}` | assetId/hash/ストリーム情報。デコード失敗422 |
| `audio.placeClip` | assetId、`{startFrame,sourceStartSample,sourceEndSample,enabled}` | clipId。範囲外400 |
| `audio.setOffset` | clipId、`{startFrame,sourceStartSample}` | 元/新時刻と同期差。素材外400 |
| `lip.importSrt` | 許可済みuploadハンドル、`{encoding}` | 原本ID、発話プレビュー。致命的構文422 |
| `lip.confirmReading` | utteranceId、`{readingKana|null,explicitSilence}` | 読み確定/明示無音。両方なし400 |
| `lip.proposeKeys` | lipTrackId、`{utteranceIds,mode:"srt"|"aligner"}`、dryRun | 候補キーと未確定箇所。AI/alignerなしでもSRTモード可 |
| `lip.setKey` | lipTrackId、`{keyId|null,frame,mouthShape,weight}` | 手動キー、採用元、Undo単位 |
| `lip.setMorphMap` | modelAssetId、`{entries,confirmed}` | 実在照合と分析値。別hash404/409 |
| `lip.setExpressionKey` | modelInstanceId、`{keyId|null,frame,morphId,weight}` | 表情キーと競合一覧 |
| `lip.previewSync` | clipId、`{frame,modelInstanceId,cameraId}`、dryRun | 音声サンプル/映像F/採用元/差分。未評価を明示 |
| `lip.exportMorphVmd` | lipTrackId、`{modelAssetId,outputHandle}` | 新規ファイルID、readback、未対応一覧。曖昧な読み/衝突時422 |

コマンドは共通 `POST /api/production/command` に入り、revision・commandId・dryRunを使う。`audio.import`/`lip.importSrt` のファイルは別の管理下upload段階を経て一時ハンドルにする。ファイル取込が失敗したら台帳とproductionの参照を追加しない。解析・推定の長時間処理は202ジョブへ分け、キャンセル時に候補だけ破棄。音声やSRT本文をログに残さない。

## 5. UI・MCP・完了ゲート

`SCR-10`: 上部に素材と同期/欠損状態、中央に**実**波形と現在F、下部に音声/口形、右にSRT読み・境界・拍への入口。`SCR-12`: 実モデルから取得したモーフと頂点分析/対応の確定。`SCR-13`: 口/表情レイヤー、元VMDとの採用元とA/B、眉/目/視線、Undo。`SCR-05` は入口だけ。全操作は手動可能。WebMCP/標準MCPは上表のコマンドを同じ引数/エラーで公開し、音声の任意パスやカメラ権限を与えない。

| ID | 必須試験 |
|---|---|
| `AUDIO-001` | WAV/MP3実デコード、先頭無音/異サンプルレート、開始F・素材内頭出し、シーク、3点同期（各1F以内）、再起動、欠損hash、音声原本不変 |
| `LIP-001/003` | SRT開始/終了、漢字未確定の出力阻止、明示無音、促音/長音/閉口、30以外のFPS衝突、モーフVMD全キー再読込、実PMXの口形再生 |
| `LIP-002` | 音声/歌声ステム/ノイズ/無音、解析器不在、音素境界の実測誤差、手動値不変、推定品質 `null` の表示 |
| `LIP-004` | 頂点変位が既知のPMX、グループ/無変位モーフ、実VRM、別モデルhash拒否、候補強度と利用者確定値の保存復元 |
| `LIP-009` | 同一Fの元/生成/手動0、指定外区間の元VMD保持、身体キーhash不変、Undo/Redo、UI/両MCP同値 |

Windows/Linux、実ブラウザー、実モデル・VMD、保存→プロセス再起動→復元、診断ZIPで原素材の秘匿を確認する。自動アラインメントの実データ誤差とPMX見た目は実測まで未検証。状態台帳は領域別ゲートが揃うまで計画・未検証を維持する。
