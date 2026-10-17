# v0.15.0 骨格解析とモデル別リターゲティング準備

## 対応
- GLB/VRM：glTF JSONよりskinのjoint名、アニメーションクリップ、VRM拡張の有無を抽出
- BVH：ROOT/JOINT名、フレーム数を抽出
- PMX：ヘッダー検査とメタデータのみ。ボーン抽出は未実装
- FBX：バイナリ/ASCIIとも本段階では骨格抽出未実装（Blender依存）
- 名前によるヒューマノイド役割の暫定対応付けと不足ロールの提示
- 2素材比較、モデル別対応表の非破壊保存
- 手動UI、WebMCP、標準MCPで解析/比較/対応表保存APIを共有

## HTTP API
- GET /api/retarget/analyze?id=<素材ID>
- GET /api/retarget/compare?source=<ID>&target=<ID>
- GET /api/retarget/profiles
- POST /api/retarget/profiles {schema:1,profiles:{名前:{mapping:{role:boneName}}}}

## 制約
この版は骨格解析・マッピングの基礎であり、基準姿勢/ボーン軸/スケール/IKの自動補正、アニメーション転写、VMD出力には未接続。未対応形式を対応済みと報告してはならない。オリジナル素材は無変更。
