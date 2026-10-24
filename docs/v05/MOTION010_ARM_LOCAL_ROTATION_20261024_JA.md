# MOTION-010 実PMX腕の局所回転検証

2026-10-24、Issue #106。[3D二関節幾何](MOTION010_ARM_GEOMETRY_20261024_JA.md)から得た肘・手首の世界位置を、実PMXの腕・ひじ骨の局所四元数へ変換した。`arm-ik-rotation-v135.mjs`は親子経路を確認し、腕回転でひじを、ひじ回転で手首を合わせる。計算中に変更した骨は`finally`で元に戻す。画面側の`armIkProbe`は一意な標準骨名、実PMX、同一作品FのVMD、未ロック・未補正の腕に限る読み取り用診断入口で、元VMDの局所回転との差分2キーを返す。手動ハンドルやユーザー向け腕IKの有効化はまだ行わない。

## 実測

- `node --test tests/studio-v05-arm-ik-rotation.test.mjs tests/studio-v05-arm-ik-geometry.test.mjs`: 5件成功。3D到達、親子経路拒否、計算後の骨姿勢復元と幾何境界を確認。
- `BAI_REAL_MMD_DATA`と`CHROMIUM_PATH`を設定し、`BAI_TEST_CONCURRENCY=1 node tests/run-guarded.cjs tests/studio-v05-arm-ik-geometry-real.test.cjs`: 1件成功。隔離Chrome/SwiftShaderで201骨PMX＋実VMDの作品F240を評価し、左右の手首を各0.04シーン単位内側へ指定した。局所回転の計算直後の手首残差は左右とも2.3e-16以下、`arm-set`で2キーずつ保存して画面再読込・PMXのIK/付与後に再評価した残差は左5.23e-10、右2.53e-10シーン単位。頭・上半身のワールド行列差は各要素1e-4未満。診断終了時の全骨姿勢復元差0。保存revision、左右キー、Undo/Redo、不正ペアの全体拒否も確認。元素材と利用者`data/`/`exports/`のハッシュは前後一致。
- 同試験の初回は`ERR_NO_BUFFER_SPACE`という一過性のブラウザー資源エラーで最後のコンソール検査に失敗した。再実行ではコンソール検査まで成功した。`npm run typecheck`も成功。

これは登録済み1 PMX、1 VMD、1時刻、物理OFFの限定結果。手先・肘の実ポインタハンドル、2キー同時仮表示とEsc、既存補正との合成、別名VMDの全骨往復、別PMX、物理ON、実GPU、Linux、標準MCP、Owner採用は未確認。AC-M-01/02とMOTION-010全体は「要検証」。画像・動画の成果物はなくEagle登録対象はない。モデル区分: 実骨回転の設計・実装・試験に標準モデル区分を使用。
