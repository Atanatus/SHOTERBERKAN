import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const require = createRequire(import.meta.url);
const V = require('../js/competitive-viewport.js');

test('viewport spec is explicit and cannot be mutated by callers', () => {
  assert.equal(V.LOGICAL_WIDTH, 390);
  assert.equal(V.LOGICAL_HEIGHT, 844);
  assert.equal(V.VIEWPORT_RULES_VERSION, 'draft-390x844-v1');
  assert(Object.isFrozen(V));
});
test('opt-in is precise, disabled by default and never inferred from physical screen', () => {
  for (const q of ['', '?competitivePreview=0', '?competitivePreview=true', '?competitivePreview=01', '?preview=1', 9, null]) {
    assert.equal(V.previewRequested(q), false, String(q));
  }
  assert.equal(V.previewRequested('?competitivePreview=1'), true);
  assert.equal(V.previewRequested('?other=a&competitivePreview=1'), true);
});
test('letterboxing is proportional, within available space and keeps logical dimensions', () => {
  for (const [w,h] of [[320,500],[390,844],[844,390],[1366,688],[123.4,789.6],[1,1],[4000,3000]]) {
    const f = V.fit(w,h);
    assert.equal(f.logicalWidth, 390);
    assert.equal(f.logicalHeight, 844);
    assert(f.cssWidth <= w + 1e-8 && f.cssHeight <= h + 1e-8);
    assert(Math.abs(f.cssWidth / f.cssHeight - 390 / 844) < 1e-12);
    assert(Object.isFrozen(f));
  }
});
test('preview rejects impossible surface dimensions', () => {
  for (const [w,h] of [[0,100],[100,0],[NaN,300],[Infinity,100],[-1,100],[100,-3]]) {
    assert.throws(()=>V.fit(w,h), RangeError);
  }
});
test('pointer positions map to logical bounds on fractional CSS and zoom', () => {
  for (const [w,h] of [[275.25,595.61],[390,844],[700,1514.87],[120.5,260.76]]) {
    const rect={left:14.75,top:31.25,width:w,height:h};
    for (const [u,v] of [[0,0],[.25,.75],[.5,.5],[1,1]]) {
      const p=V.pointerToLogical(rect.left+w*u,rect.top+h*v,rect,390,844);
      assert(Math.abs(p.x-390*u) < 1e-9 && Math.abs(p.y-844*v) < 1e-9);
    }
  }
});
test('normal responsive game also gets identity input mapping', () => {
  const r={left:11,top:7,width:320,height:540};
  assert.deepEqual(V.pointerToLogical(171,277,r,320,540),{x:160,y:270});
});
test('invalid canvas rectangles are rejected', () => {
  assert.throws(()=>V.pointerToLogical(10,10,{left:0,top:0,width:0,height:200},390,844),RangeError);
  assert.throws(()=>V.pointerToLogical(10,10,{left:0,top:0,width:200,height:200},390,0),RangeError);
});
test('the same classic script works in a browser sandbox without require, document or Canvas', () => {
  const source=readFileSync(new URL('../js/competitive-viewport.js',import.meta.url),'utf8');
  const browser={URLSearchParams, Math, Number, RangeError, Object};
  browser.window=browser;
  browser.globalThis=browser;
  runInNewContext(source,browser,{timeout:1000});
  assert.equal(browser.FrutiDryViewport.LOGICAL_WIDTH,390);
  assert.equal(browser.FrutiDryViewport.fit(390,844).scale,1);
});
test('HTML loads preview coordinate transform before game.js, and banner is explicitly a test', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const vp=html.indexOf('src="js/competitive-viewport.js"');
  const game=html.indexOf('src="js/game.js"');
  assert(vp>0 && game>vp);
  assert.match(html,/id="competitivePreviewNotice"[^>]*hidden/);
  assert.match(html,/PRUEBA VISUAL 390/);
});

test('server-issued run viewport agrees exactly with visual preview', async () => {
  const mod=await import('../server/run-intake.mjs');
  assert.deepEqual(mod.RUN_LOGICAL_VIEWPORT,{width:V.LOGICAL_WIDTH,height:V.LOGICAL_HEIGHT});
});
