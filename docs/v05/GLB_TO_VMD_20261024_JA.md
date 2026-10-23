# GLB動作からPMX用VMDへの限定接続（Issue #102）

2026-10-24。対象要件は `MOTION-003/004/006/007`。v0.5の同一作品に登録済みのGLB動作と配置済みPMXがある場合、素材欄の「GLBダンス → PMX用VMD」からBlender変換を実行し、新しいVMDを同じ作品のモーション行へ置いてPMXインスタンスに結ぶ。原GLB・PMX・既存VMDは変更しない。`MOTION-005/010`のプロファイル編集・3Dポーズ補正は今回の実装範囲外。

## 経路と失敗条件

- 候補APIは登録済みの integrated GLB動作と、その作品の3Dシーンに配置済みのMMD PMXだけを返す。POSTでは作品・GLB・PMXインスタンスを再確認する。未登録IDやパス外参照は拒否する。
- `MIXAMO_BLENDER`でBlender実行ファイルを指定する。未設定時はPATH上の `blender` を探す。候補スクリプトは単一アニメーションのMixamo系ボーンを30fpsで標本化し、PMXの59骨（実見本の場合）とセンター移動へ変換する。複数アクション、ボーン不足、異常な身長・尺は拒否する。
- 一時VMDのヘッダー、サイズ、フレーム数、入力ハッシュを確認し、`mmd/vmd/glb_v05_<UUID>.vmd` として別名登録する。台帳に原素材ID・SHA-256、出力SHA-256と `needs_visual_validation` を記録する。登録後に作品のmotionクリップを作り、選んだPMXインスタンスへ割り当てる。配置失敗時は別名VMDのIDを画面へ出し、元素材と変換結果を保持する。
- 既存のFBXチェーン変換APIは別経路のまま。元データの再スキニング・ウェイト変更は行わない。

## 実素材の検証

隔離サーバー・一時data・Chrome・Blender 5.2.2で実行。入力は元データから読み取って一時領域へ複製し、稼働中の8765番サーバーと利用者dataへ試験書き込みをしない。

| 項目 | 観測 |
|---|---|
| GLB入力 | `cef762b38713abf09354.glb`、SHA-256 `cef762b38713abf09354663fafa38c7ec196854166f1e353830da63ee8a01751` |
| PMX対象 | `Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx`、SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488` |
| Blender出力 | 1802フレーム、60.0333秒、59対応骨、108120骨キー、12,001,394バイト。VMD SHA-256 `5aed2487c61fbb327622350c438dc374d28db30006998ad9c2b2ae4c5ec2bea7` |
| UIと保存 | 候補表示→変換→同一作品のmotionクリップへ配置→対象PMXへ結合。画面再読込後、クリップ・結合先と0/1秒の腕・脚姿勢変化を確認。未登録GLB POSTはHTTP 400で出力なし。原GLB/PMXのハッシュは前後一致。 |
| 実描画 | Chrome WebGLのSwiftShaderで0/30/59秒を単独プレビュー。各時刻で全身を描画でき、センター位置と手足姿勢が変化。30秒と59秒はルート移動で初期カメラ中心から離れる。接地とPMXのIK・grant/物理・手指の破綻がないことは未認定。診断用の一時画像は成果物として残さない。 |

実行結果：`npm run typecheck` 成功、`BAI_REAL_MMD_DATA`を指定した `python -m pytest -q tests/test_pmx_bones.py` 4/4成功、`BAI_REAL_MMD_DATA`・`MIXAMO_BLENDER`・`CHROMIUM_PATH`を指定した `node --test tests/studio-v05-glb-vmd-real.test.cjs` 1/1成功。Python試験の初回はsandboxの一時フォルダー作成制限で起動せず、通常の一時領域で再実行した。実ブラウザ試験の初回はHOME画面上で編集画面要素のクリックを試み、次は候補読み込み前にボタンが有効、次は再読込後のHOMEから編集画面に移らず失敗した。試験の画面遷移とボタン初期状態を修正して再実行した。

## 残る条件

この結果は一組の実GLB/PMXに限る。現在の変換はMixamo命名と単一アクションを前提とし、足IK・接地補正、物理、他PMX、Linux、WebMCP/標準MCP、任意フレームのボーン編集とVMDへの焼き込みは未確認または未実装。ソースに移動がある場合、初期自動カメラから被写体が離れる。映像の合格やOwner採用へ昇格しない。

## 骨対応プロファイルの追補

同日、`MOTION-005`の一部として既定の対応先59骨を画面に表示し、各PMX骨へ割り当てるGLB骨を手動修正・保存できるようにした。プロファイルはPMX原本のSHA-256とGLBの骨名・親階層・rest変換の署名で識別し、同じPMXと骨構造の別GLB動作で再利用する。`data/studio_v05_glb_vmd_profiles.json`へ改訂番号付きで保存し、破損ファイルは黙って初期化しない。変換時は指定した改訂と保存済み改訂を照合し、VMD台帳に使用したプロファイルキー・改訂番号を残す。原GLB・PMXは読み取りだけである。

実素材で左人指の一つの対応を `LeftHandIndex1`→`LeftHandIndex2` に変更し、画面保存・再読込後の選択値、同じ骨構造で動作サンプルの一値だけが異なるGLBへの再利用を確認した。古いプロファイル改訂での保存・変換はHTTP 409、存在しない骨名はHTTP 400。アニメーションなしGLB・10骨だけのGLBはHTTP 400でVMDを作らない。保存した対応で60.0333秒のVMDを作り、同じ作品の対象PMXへ配置して再読込後の姿勢変化を確認した。変更後VMD SHA-256は `b7628cf3ce0ea54f304cfcf6c1923a847226f3a9474c020c5fafdced1a69361a`。`node --test tests/studio-v05-glb-vmd-real.test.cjs` 1/1、`python -m pytest -q tests/test_studio_v05_glb_vmd_map.py` 3/3、`npm run typecheck` 成功。Blender 5.2.2の実アーマチュア51骨とGLBから画面へ出す51骨の名前は一致した。

この確認は骨**対応の保存と適用**であり、選んだ対応の動作品質を採用した意味ではない。任意のPMX骨への追加マップ、プロファイルの共有ファイル入出力・Undo/Redo、IK・接地の修正、別モデルの品質比較、Linux/MCPは残る。
