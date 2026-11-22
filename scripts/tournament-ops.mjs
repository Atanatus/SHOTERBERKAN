#!/usr/bin/env node
// FrutiDry V39 · Developer operator CLI — preview only, never opens a live tournament.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTournamentDraft,validateTournamentDraft,publicSafePreview,campaignPreview,operationsChecklist,upcomingFridays} from '../server/tournament-operations.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

function usage(){return `FrutiDry — herramienta interna de ediciones (no activa torneos)\n\n`+
  `  node scripts/tournament-ops.mjs calendar --from 2026-11-22 --weeks 6\n`+
  `  node scripts/tournament-ops.mjs draft --friday 2026-11-27 [--prize-cents 10000] [--rules-url https://dominio/bases]\n`+
  `  node scripts/tournament-ops.mjs verify --file ops/drafts/FD-2026-11-27.json\n`+
  `  node scripts/tournament-ops.mjs preview --file ops/drafts/FD-2026-11-27.json\n\n`+
  `NUNCA publica, abre o paga torneos. Archivos locales excluidos de Git.\n`;}
function parseArgs(args){
  const values={};
  for(let i=0;i<args.length;i+=2){
    if(!/^--[a-z-]+$/.test(args[i])||i+1>=args.length||values[args[i]])throw Error('Argumentos inválidos');
    values[args[i]]=args[i+1];
  }
  return values;
}
async function load(args){
  if(typeof args['--file']!=='string')throw Error('Falta --file');
  const file=resolve(root,args['--file']);
  const safeDir=join(root,'ops','drafts');
  if(!file.startsWith(safeDir+'/') && !file.startsWith(safeDir+'\\'))throw Error('Solo se permiten ficheros ops/drafts');
  const data=await readFile(file,'utf8');
  if(data.length>16384)throw Error('Borrador demasiado grande');
  const draft=JSON.parse(data); validateTournamentDraft(draft);
  return draft;
}
async function main(){
  const [cmd,...rest]=process.argv.slice(2);
  if(!cmd||cmd==='help'||cmd==='--help'){console.log(usage());return;}
  const args=parseArgs(rest);
  if(cmd==='calendar'){
    const date=args['--from']||new Date().toISOString().slice(0,10);
    const count=args['--weeks']===undefined?6:Number(args['--weeks']);
    for(const s of upcomingFridays(date,count))console.log(`${s.friday} → ${s.sunday} | revisión ${s.monday} | ${s.startsAt} — ${s.closesAt}`);
    console.log('CALENDARIO TEÓRICO — NO HAY TORNEOS ACTIVOS'); return;
  }
  if(cmd==='draft'){
    const cents=args['--prize-cents']===undefined?null:Number(args['--prize-cents']);
    const draft=createTournamentDraft({friday:args['--friday'],prizePoolCents:cents,rulesUrl:args['--rules-url']||null});
    const dir=join(root,'ops','drafts');await mkdir(dir,{recursive:true,mode:0o700});
    const target=join(dir,draft.id+'.json');
    await writeFile(target,JSON.stringify(draft,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
    console.log(`BORRADOR INACTIVO: ${target}\nNo crea inscripciones ni premios. No subas este archivo a Git.`);return;
  }
  if(cmd==='verify'){
    const draft=await load(args);
    console.log(`OK (solo estructura): ${draft.id}; ${draft.schedule.startsAt} — ${draft.schedule.closesAt}. SIN ACTIVACIÓN.`);return;
  }
  if(cmd==='preview'){
    const draft=await load(args);
    const dir=join(root,'ops','previews',draft.id);await mkdir(dir,{recursive:true,mode:0o700});
    for(const [name,content] of [
      ['public-preview.json',JSON.stringify(publicSafePreview(draft),null,2)+'\n'],
      ['anuncio-borrador.txt',campaignPreview(draft)],
      ['checklist-operativa.md',operationsChecklist(draft)]
    ])await writeFile(join(dir,name),content,{encoding:'utf8',flag:'wx',mode:0o600});
    console.log(`PREVISUALIZACIÓN INTERNA: ${dir}\nNo enviar como convocatoria ni copiar public-preview.json al sitio en producción.`);return;
  }
  throw Error('Comando desconocido. '+usage());
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
