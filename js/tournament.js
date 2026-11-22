/* FrutiDry V37 — calendario INFORMATIVO. No habilita torneos ni premios.
   Los horarios oficiales deberán llegar firmados/autenticados desde la API. */
const TournamentCalendar = (() => {
  'use strict';
  const ZONE = 'Europe/Madrid';
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
  });
  function parts(at) {
    const fields = Object.fromEntries(formatter.formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    return fields;
  }
  function addDays(y,m,d,n) {
    const date=new Date(Date.UTC(y,m-1,d+n,12));
    return [date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate()];
  }
  function madridInstant(y,m,d,h=0) {
    // Midnight and 12:00 on Friday/Monday never coincide with Madrid DST changes.
    const probe=new Date(Date.UTC(y,m-1,d,12));
    const p=parts(probe);
    const localAsUTC=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    const offset=localAsUTC-probe.getTime();
    const instant=new Date(Date.UTC(y,m-1,d,h)-offset);
    const check=parts(instant);
    if(check.year!==y||check.month!==m||check.day!==d||check.hour!==h||check.minute!==0)throw Error('Fecha horaria no representable en Europe/Madrid');
    return instant;
  }
  function nextEdition(at=new Date()) {
    if(!(at instanceof Date)||!Number.isFinite(at.getTime()))throw TypeError('Fecha inválida');
    const p=parts(at);
    const dow=new Date(Date.UTC(p.year,p.month-1,p.day,12)).getUTCDay();
    // Always display an upcoming, not yet active, Friday. No false live tournament.
    let untilFriday=(5-dow+7)%7;
    if(untilFriday===0 && (p.hour>0||p.minute>0||p.second>0))untilFriday=7;
    const [fy,fm,fd]=addDays(p.year,p.month,p.day,untilFriday);
    const [my,mm,md]=addDays(fy,fm,fd,3);
    return Object.freeze({
      timezone:ZONE,
      friday:madridInstant(fy,fm,fd),
      closes:madridInstant(my,mm,md),
      payoutDay:`${my}-${String(mm).padStart(2,'0')}-${String(md).padStart(2,'0')}`,
      enabled:false
    });
  }
  function formatDay(value) {
    return new Intl.DateTimeFormat('es-ES',{timeZone:ZONE,day:'2-digit',month:'short',year:'numeric'}).format(value);
  }
  return Object.freeze({ZONE,nextEdition,formatDay,madridInstant});
})();

const TournamentPreview = (() => {
  'use strict';
  function refresh(at=new Date()) {
    const x=TournamentCalendar.nextEdition(at);
    document.getElementById('tournamentStart').textContent=TournamentCalendar.formatDay(x.friday)+' · 00:00';
    // Last second of Sunday; actual closing boundary is Monday 00:00 exclusive.
    document.getElementById('tournamentEnd').textContent=TournamentCalendar.formatDay(new Date(x.closes.getTime()-1000))+' · 23:59';
    document.getElementById('tournamentPayout').textContent=new Intl.DateTimeFormat('es-ES', {timeZone:x.timezone,day:'2-digit',month:'short',year:'numeric'}).format(x.closes);
    document.getElementById('tournamentTimezone').textContent=x.timezone;
    document.getElementById('tournamentStatus').textContent='EN PREPARACIÓN · SIN TORNEO ACTIVO';
  }
  return Object.freeze({refresh});
})();
if(typeof module!=='undefined'&&module.exports) module.exports={TournamentCalendar};
