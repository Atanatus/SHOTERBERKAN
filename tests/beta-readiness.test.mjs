import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectBetaReadiness} from '../scripts/check-beta-readiness.mjs';

test('V50 safe offline readiness does not require Render or reveal secrets',()=>{
  const report=inspectBetaReadiness();
  // A future approved beta may enable the public SDK without breaking CI.
  assert(['ACCOUNT_CLIENT_DISABLED','ACCOUNT_CLIENT_ENABLED'].includes(report.mode));
  assert.equal(report.publicRegistrationEnabled,false);
  assert.equal(report.productionAuthConfirmed,false);
  assert.equal(report.xpGrantedByThisTool,0);
  assert.equal(report.prizesEnabled,false);
  assert.equal(report.safeToContinueLocalDevelopment,true);
  assert(Object.values(report.checks).every(Boolean));
  assert(!JSON.stringify(report).includes('mongodb+srv://'));
});
