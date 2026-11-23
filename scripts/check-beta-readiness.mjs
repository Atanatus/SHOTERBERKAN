// FrutiDry V50. Offline and read-only; NEVER asks for or prints credentials.
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function source(relative){return readFileSync(resolve(ROOT,relative),'utf8');}
export function inspectBetaReadiness() {
  const scope={window:{}};
  runInNewContext(source('js/account-config.js'),scope,{timeout:1000});
  const config=scope.window.FRUTIDRY_ACCOUNT_CONFIG;
  if(!config || typeof config!=='object') throw new Error('Missing public web account configuration');
  const server=source('server/account-production.mjs');
  const api=source('server/account-http.mjs');
  const html=source('index.html');
  const pkg=JSON.parse(source('server/package.json'));
  const scripts=['account-config.js','account-client.js','account-verification.js','account-session.js','account-ui.js'];
  const positions=scripts.map(name=>html.indexOf(`src="js/${name}"`));
  const requiredServerVars=['MONGODB_URI','FIREBASE_PROJECT_ID','FRUTIDRY_DB_NAME','FRUTIDRY_ALLOWED_ORIGINS'];
  const checks={
    nodeSupported:Number(process.versions.node.split('.')[0])>=22,
    serverVarsDefined:requiredServerVars.every(key=>server.includes(`requiredEnv('${key}')`)),
    firebaseAdminRevocationCheck:server.includes('verifyIdToken(token, true)'),
    noCompetitiveRunRoutesInProduction:!server.includes('runIntake:'),
    emailClaimCheckedByApi:api.includes('identity.email_verified !== true'),
    frontendScriptOrder:positions.every((n,i)=>n>=0 && (i===0 || positions[i-1]<n)),
    publicRegistrationDisabled:config.allowRegistration===false,
    noAdminKeyInPublicConfig:!source('js/account-config.js').includes('"private_key"') &&
      !source('js/account-config.js').includes('-----BEGIN PRIVATE KEY-----'),
    serverPackagesPresent:pkg.dependencies?.['firebase-admin']!==undefined && pkg.dependencies?.mongodb!==undefined
  };
  return Object.freeze({version:'V50', mode:config.enabled===true?'ACCOUNT_CLIENT_ENABLED':'ACCOUNT_CLIENT_DISABLED',
    accountApiUrlConfigured:typeof config.apiBaseUrl==='string'&&config.apiBaseUrl.startsWith('https://'),
    publicRegistrationEnabled:config.allowRegistration===true,
    checks:Object.freeze(checks), safeToContinueLocalDevelopment:Object.values(checks).every(Boolean),
    productionAuthConfirmed:false, // This tool never connects to Firebase or Render.
    xpGrantedByThisTool:0, prizesEnabled:false});
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const report=inspectBetaReadiness();
  console.log(JSON.stringify(report,null,2));
  if(!report.safeToContinueLocalDevelopment)process.exitCode=1;
}
