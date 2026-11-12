"""Build portable, numbered evidence without altering the screenshot pixels."""
from pathlib import Path
import csv
import hashlib
import json
import shutil

root=Path(__file__).resolve().parents[2]
qa=root/'qa/vst-mixer-20261113'
shots=Path(r'D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/20261113-vst-mixer')
report=root/'studio/v05/reviews/vst-mixer-20261113'
report.mkdir(parents=True,exist_ok=True)
files=['mixer-processing-1440.png','mixer-processing-1024.png','library-height-1478x653.png','library-height-1024x768.png']
images=[]
for name in files:
    shutil.copyfile(shots/name,report/name)
    images.append({'file':name,'sha256':hashlib.sha256((report/name).read_bytes()).hexdigest()})
cases=[json.loads((qa/name).read_text(encoding='utf-8-sig')) for name in ('browser-validation.json','edge-validation.json','library-validation.json')]
assert all(case['status']=='passed' and not case['errors'] for case in cases)
issues=[('VST-UX-01','P1','保存後Undoのrevision','channels/enabledだけ戻し、保存revisionを維持','Undo後の再保存'),
        ('VST-UX-02','P1','試聴音声の重なり','3プレイヤーの排他と画面切替時停止','素材→ミキサー→タイムライン'),
        ('VST-UX-03','P2','保存中のパラメーター変更','入力無効・busyガード','遅延保存'),
        ('VST-UX-04','P2','試聴に伴う保存が不明','未保存時「保存して処理・試聴」','ラベルと保存経路'),
        ('VST-UX-05','P2','停止後の再生中表示','準備完了表示へ変更','処理後の状態表示'),
        ('VST-UX-06','P2','M/Sの下端欠け','素材用transport非表示と150px以上のフェーダー','1024/1440実測'),
        ('VST-UX-07','P1','作品切替と旧応答の競合','作品ID・世代・モデル一致の照合','A保存→B読込/A→B→A検査'),
        ('VST-UX-08','P2','再描画後のフォーカス喪失','安定キーと選択チャンネルへのfallback','バイパス・最終インサート削除'),
        ('LIB-HEIGHT-01','P1','素材カードの潰れと低い一覧','内容高の行・196pxカード・高度設定の遅延移動','1478×653/1024×768/1440×900')]
data={'schema':1,'date':'2026-11-13','issues':[296,297],'requirements':['AUDIO-002','RENDER-006','DATA-002','DATA-008','UX-006','UX-008'],
      'implementation':'implemented','processing_mode':'offline VST3; saved settings applied to material audition, project preview and MP4',
      'review':{'critic_1':'first action','critic_2':'workflow/state','critic_3':'visual/accessibility','judge':'root; remaining fixes verified with delayed routes and keyboard tests'},
      'findings':[dict(id=i,priority=p,target=t,fix=f,verification=v,status='PASS') for i,p,t,f,v in issues],
      'numeric':{'gain_minus_6_db':.5011885785905011,'real_tdr_nova_ratio':cases[0]['nativeRatio'],'mp4_to_processed_pcm_ratio':cases[0]['mp4GainRatio']},
      'tests':{'windows_python':'87 passed + 5 subtests','ubuntu_python':'85 passed, 2 skipped + 5 subtests; native Windows VST and Windows-only lock test excluded','browser':'see browser-release.log','typecheck':'PASS'},
      'not_tested':['all third-party VST3 compatibility','Linux native plugin/browser','physical output listening','VSTi/VST2/native plugin GUI','low latency live input','screen reader/200% zoom/touch','2-hour processing stress'],
      'images':images,'originals':'Owner data/exports retained; isolated synthetic sources used for tests'}
(qa/'implementation.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(report/'implementation.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
html='''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>音声処理・素材一覧の修正確認</title><style>body{margin:24px auto;padding:0 20px;max-width:1500px;background:#0c1521;color:#edf4fb;font:16px/1.65 system-ui}a{color:#9bd4ff}h1{font-size:25px}figure{margin:20px 0;position:relative}img{width:100%;display:block;border:1px solid #566e85}figcaption{margin:10px 0}.marker{position:absolute;background:#ffe28b;color:#142334;border:2px solid #172536;border-radius:50%;width:30px;height:30px;text-align:center;font-weight:bold}table{border-collapse:collapse}td,th{border-bottom:1px solid #52677b;padding:8px;text-align:left}</style><h1>音声処理と素材一覧：実装済みの変更</h1><p>①作品別保存・処理後試聴　②VST3インサートと汎用パラメーター　③実dB値・ピーク・M/S　④潰れない素材カードと内部スクロール。画像は合成素材による隔離Chromeの実画面です。</p><p>−6 dBのPCM比は約0.501。TDR Novaの実処理、素材管理からWAV配置、同じ処理を使う作品プレビューと完成MP4を確認。ライブ入力・全VST・固有GUIの対応は含みません。</p>'''
for entry in images:
    name=entry['file']; library=name.startswith('library')
    html+=f'<figure><img src="{name}" alt="'+('素材一覧の修正後実画面' if library else 'VSTミキサーの処理後実画面')+'">'
    for num,left,top in ([(4,40,50)] if library else [(1,45,23),(2,22,46),(3,23,75)]):
        html+=f'<span class="marker" style="left:{left}%;top:{top}%">{num}</span>'
    html+=f'<figcaption>{name}</figcaption></figure>'
html+='<h2>監査と検証の対応</h2><table><tr><th>ID</th><th>修正</th><th>検証</th></tr>'
for finding in data['findings']:html+=f'<tr><td>{finding["id"]}</td><td>{finding["fix"]}</td><td>PASS：{finding["verification"]}</td></tr>'
html+='</table><p><a href="implementation.json">機械処理用JSON</a></p></html>'
(report/'index.html').write_text(html,encoding='utf-8')

# Preserve the existing statuses and all historical JSON/CSV differences.
register=root/'docs/roadmap/FEATURE_REGISTER.json'
db=json.loads(register.read_text(encoding='utf-8-sig'))
feature={'id':'AUDIO-002','group':'AUDIO','phase':5,'name':'作品ミキサー・VST3音声処理',
         'detail':'Owner 2026-11-13指定。作品別のmusic/audio/video/masterバス、dB音量・ミュート・ソロ、VST3エフェクトの追加/順序/バイパス/汎用パラメーターを保存。別プロセスの処理後PCMを素材試聴・作品プレビュー・MP4で共有。実TDR Nova、ゲイン比、原本/完成物保護、両MCP、別作品競合を限定検証。docs/v05/VST_MIXER_PROCESSING_20261113_JA.md',
         'status':'部分実装・代表検証。Windows実VST3、Windows/UbuntuのPCM計算と既存出力回帰を確認。全VST/Linuxプラグイン/固有GUI/VSTi/低遅延入力/聴感/長尺負荷は未検証・未対応','dependency':'AUDIO-001,DATA-002,DATA-008,RENDER-006'}
if not any(row['id']=='AUDIO-002' for row in db['features']):db['features'].append(feature)
register.write_text(json.dumps(db,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
csvfile=root/'docs/roadmap/FEATURE_REGISTER.csv'
with csvfile.open(encoding='utf-8-sig',newline='') as stream:
    reader=csv.DictReader(stream);fields=reader.fieldnames;rows=list(reader)
if not any(row['id']=='AUDIO-002' for row in rows):rows.append({k:feature[k] for k in fields})
with csvfile.open('w',encoding='utf-8-sig',newline='') as stream:
    writer=csv.DictWriter(stream,fieldnames=fields);writer.writeheader();writer.writerows(rows)
print('Evidence prepared:',len(images),'images;',len(db['features']),'requirements; CSV BOM retained')
