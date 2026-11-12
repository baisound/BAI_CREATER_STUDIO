from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
additions={
'docs/roadmap/FEATURE_DETAIL_JA.md':'''\n\n### AUDIO-002 — 作品ミキサー・VST3音声処理（Owner 2026-11-13）

AUDIO-001の配置・同期とは独立した追加要求。作品ごとに楽曲/音声/映像音/マスターの音量dB、ミュート/ソロ、VST3エフェクトの順序・バイパス・汎用パラメーターを保存し、処理後PCMを素材単体試聴・共通作品プレビュー・MP4へ接続する。原本・完成動画の保持、revision競合、VSTロード失敗の明示、手動UIと両MCPの同一APIを受け入れ条件とする。

確認状態は部分実装・代表検証。実TDR Nova、−6 dB振幅比、MP4との音量一致、保存後Undo再保存、A→B→A競合、エラー復旧、元音二重再生防止をWindowsで確認。UbuntuはPCM計算と既存出力回帰。全VST/Linux実プラグイン/聴感/固有GUI/VSTi/低遅延ライブ/長尺負荷は未達。[仕様・試験と未検証](../v05/VST_MIXER_PROCESSING_20261113_JA.md)、Issue #296。

UX-003/006/008・DATA-008：Owner報告 #297 の素材カード潰れと一覧高さを、行高・画像比率保持・遅延高度設定の移動で修正。低い653px画面を含む3サイズで表示・スクロール・素材選択を確認。正式な既存要件全体の完成に広げない。
''',
'docs/roadmap/TRACEABILITY_JA.md':'''\n\n## 2026-11-13 VST・ミキサーの実処理と素材一覧

Ownerの「実際に使えるように」→ AUDIO-002を発番（AUDIO-001の同期仕様は維持）。RENDER-006 / DATA-002・008 / UX-006へ試聴・保存・出力を接続。素材一覧の低さ/潰れの追加報告は UX-003/006/008・DATA-008、Issue #297。[実装・検証・限界](../v05/VST_MIXER_PROCESSING_20261113_JA.md)。検証済み段階をPRでmainへ統合する。

後続Owner指定：タイムラインのモデル/カメラ/動き・表情を既存実再生へ接続し、実動作プレビューの二重ヘッダーを圧縮して表示領域を確保する。これは次の進行項目で、音声PRの完了と混同しない。G3-F1は未完のまま保持。
''',
'docs/roadmap/00_OVERVIEW_JA.md':'''\n\n## 2026-11-13 作品ミキサーと素材一覧

追加要件AUDIO-002：別プロセスのVST3ホスト、作品別dB/M/S/インサート保存、処理後音声の試聴・作品プレビュー・MP4を接続。実TDR NovaとWindows/Ubuntuの代表試験を確認。素材一覧の行縮みと低さも修正。[結果と制限](../v05/VST_MIXER_PROCESSING_20261113_JA.md)。モデル・カメラ・動き/表情のタイムライン連動と内側ヘッダーの圧縮はOwner指定で次に進める。
'''}
for name,addition in additions.items():
    p=root/name;text=p.read_text(encoding='utf-8-sig')
    if addition.strip().splitlines()[0] not in text:text=text.rstrip()+addition
    p.write_text(text.rstrip()+'\n',encoding='utf-8')
state=json.loads((root/'docs/roadmap/FEATURE_REGISTER.json').read_text(encoding='utf-8'))
assert len({x['id'] for x in state['features']})==152
assert (root/'docs/roadmap/FEATURE_REGISTER.csv').read_bytes().startswith(b'\xef\xbb\xbf')
print('Roadmap and 152 requirements read back; original statuses retained')

import subprocess,hashlib
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip()
paths=['server.py','mcp_server.py','webmcp.js','bai_studio/v05/audio/mixer.py','bai_studio/v05/audio/worker.py',
       'bai_studio/v05/render/media_render.py','studio/v05/js/audio-mixer.js','studio/v05/js/audio-workspace-v65.js',
       'studio/v05/js/project-media-preview-v68.js','studio/v05/js/ui-clarity-20261113.js','studio/v05/js/asset-library-v62.js',
       'studio/v05/css/audio-mixer.css','studio/v05/css/library-scroll-v64.css']
for target in ['qa/vst-mixer-20261113/implementation.json','studio/v05/reviews/vst-mixer-20261113/implementation.json']:
    p=root/target;data=json.loads(p.read_text(encoding='utf-8'))
    data['implementation_commit']=commit;data['pull_request']=298
    data['source_sha256']={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in paths}
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
