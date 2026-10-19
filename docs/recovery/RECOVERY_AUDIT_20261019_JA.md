# BAI Creator Studio 復旧監査チェックポイント — 2026-10-19

## 判定
**完全復旧に至っていません。** 現ソースの開発機能を `ff5c555` と同等と認定していません。元開発SHAの再現も主張しません。

## 入力・完全性
- 緊急引継ぎの `START_HERE_JA.md` と `RECOVERY_SEQUENCE_JA.md` を確認。
- BASEは隔離領域に展開し、元データを変更せず取り扱った。
- MANIFEST記載47点のSHA-256を照合。47/47一致。
- ベースGit HEAD: `cc3ab90`（復旧途中）。ターゲットは過去報告の `ff5c555`。
- `git fsck --no-reflogs` の出力に dangling commit/blob があり、参照オブジェクトの欠損は検出されなかった。
- ZIP内の日本語ファイル名の文字化けにより作業ツリーに展開上の差異が生じたが、Gitの追跡ファイルを復元・不要ファイルを除去し、機能差分として扱わなかった。

## パッチ事前検査
- PATCH_ARCHIVEの46アーカイブ内のパッチ構成と先頭メタデータを調査。
- 初期HEAD `cc3ab90` への `git apply --check` は46件中1件成功、45件不一致（後続パッチの前提未充足や既適用分も含む）。これはすべてのパッチが永久に適用不能という判定ではない。
- 差分のbase/headとGit blob前提が一致しないパッチは強制適用せず、完全復旧未認定のままとした。
- `camera.html` の長大単一行の衝突と、既適用変更の重複を特に注意。
- 個々の調査一覧: `PATCH_PREFLIGHT.json`。原本パッチはユーザー提供の緊急ZIPに保存されている。

## 動作試験
- `python -m pytest -q --disable-warnings`: 219 passed, 1 failed, 5 subtests passed。
- 失敗: `test_camera_vmd_render_priority.py::TimelineRenderPriority::test_camera_frame_does_not_override_follow_pose`。
  アサーションが特定の文字列を要求。現コードの同条件ブロックは `untrackedPose=e.detail.pose;applyPose(e.detail.pose)` と記述されており、差異のため失敗。現時点では機能の正否を判定できない。
- `node --test test_camera_lens.cjs test_camera_framing.cjs`: 16 passed, 0 failed。
- 実ブラウザ・GPU・外部MMDでの統合試験は未実施。

## ロードマップ・機能台帳
- `docs/roadmap/PHASE_E_IMPLEMENTATION_STATUS.json` にCAM-001〜CAM-018の18項目を確認。
- 18項目すべて `release_complete=false`。これは現状の監査記録であって、最新版での完成度を示すものではない。
- `docs/roadmap/FEATURE_REGISTER.json` および `FEATURE_REGISTER.csv` が存在。
- **完全復旧以前につき**ロードマップや機能完了フラグを勝手に書き換えていない。

## 未完了・次に必要な作業
1. `RECOVERY_SEQUENCE_JA.md` の記録と、各パッチの変更前blob/重複済み機能を照合し、依存順に復元。特に `e751d4a` より後のDOF/CAM-005/CAM-015/プロジェクト保存API群。
2. 各まとまりで `git apply --check`、ソース・設計書差分照合、テスト実施、チェックポイントコミット。文字列置換によるHTML強制上書きは禁止。
3. 正しい実装を判定してからVMD追従テスト失敗を解決する。
4. `ff5c555` 相当の全機能照合とブラウザ/GPU/MCPの統合試験を実施するまで正式復旧扱いにしない。
5. 完全復旧後にPhase EのCAM-001〜018・台帳監査へ戻る。既存優先順位E→F→リップシンク等→C→D→G→Hを維持。MASTER複数カメラは後順位。
6. 納品は必ずGit履歴・ソース・設計書を含むプロジェクト全体ZIP。差分のみは禁止。

## このチェックポイントの意味
このアーカイブは**復旧作業用のベース全体＋監査記録**であり、「最新版完全復旧済み」納品ではありません。改変済み未検証コードを最新版として扱うことを避けるための保全物です。
