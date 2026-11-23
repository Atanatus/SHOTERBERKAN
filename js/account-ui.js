/* FrutiDry V41 · classic Vanilla script; Firebase loads only on explicit opt-in. */
(()=>{
'use strict';
/* FrutiDry V41 · Optional Firebase client, no impact on gameplay or local saves.
   External SDK loads ONLY when explicit public configuration enables accounts. */
const {validateAccountConfig,fetchPrivateAccount,friendlyAccountError}=FrutiDryAccountClient;
const {createFlow,verified}=FrutiDryEmailVerification;
const {createSession}=FrutiDryAccountSession;

const ids = ['btnAccount','accountModal','accountClose','accountStatus','accountUnavailable',
  'accountAuthPanel','accountForm','accountEmail','accountPassword','accountSubmit',
  'accountModeButton','accountResetPassword','accountProfile','accountPlayerEmail',
  'accountLevel','accountXp','accountAccess','accountRefresh','accountLogout',
  'accountEmailVerification','accountSendVerification','accountCheckVerification','accountVerificationHint'];
const el = Object.fromEntries(ids.map(id => [id,document.getElementById(id)]));
let config = {enabled:false}, sdk=null, auth=null, authUser=null, emailFlow=null, profileSession=null;
let opened=false, busy=false, signupMode=false;
function text(id,value){el[id].textContent=String(value);}
function setMessage(message,kind='info') {
  el.accountStatus.textContent=message;
  el.accountStatus.dataset.kind=kind;
}
function setBusy(value){
  busy=value;
  for(const id of ['accountSubmit','accountModeButton','accountResetPassword','accountRefresh','accountLogout',
    'accountSendVerification','accountCheckVerification'])
    el[id].disabled=value;
}
function displayEmailVerification(user) {
  const pending=Boolean(user) && !verified(user);
  el.accountEmailVerification.hidden=!pending;
  if(!pending) return;
  const ms=emailFlow?.retryAfterMs(user) || 0;
  el.accountSendVerification.disabled=busy; // send() enforces cooldown without a stuck timer.
  el.accountCheckVerification.disabled=busy;
  text('accountVerificationHint', ms>0
    ? 'Mensaje enviado. Podrás solicitar otro dentro de '+Math.ceil(ms/1000)+' segundos. Comprueba también spam.'
    : 'Envía el mensaje y abre el enlace desde tu correo. Después pulsa «YA LO HE VERIFICADO».');
}
function cancelProfileRequest(){ profileSession?.cancel(); }
function setPublicIdentity(user) {
  el.accountAuthPanel.hidden=!!user;
  el.accountProfile.hidden=true;
  el.accountRefresh.hidden=!user;
  el.accountLogout.hidden=!user;
  text('accountPlayerEmail',user?.email||'Correo no disponible');
  if(!user) el.accountPassword.value='';
  displayEmailVerification(user);
}
function showAccount(account){
  text('accountLevel',account.accountLevel);
  text('accountXp',account.nextLevelXp===null ? account.xp.toLocaleString('es-ES')+' XP (máximo)' :
    account.xp.toLocaleString('es-ES')+' / '+account.nextLevelXp.toLocaleString('es-ES')+' XP');
  text('accountAccess', account.tournamentAccessEnabled ? 'Según servidor' : 'Cerrado');
  el.accountProfile.hidden=false;
  setMessage(!verified(authUser) ? 'Perfil cargado. Correo pendiente de verificar: competición bloqueada.' :
    account.tournamentAccessEnabled ? 'Perfil consultado. El torneo necesita su convocatoria oficial.' :
    'Identidad y correo verificados. Los torneos con dinero siguen desactivados.','ok');
}
async function refreshProfile(){
  if(!authUser||!config.enabled||!auth||!profileSession)return;
  const owner=authUser;
  setMessage('Consultando nivel permanente en el servidor…');
  el.accountProfile.hidden=true;
  const result=await profileSession.load(config.apiBaseUrl);
  if(result.status==='STALE' || authUser !== owner)return;
  if(result.status==='PROFILE')showAccount(result.account);
  else if(result.status==='SESSION_INVALID'){
    el.accountProfile.hidden=true;
    setMessage('La sesión fue rechazada por el servidor. Accede de nuevo.','error');
  }else if(result.status==='ERROR')setMessage(friendlyAccountError(result.error),'error');
}
function onFirebaseUser(user){
  profileSession?.setUser(user);
  authUser=user;
  setPublicIdentity(user);
  if(user){
    setMessage('Sesión de Firebase verificada; cargando perfil…');
    void refreshProfile();
  } else {
    setMessage('Accede con tu cuenta Firebase. La XP solo procede del servidor.');
  }
}
async function ensureFirebase(){
  if(auth)return;
  if(!config.enabled)return;
  setMessage('Cargando autenticación segura…');
  try{
    const [appApi, authApi] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js')
    ]);
    const app=appApi.initializeApp(config.firebase,'frutidry-web');
    const instance=authApi.getAuth(app);
    await authApi.setPersistence(instance,authApi.browserSessionPersistence);
    sdk=authApi;auth=instance;
    profileSession=createSession({
      readProfile:fetchPrivateAccount,
      signOut:async previous=>{
        // The callback cannot sign out a different player after a UID switch.
        if(authUser?.uid!==previous.uid)return;
        if(auth.currentUser && auth.currentUser.uid!==previous.uid)return;
        await authApi.signOut(auth);
      }
    });
    auth.languageCode='es';
    emailFlow=createFlow({sendEmailVerification:authApi.sendEmailVerification,reload:authApi.reload});
    authApi.onAuthStateChanged(instance,onFirebaseUser,error=>setMessage(friendlyAccountError(error),'error'));
    el.accountUnavailable.hidden=true;
    el.accountAuthPanel.hidden=false;
    el.accountModeButton.hidden=!config.allowRegistration;
  }catch(error){
    setMessage('No se pudo iniciar Firebase. El juego sigue disponible.','error');
    el.accountUnavailable.hidden=false;
    el.accountAuthPanel.hidden=true;
  }
}
function closeAccount(){
  if(!opened)return;
  opened=false;
  el.accountModal.classList.remove('open');
  el.accountModal.setAttribute('aria-hidden','true');
  el.btnAccount.classList.remove('active');
  el.accountPassword.value='';
}
function openAccount(){
  if(typeof FaultBoundary!=='undefined'&&FaultBoundary.active())return;
  if(opened)return;
  // Reuse the game's exact pause/input/clock policy; no simulation while this modal is open.
  if(typeof clearInput==='function')clearInput();
  if(typeof resetFrameClock==='function')resetFrameClock();
  if(typeof paused!=='undefined')paused=true;
  for(const id of ['vaultModal','tournamentModal']){
    const modal=document.getElementById(id);
    modal.classList.remove('open');modal.setAttribute('aria-hidden','true');
  }
  for(const id of ['btnPlay','btnVault','btnTournament'])document.getElementById(id).classList.remove('active');
  el.btnAccount.classList.add('active');
  el.accountModal.classList.add('open');
  el.accountModal.setAttribute('aria-hidden','false');
  opened=true;
  el.accountClose.focus();
  if(config.enabled) void ensureFirebase();
}
function requestMode(){
  if(!config.allowRegistration)return;
  signupMode=!signupMode;
  text('accountSubmit', signupMode?'CREAR CUENTA':'ENTRAR');
  text('accountModeButton',signupMode?'YA TENGO CUENTA':'CREAR CUENTA');
  el.accountPassword.autocomplete=signupMode?'new-password':'current-password';
  el.accountPassword.value='';
}
el.btnAccount.addEventListener('click',openAccount);
el.accountClose.addEventListener('click',()=>{closeAccount();if(typeof setTab==='function')setTab('play');});
// Existing navigation retains its own handlers; this capture listener only hides our panel.
document.querySelector('header nav').addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(button && button!==el.btnAccount)closeAccount();
},true);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&opened){event.preventDefault();closeAccount();if(typeof setTab==='function')setTab('play');}
});
el.accountModeButton.addEventListener('click',requestMode);
el.accountForm.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!sdk||!auth)return;
  const email=el.accountEmail.value.trim();const password=el.accountPassword.value;
  if(!email||!password)return;
  setBusy(true);
  setMessage(signupMode?'Creando cuenta…':'Comprobando credenciales…');
  try {
    if(signupMode && config.allowRegistration)await sdk.createUserWithEmailAndPassword(auth,email,password);
    else await sdk.signInWithEmailAndPassword(auth,email,password);
    el.accountPassword.value='';
  }catch(error){setMessage(friendlyAccountError(error),'error');}
  finally{setBusy(false);}
});
el.accountResetPassword.addEventListener('click',async()=>{
  if(busy||!sdk||!auth)return;
  const email=el.accountEmail.value.trim();
  if(!email){setMessage('Escribe tu correo para solicitar recuperación.','error');return;}
  setBusy(true);
  try{await sdk.sendPasswordResetEmail(auth,email);
    setMessage('Si la dirección está registrada y habilitada, recibirás instrucciones.','ok');
  }catch(error){setMessage(friendlyAccountError(error),'error');}
  finally{setBusy(false);}
});
el.accountSendVerification.addEventListener('click',async()=>{
  if(busy||!authUser||!emailFlow||verified(authUser))return;
  const uid=authUser.uid;
  setBusy(true);
  try {
    const result=await emailFlow.send(authUser);
    if(authUser?.uid!==uid)return;
    setMessage(result.status==='COOLDOWN'
      ? 'Espera antes de solicitar otro mensaje de verificación.'
      : 'Mensaje de verificación solicitado. Revisa el correo y vuelve a comprobar tu cuenta.','ok');
  } catch(error) {
    if(authUser?.uid===uid)setMessage(friendlyAccountError(error),'error');
  } finally { setBusy(false);displayEmailVerification(authUser); }
});
el.accountCheckVerification.addEventListener('click',async()=>{
  if(busy||!authUser||!emailFlow)return;
  const uid=authUser.uid;
  setBusy(true);
  try {
    const result=await emailFlow.refresh(authUser);
    if(authUser?.uid!==uid)return;
    displayEmailVerification(authUser);
    if(result.verified){
      setMessage('Correo confirmado en Firebase. Actualizando el perfil…','ok');
      void refreshProfile();
    }else setMessage('Firebase todavía no ha confirmado este correo. Comprueba el enlace recibido.');
  }catch(error){if(authUser?.uid===uid)setMessage(friendlyAccountError(error),'error');}
  finally{setBusy(false);displayEmailVerification(authUser);}
});
el.accountRefresh.addEventListener('click',()=>{if(!busy)void refreshProfile();});
el.accountLogout.addEventListener('click',async()=>{
  if(busy||!sdk||!auth)return;
  setBusy(true);cancelProfileRequest();
  try{await sdk.signOut(auth);el.accountPassword.value='';}
  catch(error){setMessage(friendlyAccountError(error),'error');}
  finally{setBusy(false);}
});
try {
  config=validateAccountConfig(window.FRUTIDRY_ACCOUNT_CONFIG);
  if(config.enabled){
    el.accountUnavailable.hidden=true;
    el.accountAuthPanel.hidden=true;
    setMessage('Cuentas en beta privada. Pulsa CUENTA para iniciar Firebase.');
  } else {
    el.accountAuthPanel.hidden=true;
    el.accountUnavailable.hidden=false;
    setMessage('Registro cerrado: falta configurar la API y Firebase. El arcade funciona sin cuenta.');
  }
} catch {
  el.accountAuthPanel.hidden=true;
  el.accountUnavailable.hidden=false;
  setMessage('Configuración de cuentas inválida. No se han activado los accesos.','error');
}

})();
