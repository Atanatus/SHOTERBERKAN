// FrutiDry V37 · Pure tournament domain policy. No public prize payouts or ranked API exist yet.
// Node built-ins only; any eventual production server must authorize all operations.
export const MIN_ACCOUNT_LEVEL = 11;
export const MIN_CASH_AGE = 18;
export const PAYOUT_SHARES = Object.freeze([50,30,20]);

export function eligibility(profile) {
  if(!profile || typeof profile!=='object')return {ok:false,reason:'ACCOUNT_REQUIRED'};
  if(!Number.isInteger(profile.accountLevel) || profile.accountLevel<MIN_ACCOUNT_LEVEL)return {ok:false,reason:'LEVEL_REQUIRED'};
  if(profile.ageVerified!==true || profile.ageYears<MIN_CASH_AGE)return {ok:false,reason:'ADULT_VERIFICATION_REQUIRED'};
  if(profile.countryCode!=='ES')return {ok:false,reason:'TERRITORY_RESTRICTED'};
  if(profile.suspended===true)return {ok:false,reason:'SUSPENDED'};
  if(profile.acceptedRulesVersion!==1)return {ok:false,reason:'TERMS_REQUIRED'};
  return {ok:true,reason:null};
}

export function ranking(verifiedRuns) {
  if(!Array.isArray(verifiedRuns))throw TypeError('Se necesitan partidas verificadas');
  const best=new Map();
  for(const run of verifiedRuns){
    if(!run || run.status!=='verified' || typeof run.userId!=='string' || !run.userId ||
      !Number.isSafeInteger(run.score) || run.score<0 ||
      !Number.isFinite(Date.parse(run.verifiedAt)))continue;
    const existing=best.get(run.userId);
    if(!existing || run.score>existing.score ||
      (run.score===existing.score && Date.parse(run.verifiedAt)<Date.parse(existing.verifiedAt))) {
      best.set(run.userId,{userId:run.userId,score:run.score,verifiedAt:run.verifiedAt});
    }
  }
  return [...best.values()].sort((a,b)=>b.score-a.score ||
    Date.parse(a.verifiedAt)-Date.parse(b.verifiedAt) || a.userId.localeCompare(b.userId))
    .map((r,index)=>({...r,position:index+1}));
}

export function allocatePrizeCents(totalCents) {
  if(!Number.isSafeInteger(totalCents)||totalCents<0)throw RangeError('Importe en céntimos inválido');
  const second=Math.floor(totalCents*PAYOUT_SHARES[1]/100);
  const third=Math.floor(totalCents*PAYOUT_SHARES[2]/100);
  return [totalCents-second-third,second,third]; // Céntimos sobrantes al primer puesto.
}

export function canOpenCashEdition(edition) {
  return Boolean(edition && edition.approvedByOperator === true && edition.legalApproved === true &&
    edition.fundingConfirmed === true && Number.isSafeInteger(edition.prizePoolCents) &&
    edition.prizePoolCents>0 && edition.rulesPublished === true && edition.serverValidatorReady === true &&
    edition.identityProviderReady === true && edition.payoutProviderReady === true);
}
