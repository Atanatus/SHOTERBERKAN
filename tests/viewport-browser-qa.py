#!/usr/bin/env python3
"""V48 browser acceptance: real HTTP, logical board sizing, input conversion, normal arcade unchanged.
CI-only Playwright test dependency; game itself stays Vanilla JS.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


def run():
    handler = partial(Quiet, directory=str(ROOT))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch(headless=True, args=['--no-sandbox'])
            try:
                for w,h in [(320,640),(390,844),(844,390),(1366,768)]:
                    ctx = browser.new_context(viewport={'width':w,'height':h})
                    page = ctx.new_page()
                    faults = []
                    page.on('pageerror', lambda error: faults.append(str(error)))
                    page.goto(origin+'/index.html?competitivePreview=1',wait_until='load')
                    page.wait_for_function('window.__FRUTIDRY_BOOT_READY__ === true',timeout=20000)
                    m = page.evaluate('''() => {
                      const c=document.getElementById('gameCanvas'), r=c.getBoundingClientRect();
                      const p=c.parentElement.getBoundingClientRect();
                      return {w:width,h:height,canvasW:c.width,canvasH:c.height,
                        boardW:r.width,boardH:r.height,parentW:p.width,parentH:p.height,
                        dpr:c.width/width,flag:!document.getElementById('competitivePreviewNotice').hidden,
                        fault:!document.getElementById('faultOverlay').hidden,
                        practice:state.practiceSeed!==null,practiceTag:!document.getElementById('practiceIndicator').hidden,
                        center:FrutiDryViewport.pointerToLogical(r.left+r.width/2,r.top+r.height/2,r,width,height)};
                    }''')
                    assert m['w']==390 and m['h']==844,m
                    assert m['flag'] and m['practice'] and m['practiceTag'] and not m['fault'],m
                    assert abs(m['boardW']/m['boardH']-390/844)<0.0001,m
                    assert m['boardW']<=m['parentW']+.5 and m['boardH']<=m['parentH']+.5,m
                    assert abs(m['center']['x']-195)<.01 and abs(m['center']['y']-422)<.01,m
                    assert abs(m['canvasW']-390*m['dpr'])<2,m
                    assert not faults,faults
                    page.evaluate("setTab('vault')")
                    page.set_viewport_size({'width':max(300,w-9),'height':max(360,h-9)})
                    m2=page.evaluate('''() => ({width,height,pause:paused,notice:!document.getElementById('competitivePreviewNotice').hidden})''')
                    assert m2=={'width':390,'height':844,'pause':True,'notice':True},m2
                    print(f'OK: preview fijo {w}x{h} → lógico 390x844')
                    ctx.close()
                ctx=browser.new_context(viewport={'width':1366,'height':768})
                page=ctx.new_page()
                page.goto(origin+'/index.html',wait_until='load')
                page.wait_for_function('window.__FRUTIDRY_BOOT_READY__ === true',timeout=20000)
                m=page.evaluate('''() => ({w:width,h:height,rect:document.getElementById('gameCanvas').getBoundingClientRect().width,
                  notice:document.getElementById('competitivePreviewNotice').hidden})''')
                assert m['w']>390 and m['h']>100 and m['notice'],m
                assert abs(m['w']-m['rect'])<2,m
                print('OK: arcade normal sigue siendo responsivo')
                ctx.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print('V48 VIEWPORT BROWSER QA: OK')

if __name__=='__main__':
    run()
