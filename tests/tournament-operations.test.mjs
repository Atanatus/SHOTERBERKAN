import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTournamentSchedule,upcomingFridays,createTournamentDraft,validateTournamentDraft,publicSafePreview,campaignPreview,operationsChecklist} from '../server/tournament-operations.mjs';

const scheduled=buildTournamentSchedule('2026-11-27');
test('Opening Friday at Madrid midnight converts to UTC in winter',()=>{
  assert.equal(scheduled.startsAt,'2026-11-26T23:00:00.000Z');
  assert.equal(scheduled.closesAt,'2026-11-29T23:00:00.000Z');
  assert.equal(scheduled.sunday,'2026-11-29');assert.equal(scheduled.payoutTargetDay,'2026-11-30');
});
test('DST spring: exclusive Monday boundary and expected elapsed time',()=>{
  const s=buildTournamentSchedule('2027-03-26');
  assert.equal(s.startsAt,'2027-03-25T23:00:00.000Z');
  assert.equal(s.closesAt,'2027-03-28T22:00:00.000Z');
  assert.equal((Date.parse(s.closesAt)-Date.parse(s.startsAt))/3600000,71);
});
test('DST autumn: 73 real hours with Madrid local weekend',()=>{
  const s=buildTournamentSchedule('2027-10-29');
  assert.equal(s.startsAt,'2027-10-28T22:00:00.000Z');
  assert.equal(s.closesAt,'2027-10-31T23:00:00.000Z');
  assert.equal((Date.parse(s.closesAt)-Date.parse(s.startsAt))/3600000,73);
});
test('Invalid dates and non Fridays are rejected',()=>{
  for(const friday of ['2026-11-28','2026-02-30','not-a-date','2024-11-22','2026-13-20'])assert.throws(()=>buildTournamentSchedule(friday));
});
test('Upcoming weekly windows align to Friday and remain theoretical',()=>{
  assert.deepEqual(upcomingFridays('2026-11-22',3).map(x=>x.friday),['2026-11-27','2026-12-04','2026-12-11']);
  assert.throws(()=>upcomingFridays('2026-11-22',1000));
});
test('Draft remains fully inactive and has no confirmed money by default',()=>{
  const d=createTournamentDraft({friday:'2026-11-27'});
  assert.equal(validateTournamentDraft(d),true);
  assert.equal(d.status,'DRAFT');assert.equal(d.enabled,false);assert.equal(d.prizePoolCents,null);
  assert.equal(d.eligibility.accountLevelMin,11);assert.equal(d.entryFeeCents,0);
  assert.ok(Object.values(d.gates).every(flag=>flag===false));
});
test('Cents are integers and three positions preserve exact total',()=>{
  const d=createTournamentDraft({friday:'2026-11-27',prizePoolCents:10003});
  assert.deepEqual(d.proposedPrizeCents,[5003,3000,2000]);
  assert.equal(d.proposedPrizeCents.reduce((a,b)=>a+b,0),10003);
  for(const value of [1,3,9,-1,1.3,Infinity,1e9])assert.throws(()=>createTournamentDraft({friday:'2026-11-27',prizePoolCents:value}));
});
test('Public preview cannot reveal even proposed prize amounts or sensitive gates',()=>{
  const d=createTournamentDraft({friday:'2026-11-27',prizePoolCents:10000,rulesUrl:'https://example.org/bases'});
  const preview=publicSafePreview(d);
  assert.equal(preview.enabled,false);assert.equal(preview.status,'PREPARATION');
  assert.equal(preview.prizePoolCents,null);assert.deepEqual(preview.leaderboard,[]);
  assert.ok(!('gates' in preview)&&!('rulesUrl' in preview));
});
test('Cannot activate a draft by tampering with JSON flags or dates',()=>{
  const original=createTournamentDraft({friday:'2026-11-27'});
  for(const mutation of [d=>d.enabled=true,d=>d.status='OPEN',d=>d.gates.legal=true,
    d=>d.schedule.closesAt='2026-11-30T00:00:00Z',d=>d.eligibility.accountLevelMin=1,
    d=>d.entryFeeCents=100,d=>d.proposedPrizeCents=[1,1,1]]){
    const d=structuredClone(original);mutation(d);assert.throws(()=>validateTournamentDraft(d));
  }
});
test('Provisional legal rules URL must use HTTPS',()=>{
  for(const url of ['http://example.org/bases','javascript:alert(1)','/bases','https://notvalid'])assert.throws(()=>createTournamentDraft({friday:'2026-11-27',rulesUrl:url}));
});
test('Promotion has five distinct slots and is explicitly not an active invitation',()=>{
  const d=createTournamentDraft({friday:'2026-11-27'});
  const copy=campaignPreview(d);
  for(const day of ['JUEVES','VIERNES','SÁBADO','DOMINGO','LUNES'])assert.ok(copy.includes(day));
  assert.match(copy,/NO PUBLICAR/);assert.match(copy,/SOLO SI LA API CONFIRMA OPEN/);
});
test('Operator checklist includes fiscal, legal, anti-cheat, provider and ad consent',()=>{
  const doc=operationsChecklist(createTournamentDraft({friday:'2026-11-27'}));
  for(const term of ['fiscal','PayPal','anticheat','MFA','consentimiento','pago','API'])assert.ok(doc.toLowerCase().includes(term.toLowerCase()),term);
});
