# v0.16.18 VRM Humanoid対応候補のUI/MCP統合

- 元と対象のVRM Humanoid roleを照合し、名前対応候補を返します。
- UIでは候補を選択メニューに表示。保存はユーザーによる既存の対応表保存操作のみ。
- 標準MCP/WebMCPとも `bai_vrm_humanoid_mapping_suggest` で同じ読み取り専用APIを使用。
- 対応ボーンの方向、ひねり、基準回転、逆バインド行列、実モデル再生は未検証。
- Ollama不要。モデル・モーション・対応表を自動変更しない。
- API: POST `/api/retarget/vrm-humanoid-preview` with `{source,target}` (登録済み素材ID)。
