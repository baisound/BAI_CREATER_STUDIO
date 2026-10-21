# B2 音楽・リップ後段・顔表情 実装設計 v1

状態: **実装設計、未実装・未検証**。対象 `LIP-005`〜`008`、`LIP-010/011`、`LYRIC-006`。所有者A/A/A決定は [B2記録](B2_MUSIC_EXPRESSION_DECISIONS_JA.md)、要求は [親仕様](MUSIC_EXPRESSION_REMAINING_SPEC_JA.md)、時刻/保存/APIは [共通契約](IMPLEMENTATION_COMMON_CONTRACT_JA.md)。A1の歌音声/リップとB1の人物トラックを前提に、ロードマップのD残りで実装。作者本人の識別/評価、音声EQ `NF-002`、顔映像の無断保存はしない。

## 1. 実装順と画面

| WP | ID | 責務 |
|---|---|---|
| D-01 | `LYRIC-006` | 音声サンプル位置の拍マーカーを正本とする解析候補/手動編集。SCR-10波形で確認 |
| D-02 | `LIP-005/006/007/008` | 選択VMD集合のスタイル統計→理由付き提案→品質評価と採用→元/提案/採用後比較→モデル別不変版 |
| D-03 | `LIP-010` | 身体区間と感情表情の候補リンク。確定後も元身体/口形/表情キーを保持 |
| D-04 | `LIP-011` | 明示許可の顔入力からローカル候補を生成。実在モーフへ利用者が対応/採用、元映像は既定で破棄 |

D-02内の対応は `LIP-005` 統計、`LIP-006` 提案/評価/採用、`LIP-007` 前後比較、`LIP-008` モデル別VMD版管理であり、4件を個別に試験する。

SCR-13が編集と版の正本、SCR-05は入口、SCR-12はモデルごとの実モーフ/版、SCR-10は拍の正本、SCR-17は動画比較。画面を開いただけでカメラ権限を要求しない。現行モックに計算/保存はない。

## 2. `production.music.schema=1`

```json
{"schema":1,"beatMaps":[],"styleProfiles":[],"lipProposals":[],"lipVersions":[],"bodyExpressionLinks":[],"faceSessions":[]}
```

| 型 | 必須キー・不変条件 |
|---|---|
| `BeatMap` | `id,audioAssetId,audioHash,sampleRate,markers:[{id,sampleIndex,kind,source,confirmed}],bpmSegments,analysisVersion`。markerは整数サンプル昇順/重複なし、kind=`beat/downbeat/event`、source=`analysis/manual`。**markerが時刻の正本**、BPMは隣接間隔からの表示・補助。音声hash変更で旧mapはstale |
| `StyleProfile` | `id,orderedSourceVmdIdsAndHashes,modelAssetId|null,songAssetId|null,declaredAuthorMetadata|null,analyzerVersion,features,createdAt`。入力集合をID順に正規化してhash、実在作者の本人性/技量を推定しない。元VMDと骨キーは不変 |
| `LipProposal` | `id,profileId,targetLipTrackId,sourceKeyIds,proposedKeys,reasonCodes,qualityRating,adoptionState,adoptedKeyIds`。quality=`expressive/acceptable/needs_edit/unrated`、adoption=`unadopted/partial/adopted`。評価と採用を別保存。提案キーは採用までA1の確定レイヤーに触れない |
| `LipVersion` | `id,modelAssetId,modelHash,songAssetId,parentVersionId|null,sourceTrackHash,morphMapId,outputVmdId,outputHash,changeSummary,createdAt`。親版は不変DAG、同一モデルhash以外への復元は警告/拒否 |
| `BodyExpressionLink` | `id,modelInstanceId,bodyClipId,startFrame,endFrame,expressionMorphIds,proposalKeys,confirmed`。元身体/表情/口キーを書き換えず、A1合成順で採用元を表示 |
| `FaceSession` | `id,modelAssetId,modelHash,sourceKind,consentAt,sourceRetained,sourceAssetId|null,processorId,processorHash,candidateKeys,retainedUntil|null`。既定 `sourceRetained=false`。生フレーム/顔画像はproduction・ログ・診断ZIP・MCP応答へ保存しない。明示保存時だけ選択ハンドルの参照とhashを記録 |

初期上限: BeatMap 1音声10万marker、VMD集合200件、提案1トラック10万キー、版1000、顔セッション100。巨大映像/音声は管理下素材参照、JSONへ埋め込まない。異なる楽曲/モデルの統計を混ぜる場合は各入力タグと分布を別に表示する。

## 3. 拍・スタイル・候補の計算

- 拍解析はA1が管理する音声をmono PCMにデコードし、STFT（2048サンプルHann窓、512 hop）の正のスペクトル差からonset強度を作る。局所median+MADしきい値でピーク抽出し、自己相関でBPM候補60..220を算出。候補グリッドと実ピークの距離で最良列を選び、各markerを**元音声サンプル位置**へ丸めて保存。テンポ変化は8小節相当の窓を重ねて区間ごと再推定し、BPM数字だけを時刻正本にしない。無音/弱拍では `low_confidence` として候補なしでも手動marker可。解析が既存の確定markerを上書きしない。
- 手動の拍追加/移動/削除は `sampleIndex` に対して行い、波形上は共通FPSに換算したFと丸め差を併記。A2/A3/B1/B3が参照するのは `beatMapId+markerId+audioHash`。音声の配置開始F・頭出しが変わっても素材内サンプル正本からプロジェクト時刻を再計算し、イベントの絶対Fを無言で固定しない。参照元へ追従する/固定するを編集ごとに記録する。
- スタイル分析は許諾済みVMDの**口モーフレコードだけ**を読んで、モーフ別の発声開始差、重み中央値/IQR、持続フレーム、閉口間隔、隣接母音遷移を30fpsの元時刻と正規化時間で集計。モデル/曲が違う入力は層別表示。小標本（同一モーフ有効キー5未満）は `insufficient_data`。作者名は利用者申告メタデータとして表示するだけで、推定器の特徴に使わない。原VMD hashと分析版を保存し再現可能にする。
- `LIP-006` はA1で確定した口形キーを基準に、同じモーフ/音節役割のStyleProfile中央値へ持続/重みを寄せた**候補**を生成。変更キーの元/提案、理由（早い開口・長い閉口等）、統計根拠と入力集合を表示し、利用者が品質を評定し、別操作で全/選択キーのみ採用する。`needs_edit`でも未採用可、`acceptable`でも部分採用可。採用時はA1の「手動0 > 確定生成 > 元VMD」を守り、既存手動キーに衝突するキーは提案だけ残す。
- 比較は同一モデルhash、同一F、同一カメラsnapshotで `source/proposal/adopted` を選択して実姿勢とキー差を表示。版保存は親版を変更せず新しいVMD出力/再読込を行う。出力衝突や未対応モーフは当該版をfailedにして親版を残す。身体-感情連動 `LIP-010` は選択身体区間のイベントへ既存の表情モーフキー候補を新レイヤーとして結び、確定/Undoで元演技へ戻せる。

## 4. 顔入力のプライバシー・実装境界

初回エンジンはローカル実行の [MediaPipe Face Landmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker) のblendshape出力を候補とする。SDK版・モデルbundleの**個別ファイルhash、モデルカードと再配布条件**を実装コミットで固定する。SDKがApache-2.0でもbundle全体の条件を推測せず、配布可否が確認できるまではユーザーが選んだローカルモデルを参照する経路だけを有効化する。モデルなしなら `capability_unavailable`、手動表情編集は維持。実行時にCDNへ顔画像を送らない。

- `SCR-12/13` の明示「顔から候補」操作→入力種別（選択動画/カメラ）と保存しない既定を表示→利用者が開始→許可済みセッションだけローカル処理。カメラ権限拒否・顔未検出・複数顔・低信頼はキー候補を出さず理由を示す。タブ終了/取消でカメラtrackをstopし、生フレーム/中間特徴を破棄する。
- ブレンドシェイプ52値を30fpsでサンプルし、対象モデルの実モーフIDへ利用者が作った `MorphMap` だけで写す。非対応表情は `unmapped` とし推測して近いモーフへ代用しない。候補キーはタイムライン上で確認/採用するまで確定レイヤーに入れず、元動画は `sourceRetained=false` なら破棄。明示的に保存した場合だけ許可済み管理素材ID/hashを持ち、削除では参照/派生キーの扱いを確認する。表情から本人識別や感情の真偽を断定しない。

## 5. コマンドと試験

| `type` | target / payload | 結果 |
|---|---|---|
| `music.analyzeBeat` | audioAssetId、`{startSample,endSample}` | 202候補map、音声hash/版/品質。確定marker不変 |
| `music.setBeatMarker` | beatMapId、`{markerId|null,sampleIndex,kind,confirmed}` | ID/F換算/丸め差/参照影響 |
| `music.analyzeLipStyle` | なし、`{sourceVmdIds,modelAssetId|null,songAssetId|null}` | 202 profileId、集合hash/標本数/不足警告 |
| `music.proposeLipCorrections` | targetLipTrackId、`{profileId}`、dryRun | 元/提案キー・理由・根拠 |
| `music.rateProposal` | proposalId、`{qualityRating}` | 品質だけ変更、採用不変 |
| `music.adoptProposal` | proposalId、`{adoptionState,adoptedKeyIds}` | 採用キーだけ確定レイヤーへ、元/手動不変 |
| `music.compareVersions` | lipTrackId、`{sourceVersionId,proposalId|null,frame,cameraId}`、dryRun | 同一Fの3状態と差 |
| `music.saveLipVersion` | modelInstanceId、`{parentVersionId|null,outputHandle,changeSummary}` | 新VMD ID/hash/readback、親不変 |
| `music.setBodyExpressionLink` | bodyClipId、`{startFrame,endFrame,morphIds,proposalKeys,confirmed}` | 新レイヤー/競合警告 |
| `music.startFaceSession` | modelAssetId、UI発行入力ハンドル+`{sourceRetained}` | 202セッション。標準MCPはカメラを起動不可 |
| `music.adoptFaceKeys` | faceSessionId、`{keyIds,morphMapId}` | 実モーフへの候補だけ採用 |

カメラ起動はUIの明示操作のみ、MCPは既に許可/登録された動画の候補処理と結果読取だけ。共通revision/commandId/dryRun/エラーを守る。

| ID | 完了試験 |
|---|---|
| `LYRIC-006` | テンポ変化/弱拍/無音/FPS変更/頭出し変更/音声hash変更、手動marker、B1人物/A3発光/カメラが同一markerを参照 |
| `LIP-005/006/007/008` | 2モデル・2曲・異なる宣言作者、少標本、未採用/部分採用/採用、品質と採用の独立、元/提案/採用後実プレビュー、親子版復元/VMD再読込 |
| `LIP-010` | 身体区間と表情連動、競合警告、OFF/Undo時に身体・口・表情の元hash不変 |
| `LIP-011` | 許可/拒否/複数顔/未検出/モデル欠損/保存しない既定/明示保存、取消後track停止、診断ZIP/ログ/MCPに顔画像なし |

UI/API/WebMCP/標準MCP同値、Windows/Linux、実音声/VMD/顔入力、保存→再起動→復元を記録。顔モデルの利用権と実行環境を実装前に証拠化し、未確認なら顔自動候補は未完成表示のままにする。
