# Git作業ツリー復旧・LF統一（2026-10-23）

基準: feature/v05-progress-checkpoint-46 / f824bb6
復旧ブランチ: feature/v05-git-tree-repair-lf-jp

- 変更扱い215件を全件検査。本文差分なし（改行コード差分のみ）を確認し、元コミットの内容で復旧。
- 削除扱い263件をGit HEADから復元。文書・データ・.gitignoreを含む。
- 日本語が #Uxxxx にエスケープされたファイル3件を元の日本語名と比較。
- .gitattributes にテキストのLF固定を設定、ローカルcore.autocrlf=false。
- 未追跡の __pycache__ はGit管理対象外として保持。
- 元の機能コードに意図した変更なし。

エスケープ名照合: [{"escaped": "PMX_VMD_#U5b9f#U88c5#U30ac#U30a4#U30c9.md", "decoded": "PMX_VMD_実装ガイド.md", "same_content": true, "exists": true}, {"escaped": "#U521d#U56de#U30a4#U30f3#U30b9#U30c8#U30fc#U30eb_#U30ea#U30a2#U30eb#U30bf#U30a4#U30e0#U540c#U671f_JA.md", "decoded": "初回インストール_リアルタイム同期_JA.md", "same_content": true, "exists": true}, {"escaped": "#U767b#U9332#U691c#U8a3c_20261017.json", "decoded": "登録検証_20261017.json", "same_content": false, "exists": false}, {"escaped": "#U8d77#U52d5.bat", "decoded": "起動.bat", "same_content": false, "exists": false}, {"escaped": "AI#U4e0d#U8981_#U901a#U5e38#U5229#U7528#U30ac#U30a4#U30c9.md", "decoded": "AI不要_通常利用ガイド.md", "same_content": true, "exists": true}]

検証: git diff、git status、LFバイト検査、Gitオブジェクト検査、ZIPのCRCと展開後Git検査。
