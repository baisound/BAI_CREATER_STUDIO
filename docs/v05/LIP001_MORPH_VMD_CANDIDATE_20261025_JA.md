# LIP-001 作品別モーフVMD候補API（Issue #187）

## 動作と境界

`POST /api/studio/v05/lip/vmd-candidate` は登録済みSRTの全発話を調べ、確定かなか明示無音、有効な手動口形下書き、原本SHA・読み版・作品FPS・各台帳revision、登録PMXの確定MorphMapとモデルhashを照合する。未確定発話、SRT時間重なり・口形計算警告、古い下書き、欠けた母音対応、ゼロ重み対応、30fps変換後に同F同モーフとなるキーは拒否する。明示無音はキーを作らない。`dry_run=true` は保存せず件数とバイナリreadback結果だけを返す。

条件を満たす場合だけモーフ専用VMDを `data/studio_v05_lip_vmd_candidates/<project_id>/<candidate_id>.vmd` に新規作成し、対応する検査記録を別JSONへ保存する。`GET /api/studio/v05/lip/vmd-candidate/file` はIDだけを受け、バイナリSHAと現在の元SRT/読み/下書き/MorphMapを再照合して返す。変更後の古い候補は残すが、ダウンロードを止める。元SRT、元PMX、元VMD、既存の作品配置は変えない。ファイル名は `LIP001-<id>.vmd` を提案し、状態は **候補・未採用・実PMX外観未確認** とする。

候補はVMDバイナリと実PMXモーフ名の一致まで。v0.5画面からの実行/ダウンロード、素材登録/配置、再生、見た目確認、Owner採用は後続工程。全発話の重なり警告は手動調整後もこの段階では出力を止める。警告解消の承認記録は未実装。

## 試験

- 隔離HTTP 1件: 24fps、確定「あ」+明示無音、強さ0.7×PMX対応0.8から VMD F30=0.56 / F60=0 を生成・ダウンロード再読込。dry-runは保存なし。古いrevision、同F衝突、読み未確定、原本改変を拒否し、候補状態が変わった後のダウンロードも拒否。人工PMX/SRT原本不変。
- 登録済み実PMX A 1件: 実モーフ「あ/い」等をMorphMapへ確定し、30fpsのF30/60/90、4モーフレコードを全件再読込。元PMX SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488` と元SRTバイト不変。
- 関連Python 13/13、Python構文・JSON・差分検査成功。実ブラウザー/PMXのVMD再生画素、実歌音声、Linux、WebMCP/標準MCPは未検証。

モデル区分: 設計・実装・試験とも標準モデル。
