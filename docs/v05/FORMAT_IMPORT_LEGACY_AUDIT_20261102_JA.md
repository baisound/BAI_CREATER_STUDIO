# v0.5 素材登録と旧作品の対応調査（2026-11-02）

対象: `DATA-016/008`、Issue #37/#50/#63/#69。v0.5の素材管理から旧SCR-08登録画面を別タブで開き、登録成功後にv0.5一覧を更新する。この記録は形式全体の完成判定ではない。

## 登録経路と確認範囲

| 形式 | 登録経路 | 今回の隔離Chrome試験 | v0.5詳細の見本 |
|---|---|---|---|
| PMX＋テクスチャZIP | 旧SCR-08 → `mmd:A/B` | 最小ZIPをAへ登録し、PMXとテクスチャ、素材ID、一覧再読込を確認 | 保存済み見本がある場合のみ画像。実3D回転は未接続 |
| VRM | 旧SCR-08 → `integrated` | GLB構造の合成fixtureを`.vrm`名で登録しID・再読込を確認。実VRMの構造/描画は未検証 | 同上 |
| FBXモデル／動作 | 旧SCR-08 → `fbx` | 最小FBX 2種を登録し、保存ファイルhash、ID、再読込を確認 | 同上 |
| GLB動作 | 旧SCR-08 → `integrated` | 合成GLBを動作として登録し、kind、ID、再読込を確認。実人体動作は未検証 | 同上 |
| VMD | 旧SCR-08 → `mmd:vmd` | 最小VMDを登録し、保存ファイルhash、ID、再読込を確認。実ダンスは別の縦断試験のみ | 同上 |
| WAV／画像 | v0.5の追加画面 → `library` | 既存の実WAVと新規WebPを同一作品に置き、再読込・プレビュー・短MP4で確認済み（[縦断試験](../roadmap/V05_REBUILT_ROADMAP_20261102_JA.md)）。今回の旧画面試験の対象外 | 音声プレイヤー／実画像 |
| GLBステージ／動画 | v0.5の追加画面 → `library` | この試験では未実行。既存の個別試験と実素材の再確認が必要 | ステージは保存済み見本のみ／動画プレイヤー |

旧画面の連続登録は `tests/studio-v05-legacy-import-bridge.test.cjs` で確認した。登録前fixtureと隔離サーバー上の保存ファイルのhashを照合し、旧画面を閉じてもv0.5一覧へ6件が表示され、v0.5再読込後も同じIDが残る。旧画面の登録成功通知とタブ復帰時の再取得を併用し、連続更新中の最後の再取得を失わない。合成fixtureの拡張子登録を実VRM/人体モーションの再生合格と解釈しない。

実行環境はWindows、Chrome 156.0.8078.74。`npm run typecheck`、`node --check tests/studio-v05-legacy-import-bridge.test.cjs`、`BAI_TEST_CONCURRENCY=1` と `CHROMIUM_PATH` を設定した `node tests/run-guarded.cjs tests/studio-v05-legacy-import-bridge.test.cjs tests/studio-v05-smoke.test.cjs` は成功（ブラウザ5件）。制限付き環境で最初に実行した同じブラウザコマンドは、隔離サーバーのローカルソケット起動が12秒で失敗し0/5件。ローカルソケットを利用できる実行で再試験した。ガードは本データ7ファイル・exports 0ファイルの前後hash一致を確認した。VRM名のfixtureはGLBと同じバイト列でSHA-256 `a5b715879922f701efa5579eeb575ccd986a8d5540d4e06e8c6127063d130054`。PMX ZIPは `847b951a1445e85fa0e26829d16c4e91291495bfb76e664b8d77459d484e1a48`、VMDは `eff28b3716880753c4936bfa33b5ecf86fe83bffeaf8e1846056dcb305f60598`。VRM固有構造の検証には使えない。

## 旧作品がそのまま開けない理由

旧Studioの `data/project_state.json` と `data/camera_project.json` は全体で一組の制作状態で、`project_state_bundle.py` の `combination.timeline` は動作名などの手順を持つが、v0.5の作品UUID・登録素材ID・配置開始/長さ・対象シーンインスタンスを持たない。v0.5の `studio_v05_catalog.json` と `studio_v05_arrangements/<UUID>.json` は作品ごとに分離されている。現行の「現行編集を保存」は旧状態のスナップショットを選択したv0.5作品IDへ保存するが、v0.5タイムラインへの変換と復元は行わない。`studio_project_activation.py` の反映先も旧グローバルファイルであり、v0.5作品の配置データではない。

したがって、旧作品の素材ID・開始時刻・対象モデルを推測してv0.5配置へ書くことはしない。次の実装ゲートは、旧保存の各項目をv0.5のどのフィールドへ写せるか検証し、写せない項目を画面で明示して、原本hashと同一作品IDを保持した可逆な取込・再読込を隔離試験すること。現時点で旧作品の完全復元は未達。

モデル区分: 既存仕様の照合・画面/APIの小修正・試験は標準モデル。
