"""Run via: python tools/run_ui_qa.py  (server must already be running)."""
import sys, json, time, traceback
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from qa_capture import ROOT,settings,cleanup
from urllib.request import urlopen

def main():
    s=settings()
    if not s['enabled']:
        print('UI QA OFF: screenshots and test logs not generated.');return 0
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('Playwright missing: python -m pip install playwright && python -m playwright install chromium');return 2
    run=ROOT/time.strftime('%Y%m%d-%H%M%S')
    run.mkdir(parents=True,exist_ok=True)
    result={'started':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'cases':[],'console_errors':[]}
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True)
            for w,h in [(1366,768),(1920,1080),(1024,700)]:
                page=browser.new_page(viewport={'width':w,'height':h})
                page.on('pageerror',lambda err: result['console_errors'].append(str(err)[:300]))
                item={'viewport':f'{w}x{h}'}
                try:
                    page.goto('http://127.0.0.1:8765/',wait_until='domcontentloaded',timeout=15000)
                    page.wait_for_timeout(750)
                    item['title']=page.title()
                    item['buttons']=page.locator('button').count()
                    item['horizontal_overflow']=page.evaluate('document.documentElement.scrollWidth > innerWidth + 2')
                    item['visible_import']=page.locator('#studio-asset-input').is_visible()
                    item['screenshot']=f'{w}x{h}.jpg'
                    page.screenshot(path=str(run/item['screenshot']),type='jpeg',quality=65,full_page=False)
                    item['status']='ok' if not item['horizontal_overflow'] and item['visible_import'] else 'needs_review'
                except Exception as ex: item['status']='error';item['message']=str(ex)[:350]
                result['cases'].append(item)
                page.close()
            browser.close()
    except Exception as ex:
        result['fatal_error']=str(ex)[:500]
    (run/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    cleanup()
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 1 if any(c['status']!='ok' for c in result['cases']) or result.get('fatal_error') else 0
if __name__=='__main__':sys.exit(main())
