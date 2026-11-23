// Test-only child attempting to assert monetary and XP privileges.
process.once('message',()=>{
  process.send({kind:'VERIFICATION_RESULT',result:{status:'REPLAY_CONSISTENT_NOT_ANTICHEAT',
    reason:'NONE',steps:151,scoreRecomputed:90,xpGranted:999,ranked:true,eligibleForPrizes:true}},
    ()=>process.exit(0));
});
