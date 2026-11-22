import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateAccountConfig,parsePrivateAccount,fetchPrivateAccount,friendlyAccountError,AccountApiError}=require('../js/account-client.js');

const SAMPLE = Object.freeze({
  uid:'fire_uid_123', accountLevel:1, xp:0, nextLevelXp:250,
  progressionVersion:'draft-1', minimumTournamentLevel:11,
  meetsLevelRequirement:false,tournamentAccessEnabled:false,cashPrizesEnabled:false,
  status:'PREPARATION'
});
const CONFIG = {enabled:true,allowRegistration:false,apiBaseUrl:'https://api.example.test',firebase:{
  apiKey:'test-public-key', authDomain:'frutidry-test.firebaseapp.com', projectId:'frutidry-test',appId:'1:123:web:abc'
}};
const response = (body,status=200) => ({ok:status>=200&&status<300,status,
  headers:{get:()=>null},json:async()=>body});

test('Una configuración ausente o desactivada no habilita Firebase',()=>{
  assert.equal(validateAccountConfig(null).enabled,false);
  assert.equal(validateAccountConfig({enabled:false,apiBaseUrl:'https://invalid'}).enabled,false);
});
test('Configuración HTTPS válida, sin inscripción automática',()=>{
  const config=validateAccountConfig(CONFIG);
  assert.equal(config.apiBaseUrl,'https://api.example.test');
  assert.equal(config.allowRegistration,false);
  assert.ok(Object.isFrozen(config));
});
test('Registro requiere activación expresa',()=>{
  assert.equal(validateAccountConfig({...CONFIG,allowRegistration:true}).allowRegistration,true);
});
for(const url of ['http://api.example.test','https://api.example.test/score','https://a:b@api.example.test',
  'https://api.example.test/?token=x','javascript:alert(1)','https://api.example.test/#fragment']){
  test(`Rechazo de API no segura: ${url}`,()=>assert.throws(()=>validateAccountConfig({...CONFIG,apiBaseUrl:url})));
}
test('Firebase de otro proyecto se rechaza',()=>{
  assert.throws(()=>validateAccountConfig({...CONFIG,firebase:{...CONFIG.firebase,authDomain:'other.firebaseapp.com'}}));
});
test('Perfil válido es solo de lectura y conserva false de servidor',()=>{
  const a=parsePrivateAccount({account:SAMPLE});
  assert.equal(a.accountLevel,1);
  assert.equal(a.cashPrizesEnabled,false);
  assert.ok(Object.isFrozen(a));
  assert.throws(()=>{a.xp=500000});
});
test('Nivel 11 no activa torneos por decisión del navegador',()=>{
  const a=parsePrivateAccount({account:{...SAMPLE,accountLevel:11,xp:13750,nextLevelXp:16500,meetsLevelRequirement:true}});
  assert.equal(a.tournamentAccessEnabled,false);
});
for(const patch of [{xp:-1},{xp:'999'},{uid:'<script>'},{accountLevel:101},
  {nextLevelXp:-1},{cashPrizesEnabled:'false'},{status:null}]){
  test(`Rechazo de respuesta alterada: ${JSON.stringify(patch)}`,()=>{
    assert.throws(()=>parsePrivateAccount({account:{...SAMPLE,...patch}}));
  });
}
test('ID token solo se entrega en Authorization al endpoint esperado',async()=>{
  let observed;
  const account=await fetchPrivateAccount({apiBaseUrl:'https://api.example.test',token:'a.b.c',
    fetchImpl:async(...args)=>{observed=args;return response({account:SAMPLE})}});
  assert.equal(observed[0],'https://api.example.test/api/v1/me');
  assert.equal(observed[1].method,'GET');
  assert.equal(observed[1].credentials,'omit');
  assert.equal(observed[1].cache,'no-store');
  assert.equal(observed[1].redirect,'error');
  assert.equal(observed[1].headers.Authorization,'Bearer a.b.c');
  assert.equal(account.uid,SAMPLE.uid);
});
test('Tokens vacíos, inválidos o con whitespace se bloquean antes del fetch',async()=>{
  let calls=0;
  for(const token of ['', 'abc def', '\n', 'x'.repeat(8193)]){
    await assert.rejects(fetchPrivateAccount({apiBaseUrl:'https://api.example.test',token,
      fetchImpl:async()=>{calls++;return response({account:SAMPLE})}}));
  }
  assert.equal(calls,0);
});
test('401 no se interpreta como perfil ni como acceso al torneo',async()=>{
  await assert.rejects(fetchPrivateAccount({apiBaseUrl:'https://api.example.test',token:'a',
    fetchImpl:async()=>response({error:'INVALID_OR_REVOKED_TOKEN'},401)}),
  e=>e instanceof AccountApiError&&e.status===401&&e.code==='INVALID_OR_REVOKED_TOKEN');
});
test('No se reflejan trazas ni secretos de errores externos',()=>{
  const msg=friendlyAccountError({code:'auth/invalid-credential',message:'secret admin key'});
  assert.ok(!msg.includes('secret'));
});
test('La API no permite respuestas sobredimensionadas con cabecera',async()=>{
  await assert.rejects(fetchPrivateAccount({apiBaseUrl:'https://api.example.test',token:'a',
    fetchImpl:async()=>({...response({account:SAMPLE}),headers:{get:()=>String(9000)}})}));
});
