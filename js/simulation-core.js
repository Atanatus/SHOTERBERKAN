/* FrutiDry V43 — deterministic, render-free simulation primitives.
   The same classic script executes in browsers (including file://) and Node.js.
   This is NOT a full game-state verifier, anti-cheat, or scoring authority. */
(function (root, factory) {
  'use strict';
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') root.FrutiDrySimulation = api;
})(globalThis, function () {
  'use strict';

  // Preserve the V24-V42 mulberry32 sequence and inspect() contract bit for bit.
  function createPRNG(seed) {
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

  // Routes are fixed by seed and milestone, not CSS, Canvas or the DOM.
  function generateProceduralRoute(seed, milestoneIdx) {
    const rSeed = (seed ^ ((milestoneIdx + 1) * 0x9e3779b9)) >>> 0;
    const rng = createPRNG(rSeed);
    const mode = Math.floor(rng() * 4);
    const freqA = 1 + Math.floor(rng() * 2);
    const freqB = 1 + Math.floor(rng() * 2);
    const ampY = milestoneIdx === 0 ? 0.36 : (0.44 + rng() * 0.3);
    const laneCount = milestoneIdx === 0 ? 2 : (milestoneIdx % 2 === 1 ? 3 : 2);
    const laneSpacingY = laneCount === 3 ? 42 : 52;
    const dir = rng() > 0.5 ? 1 : -1;
    const baseSpeed = [0.0035, 0.0044, 0.0054, 0.0065, 0.0077, 0.0090][Math.min(5, milestoneIdx)];
    const speed = baseSpeed * dir;
    return {mode, freqA, freqB, ampY, laneCount, laneSpacingY, speed};
  }

  function getLaneOffsetY(laneIndex, laneCount, spacingY) {
    const centerIdx = (laneCount - 1) / 2;
    return (laneIndex - centerIdx) * spacingY;
  }

  // Geometry values must be supplied explicitly; no viewport reads in the core.
  function evalLaneAt(u, laneIndex, geometry, routeParams) {
    const rp = routeParams || {mode: 0, laneCount: 2, freqA: 1};
    const x = geometry.cx + (u - .5) * 2 * geometry.trackHalfSpan;
    const gap = geometry.slotRadius * 2.55;
    const offset = (laneIndex - (rp.laneCount - 1) / 2) * gap;
    const wave = rp.mode === 0 ? Math.sin(u * Math.PI * 2)
      : rp.mode === 1 ? Math.sin(u * Math.PI * 2 + Math.PI / 3)
      : rp.mode === 2 ? Math.cos(u * Math.PI * 2)
      : Math.sin(u * Math.PI * 4) * .7;
    return {x, y: geometry.cy + offset + wave * geometry.trackHeight * .24};
  }

  function getSlotWorldPos(index, phase, geometry, routeParams, numSlots = 9) {
    const laneCount = routeParams ? routeParams.laneCount : 2;
    const laneIndex = index % laneCount;
    const perLaneCount = Math.ceil(numSlots / laneCount);
    const posInLane = Math.floor(index / laneCount);
    const spacing = 1 / perLaneCount;
    const laneDir = laneIndex % 2 === 1 ? -1 : 1;
    const rawU = (phase * laneDir + posInLane * spacing + laneIndex * 0.17) % 1;
    const u = rawU < 0 ? rawU + 1 : rawU;
    return evalLaneAt(u, laneIndex, geometry, routeParams);
  }

  return {createPRNG, generateProceduralRoute, getLaneOffsetY, evalLaneAt, getSlotWorldPos};
});
