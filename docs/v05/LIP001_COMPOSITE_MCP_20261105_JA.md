# LIP-001 合成候補の標準MCP・WebMCP接続（2026-11-05、Issue #187）

## 利用者の操作

採用済みの口形と元VMDを合成する候補を、v0.5の画面に加えて標準MCPとWebMCPから作れる。どの経路も同じ保存APIを使い、元VMD・PMX・SRT・作品の保存内容を変更しない。候補は別名のレビュー用VMDで、作品への配置と完成MP4への反映は行わない。

## 呼出し順

1. `bai_studio_scene_multi_motion_plan` で対象インスタンスの `ready` な `clip_id` と `arrangement_revision` を読む。
2. `bai_studio_scene_instances_get` で `scene_revision`、`bai_studio_lip_adoptions_get` で `adoption_revision` を読む。採用の有無と状態もここで確認する。
3. `bai_studio_lip_composite_candidate_create` へ `project_id`、`instance_id`、`clip_id`、3つのrevision、`dry_run` を渡す。まず `dry_run: true` で差分と拒否理由を確認し、作成する場合は `false` を渡す。
4. 成功結果の `downloadUrl` から取得する。ファイルAPIは取得時に元VMD・採用口形・手動キー・クリップ位置を再照合し、失効した候補を409で拒否する。

標準MCPの `MIXAMO_VIEWER_URL` はloopbackのサーバーのみ。WebMCPは `/studio/v05/` で `bai_studio_` ツールとして登録する。WebMCP非対応ブラウザでは手動UIを使える。

## 検証

- `tests/studio-v05-lip-composite-ui.test.cjs` の隔離Chrome 1件で、SRT取込から画面の合成候補作成までを通した後、標準MCPの `tools/list` とWebMCPの登録で両ツールが1件ずつあることを確認。
- 採用revisionの読取結果は両MCPで一致。`dry_run` の結果は両MCPと画面で同じSHA-256で、ファイルは作らない。WebMCPで作った別名VMDは取得して画面で作った候補とバイト一致。
- 元VMDとPMXはバイト一致。既存の不連続・失効拒否は画面/HTTP試験で確認済み。

## 残る範囲

実際のWebMCP対応ブラウザによるネイティブ呼出し、利用者の標準MCPクライアント設定、Linux、実PMXの合成後の見た目、採用口形を含む完成MP4、実歌声SRTは未検証。SRT取込・読み・下書き・採用など、合成候補以外のLIP操作のMCPは未接続。

モデル区分: 既存APIの照合・実装・隔離試験は標準モデル。

2026-11-05追補: SRT取込・読み・下書き・明示採用などの両MCP接続は[後続記録](LIP001_WORKFLOW_MCP_20261105_JA.md)で検証した。上の「残る範囲」は合成候補を接続した時点の履歴。

2026-11-06追補：合成候補と採用読取の2ツールを、公式SDK継続接続とChrome156ネイティブWebMCPで実測した。画面候補とのバイト一致、91モーフキー、不連続/古いrevision/失効の拒否を確認。[後続の結果と範囲](LIP001_NATIVE_COMPOSITE_20261106_JA.md)。実歌声・実モデル合成後の一般的な見た目・長尺MP4は未検証。
