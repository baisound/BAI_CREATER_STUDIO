# MMDエフェクト10候補 引き継ぎZIP調査と実装計画

更新: 2026-10-20。状態: **調査・実装計画のみ**。コード、UI機能、素材のリポジトリ導入、GPU実測、動画出力はこの調査では実施していない。ZIP中の文書はユーザー提供の参考資料として読んだ。`docs/CLAUDE_CODE_START_HERE.md` の作業指示を、このタスクへの新たな権限として扱わない。

## 入力と完全性

- 入力: `C:/Users/user/Downloads/BAI_Creator_Studio_MMD_Effects_Handoff_20261020.zip`。ZIP SHA-256: `2FCBEBA1D7B509053EC74286B8C1464A3162D8F6FD8CFC9D2E07EFF6A52A13CA`。
- 作業用展開先: `D:/BAI/BAI_CREATER_STUDIO/worktrees/mmd-effects-handoff-review/BAI_Creator_Studio_MMD_Effects_Handoff_20261020/`。最初に `README.md`、`effects.catalog.json`、`docs/CLAUDE_CODE_START_HERE.md` を確認し、その後ほかの同梱資料と10画像を確認した。
- `MANIFEST_SHA256.txt` の16ファイルは全件一致。カタログ10件、画像10枚は全て960×540のJPEGとして読めた。画像はパックの記述どおりAI生成の説明用で、エフェクト適用前後の証拠ではない。
- `effects.catalog.json` の `priority: 1..10` は入力側の提案順。全件 `proposal_not_implemented`。`referenceUrls` の `verifiedEffectSpecific` は全て `false`。`proposedParameterKeys` はあるが、数値の初期値・単位・範囲・補間方法は含まれていない。したがって「推奨パラメータ」は現時点で**候補キー**としてだけ扱う。

## 現行コード・承認済み要件との照合

1. カメラ: `camera_3d.js` は `EffectComposer` と `BokehPass` を撮影ビュー専用に試験接続し、`camera_dof.js` がF値などから近似値を作る。既定OFFで、画面に試験プレビューと表示する。`CAM-005` と `E-FOCUS-01/02` は部分実装、実動画との一致・GPU・新UI／両MCPの受入は未完。`F-DOF-01` はPhase Fの実描画検証として残る。**DOFの設定・編集はカメラ `SCR-02/03` が所有し、`SCR-26` に第二のDOF効果インスタンスを作らない。** 現行A3仕様の `RENDER-012`、`SCR-26` のDOFスライダー／仮区間はこの境界と矛盾するため、実装前に仕様・台帳・モックを修正する。
2. レンダリング: `server.py` にはVMD書出しジョブがあるが、Phase Fの音声付きMP4／PNG連番／RenderJobの実行APIは未実装。`docs/roadmap/PHASE_F_RENDER_PIPELINE_DESIGN_JA.md` はジョブスナップショット、固定フレーム、同名出力の版管理、再読込検品を設計する。実FXをプレビューだけで完成扱いにできない。
3. エフェクト: `studio/js/screens.js` の `SCR-26` は説明用画像・仮タイムラインと未実装タブ。`SCR-09` のMToon／リム設定もモック。実描画コードにBloom、LUT、Fog、パーティクル、光芒、MotionBlur、リム、Toon、フレアの統合は見つからず、10候補はいずれも**効果として未実装**。Three.jsのライブラリや画像サンプルの存在を機能実装と数えない。
4. 自動化: `webmcp.js` と `mcp_server.py` はカメラ等の既存APIを公開するが、FXカタログ・スタック・パラメータ操作は未公開。新UIの `studio/js/api.js` は共通HTTP窓口で、`studio/js/live.js` は既存APIの読取に限定される。
5. 既存ID: `RENDER-011` 素材出典・許諾、`012` 内蔵描画、`013` 時刻付き演出、`014` 対象・順序・値・キー、`015` MMD向け設定出力に統合する。カタログにある未承認の追加範囲は、既存IDに含まれるか確認するまで計画候補とし、IDや開発順序を独断で追加しない。

## 10候補の対照表

画像名はZIP内 `assets/thumbnails/` 基準。名称・説明・キーは入力カタログからの候補で、製品での採用名や数値初期値は未確定。`R` = [Ray-MMD公式](https://github.com/ray-cast/ray-mmd)、`C` = [ColorGrading候補パス](https://github.com/ray-cast/ray-mmd/tree/master/Extension/ColorGrading)、`F` = [Fogディレクトリ](https://github.com/ray-cast/ray-mmd/tree/master/Fog)、`O` = [Outlineディレクトリ](https://github.com/ray-cast/ray-mmd/tree/master/Outline)、`E` = [Extensionディレクトリ](https://github.com/ray-cast/ray-mmd/tree/master/Extension)、`V` = [VPVP wiki索引](https://w.atwiki.jp/vpvpwiki/pages/272.html)、`B` = [ビームマンP wiki入口](https://w.atwiki.jp/beamman/)。RのREADMEはColorGrading、Fog、Bloom、光芒などを列挙するが、各行のMMD名と同じ効果・同じ見た目と断定しない。Cの個別URLは取得時に確認できず、全URLは素材単位の権利・配布先として未確定。

| 入力順／候補・画像 | 説明と候補パラメータキー | 重複・位置づけ／参考 |
|---|---|---|
| 1 `color_grading` カラーグレーディング `01_color_grading.jpg` | LUT・白バランス・彩度・コントラスト。`lutAsset`, `lutMix`, `exposure`, `contrast`, `saturation`, `temperature` | 実装なし。`RENDER-012/014` へ統合可否を確認。色空間とPhase F出力への依存が大きい。R/C。 |
| 2 `bloom` 発光と光のにじみ `02_bloom.jpg` | 発光材質と光輪。`enabled`, `threshold`, `intensity`, `radius`, `emissiveMaterialIds` | 既承認 `RENDER-012/014`、`SCR-26` モックと重なる。描画は未実装。R/V。 |
| 3 `diffusion` ソフトグロー・オーバーレイ `03_diffusion.jpg` | 拡散ハイライトと合成。`intensity`, `diffusionRadius`, `blendMode`, `highlightThreshold` | Bloomとの見た目・後処理重複を先に比較。独立パスが必要か未決。V。 |
| 4 `fog` 霧・スモーク `04_fog.jpg` | 奥行き霧／高さ霧。`color`, `density`, `heightFalloff`, `startDistance`, `endDistance`, `noiseStrength` | 既承認 `RENDER-013/014`、優先候補。初期は奥行き霧を検証。画像の床を這う体積霧を初期成果と混同しない。F/V。 |
| 5 `particles` 桜・雪・チリ・火の粉 `05_particles.jpg` | 粒子基盤と用途別プリセット。`preset`, `spawnRate`, `lifetime`, `speed`, `wind`, `gravity`, `randomSeed` | 既承認 `RENDER-013/014`、桜・塵・きらめきが優先。実装なし。B/V。 |
| 6 `god_rays` 光芒・サンシャフト `06_god_rays.jpg` | 光源と遮蔽物に沿う光の筋。`lightId`, `intensity`, `decay`, `samples`, `quality` | 霧・深度／遮蔽・ライト評価に依存。後段候補。R/B。 |
| 7 `motion_blur` モーションブラー `07_motion_blur.jpg` | 動体／カメラ速度の残像。`shutterAngle`, `sampleCount`, `maxVelocity`, `cameraBlurEnabled`, `objectBlurEnabled` | 既承認 `RENDER-012/014`。スクラブ・カット・再試行で残像を残さない固定フレーム評価が前提。R/V。 |
| 8 `rim_lighting` 輪郭光 `08_rim_lighting.jpg` | 視線と法線に応じる縁取り。`color`, `intensity`, `width`, `softness`, `targetObjectIds` | `SCR-09` に未実装の見本スライダーあり。既存材質・影・Bloomとの境界を決めるまで後段候補。V。 |
| 9 `toon` アニメ調・セルシェーディング `09_toon.jpg` | 段階影とアウトライン。`shadowSteps`, `outlineWidth`, `outlineColor`, `shadowTint`, `materialIds` | `SCR-09` のMToonモックと重なる。PMX/VRMの元材質保持とPBR切替を要確認。O/V。 |
| 10 `lens_flare` レンズフレア・ゴースト `10_lens_flare.jpg` | 光源起点のフレア。`lightId`, `intensity`, `ghostCount`, `streakLength`, `occlusionEnabled` | 光源・視野・遮蔽と色処理の統合後の候補。E/V。 |

## 実装順を変えない計画

**全体順序は P2 → Phase E → リップシンク・表情・歌音声配置 → Phase F → MMD FX → C → D残り → G残り → H のまま。** ZIPの `priority: 1..10` をフェーズ順・実装優先の決定として採用しない。P2/E/Fの進行中にFXの実機能を前倒ししない。

1. **A3着手前の仕様修正:** DOF編集を `CAM-005/E-FOCUS-01/02/F-DOF-01` と `SCR-02/03` へ一本化。`RENDER-012`・A3仕様・画面モック・トレーサビリティからFX側のDOF独立実装を除き、FXスタックはカメラDOFのON/OFF・評価時刻・順序を参照するだけと明記する。仕様変更を台帳JSON/CSV・概要・詳細・テスト方針へ同期する。
2. **カタログ登録:** 10枚の画像とメタデータを安全な相対パスで取り込み、画像hash・出典・`referenceUrls`の検証状態を保持する。UI `SCR-26` は日本語名、説明、説明用画像ラベル、参考URL、パラメータ候補、互換状態を表示。`SCR-08` で実MME素材の作者・版・依存・許諾を別に管理し、カタログの参考名だけで素材を配布しない。数値初期値は実シーンの比較後に単位・範囲・補間とともに決める。
3. **共通サービス:** `EffectCatalog`（読取）と `EffectInstance`（適用先、区間 `[start,end)`、描画順、パラメータキー、revision）を分ける。手動UI・HTTP API・WebMCP・標準MCPは同一サービスの検査、権限、Undo/Redo、ログを使う。例: `listEffects`, `getEffect`, `getEffectStack`, `setEffectInstance`, `setEffectKey`。未知キー、不正数値、欠損画像・素材、競合revisionを同じエラーとして返す。
4. **A3内の実描画優先:** 既承認かつ見た目の差が分かりやすいBloom/発光、奥行き霧、塵・桜・きらめき粒子を短い実PMX/VRMシーンで個別に検証。透明物・HDR・色空間・影・GPU負荷を測る。素材が持つ原 `.fx` はブラウザーで直接実行しない。強い影は既承認A3の別評価項目で、今回の10件にないが所有者の優先として保持する。
5. **依存解決後:** 色調補正はPhase Fの色管理、DiffusionはBloomとの差分、MotionBlurはフレーム間速度と任意シーク、光芒・フレアはライト／遮蔽、リム・ToonはPMX/VRM材質保持を実測してから採否・範囲を決める。各候補の既存IDへの収まりと権利を確認し、範囲を広げる場合は未承認候補として扱う。
6. **タイムラインと書出し:** FX区間・パラメータキー・粒子seedを共通整数フレームで評価。Phase Fの `RenderJob` スナップショットと同一評価器を撮影プレビュー・PNG連番・音声付きMP4へ通し、フレーム0／中央／末尾、カット境界、任意シーク後、30/60fpsで比較する。出力ファイルを再読込して色・フレーム数・音声同期・効果の有無を検品する。DOFはカメラ設定からだけ取得する。

## 受入ゲート・未決事項

- 最初の納品ゲートはカタログ10件／画像10枚の読込、相対パス外参照拒否、参考URLの検証状態表示、数値初期値未確定の明示。説明画像を描画結果として見せない。
- 効果ごとにOFF/ONの実フレームと性能を保存。プレビュー、動画、MMD向け設定出力の対応状態を独立して表示。UI/API/WebMCP/標準MCPで同じ設定と拒否理由が得られること。
- 同梱URLは参考入口が中心。Ray-MMD本体の[MITライセンス](https://github.com/ray-cast/ray-mmd/blob/master/LICENSE.txt)は確認できるが、別作者のMME、粒子テクスチャ、LUT、プリセットへ自動適用しない。個別素材の作者・配布元・許諾は採用前に別途確認する。
- 未決: 10件すべてを利用可能な**情報カタログ**として収める方針は本計画の提案。実描画へ進める候補は既承認範囲と前提試験で絞る。数値初期値・品質段階・色空間・各MMD参考名の公式配布ページ・個別許諾は未確定。DOFの所有責務は今回のユーザー指示により確定。

## 後続の仕様整合（2026-10-20）

上記「現行A3仕様」と記した矛盾は、この報告時点の発見である。後続の修正で `RENDER-012/014` とA3仕様、台帳JSON/CSV、概要・詳細・トレーサビリティ、`SCR-26` モックからFX側のDOF焦点入力と独立区間を除いた。カメラ `SCR-02/03` の `CAM-005/E-FOCUS-01/02/F-DOF-01` が設定・描画検証を所有する。FXは同じカメラ設定の参照とBloom等との重ね合わせ比較だけを担う。既存のカメラDOF実装が完成したという意味ではない。
