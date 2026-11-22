// FrutiDry V38 · Pure PayPal Payouts preparation/interpretation; NO HTTP calls or transfers.
// This module is server-only: never load it from index.html or expose requests with PII.
import {createHash} from 'node:crypto';
import {allocatePrizeCents,canOpenCashEdition,eligibility} from './tournament-policy.mjs';

export const PAYOUT_PROVIDER = 'PAYPAL_PAYOUTS';
export const PAYOUT_CURRENCY = 'EUR';
export const PAYOUTS_LIVE_ENABLED = false; // V38 hard stop; no payout API integration exists.
export const MAX_PRIZE_POOL_CENTS = 100_000_000;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const LOCAL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;

function fail(message) {throw new Error(`PAYOUT_NOT_READY: ${message}`);}
function digest(value) {return createHash('sha256').update(value,'utf8').digest('hex');}
function cleanId(value,name) {
  if(typeof value!=='string'||!ID_RE.test(value)) fail(`${name} no es un identificador valido`);
  return value;
}
function canonicalEmail(value) {
  if(typeof value!=='string'||value.length<6||value.length>127||/[^\x21-\x7e]/.test(value)) fail('Correo PayPal invalido');
  const at=value.indexOf('@');
  if(at<=0||at!==value.lastIndexOf('@')) fail('Correo PayPal invalido');
  const local=value.slice(0,at),domain=value.slice(at+1);
  if(local.length>64||!LOCAL_RE.test(local)||local.startsWith('.')||local.endsWith('.')||local.includes('..')) fail('Correo PayPal invalido');
  const labels=domain.split('.');
  if(labels.length<2||labels.some(x=>x.length===0||x.length>63||!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(x)) || labels.at(-1).length<2) fail('Correo PayPal invalido');
  return `${local}@${domain.toLowerCase()}`;
}
function euros(cents) {
  if(!Number.isSafeInteger(cents)||cents<=0) fail('Importe de pago invalido');
  return `${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`;
}
function assertEdition(edition) {
  if(!edition||typeof edition!=='object') fail('Falta la edicion');
  cleanId(edition.id,'edition.id');
  if(edition.status!=='REVIEW') fail('La edicion aun no esta en revision final');
  if(!Number.isSafeInteger(edition.prizePoolCents)||edition.prizePoolCents<10||edition.prizePoolCents>MAX_PRIZE_POOL_CENTS) fail('Fondo fuera de rango');
  if(!canOpenCashEdition(edition)) fail('Faltan garantias de apertura y financiacion');
  if(edition.leaderboardFrozen!==true||edition.winnersReviewed!==true||edition.payoutAuthorized!==true||edition.payPalApprovalConfirmed!==true) fail('Faltan autorizaciones finales');
  if(typeof edition.legalReviewReference!=='string'||edition.legalReviewReference.trim().length<6) fail('Falta la referencia de revision legal');
}

/**
 * Build exactly three payout items; this is a PURE draft builder, not a payment operation.
 * edition and winners MUST originate from authenticated, audited server records.
 * Caller must persist the immutable snapshot BEFORE calling any real provider in future versions.
 */
export function preparePayPalPayout(edition,winners) {
  assertEdition(edition);
  if(!Array.isArray(winners)||winners.length!==3) fail('Se requieren exactamente tres premiados');
  const ordered=[...winners].sort((a,b)=>a.position-b.position);
  const userIds=new Set(),emails=new Set();
  const amounts=allocatePrizeCents(edition.prizePoolCents);
  const items=ordered.map((winner,index)=>{
    if(!winner || winner.position!==index+1 || winner.reviewStatus!=='APPROVED' || winner.payoutEmailVerified!==true || !eligibility(winner.profile).ok) fail(`Premiado ${index+1} no autorizado`);
    const userId=cleanId(winner.userId,'winner.userId');
    const email=canonicalEmail(winner.payoutEmail);
    if(userIds.has(userId)||emails.has(email.toLowerCase())) fail('Cuentas o correos repetidos entre los premiados');
    userIds.add(userId);emails.add(email.toLowerCase());
    return {
      recipient_type:'EMAIL',
      receiver:email,
      amount:{currency:PAYOUT_CURRENCY,value:euros(amounts[index])},
      sender_item_id:`FDI-${digest(`frutidry:v1:${edition.id}:${index+1}:${userId}`).slice(0,40)}`,
      note:`FrutiDry - Premio torneo - puesto ${index+1}`,
      purpose:'PRIZES'
    };
  });
  const senderBatchId=`FDB-${digest(`frutidry:payout:v1:${edition.id}`).slice(0,40)}`;
  const request={
    sender_batch_header:{sender_batch_id:senderBatchId,recipient_type:'EMAIL',email_subject:'Premio FrutiDry',email_message:'Pago de premio del torneo semanal FrutiDry.'},
    items
  };
  // Persist this private immutable fingerprint alongside the batchId; NEVER publish receivers.
  const snapshotHash=digest(JSON.stringify({editionId:edition.id,prizePoolCents:edition.prizePoolCents,request}));
  return {
    provider:PAYOUT_PROVIDER,version:1,mode:'DRAFT_NOT_SENT',
    editionId:edition.id,senderBatchId,snapshotHash,prizePoolCents:edition.prizePoolCents,
    payoutAmountsCents:amounts,request
  };
}

/** Provider item status only. A batch-level SUCCESS cannot mark all winners as paid. */
export function classifyPayPalItemStatus(status) {
  switch(status){
    case 'SUCCESS':return 'PAID';
    case 'PENDING':case 'UNCLAIMED':case 'ONHOLD':return 'PROCESSING';
    case 'FAILED':case 'RETURNED':case 'BLOCKED':case 'REFUNDED':case 'REVERSED':return 'REVIEW_REQUIRED';
    default:throw new RangeError('Estado PayPal no reconocido');
  }
}

/** Public projection never includes email, batch IDs or other recipient details. */
export function publicPayoutOverview(draft) {
  if(!draft||draft.mode!=='DRAFT_NOT_SENT'||!Array.isArray(draft.payoutAmountsCents)) throw new TypeError('Borrador invalido');
  return {editionId:draft.editionId,provider:PAYOUT_PROVIDER,status:'NOT_ACTIVE',
    currency:PAYOUT_CURRENCY,positions:draft.payoutAmountsCents.map((amountCents,i)=>({position:i+1,amountCents}))};
}
