/* FrutiDry V41 · classic Vanilla script for offline file:// compatibility. */
const FrutiDryAccountClient = (() => {
'use strict';
/* FrutiDry V41 · Pure contract for private account reads. No XP writes. */
const ID_RX = /^[A-Za-z0-9:_-]{1,128}$/;
function exactHttpsOrigin(value) {
  if (typeof value !== 'string' || value.length > 240) throw new TypeError('API URL inválida');
  let url;
  try { url = new URL(value); } catch { throw new TypeError('API URL inválida'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || value !== url.origin && value !== url.origin + '/') {
    throw new TypeError('La API debe ser un origen HTTPS sin rutas');
  }
  return url.origin;
}
function validateAccountConfig(value) {
  if (!value || value.enabled !== true) return Object.freeze({enabled: false});
  const firebase = value.firebase;
  if (!firebase || typeof firebase !== 'object') throw new TypeError('Configuración Firebase incompleta');
  for (const field of ['apiKey','authDomain','projectId','appId']) {
    if (typeof firebase[field] !== 'string' || firebase[field].length < 3 || firebase[field].length > 240)
      throw new TypeError('Configuración Firebase incompleta');
  }
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(firebase.projectId) ||
      !/^[a-z0-9.-]+\.firebaseapp\.com$/.test(firebase.authDomain) ||
      !firebase.authDomain.startsWith(firebase.projectId+'.')) {
    throw new TypeError('Proyecto Firebase incoherente');
  }
  return Object.freeze({
    enabled: true,
    allowRegistration: value.allowRegistration === true,
    apiBaseUrl: exactHttpsOrigin(value.apiBaseUrl),
    firebase: Object.freeze({apiKey:firebase.apiKey,authDomain:firebase.authDomain,
      projectId:firebase.projectId,appId:firebase.appId})
  });
}
function int(value,min,max) {return Number.isSafeInteger(value) && value >= min && value <= max;}
function parsePrivateAccount(payload) {
  const a = payload?.account;
  if (!a || typeof a !== 'object' || !ID_RX.test(a.uid) ||
      !int(a.accountLevel,1,100) || !int(a.xp,0,Number.MAX_SAFE_INTEGER) ||
      (a.nextLevelXp !== null && !int(a.nextLevelXp,a.xp,Number.MAX_SAFE_INTEGER)) ||
      !int(a.minimumTournamentLevel,1,100) ||
      typeof a.progressionVersion !== 'string' || a.progressionVersion.length > 40 ||
      typeof a.meetsLevelRequirement !== 'boolean' ||
      typeof a.tournamentAccessEnabled !== 'boolean' ||
      typeof a.cashPrizesEnabled !== 'boolean' ||
      typeof a.status !== 'string') throw new TypeError('Respuesta de cuenta inválida');
  // Older API deployments can still authenticate while account progress rolls out independently.
  const progress = a.arcadeProgress;
  if (progress !== undefined && (!progress || !int(progress.bestScore,0,Number.MAX_SAFE_INTEGER) ||
      !int(progress.coresDetonated,0,Number.MAX_SAFE_INTEGER) || !Array.isArray(progress.unlockedRelics) ||
      progress.unlockedRelics.length > 12 || !progress.unlockedRelics.every(id=>int(id,1,12)) ||
      new Set(progress.unlockedRelics).size !== progress.unlockedRelics.length)) {
    throw new TypeError('Progreso de cuenta inválido');
  }
  // Never convert a server response into an eligibility claim from client-side XP.
  return Object.freeze({uid:a.uid,accountLevel:a.accountLevel,xp:a.xp,
    nextLevelXp:a.nextLevelXp,minimumTournamentLevel:a.minimumTournamentLevel,
    progressionVersion:a.progressionVersion,meetsLevelRequirement:a.meetsLevelRequirement,
    tournamentAccessEnabled:a.tournamentAccessEnabled,cashPrizesEnabled:a.cashPrizesEnabled,
    status:a.status,...(a.officialArcadeEnabled===true ? {officialArcadeEnabled:true} : {}),...(progress === undefined ? {} : {arcadeProgress:Object.freeze({
      bestScore:progress.bestScore,coresDetonated:progress.coresDetonated,
      unlockedRelics:Object.freeze([...progress.unlockedRelics])
    })})});
}
class AccountApiError extends Error {
  constructor(status, code) { super('Account API unavailable or rejected request');this.name='AccountApiError';this.status=status;this.code=code; }
}
async function fetchPrivateAccount({apiBaseUrl, token, fetchImpl=fetch, signal}={}) {
  const origin=exactHttpsOrigin(apiBaseUrl);
  if (typeof token !== 'string' || !token.length || token.length > 8192 || /\s/.test(token))
    throw new TypeError('Firebase ID token inválido');
  const response=await fetchImpl(`${origin}/api/v1/me`, {
    method:'GET',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal
  });
  if (!response.ok) {
    let code='UNKNOWN';
    try { const data=await response.json(); if (typeof data?.error==='string' && /^[A-Z_]{2,48}$/.test(data.error)) code=data.error; } catch {}
    throw new AccountApiError(response.status,code);
  }
  // Avoid unbounded JSON responses from a misconfigured upstream service.
  const size=response.headers?.get?.('content-length');
  if (size && Number(size)>8192) throw new TypeError('Respuesta de cuenta demasiado grande');
  return parsePrivateAccount(await response.json());
}
async function postOfficialRun({apiBaseUrl, token, runId, diagnostic, signal}) {
  const origin = exactHttpsOrigin(apiBaseUrl);
  if (runId !== undefined && !/^[0-9a-f-]{36}$/.test(runId)) throw new TypeError('Partida inválida');
  const path = runId === undefined ? '/api/v1/runs' : '/api/v1/runs/' + runId + '/diagnostic';
  const response = await fetch(origin + path, {
    method:'POST',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',signal,
    headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json'},
    body:JSON.stringify(runId === undefined ? {} : {diagnostic})
  });
  const result = await response.json();
  if (!response.ok) throw new AccountApiError(response.status,result.error);
  return result;
}
function friendlyAccountError(error) {
  if (error instanceof AccountApiError) {
    if (error.status===401) return 'Sesión caducada o revocada. Vuelve a acceder.';
    if (error.status===403 && error.code==='EMAIL_VERIFICATION_REQUIRED') return 'Verifica el correo electrónico antes de competir.';
    if (error.status===403) return 'Este origen no está autorizado en el servidor.';
    if (error.status===503) return 'El servidor de cuentas no está disponible. El juego sigue operativo.';
    return 'No se pudo consultar la cuenta. Inténtalo de nuevo.';
  }
  if (error?.name==='AbortError') return 'Tiempo de espera agotado. Inténtalo de nuevo.';
  if (error?.code?.startsWith?.('auth/')) {
    switch(error.code) {
      case 'auth/invalid-email': return 'Introduce un correo válido.';
      case 'auth/weak-password': return 'La contraseña no cumple los requisitos.';
      case 'auth/email-already-in-use': return 'No se ha podido crear la cuenta con ese correo.';
      case 'auth/too-many-requests': return 'Demasiados intentos. Prueba más tarde.';
      case 'auth/network-request-failed': return 'No hay conexión con Firebase.';
      default: return 'No se ha podido acceder. Comprueba tus datos o inténtalo más tarde.';
    }
  }
  return 'No se pudo conectar con las cuentas. El juego continúa disponible.';
}

return Object.freeze({validateAccountConfig,parsePrivateAccount,fetchPrivateAccount,postOfficialRun,AccountApiError,friendlyAccountError});
})();
if(typeof module!=='undefined' && module.exports) module.exports=FrutiDryAccountClient;
