# v0.16.21 親階層込み基準回転の比較（読取専用）

## 対象
登録済みのGLB/VRM同士について、Humanoidロールごとのローカル基準回転と、親ノードの変換を積算したワールド基準回転を読み取る。

## 操作
骨格解析・リターゲティング準備 → 元/転写先モデルを選択 → 「親階層込みの基準回転を比較（読取のみ）」。

## API/MCP
POST `/api/retarget/rest-hierarchy-inspection` に `{ "source": "登録済み素材名", "target": "登録済み素材名" }` を送信。標準MCP/WebMCP `bai_retarget_rest_hierarchy_inspection` と同等。

## 制約
* glTFノードの親子変換を積算する。回転+均一正スケールとして取り出せない行列（反転、せん断、非均一スケール）は手動校正扱い。
* glTFのワールド基準回転はそのまま転写先のローカルアニメーション回転として使えない。
* inverseBindMatrices、VRM humanoid normalized pose、PMXの骨軸、ツイスト、IK、GLB再生、VMD出力は対象外。
* モデルと元モーションは変更しない。Ollamaへの依存なし。

## 検証
追加4件と既存86件の計90件がPython unittestで成功。JavaScript構文検査成功。ブラウザ描画・実VRMを使うE2EとMCP実通信は未検証。
