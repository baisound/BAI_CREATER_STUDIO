# P2-WP-06b カメラ要素の配置表（2026-10-22）

## 現物と配置

`camera.html` の現行IDは **124個**。旧設計の122個という数字は現物と一致しない。`python tools/camera_id_map.py` が生成する [`legacy-ids.json`](../../studio/js/camera/legacy-ids.json) は、124個のIDそれぞれの配置先を記録する。`camera.js` は96 ID、`camera_3d.js` は25 IDを直接参照し、重複を除いた参照はすべてこの一覧にある。既存HTMLの要素をブラウザー内で読み取り、同じ要素を新UIの配置先へ移す。要素の複製はしない。

| 配置先 | ID数 | 内容 |
|---|---:|---|
| 上部操作 | 3 | カメラだけ保存、Undo、Redo |
| 左：ショット | 17 | カスタム構図、ショット区間の追加・選択・削除 |
| 中央：撮影ビュー | 8 | モデル・クリップ選択、自由視点 `#scene`、撮影構図 `#preview` |
| 右：カメラ | 32 | プリセット、カメラ移動、レンズ、XYZ、FOV、VMD、状態。`#camera-project-bundle` の旧統合ボタンはWP-06cまで無効表示 |
| 右：フォーカス | 27 | ボーン追従、構図診断、合焦・DOF診断 |
| 右：レール | 18 | 撮影リグと区間キー化 |
| 右：補間 | 1 | 現在キーから次キーへの補間方式 |
| 下部：タイムライン | 18 | 再生、コマ送り、範囲、`#track`、キー追加・削除 |

直接使うクラス・属性セレクターは `.preview-shell`、`.camera-frame`、`.dual-views`、`[data-camera-move]`。これらも移す要素の中に保持する。`camera.html` の静的ソースと生成一覧、SCR-02で実際に作られたDOMのID集合をテストで比較し、ページ全体の重複IDを拒否する。

## 読込と常駐

1. `project.cameraInvalid` がある間はホストを作らず、退避名と初期化の確認導線を表示する。保存ファイルへ書かない。
2. 有効なら既存HTMLの必要な要素だけをDOMParserで読み、新UIの左・中央・右・下部に**一度だけ**移す。右タブは要素の表示を切り替え、マウントし直さない。
3. `BAI_CAMERA_MANUAL_MOUNT` を立て、`camera.html` と同じ順序で共有スクリプトと `camera.js` を読み、`BAICameraPage.mount(root,{host:'studio'})`、`camera_3d.js` の `mount(root,{host:'studio'})` を呼ぶ。
4. SCR-02を離れるとホストを `#keepalive` へ移し、戻す際に `resize` を送る。カメラJSの状態とイベントハンドラーは保持する。エラーはホスト内に表示する。

## 設計照合

- `camera.html` の全IDを使うので、IDを手で再実装して属性・初期値を落とす危険を減らす。一方、旧HTMLにIDを追加したときは一覧の再生成と配置先の確認が必要。生成一覧とDOMの突き合わせで変更漏れを検出する。
- 旧画面と新UIは `camera.js` と `camera_3d.js` を共有し、HTML要素だけを新UIの枠へ移す。新UIは `camera.css` を読まず、`.camera-host` の中だけに効くCSSを使う。
- 統合保存の旧ボタンはスクリプトを読まないため、WP-06bでは操作できない旨を明示する。WP-06cで②の保存と統合する。
- この配置表は現物124 IDとソース参照に照合済み。独立した高性能モデルによるレビューは未実施で、WP-06bの実機テストとWP-06dの読み替え表を別に確認する。

## WP-06b の確認結果

`tests/studio-p2-camera-ids.test.mjs` と `tests/studio-p2-camera.test.cjs` を直列実行して4件成功。124個の静的IDと実行時に追加されるXYZ入力6個を確認し、ページ全体で重複IDは0件。SCR-02では自由視点と撮影構図の3Dキャンバスが2面とも実寸を持ち、右タブはクリック・キーボードで切り替えられる。キー追加→SCR-08へ離脱→復帰→Undo/Redo→カメラ単独保存→再読込を確認し、保存したキーを旧`camera.html`でも読めた。破損した`camera_project.json`ではマウントせず、原本バイト列は不変。`tests/studio-ui.test.cjs`の27画面回帰20件、型チェック、状態表示の整合性試験6件も成功。ブラウザーはChrome SwiftShader。設計と実装は標準モデル（GPT-6）で行い、サブエージェントは使用していない。
