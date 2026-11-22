#!/usr/bin/env python3
"""FrutiDry browser regression tests (test-only Playwright dependency).

Normal/CI: python tests/browser_qa.py
Restricted environments that block browser navigation:
    python tests/browser_qa.py --injected

The injected fallback uses an in-memory localStorage substitute; it cannot
prove persistence across a real browser restart. CI uses actual HTTP storage.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import mimetypes
import os
from pathlib import Path
import shutil
import threading
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHIM = """<script>
(() => {
  const data = new Map();
  const storage = {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { return data.has(String(k)) ? data.get(String(k)) : null; },
    setItem(k,v) { data.set(String(k),String(v)); },
    removeItem(k) { data.delete(String(k)); },
    clear() { data.clear(); }
  };
  Object.defineProperty(window,'localStorage',{configurable:true,value:storage});
})();
</script>"""


def resource_route(route):
    path = (ROOT / urlparse(route.request.url).path.lstrip('/')).resolve()
    if not path.is_file() or ROOT not in path.parents:
        route.fulfill(status=404, body='Not found')
        return
    route.fulfill(
        status=200,
        content_type=mimetypes.guess_type(path.name)[0] or 'application/octet-stream',
        body=path.read_bytes(),
    )


def injected_game(page):
    page.route('https://frutidry.test/**', resource_route)
    original = (ROOT / 'index.html').read_text(encoding='utf-8')
    markup = original.replace('<head>', '<head><base href="https://frutidry.test/">' + SHIM, 1)
    page.set_content(markup, wait_until='load')


def run(smoke_only=False, injected=False):
    errors = []
    browser_kwargs = {'headless': True, 'args': ['--disable-dev-shm-usage', '--no-sandbox']}
    chrome = os.environ.get('FRUTIDRY_CHROME') or os.environ.get('KOSEN_CHROME')
    if not chrome and injected:
        chrome = shutil.which('chromium') or shutil.which('google-chrome')
    if chrome:
        browser_kwargs['executable_path'] = chrome
    with sync_playwright() as pw:
        browser = pw.chromium.launch(**browser_kwargs)
        try:
            httpd = None
            if not injected:
                handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
                httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
                thread = threading.Thread(target=httpd.serve_forever, daemon=True)
                thread.start()
                origin = f'http://127.0.0.1:{httpd.server_port}'
            else:
                origin = None
            try:
                context = browser.new_context(viewport={'width':390,'height':844}, device_scale_factor=1)
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                if injected:
                    page.route('https://frutidry.test/**', resource_route)
                    smoke = (ROOT/'tests/replay-smoke.html').read_text(encoding='utf-8')
                    page.set_content(smoke.replace('src="../index.html"', ''), wait_until='load')
                    game = (ROOT/'index.html').read_text(encoding='utf-8')
                    game = game.replace('<head>', '<head><base href="https://frutidry.test/">'+SHIM, 1)
                    page.evaluate('(html) => { document.getElementById("game").srcdoc=html; }', game)
                else:
                    page.goto(f'{origin}/tests/replay-smoke.html', wait_until='load')
                page.wait_for_function("document.querySelector('#results')?.textContent.includes('PRUEBAS SUPERADAS') || document.querySelector('#results')?.textContent.includes('PRUEBAS FALLIDAS')",timeout=20000)
                text = page.locator('#results').inner_text()
                assert 'TODAS LAS PRUEBAS SUPERADAS' in text, f'Error en smoke del motor:\n{text}'
                assert not errors, f'Errores JavaScript: {errors}'
                print('OK: replay-smoke (20 escenarios)', flush=True)
                context.close()
                if smoke_only:
                    return
                for w,h in [(320,640),(390,844),(844,390),(1366,768)]:
                    context = browser.new_context(viewport={'width':w,'height':h}, device_scale_factor=1)
                    page = context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    if injected:
                        injected_game(page)
                    else:
                        page.goto(f'{origin}/index.html',wait_until='load')
                    details = page.evaluate('''() => {
                      const c=document.getElementById('gameCanvas');
                      setTab('vault');const isPaused=paused;
                      setTab('play');const resumed=!paused;
                      const before=state.shotCount;shoot();
                      for(let i=0;i<42;i++)update();
                      return {canvas:c.width>0&&c.height>0,paused:isPaused,resumed,
                        shots:state.shotCount-before,seed:state.seed,
                        hud:!!document.getElementById('scoreVal').textContent,
                        brand:GAME_BRAND.name==='FrutiDry'&&document.title.startsWith('FrutiDry')&&document.querySelector('.brand')?.textContent.includes('FrutiDry'),
                        cards:document.querySelectorAll('#relicGrid .relic-card').length};
                    }''')
                    assert details['canvas'] and details['paused'] and details['resumed'], (w,h,details)
                    assert details['shots']==1 and details['hud'] and details['brand'] and details['cards']==12,(w,h,details)
                    assert not errors,(w,h,errors)
                    # The frame clock must never catch up minutes of wall time
                    # after a tab suspension, and re-entering the Codex clears it.
                    timing=page.evaluate('''() => {
                      resetFrameClock();
                      const start=sampleSimulationClock(1000,true);
                      const catchup=sampleSimulationClock(1100,true);
                      const stall=sampleSimulationClock(5100,true);
                      setTab('vault');setTab('play');
                      const afterModal=sampleSimulationClock(20000,true);
                      resetFrameClock();
                      return {start:start.steps,catchup:catchup.steps,
                        stall:stall.steps,stalled:stall.stalled,
                        afterModal:afterModal.steps};
                    }''')
                    assert timing=={'start':0,'catchup':5,'stall':0,'stalled':True,'afterModal':0},(w,h,timing)
                    # Tournament informational view must never imply active cash prizes.
                    tournament=page.evaluate('''() => {
                      setTab('tournament');
                      const status=document.getElementById('tournamentStatus').textContent;
                      const noLive=status.includes('SIN TORNEO ACTIVO');
                      const pausedCorrectly=paused && document.getElementById('tournamentModal').classList.contains('open');
                      const closedVault=!document.getElementById('vaultModal').classList.contains('open');
                      const noFakeNames=[...document.querySelectorAll('.tournament-table tbody td:nth-child(2)')].every(e=>e.textContent==='—');
                      const dates=document.getElementById('tournamentStart').textContent;
                      setTab('play');
                      return {noLive,pausedCorrectly,closedVault,noFakeNames,
                        resumed:!paused,dates:dates!=='—',
                        overflow:document.documentElement.scrollWidth>innerWidth};
                    }''')
                    assert all(v for k,v in tournament.items() if k!='overflow'),(w,h,tournament)
                    assert not tournament['overflow'],(w,h,tournament)
                    print(f'OK: viewport {w}×{h} · disparo / Códice / 12 reliquias / reloj fijo',flush=True)
                    if (w,h)==(390,844):
                        # A real exception in draw() must not permanently kill
                        # requestAnimationFrame, hide the error or mutate progress.
                        page.evaluate("""() => {
                          resetGame(3333);setTab('play');
                          window.__oldDraw=window.draw;
                          window.draw=()=>{throw new Error('draw crash V33');};
                          // Invoke a real loop/render frame synchronously. RAF may be
                          // throttled by headless Chromium while CI runs tests.
                          resetFrameClock();loop(1000);
                        }""")
                        crash=page.evaluate("""() => {
                          window.draw=window.__oldDraw;
                          const report=FaultBoundary.buildReport();
                          const stopped=paused;
                          const visible=!document.getElementById('faultOverlay').hidden;
                          const before=state.simFrame;
                          setTab('play');update();
                          const cannotBypass=paused&&state.simFrame===before;
                          const restarted=FaultBoundary.restart();
                          return {stopped,visible,cannotBypass,restarted,
                            phase:report.phase,message:report.error.message,
                            reset:state.simFrame===0&&!FaultBoundary.active()&&!paused};
                        }""")
                        assert crash['stopped'] and crash['visible'] and crash['cannotBypass'],crash
                        assert crash['restarted'] and crash['reset'],crash
                        assert crash['phase']=='render' and crash['message']=='draw crash V33',crash
                        print('OK: fallo real de Canvas · pausa visible · recuperación explícita',flush=True)
                    if (w,h)==(390,844):
                        result = page.evaluate('''() => {
                          resetGame(888);
                          state.best=2500;state.recordHolder='LOCAL';
                          STORE.set('kosen_v20_best',2500);
                          STORE.set('kosen_v20_holder','LOCAL');
                          const backup=ContinuityLab.createBackup();
                          backup.progress.best=2500;backup.progress.holder='IMPORTADO';
                          ContinuityLab.mergeBackup(backup);
                          const tiePreserved=state.recordHolder==='LOCAL';
                          const bad={...backup,settings:{...backup.settings,musicVolume:2}};
                          const original=ContinuityLab.createBackup();
                          let rejected=false;
                          try{ContinuityLab.mergeBackup(bad);}catch(_){rejected=true;}
                          const after=ContinuityLab.createBackup();
                          const unchanged=JSON.stringify(original.progress)===JSON.stringify(after.progress) && JSON.stringify(original.settings)===JSON.stringify(after.settings);
                          const stored=STORE.get('kosen_v20_best',null)===2500;
                          return {tiePreserved,rejected,unchanged,stored};
                        }''')
                        assert all(result.values()),('progreso',result)
                        print('OK: fusión de progreso, empate de récord, rechazo de copia inválida',flush=True)
                        # Simulate a quota failure AFTER the first legacy keys were
                        # written. The journal must restore raw values, not just HUD.
                        failed=page.evaluate('''() => {
                          const watched=['kosen_v20_best','kosen_v20_holder','kosen_cores',
                            'kosen_relics','kosen_v3_best','kosen_muted',
                            'kosen_music_enabled','kosen_music_volume','kosen_render_quality'];
                          const before=watched.map(k=>[k,localStorage.getItem(k)]);
                          const prop=Object.getOwnPropertyDescriptor(window,'localStorage');
                          const real=window.localStorage;
                          let failedOnce=false, thrown=false;
                          Object.defineProperty(window,'localStorage',{configurable:true,value:{
                            getItem:k=>real.getItem(k),
                            setItem:(k,v)=>{
                              if(k==='kosen_cores'&&!failedOnce){failedOnce=true;throw Error('quota simulated');}
                              real.setItem(k,v);
                            },
                            removeItem:k=>real.removeItem(k)
                          }});
                          try {
                            const incoming=ContinuityLab.createBackup();
                            incoming.progress.best=9999;incoming.progress.cores+=500;
                            try {ContinuityLab.mergeBackup(incoming);}catch(e){thrown=e.message.includes('restaurado');}
                          } finally {Object.defineProperty(window,'localStorage',prop);}
                          return {
                            thrown,
                            identical:before.every(([k,v])=>localStorage.getItem(k)===v),
                            clean:localStorage.getItem('frutidry_import_journal_v1')===null,
                            unchanged:state.best===2500&&state.recordHolder==='LOCAL'
                          };
                        }''')
                        assert all(failed.values()),('rollback de importación',failed)
                        print('OK: fallo de cuota simulado · rollback de nueve claves',flush=True)
                        # Failure during the rollback itself must preserve the
                        # journal; a later recovery pass repairs the partial keys.
                        blocked=page.evaluate('''() => {
                          const keys=['kosen_v20_best','kosen_v20_holder','kosen_cores',
                            'kosen_relics','kosen_v3_best','kosen_muted',
                            'kosen_music_enabled','kosen_music_volume','kosen_render_quality'];
                          const before=keys.map(k=>[k,localStorage.getItem(k)]);
                          const prop=Object.getOwnPropertyDescriptor(window,'localStorage');
                          const real=window.localStorage;
                          let errors=0,thrown=false;
                          Object.defineProperty(window,'localStorage',{configurable:true,value:{
                            getItem:k=>real.getItem(k),
                            setItem:(k,v)=>{
                              if(k==='kosen_cores'&&errors++<2)throw Error('disk unavailable');
                              real.setItem(k,v);
                            },
                            removeItem:k=>real.removeItem(k)
                          }});
                          try {
                            const incoming=ContinuityLab.createBackup();
                            incoming.progress.best=9999;incoming.progress.cores+=500;
                            try{ContinuityLab.mergeBackup(incoming);}catch(e){thrown=e.message.includes('recuperación pendiente');}
                          }finally{Object.defineProperty(window,'localStorage',prop);}
                          const pending=STORAGE_IMPORT.status==='blocked' &&
                            localStorage.getItem('frutidry_import_journal_v1')!==null;
                          const blockedWrite=STORE.set('kosen_v20_best',12345)===false;
                          const recovered=STORAGE_IMPORT.recover();
                          return {thrown,pending,blockedWrite,
                            recovered:recovered==='recovered',
                            identical:before.every(([k,v])=>localStorage.getItem(k)===v),
                            clean:localStorage.getItem('frutidry_import_journal_v1')===null};
                        }''')
                        assert all(blocked.values()),('recuperación diferida',blocked)
                        print('OK: rollback interrumpido · diario retenido · recuperación diferida',flush=True)
                        # Incomplete import: mimics a crash after two keys were
                        # persisted, but before the transaction marker was deleted.
                        incomplete=page.evaluate('''() => {
                          const keys=['kosen_v20_best','kosen_v20_holder','kosen_cores',
                            'kosen_relics','kosen_v3_best','kosen_muted',
                            'kosen_music_enabled','kosen_music_volume','kosen_render_quality'];
                          const before=keys.map(k=>[k,localStorage.getItem(k)]);
                          localStorage.setItem('frutidry_import_journal_v1',JSON.stringify({version:1,before}));
                          localStorage.setItem('kosen_v20_best','999999');
                          localStorage.setItem('kosen_cores','888888');
                          return before;
                        }''')
                        if injected:
                            recovered=page.evaluate('''() => {
                              const result=STORAGE_IMPORT.recover();
                              return {status:result,best:STORE.get('kosen_v20_best',-1),
                                journal:localStorage.getItem('frutidry_import_journal_v1'),
                                banner:!document.getElementById('storageAlert').hidden};
                            }''')
                            assert recovered=={'status':'recovered','best':2500,'journal':None,'banner':True},recovered
                            print('OK: recuperación de diario interrumpido (simulada, sin recarga)',flush=True)
                        else:
                            page.reload(wait_until='load')
                            recovered=page.evaluate('''() => ({
                              status:STORAGE_IMPORT.status,best:state.best,
                              name:state.recordHolder,cores:state.coresDetonated,
                              journal:localStorage.getItem('frutidry_import_journal_v1'),
                              banner:!document.getElementById('storageAlert').hidden
                            })''')
                            assert recovered['status']=='recovered' and recovered['best']==2500 and recovered['name']=='LOCAL',recovered
                            assert recovered['journal'] is None and recovered['banner'],recovered
                            print('OK: cierre simulado · recuperación real al recargar',flush=True)
                        if not injected:
                            # Persisted browser storage is part of the public game's contract.
                            page.reload(wait_until='load')
                            persisted=page.evaluate("() => ({best:state.best,name:state.recordHolder})")
                            assert persisted=={'best':2500,'name':'LOCAL'},persisted
                            print('OK: persistencia real de localStorage tras recargar',flush=True)
                        else:
                            print('AVISO: persistencia entre recargas no comprobada (almacenamiento simulado)',flush=True)
                    context.close()
                # V34: missing raster assets must fall back without pausing the game.
                missing = [
                    'assets/gems/nivel-01.webp',
                    'assets/background/santuario-vertical.webp',
                    'assets/relics/reliquia-01.webp',
                    'assets/ui/boton-rubi.webp',
                ]
                ctx = browser.new_context(viewport={'width':390,'height':844})
                page = ctx.new_page()
                broken_errors = []
                page.on('pageerror',lambda error: broken_errors.append(str(error)))
                if injected:
                    page.route('https://frutidry.test/**',resource_route)
                    address = 'https://frutidry.test/'
                else:
                    address = origin + '/'
                for path in missing:
                    page.route('**/' + path, lambda route: route.fulfill(status=404, body='missing for test'))
                if injected:
                    original = (ROOT/'index.html').read_text(encoding='utf-8')
                    markup = original.replace('<head>', '<head><base href="https://frutidry.test/">' + SHIM, 1)
                    page.set_content(markup,wait_until='load')
                else:
                    page.goto(address + 'index.html',wait_until='load')
                page.wait_for_function('AssetHealth.summary().loading === 0',timeout=20000)
                fallback = page.evaluate('''() => {
                  const report=AssetHealth.summary(),relic=document.querySelector('.relic-art');
                  const before=state.shotCount;shoot();for(let i=0;i<20;i++)update();
                  return {total:report.total, failed:report.failed, paths:report.paths,
                    notice:!document.getElementById('assetNotice').hidden,
                    background:document.documentElement.classList.contains('asset-bg-failed-portrait') &&
                      getComputedStyle(document.querySelector('main')).backgroundImage.includes('gradient'),
                    relic:relic.classList.contains('relic-art-unavailable'),
                    drawFallback:!tetsuGemSprites[0].naturalWidth,
                    playable:state.shotCount===before+1,
                    noFault:document.getElementById('faultOverlay').hidden};
                }''')
                assert fallback['total']==59 and fallback['failed']==4 and fallback['notice'],fallback
                assert fallback['background'] and fallback['relic'] and fallback['drawFallback'],fallback
                assert fallback['playable'] and fallback['noFault'],fallback
                assert not broken_errors,broken_errors
                print('OK: 4 recursos ausentes · aviso + 3 fallbacks · partida jugable',flush=True)
                ctx.close()

                # V34: missing essential JS cannot leave an apparently playable screen.
                ctx = browser.new_context(viewport={'width':390,'height':844})
                page = ctx.new_page()
                if injected:
                    page.route('https://frutidry.test/**',resource_route)
                    address='https://frutidry.test/'
                else:
                    address=origin+'/'
                page.route('**/js/render.js',lambda route:route.fulfill(status=404,body='script missing'))
                if injected:
                    original=(ROOT/'index.html').read_text(encoding='utf-8')
                    page.set_content(original.replace('<head>', '<head><base href="https://frutidry.test/">'+SHIM,1), wait_until='load')
                else:
                    page.goto(address+'index.html',wait_until='load')
                boot=page.evaluate('''() => ({visible:!document.getElementById('faultOverlay').hidden,
                    title:document.getElementById('faultTitle').textContent,
                    restartHidden:document.getElementById('faultRestart').hidden,
                    exportHidden:document.getElementById('faultExport').hidden,
                    reloadAvailable:!!document.getElementById('faultReload').onclick})''')
                assert boot['visible'] and boot['restartHidden'] and boot['exportHidden'],boot
                assert 'no ha podido iniciarse' in boot['title'] and boot['reloadAvailable'],boot
                print('OK: JS esencial ausente · arranque bloqueado y recarga disponible',flush=True)
                ctx.close()
                assert not errors, f'Errores JS: {errors}'
            finally:
                if httpd:
                    httpd.shutdown()
                    httpd.server_close()
        finally:
            browser.close()
    print('BROWSER QA: TODAS LAS PRUEBAS SUPERADAS', flush=True)


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--injected',action='store_true',help='Fallback sin navegación (localStorage simulado)')
    parser.add_argument('--smoke-only',action='store_true')
    args=parser.parse_args()
    run(smoke_only=args.smoke_only,injected=args.injected)
