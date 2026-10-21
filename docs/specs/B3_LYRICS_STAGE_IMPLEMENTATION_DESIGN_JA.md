# B3 歌詞・MV・ステージ 実装設計 v1

状態: **実装設計、未実装・未検証**。対象 `LYRIC-001`〜`005`、`LYRIC-007`〜`012`。`LYRIC-006` の拍正本はB2、`LYRIC-010` の格闘イベント実動作は [B4実装設計](B4_COMBAT_IMPLEMENTATION_DESIGN_JA.md)。所有者A/A/A決定は [B3記録](B3_LYRICS_STAGE_DECISIONS_JA.md)、要求は [親仕様](LYRICS_STAGE_SPEC_JA.md)、共通API/保存は [共通契約](IMPLEMENTATION_COMMON_CONTRACT_JA.md)。Phase G/Hの計画順を維持。`SCR-27` は歌詞、`SCR-16` はショット、`SCR-06` はステージ配置を所有する。

IDの作業位置: `LYRIC-001`上流ソース、`LYRIC-002`歌詞時刻、`LYRIC-003`演出パック、`LYRIC-004`2D/3D文字、`LYRIC-005`テンプレート/お気に入り、`LYRIC-007`MV絵コンテ、`LYRIC-008`PMX部分出力、`LYRIC-009`大型ステージ、`LYRIC-010`可動物の登録とB4イベント、`LYRIC-011`追加モーション、`LYRIC-012`振付検索。それぞれを個別ゲートで判定する。

## 1. JIZURAの固定参照と取り込む範囲（`LYRIC-001/003`）

2026-10-21に公式リポジトリ `852wa/JIZURA` の **`fc16bfe43ea4a6c25a21f1caf04d17326de14f00`、VERSION `0.10.1`** を読取確認した。上流本体は [MIT LICENSE](https://github.com/852wa/JIZURA/blob/fc16bfe43ea4a6c25a21f1caf04d17326de14f00/LICENSE)、[THIRD_PARTY_NOTICES](https://github.com/852wa/JIZURA/blob/fc16bfe43ea4a6c25a21f1caf04d17326de14f00/THIRD_PARTY_NOTICES.md) は同梱mp4-muxer MITと非同梱Google Fontsを記す。B3ではJIZURAの動画muxer/音声解析/完成UIをコピーせず、BAIのA1/A2と同じサービスを使う。歌詞と楽曲の権利は別に素材台帳で追う。上流更新は自動追従せず別の互換試験を通す。

| 固定した上流単位 | BAIへ移植する契約 | 初期範囲 |
|---|---|---|
| [`src/08_planner.js`](https://github.com/852wa/JIZURA/blob/fc16bfe43ea4a6c25a21f1caf04d17326de14f00/src/08_planner.js) | `J.parseLyrics` と `J.parseOrderV1` の1行1フレーズ、LRC、`/`カット、強調、注釈、間奏解析を純粋関数へ切出す。入力/出力のfixtureを上流版と比較 | 歌詞入力、LRC/行順、カットと装飾メタデータ。SRTはBAI側で別に変換 |
| `src/01_util.js`、`03_text.js`、`04_styles.js`、`05_anim.js`、`05b_registry.js`、`06_layouts.js`、`07_decor.js` | 相互依存を監査し、`noir`スタイル、`center`レイアウト、`cut`入退場、`still`保持、装飾なしの最小「JIZURA Core 0.10.1」パックを移植。上流の実関数/データをコピーした行と変更点を記録 | 2D文字・初期パック。全スタイル/全装飾の移植済み表示はしない |
| `src/08b_omakase.js` | seed付き乱数注入の `J.omakase` を、初期パックに存在する候補集合だけへ限定した adapter にする | 案の再抽選/前後/行固定。手動時刻・文字・固定行を変えない |
| `src/09_render.js` | 2D描画の必要部分だけをBAIの固定F描画へ接続。`Math.random()`を使う箇所はseed+frameの閉じた式へ置換して差分を記録 | 2D文字プレビュー/動画。3D文字はBAIのsceneオブジェクト |

取り込みは `third_party/jizura/README_BAI_JA.md` に上記commit、各ファイルSHA256、MIT著作権表示、改変一覧、除外した依存/素材を記録し、同梱LICENSEを保持する。ライセンス不明の追加パックやフォントは入れない。元ソースを取得してそのまま画面へ読み込むのではなく `studio/js/lyrics/jizura_adapter.js` の純粋関数/registryへ限定し、global `J`・DOM・localStorage・ネットワーク・動画exportとの結合を断つ。上流fixtureに対し行・cut・LRC・選択最小パックの計画結果を一致試験し、描画差分は改変理由を記録。**データ互換だけで `LYRIC-001` 完了にしない**（O-LYRIC-01）。

## 2. `production.lyrics.schema=1` と所有権

```json
{"schema":1,"sources":[],"cues":[],"textLayers":[],"proposals":[],"packs":[],"templates":[],"storyboardRefs":[],"stageAssets":[],"stageInstances":[],"stageChunks":[],"gimmickPivots":[],"motionRules":[],"choreographyIndex":[]}
```

| 型 | 必須キー・検証 |
|---|---|
| `LyricSource` | `id,sha256,relativePath,format,encoding,licenseState,attribution,rawTiming,srtSourceId|null`。format=`lines/lrc/srt`。SRTはA1と同じ管理素材ID/hash・純粋SRTパーサーを使い、既存 `SrtSource` があればそのIDを参照する。B3側に二つ目の原本バイナリを複製しない。原本文/原時刻は不変。原歌詞はログへ出さない |
| `LyricCue` | `id,sourceId,lineIndex,cutIndex,srtIndex|null,sourceStartMs|null,sourceEndMs|null,shiftFrames,trimStartFrames,trimEndFrames,startFrame,endFrame,text,language,locked,stylePackId`。半開区間。SRTブロック本体移動はshiftだけ、左右端はそれぞれtrimだけ、元/隣接キュー不変 |
| `TextLayer` | `id,cueId,mode,anchor,worldTransform|null,screenRect|null,fontAssetId,fontHash,stylePackId,motionKeys,visibilityRange`。mode=`screen2d/world3d`。motionKey=`{frame,position,size,opacity,interpolation}`。2Dはカメラviewport正規化座標、3Dはscene worldメートル。両方の見切れ/遮蔽を別表示 |
| `LyricProposal` | `id,seed,packId,packVersion,cueAssignments,lockedCueIds,parentProposalId|null`。再抽選は新案IDを作り、確定歌詞/時刻/locked行/手動motionKeyを変更しない。前/次は案履歴の移動で、元案を削除しない |
| `ExpressionPack` / `Template` | `id,sourceCommit,licenseId,dependencyIds,allowedUse,configHash,tagIds,favorite`。検索・プレビュー・適用は同じ素材ID。お気に入りで複製しない |
| `MvStoryboardRef` | `id,shotId,shotRevision,lyricCueIds,musicMarkerIds,motionEventIds,artworkAssetId|null`。ショット本体とカメラ/範囲/順序はSCR-16側だけが保存。無効参照/空白/重複は警告 |
| `StageAsset` / `StageInstance` | `assetId,sha256,format,unitScale,axisMatrix,hierarchy,materialRefs,textureRefs,floorMeshIds,movablePivotIds` と `instanceId,assetId,transform,visible`。P2の基本stage transformがあればそれを唯一の正本にし、B3が二重保存しない |
| `StageChunk` / `GimmickPivot` | chunkは `id,stageAssetId,bounds,lodLevels,textureIds,floorCollisionId`。pivotは `id,assetId,nodeId,localAxis,minValue,maxValue,unit,restTransform`。元nodeが存在することを登録時に検査。時刻付きイベントの連動はB4 |
| `MotionRule` / `ChoreographyIndex` | ruleは `id,instanceId,type,startFrame,endFrame,params,weight`（`walk/idle/breathe`）。indexは `assetId/hash,licenseState,tags,styleTags,poseVector,sourceVersion`。元モーション/素材に書かない |

初期上限: 歌詞行10,000、1行cut32、文字レイヤー20,000、パック256、ステージchunk4096、可動pivot512、ルール2048、検索素材10万。原本/フォント/ステージは参照+hashだけ。保存/UndoはproductionとP2/Eの統合revisionへ接続し、元SRT/LRC/JIZURA素材を上書きしない。

## 3. 歌詞時刻・SRT・提案・文字配置（`LYRIC-002/004/005/007`）

- `SCR-27` は左で1行1フレーズ、LRC/SRT互換取込、行/cut一覧、中央でプレビュー/下部時間軸、右で「かんたん/詳細」。同ページ切替で選択行/F/音声/時刻を保持。簡単は案の生成・前後・行固定、詳細は行時刻/文字配置/動き/パック/絵コンテ参照。音声はSCR-10の`AudioClip` ID、拍はB2の`BeatMap` marker IDを参照する。Spaceで行頭、Tabでcut頭を記録し、直接数値編集・F単位のキーボード補正も可能。自動案なしでも手で完成する。
- LRCは`[mm:ss.xx]`を整数ミリ秒で解析し、同時刻/逆転/曲外をプレビュー警告。行/cutの開始はタップまたはLRC時刻、終了は次cut/行の開始候補とし、未設定の最後の行は曲末を提案するが、利用者確定まで `unresolved`。SRTは番号・**明示開始と終了**を必須に解析し、`[sourceStartMs,sourceEndMs)`を元値に保持。編集後は共通FPS `num/den` で `startF=round_even(sourceStartMs*num/(1000*den))+shiftFrames+trimStartFrames`、`endF=round_even(sourceEndMs*num/(1000*den))+shiftFrames-trimEndFrames` と一度だけ整数化する。本文移動はshiftのみ、端トリムは対応端だけ。`startF<0`、`endF<=startF`、プロジェクト範囲外を拒否、重なり/空白は残して警告。原SRTの時刻/本文は絶対に書換えない。歌詞確定をA1口形へ共有するときも確定source ID/hashを明示し、既存口形を自動更新しない。
- 提案は `seed` と固定 `packVersion` から同じ候補を再生成できるようにし、行/cutごとにstyle/motion/配置を `cueAssignments` に保存。ロック行と手動キーは再提案の入力として保持し変更しない。案の履歴を押し戻しても歌詞・音声/時刻を変えない。パックは許諾と依存をチェックして適用。JIZURA全860部品が使えると表示せず、移植・実描画試験済みのパックだけを検索結果に出す。
- 2D文字はviewport正規化で配置しA2の動画解像度へ換算。3D文字は独立メッシュとしてscene worldへ置き、同一Fのカメラで遮蔽/見切れを検査。フォントID/hash欠損時は元を警告し、代替候補ごとに行幅/改行/見切れの差分画像を同ショットで表示、利用者が選んだ代替だけ新レイヤーに記録（O-LYRIC-02）。Google Fontsの実行時ネットワークを前提にせず、利用可能なローカル/許諾済みフォントだけ候補とする。
- `MvStoryboardRef` はSCR-16の `shotId+revision` を参照し、歌詞/拍/演技イベントとショットの交差・空白・重複を導出。ショットの本体編集はSCR-16に遷移。SCR-27が独自のショット順やカメラを複製保存しない。出力はA2に固定snapshotを渡し、文字見切れをF付きで検品する。

## 4. ステージ・PMX部分出力・検索（`LYRIC-008`〜`012`）

- `.glb/.fbx` はP2の実ローダーから階層/メッシュ/UV/材質/texture/単位/床候補をpreflightへ渡す。`.blend` は利用者が選んだローカルBlender実行ファイルと固定スクリプトを引数配列で動かし、管理下の中間GLBへ変換。Blenderが無い場合は `.blend` だけ `capability_unavailable`、GLB/FBX経路を塞がない。任意Pythonスクリプト/コマンドをMCPから受けない。元ファイルを変更せず、変換後も原hash/Blender版/変換ログを保持。
- PMX出力は初期対応を **静的メッシュ、三角面、頂点法線、UV0、基本材質/許諾済みPNG/JPEG texture、登録済み可動pivotのうち実骨へ変換できるもの** に限定する。Blender+mmd_toolsの固定版を外部処理として能力検出し、利用可能な場合のみ中間GLBを変換して別名PMX+texture ZIPへ書く。未対応modifier/geometry nodes/rigid body/complex shader/animationは欠落レポートに列挙し、`partial` を返す。事前解析結果をUIで確認してから開始（O-LYRIC-03）。GPLアドオンをBAIに無断同梱せず、利用環境のBlender/addon版とライセンスを記録。PMXを再読込して頂点/面/材質/texture/ピボット数を照合し、**実MMDでの代表ステージ確認まで互換成功にしない**。
- 大型ステージは元階層を保ったchunk境界（初期16m×16mのXZ grid）と距離LOD（初期0/25/60m）を作り、各chunkの床collision mesh/texture参照/原assetIdを保存。LOD切替で床を失わず、接地判定は常に元解像度のfloor meshを参照。欠損texture、隣接chunk境界の隙間、接地ずれ、描画時間/メモリを実モデルで測る。元モデルのメッシュは不変。B1の回避候補は同じ床collision参照を使う。
- `LYRIC-010` は登録済み可動pivot ID、原階層nodeと可動範囲、rest変換だけをB3で登録。SCR-06で手動プレビュー/保存復元。接触イベント連動の時刻キー/循環/再生はB4が所有する。新たなゲーム状態機械や破壊演出を追加しない。
- `LYRIC-011` のwalk/idle/breatheは対象人物と区間/重みの非破壊レイヤー。walkはB1のroot経路長から歩幅候補と左右脚周期を求め、足接地はP2/Bの既存接地評価を参照。idle/breatheは実在骨の小振幅周期キー候補で、実骨欠損なら未対応。OFF/Undoで元VMD姿勢へ戻し、既存手動キーを上書きしない。
- `LYRIC-012` は許諾済み振付/ポーズ素材だけを `assetId/hash` で検索索引へ入れる。タグ/作風は登録メタデータの完全一致または正規化部分一致、姿勢類似は実骨の正規化関節ベクトルのcos類似度を明示。別骨格では共通骨集合が不足なら姿勢検索不可と表示。検索結果は元素材/版/許諾へ到達でき、お気に入りは同一IDへの参照。AI推測の作風ラベルを事実として付けない。

## 5. コマンド

| `type` | target / payload | 結果・拒否 |
|---|---|---|
| `lyrics.registerSource` | 許可済みuploadハンドル、`{format,encoding,licenseState,attribution}` | sourceId/hash/解析プレビュー。権利不明は配布不可 |
| `lyrics.importCues` | sourceId、`{confirmedParseVersion}` | cueId一覧/原時刻/警告。不正SRTは422 |
| `lyrics.setTiming` | cueId、`{shiftFrames,trimStartFrames,trimEndFrames}` | 現区間/原との差。逆転拒否、隣接キュー不変 |
| `lyrics.tapLineCut` | cueId、`{kind:"line"|"cut",frame}` | 対象行/cutだけ候補時刻。確定は別操作 |
| `lyrics.generateProposal` | packId、`{seed,lockedCueIds,parentProposalId|null}` | 新案ID、固定行/手動キー不変 |
| `lyrics.setTextLayer` | cueId、`{mode,anchor,fontAssetId,motionKeys}` | 2D/3D配置と見切れ警告 |
| `lyrics.applyPack` | packId、`{cueIds}` | 新instance/依存と許諾。元キュー不変 |
| `lyrics.setStoryboardRef` | shotId、`{lyricCueIds,musicMarkerIds,motionEventIds,artworkAssetId|null}` | 参照/空白/重複、ショット本体不変 |
| `stage.preflight` | assetId、dryRun | 対応/欠落要素、単位、権利、PMX部分出力可否 |
| `stage.exportPmxPartial` | assetId、`{outputHandle,confirmedPreflightHash}` | 202、PMX/texture ZIP/欠落レポート/`partial`。確認なし拒否 |
| `stage.setChunkPivot` | stageAssetId、`{chunks,pivots}` | 床/LOD/実nodeの検証、元資産不変 |
| `lyrics.setMotionRule` | instanceId、`{type,startFrame,endFrame,params,weight}` | 別レイヤーと骨/床警告 |
| `lyrics.searchChoreography` | なし、`{text,tags,styleTags,poseVector|null}`、dryRun | 許諾済みassetId/版/根拠 |

すべて共通APIのrevision/commandId/Undo/エラー形式を使う。ファイル/Blender/mmd_tools実行は許可済みハンドルと固定コマンドだけ。MCPは任意パスや外部スクリプトを渡せない。JIZURAの内蔵動画exportを呼ばずA2のRenderServiceへ渡す。

## 6. 受け入れ試験

| ID | 必須試験 |
|---|---|
| `LYRIC-001/003` | 固定commit/LICENSE/依存/hash、上流fixtureと行/LRC/cut/選択packの比較、コピー範囲と改変記録、未許諾pack非配布。データ互換だけは未完 |
| `LYRIC-002` | LRC/行タップ/Space/Tab、SRT両端時刻の独立block移動/トリム/重なり/無音、Undo、再提案時の固定行/手動時刻不変、A1口形との差分 |
| `LYRIC-004/005/007` | 2D/3D遮蔽/見切れ/カメラ切替、欠損フォント代替候補の同ショット差分と明示選択、テンプレ/お気に入りID、shot revisionの変更検知 |
| `LYRIC-008/009` | `.blend/.fbx/.glb`、未対応modifier/材質/権利、preflight確認、別名PMX+ZIP、PMX再読込/実MMD代表試験、LOD/床/隙間/メモリ |
| `LYRIC-010/011/012` | 実node pivot/範囲/欠損、B4イベント連動、walk/idle/breathe OFFで元姿勢、許諾済みタグ/姿勢検索と骨不足 |

共通の保存→再起動→復元、UI/WebMCP/標準MCP、Windows/Linux、実音声/フォント/ステージ、動画再読込を分けて報告。JIZURAコピー、Blender/PMX、3D文字の実機試験まで未完成表示を維持する。
