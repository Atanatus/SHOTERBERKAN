// FrutiDry V41 · public configuration only. Never put Firebase Admin secrets here.
// Registration, prizes, XP grants, online rankings and cash transactions remain closed.
window.FRUTIDRY_ACCOUNT_CONFIG = Object.freeze({
  enabled: false,
  allowRegistration: false,
  apiBaseUrl: '',  // HTTPS origin of the Render service, without a path.
  firebase: Object.freeze({
    apiKey: '',      // Firebase Web API key (public configuration; restrict its use).
    authDomain: '',
    projectId: '',
    appId: ''
  })
});
