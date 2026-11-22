import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePayPalPayout,classifyPayPalItemStatus,publicPayoutOverview,PAYOUTS_LIVE_ENABLED} from '../server/paypal-payouts.mjs';

const profile=()=>({accountLevel:11,ageVerified:true,ageYears:25,countryCode:'ES',suspended:false,acceptedRulesVersion:1});
const edition=()=>({id:'2026-W48',status:'REVIEW',prizePoolCents:10001,
  approvedByOperator:true,legalApproved:true,fundingConfirmed:true,rulesPublished:true,
  serverValidatorReady:true,identityProviderReady:true,payoutProviderReady:true,
  leaderboardFrozen:true,winnersReviewed:true,payoutAuthorized:true,payPalApprovalConfirmed:true,
  legalReviewReference:'LEGAL-2026-48'});
const winners=()=>[1,2,3].map(position=>({position,userId:`user_${position}`,payoutEmail:`winner${position}@example.org`,payoutEmailVerified:true,reviewStatus:'APPROVED',profile:profile()}));

test('V38 no tiene habilitadas transferencias reales',()=>{ assert.equal(PAYOUTS_LIVE_ENABLED,false); });
test('Construye exactamente tres premios EUR sin perdida de centimos',()=>{
  const draft=preparePayPalPayout(edition(),winners());
  assert.equal(draft.mode,'DRAFT_NOT_SENT');
  assert.deepEqual(draft.payoutAmountsCents,[5001,3000,2000]);
  assert.equal(draft.request.items.length,3);
  assert.deepEqual(draft.request.items.map(x=>x.amount.value),['50.01','30.00','20.00']);
  assert.equal(draft.request.items.reduce((s,x)=>s+Number(x.amount.value)*100,0),10001);
  assert.ok(draft.request.items.every(x=>x.purpose==='PRIZES'&&x.recipient_type==='EMAIL'));
});
test('Determinismo: orden de entrada no cambia la instantanea ni los IDs',()=>{
  const a=preparePayPalPayout(edition(),winners());
  const b=preparePayPalPayout(edition(),winners().reverse());
  assert.deepEqual(a,b);
  assert.match(a.senderBatchId,/^FDB-[a-f0-9]{40}$/);
  assert.equal(new Set(a.request.items.map(x=>x.sender_item_id)).size,3);
  const other=preparePayPalPayout({...edition(),id:'2026-W49'},winners());
  assert.notEqual(a.senderBatchId,other.senderBatchId);
  assert.notEqual(a.snapshotHash,other.snapshotHash);
});
test('Seguridad: aborta si falta una sola autorizacion o la edicion no esta cerrada',()=>{
  const base=edition();
  for(const field of ['approvedByOperator','legalApproved','fundingConfirmed','rulesPublished','serverValidatorReady','identityProviderReady','payoutProviderReady','leaderboardFrozen','winnersReviewed','payoutAuthorized','payPalApprovalConfirmed']) {
    assert.throws(()=>preparePayPalPayout({...base,[field]:false},winners()),/PAYOUT_NOT_READY/,field);
  }
  assert.throws(()=>preparePayPalPayout({...base,status:'OPEN'},winners()),/PAYOUT_NOT_READY/);
  assert.throws(()=>preparePayPalPayout({...base,legalReviewReference:''},winners()),/PAYOUT_NOT_READY/);
});
test('Rechaza menores, nivel <=10, suspendidos y jugadores fuera de Espana',()=>{
  for(const change of [{accountLevel:10},{ageVerified:false},{ageYears:17},{countryCode:'FR'},{suspended:true}]){
    const list=winners();list[0].profile={...profile(),...change};
    assert.throws(()=>preparePayPalPayout(edition(),list),/PAYOUT_NOT_READY/);
  }
});
test('Rechaza cuentas o correos duplicados y correo sin validar',()=>{
  const sameUser=winners();sameUser[2].userId=sameUser[0].userId;
  assert.throws(()=>preparePayPalPayout(edition(),sameUser),/repetidos/);
  const sameEmail=winners();sameEmail[1].payoutEmail=sameEmail[0].payoutEmail.toUpperCase();
  assert.throws(()=>preparePayPalPayout(edition(),sameEmail),/repetidos/);
  for(const bad of ['not-an-email','a@b','a..b@example.com','á@example.org','a@-evil.org', 'user@example.org\nBcc:bad']){
    const list=winners();list[2].payoutEmail=bad;
    assert.throws(()=>preparePayPalPayout(edition(),list),/PAYOUT_NOT_READY/,bad);
  }
  const unverified=winners();unverified[0].payoutEmailVerified=false;
  assert.throws(()=>preparePayPalPayout(edition(),unverified),/PAYOUT_NOT_READY/);
});
test('Rechaza ganadores incompletos, premio 0 y cantidades inapropiadas',()=>{
  assert.throws(()=>preparePayPalPayout(edition(),winners().slice(0,2)),/tres premiados/);
  assert.throws(()=>preparePayPalPayout({...edition(),prizePoolCents:0},winners()),/PAYOUT_NOT_READY/);
  assert.throws(()=>preparePayPalPayout({...edition(),prizePoolCents:100000001},winners()),/PAYOUT_NOT_READY/);
  const badRank=winners();badRank[0].position=2;
  assert.throws(()=>preparePayPalPayout(edition(),badRank),/PAYOUT_NOT_READY/);
});
test('Solo SUCCESS de un ITEM equivale a pagado; no se infiere por lote',()=>{
  assert.equal(classifyPayPalItemStatus('SUCCESS'),'PAID');
  for(const status of ['PENDING','UNCLAIMED','ONHOLD'])assert.equal(classifyPayPalItemStatus(status),'PROCESSING');
  for(const status of ['FAILED','RETURNED','BLOCKED','REFUNDED','REVERSED'])assert.equal(classifyPayPalItemStatus(status),'REVIEW_REQUIRED');
  assert.throws(()=>classifyPayPalItemStatus('BATCH_SUCCESS'),RangeError);
  assert.throws(()=>classifyPayPalItemStatus('SUCCEEDED'),RangeError);
});
test('La vista publica no contiene emails ni IDs de PayPal',()=>{
  const draft=preparePayPalPayout(edition(),winners());
  const view=publicPayoutOverview(draft);
  const raw=JSON.stringify(view);
  assert.equal(view.status,'NOT_ACTIVE');
  assert.equal(view.positions.length,3);
  assert.ok(!raw.includes('winner1')&&!raw.includes('FDB-')&&!raw.includes('sender_'));
});
