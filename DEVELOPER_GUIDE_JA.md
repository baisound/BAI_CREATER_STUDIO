# Codex開発者向け引継ぎガイド — Mixamo格闘ビューワー

## 目的と優先事項

このZIPは、Mixamoから取得した **FBXモデル／FBXモーション** を、ローカルのHTMLビューワーで再生・再利用するためのプロジェクトです。
Codexに期待する作業は、(1) 既存フォルダーを保持し、(2) ユーザーがダウンロードしたFBXを安全に取り込み、(3) `data/manifest.json` を適切に更新し、(4) ビューワーの読み込みを検証することです。

**MMD/VMDについて**：本ソフトはFBX再生用で、FBX→VMD変換器ではありません。既存のMMD/VMD制作パイプラインを変更したり、変換済みと報告したりしないでください。Mixamo FBXをMMDに適用するにはリターゲティング・ボーン名対応・座標軸・スケール・フレームレート等の別工程が必要です。

## 1. ディレクトリ構造

```text
Mixamo_Fighting_Viewer_Local/
  起動.bat                     Windows起動用
  server.py                    Python 3.9+ 標準HTTPサーバー/API
  index.html                   UI、50パターン配列、Three.js/FBXLoader
  MOTION_CATALOG_50.json       Codex向け50パターン参照一覧（今回追加）
  README.txt                   一般ユーザー向け説明
  DEVELOPER_GUIDE_JA.md        本書
  CODEX_TASK_PROMPT_JA.md      Codexへ渡す作業指示テンプレート
  data/
    README.txt
    manifest.json              初回起動時点ではなく、アップロード時等に生成
    files/
      <24文字のID>.fbx         FBXバイナリ（リネーム済み）
```

サーバー起動：`起動.bat` をダブルクリック、または `python server.py 8765`。
URL：`http://127.0.0.1:8765/`。他PCに公開しません。
モデルとモーションの読み込みにはThree.js/FBXLoaderが必要で、現状はCDN接続が必要です。

## 2. manifest.jsonの正確な仕様

`server.py` の `readmeta()` は以下のトップレベルのみ利用します。

```json
{
  "files": [
    {"id":"0123456789abcdef01234567","name":"Boxing Leading Hand Jab.fbx","kind":"motions","size":12345678},
    {"id":"fedcba9876543210fedcba98","name":"Character_A.fbx","kind":"modelA","size":12345678}
  ],
  "mapping": {
    "Boxing Leading Hand Jab": "boxingleadinghandjab"
  }
}
```

`files`：登録FBXの配列。各エントリ：
- `id`：保存ファイル名の拡張子なし24文字。`data/files/<id>.fbx` が実在すること。
- `name`：元のFBXファイル名。**表示名と自動照合の元情報**。
- `kind`：厳密に `modelA`（攻撃側モデル）、`modelB`（相手モデル）、`motions`（モーション）のいずれか。
- `size`：ファイルサイズ（バイト、整数）。`stat().st_size` で設定。
- `mapping`：**キーはパターン内に記載されたMixamoモーション名そのもの**、値はFBX名を正規化したキー（後述）。**ファイルのIDでもパスでもない**。

### 正規化（重要）

ブラウザでは以下の式を使用：
```js
const norm = x => x.toLowerCase().replace(/\.fbx$/, '').replace(/[^a-z0-9]/g,'');
```
例：
- `Boxing Leading Hand Jab.fbx` → `boxingleadinghandjab`
- `Kip Up.fbx` → `kipup`
- `Corkscrew_Kip Up.fbx` → `corkscrewkipup`

`mapping` の**キー**は正規化せず、正本の `mixamo_steps` と完全一致させます。
**値**は正規化キーにします。`name` が異なる場合は対応表で結びます。
アップロード済みのモーションが見つからなければUIはダミーアニメーションにフォールバックします。

## 3. CodexがFBXを直接配置する場合

最も安全なのはHTTPの `/api/upload` を利用する方法です。GUIのアップロードと同じ実装を通るため、ファイルID・置換・manifest更新をサーバー側が行います。

```
POST http://127.0.0.1:8765/api/upload?kind=motions&name=Kip%20Up.fbx
Content-Type: application/octet-stream
body: <FBXバイナリ>
```

他のkindは `modelA` / `modelB`。1件の上限は400 MiB。対応する `name` は `.fbx` 拡張子必須で250文字以内。
応答：`{"ok":true,"id":"..."}`。モデルA/Bは旧モデル登録を置き換えます。同じkind+nameは同一IDを上書きします。

GUIを使わず**オフラインで `manifest.json` を直接更新**するときは下記の手順を必ず守ること。

1. 必ずローカルサーバーを停止する（API同時更新による上書きを防ぐ）。
2. `data/` 以下をバックアップする。
3. 対象FBXは元データとして別途保持し、書き換えない。
4. `server.py` に実装されているID計算法を**そのまま**使う：
   ```python
   import hashlib
   fid = hashlib.sha256((kind + "\0" + original_filename).encode("utf8")).hexdigest()[:24]
   ```
   `kind` は `modelA` / `modelB` / `motions`。
5. `data/files/<fid>.fbx` へコピーする。全件でID衝突・重複を確認する。
6. `files` エントリを更新する（サイズは実ファイルのバイト数）。モデルA/Bは各kindにつき原則1件のみ。
7. `mapping` の値を正規化名へ更新する。**既存の有効な割当を消さない**。
8. UTF-8の正しいJSONとして一時ファイルに書き出し、検証後に `os.replace()` 等で原子的に反映する。
9. サーバーを再起動し、下記APIとブラウザで実際に自動復元されることを検証する。

注：サーバー側に「任意パスのFBXを自動検索する」仕組みはありません。**ただ `data/files` に置くだけでは登録されません**。manifestの登録が必要です。
`readmeta()` は不正JSONなどを空の内容として扱うため、JSON破損は既存データが消えたように見える原因になります。

## 4. API一覧

| Method | Path | 内容 |
|---|---|---|
| GET | `/` | ビューワー |
| GET | `/api/manifest` | 現在の `files`, `mapping` |
| GET | `/api/file/<id>` | manifest登録済みFBXバイナリ |
| POST | `/api/upload?kind=...&name=...` | FBXを保存・登録 |
| POST | `/api/mapping` | `mapping` 全体を置き換えるJSONオブジェクト |

**注意**：`POST /api/mapping` は既存マッピングへの追記ではなく**全置換**です。必ず GET `/api/manifest` で既存mappingを取得し、マージしてから送信してください。`POST /api/mapping` のサイズ上限は1 MiBです。

## 5. 50パターンと名称の参照

`MOTION_CATALOG_50.json` は `index.html` の `rows` 配列から抽出した一覧です。
- `id`：No.1〜50
- `title_ja`：日本語タイトル
- `category`：単発、3連続、4連続、攻防など
- `mixamo_steps`：**実行順**の英語モーション名
- `sequence`：現行2D/3D模式プレビューの簡易指定

これはユーザーが求めた組み合わせ情報の参照ファイルですが、**現行のHTMLはこのJSONを自動読込しません**。画面表示の正本は `index.html` 内の `const rows` です。カタログを更新しただけでUIが変わると想定しないでください。実際の50件リストを更新する場合、HTMLも同期するか、別途JSONロード機能を実装して動作確認すること。

`mixamo_steps` には **複数人用の並列関係**（例：攻撃側Aと防御側B）が含まれ得ます。単純にすべてを同一人物の連続動作として扱わないでください。`sequence` の `|` は攻防対人関係の表現ですが、完全な役割仕様・タイムラインではありません。

## 6. キップアップと優先対応

対象：No.46〜50。`Kip Up`, `Corkscrew Kip Up`, `Knocked Down` が登場。
モーション名は**検索・設計上の名称**です。個々の名称がMixamoの現行カタログから必ず入手可能とは限らないため、ダウンロードしたFBX実体に沿って対応付けること。

- `Kip Up`：脚と背中の反動で仰向けから跳ね起きる
- `Corkscrew Kip Up`：ひねりを含む起き上がり
- `Knocked Down`：ノックダウン

## 7. FBX→MMD/VMDへの接続（別システム）

MMD対象モデル（PMX/PMD）、使用リグ、Codex側の変換手段、FBXのスケルトンを先に確認し、変換経路を確定してください。必要な確認：
1. FBX内アニメーションの有無・フレームレート・開始終了フレーム・ルート移動
2. Mixamoボーン名とMMDボーン名の対応（センター・グルーブ・腕・足・IK・捩り等）
3. 座標系・スケール・初期ポーズ・回転（ローカル/グローバル）の整合
4. 接地、足IK、腰位置、スライド、モーション境界での補間
5. VMDとして書き出し後、MMD上で実機検証（特にKip Upの体幹・脚・床接触）
6. 元のVMDプロジェクトと設定を破壊せず、結果を別ファイルで保存

**動作の正確性はFBXを置いた事実だけでは保証されません**。モデルの適合やVMD書き出しは本パッケージの自動機能ではありません。

## 8. 最低限の受け入れテスト

- `python -m py_compile server.py` が成功
- `manifest.json` が有効なUTF-8 JSONで `files` と `mapping` を持つ
- 全件 `data/files/<id>.fbx` が存在し、sizeが一致
- `modelA`, `modelB` は各1件以下。`motions` に意図しない重複なし
- mapping値が実在のmotionsの正規化名に対応する
- `GET /api/manifest` の一覧が想定と一致
- `GET /api/file/<id>` が正常なFBXを返す
- ブラウザ再起動後も再インポートなしでモデルとモーションが復元
- No.46〜50の動作割当が意図に合致
- 既存50件パターンと `起動.bat` を破損させていない

## 9. 知っておくべき実装上の制限

- Three.js/FBXLoaderはCDNから取得。完全オフライン構成ではない
- ビューワーは「単一モーション再生＋簡易連結」の設計。正確なFBX→MMDリターゲティングは未実装
- FBXが読み込めても、スケルトン不一致の場合は人物上で正しく動かない可能性
- mapping APIは全置換、サーバーはファイル単位の原子的更新だが複数編集者の同時変更競合管理は未実装
- `files` は起動時のブラウザ側によって自動復元される。ファイル参照が壊れていると復元に失敗する

開発時は実データのバックアップを優先し、既存のMMD制作パイプラインに副作用を起こさないこと。


## 2026-10-17：取得済みFBXの登録・一覧拡張
- 既存No.1〜50を保持し、取得済みFBX32本の単体再生をNo.51〜82へ追加。
- `MOTION_CATALOG_50.json`は互換性のため名前を保持し、現在はHTMLと同じ82件。
- `source=registered_fbx`の行は`duration`（カタログでは`duration_seconds`）が元の尺。BはReady Idleで待機。
- FBXの自動照合は正規化名の完全一致のみ。Kip UpをInverted Double Kick To Kip Upへ曖昧一致させない。既存の明示mappingは保持。
- 本登録では32モーションと、空だったA/Bモデル枠へ同梱X Bot（Ready Idle）を登録。MMD/VMD変換は行わない。
- 登録・全体検索・検証の記録：`D:\BAI\BAI Davinci Resolve DRFX\editing_runs\mixamo_viewer_registration_20261017_v01`。

- 再生可否の表示：FBXLoaderの読込成功後、行の全stepsが完全一致または明示mappingで解決すると、左一覧と全件表を金色系にし、名前の末尾に👑を付ける。未取得・一部不足には付けない。mapping変更時にも再判定する。
