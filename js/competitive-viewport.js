/* FrutiDry V48 · Logical competition board; preview only, never a ranking authorization.
 * Classic JS for file:// and Node CJS. Physics uses logical coordinates while CSS scales presentation.
 */
(function (root, make) {
  'use strict';
  const api = Object.freeze(make());
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') root.FrutiDryViewport = api;
})(globalThis, function () {
  'use strict';
  const LOGICAL_WIDTH = 390;
  const LOGICAL_HEIGHT = 844;
  const VIEWPORT_RULES_VERSION = 'draft-390x844-v1';
  function validDimension(n) { return typeof n === 'number' && Number.isFinite(n) && n > 0; }
  function previewRequested(search) {
    if (typeof search !== 'string' || search.length > 2048) return false;
    return new URLSearchParams(search).get('competitivePreview') === '1';
  }
  function fit(availableWidth, availableHeight) {
    if (!validDimension(availableWidth) || !validDimension(availableHeight)) throw new RangeError('Superficie visual inválida');
    const scale = Math.min(availableWidth / LOGICAL_WIDTH, availableHeight / LOGICAL_HEIGHT);
    if (!validDimension(scale)) throw new RangeError('Escala inválida');
    return Object.freeze({
      logicalWidth: LOGICAL_WIDTH,
      logicalHeight: LOGICAL_HEIGHT,
      cssWidth: LOGICAL_WIDTH * scale,
      cssHeight: LOGICAL_HEIGHT * scale,
      scale
    });
  }
  // Uses actual getBoundingClientRect(): works with browser zoom and fractional CSS scaling.
  function pointerToLogical(clientX, clientY, rect, logicalWidth, logicalHeight) {
    if (![clientX, clientY, logicalWidth, logicalHeight].every(n => typeof n === 'number' && Number.isFinite(n)) ||
        !validDimension(logicalWidth) || !validDimension(logicalHeight) || !rect ||
        !validDimension(rect.width) || !validDimension(rect.height) ||
        !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) {
      throw new RangeError('Coordenadas o área de Canvas inválidas');
    }
    return {
      x: (clientX - rect.left) * logicalWidth / rect.width,
      y: (clientY - rect.top) * logicalHeight / rect.height
    };
  }
  return {LOGICAL_WIDTH, LOGICAL_HEIGHT, VIEWPORT_RULES_VERSION, previewRequested, fit, pointerToLogical};
});
