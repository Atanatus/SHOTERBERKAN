// Single RNG implementation shared with the Node.js verifier.
const createPRNG = FrutiDrySimulation.createPRNG;

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const SHAPES = [
  { lvl: 1, sides: 3, star: false, name: 'Triángulo', color: '#00f5ff' },
  { lvl: 2, sides: 4, star: false, name: 'Cuadrado', color: '#00ff88' },
  { lvl: 3, sides: 5, star: false, name: 'Pentágono', color: '#a3e635' },
  { lvl: 4, sides: 6, star: false, name: 'Hexágono', color: '#ffd000' },
  { lvl: 5, sides: 4, star: true,  name: 'Shuriken IV', color: '#ff7b00' },
  { lvl: 6, sides: 5, star: true,  name: 'Estrella V', color: '#ff1e6e' },
  { lvl: 7, sides: 6, star: true,  name: 'Sello Hexa', color: '#f72585' },
  { lvl: 8, sides: 8, star: false, name: 'Octágono', color: '#c084fc' },
  { lvl: 9, sides: 8, star: true,  name: 'Rosa Vientos', color: '#9333ea' },
  { lvl: 10, sides: 10, star: true, name: 'Mandala X', color: '#fde047' },
  { lvl: 11, sides: 12, star: true, name: 'Corona Solar', color: '#ffffff' },
  { lvl: 12, sides: 16, star: true, name: 'Kami Absoluto', color: '#ff1744' }
];

const RELIC_DATA = [
  { id: 1, name: "Trígono Berkan", reqLvl: 3, desc: "Insignia de dominio geométrico." },
  { id: 2, name: "Cubo Karakuri", reqLvl: 4, desc: "Insignia de dominio geométrico." },
  { id: 3, name: "Sello Inari", reqLvl: 5, desc: "Insignia de dominio geométrico." },
  { id: 4, name: "Estrella Kitsune", reqLvl: 6, desc: "Insignia de dominio geométrico." },
  { id: 5, name: "Prisma Oni", reqLvl: 7, desc: "Insignia de dominio geométrico." },
  { id: 6, name: "Ojo Geométrico", reqLvl: 8, desc: "Insignia de dominio geométrico." },
  { id: 7, name: "Mandala Sun-Mi", reqLvl: 9, desc: "Insignia de dominio geométrico." },
  { id: 8, name: "Corazón Berkan", reqLvl: 10, desc: "Alcanza la figura de nivel 10." },
  { id: 9, name: "Astrolabio Alfa", reqLvl: 11, desc: "Detona 2 núcleos BERKAN acumulados." },
  { id: 10, name: "Loto Dorado", reqLvl: 12, desc: "Detona 3 núcleos BERKAN acumulados." },
  { id: 11, name: "Espectro Meiji", reqLvl: 13, desc: "Detona 4 núcleos BERKAN acumulados." },
  { id: 12, name: "Arquitecto Berkan", reqLvl: 14, desc: "Detona 5 núcleos BERKAN acumulados." }
];

const ZEN_ENVIRONMENTS = [
  {
    name: 'Aurora Prisma',
    skyTop: '#0b092e',
    skyMid: '#3b0764',
    skyBot: '#ec4899',
    auroraA: 'rgba(0, 245, 255, 0.34)',
    auroraB: 'rgba(255, 30, 110, 0.32)',
    auroraC: 'rgba(255, 208, 0, 0.26)',
    farRidge: 'rgba(28, 16, 77, 0.72)',
    nearRidge: 'rgba(12, 23, 56, 0.88)',
    streamA: 'rgba(0, 245, 255, 0.25)',
    streamB: 'rgba(255, 30, 110, 0.24)',
    roadSurface: 'rgba(10, 14, 38, 0.62)',
    roadEdge: 'rgba(0, 245, 255, 0.75)',
    roadDash: 'rgba(255, 208, 0, 0.65)',
    structureType: 'aurora_spires'
  },
  {
    name: 'Selva Neón',
    skyTop: '#042326',
    skyMid: '#065f46',
    skyBot: '#22d3ee',
    auroraA: 'rgba(0, 255, 136, 0.32)',
    auroraB: 'rgba(0, 245, 255, 0.28)',
    auroraC: 'rgba(163, 230, 53, 0.25)',
    farRidge: 'rgba(6, 78, 59, 0.7)',
    nearRidge: 'rgba(4, 47, 46, 0.86)',
    streamA: 'rgba(0, 255, 136, 0.24)',
    streamB: 'rgba(0, 245, 255, 0.22)',
    roadSurface: 'rgba(6, 28, 32, 0.62)',
    roadEdge: 'rgba(0, 255, 136, 0.72)',
    roadDash: 'rgba(254, 240, 138, 0.6)',
    structureType: 'aurora_spires'
  },
  {
    name: 'Ocaso Solar',
    skyTop: '#1e0b36',
    skyMid: '#9d174d',
    skyBot: '#fbbf24',
    auroraA: 'rgba(255, 208, 0, 0.34)',
    auroraB: 'rgba(255, 30, 110, 0.32)',
    auroraC: 'rgba(168, 85, 247, 0.26)',
    farRidge: 'rgba(76, 17, 74, 0.7)',
    nearRidge: 'rgba(38, 10, 52, 0.86)',
    streamA: 'rgba(255, 208, 0, 0.24)',
    streamB: 'rgba(255, 107, 53, 0.24)',
    roadSurface: 'rgba(22, 10, 44, 0.62)',
    roadEdge: 'rgba(255, 208, 0, 0.72)',
    roadDash: 'rgba(103, 232, 249, 0.6)',
    structureType: 'aurora_spires'
  },
  {
    name: 'Abismo Cobalto',
    skyTop: '#050b29',
    skyMid: '#1d4ed8',
    skyBot: '#38bdf8',
    auroraA: 'rgba(192, 132, 252, 0.34)',
    auroraB: 'rgba(0, 245, 255, 0.32)',
    auroraC: 'rgba(255, 30, 110, 0.25)',
    farRidge: 'rgba(23, 37, 84, 0.7)',
    nearRidge: 'rgba(10, 18, 52, 0.86)',
    streamA: 'rgba(192, 132, 252, 0.25)',
    streamB: 'rgba(0, 245, 255, 0.22)',
    roadSurface: 'rgba(8, 15, 42, 0.62)',
    roadEdge: 'rgba(192, 132, 252, 0.72)',
    roadDash: 'rgba(255, 208, 0, 0.6)',
    structureType: 'aurora_spires'
  }
];

const MILESTONE_THRESHOLDS = [0, 500, 1500, 3500, 7000, 12000];
const TARGET_CORE_LEVEL = 10;
const MAX_SHIELD = 5;
const NUM_SLOTS = 9;

