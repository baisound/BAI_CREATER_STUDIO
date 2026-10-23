# v0.5実動作プレビューと素材管理スクロール — 2026-10-24

関連: Issue #39/#63/#69、AUDIO-001、DATA-016。v0.5最短制作経路の順1・2の部分実装。機能台帳の完成状態は変更しない。

## 利用者に見える変更

- 実動作プレビューの位置を30fpsの整数フレームで表示する。前後1F、前後1秒、再生、一時停止、停止を、埋め込んだ既存の音楽・ダンス画面の実クロックへ送る。子画面の現在フレームと再生状態を親画面へ返し、音声・モーションが無ければ再生成功を表示しない。
- 素材管理のデスクトップ幅では、見出し・検索・お気に入り・並び順を固定し、その下の素材一覧だけをスクロールする。カテゴリと詳細は各欄内に収める。1000px以下は従来の縦レイアウトを維持し、モバイルの全面改修は別途扱う。

## 実装と境界

`studio/js/features/music-dance-view.js` の既存 `AudioContext` と `requestAnimationFrame` を再利用し、同一オリジンの `bai:v05:transport` / `bai:v05:transport-state` / `bai:v05:transport-ack` を追加した。入力フレームは0〜216000の整数、ステップは±1または±30F。既存の音楽・ダンス配置APIと原本素材は変更しない。子画面が実際に読み込んだ音声・モーションの有無を返す。

素材管理は `library-scroll-v64.css` を追加し、外側のスクロールを止め、中央の `#baiLibraryGrid` に縦スクロールを持たせた。カテゴリーと詳細は内容が長い場合に欄内でスクロールする。

## 確認結果

- Windows、Google Chrome、隔離サーバーと一時データ。`node tests/run-guarded.cjs tests/studio-v05-live-transport.test.cjs`: 1成功。WAVを登録し、未選択時の再生拒否、選択後の1F・30F移動、実再生中のフレーム進行、一時停止、停止0Fを確認。
- `node tests/run-guarded.cjs tests/studio-v05-smoke.test.cjs`: 4成功。1280×720で素材カードを増やし、外側のスクロールなし、フィルター位置固定、中央一覧のみスクロール、詳細の見切れなしを確認。既存登録・追加・配置・失敗表示も確認。
- `node tests/run-guarded.cjs tests/studio-music-dance.test.cjs`: 2成功、実素材指定が必要な2件はスキップ。既存の配置保存・再読込、VMD/FBX選択を確認。
- `npm run typecheck` と親JS構文検査は成功。上記のブラウザ試験は既存開発サーバー8765とは別の一時データを使用し、`run-guarded` で実データの前後ハッシュ一致を確認した。

## 残る確認・接続

v0.5作品タイムラインと音楽・ダンス画面の配置データはまだ独立している。画面の音声欄は試作表示のままで、音声とモデル・カメラ・ステージの共通時刻、実PMX/VMD/GLBのGPU品質、最終動画出力、WebMCP/標準MCP、Linuxは未検証または未接続。素材管理の1000px以下の固定スクロール配置も未対応。横断一覧は [Issue #69](https://github.com/baisound/BAI_CREATER_STUDIO/issues/69) で追跡する。
