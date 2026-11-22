
// Identidad visible. No se modifican los identificadores de guardado ni los formatos V24.
const GAME_BRAND = Object.freeze({name:'FrutiDry',universe:'Astral Sanctuary',core:'BERKAN'});
const BACKGROUND_PHOTO_URL = '';
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORE = {get(key,fallback){try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}};
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

