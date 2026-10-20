# B4 格闘・接触・ステージギミック 実装設計 v1

状態: **実装設計、未実装・未検証**。対象は `DANCE-008`〜`011`、`LYRIC-010` のイベント連動、`MOTION-021`。所有者の `O-COMBAT-01/02/03=A/A/A` は [決定記録](B4_COMBAT_STAGE_DECISIONS_JA.md)、要求と合格条件は [親仕様](COMBAT_STAGE_SPEC_JA.md)。本書は [共通契約](IMPLEMENTATION_COMMON_CONTRACT_JA.md) を具体化する。P2/E、B1の人物・小道具、B3の登録済みピボットが完成してから実装し、順序を繰り上げない。物理安全、格闘技の有効性、ゲームの勝敗判定は対象外。

## 1. 実装対象とコードの境界

| 実装単位 | 作るもの | 既存物との境界 |
|---|---|---|
| H-01 接触 | `production/combat_schema.py`、`combat_service.py`（名称は予定）、固定フレームのポーズ評価アダプター、SCR-13 の2体トラック/接点ビュー | `DANCE-001` の安定インスタンスIDと `DANCE-002/006` のroot経路を参照。元VMDを書き換えない |
| H-02 拘束/連続技 | `DANCE-009` の `GrabConstraint`、`DANCE-010` のノックダウン→Kip Up、`DANCE-011` の `ComboSequence` 評価、SCR-13の区間・分岐・Undo | `DANCE-012` の小道具接続を再利用。部位マスク・ミラーはB1の計算後に適用 |
| H-03 ギミック | `StageGimmickEvent` の検証/評価、SCR-06可動物とSCR-13イベントの相互参照 | ピボット/資産の登録、階層・単位はB3。新規ピボットの造形やゲームロジックは作らない |
| H-04 物理 | `PhysicsBakeJob` と固定条件アダプター、対象部位のベイクレイヤー、SCR-12/06の比較 | 既存 `motion_layers.js` の単体ボーン回転JSONへ混ぜない。VRM SpringBone比較 `REVIEW-009` と分ける |
| H-05 連携 | `server.py` の薄いルート、`studio/js/api.js` と `store.js` の production 接続、`webmcp.js`/`mcp_server.py` の同一コマンド写像 | `/api/project/bundle` schema=1 に B4 フィールドを直接足さない。共通契約の schema=2/ジャーナル後に接続 |

実装者は各Hを単独でコミットし、関連ID・テスト・未検証をロードマップ/進捗に記録する。H-04 のエンジンが利用不可ならH-01〜03は独立して動作できるが `MOTION-021` は未完成のままにする。

## 2. データ契約（`production.combat.schema=1`）

すべてのIDはUUID、時刻は共通仕様の整数フレーム/半開区間、位置は評価済みシーンworldメートル、回転は正規化quaternion。配列順を表示順として使わず `order` を明示。任意項目は `null` を明示し、未知キーを拒否する。1プロジェクトの初期上限: pair 64、接点イベント1000、拘束256、連続技128、ギミックイベント512、ベイク参照256。上限はサーバーが返しUIに残数を示す。

```json
{
  "schema": 1,
  "pairs": [],
  "contactEvents": [],
  "rootCorrections": [],
  "grabConstraints": [],
  "comboSequences": [],
  "gimmickEvents": [],
  "physicsBakes": [],
  "selectedIds": {"pairId": null, "eventId": null}
}
```

| レコード | 必須フィールドと検証 |
|---|---|
| `InteractionPair` | `id,attackerInstanceId,receiverInstanceId,attackClipId,reactionClipId,startFrame,endFrame,enabled`。二体は別の実在インスタンス、クリップは各人の実在トラック、区間は両クリップの可視区間と交差。参照欠損なら保存拒否、後日素材欠損なら無効表示 |
| `ContactEvent` | `id,pairId,frame,attackMarkerFrame,reactionMarkerFrame,attackerAnchor,receiverAnchor,expectedNormal,rootCorrectionId|null,note,sourceHash`。anchor は `{kind:"bone"|"prop",refId,localPoint:[x,y,z]}`。bone はモデルの実骨ID、propはB1登録済み道具の接続点。`expectedNormal` は攻撃者→相手への単位ベクトル、ゼロ不可。3つのframeはpair区間内。`reactionMarkerFrame-attackMarkerFrame` を時刻差とする |
| `RootCorrection` | `id,instanceId,startFrame,endFrame,positionKeys,rotationKeys,sourceHash`。キーは `{frame,value:[x,y,z],interpolation:"linear"|"step"}` と `{frame,value:[x,y,z,w],interpolation:"slerp"|"step"}`。既存rootレイヤーへ加算する非破壊補正。1フレームの重複キーは拒否、接触プレビューは補正前/後の両方を評価 |
| `GrabConstraint` | `id,pairId,sourceAnchor,targetAnchor,startFrame,endFrame,weightKeys,releaseMode,offsetMatrix`。実骨/登録道具だけ。`weight` は0..1、開始/終了区間外は0。初期値は区間開始/終了の2フレームで線形に入切する。`releaseMode="restore_source_motion"` に固定。target→sourceの依存有向グラフに循環があれば422 |
| `ComboSequence` | `id,pairId,segments:[{id,order,startFrame,endFrame,attackClipId,reactionClipId,kind,branchId|null}],selectedBranchId|null`。`kind` は `attack/evade/counter/knockdown/kip_up/recovery`。各分岐は人が選ぶ編集上の代替テイクで、実行時AI/ゲーム分岐ではない。選択した経路で3〜4技を連結できる。区間重複と反応欠落を警告し、黙って補間しない |
| `StageGimmickEvent` | 共通: `id,stageAssetId,stageHash,pivotId,mode,keys:[{frame,value}],minValue,maxValue,axis,unit`。`mode="absolute"` なら `startFrame,endFrame,triggerEventId:null`、キーのframeはプロジェクト絶対F。`mode="event_relative"` なら `startOffsetFrames,endOffsetFrames,triggerEventId`、キーのframeは参照接触イベントからの符号付き相対F。実効Fは `contact.frame+offset`、実効区間が `0..1_000_000` を外れたら422。2つの時刻形式を混ぜない。pivotはB3登録ID、軸は資産ローカル、角度度/移動mを `unit` で明示。範囲外・同pivotの同frameに異なる値は422。衝突物理で扉を自動開閉しない |
| `PhysicsBakeRef` | `id,modelInstanceId,modelHash,motionHash,rigidBodyHash,affectedBoneIds,startFrame,endFrame,preRollFrames,engineId,engineVersion,engineBinaryHash,environment,seed,tickRate,settingsHash,inputHash,outputHash,manifestRelPath,state,enabled`。本体は管理領域の別ファイル。`state` は `ready/stale/unverified/missing`。ジョブ進捗/失敗は別job状態だけに記録し、検証・明示採用前にproductionへ参照を追加しない。失効しても旧版を自動削除しない |

UIで設定する既定値: 接触警告距離 `0.08m`、時刻ずれ警告 `2 project frames`、接地/貫通の可視化用距離 `0.02m`、掴み重み `1`、ギミック最小/最大は **登録ピボットが持つ範囲**、物理プリロール `2秒`、物理tick `120/1 Hz`、seed `0`。警告閾値はプロジェクトに保存し、モデル縮尺の実測前は「参考値」と示す。閾値内でも自動合格とは表示しない。これらは承認機能を実装するための初期値で、物理的安全値ではない。

## 3. フレーム評価の順序と計算

1. 共通時刻 `f` でP2の素材クリップを評価し、B1の各ダンサーの配置、ミラー、部位ブレンド、隊形/交換、登録小道具の持ち替えを適用する。素材元のVMD/FBXキーは不変。
2. B4の確定済み `RootCorrection` を人物rootへ適用（位置はworldで加算、回転は正規化quaternionを既存root回転へ右から合成）。`GrabConstraint` は参照側の確定ワールド行列からoffsetを合成し、重みで **対象の評価済み骨/道具行列だけ**を混合する。同一対象への複数拘束の重複は422とし、推測で優先しない。区間 `[startFrame,endFrame)` の最初/最後は最大2Fで線形ランプし、区間が1Fならその1Fだけ指定重みを適用する。区間終了フレームでは重み0、元のモーションへ戻る。拘束が要求する実骨が欠ければ、プレビューは警告付き元モーションで続け、拘束は適用済みと表示しない。
3. `ContactEvent` の両アンカーへ各人物の評価済みworld行列を掛け、距離 `||A-B|| m`、方向差 `acos(dot(normalize(B-A), expectedNormal))` 度、攻撃/反応クリップの該当マーカーのフレーム差を計算する。長さ0の方向は `directionUnavailable`。同じ `f` のカメラ画像に A/B接点・差ベクトルをオーバーレイする。数値、カメラID、入力hash、frameを一緒に返し、画像取得失敗なら「映像未評価」。**距離閾値だけでは合否を作らない**（O-COMBAT-01）。
4. `ComboSequence` は選択分岐のsegmentだけを時刻順に評価。`knockdown→kip_up` は別区間で、床接触候補は足/腰のscene-world最低点とB3の床面の差を表示する。足滑りは接地候補フレーム間の足world移動量、身体貫通は実メッシュの粗い交差候補として表示し、どれも精密衝突の保証ではない。床/メッシュ情報がない場合は `not_evaluated`、ゼロ件と表示しない。
5. `StageGimmickEvent` は登録ピボットの元変換へキー補間を別レイヤーとして適用。`event_relative` は確定済み `ContactEvent.frame` を基準0とし、保存する相対キー/区間を評価時に絶対Fへ移す。参照イベントのFが変われば同じ相対値で追従し、参照が欠ければ未評価。区間外は元状態。ピボット順はB3の親子階層順、階層循環は登録時に422。同一ピボットの実効区間が重なり値が競合する場合も422。評価に失敗したイベントはその可動物を元状態で表示し、警告を出す。
6. 物理が有効な対象部位のみ、入力条件が一致する `ready` ベイクを後段で合成する。元VMD/拘束/ピボットを上書きしない。無効・失効・欠損ベイクは元モーションで描画し、画面と出力に未適用警告を残す。出力時には採用レイヤーと未対応箇所をマニフェスト化する。

接触候補の評価は必ず `dryRun` から始め、補正候補を別レイヤーに置く。人が選んだ補正だけ `commit` し、直後に全イベントを再評価する。Undoで補正レイヤーと採用操作を戻し、他人物の元クリップとB1の既存編集は変えない。

## 4. 物理ベイクの実装を固定する

2026-10-21 の依存確認では `package.json` に物理エンジンがなく、現行コードはMMD物理ベイクを実行しない。`three@0.160.1` の同梱 `examples/jsm/animation/MMDPhysics.js` は MMDLoader由来のrigid body/constraint情報と **Ammo.js** を要求する（[Threeの該当ソース](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/animation/MMDPhysics.js)、[Ammo.js本体とライセンス](https://github.com/kripken/ammo.js/)）。H-04の初回エンジンを **固定版Three MMDPhysics + hash固定したAmmo.jsビルド**にする。開発時に取得コミット、配布ファイルのSHA256、zlibライセンスと同梱通知を `third_party/` の記録へ固定し、実装・再配布前の検査を必須にする。リモートCDNを実行時に読まない。PMXの剛体/ジョイント/骨がローダーから取得できなければ `capability_unavailable` とし、単なるSpringBoneや擬似揺れで成功扱いしない。VRMのMMD物理ベイクは、明示的に互換剛体データが登録された場合だけ対象にし、VRM SpringBone ON/OFF（`REVIEW-009`）とは別。

- ジョブ開始時にモデル、PMX剛体/ジョイント、ベースVMD、B1/B4の確定レイヤー、対象骨、区間、ソルバー設定、ランタイム版、OS/ブラウザー/CPUアーキテクチャ、WebAssembly版をスナップショット化し `inputHash` を求める。計算はプロジェクトの再生ヘッドと切り離した専用Workerで行う。素材本体をログへ書かない。
- 初期状態は **プロジェクトF=0の実姿勢/剛体配置と速度0** に固定する。`preRollFrames` はその姿勢を保持したままF=0より前に相当するtick数だけウォームアップし、続いてF=0から範囲終端まで120Hz一定刻みで進める。途中シークは **独立した新規シミュレーションを開始せず**、入力hashと状態hashを検証した先行チェックポイントから再計算する。非整数FPSの出力フレーム時刻は隣接tickの位置線形/回転slerpでサンプルし、方法と丸めをマニフェストに保存する。Worker失敗、NaN、骨欠損、途中取消は新成果物を `failed/canceled` とし、適用中の旧ベイクは保持。
- 本体は `data/bakes/<uuid>/` の `manifest.json` とフレームごとの対象骨位置/quaternionのチャンク（リトルエンディアンfloat32、開始フレーム/件数/骨ID一覧、チャンクSHA256）に保存。一時ディレクトリに全チャンクを書いて検証後に公開する。元PMX/VMDに書き戻さない。上限は1ジョブ `36_000` 出力フレーム、対象骨 `256`、中間データ `2 GiB`。超過は開始前に413で分割案を示す。容量不足は旧版を壊さず失敗。
- `settingsHash/inputHash/engineBinaryHash/environment` の全一致だけで**再利用候補**にする。環境ごとに代表区間（開始、中央、末尾近傍の各2秒）を同じ初期条件から再計算し、正規化後の骨位置 `1e-5m`、quaternion角 `1e-4rad` 以内で一致したとき `ready`。一致しなければ `unverified` にし再ベイク。異なるOS/GPU/engine版へ `ready` を引き継がない（O-COMBAT-02）。部分再計算は変更点より前の**一致検証済み**チェックポイントから対象部位/範囲だけを更新し、依存剛体/接触が区間外へ跨るなら初期状態から再計算する。判定できなければ全範囲再計算。
- UIの進捗は `queued/preparing/simulating/verifying/ready/failed/canceled`、検証済みフレーム数、取消可否を返す。表示OFFはベイク本体を消さない。出力時は適用ベイクIDとhash、入力hash、版、未検証警告をレポートする。動画とVMDの再読込で適用された骨キーと非対象骨キーを確認する。

## 5. 共通コマンドと状態遷移

経路とエラー形式は共通契約。以下の `type` は確定名。`GET /api/production?domain=combat` は `production.combat` と一式revision、欠損参照の警告を返す。読取やプレビューは制作状態を変更しない。`targetId` は表の対象ID。入力例はJSONキー名を規範とし、UIとMCPは同じJSONを送る。

| `type` | `targetId` / `payload` | 結果・失敗 |
|---|---|---|
| `combat.createPair` | `targetId=null`, `{attackerInstanceId,receiverInstanceId,attackClipId,reactionClipId,startFrame,endFrame}` | `pairId`。同一人物・区間外は422 |
| `combat.setContactEvent` | `pairId`, `{eventId|null,frame,attackMarkerFrame,reactionMarkerFrame,attackerAnchor,receiverAnchor,expectedNormal,note}` | `eventId`、変更前後の数値。実骨/prop欠損404 |
| `combat.previewContactAlignment` | `eventId`, `{frame,cameraId,warningDistanceM,warningTimeFrames}`、常にdryRun | 距離m、角度度、時刻差F、A/B world点、オーバーレイ参照、`evaluated`。映像失敗は未評価警告 |
| `combat.commitRootCorrection` | `pairId`, `{correctionId|null,instanceId,startFrame,endFrame,positionKeys,rotationKeys}` | 新レイヤーIDと再評価結果。元VMDは不変 |
| `combat.setGrabConstraint` | `pairId`, `{constraintId|null,sourceAnchor,targetAnchor,startFrame,endFrame,weightKeys,offsetMatrix}` | 拘束ID。循環/二重対象は422 |
| `combat.setComboSequence` | `pairId`, `{sequenceId|null,segments,selectedBranchId}` | 欠落反応/重複警告と選択分岐。自動勝敗なし |
| `combat.setStageGimmickEvent` | `pivotId`, `{eventId|null,stageAssetId,stageHash,mode,keys,minValue,maxValue,axis,unit,startFrame,endFrame,triggerEventId:null}` または `mode:event_relative` と `{startOffsetFrames,endOffsetFrames,triggerEventId}` | イベントID。原ステージ不変。ピボット/接触イベント欠損404、時刻形式混在/範囲外/競合422 |
| `combat.startPhysicsBake` | `modelInstanceId`, `{affectedBoneIds,startFrame,endFrame,preRollFrames,seed,tickRate}` | 202+`jobId`。事前能力/容量/入力hash検査。未対応モデルは422 |
| `combat.cancelPhysicsBake` | `jobId`, `{}` | `canceled`。旧適用版を保持。ready後の取消は409 |
| `combat.adoptPhysicsBake` | `jobId`, `{enabled}` | 検証済み成果物を新 `PhysicsBakeRef` として追加。現入力hash差/環境差/未検証は409で拒否し旧版を保持 |
| `combat.setPhysicsBakeEnabled` | `bakeId`, `{enabled}` | プレビュー/出力の採用状態と警告。stale/unverified版は有効化拒否 |
| `combat.detectIntersections` | `pairId`, `{startFrame,endFrame,stepFrames}`、常にdryRun | フレーム付き候補、計算対象/未評価理由。精密衝突結果と呼ばない |

`dryRun=false` で **productionを書き換える**コマンドは単一トランザクションで一式revisionを進める。削除は別コマンド `combat.removeRecord` `{kind,id}` とし、参照がある場合は409で参照一覧を返す。強制連鎖削除は作らない。`combat.startPhysicsBake` は独立jobストアでスナップショット/入力hash/冪等キーを確定し、制作状態revisionは進めない。Worker結果は対象jobの同じ `inputHash` にだけ公開する。編集中にrevisionが変われば旧条件の成果物として保存し、現プロジェクトへ自動適用しない。`combat.adoptPhysicsBake` が現入力hash・環境・代表再計算を再検証してから初めてproduction参照とrevisionを進める。production変更コマンドはUndo記録（前後のproduction/combat差分、commandId）を付ける。取消やWorker失敗はUndo履歴へ成功記録を追加しない。

## 6. 画面と三経路の作業手順

- `SCR-13` は左で二体/クリップを選び、中央で同フレームの両姿勢と接点オーバーレイ、下で攻撃・反応・接触・拘束・連続技の行を区別、右で距離/方向/時刻差、補正案、dry-run→確定→再評価、Undoを置く。接点未評価と警告なしを区別する。`SCR-06` は登録ピボット/可動範囲とイベント参照を表示し、該当イベントへ移動できる。`SCR-12` は物理対象骨、条件、ジョブ/旧版、比較を表示する。狭幅は右欄を開閉し、再生・保存を固定する。
- 利用者は (1) B1の二体・B3のステージを確定、(2) pairとイベントを作る、(3) 同フレームで比較、(4) 補正/拘束/コンボ/ギミックをdry-run、(5) 明示確定、(6) 物理ベイクを別ジョブで開始、(7) 出力前に未評価/未対応/旧版警告を確認する。AI・MCPなしで同じ作業を完了できる。
- WebMCP/標準MCPは共通の `production_command` と読取 `production_get` で上表の許可されたtypeを列挙し、`projectRevision/commandId/dryRun` を必須にする。UI固有のクリックを模倣しない。MCPの対象IDは画面選択から暗黙取得しない。外部プログラムパス、シェル、未登録素材パスはpayloadで受け付けない。

## 7. 必須テストと完了判定

| ID / 単位 | 自動試験 | 実データ/失敗系のゲート |
|---|---|---|
| H-01 `DANCE-008` | 同一Fのworld変換と距離/方向/時刻差の既知行列、異FPS変換、dry-run不変、補正Undo、映像失敗時 `not_evaluated` | 実PMX/VRM×2、VMD攻撃/反応、異なる縮尺・骨欠損、接点を3カメラ角で目視。数値閾値を合否としない |
| H-02 `DANCE-009/010/011` | 拘束循環/重複拒否、区間終了の解除、分岐選択、反応欠落警告、床なし未評価、元クリップhash不変 | 掴み/解除、ノックダウン→Kip Up、3〜4技+回避/カウンターを実モデルでフレーム比較 |
| H-03 `LYRIC-010` | ピボット/接触イベント欠損、階層循環、相対区間の範囲外、実効Fの競合を拒否。接触Fの変更に追従し、保存復元で元変換不変 | 実ステージの扉/可動物2件、イベント変更追従、動画再読込、見た目の遮蔽 |
| H-04 `MOTION-021` | 同入力同環境で代表再計算一致、hash差/環境差で失効、途中取消、容量不足、部分再計算と全再計算の比較、非対象骨不変。job進捗でrevision不変、検証済み採用でだけ進み、編集後の旧jobを自動採用しない | PMX剛体/ジョイント有無、髪/衣装/アクセサリ、Windows/Linux別に結果と差、VMD/動画往復。GPU/OSを跨ぐ一致は自動主張しない |
| 共通 | schema=1→2、電源断注入、2タブ/MCP競合、Undo/Redo、欠損素材、UI/WebMCP/標準MCP同一結果、狭幅/キーボード、ログに素材本文なし | サーバー再起動後のID/レイヤー/警告一致。未実施の経路は台帳に未検証として残す |

`MOTION-021` の既存台帳状態は「要検証」、現UI表示は `◇ 未実装` のまま。H-01〜04それぞれのゲートが揃った範囲だけ証拠付きで状態を変える。実装とテストが一つも無い現在は、本書を読んで実装着手はできるが完成とは報告しない。
