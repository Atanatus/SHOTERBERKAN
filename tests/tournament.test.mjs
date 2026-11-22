import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibility,ranking,allocatePrizeCents,canOpenCashEdition} from '../server/tournament-policy.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {TournamentCalendar}=require('../js/tournament.js');
test('viernes 00:00, lunes 00:00, horario de invierno',()=>{
  const x=TournamentCalendar.nextEdition(new Date('2026-11-24T10:00:00Z'));
  assert.equal(x.friday.toISOString(),'2026-11-26T23:00:00.000Z');
  assert.equal(x.closes.toISOString(),'2026-11-29T23:00:00.000Z');
  assert.equal(x.payoutDay,'2026-11-30');
  assert.equal(x.enabled,false);
});
test('Cambio horario primavera: ventana de 71 horas reales',()=>{
  const x=TournamentCalendar.nextEdition(new Date('2026-03-24T10:00:00Z'));
  assert.equal(x.friday.toISOString(),'2026-03-26T23:00:00.000Z');
  assert.equal(x.closes.toISOString(),'2026-03-29T22:00:00.000Z');
  assert.equal((x.closes-x.friday)/3600000,71);
});
test('Cambio horario otoño: ventana de 73 horas reales',()=>{
  const x=TournamentCalendar.nextEdition(new Date('2026-10-20T10:00:00Z'));
  assert.equal(x.friday.toISOString(),'2026-10-22T22:00:00.000Z');
  assert.equal(x.closes.toISOString(),'2026-10-25T23:00:00.000Z');
  assert.equal((x.closes-x.friday)/3600000,73);
});
test('No sugiere como próximo un viernes ya iniciado',()=>{
  const x=TournamentCalendar.nextEdition(new Date('2026-11-27T09:00:00Z'));
  assert.equal(x.payoutDay,'2026-12-07');
});
test('Acceso: nivel 11, adulto, España, bases; nunca client-side',()=>{
  const valid={accountLevel:11,ageVerified:true,ageYears:18,countryCode:'ES',acceptedRulesVersion:1,suspended:false};
  assert.equal(eligibility(valid).ok,true);
  assert.equal(eligibility({...valid,accountLevel:10}).ok,false);
  assert.equal(eligibility({...valid,ageVerified:false}).ok,false);
  assert.equal(eligibility({...valid,countryCode:'FR'}).ok,false);
  assert.equal(eligibility({...valid,acceptedRulesVersion:0}).ok,false);
});
test('Ranking: un mejor resultado verificado por persona y desempate temporal',()=>{
  const runs=[
    {userId:'B',status:'verified',score:1200,verifiedAt:'2026-11-28T10:00:00Z'},
    {userId:'A',status:'verified',score:1200,verifiedAt:'2026-11-28T09:00:00Z'},
    {userId:'A',status:'verified',score:1000,verifiedAt:'2026-11-28T07:00:00Z'},
    {userId:'Z',status:'pending',score:99999,verifiedAt:'2026-11-28T06:00:00Z'},
    {userId:'C',status:'verified',score:400,verifiedAt:'2026-11-28T12:00:00Z'}
  ];
  assert.deepEqual(ranking(runs).map(x=>x.userId),['A','B','C']);
  assert.deepEqual(ranking(runs).map(x=>x.position),[1,2,3]);
});
test('Prizes: cent amounts and conservation',()=>{
  for(const value of [0,1,99,100,10003]){
    const amounts=allocatePrizeCents(value);
    assert.equal(amounts.reduce((a,b)=>a+b,0),value);
    assert.ok(amounts.every(Number.isInteger));
  }
});
test('Nunca habilitar dinero sin aprobación y fondos anteriores',()=>{
  const ready={approvedByOperator:true,legalApproved:true,fundingConfirmed:true,
    prizePoolCents:5000,rulesPublished:true,serverValidatorReady:true,
    identityProviderReady:true,payoutProviderReady:true};
  assert.equal(canOpenCashEdition(ready),true);
  for(const key of Object.keys(ready))assert.equal(canOpenCashEdition({...ready,[key]:null}),false);
});
