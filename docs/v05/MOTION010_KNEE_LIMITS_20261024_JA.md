# MOTION-010 足IKの膝角度制限を表示

2026-10-24、Issue #106。実PMXのIK定義から、選択したターゲットのリンク骨と角度制限を読み、v0.5の同じ骨編集画面へ表示する。値はThree.jsの`MMDLoader`がPMX左手系から表示用に変換し、実際の`CCDIKSolver`へ渡す`rotationMin/Max`を使う。骨名から角度を推定しない。IKリンクに制限定義がなければその旨を表示する。既存の解法・キー・保存形式は変更しない。

## 実モデルで確認した境界

- 対象PMXの左右足IKは各2リンクで、追従骨は左右足首。各膝の元PMX定義はXが-180°〜-0.5°、Y/Zが0°で、表示・ソルバー側の変換後はXが0.5°〜180°、Y/Zが0°固定だった。足骨リンクには角度範囲の明示定義がない。
- Three.jsの`CCDIKSolver`はこのリンク制限を適用するが、独立したポール目標を受け取る入力はない。膝を指すだけのドラッグハンドルでは、CCD再評価と別名VMDで同じ膝方向を再現できない。次は現姿勢の膝方向を基準とするポール解法、PMX制限、作品補正キー、VMD往復を同じ検証で設計する。

## 確認

- `npm run typecheck`、変更JSの構文検査、`git diff --check`が成功。
- `BAI_TEST_CONCURRENCY=1 node tests/run-guarded.cjs tests/studio-v05-pmx-fk-gizmo-real.test.cjs`が隔離Chrome/SwiftShaderで1件成功。左右の膝を選び、各X 0.5°〜180°、Y/Z 0°固定を画面で確認した。従来の頭FK・足IKドラッグ・保存・Undo/Redo・再読込も同じ試験で成功。`run-guarded`の利用者`data/`と`exports/`の前後ハッシュ、および試験内の原PMX/VMDハッシュは一致した。

## 未確認

表示したのはPMXに定義された制限範囲であり、現在の膝が制限端に接しているかの判定ではない。膝ポール操作、他PMXやPMDの制限表現、腕IK、ドラッグ中の姿勢更新、実GPU・物理ON・Linux・標準MCP実呼出し、Owner採用は未確認。AC-M-02とMOTION-010全体は「要検証」。画像・動画の成果物はなくEagle登録対象はない。

モデル区分: PMX/Three.jsの解法調査、実装、実素材試験まで標準モデル区分を使用。
