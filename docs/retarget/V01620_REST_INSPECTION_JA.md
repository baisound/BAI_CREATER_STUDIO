# v0.16.20 GLB/VRM Humanoid ローカル基準回転の取得・比較

- 登録済みGLB/VRMのHumanoidロール、ノード番号、親ノード番号、ローカル四元数を読取専用で比較する。
- UIは「骨格解析・リターゲティング準備」→「VRM基準回転を取得・比較」。
- API: POST /api/retarget/rest-pose-inspection `{ "source": "登録素材ID", "target":"登録素材ID" }`。
- 標準MCP/WebMCP: `bai_retarget_rest_pose_inspection`。
- ローカル基準回転は共通座標系の回転ではない。親ノードの変換、IBMs、VRM正規化、骨軸ひねりが未解決なので、v0.16.19の明示的回転変換に自動転送しない。
- 非一様スケール・反転・シアーを含むmatrixノードの回転は自動採用せず要校正にする。
- 読取だけで元モデル、VMD、プロファイルは変更しない。Ollama非依存。
- 検証: Python 86件とPython/JS構文検査。実ブラウザ、実モデルのアニメーション転写、WebMCP/stdio MCPの実通信は未検証。
