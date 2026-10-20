# A1〜B4 実装共通契約 v1

状態: **実装設計**（コード実装・実機検証ではない）。適用範囲は承認済み `AUDIO-001`、`LIP-*`、`RENDER-001`〜`015`、`DANCE-*`、`LYRIC-*`、`MOTION-021` のうち各領域仕様が列挙した ID に限る。判断の正本は機能台帳と各 `*_DECISIONS_JA.md`。本書のデータ/API基盤は `DATA-008`〜`010`、`CORE-004` の既存要件を満たすための依存作業であり、新たな製品機能ではない。P2 → E → A1 → F → A3 → B1 → B2 → B3 → B4 の実装順を変えない。

## 0. 実装前に照合する現状と適用順

2026-10-21 の `recovery/phase-e-20261019` に基づく。`project_state_bundle.py` は schema=1 の `combination/camera/workspace` 以外を拒否し、`workspace` も `frame/asset/clip` の3キーだけを許す。`save_bundle` は複数ファイル間の電源断耐性を保証しない。`studio/js/store.js` はブラウザーの一時状態で永続化先ではない。`/api/motion-layers` と `/api/timeline-editor` は独立 JSON に直接保存し、B1/B4 の複数体・接触・物理の正本ではない。現時点に A1〜B4 の共通サービス、FX/格闘/歌詞 API は存在しない。P2・Phase E の実装が先に変わった場合は、その実装が持つ契約を確認し、以下の **不変条件**を満たす最小差分に読み替える。既存フィールドを無言で書き換えない。

| 着手順 | 作業 | 必須ゲート |
|---|---|---|
| P2/E の完了時 | 統合保存の電源断復旧、旧データ移行、素材参照を確認 | `DATA-008`〜`010` の試験・進捗台帳を参照。未達なら後段の保存を完成扱いしない |
| 各領域の初回実装 | 下記 production ドメインを1つ追加 | 旧 schema=1 読込、欠損参照、競合、再起動往復、他ドメイン不変を自動試験 |
| 各画面の実接続 | `studio/js/api.js` 経由で共通サービスを呼ぶ | `◇ 未実装` を実証済みの操作単位だけ外し、モックの成功表示を流用しない |
| WebMCP/標準MCP | 同じサービスの検証済みコマンドを公開 | 引数、権限、エラー、revision、ログをUIと同値にする |

## 1. 時刻・座標・参照の正本

- 時刻はプロジェクトの `fps={num:int,den:int}`（正の既約分数）、整数フレーム `0..1_000_000`、半開区間 `[startFrame,endFrame)`。旧 `camera.fps` の整数値は `{num:fps,den:1}` に移行する。異なる素材の時刻は秒を小数で積算せず、音声サンプル・VMD原フレーム・SRTミリ秒の元整数と変換後フレーム、丸め規則 `nearest, ties-to-even` を併記する。`end > start`。FPS変更時は素材元時刻を正本として再計算し、フレーム固定を選んだ手動キーはその区別を保存する。
- 位置の正本は **P2 が表示する scene world のメートル、右手系、Y上**。接点とギミックは、素材ローカル→モデル正規化→インスタンス→ステージ/シーンの変換行列をフレーム評価時に適用してから比較する。PMX等の原単位変換を別箇所で二重適用しない。行列は4×4、回転は内部 quaternion、UIの度は入出力だけ。`NaN/Infinity`、反転・ゼロスケール、骨欠損は拒否・未評価にする。P2 の PMX 0.08m/単位は実データ未検証なので原単位と変換行列を保存し、実寸検証なしに距離の正確性を主張しない。
- 編集対象は安定 UUID、参照は `{id,assetId,sha256}`。表示名や配列添字を参照キーにしない。素材原本は `data/` の管理領域またはユーザーが許可した参照先に置き、制作状態には相対参照・hashを記録する。再開時に ID/hash が違う素材へ自動で差し替えない。欠損参照のレイヤーは無効化表示し、編集・再リンク・元へ戻す選択を示す。
- `source`（取込原本）・`proposal`（計算候補）・`committed`（利用者確定）を混同しない。提案の生成は既存手動キー/確定レイヤーを変更しない。適用と取り消しは対象レイヤー単位。再計算やレンダーは確定済み `projectRevision` と全入力hashのスナップショットを使う。

## 2. 統合永続化と後方互換

`GET /api/project/bundle` を単一の読込入口とし、Phase E の統合保存が完成した後に **schema=2** と `production` を追加する。`production` の形は下記に固定し、各ドメインの `schema=1` は領域の詳細設計で定義する。未導入ドメインは空の既定値を返す。外部素材バイナリ、レンダーフレーム、物理ベイク本体は JSON に埋め込まず ID/hash/マニフェスト参照にする。

```json
{"schema":2,"combination":{},"camera":{},"workspace":{},"production":{"schema":1,"audio":{},"lip":{},"render":{},"effects":{},"dancers":{},"music":{},"lyrics":{},"combat":{}},"revision":"<opaque>"}
```

- `production` は `data/production_state.v1.json` に保存する。既存3系統と新ファイルを含む **1つのトランザクションジャーナル**、一時ファイルへの fsync、同一ボリュームでの置換、起動時の回復を `DATA-008` の統合保存に追加する。更新前の revision と各ファイルhash、更新後の期待hash、処理段階を記録し、回復後に旧版か新版のどちらか**一式**を返す。単なる各ファイルの `os.replace` はこの条件を満たさない。OS/電源断試験を通るまで production の保存は未完成と表示する。
- schema=1 は読み取り時に production 空としてメモリへ移行し、最初の schema=2 保存で移行履歴を記録。未知のトップレベル・ドメインフィールドは破棄せず 422。旧 schema=1 クライアントが production 有りのプロジェクトへ POST したら `409 upgrade_required` とし、production を消さない。初期移行は旧ファイルのコピーを残す。読み取り不能ファイルは退避し 422、既定値で上書きしない。
- `revision` は一式の正規化JSONと外部参照マニフェストhashから計算する不透明値。書込みは `If-Match` 必須（無ければ428、不一致409）。領域コマンドも同じ revision を検査し、原子的に一式を更新して新 revision を返す。複数タブ・旧画面・MCP からの同時編集は上書きせず再読込/差分表示を促す。Undo/Redo は確定コマンド単位で、素材取込や外部書出しの副作用は Undo 対象外と明示する。
- `studio/js/store.js` の `project.bundle/base/revision/dirty` を拡張して production を保持し、保存確認後だけ dirty を解消する。未保存の編集がある間は外部同期でローカル状態を上書きしない。P2カメラの既存の workspace 所有ルールを守る。`/api/motion-layers` 等の旧独立保存を production へ黙って吸収しない。移行が必要な領域のみ明示インポートし、旧ファイルとhashを残す。

## 3. 共通コマンド/API形式

外部入口は `POST /api/production/command`、読取は `GET /api/production?domain=<name>` とする。保存実体へのアクセスは `ProductionService`（Python。`server.py` はルーティングのみ）が担当し、UI、WebMCP、標準MCPはいずれも同じ `execute(command)` を呼ぶ。フォーム固有の検証をサービスの代わりにしない。

```json
{"schema":1,"commandId":"uuid","type":"combat.setContactEvent","projectRevision":"<opaque>","targetId":"uuid","dryRun":false,"payload":{}}
```

返答 `200/201`: `{"ok":true,"commandId":"...","revision":"...","result":{},"warnings":[{"code":"...","targetId":"...","frame":12,"message":"..."}],"applied":true}`。`dryRun=true` は検証と提案を返し `applied:false`、revision は変えない。`202` の長時間ジョブは `jobId` と状態URLを返す。`commandId` は冪等キーで、同じID+同じbodyの再送は同じ結果、同じID+異なるbodyは409。リクエスト本文は最大16MiB、文字列は原則4096 Unicodeコードポイント以下、配列とキーの上限は領域ごとに定義し、巨大バイナリは認可済みアップロード経路に分ける。

| HTTP | 安定 `error_code` | 処理 |
|---|---|---|
| 400 | `invalid_value` | 型・範囲・区間・非有限値が不正。保存しない |
| 403 | `not_allowed` | 許可外素材/出力先/カメラ権限。保存しない |
| 404 | `missing_reference` | 対象ID・素材・骨・ピボット欠損。自動代替しない |
| 409 | `revision_conflict` / `upgrade_required` / `idempotency_conflict` | 再読込・更新UIを提示。部分適用しない |
| 413 | `too_large` | 本文・配列上限超過。保存しない |
| 422 | `unsupported_input` / `invalid_project` / `capability_unavailable` | 形式・整合性・実行環境が不適合。元状態を保持 |
| 428 | `revision_required` | If-Match欠損。保存しない |
| 500 | `internal_error` | ロールバック、correlationIdだけ返し診断ログへ。完成扱いしない |

エラー本文は既存 `server.py.bad()` の `error` と `error_code` を保ち、追加で `details`（フィールドパス、期待範囲、対象ID、フレーム）、`correlationId` を返す。歌詞全文、顔映像、原音声、個人の絶対パス、認証情報をログ/APIエラーへ入れない。`server.py` の既存ルートに共通のJSON/例外処理とローテーション済み診断ログを追加し、MCP が任意パス・シェル・未許可の外部コマンドを指定できないようにする。

## 4. UI、MCP、テストの共通完了ゲート

- 対象の `SCR-*` は既存の上部ナビ、固定再生/保存領域、内部スクロール、選択ID・単位・現在フレーム、ホバー/フォーカス説明、キーボード操作を守る。1280px と狭幅で操作が隠れない。提案と確定、プレビューと最終出力、未検証と成功を別表示する。AIなし・外部サービスなしでも承認済み手動経路は使える。
- WebMCP/標準MCPのツールは `{type,targetId,payload,dryRun,projectRevision,commandId}` を同じサービスへ写し、結果・警告・エラーコードをそのまま返す。MCP固有の別保存や別計算を作らない。許可が必要なローカル素材/顔/出力は UI の明示選択が生成したハンドルだけを受け付ける。
- 必須テストは (1) 各ドメイン検証の境界/異常値、(2) schema=1移行・欠損/壊れたファイル・電源断注入・revision競合・2タブ、(3) 実素材の保存→プロセス再起動→復元と原hash不変、(4) UI/API/WebMCP/標準MCP同一コマンドの同値、(5) Windows/Linux、(6) 実ブラウザー/GPU/外部ツールで必要な領域の出力再読込。合格した範囲だけ台帳状態を更新し、未検証項目を残す。
- **各コードコミット**で該当 ID、変更ファイル、テスト結果、未検証、Gitコミットをロードマップ/進捗台帳へ結ぶ。設計文書があるだけでは `planned`/`要検証` の状態を変えない。ユーザーの動作確認は Phase E 全機能実装前に求めない。

## 設計上の固定値と変更手順

上記 schema、時刻換算、原本保護、競合処理、失敗時不変は実装判断として固定する。実素材で単位や依存エンジンが違うと判明した場合は入力アダプターと検証条件を記録して修正し、既存保存データの移行テストを先に追加する。外部ソースの版/ライセンス確認は実装前の必須技術作業であり、所有者へ新機能の選択を求める理由にはしない。
