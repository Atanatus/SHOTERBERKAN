// V34: Visual asset diagnostics. A failed image never changes simulation rules.
// CSS backgrounds and button art have CSS fallbacks; Canvas sprites use the
// existing geometric drawings. The registry is intentionally read-only for QA.
const AssetHealth = (() => {
  const records = new Map();
  const notification = document.getElementById('assetNotice');
  const detail = document.getElementById('assetDetails');
  let queued = false;

  function report() {
    queued = false;
    const failed = [...records.values()].filter(e => e.status === 'failed');
    notification.hidden = failed.length === 0;
    notification.dataset.failed = String(failed.length);
    detail.textContent = failed.length ? `${failed.length} recurso(s) gráficos sin cargar. FrutiDry utiliza dibujos alternativos. Recarga para reintentar.` : '';
    document.documentElement.classList.toggle('asset-bg-failed-portrait', failed.some(e => e.src.endsWith('/santuario-vertical.webp')));
    document.documentElement.classList.toggle('asset-bg-failed-landscape', failed.some(e => e.src.endsWith('/santuario-panoramico.webp')));
  }
  function queueReport() {
    if (queued) return;
    queued = true;
    queueMicrotask(report);
  }
  function track(img, src, category = 'sprite') {
    if (!(img instanceof HTMLImageElement)) throw TypeError('Se esperaba una imagen');
    const path = String(src);
    let entry = records.get(path);
    if (!entry) {
      entry = {src: path, category, status: 'loading'};
      records.set(path, entry);
    }
    img.addEventListener('load', () => {
      entry.status = 'ready';
      queueReport();
    }, {once:true});
    img.addEventListener('error', () => {
      entry.status = 'failed';
      if (category === 'relic') {
        img.hidden = true;
        img.parentElement?.classList.add('relic-art-unavailable');
      }
      queueReport();
    }, {once:true});
    img.src = path;
    return img;
  }
  function image(src, category = 'sprite') {return track(new Image(), src, category);}
  function summary() {
    const result = {total:records.size, ready:0, loading:0, failed:0, paths:[]};
    for(const entry of records.values()) {
      result[entry.status]++;
      if(entry.status === 'failed') result.paths.push(entry.src);
    }
    return result;
  }
  // Watch CSS art too. Browser cache prevents a redundant transfer of a URL.
  for (const src of [
    'assets/background/santuario-vertical.webp',
    'assets/background/santuario-panoramico.webp',
    'assets/ui/boton-rubi.webp', 'assets/ui/boton-amatista.webp',
    'assets/ui/boton-zafiro.webp', 'assets/ui/boton-esmeralda.webp',
    'assets/ui/boton-ambar.webp', 'assets/ui/boton-obsidiana.webp'
  ]) image(src, src.includes('/background/') ? 'background' : 'ui');
  document.getElementById('assetReload').addEventListener('click', () => location.reload());
  return Object.freeze({image, track, summary});
})();
