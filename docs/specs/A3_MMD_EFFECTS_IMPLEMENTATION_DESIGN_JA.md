# A3 MMDエフェクト 実装設計 v1

状態: **実装設計、未実装・GPU未検証**。対象 `RENDER-011`〜`015`。所有者のA/A/A判断、優先効果、DOFのカメラ所有は [A3決定記録](A3_MMD_EFFECTS_DECISIONS_JA.md)、[優先効果](A3_VISUAL_EFFECT_PRIORITY_JA.md)、[親仕様](MMD_EFFECTS_SPEC_JA.md) に従う。保存/API/時刻は [共通契約](IMPLEMENTATION_COMMON_CONTRACT_JA.md)。Phase F の固定フレーム描画が完成した後、Phase Cの前。外部 `.fx` のWebGL実行、`NF-001` のノード編集、カメラDOFの二重設定は作らない。

## 1. 段階と入力アダプター

`SCR-26` が効果スタック、対象割当、パラメータ/キーを所有する。`SCR-06` は対象/結果の確認、`SCR-17` は動画差分、`SCR-02/03` はDOFの設定と実評価。`RENDER-012/014` が読むDOFはカメラsnapshotの読み取り専用参照。未接続の説明用ノブは実装済みへ格上げしない。

| WP | ID | 実装 |
|---|---|---|
| FX-01 | `RENDER-011` | 許可済みMME/Ray-MMD素材の原本・依存・出典/許諾を **不実行** で登録。互換ステータスと不足参照を表示 |
| FX-02 | `RENDER-012/013` | Three.js r160上の内蔵/近似効果を効果別に実描画。OFF/ONと代表フレームを保存。イベント効果を固定フレーム評価 |
| FX-03 | `RENDER-014` | scene/model/material/shot割当、順序、強度/固有値キー、テンプレートを非破壊で保存。循環/能力不足を拒否 |
| FX-04 | `RENDER-015` | MMD向け設定書と素材参照/欠損/未対応レポート。配布可否を素材単位で判定 |

ZIP引継ぎの10件は [調査記録](MMD_EFFECTS_HANDOFF_REVIEW_20261020_JA.md) では `proposal_not_implemented` で、参照URLは個別効果の動作・ライセンス証拠ではない。実装は名称から勝手に原MME互換とみなさず、以下の内蔵IDを独立に用いる。外部素材を同梱する前にファイル単位のhash/ライセンス/依存を確定する。Ray-MMDは初回 `export-only` とし、ブラウザー近似は効果単位の別ゲート後だけ追加する。

## 2. `production.effects.schema=1`

```json
{"schema":1,"assets":[],"instances":[],"templates":[],"compatibilityReports":[]}
```

| 型 | 必須キー・検証 |
|---|---|
| `EffectAsset` | `id,sha256,sourceUri,author,licenseId,permissionState,relativePath,dependencyIds,engineHint,format,registeredAt`。未知ライセンスは `local_reference_only`。ZIPは相対パス正規化、重複/絶対/`..`/symlink/zip bomb拒否。原 `.fx` はテキストでもコードとして評価しない |
| `EffectInstance` | `id,effectId,target:{kind,id|null},enabled,order,params,paramKeys,quality,compatibilityId,sourceAssetId|null`。target kind は `scene/model/material/shot`。参照対象が欠けたら無効警告、他対象へ自動付替えしない。キーは `{frame,value,interpolation:"linear"|"step"}`、各paramで同一F重複不可 |
| `EffectTemplate` | `id,name,instanceDefaults,sourceAssetIds,version`。テンプレート適用は新インスタンスを作り、現在の確定スタックを黙って置換しない |
| `CompatibilityReport` | `assetId|null,effectId,previewStatus,renderStatus,mmdExportStatus,environment,rendererVersion,sourceHash,representativeFrames,diffArtifactIds,limitations,testedAt`。状態は `unverified/native/approximated/export_only/unsupported`。登録だけで `native` を付けない |

順序は `stage → opaque → alpha → emission → postprocess → overlay` の有向グラフ。順序番号だけでなく「この効果はdepth/color/velocity/alphaを要する」依存も辺として持ち、トポロジカルソートできない設定は422。`scene`効果は全対象に、`shot`は選択ショット区間に、`model/material`はその描画対象にのみ適用。複数対象が同じ描画パスに来た場合は `order,id` 昇順で安定化。時刻は固定フレームから値を評価し、粒子状態を前回再生位置に依存させない。

## 3. 初期内蔵効果ID・パラメータ・実装手法

`three@0.160.1` を基準に実装し、使用版をレンダーsnapshotに記録する。以下の単位/範囲以外は400。数値は有限、色はsRGB文字列からlinearへ変換して内部保持。デフォルトはOFF、利用者が明示適用した時だけON。各効果はプレビューとA2固定フレームレンダーの**同じシェーダー/評価関数**を通す。

| `effectId` / ID | 初期パラメータ（既定;範囲） | 実装と状態判定 |
|---|---|---|
| `bai.bloom` / `RENDER-012` | `threshold=1.0;0..2` linear輝度、`strength=0.8;0..3`、`radius=0.35;0..1` | `UnrealBloomPass`相当の後段pass。透明PNGで背景を不透明にしないことを実測 |
| `bai.autoluminous` / `RENDER-012` | `emissiveGain=1;0..5`、`mask`は登録済み材質ID | 実材質のemissive/マスクを線形空間で上げ、Bloomの入力に渡す。原AutoLuminous `.fx` と同一とは表示しない |
| `bai.motionBlur` / `RENDER-012` | `shutterFrames=0.5;0..1`、`samples=4;2..8` | 同一snapshotの分数FでP2モーション/カメラを補間して複数サンプル描画・蓄積。分数F evaluatorが未完成なら選択不可。単なる画面ぼかしで代用しない |
| `bai.shadowEmphasis` / `RENDER-012` | `strength=1;0..2`、`bias=0;-0.005..0.005`、`softness=1;0..4` | 既存ライト/実モデル/床のshadow mapにだけ作用。画面全体を暗くする近似で成功扱いしない |
| `bai.fog` / `RENDER-013/014` | `density=0.02;0..0.2 m^-1`、`color=#8090a0` | scene depthを使う指数霧。局所体積霧とは表示しない |
| `bai.dust` / `RENDER-013` | `count=300;0..5000`、`size=0.01;0.001..0.1m`、`speed=0.2;0..3m/s`、`seed=0` | `Points`、seed+粒子index+絶対Fから位置算出。再生順に依存しない |
| `bai.petals` / `RENDER-013` | `count=120;0..2000`、`size=0.06;0.01..0.2m`、`wind=0;−5..5m/s`、`seed=0` | `InstancedMesh`の簡素な花びら形状。開始/終了Fと対象を固定、外部素材なしでも動作 |
| `bai.sparkles` / `RENDER-013` | `count=80;0..2000`、`size=0.01;0.001..0.1m`、`gain=1;0..5`、`seed=0` | 発光点群。イベントまたは持続区間で同一Fの位置/輝度が一致 |
| `bai.hitBurst` / `RENDER-013` | `kind=spark/fire/smoke/shockwave`、`durationFrames=12;1..120`、`radius=0.4;0.01..5m`、`seed=0` | B4などの**既存の確定イベントID**とworld位置を参照。火花は発光線、煙は半透明billboard、衝撃波は拡大ring。イベント欠損は描かず警告 |

上記は原MMEの名称を借りた「完全互換」ではなくBAI内蔵効果。AutoLuminous風、Bloom、MotionBlur、影、霧、塵、桜、きらめき、発光/火花/煙/衝撃波という承認済み範囲を実装する最初の具体解。`bai.hitBurst` のB4連携はB4が来る前でも手動時刻イベントで試験し、未実装の格闘判定へ依存させない。DOFの強度/焦点/区間はFXデータに保存しない。

## 4. 描画能力・互換レベル・測定

- 起動時にWebGLバージョン、float render target、depth texture、最大texture size、shader精度、GPU renderer、Three/ブラウザー版を取得する。必要能力がない効果は `capability_unavailable` として選択不可。OFFへ黙って変えない。動画側の別GPU/品質でも同じ検査を行い、`previewStatus` と `renderStatus` を別々に更新する。
- 比較基準は同一snapshot、同一カメラ、同一整数F、同一寸法・色空間のOFF画像とON画像、および権利確認済みの原MME参照画像（ある場合）。効果の可視範囲・輝度/深度/アルファ差、接地影の領域、パーティクルの再現性、GPU時間を計測し、画像hash・GPU/ブラウザー/レンダラー版と代表Fをレポートへ記録する。内蔵効果はOFF/ON差があるだけで合格とせず、各効果の意味（霧は奥行き、影は実物の陰影、花びらは対象区間）を人が確認した記録を要する。原参照がない場合は原MMEとの近似/同一性を未検証と表示する。
- `native` はBAI内蔵効果が対象環境のプレビュー/動画で描画・再読込を通った状態だけ。`approximated` は原MME参照との比較資料があり差/制限を表示できる状態。`export_only` はMMD設定書だけ。`unsupported` は対象能力がないことを検査済み、`unverified` はまだ試験していない状態。旧レポートを別GPU/版へ転用しない。
- イベント粒子は各粒子の疑似乱数を `hash(effectInstanceId,eventId,seed,particleIndex)` から求め、位置/寿命を `frame-startFrame` の閉じた式で計算する。スクラブ順/レンダー再試行/保存再読込で同一snapshotの同一Fは同じ画像hashを目標とする。GPU差のある数値結果は別測定。対象が消えたら別イベントへ推測して付け替えない。

## 5. MMD向け設定出力とコマンド

`RENDER-015` の成果物はUTF-8 `mmd-effects-manifest.json` と日本語手順書、許諾済みの同梱可能な依存素材のみ。各行に `sourceAssetId/hash/license/permissionState`、対象モデル・材質、適用順、原 `.fx` の確認済みキー値、BAI内蔵値、未対応値、必要ファイル、同梱/非同梱理由を分ける。MME上での自動適用や見た目の再現成功を主張しない。外部原素材が欠損/許諾不明なら参照と警告だけを出し、配布ZIPへ入れない。MMDでの代表シーン適用試験は別記録。

| `type` | target / payload | 結果 |
|---|---|---|
| `effects.registerAsset` | 許可済みuploadハンドル、`{sourceUri,author,licenseId,permissionState}` | assetId、依存/許諾/形式の検査。登録のみで適用済みとしない |
| `effects.listCompatibility` | assetId/effectId、dryRun | preview/render/MMDの独立状態と根拠 |
| `effects.attach` | effectId、`{target,order,params,sourceAssetId|null}` | instanceId、能力/依存/循環検証 |
| `effects.setParamKey` | instanceId、`{param,frame,value,interpolation}` | キーと実効値/単位。DOFキーは拒否 |
| `effects.reorder` | instanceId、`{order}` | 依存グラフを再検証、循環422 |
| `effects.applyTemplate` | templateId、`{targets}` | 新instanceの一覧。既存スタックを上書きしない |
| `effects.compareRender` | instanceId、`{frames,width,height}`、dryRun | OFF/ON・参照画像、測定値、環境・未検証項目 |
| `effects.exportMmdManifest` | scene/shot ID、`{outputHandle}` | 設定書/素材参照/許諾/未対応レポート |

全操作は共通コマンドAPI、If-Match/commandId/Undo/ログを用いる。MCPが外部`.fx`を任意実行したり許可外ファイルを同梱したりできない。`effects.compareRender` はA2の実描画ジョブを使い、GPUなしの計算だけで `native` を返さない。

## 6. 受け入れと試験

| ID | 合格ゲート |
|---|---|
| `RENDER-011` | 許諾既知/不明、依存欠損、危険ZIP/重複パスを登録し、原hash不変と非実行を確認。登録と適用/描画の状態を分離 |
| `RENDER-012` | AutoLuminous風/Bloom/MotionBlur/実影を実モデル/ステージでOFF/ON、同一Fの動画と比較。分数F不足ならMotionBlurは未実装。カメラDOFとの重ね合わせは参照だけ |
| `RENDER-013` | 霧/塵/桜/きらめき/火花/煙/衝撃波の開始/終了/対象と同一F再現、イベント欠損、透明境界、GPU負荷を検査 |
| `RENDER-014` | scene/model/material/shotの対象、順序・循環・キー/テンプレート、Undo/Redo、保存復元、欠損素材を検査。DOF値をFXへ二重保存しない |
| `RENDER-015` | 設定書に原/BAI値と未対応項目を分離し、許諾不明を同梱しない。実MMD適用は独立した検証まで未確認 |

UI/API/WebMCP/標準MCP、実Chrome/Firefox相当、Windows/Linux、実GPUとソフトウェアレンダラーを別々に記録。実機で通った効果/環境だけ互換レベルを更新する。
