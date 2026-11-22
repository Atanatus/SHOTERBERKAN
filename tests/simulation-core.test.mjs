import test from 'node:test';
import assert from 'node:assert/strict';
import Sim from '../js/simulation-core.js';

// Independent, frozen V42 reference implementations. Do not reuse Sim here:
// the purpose is to detect any drift in server-side behavior and RNG calls.
function legacyPRNG(seed) {
  let s = (seed >>> 0) || 1;
  let calls = 0;
  const random = function () {
    calls++;
    let t = s += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  random.inspect = () => ({state: s >>> 0, calls});
  return random;
}
function legacyRoute(seed, milestoneIdx) {
  const rSeed = (seed ^ ((milestoneIdx + 1) * 0x9e3779b9)) >>> 0;
  const rng = legacyPRNG(rSeed);
  const mode = Math.floor(rng() * 4);
  const freqA = 1 + Math.floor(rng() * 2);
  const freqB = 1 + Math.floor(rng() * 2);
  const ampY = milestoneIdx === 0 ? 0.36 : (0.44 + rng() * 0.3);
  const laneCount = milestoneIdx === 0 ? 2 : (milestoneIdx % 2 === 1 ? 3 : 2);
  const laneSpacingY = laneCount === 3 ? 42 : 52;
  const dir = rng() > 0.5 ? 1 : -1;
  const baseSpeed = [0.0035,0.0044,0.0054,0.0065,0.0077,0.0090][Math.min(5,milestoneIdx)];
  const speed = baseSpeed * dir;
  return {mode, freqA, freqB, ampY, laneCount, laneSpacingY, speed};
}
function legacyLane(u, laneIndex, g, rp) {
  rp = rp || {mode:0,laneCount:2,freqA:1};
  const x = g.cx + (u - .5)*2*g.trackHalfSpan;
  const gap = g.slotRadius * 2.55;
  const offset = (laneIndex-(rp.laneCount-1)/2)*gap;
  const wave = rp.mode===0 ? Math.sin(u*Math.PI*2) : rp.mode===1 ? Math.sin(u*Math.PI*2+Math.PI/3) : rp.mode===2 ? Math.cos(u*Math.PI*2) : Math.sin(u*Math.PI*4)*.7;
  return {x,y:g.cy+offset+wave*g.trackHeight*.24};
}
function legacySlot(index, phase, g, rp, numSlots = 9) {
  const laneCount = rp ? rp.laneCount : 2;
  const laneIndex = index % laneCount;
  const perLaneCount = Math.ceil(numSlots / laneCount);
  const posInLane = Math.floor(index / laneCount);
  const spacing = 1 / perLaneCount;
  const laneDir = laneIndex % 2 === 1 ? -1 : 1;
  const rawU = (phase * laneDir + posInLane * spacing + laneIndex * 0.17) % 1;
  const u = rawU < 0 ? rawU + 1 : rawU;
  return legacyLane(u, laneIndex, g, rp);
}

const seeds = [0, 1, 2, 3, 17, 1234, 123456789, 2147483647, -1, 0xffffffff, 0x80000000];

test('RNG produces exactly the same values and inspect state as V42', () => {
  for (const seed of seeds) {
    const a = legacyPRNG(seed), b = Sim.createPRNG(seed);
    for (let i = 0; i < 1200; i++) assert.equal(b(), a(), `seed ${seed} call ${i}`);
    assert.deepEqual(b.inspect(), a.inspect(), `seed ${seed} state`);
  }
});
test('procedural routes match V42 for all milestone variants', () => {
  for (const seed of seeds) {
    for (let milestone = 0; milestone < 22; milestone++) {
      assert.deepEqual(Sim.generateProceduralRoute(seed, milestone), legacyRoute(seed, milestone));
    }
  }
});
test('slot positions are bit-identical for routes, phases and viewports', () => {
  const geometries = [
    {cx:160, cy:315, trackHalfSpan:134, slotRadius:14, trackHeight:79},
    {cx:195, cy:413, trackHalfSpan:170, slotRadius:17, trackHeight:95},
    {cx:683, cy:354, trackHalfSpan:650, slotRadius:30, trackHeight:105}
  ];
  const phases = [-1.1, -0.33, -0.00001, 0, .01, .2, .5, .99, 1.1, 2.7];
  for (const geometry of geometries) for (const seed of seeds) for (let milestone = 0; milestone < 8; milestone++) {
    const route = Sim.generateProceduralRoute(seed, milestone);
    for (const phase of phases) for (let index = 0; index < 9; index++) {
      assert.deepEqual(Sim.getSlotWorldPos(index, phase, geometry, route), legacySlot(index, phase, geometry, route));
    }
  }
});
test('core has no DOM dependency, no side effects, and exports only immutable API', () => {
  assert(Object.isFrozen(Sim));
  assert.deepEqual(Object.keys(Sim).sort(),['createPRNG','evalLaneAt','generateProceduralRoute','getLaneOffsetY','getSlotWorldPos',
    'isBoardFigure','isTargetFruit','arePiecesEqualForMerge','getHighestBoardLevel','nextRandomPiece','intersection','advanceProjectile'].sort());
  assert.equal(typeof document,'undefined');
  assert.deepEqual(Sim.getLaneOffsetY(2,3,42),42);
});

// The browser loads scripts from file:// as classic scripts, not ES modules.
// This also catches accidental imports or references to document/canvas on init.
test('browser classic-script entrypoint works with no document or Canvas', async () => {
  const {readFileSync} = await import('node:fs');
  const {runInNewContext} = await import('node:vm');
  const source = readFileSync(new URL('../js/simulation-core.js', import.meta.url), 'utf8');
  const sandbox = {Math};
  sandbox.window = sandbox; // Browser window === globalThis
  sandbox.globalThis = sandbox;
  runInNewContext(source, sandbox, {timeout: 1000});
  assert.equal(typeof sandbox.window.FrutiDrySimulation?.createPRNG, 'function');
  assert.equal(sandbox.window.FrutiDrySimulation.createPRNG(42)(), Sim.createPRNG(42)());
});

test('game HTML loads the shared core before the legacy data and game scripts', async () => {
  const {readFileSync} = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const core=html.indexOf('src="js/simulation-core.js"');
  const data=html.indexOf('src="js/data.js"');
  const game=html.indexOf('src="js/game.js"');
  assert(core>0&&core<data&&data<game);
});
