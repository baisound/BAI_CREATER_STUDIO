# v0.5 複数3Dモデル対応 — 設計のみ（枝番23）

## 方針
- 本コミットは設計とロードマップだけ。複数モデル同時描画は本段階で実装しない。
- 全モデル・カメラ・ライト・3Dエフェクトは共通XYZ TransformとScene Outlinerを使う。
- `modelId` はプロジェクト内で一意とし、素材ID（assetId）とは分離。シーンへの複数インスタンスを許す。
- モーションには必ず `target_model_id` を指定。曖昧な対象への適用を禁止。
- ビューポートはシーン単位に1 renderer / scene / camera / clock。モデルごとに別のWebGLホストを作らない。
- 各モデルに1つのルートTransform、スケルトン、モーションレイヤーとLifecycleを持たせる。
- 単一モデルのPMX/VMD・GLB/FBX再生処理は薄い再利用層でラップし、共有シーンへモデルを追加する。
- シーク時は同一globalSecondsから各クリップのlocalSecondsを計算し、モデルごとに評価後一度だけ描画。
- 同モデルの全身と表情・口は競合優先度を定義。モデル間は状態を共有しない。
- ロード中の作品切替、非同期処理中断、読み込み失敗、GPU資源破棄を明示的に管理。
- MCP/WebMCP：モデル追加、削除、Transform変更、ターゲット割当、再生状態取得を既存APIと共通実装にする。

## データ契約（案・移行未確定）
`SceneInstance {id,asset_id,transform,parent_id,visible,locked}`
`MotionClip {id,asset_id,target_model_id,start,duration,speed,layer}`
シーンのobject IDと素材ライブラリのasset IDを混同しない。既存のtarget_model_idが素材IDとして使われる部分は移行マッピングが必要。

## 受け入れ条件
1. 2モデルに異なるモーションを割り当て同じ時刻で独立評価。
2. 同素材から2インスタンス生成してもモデルの姿勢とTransformが独立。
3. 間違ったモデルIDと未読込モデルは適用拒否。
4. モデル削除時に対応する再生オブジェクトを解除。
5. 長時間再生、シーク、作品切替後のGPUリソースリークなし。
6. UI/API/MCP/WebMCPからの操作で共通状態が一致。

## 非目標
この枝番でのマルチキャラクター再生とGPU性能最適化の実装。
