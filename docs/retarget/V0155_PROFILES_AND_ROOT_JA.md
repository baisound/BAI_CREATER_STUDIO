# v0.15.5 補正プロファイルと移動座標の試算

## 目的
モデル組み合わせ単位で「設定名・移動倍率・向き（Yaw）補正」を保存し、後から呼び出せるようにする。元モデル・元FBX/VMDは変更しない。既存の `retarget_profiles.json` とマッピング設定を再利用する。

## UI
骨格解析パネルで元モーション・対象モデルを選択。設定名、移動倍率、向き補正を入力し「設定を保存」。再利用時は同じ組み合わせを選択して「設定を読み込む」。サンプルの移動座標を「移動補正を試算」で表示。

## API
GET `/api/retarget/profile-for-pair?source=...&target=...` は組み合わせに対応する保存済み設定を返す。既存POST `/api/retarget/profiles` はマッピングを含めて保存する（全置換）。POST `/api/retarget/root-preview` は `samples:[{frame,position:[x,y,z]}]`, `scale`, `yaw_offset_deg`, `origin`, `target_origin` から非破壊で試算。

## 未完成
本リリースでは**実アニメーションのルート移動への適用、骨回転補正の実装、PMX/VMD出力は行わない**。数値計算とプロファイル保存が対象。実モデルによるスケール、座標単位、ボーン軸の校正は必要。ブラウザ・MCPの実機操作試験は未実施。ログのON/OFFとローテートは既存仕様を維持。
