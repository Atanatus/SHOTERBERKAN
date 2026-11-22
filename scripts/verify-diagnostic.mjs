#!/usr/bin/env node
// V46 developer-only offline check. Never treats a replay as cash/XP-eligible.
import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {verifyHeadlessDiagnostic} from '../server/headless-replay.mjs';

const [file, arg] = process.argv.slice(2);
const seed = arg?.match(/^--seed=(\d+)$/)?.[1];
if(!file || !seed || !Number.isSafeInteger(Number(seed)) || Number(seed)<1 || Number(seed)>2147483647){
  console.error('Uso: node scripts/verify-diagnostic.mjs <diagnostico.json> --seed=<semilla_del_servidor>');
  process.exitCode=2;
}else{
  try{
    const path=resolve(file);
    if(statSync(path).size>2*1024*1024)throw Error('FILE_TOO_LARGE');
    const raw=JSON.parse(readFileSync(path,'utf8'));
    const result=verifyHeadlessDiagnostic(raw,{seed:Number(seed)});
    console.log(JSON.stringify(result,null,2));
    if(result.status!=='REPLAY_CONSISTENT_NOT_ANTICHEAT')process.exitCode=1;
  }catch(error){
    console.error('REJECTED:',error?.code??error?.message??'INVALID_DIAGNOSTIC');
    process.exitCode=1;
  }
}
