# 複数動画行の保存・重なり・出力（2026-11-06）

承認済み順3、Issue #81/#63、DATA-002/008・RENDER-001/006。既存の画像行の契約を動画に限定して拡張する。原本、旧作品、既存クリップID/元位置/長さ、画像行/他行の設定を保持する。

## 実装範囲と互換性

- 動画行は初期1、最大16、安定した正整数IDを持つ。旧保存は読み取り時だけ動画1として解釈し、そのための書換えはしない。追加IDは増加のみ。空行削除でも他行とクリップを改番せず、消したIDは再利用しない。
- 動画の登録、任意行への配置・移動、トリム、分割は同じ元区間検査とrevision/ロックを使う。クリップあり/最後の行/存在しない行の削除は拒否する。削除済み行への配置/復元も拒否し、原保存を保持する。
- レイアウトへvideo_lanes/video_lane_ids/next_video_lane_idを追加。行名はvideo:<ID>。旧video名は動画1の表示へ互換適用する。既存muted/lockedのvideoは動画全体の音声/編集ロックとして保持する。個別ミキサーや個別行ミュートは新設しない。
- 手動UIは［動画の行］の折りたたみ内で追加/空行削除。素材の配置先とクリップ編集は画像と同じ行選択を動画にも使い、直接ドラッグも可能。画像の既存操作は保持する。
- 標準MCP/WebMCPは既存bai_studio_track_layout_setへadd_video_lane/remove_video_laneを追加。既存action/入力は後方互換。共通APIの/timeline/video-lanesと/video-lanes/removeを使う。
- 動画どうしは行IDの大きい方が手前。開始・終了の[開始,終了)と、既存プレビュー/MP4共通のlane→start→clip IDの合成順を維持する。音声は重なりでも混ぜ、全動画ミュートでは映像を保って音だけ消す。

## 受入れ条件

1. 旧レイアウト/旧動画クリップの読み直しで動画1と元ID/区間を保持し、画像行・名前・ロック/ミュートを変えない。空の動画2を削除して1/3を保持し、次は動画4、次ID5となる。
2. 同じ作品へ異なる映像/内包音声の動画を重ね、元位置つきの移動/トリム/分割、保存再読込を確認。消した行、占有/最後行、古いrevision、ロック、元尺超過と不正IDは保存せず拒否する。
3. 手動UI/公式MCP SDK/ChromeネイティブWebMCPが同じ保存APIを使い、タイムライン行/クリップが再読込後も一致する。
4. 実プレビューと完成MP4の代表フレームで、重なり前/重なり中/切替境界/終了の画素と元区間、内包音声のPCMを照合。全動画ミュートの映像保持も確認。入力hashと利用者dataを保持する。
5. Windows/Ubuntu、実動画の追加確認、長尺・全形式・全操作Undo等の未検証を分け、段階3全体を完成にはしない。

モデル区分：高性能（接続判断・実装・検証）。

## 結果と修正した不具合

Windowsは対象Python53成功、型検査成功。手動UI・公式MCP SDK 2.4の継続stdio・実Chrome156ネイティブWebMCPを通る動画行試験1成功、実AACを保持した長尺1成功、関連回帰25成功、最後のプレビュー回帰2成功。Ubuntu WSLは対象Python43成功、公式SDK/FFmpegの動画行1成功・同じ実動画長尺1成功。これらの最終試行はskipなし。Linuxブラウザー/ネイティブWebMCPは実行していない。

動画1/3/4と次番号5を保存し、削除した2を再利用しないこと、実マウスによる行3→4→3移動、行4の名前「前景動画」、再読込、占有/最後/削除済み/古いrevision/ロック/元尺超過の拒否と保存不変を確認。6秒29.97fps/180Fの音あり・全動画ミュートの2本を復号し、12の代表フレームの色とプレビューを比較した。440/660/880Hzの内包音声を5窓で確認し、全動画ミュートはPCM全窓0で映像を保持した。既存の混音音量方式は変更しておらず、プレビューとの音量一致は今回の合格範囲にしない。

29.97fpsで開始1秒の動画の内部PTSが29Fへ切り下がり、元映像の色切替とクリップ終了が1F早くなる不具合を再現した。FFmpegのfps処理後にAVTBへ戻してから保存開始時刻を足し、F44/F45とF119/F120を含む12点の期待色を満たした。また、保存再生位置へのシーク中にreadyStateが下がると「この位置に対応する画像・動画はありません」が映像の上に残る不具合を修正し、seeked/canplayでも表示を再評価する。待機時間を延ばすだけで合格にはしていない。

実動画は、以前の長尺試験で作った元AAC保持の480pコピー（入力hashは証拠JSON）を読み取り専用で使用。原4Kを直接登録した試験とは区別する。元位置1.1秒・作品開始1.37秒の212.85秒を動画1へ、生成した黄動画/880Hzを10/109/209秒の動画2へ配置。完成物は6,421F/約214.247秒、Windows99,452,916bytes・Ubuntu99,563,581bytes。9地点の復号PCMを元動画と重なり音の和へ照合し、位置差は両OSすべて0sample、最小相関は各0.999551/0.998365。重なり3地点の黄画素、保存再読込、入力hash不変も確認した。全フレームの実映像内容や全codecの同期を保証するものではない。

先行試行は、ドラッグの境界位置、非同期条件の待機誤り、映像切替1F早まり、シーク後の注記残留を検出して停止した。P2回帰の初回1件は変更箇所より前のviewport待機で時間切れ、最終関連回帰25件は成功。最後の動画行試験でも既知のERR_NO_BUFFER_SPACEと後続エラーが出た回は失敗として保持し、単独再実行1件はエラー検査まで成功した。追加プレビュー回帰は通常権限で隔離サーバーが起動せず2件失敗し、許可済み実行で2件成功。失敗試行を成功件数へ含めない。

## 試験待機の依存修正（#61）

ローカルPlaywright1.56.1の実コードと偽条件の実行で、page.waitForFunction(async predicate)がPromise自体をtruthyと判断し、falseの完了を待たずに通ることを確認した。[公式のtruthy条件](https://playwright.dev/docs/api/class-page#page-wait-for-function)と照合し、tests/helpers/studio-harness.cjsのwaitForAsyncでpage.evaluateの完了値をNode側で待って判定する。既存4試験の8箇所を置換し、false/未解決の時間切れ・再試行・例外伝播の2試験と関連回帰を実行した。今回の映像検査はDOMの準備完了と直接画素検査も併用する。以前の直接assertまで無効と断定しない。

## 証拠・再実行

[Windows両MCP/Chrome](../../qa/video-lanes-chrome-20261106.json)、[Ubuntu SDK/FFmpeg](../../qa/video-lanes-linux-20261106.json)、[Windows長尺](../../qa/video-lanes-real-win-20261106.json)、[Ubuntu長尺](../../qa/video-lanes-real-linux-20261106.json)、[生成色動画だけの実画面](../../qa/video-lanes-ui-20261106.png)。動画・12フレーム画像の通常納品先は `D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-06-video-lanes/`。Linux成果物はそのlinux/。Eagleへ自動登録しない。

Windows: CHROMIUM_PATHを実Chromeへ、BAI_NATIVE_WEBMCP=1、BAI_TEST_CONCURRENCY=1、BAI_VIDEO_LANES_OUTを通常確認先へ指定し、`node tests/run-guarded.cjs tests/studio-v05-video-lanes.test.cjs`。長尺はBAI_VIDEO_LANES_REALを上記AAC保持コピーへ指定し、`node tests/run-guarded.cjs tests/studio-v05-video-lanes-long-real.test.cjs`。入力指定なしの長尺はskipなので成功として数えない。Ubuntuは同じ試験へ/mnt側のパスとBAI_VIDEO_LANES_API_ONLY=1を指定する。

Python: `python -X utf8 -m pytest -q tests/test_v05_video_lanes.py tests/test_v05_track_layout.py tests/test_studio_v05_arrangement.py tests/test_v05_stage11.py tests/test_v05_track_audio_mute.py tests/test_v05_render_fractional_fps.py`（Windows53件、Ubuntuは末尾のfractionalを除く43件）。Node関連回帰はstudio-async-condition、studio-p2-motion、studio-v05-image-lanes-native-mcp、studio-v05-video-formats-vfrの25件。最後にstudio-v05-project-media-previewの2件と`npm run typecheck`。

## 操作と未完了

タイムライン内の［動画の行］を開き、［＋ 動画トラック］で増やす。素材の動画を目的の行へドラッグするか、配置/編集の［動画の行］で選ぶ。名前は行名をダブルクリックして変更。空行を選び［空の動画行を削除］で削除する。クリップのある行と最後の1行は削除できない。動画どうしは番号の大きい行が手前で、重なり中も内包音声は混ぜる。［音］［消］と編集ロックは動画全行共通。

APIはPOST `/api/studio/v05/timeline/video-lanes`、`/video-lanes/remove`。標準MCP/WebMCPは既存 `bai_studio_track_layout_set` の `action: add_video_lane/remove_video_lane`、共通入力project_id/revision、削除時laneを使う。最新revisionとvideo_lane_ids/next_video_lane_idは `bai_studio_track_layout_get`。既存の省略更新・画像行actionは後方互換。

全形式/codec・任意の実作品、原4K直接、Linuxブラウザー/ネイティブWebMCP、実スピーカー聴感、プレビュー/MP4混音音量一致、音声/楽曲行増設、ミキサー、行操作全体のUndo/Redoは未完了。既存の分割/元区間/バッチUndoは対象範囲で検査した。DATA-002/008、RENDER-001/006、順3全体は完了へ変更しない。順4の54件読み・自然さ・末尾候補の最終採用、順5の再判定も維持する。
