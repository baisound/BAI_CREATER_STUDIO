# MOTION-010 複数補正レイヤーの作品別保存と部分VMD往復

2026-10-24、Issue #106。1クリップに1つだけだったFK補正を、同じ作品・PMXインスタンス・VMDクリップへ複数保存できるようにした。既存の単一レイヤーデータはそのまま読み、従来のレイヤーIDなしのキー保存は対象が1つのときだけ続ける。2つ以上ある場合はレイヤーIDを必須にし、誤ったレイヤーへの書き込みを拒否する。

3D編集画面にレイヤー選択、追加、名前・重み・区間・なじませ・ミュートの保存、削除を付けた。追加・変更・削除は作品revisionとUndo/Redoに載る。タイムラインの同じ骨でもレイヤーごとに行を分け、キーを押すとそのレイヤーを選んで編集画面へ移る。保存API、WebMCP、標準MCPは同じ作成・変更・削除アクションとレイヤーIDを使う。レイヤー数と履歴で保存ファイルが読込上限8 MiBを超える書き込みも、原本保持で拒否する。

## 検証

- `python -m pytest -q tests/test_studio_v05_motion_edits.py tests/test_studio_v05_vmd_partial.py tests/test_studio_v05_vmd_adoption.py`：24件成功。複数レイヤーへのキーの識別、ID省略時の拒否、別IDの拒否、個別区間の変更、削除とUndo、部分VMDの複数区間計算を確認。
- `npm run typecheck`、`git diff --check`：成功。
- `node tests/run-guarded.cjs tests/studio-v05-vmd-partial-real.test.cjs`：隔離Chrome/SwiftShader、24fps作品、246骨の実PMXと実VMD形式の静止頭骨入力を使用。補正レイヤー2つの区間はVMD F90〜149とF180〜239で、中間の元キーと非骨区画をbyte保持。作品240F＋VMD301Fを全246骨で比較し、位置最大0.0006557343 MMD単位（作品F192・頭）、角度最大0°で合格。候補の採用・同じクリップ配置・復元を確認。タイムラインのキーからレイヤー選択、画面の数値キー保存が選択した2番目だけを変え1番目を保つこと、3つ目のレイヤー追加、名前・区間の保存、削除も確認。実PMXと実VMDの原本ハッシュは前後一致し、guardもdata 7ファイル・exports 0ファイルの一致を報告。
- `node tests/run-guarded.cjs tests/studio-v05-pmx-fk-edit-real.test.cjs tests/studio-v05-pmx-fk-gizmo-real.test.cjs`：既存の単一レイヤーFK数値編集と3D回転・位置ハンドルの2件が成功。隔離Chrome/SwiftShaderで再読込・Undo/Redoを含む回帰を確認。guardのdata 7ファイル・exports 0ファイルは前後一致。
- 入力PMX `avatar-front-garment-v04.pmx` のSHA-256は `d784722b85991df3a89931ef1066786205f1a9845a7995d611206ecca0bdd841`。形式と非骨区画を借りた元の実VMD `狐面物理確認用_頭振り_F000-0300.vmd` は `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234`。合格した補正元は隔離領域で作った静止入力であり、元VMDの動く曲線そのものの合格を示さない。

## 残る条件

複数レイヤーを重ねた状態の3D骨ハンドルと腕IKの再編集は、下層姿勢との差分を正しく逆算する経路が未実装のため操作を拒否する。画面の数値キー編集と部分VMD候補は使用できる。レイヤーのソロ・並べ替え、実GPU、物理ON、Linux、標準MCPの実通信、Owner採用、MOTION-010全ACは未確認。画像・動画の納品成果物はなくEagle登録対象なし。モデル区分: 実装・試験・文書化に標準モデル区分を使用。
