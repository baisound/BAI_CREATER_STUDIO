from pathlib import Path
import json,shutil,hashlib
root=Path(__file__).resolve().parents[2]
qa=root/'qa/preview-space-20261113'
shots=Path(r'D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/20261113-preview-space')
out=root/'studio/v05/reviews/preview-space-20261113';out.mkdir(parents=True,exist_ok=True)
data=json.loads((qa/'validation.json').read_text(encoding='utf-8-sig'));assert data['status']=='passed' and not data['errors']
images=[]
for name in ['before-1478x653.png','preview-space-1478x653.png','preview-space-1440x900.png','preview-space-1024x768.png']:
    shutil.copyfile(shots/name,out/name);images.append({'file':name,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()})
data.update(schema=1,requirements=['UX-001','UX-003','UX-006','UX-008','AUDIO-001'],implementation='implemented',
    findings=[{'id':i,'priority':p,'finding':f,'fix':x,'status':'PASS'} for i,p,f,x in [
        ('PREVIEW-H-01','P1','内外のヘッダーで表示領域が低い','外側72px・内側30px、残り高へiframe'),
        ('PREVIEW-H-02','P2','低画面で3Dと再生操作が重なる','flex-shrink防止と内部スクロール、保存のhit test'),
        ('PREVIEW-H-03','P1','埋込でモード切替が消える','toolsとmode-switchを表示メニューへ移動'),
        ('PREVIEW-H-04','P2','狭幅のナビが画面外へ隠れる','position/transform解除と700px実操作'),
        ('PREVIEW-H-05','P1','音声resume待ち後に非表示画面が再生する','世代照合とinactive通知のpause')]],
    review={'critic1':'limited PASS','critic2':'limited PASS','critic3':'limited PASS','judge':'Root; required findings fixed and tested'},
    verification={'browser':'2 targeted tests + 1 common UI regression passed','typecheck':'PASS'},
    images=images,not_tested=['screen reader','200% zoom/touch','all embedded workspace routes','model/camera/motion/expression timeline link (separate pending task)','per-lane mixer timeline link (separate pending task)'])
(qa/'implementation.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'implementation.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
html='''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>実動作プレビューの表示高さ</title><style>body{margin:24px auto;padding:0 20px;max-width:1500px;background:#101925;color:#e9f2fb;font:16px/1.6 system-ui}figure{margin:16px 0;position:relative}img{width:100%;display:block;border:1px solid #567}figcaption{margin:8px 0}.mark{position:absolute;border:2px solid #ffe59a;background:#ffe59a;color:#152535;border-radius:50%;width:30px;height:30px;text-align:center;font-weight:bold}a{color:#9bd3ff}</style><h1>実装済み：実動作プレビューの高さを確保</h1><p>①外側の見出し・説明を圧縮　②内側ナビを「画面・表示設定」へまとめる　③モデル表示へ高さを配分　④下の保存・配置操作は内部スクロールで到達できます。素材未選択の隔離画面であり、3D連動の合格証拠ではありません。</p>'''
for im in images:
    name=im['file'];html+=f'<figure><img src="{name}" alt="'+('変更前の隔離main画面' if name.startswith('before') else '変更後の隔離画面')+'">'
    if not name.startswith('before'):
        for n,left,top in [(1,15,14),(2,12,29),(3,50,57),(4,36,86)]:html+=f'<span class="mark" style="left:{left}%;top:{top}%">{n}</span>'
    html+=f'<figcaption>{name}</figcaption></figure>'
html+='<p><a href="implementation.json">監査・検証JSON</a></p></html>'
(out/'index.html').write_text(html,encoding='utf-8')
print('Read back:',len(images),'images; findings',len(data['findings']))
