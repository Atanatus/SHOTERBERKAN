#!/usr/bin/env python3
"""V50 browser QA with mocked Firebase SDK/API. No external credentials or calls."""
from pathlib import Path
import os
import runpy
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
source=runpy.run_path(str(ROOT/'tests/account-verification-browser-qa.py'))
HTML=source['HTML']; MOCK=source['MOCK']


def prepare(page):
    page.set_content(HTML)
    page.add_script_tag(content=MOCK)
    for name in ('account-client.js','account-verification.js','account-session.js'):
        page.add_script_tag(content=(ROOT/'js'/name).read_text('utf8'))
    ui=(ROOT/'js/account-ui.js').read_text('utf8').replace('import(', 'window.__mockImport(')
    page.add_script_tag(content=ui)
    page.locator('#btnAccount').click()
    page.wait_for_function('document.getElementById("accountProfile").hidden===false')


def main():
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--no-sandbox'],executable_path=os.environ.get('FRUTIDRY_CHROMIUM') or None)
        try:
            ctx=browser.new_context(viewport={'width':390,'height':844})
            page=ctx.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            prepare(page)
            # First response 401, then 200. The mock records forced Firebase refresh.
            page.evaluate('''() => {
              window.__v50={calls:0};
              const valid={account:{uid:'user-123',accountLevel:1,xp:0,nextLevelXp:250,
                progressionVersion:'draft-1',minimumTournamentLevel:11,meetsLevelRequirement:false,
                tournamentAccessEnabled:false,cashPrizesEnabled:false,status:'PREPARATION'}};
              window.fetch=async()=>{window.__v50.calls++;return window.__v50.calls===1
                ?{ok:false,status:401,headers:{get:()=>null},json:async()=>({error:'INVALID_OR_REVOKED_TOKEN'})}
                :{ok:true,status:200,headers:{get:()=>null},json:async()=>valid};};
              window.__testAuth.tokenForce=[];
            }''')
            page.locator('#accountRefresh').click()
            page.wait_for_function('window.__v50.calls===2 && document.getElementById("accountProfile").hidden===false')
            assert page.evaluate('window.__testAuth.tokenForce').count(True)==1
            assert page.locator('#accountLogout').is_visible()
            # 503 does not sign out or force-renew tokens.
            page.evaluate('''() => {
              window.__v50.calls=0;
              window.fetch=async()=>{window.__v50.calls++;return {ok:false,status:503,
                headers:{get:()=>null},json:async()=>({error:'ACCOUNT_SERVICE_UNAVAILABLE'})};};
              window.__testAuth.tokenForce=[];
            }''')
            page.locator('#accountRefresh').click()
            page.wait_for_function('window.__v50.calls===1 && document.getElementById("accountStatus").textContent.includes("no está disponible")')
            assert page.locator('#accountLogout').is_visible()
            assert page.evaluate('window.__testAuth.tokenForce')==[False]
            # Two 401s mean the server rejected both original and refreshed tokens.
            page.evaluate('''() => {
              window.__v50.calls=0;
              window.fetch=async()=>{window.__v50.calls++;return {ok:false,status:401,
                headers:{get:()=>null},json:async()=>({error:'INVALID_OR_REVOKED_TOKEN'})};};
              window.__testAuth.tokenForce=[];
            }''')
            page.locator('#accountRefresh').click()
            page.wait_for_function('window.__v50.calls===2 && document.getElementById("accountAuthPanel").hidden===false')
            assert page.locator('#accountProfile').is_hidden()
            assert page.locator('#accountLogout').is_hidden()
            assert page.evaluate('window.__testAuth.tokenForce')==[False,True]
            assert not errors,errors
            print('OK V50 Chromium: forced token refresh, 503 keeps user, two 401s sign out',flush=True)
            ctx.close()
        finally:browser.close()


if __name__=='__main__':main()
