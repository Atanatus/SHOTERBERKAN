// FrutiDry V39 — Local tournament operations *drafts*, never authoritative editions.
// Node built-ins only. This module NEVER opens cash tournaments or initiates payments.
import {allocatePrizeCents, MIN_ACCOUNT_LEVEL, MIN_CASH_AGE} from './tournament-policy.mjs';

export const TIMEZONE = 'Europe/Madrid';
export const DRAFT_SCHEMA = 'frutidry-operator-draft-v1';
const MAX_POOL_CENTS = 100_000_000;
const MD_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE, year:'numeric', month:'2-digit', day:'2-digit',
  hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
});

function assert(condition, message) {if (!condition) throw new Error(`TOURNAMENT_OPS: ${message}`);}
function formatParts(value) {
  return Object.fromEntries(MD_FORMAT.formatToParts(value).filter(p => p.type!=='literal').map(p => [p.type, Number(p.value)]));
}
function parseDate(value) {
  assert(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value),'fecha AAAA-MM-DD obligatoria');
  const [y,m,d]=value.split('-').map(Number);
  const t=Date.UTC(y,m-1,d,12);
  const date=new Date(t);
  assert(y>=2026 && y<=2100 && date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d, 'fecha fuera de rango o inexistente');
  return {y,m,d};
}
function isoDay(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function shiftDate(date,days){
  const {y,m,d}=parseDate(date);
  const next=new Date(Date.UTC(y,m-1,d+days,12));
  return isoDay(next.getUTCFullYear(),next.getUTCMonth()+1,next.getUTCDate());
}
function localMidnightUtc(day){
  const {y,m,d}=parseDate(day);
  // Probe at noon to avoid the Europe/Madrid DST change (02:00/03:00).
  const probe = new Date(Date.UTC(y,m-1,d,12));
  const p=formatParts(probe);
  const offset = Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-probe.getTime();
  const instant=new Date(Date.UTC(y,m-1,d)-offset);
  const check=formatParts(instant);
  assert(check.year===y && check.month===m && check.day===d && check.hour===0 && check.minute===0,'zona horaria no representable');
  return instant.toISOString();
}
function verifyFriday(friday){
  const {y,m,d}=parseDate(friday);
  assert(new Date(Date.UTC(y,m-1,d,12)).getUTCDay()===5,'la apertura debe ser un viernes');
}
export function buildTournamentSchedule(friday){
  verifyFriday(friday);
  const monday=shiftDate(friday,3);
  return Object.freeze({
    friday, sunday:shiftDate(friday,2), monday,
    timeZone:TIMEZONE, startsAt:localMidnightUtc(friday), closesAt:localMidnightUtc(monday),
    reviewDay:monday, payoutTargetDay:monday,
    closeBoundary:'exclusive'
  });
}
export function upcomingFridays(fromDate, count=6){
  assert(Number.isInteger(count)&&count>=1&&count<=26,'semanas fuera de rango');
  const {y,m,d}=parseDate(fromDate);
  const day=new Date(Date.UTC(y,m-1,d,12)).getUTCDay();
  const first=shiftDate(fromDate,(5-day+7)%7);
  return Array.from({length:count},(_,i)=>buildTournamentSchedule(shiftDate(first,i*7)));
}
export function createTournamentDraft({friday, prizePoolCents=null, rulesUrl=null}={}){
  const schedule=buildTournamentSchedule(friday);
  assert(prizePoolCents===null || (Number.isSafeInteger(prizePoolCents)&&prizePoolCents>=10&&prizePoolCents<=MAX_POOL_CENTS),'fondo en céntimos fuera de rango');
  assert(rulesUrl===null || (typeof rulesUrl==='string' && rulesUrl.length<=500 && /^https:\/\/[^\s/]+\.[^\s/]+/.test(rulesUrl)),'bases requieren URL HTTPS válida');
  return {
    schema:DRAFT_SCHEMA, id:`FD-${friday}`, status:'DRAFT', enabled:false,
    moneyEnabled:false, verifiedRankingEnabled:false, advertisingEnabled:false,
    schedule, prizePoolCents, proposedPrizeCents:prizePoolCents===null?null:allocatePrizeCents(prizePoolCents),
    rulesUrl, entryFeeCents:0,
    eligibility:{accountLevelMin:MIN_ACCOUNT_LEVEL, minAge:MIN_CASH_AGE, territory:'ES'},
    ranking:{bestVerifiedScorePerPlayer:true, tieBreaker:'FIRST_VERIFIED_AT'},
    gates:{legal:false, taxes:false, budget:false, identity:false, anticheat:false, productionBackend:false, payPal:false, consent:false},
    note:'BORRADOR INTERNO. No convoca torneos, no abre inscripciones y no autoriza premios.'
  };
}
export function validateTournamentDraft(draft){
  assert(draft && typeof draft==='object' && !Array.isArray(draft),'JSON de borrador inválido');
  assert(draft.schema===DRAFT_SCHEMA,'esquema incompatible');
  const expected=createTournamentDraft({friday:draft.schedule?.friday,prizePoolCents:draft.prizePoolCents,rulesUrl:draft.rulesUrl});
  assert(draft.id===expected.id && draft.status==='DRAFT' && draft.enabled===false &&
    draft.moneyEnabled===false && draft.verifiedRankingEnabled===false && draft.advertisingEnabled===false,
    'el borrador no puede estar activo');
  for(const key of Object.keys(expected.schedule))assert(draft.schedule[key]===expected.schedule[key],`calendario manipulado: ${key}`);
  assert(draft.entryFeeCents===0,'la participación ha de ser gratuita');
  assert(draft.eligibility?.accountLevelMin===MIN_ACCOUNT_LEVEL && draft.eligibility?.minAge===MIN_CASH_AGE && draft.eligibility?.territory==='ES','elegibilidad alterada');
  assert(draft.ranking?.bestVerifiedScorePerPlayer===true && draft.ranking?.tieBreaker==='FIRST_VERIFIED_AT','ranking alterado');
  if(expected.proposedPrizeCents===null)assert(draft.proposedPrizeCents===null,'importes inesperados');
  else assert(JSON.stringify(draft.proposedPrizeCents)===JSON.stringify(expected.proposedPrizeCents),'distribución alterada');
  assert(draft.gates && Object.values(draft.gates).length===Object.values(expected.gates).length &&
    Object.keys(expected.gates).every(key=>draft.gates[key]===false),'los permisos no se pueden aprobar en un borrador local');
  return true;
}
export function publicSafePreview(draft){
  validateTournamentDraft(draft);
  return {
    schema:'frutidry-tournament-public-preview-v1', id:draft.id,
    mode:'INFORMATION_ONLY_NOT_LIVE', enabled:false, status:'PREPARATION',
    schedule:draft.schedule, minLevel:draft.eligibility.accountLevelMin,
    prizePoolCents:null, payoutStatus:'NOT_CONFIGURED', leaderboard:[],
    notice:'Calendario orientativo. No hay inscripción ni premios activos.'
  };
}
export function campaignPreview(draft){
  validateTournamentDraft(draft);
  const s=draft.schedule;
  const slots=[
    ['JUEVES · PRECONVOCATORIA',`FrutiDry prepara un torneo semanal. Ventana propuesta: ${s.friday} a ${s.sunday}, horario de Madrid. Requisitos previstos: nivel 11+, participación gratuita. Bases y premios por confirmar.`],
    ['VIERNES · APERTURA',`FrutiDry | edición ${draft.id}. [SOLO SI LA API CONFIRMA OPEN Y LAS BASES ESTÁN PUBLICADAS] Competición abierta hasta el domingo ${s.sunday}. Consulta las bases y el ranking oficial en la web.`],
    ['SÁBADO · RECORDATORIO',`FrutiDry | torneo ${draft.id}. [SOLO SI SIGUE OPEN] Consulta la clasificación verificada. No mostramos récords locales como si fueran puntuaciones oficiales.`],
    ['DOMINGO · CIERRE',`FrutiDry | torneo ${draft.id}. [SOLO SI SIGUE OPEN] Cierre a las 23:59:59, hora de Madrid. Los resultados están sujetos a validación y revisión.`],
    ['LUNES · RESULTADOS',`FrutiDry | torneo ${draft.id}. [SOLO SI LA CLASIFICACIÓN FINAL ESTÁ CONFIRMADA] Resultados y estados de premios en el tablón oficial. Los premios se concilian de forma individual; nunca anunciar pagos pendientes como cobrados.`]
  ];
  return 'BORRADOR INTERNO — NO PUBLICAR / NO HAY TORNEO ACTIVO\n'+
    'Estas cinco piezas son PLANTILLAS, no convocatorias. La API y el responsable validarán cada emisión.\n\n'+
    slots.map(([title,copy])=>`## ${title}\n${copy}`).join('\n\n')+'\n';
}
export function operationsChecklist(draft){
  validateTournamentDraft(draft);
  const id=draft.id;
  return `# ${id} — Checklist de producción (no ejecutada)\n\n`+
    `**Estado actual:** DRAFT / INACTIVO. Las tareas marcadas [ ] requieren pruebas y aprobación.\n\n`+
    `## Antes de anunciar\n\n`+
    `- [ ] Aprobar bases legales, tratamiento fiscal y elegibilidad por edad/territorio\n`+
    `- [ ] Confirmar por escrito permisos de PayPal y disponibilidad de Payouts\n`+
    `- [ ] Confirmar el fondo total, comisiones y reserva antes del anuncio\n`+
    `- [ ] Publicar bases inmutables, versiones de reglas/semillas y criterios de desempate\n`+
    `- [ ] Disponer de cuentas, nivel persistente 11+, verificación de edad/territorio\n`+
    `- [ ] Disponer de backend anticheat que reproduzca las partidas en servidor\n`+
    `- [ ] Probar API de torneo, ranking y controles de administración con MFA y auditoría\n`+
    `- [ ] Probar cierre y conciliación de tres premios por transacción individual\n`+
    `- [ ] Revisar consentimiento/CMP y anuncios alejados del Canvas, sin clic accidental\n\n`+
    `## Operativa semanal (solo backend oficial)\n\n`+
    `1. DRAFT: crear edición con reglas, fondo, fechas y responsable.\n`+
    `2. ANNOUNCED: publicar bases y promoción tras aprobación; archivar captura y versión.\n`+
    `3. OPEN: viernes ${draft.schedule.friday}, 00:00 Europe/Madrid; servidor comprueba permisos.\n`+
    `4. CLOSED: domingo ${draft.schedule.sunday}, 23:59:59; cierre efectivo lunes 00:00 exclusivo.\n`+
    `5. REVIEW: lunes ${draft.schedule.monday}, congelar clasificación, revisar fraude y reclamaciones.\n`+
    `6. PAID: transferir solo tras aprobación humana; confirmar cada pago individual en PayPal.\n`+
    `7. ARCHIVE: publicar resultados finales y conservar registro fiscal/auditoría.\n\n`+
    `**Importante:** este CLI no cambia esos estados ni llama a la API.\n`;
}
