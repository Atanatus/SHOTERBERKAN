#!/usr/bin/env python3
"""V49 standalone Chromium UI regression with injected Firebase SDK stub.

No Firebase service, Render, credentials, or internet is contacted. Production
account-ui.js is exercised with its dynamic import function redirected to a stub.
Other existing QA covers the full game in SDK-off mode.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = """<!doctype html><html><head><meta charset='utf-8'><style>
body{font-family:Arial,sans-serif;margin:0;background:#102239;color:white}
button,input{font:inherit;min-height:36px}
.account-panel,.account-profile{padding:12px;border:1px solid #888;margin:8px auto;width:min(90%,480px)}
[hidden]{display:none!important}
</style></head><body>
<header><nav><button id='btnAccount'>Cuenta</button><button id='btnPlay'>Play</button><button id='btnVault'>Vault</button><button id='btnTournament'>Tournament</button></nav></header>
<section id='vaultModal' class='modal' aria-hidden='true'></section>
<section id='tournamentModal' class='modal' aria-hidden='true'></section>
<section id='accountModal' class='account-modal modal' aria-hidden='true'>
<button id='accountClose'>Cerrar</button>
<p id='accountStatus'></p>
<section id='accountUnavailable'>No disponible</section>
<section id='accountAuthPanel' hidden><form id='accountForm'>
<input id='accountEmail' type='email'><input id='accountPassword' type='password'>
<button id='accountSubmit' type='submit'>Entrar</button><button id='accountModeButton' type='button'></button>
<button id='accountResetPassword' type='button'></button></form></section>
<section id='accountEmailVerification' hidden aria-labelledby='accountVerificationHeading'>
<h2 id='accountVerificationHeading'>Confirmar correo</h2>
<button id='accountSendVerification'>Enviar verificación</button>
<button id='accountCheckVerification'>Ya lo he verificado</button>
<p id='accountVerificationHint'></p></section>
<section id='accountProfile' hidden>
<strong id='accountPlayerEmail'></strong>
<strong id='accountLevel'></strong><strong id='accountXp'></strong><strong id='accountAccess'></strong>
</section>
<button id='accountRefresh' hidden>Actualizar perfil</button><button id='accountLogout' hidden>Salir</button>
</section>
</body></html>"""
MOCK = r"""
let paused=false;
function clearInput(){} function resetFrameClock(){} function setTab(x){paused=false;}
const FaultBoundary={active:()=>false};
window.FRUTIDRY_ACCOUNT_CONFIG={enabled:true,allowRegistration:false,apiBaseUrl:'https://api.example.test',
 firebase:{apiKey:'public-test',authDomain:'frutidry-21bb8.firebaseapp.com',projectId:'frutidry-21bb8',appId:'1:123:web:abc'}};
window.__testAuth={sent:0,reloaded:0,tokenForce:[],verifyNext:false,persistence:null};
const user={uid:'user-123',email:'test@example.test',emailVerified:false,
 async getIdToken(force){window.__testAuth.tokenForce.push(force);return 'valid-token';}};
window.__testAuth.user=user;
window.fetch=async()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>({account:{
 uid:'user-123', accountLevel:1, xp:0,nextLevelXp:250,progressionVersion:'draft-1',minimumTournamentLevel:11,
 meetsLevelRequirement:false,tournamentAccessEnabled:false,cashPrizesEnabled:false,status:'PREPARATION'}})});
window.__mockImport=async function(path){
 if(path.includes('firebase-app.js'))return {initializeApp:()=>({})};
 if(path.includes('firebase-auth.js'))return {
  browserSessionPersistence:'session',getAuth:()=>({}),setPersistence:async(a,p)=>{window.__testAuth.persistence=p},
  onAuthStateChanged:(a,cb)=>{window.__testAuth.onAuth=cb;Promise.resolve().then(()=>cb(user));},
  sendEmailVerification:async()=>{window.__testAuth.sent++;},
  reload:async()=>{window.__testAuth.reloaded++;if(window.__testAuth.verifyNext)user.emailVerified=true;},
  signOut:async()=>{window.__testAuth.onAuth(null);}
 };
 throw Error('unexpected module');
};
"""

def main():
    ui=(ROOT/'js/account-ui.js').read_text('utf-8')
    assert 'import(' in ui, 'Expected real dynamic Firebase import must be present'
    ui=ui.replace('import(', 'window.__mockImport(')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--no-sandbox'],executable_path=os.environ.get('FRUTIDRY_CHROMIUM') or None)
        try:
            for w,h in [(320,640),(390,844),(1366,768)]:
                ctx=browser.new_context(viewport={'width':w,'height':h})
                page=ctx.new_page()
                errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.set_content(HTML)
                page.add_script_tag(content=MOCK)
                page.add_script_tag(content=(ROOT/'js/account-client.js').read_text('utf-8'))
                page.add_script_tag(content=(ROOT/'js/account-verification.js').read_text('utf-8'))
                page.add_script_tag(content=(ROOT/'js/account-session.js').read_text('utf-8'))
                page.add_script_tag(content=ui)
                page.locator('#btnAccount').click()
                page.wait_for_function('document.getElementById("accountEmailVerification").hidden===false')
                assert page.locator('#accountEmailVerification').is_visible()
                assert page.locator('#accountProfile').is_visible()
                assert page.evaluate('window.__testAuth.sent')==0
                assert page.evaluate('window.__testAuth.persistence')=='session'
                page.locator('#accountSendVerification').click()
                page.wait_for_function('window.__testAuth.sent===1')
                page.locator('#accountSendVerification').click()  # 60-second local cooldown
                assert page.evaluate('window.__testAuth.sent')==1
                page.evaluate('window.__testAuth.verifyNext=true')
                page.locator('#accountCheckVerification').click()
                page.wait_for_function('document.getElementById("accountEmailVerification").hidden===true')
                assert page.evaluate('window.__testAuth.reloaded')==1
                assert True in page.evaluate('window.__testAuth.tokenForce')
                assert page.locator('#accountProfile').is_visible()
                page.locator('#accountLogout').click()
                page.wait_for_function('document.getElementById("accountProfile").hidden===true')
                assert page.locator('#accountEmailVerification').is_hidden()
                assert not errors,(w,h,errors)
                print('OK V49',w,h,'email, resend, refresh, token, logout, offline')
                ctx.close()
        finally:browser.close()
if __name__=='__main__': main()
