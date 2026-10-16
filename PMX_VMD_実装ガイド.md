# PMX / VMD 拡張版ガイド

## この版で実装した機能
- Windows用BATを維持し、Linux `./start.sh` を追加。
- PMXモデル2体（A/B）の保存と再起動時の自動復元。
- 同一フォルダー内のテクスチャ素材のアップロード（相対パスの制限あり）。
- VMDの保存、選択したPMXモデルへの再生。
- `/api/mmd-assets` 、`/api/mmd-upload?slot=A|B|vmd&name=...`、`/api/mmd-file/{slot}/{name}` を追加。
- FBXとお気に入りは既存どおり保持。

## 非対応・制約
- FBX→PMXへの自動リターゲティング、FBX→VMD自動変換、PMX物理・IKの完全再現は未実装。
- 複雑な階層テクスチャ参照は未対応。同名ファイルは上書きします。
- CDNからのThree.jsモジュール取得が必要です。
- 既存8機能の一部は構想段階であり、完成した高度なタイムライン/足IK/攻防同期/サムネイル/ゴースト表示を主張しません。
- ローカルHTTP APIには認証がありません。127.0.0.1にのみバインドされます。

## Codex向け
1. `server.py`、`index.html`、`data/manifest.json`、`data/mmd_assets.json`を読む。
2. PMXと同じディレクトリにある素材をA/Bそれぞれアップロードする。
3. 保存済み一覧が `/api/mmd-assets` に含まれるか確認する。
4. PMXプレビューとVMD再生を実際のブラウザ上で検証する。
5. FBX→MMD変換が必要なら既存Codex側ワークフローを使用する。VMD書き出しはこのHTMLでは行わない。
