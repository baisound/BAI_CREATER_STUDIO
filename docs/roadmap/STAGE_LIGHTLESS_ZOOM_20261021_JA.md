# Issue #46・#47: 受領ステージの明るさとシーン視点（2026-10-21）

対象: `NF-014`（ステージ配置）、`LIGHT-001`（シーン照明）、`VIEW-001`（視点操作）。[Issue #46](https://github.com/baisound/BAI_CREATER_STUDIO/issues/46) は受領ステージの明るさ、[Issue #47](https://github.com/baisound/BAI_CREATER_STUDIO/issues/47) は LAST CHASE を含むシーン視点の接近限界。既存の実制作状態と原本GLBは保持する。

コード・検証・未検証点はGitコミット `5cce782` と [PR #48](https://github.com/baisound/BAI_CREATER_STUDIO/pull/48) に対応する。ローカル素材ファイルはGit管理外で、SHA256と素材IDを下記および `data/stage_lightless_20261021/検証記録.json` に記録する。

## 明るさの調査と対応

受領GLBのJSONチャンクを読み、内蔵ライトと発光材質を比較した。S01には内蔵ライトがなく、室内表示は既存の3灯で確認済み。S03は内蔵ライト46、S04は1、S06は9、S07は2で、S04の方向光強度は683だった。S05には内蔵ライトが0で、赤い発光材質の `emissiveStrength` が約3.1だった。したがってライトの除去だけでS05の明るさは変わらない。S06もライト除去後の窓が発光材質で明るい。

Owner指定に従い、アプリ側に素材名や `KHR_lights_punctual` に応じた特例は設けない。S03/S04/S06/S07 の**別名GLB**を `data/stage_lightless_20261021/` に作り、素材ライブラリへそれぞれ登録した。元の4件とS01/S05は残る。作成には `tools/make_lightless_glb.py` を使用し、GLBのJSONからトップレベルとノードの `KHR_lights_punctual`、`extensionsUsed` / `extensionsRequired` の該当参照のみ除去した。JSON以外のチャンクはバイト単位で一致する。出力が既にあれば上書きせず停止する。

| 元のステージ | ライト除去数 | 新しい素材ID |
|---|---:|---|
| S03 巨大門 | 46 | `library:9fd9404cf783a30b4cba7eb3` |
| S04 黒水空間 | 1 | `library:418b0c3398239004ef3bcc62` |
| S06 夜景屋上 | 9 | `library:5b73e3879e828072302daec3` |
| S07 夜明け高台 | 2 | `library:ec46a11ce9bd657ec9600115` |

個別の元SHA256・新SHA256・非JSONチャンクSHA256・バイト数はローカルの `data/stage_lightless_20261021/検証記録.json` に記録した。S04は隔離Chrome SwiftShaderで、方向光の白飛びが消え、内部の水面と足場が見えることを確認した。S03/S06/S07も別名GLBを隔離表示し、読込とライト0件を確認した。S06の窓とS05の赤い発光は残るため、明るさIssue #46は未完了とする。Owner外観採用、実GPU、Linuxは未検証。LAST CHASE全景の再読込は端末フリーズ歴のため行わない。

比較画像はOwner指定のローカル確認領域 `D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-10-21_stage_lightless_46/` に保存した。S03/S04/S06/S07はライトなし版、S05は原本を示す。画像はGitへ追加しない。

発光材質の別名候補も、元とライトなし版を保持したまま `data/stage_lightless_20261021/` に用意した。S05は赤い発光材質1件の表示上限を0.35相当に、S06は発光材質65件の最大値を0.8相当に、GLBの `emissiveFactor` のみ縮小した。非JSONチャンクは元とSHA256一致し、変更材質とハッシュは `検証記録_発光候補.json` にある。**素材ライブラリには未登録の比較候補**で、採用判断前に既存ステージと入れ替えない。隔離Chromeの同位置画像では、S05の強い赤（R>200, G/B<50）画素が7,099→96、S06の高輝度（RGBいずれか>240）画素が47,142→3,689になった。画像は同じ確認領域の `S05-emission-candidate.png`、`S06-lightless-emission-candidate.png`。これは候補の比較値であり、Owner外観採用ではない。

## 視点接近

既存OrbitControlsはカメラと注視点の距離を縮めるため、注視点へ近づくほど前進量が小さくなった。SCR-06のメイン透視ビューに限り、ホイールとCtrl＋中ドラッグでカメラと注視点を同じ方向・同じ距離だけ進める。距離・床・対象メッシュによる停止判定はしない。補助正投影ビューとSCR-12等の単体表示は既存の操作を維持する。`tests/studio-p2-viewport.test.cjs` の隔離した小型GLBで、ホイールとCtrl＋中ドラッグがともに床下へ進み、カメラと注視点の距離が変わらないことを確認した。実LAST CHASEでの操作、GPU負荷は未検証。

## 検証

- `python -m pytest -q tests/test_make_lightless_glb.py`: 2件成功。ライト以外のBIN保持、原本保持、既存出力の上書き拒否。
- `node --test --test-name-pattern='scene wheel can travel through' tests/studio-p2-viewport.test.cjs`: 1件成功（隔離Chrome SwiftShader、小型GLB）。
- `node --test --test-name-pattern='middle drag navigation rotates' tests/studio-p2-viewport.test.cjs`: 1件成功（SCR-12の従来操作）。
- `npm run typecheck`: 成功。
- 原本4件の登録済みSHA256と出力時のSHA256を照合。出力4件の非JSONチャンクSHA256は元と一致。

