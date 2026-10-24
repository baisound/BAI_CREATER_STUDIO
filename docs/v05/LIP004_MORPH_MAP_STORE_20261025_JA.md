# LIP-004 モデル別口形対応表の保存（Issue #175）

## 現段階の保存

現行リポジトリには設計書の統合 `production.lip` 保存基盤がまだない。v0.5の作品経路を進めるため、対応表だけを作品別の `data/studio_v05_morph_maps/<project_id>.json` に原子的に保存する。スキーマ1、revision、最大32表。既存の作品シーン・表情キー・原PMXには書かない。この保存先は将来の統合productionへの移行対象であり、統合保存の電源断・他ドメイン同時トランザクション完了を意味しない。

`GET/POST /api/studio/v05/pmx/morph-map` は登録PMX素材ID、原本hash、解析hashとA/I/U/E/O/Closed/Restの実在モーフID・名称・手動重み0〜1を扱う。未選択はnull。確定表には5母音を要求し、グループ型も利用者が重みを明示すれば保存可能。候補は自動適用しない。同一作品内の同一素材・同一原本hashは表IDを維持してrevision更新し、別hashの旧表は保持する。読込時は現在の管理下原本hashを照合し `valid/changed/missing` を返す。古いrevision・hash・解析値・存在しないモーフで保存しない。削除もrevision付き。

## 試験

`BAI_REAL_MMD_DATA` 指定の `python -m pytest -q tests/test_studio_v05_morph_maps.py tests/test_studio_v05_pmx_analysis.py` は3/3成功。既知変位PMXの隔離HTTPで下書き保存→ファイル再読込→5母音確定→削除、作品間分離、古いrevision/原本hash/解析hash409、未知モーフ422、破損ファイル保持422を確認。原本のバイトは試験で変更するまでは一致。素材を意図的に変更した隔離試験では旧表を消さず `changed` とし、旧hashの保存を409で拒否した。実PMX A（原本SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`）のグループ母音「あ/い/う/え/お」へ0.8/0.7/0.6/0.7/0.9を明示して確定保存し、原本hash不変を確認した。数値は保存契約の試験値で、自然な口形として採用した値ではない。

画面からの選択・保存、実プレビューによる重み調整、VRM、MCP、Linux、プロセス再起動・統合productionの耐障害性は未検証。LIP-004全体は未完了。
