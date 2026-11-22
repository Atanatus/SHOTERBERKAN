
// Identidad visible. No se modifican los identificadores de guardado ni los formatos V24.
const GAME_BRAND = Object.freeze({name:'FrutiDry',universe:'Astral Sanctuary',core:'BERKAN'});
const BACKGROUND_PHOTO_URL = '';
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
// V30 · Imported progress is a recoverable multi-key transaction. The journal is
// written BEFORE modifying legacy V20/V23 keys, and is rolled back on startup.
// This is crash consistency for localStorage, not server-side authority.
const STORAGE_IMPORT = (() => {
  const KEY = 'frutidry_import_journal_v1';
  const KEYS = Object.freeze([
    'kosen_v20_best','kosen_v20_holder','kosen_cores','kosen_relics',
    'kosen_v3_best','kosen_muted','kosen_music_enabled',
    'kosen_music_volume','kosen_render_quality'
  ]);
  let status = 'ready';
  let notice = '';
  function warn(message) {
    notice = message;
    const el = document.getElementById('storageAlert');
    if (el) {el.textContent = message;el.hidden = false;}
  }
  function validateJournal(raw) {
    if (typeof raw !== 'string' || raw.length > 32768) throw Error('Diario de importación inválido');
    const tx = JSON.parse(raw);
    if (!tx || tx.version !== 1 || !Array.isArray(tx.before) || tx.before.length !== KEYS.length)
      throw Error('Diario de importación incompatible');
    for (let i=0;i<KEYS.length;i++) {
      const entry=tx.before[i];
      if (!Array.isArray(entry) || entry.length !== 2 || entry[0] !== KEYS[i] ||
          (entry[1] !== null && typeof entry[1] !== 'string'))
        throw Error('Diario de importación corrupto');
    }
    return tx;
  }
  function restore(tx) {
    // Keep the journal until every write succeeds. A crash during rollback
    // simply repeats this idempotent operation on the next page load.
    for (const [key, oldValue] of tx.before) {
      if (oldValue === null) localStorage.removeItem(key);
      else localStorage.setItem(key, oldValue);
    }
    localStorage.removeItem(KEY);
    if (localStorage.getItem(KEY) !== null) throw Error('No se pudo eliminar el diario');
  }
  function recover() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === null) { status = 'ready'; return 'ready'; }
      restore(validateJournal(raw));
      status = 'recovered';
      warn('Se interrumpió una importación. FrutiDry ha restaurado el progreso anterior; revisa tu copia JSON.');
      return status;
    } catch {
      status = 'blocked';
      warn('No se pudo recuperar una importación interrumpida. No borres los datos del sitio; revisa el almacenamiento y recarga antes de continuar.');
      return status;
    }
  }
  function commit(entries) {
    if (status === 'blocked') throw Error('Importación bloqueada: hay una recuperación de almacenamiento pendiente');
    if (!Array.isArray(entries) || entries.length !== KEYS.length ||
        entries.some(([key], i) => key !== KEYS[i])) throw Error('Claves de importación incompatibles');
    let tx;
    try {
      if (localStorage.getItem(KEY) !== null) {
        if (recover() === 'blocked') throw Error('Recuperación pendiente');
      }
      tx = {version:1,before:KEYS.map(key=>[key,localStorage.getItem(key)])};
      localStorage.setItem(KEY, JSON.stringify(tx));
      if (localStorage.getItem(KEY) === null) throw Error('No se pudo crear el diario');
    } catch (error) {
      warn('El navegador no permite guardar una copia de seguridad previa a la importación. No se han aplicado cambios.');
      throw Error('No se pudo iniciar la importación segura: '+error.message);
    }
    try {
      for (const [key,value] of entries) localStorage.setItem(key,JSON.stringify(value));
      localStorage.removeItem(KEY);
      if (localStorage.getItem(KEY) !== null) throw Error('No se pudo cerrar el diario');
    } catch (error) {
      try {
        restore(tx);
      } catch {
        status='blocked';
        warn('Una importación falló y no pudo revertirse completamente. Reinicia el juego para intentar recuperarla.');
        throw Error('Importación incompleta: recuperación pendiente; evita nuevos guardados');
      }
      throw Error('Importación cancelada; progreso previo restaurado: '+error.message);
    }
    status='ready';
    return true;
  }
  recover();
  return {commit,recover,get status(){return status;},get notice(){return notice;},warn};
})();
const STORE = {
  get(key,fallback){try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}},
  set(key,value){
    try {
      if (STORAGE_IMPORT.status === 'blocked') throw Error('Recuperación pendiente');
      localStorage.setItem(key,JSON.stringify(value));
      return true;
    } catch {
      STORAGE_IMPORT.warn('No se pudo guardar el progreso en este navegador. Exporta una copia JSON desde el Códice.');
      return false;
    }
  }
};
let muted = STORE.get('kosen_muted',false) === true;
let renderQuality = STORE.get('kosen_render_quality','auto') === 'eco' ? 'eco' : 'auto';
let paused = false;
let pointerId = null;
let runSerial = 0;
let routeCache = new Map();
const lanePulses = [];
const MAX_AIM_ANGLE = Math.PI * 0.42;

const THEME = {
  sakura: '#ff40cb',
  vermilion: '#ff6b35',
  cyan: '#39eaff',
  emerald: '#00ff88',
  muted: '#dbeafe',
  gold: '#ffd078',
  danger: '#ff1744',
  bomb: '#ff5500',
  supercharger: '#ff9e00',
  superball: '#f72585',
  accel: '#00bbf9',
  slow: '#d946ef',
  fruit: '#ff4d6d',
  skull: '#ffffff',
  font: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
};

const FRUITS = [
  { id: 'cherry', emoji: '🍒', name: 'Cereza',  color: '#ff3b77' },
  { id: 'lemon',  emoji: '🍋', name: 'Limón',    color: '#ffe600' },
  { id: 'berry',  emoji: '🍓', name: 'Fresa',   color: '#ff1e6e' },
  { id: 'orange', emoji: '🍊', name: 'Naranja', color: '#ff7b00' }
];

