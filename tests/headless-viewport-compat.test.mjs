import test from 'node:test';
import assert from 'node:assert/strict';
import {createHeadlessSession} from '../server/headless-replay.mjs';

// V48 added a browser classic script that game.js reads at module startup.
// The headless VM must mirror that dependency and expose the browser URL API.
test('headless replay loads real viewport module with preview disabled', () => {
  const run=createHeadlessSession(42);
  const ctx=run.context;
  assert.equal(ctx.FrutiDryViewport.LOGICAL_WIDTH,390);
  assert.equal(ctx.FrutiDryViewport.LOGICAL_HEIGHT,844);
  assert.equal(ctx.location.search,'');
  assert.equal(ctx.FrutiDryViewport.previewRequested(ctx.location.search),false);
  assert.equal(typeof ctx.URLSearchParams,'function');
  const p=ctx.FrutiDryViewport.pointerToLogical(195,422,
    {left:0,top:0,width:390,height:844},390,844);
  assert.equal(p.x,195);
  assert.equal(p.y,422);
  assert.equal(run.inspect().snapshot.simFrame,0);
});
