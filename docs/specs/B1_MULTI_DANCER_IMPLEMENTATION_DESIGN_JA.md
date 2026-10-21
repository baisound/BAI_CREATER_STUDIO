# B1 複数ダンサー・フォーメーション 実装設計 v1

状態: **実装設計、未実装・未検証**。対象 `DANCE-001`〜`007`、`DANCE-012`。所有者のA/A/A決定は [B1記録](B1_MULTI_DANCER_DECISIONS_JA.md)、要求は [親仕様](MULTI_DANCER_SPEC_JA.md)。保存/API/時刻/座標は [共通契約](IMPLEMENTATION_COMMON_CONTRACT_JA.md)。Phase Cで実装し、P2/E/F/FXの完了を飛ばさない。格闘 `DANCE-008`〜`011` はB4。

## 1. 実装順・画面・既存機能との境界

P2の単体モデル表示・VMD/FBX再生・基本ステージ配置を再利用し、人物1体と素材を同一IDとみなす実装を拡張する。`studio/js/screens.js` のSCR-06/13は現在モック/未実装、`motion_layers.js` の単体補正JSONは複数体トラックの正本にしない。

| WP | ID | コード/画面の責務 |
|---|---|---|
| C-01 | `DANCE-001` | `DancerInstance` と人物別clip評価。SCR-06の配置、SCR-13の人物別トラック、同時再生 |
| C-02 | `DANCE-002/003/004` | 位置交換、4隊形、カノン/ミラー/主役交代を非破壊の区間レイヤーとして追加 |
| C-03 | `DANCE-005/006/012` | 部位ブレンド、接近警告＋回避候補＋手修正＋再評価、実骨への小道具接続/持ち替え |
| C-04 | `DANCE-007` | 人物別のモーフ/骨結果をVMDへ新規出力、個別結果と一部成功マニフェスト |

`DANCE-004` のカノン/ミラー/主役交代はC-02が所有する。各IDの合格は下記の個別試験で判定し、C-02全体の一括完了とはしない。

SCR-06は人物/配置/隊形/交換/回避とステージ接地、SCR-13はclip/部位/ミラー/小道具キーと書出し、SCR-12は実骨/素材の参照、SCR-16は主役/画角の読み取り。新規専用画面を作らない。現在の装飾トラックは実レコード接続まで`◇ 未実装`。

## 2. `production.dancers.schema=1`

```json
{"schema":1,"instances":[],"motionTracks":[],"formations":[],"swaps":[],"avoidanceEdits":[],"propBindings":[],"exportBatches":[]}
```

| 型 | 必須キー・検証 |
|---|---|
| `DancerInstance` | `id,modelAssetId,modelHash,skeletonProfileId,root:{position,rotation,scale},visible,locked,trackId`。同一モデルを複数人で使っても別ID/別root/別track。原モデルには書き込まない |
| `DancerMotionTrack` | `id,instanceId,clips:[{id,motionAssetId,motionHash,sourceIn,sourceOut,startFrame,speedNum,speedDen,blendFrames,bodyMaskId|null,mirrorId|null}]`。source区間 `[in,out)`、`speedNum/Den` は正の既約分数で `1/10..4`。同一人物の重複は明示ブレンドだけ。元モーション不変 |
| `Formation` | `id,type,pivot,forward,participantIds,startFrame,endFrame,spacingM,anchorOverrides,order`。typeは `v/circle/row/stagger`。ID欠損、重複、人数不足は拒否または未評価を明示 |
| `Swap` | `id,instanceAId,instanceBId,startFrame,endFrame,pathA,pathB,selectedCandidateId|null,applied`。pathはprojectF付きscene-world制御点。元位置/目標位置と各候補のmin距離/床外警告を保持。`applied=false` はプレビューだけ |
| `AvoidanceEdit` | `id,swapId,modelRadiusM,marginM,obstacleSnapshotHash,manualControlPoints,appliedAtRevision,recheckReportId`。適用後も元pathを保存しUndo可能 |
| `BodyMask` | `id,skeletonProfileId,boneIds,weight`。骨IDは実在、weight `0..1`。各人物ごとで他人へ波及しない |
| `MirrorMap` | `id,skeletonProfileId,axis,bonePairs,centerBoneIds`。左右の実骨を一対一で照合し、片側欠損ならその骨を無変換にして警告。暗黙の名前置換は禁止 |
| `PropBinding` | `id,propAssetId,propHash,holderInstanceId,boneId,startFrame,endFrame,offsetMatrix,handoffFromId|null`。同じpropの有効区間は重ならない。持替Fでは旧 `[start,F)`・新 `[F,end)`、受け手の実骨行列からオフセットを再計算してworld位置連続を維持 |
| `ExportBatch` | `id,projectRevision,selectedInstanceIds,results:[{instanceId,state,outputId|null,errorCode|null,warnings}]`。1件でも失敗なら `partial_success`、成功分は保持。元/既存完成物は上書きしない |

初期上限は同時人物32、人物ごとclip256、隊形128、交換128、prop接続512。8体超ではGPU負荷警告とLOD/解像度見直し導線を示すが、勝手に人物を消さない。`instanceId` を参照する隊形/道具/主役設定は削除時に参照一覧を返して409、利用者が先に解除する。

## 3. 固定フレーム評価と編集アルゴリズム

- 共通プロジェクトF `f` に対し各clipの素材内時刻 `sourceIn + (f-startFrame)*speedNum/speedDen` を有理数で求め、素材FPSへ変換して姿勢を補間。ループ/途中シーク/順序を変えた再生でも同じ姿勢。ブレンドは指定区間だけ、重複なしなら単独。人物root→隊形/交換→骨部位/mirror→propの順に評価し、A2の描画とVMD出力へ同じ結果を渡す。
- 隊形の初期アンカーはpivot基準で、`row`:中央寄せのX等間隔、`v`:先頭から左右へ交互に45度、`circle`:等角配置、`stagger`:2列交互の半間隔。`spacingM`既定1.5m、forwardはステージ水平面の正規化方向。アンカー編集は `anchorOverrides` に保存し、元テンプレートを残す。適用区間外は人物の元rootへ戻る。主役交代は既存ショット/カメラに渡す **選択人物IDと区間** の参照で、カメラキーの自動上書きはしない。
- `DANCE-002` のA/B交換は開始/終了の人物root位置から、中心の左右を回る2つのBezier候補を作る。各候補は全Fで補間し、ステージ床メッシュへの下向きraycast、他人物の簡易カプセル（半径は実モデルのXZ外接円から算出、余白既定0.2m）、障害物メッシュとの最小距離を記録。床がないFは `floor_unverified`、安全合格にしない。利用者が候補/制御点を選び修正した後だけ `applied=true`。適用後に**全参加者**の最小距離・足滑り候補を再評価する。
- `DANCE-006` の回避候補は**P2が保持する既存ステージ床**から作る0.25m水平グリッドと、4Fごとの時間層に対するA*で作る。B3の大型ステージ/chunk実装を前提にしない。床傾斜30度超/段差0.25m超は通行不可、モデル半径+余白内の他人物/障害物をコスト無限大。探索は両端を含む水平20m余白の矩形、最大200,000ノード・区間最大3,600Fに制限し、超過は `search_limit` として手修正へ進める。左右迂回と待機/間合い拡大の最大3候補を返し、元時刻・端点を維持。経路なしは `no_candidate` として手修正を可能にする。4F格子を滑らかな経路へ補間し、**全整数F**で床/他人物/障害物を再評価する。これらの値は演出用近似で精密な衝突保証ではない。候補はdry-runのみ、利用者確定後に新レイヤーへ適用し、同じ障害物snapshotと現状態で再評価。再評価で新たな接近があれば警告を残す。
- mirrorは明示 `MirrorMap` の骨ペアを正本にし、rootの左右反転面と回転quaternionの変換を同時に行う。部位ブレンドは骨ID集合とweightだけを変え、未指定骨・他人のキーを不変にする。propはB1で登録済み素材と実骨IDにのみ接続し、持替境界のF−1/F/F+1で二重保持/消失/位置ジャンプを検査。小道具の形状生成はしない。
- VMD一括出力はA1のモーフVMDとは別に人物別の評価済み骨/モーフを30fpsの新規 `.vmd` に変換。素材fps→30fpsは絶対時刻で変換し、キー衝突・CP932名・未対応骨を人物別レポートに残す。各ファイルは一時名で書きreadback後に個別確定し、失敗人物の一時ファイルだけ破棄。成功分をロールバックしない（O-DANCE-03）。単体の `motion_vmd_bridge.py` を複数体保存の正本とみなさず、writerを共通化する際は既存骨テストを維持。

## 4. コマンドとエラー

| `type` | target / payload | 結果 |
|---|---|---|
| `dancers.create` | modelAssetId、`{root,skeletonProfileId}` | instanceId/trackId。素材hash照合 |
| `dancers.setTransform` | instanceId、`{root}` | 現姿勢/Undo。ロック中409 |
| `dancers.assignClip` | instanceId、`{motionAssetId,sourceIn,sourceOut,startFrame,speedNum,speedDen,blendFrames}` | clipId/重複警告 |
| `dancers.previewSwap` | A ID、`{otherId,startFrame,endFrame,marginM}`、dryRun | 左右候補/距離/床・足滑り警告。適用しない |
| `dancers.commitSwap` | swapId、`{selectedCandidateId,manualControlPoints}` | 新非破壊レイヤー、再評価reportId。候補なしは422 |
| `dancers.setFormation` | formationId|null、`{type,participantIds,pivot,forward,spacingM,startFrame,endFrame,anchorOverrides}` | 位置/区間。人数・ID不正422 |
| `dancers.setCanonMirrorLead` | instance/shot ID、`{startOffsetFrames,mirrorMapId|null,leadRange|null}` | 他人とカメラ元キー不変。参照欠損404 |
| `dancers.setBodyMask` | instanceId、`{boneIds,weight}` | 変更骨/未対応骨一覧 |
| `dancers.previewAvoidance` | swapId、`{marginM}`、dryRun | 最大3経路、min距離/不可理由 |
| `dancers.commitAvoidance` | swapId、`{candidateId|null,manualControlPoints}` | 適用後再評価reportId。元path保持 |
| `dancers.bindProp` | propAssetId、`{holderInstanceId,boneId,startFrame,endFrame,offsetMatrix,handoffFromId|null}` | 接続IDと境界診断。二重保持422 |
| `dancers.exportVmdBatch` | なし、`{instanceIds,outputHandle,prefix}` | 202 jobId、人物別成功/失敗・全体 `success/partial_success/failed` |

共通APIの `If-Match/commandId/dryRun` を使い、接近の警告がないだけでは「衝突なし」と返さない。`exportVmdBatch` は書込許可済みハンドルだけを受け、パス文字列をMCPから実行しない。人物削除は参照を列挙し、明示確認の別コマンドでのみ行う。

## 5. 合格試験

| ID | 試験の正本 |
|---|---|
| `DANCE-001` | 同一モデル素材から独立した2体と別VMD/開始F、途中シーク、保存→再起動→復元、他人物のキー不変 |
| `DANCE-002/006` | 交差/狭い舞台/障害物/床欠損/回避不能で候補→手修正→適用→全員再評価。実測min距離/足滑り、dry-runの原本不変 |
| `DANCE-003/004` | 4隊形、2/3/8体、カノン、ミラー片骨欠損、主役交代、ショット境界、音声時刻と同期 |
| `DANCE-005/012` | 部位weight0/1/中間、非対象骨不変、実骨小道具持替F−1/F/F+1、欠損骨/prop、Undo |
| `DANCE-007` | 2体以上で1件成功/1件失敗→`partial_success`、成功VMD再読込、既存同名保護、全原hash不変 |

実PMX/VRM/VMD、Windows/Linux、UI/WebMCP/標準MCP、実GPUと多人数負荷、保存復元を別々に記録。計算上の接近警告と精密物理を混同しない。
