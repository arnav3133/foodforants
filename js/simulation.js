const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity:'grapheme'}) : null;
export function textUnits(text) {
  return segmenter ? Array.from(segmenter.segment(text), part => part.segment) : Array.from(text);
}

function trackedWidth(context,text,spacing) {
  if ('letterSpacing' in context) { context.letterSpacing=`${spacing}px`; return context.measureText(text).width; }
  const units=textUnits(text);
  return units.reduce((sum,unit)=>sum+context.measureText(unit).width,0)+Math.max(0,units.length-1)*spacing;
}

function drawTracked(context,text,centerX,y,spacing) {
  if ('letterSpacing' in context) { context.letterSpacing=`${spacing}px`; context.textAlign='center'; context.fillText(text,centerX,y); return; }
  const units=textUnits(text), total=trackedWidth(context,text,spacing);
  let x=centerX-total/2; context.textAlign='left';
  for (const unit of units) { context.fillText(unit,x,y); x+=context.measureText(unit).width+spacing; }
}

function wrapLines(measure, text, font, size, maxWidth, tracking) {
  measure.font = `600 ${size}px ${font}`;
  const spacing=size*tracking;
  const lines = [];
  for (const sourceLine of text.split('\n')) {
    let line = '';
    for (const word of sourceLine.match(/\s+|[^\s]+/gu) || []) {
      if (trackedWidth(measure, line + word, spacing) <= maxWidth) {
        line += word;
        continue;
      }
      if (line.trimEnd()) lines.push(line.trimEnd());
      line = '';
      if (!word.trim()) continue;
      if (trackedWidth(measure, word, spacing) <= maxWidth) {
        line = word;
        continue;
      }
      for (const unit of textUnits(word)) {
        if (line && trackedWidth(measure, line + unit, spacing) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += unit;
      }
    }
    if (line || !sourceLine || !sourceLine.trim()) lines.push(line);
  }
  return lines;
}

let textMeasure;
export function layoutText(config, width, height, bounds) {
  textMeasure ??= document.createElement('canvas').getContext('2d');
  const maxWidth = bounds?.width ?? Math.max(1, Math.min(width - 24, width * .88));
  const maxHeight = bounds?.height ?? Math.max(1, Math.min(height * .54, height - 205));
  const tracking = config.tracking ?? -.055;
  const preferred = Math.max(2, Number(config.size) || 88);
  const measureAt = size => {
    const lines = wrapLines(textMeasure, config.text, config.font, size, maxWidth, tracking);
    const lineHeight = size * 1.12;
    const widest = Math.max(0, ...lines.map(line => trackedWidth(textMeasure, line, size * tracking)));
    return { size, lines, lineHeight, height:lines.length * lineHeight, widest };
  };
  const fits = item => item.height <= maxHeight && item.widest <= maxWidth;
  let layout = measureAt(preferred);
  if (!fits(layout)) {
    let low = 2, high = Math.floor(preferred);
    layout = measureAt(low);
    while (low <= high) {
      const mid = Math.floor((low + high) / 2), candidate = measureAt(mid);
      if (fits(candidate)) {
        layout = candidate;
        low = mid + 1;
      } else high = mid - 1;
    }
  }
  return { ...layout, maxWidth, maxHeight, tracking, preferred };
}

export function paintText(ctx, config, layout, x, y) {
  ctx.fillStyle = config.textColor || '#5b5b5b';
  ctx.font = `600 ${layout.size}px ${config.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText('Mg');
  const ascent = metrics.fontBoundingBoxAscent ?? layout.size * .8;
  const descent = metrics.fontBoundingBoxDescent ?? layout.size * .2;
  const first = y - layout.height / 2 + (layout.lineHeight + ascent - descent) / 2;
  layout.lines.forEach((line, index) =>
    drawTracked(ctx, line, x, first + index * layout.lineHeight, layout.size * layout.tracking));
}

export function createSimulation(canvas) {
  let ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  let width = 1, height = 1, dpr = 1;
  let raf = 0, lastTime = 0, accumulator = 0, lastProgressEmit = 0;
  let paused = false, hiddenPause = false, wasPaused = false;
  let state = 'editing', age = 0, body = null, mask = null, silhouetteCanvas = null, silhouetteCtx = null, silhouetteScale = 1;
  let ants = [], crumbs = [], trails = [], boundary = [], boundaryFlags = null, textLayers = [];
  let hasRaster = false;
  let biteHistory = null;
  let stainDuration = Infinity;
  let timedStain = null;
  let stainTime = 0;
  let elapsed = 0;
  let emittedSecond = 0;
  let total = 0, remaining = 0, source = '', cycleConfig = null, bites = 0;
  let biteTokens = 0;
  const biteBrushes = new Map();
  let onUpdate = () => {};
  let trailDotCount = 0, customAntUrl = null, antSprites = null, lastBoundaryCompact = 0;
  let darkMode = false;
  let antImage = new Image();
  antImage.onload = () => { antSprites = makeAntSprites(antImage); render(); };
  antImage.onerror = () => { antSprites = null; render(); };
  antImage.src = './assets/ant-default.svg';
  const antSpeedControl = document.getElementById('ant-speed');
  const antCountControl = document.getElementById('ant-count');
  const decaySpeedControl = document.getElementById('decay-speed');
  const antChaosControl = document.getElementById('ant-chaos');
  const eatingFrequencyControl = document.getElementById('eating-frequency');
  const resistanceControl = document.getElementById('resistance');
  const deformationControl = document.getElementById('deform');
  const trailsControl = document.getElementById('trails');

  // Bite radius is measured in logical mask pixels; resistance still controls cadence.
  const material = {
    soft: { rate: 1.1, radius: 5, carryAt: 380 },
    crumbly: { rate: 1.7, radius: 6, carryAt: 500 },
    firm: { rate: .68, radius: 3, carryAt: 280 }
  };

  const makeCanvas = (w, h) => {
    const result = document.createElement('canvas');
    result.width = w;
    result.height = h;
    return result;
  };

  function makeSilhouette(sourceCanvas) {
    silhouetteScale=Math.min(1,900/Math.max(sourceCanvas.width,sourceCanvas.height));
    const canvas=makeCanvas(Math.max(1,Math.ceil(sourceCanvas.width*silhouetteScale)),Math.max(1,Math.ceil(sourceCanvas.height*silhouetteScale))),context=canvas.getContext('2d');
    context.drawImage(sourceCanvas,0,0,canvas.width,canvas.height);context.globalCompositeOperation='source-in';context.fillStyle='#777';context.fillRect(0,0,canvas.width,canvas.height);context.globalCompositeOperation='source-over';
    silhouetteCanvas=canvas;silhouetteCtx=context;
  }
  function addSilhouette(image,x,y,w,h) {
    if(!silhouetteCanvas||!image)return;
    const layer=makeCanvas(Math.max(1,Math.ceil(w*silhouetteScale)),Math.max(1,Math.ceil(h*silhouetteScale))),layerCtx=layer.getContext('2d');
    layerCtx.drawImage(image,0,0,layer.width,layer.height);layerCtx.globalCompositeOperation='source-in';layerCtx.fillStyle='#777';layerCtx.fillRect(0,0,layer.width,layer.height);
    silhouetteCtx.drawImage(layer,x*silhouetteScale,y*silhouetteScale,w*silhouetteScale,h*silhouetteScale);
  }

  function recordStain(points) {
    if (!timedStain) {
      // Keep one small texture for recent bites, independent of display and export resolution.
      const scale = Math.min(1, 512 / Math.max(mask.w, mask.h));
      const w = Math.ceil(mask.w * scale), h = Math.ceil(mask.h * scale);
      const context = makeCanvas(w, h).getContext('2d');
      timedStain = {
        context, w, sx:w / mask.w, sy:h / mask.h,
        stamps:new Float32Array(w * h), coverage:new Uint16Array(w * h),
        pixels:context.createImageData(w, h), latest:0, paintedAt:-Infinity, paintedDuration:0
      };
    }
    const stain = timedStain;
    const stamp = Math.max(stainTime, .001);
    for (const index of points) {
      const x = Math.floor((index % mask.w) * stain.sx);
      const y = Math.floor(Math.floor(index / mask.w) * stain.sy);
      const pixel = y * stain.w + x;
      if (stain.stamps[pixel] && stamp - stain.stamps[pixel] >= 120) stain.coverage[pixel] = 0;
      stain.coverage[pixel] = Math.min(65535, stain.coverage[pixel] + 1);
      stain.stamps[pixel] = stamp;
    }
    stain.latest = stamp;
  }

  function timedStainIsVisible() {
    return timedStain && Number.isFinite(stainDuration) && stainDuration > 0 && stainTime - timedStain.latest < stainDuration;
  }

  function stainCanvas() {
    if (stainDuration === Infinity) return silhouetteCanvas;
    if (!timedStainIsVisible()) return null;
    const stain = timedStain;
    if (stain.paintedDuration !== stainDuration || stainTime - stain.paintedAt >= .08) {
      const { data } = stain.pixels;
      for (let i = 0; i < stain.stamps.length; i++) {
        const offset = i * 4;
        const opacity = stain.stamps[i] ? clamp(1 - (stainTime - stain.stamps[i]) / stainDuration, 0, 1) : 0;
        const coverage = Math.min(1, stain.coverage[i] * stain.sx * stain.sy);
        data[offset] = data[offset + 1] = data[offset + 2] = 119;
        data[offset + 3] = Math.round(255 * opacity * coverage);
      }
      stain.context.putImageData(stain.pixels, 0, 0);
      stain.paintedAt = stainTime;
      stain.paintedDuration = stainDuration;
    }
    return stain.context.canvas;
  }

  function setStainDuration(seconds) {
    const now = performance.now();
    if (!paused && !raf && state === 'finished') {
      stainTime += Math.max(0, (now - lastTime) / 1000);
      lastTime = now;
    }
    stainDuration = seconds;
    render();
    if (!paused && !raf && timedStainIsVisible()) {
      lastTime = now;
      raf = requestAnimationFrame(frame);
    }
  }

  // Ant artwork is normalized once at upload time; drawAnt only blits a tiny cached sprite.
  function makeAntSprites(image) {
    const sourceWidth = image?.naturalWidth || image?.width || 0;
    const sourceHeight = image?.naturalHeight || image?.height || 0;
    if (!sourceWidth || !sourceHeight) return null;
    const targetWidth = 16;
    const targetHeight = 20;
    const scale = 4;
    const fit = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const drawWidth = sourceWidth * fit;
    const drawHeight = sourceHeight * fit;
    const sprites = {};
    for (const theme of ['light', 'dark']) {
      const sprite = makeCanvas((targetWidth + 3) * scale, (targetHeight + 3) * scale);
      const spriteCtx = sprite.getContext('2d');
      spriteCtx.scale(scale, scale);
      spriteCtx.filter = theme === 'dark' ? 'grayscale(1) invert(1)' : 'grayscale(1)';
      spriteCtx.drawImage(image, (targetWidth + 3 - drawWidth) / 2, (targetHeight + 3 - drawHeight) / 2, drawWidth, drawHeight);
      sprites[theme] = sprite;
    }
    return { ...sprites, width: targetWidth + 3, height: targetHeight + 3 };
  }

  function emit() {
    emittedSecond = Math.floor(elapsed);
    onUpdate({ state, remaining, total, elapsed:emittedSecond });
  }

  function emitProgress() {
    const now=performance.now();
    if(now-lastProgressEmit<120)return;
    lastProgressEmit=now;
    emit();
  }

  function biteBrush(radius) {
    let brush=biteBrushes.get(radius);
    if(brush)return brush;
    const scale=4, extent=radius+1.45, size=Math.ceil(extent*2*scale), center=size/2;
    const canvas=makeCanvas(size,size), brushCtx=canvas.getContext('2d');
    const edge=brushCtx.createRadialGradient(center,center,0,center,center,extent*scale);
    edge.addColorStop(0,'rgba(0,0,0,1)');
    edge.addColorStop(.78,'rgba(0,0,0,1)');
    edge.addColorStop(.94,'rgba(0,0,0,.48)');
    edge.addColorStop(1,'rgba(0,0,0,0)');
    brushCtx.fillStyle=edge;
    brushCtx.fillRect(0,0,size,size);
    brush={canvas,extent:size/(2*scale)};
    biteBrushes.set(radius,brush);
    return brush;
  }

  function targetBitesPerSecond() {
    const maxAnts=Number(antCountControl.max);
    const colony=clamp((Number(antCountControl.value)-2)/(maxAnts-2),0,1);
    const walking=clamp((Number(antSpeedControl.value)-.4)/(5-.4),0,1);
    const eating=clamp((Number(eatingFrequencyControl.value)-.25)/(10-.25),0,1);
    const decay=clamp((Number(decaySpeedControl.value)-1)/9,0,1);
    const activity=colony*.24+walking*.12+eating*.36+decay*.28;
    const targetSeconds=150-120*activity;
    const preset=material[cycleConfig?.preset]||material.soft;
    const radius=preset.radius*Math.sqrt(Number(decaySpeedControl.value)||1);
    const expectedPixels=Math.PI*radius*radius*.68;
    return Math.max(1,total/Math.max(1,expectedPixels*targetSeconds));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nextDpr = Math.min(window.devicePixelRatio || 1, rect.width < 700 ? 1.25 : 2);
    if (width === rect.width && height === rect.height && dpr === nextDpr) return;
    const scaleX = rect.width / width, scaleY = rect.height / height;
    width = rect.width;
    height = rect.height;
    // Text is drawn separately at high resolution; the moving scene can use a lighter canvas on phones.
    // A small mobile resolution bump sharpens ant edges without paying for full device DPR.
    dpr = nextDpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mask && body) {
      if (body.scene) {
        body.w = width; body.h = height;
      }
      body.x = (width - body.w) / 2;
      body.y = (height - body.h) / 2;
      mask.x = body.x;
      mask.y = body.y;
      mask.sx=mask.w/body.w; mask.sy=mask.h/body.h;
      for (const ant of ants) {
        ant.x = clamp(ant.x * scaleX, -24, width + 24);
        ant.y = clamp(ant.y * scaleY, -24, height + 24);
        ant.target = null;
      }
    }
    render();
  }

  function occupied(x, y) {
    if (!mask) return false;
    const px = Math.floor((x - mask.x) * mask.sx), py = Math.floor((y - mask.y) * mask.sy);
    return px >= 0 && py >= 0 && px < mask.w && py < mask.h && mask.data[py * mask.w + px] !== 0;
  }

  function isExposed(index) {
    if (!mask || index < 0 || index >= mask.data.length || !mask.data[index]) return false;
    const x = index % mask.w, y = Math.floor(index / mask.w), stride = mask.w;
    return x === 0 || x === mask.w - 1 || y === 0 || y === mask.h - 1 ||
      !mask.data[index - 1] || !mask.data[index + 1] || !mask.data[index - stride] || !mask.data[index + stride];
  }

  function rebuildBoundary() {
    boundary = [];
    boundaryFlags = mask ? new Uint8Array(mask.data.length) : null;
    if (!mask) return;
    for (let y = 0; y < mask.h; y++) {
      for (let x = 0; x < mask.w; x++) {
        const index = y * mask.w + x;
        if (isExposed(index)) {
          boundary.push(index);
          boundaryFlags[index] = 1;
        }
      }
    }
  }

  function addBoundary(index) {
    if (isExposed(index) && !boundaryFlags[index]) {
      boundaryFlags[index] = 1;
      boundary.push(index);
    }
  }

  function targetAt(index) {
    return { x: mask.x + (index % mask.w + .5) / mask.sx, y: mask.y + (Math.floor(index / mask.w) + .5) / mask.sy, index };
  }

  function chooseTarget(avoid = null) {
    const allowed = index => {
      if (!isExposed(index)) return false;
      if (!avoid) return true;
      const target = targetAt(index), dx = target.x - avoid.x, dy = target.y - avoid.y;
      return age >= avoid.until || dx * dx + dy * dy > 58 * 58;
    };
    for (let n = 0; n < 120 && boundary.length; n++) {
      const index = boundary[(Math.random() * boundary.length) | 0];
      if (allowed(index)) return targetAt(index);
    }
    // Stale boundary entries become common late in a cycle; compact once on fallback.
    if (mask && age - lastBoundaryCompact >= .45) {
      boundary = boundary.filter(isExposed);
      boundaryFlags.fill(0);
      for (const index of boundary) boundaryFlags[index] = 1;
      lastBoundaryCompact = age;
      const fresh = avoid ? boundary.filter(allowed) : boundary;
      if (fresh.length) return targetAt(fresh[(Math.random() * fresh.length) | 0]);
      if (avoid) return chooseTarget(null);
    }
    return null;
  }

  function targetNear(x, y, radius = 7) {
    const cx = Math.round((x - mask.x)*mask.sx), cy = Math.round((y - mask.y)*mask.sy);
    const nearby = [];
    for (let attempt = 0; attempt < 60; attempt++) {
      const dx = Math.round(rand(-radius, radius)), dy = Math.round(rand(-radius, radius));
      if (dx * dx + dy * dy > radius * radius) continue;
      const px = cx + dx, py = cy + dy;
      if (px < 0 || py < 0 || px >= mask.w || py >= mask.h) continue;
      const index = py * mask.w + px;
      if (isExposed(index)) nearby.push(index);
    }
    return nearby.length ? targetAt(nearby[(Math.random() * nearby.length) | 0]) : null;
  }

  function enterFromOutside(ant) {
    ant.trailX = ant.trailY = null;
    const [minY, maxY] = antTravelBand();
    const fromRight = Math.random() < .5;
    ant.x = fromRight ? width + 18 : -18;
    ant.y = rand(minY, maxY);
    ant.angle = Math.atan2(height / 2 - ant.y, width / 2 - ant.x);
  }

  // Keep entrances and exits below the top controls and above the bottom dock.
  function antTravelBand() {
    const top = Math.min(width < 700 ? 138 : 120, height * .28);
    const bottomInset = Math.min(width < 700 ? 150 : 142, height * .25);
    return [top, Math.max(top + 40, height - bottomInset)];
  }

  function spawnAnt() {
    const ant = { x: 0, y: 0, angle: 0, speed: rand(42, 60), state: 'seeking', target: null,
      load: 0, phase: rand(0, 6), warpPhase: rand(0, Math.PI * 2), wanderAngle: 0, wanderClock: rand(0, .6),
      legPhases: Array.from({ length: 6 }, () => rand(0, Math.PI * 2)),
      legRates: Array.from({ length: 6 }, () => rand(.82, 1.2)),
      turnDirection: 0, turnRun: 0, lastFood: null, patchBites: 0, bestDistance: Infinity, stuckClock: 0,
      feed: 0, exit: null, variation: rand(.8, 1.2), biteClock: rand(0, .16), retiring:false };
    enterFromOutside(ant);
    ants.push(ant);
  }

  function makeTextLayer(config, layout, sceneW, sceneH) {
    const scale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    const w = Math.min(sceneW, Math.ceil(layout.widest + layout.size * .6));
    const h = Math.min(sceneH, Math.ceil(layout.height + layout.size * .6));
    const canvasLayer = makeCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
    const layerCtx = canvasLayer.getContext('2d');
    layerCtx.scale(scale, scale);
    paintText(layerCtx, config, layout, w / 2, h / 2);
    return { canvas:canvasLayer, ctx:layerCtx, id:'primary-text', x:(sceneW-w)/2, y:(sceneH-h)/2, w, h, scale };
  }

  function copyTextLayer(item, x, y, w, h) {
    const canvasLayer = makeCanvas(item.image.width, item.image.height);
    const layerCtx = canvasLayer.getContext('2d');
    layerCtx.drawImage(item.image, 0, 0);
    return { canvas:canvasLayer, ctx:layerCtx, id:item.id, x, y, w, h, scale:canvasLayer.width/w, scaleY:canvasLayer.height/h };
  }

  async function start(config) {
    cancel();
    source = config.text;
    cycleConfig = { ...config };
    state = 'preparing';
    emit();

    const maskW = Math.max(1, Math.ceil(width)), maskH = Math.max(1, Math.ceil(height));
    const maskCanvas = makeCanvas(maskW, maskH);
    const maskCtx = maskCanvas.getContext('2d', {willReadFrequently:true});
    textLayers = [];
    hasRaster = false;
    for (const item of config.images || []) {
      const x = item.x * maskW, y = item.y * maskH, w = item.w * maskW, h = item.h * maskH;
      if (item.kind === 'live-text') {
        textLayers.push(copyTextLayer(item, x, y, w, h));
        continue;
      }
      if (item.hue) maskCtx.filter = `hue-rotate(${item.hue}deg)`;
      maskCtx.drawImage(item.image, x, y, w, h);
      hasRaster = true;
      maskCtx.filter = 'none';
    }
    if (config.text?.trim()) {
      const layout = config.layout || layoutText(config, maskW, maskH);
      textLayers.push(makeTextLayer(config, layout, maskW, maskH));
    }
    // Keep editable source canvases and the high resolution display layers separate from the bite mask.
    const occupancyCanvas = makeCanvas(maskW, maskH);
    const occupancyCtx = occupancyCanvas.getContext('2d', {willReadFrequently:true});
    occupancyCtx.drawImage(maskCanvas, 0, 0);
    for (const layer of textLayers) occupancyCtx.drawImage(layer.canvas, layer.x, layer.y, layer.w, layer.h);
    makeSilhouette(occupancyCanvas);

    const rgba = occupancyCtx.getImageData(0, 0, maskW, maskH).data;
    const cells = new Uint8Array(maskW * maskH);
    total = 0;
    for (let i = 0; i < cells.length; i++) {
      if (rgba[i * 4 + 3] > 40) { cells[i] = 1; total++; }
    }
    if (!total) throw new Error('No visible material was found. Try another image or text.');

    mask = { canvas: maskCanvas, ctx: maskCtx, w: maskW, h: maskH, data: cells, initial: cells.slice(), x: 0, y: 0 };
    remaining = total;
    biteTokens = targetBitesPerSecond() * .35;
    body = { w:width, h:height, x:0, y:0, scene:true };
    mask.x = body.x; mask.y = body.y; mask.sx=mask.w/body.w; mask.sy=mask.h/body.h;
    ants = []; crumbs = []; clearTrails(); bites = 0;
    rebuildBoundary();
    age = 0; lastBoundaryCompact = 0; paused = false; state = 'feeding';
    const colonySize = Math.max(2, Math.round(Number(antCountControl.value) || 12));
    for (let i = 0; i < colonySize; i++) spawnAnt();
    accumulator = 0;
    render();
    if (!raf) { lastTime = performance.now(); raf = requestAnimationFrame(frame); }
    emit();
  }

  function cancel() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    ants = []; crumbs = []; clearTrails(); boundary = []; boundaryFlags = null; textLayers = [];
    biteHistory = null;
    timedStain = null;
    stainTime = 0;
    elapsed = 0;
    source = '';
    cycleConfig = null;
    body = null; mask = null; silhouetteCanvas=null;silhouetteCtx=null;total = 0; remaining = 0; biteTokens = 0; paused = false; state = 'editing';
    render();
    emit();
  }

  function addImages(items) {
    if (!mask || !items?.length) throw new Error('Start a simulation before adding images.');
    if (!body.scene) {
      const offsetX = body.x, offsetY = body.y;
      const expanded = makeCanvas(Math.ceil(width), Math.ceil(height));
      const expandedCtx = expanded.getContext('2d', { willReadFrequently:true });
      expandedCtx.drawImage(mask.canvas, body.x, body.y, body.w, body.h);
      const expandedSilhouette=makeCanvas(Math.ceil(width*silhouetteScale),Math.ceil(height*silhouetteScale)),expandedSilhouetteCtx=expandedSilhouette.getContext('2d');
      expandedSilhouetteCtx.drawImage(silhouetteCanvas,body.x*silhouetteScale,body.y*silhouetteScale,body.w*silhouetteScale,body.h*silhouetteScale);silhouetteCanvas=expandedSilhouette;silhouetteCtx=expandedSilhouetteCtx;
      const rgba = expandedCtx.getImageData(0, 0, expanded.width, expanded.height).data;
      const cells = new Uint8Array(expanded.width * expanded.height);
      let count = 0;
      for (let i = 0; i < cells.length; i++) if (rgba[i * 4 + 3] > 40) { cells[i] = 1; count++; }
      total = Math.max(count, total + count - remaining);
      remaining = count;
      mask = { canvas:expanded, ctx:expandedCtx, w:expanded.width, h:expanded.height, data:cells, initial:cells.slice(), x:0, y:0, sx:1, sy:1 };
      body = { x:0, y:0, w:width, h:height, scene:true };
      for (const layer of textLayers) { layer.x += offsetX; layer.y += offsetY; }
      rebuildBoundary();
    }

    let left = mask.w, top = mask.h, right = 0, bottom = 0;
    for (const item of items) {
      const x = item.x * mask.w, y = item.y * mask.h, w = item.w * mask.w, h = item.h * mask.h;
      const iw = Math.max(1, Math.ceil(w)), ih = Math.max(1, Math.ceil(h));
      const layer = makeCanvas(iw, ih), layerCtx = layer.getContext('2d', { willReadFrequently:true });
      if(item.hue)layerCtx.filter=`hue-rotate(${item.hue}deg)`;
      layerCtx.drawImage(item.image, 0, 0, iw, ih);layerCtx.filter='none';
      if (item.kind === 'live-text') textLayers.push(copyTextLayer(item, x, y, w, h));
      else if (item.kind === 'chalk') textLayers.unshift(copyTextLayer(item, x, y, w, h));
      else {
        mask.ctx.drawImage(layer, x, y, w, h);
        hasRaster = true;
      }
      if (item.kind !== 'chalk') addSilhouette(layer, x, y, w, h);
      left = Math.min(left, Math.max(0, Math.floor(x) - 2));
      top = Math.min(top, Math.max(0, Math.floor(y) - 2));
      right = Math.max(right, Math.min(mask.w, Math.ceil(x + w) + 2));
      bottom = Math.max(bottom, Math.min(mask.h, Math.ceil(y + h) + 2));
    }

    const patch = makeCanvas(right - left, bottom - top);
    const patchCtx = patch.getContext('2d', {willReadFrequently:true});
    patchCtx.drawImage(mask.canvas, -left, -top);
    for (const layer of textLayers) {
      if (layer.x >= right || layer.y >= bottom || layer.x + layer.w <= left || layer.y + layer.h <= top) continue;
      patchCtx.drawImage(layer.canvas, layer.x - left, layer.y - top, layer.w, layer.h);
    }
    const scan = patchCtx.getImageData(0, 0, patch.width, patch.height).data;
    let added = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const local = ((y - top) * (right - left) + x - left) * 4;
      if (scan[local + 3] <= 40) continue;
      const index = y * mask.w + x;
      if (mask.data[index]) continue;
      mask.data[index] = 1;
      added++;
      addBoundary(index);
      if (x > 0) addBoundary(index - 1);
      if (x + 1 < mask.w) addBoundary(index + 1);
      if (y > 0) addBoundary(index - mask.w);
      if (y + 1 < mask.h) addBoundary(index + mask.w);
    }
    if (added) {
      total += added; remaining += added;
      state = 'feeding';
      for (const ant of ants) {
        ant.state = 'seeking'; ant.target = null; ant.exit = null; ant.load = 0;
        ant.feed = 0; ant.patchBites = 0; ant.lastFood = null;
      }
      if (!ants.length) for (let i = 0; i < Math.max(2,Math.round(Number(antCountControl.value)||12)); i++) spawnAnt();
    }
    if (!raf && !paused && state === 'feeding') {
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    emit(); render();
    return added;
  }

  function removeLiveChalk(ids) {
    const removed = textLayers.filter(layer => ids.includes(layer.id));
    if (!mask || !removed.length) return;
    textLayers = textLayers.filter(layer => !ids.includes(layer.id));
    const left = Math.max(0, Math.floor(Math.min(...removed.map(layer => layer.x))));
    const top = Math.max(0, Math.floor(Math.min(...removed.map(layer => layer.y))));
    const right = Math.min(mask.w, Math.ceil(Math.max(...removed.map(layer => layer.x + layer.w))));
    const bottom = Math.min(mask.h, Math.ceil(Math.max(...removed.map(layer => layer.y + layer.h))));
    const patch = makeCanvas(right - left, bottom - top);
    const ctx = patch.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(mask.canvas, -left, -top);
    for (const layer of textLayers) {
      if (layer.x >= right || layer.y >= bottom || layer.x + layer.w <= left || layer.y + layer.h <= top) continue;
      ctx.drawImage(layer.canvas, layer.x - left, layer.y - top, layer.w, layer.h);
    }
    const pixels = ctx.getImageData(0, 0, patch.width, patch.height).data;
    let gone = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const index = y * mask.w + x;
      if (!mask.data[index] || pixels[((y - top) * patch.width + x - left) * 4 + 3] > 40) continue;
      mask.data[index] = 0;
      gone++;
    }
    remaining -= gone;
    total -= gone;
    rebuildBoundary();
    render();
    emit();
  }

  function updatePrimaryText(config) {
    if (!mask || !config.text.trim()) return false;
    const index = textLayers.findIndex(layer => layer.id === 'primary-text');
    if (index === -1) return false;
    const prior = textLayers[index];
    const next = makeTextLayer(config, layoutText(config, mask.w, mask.h), mask.w, mask.h);
    if (biteHistory) {
      next.ctx.save();
      next.ctx.globalCompositeOperation = 'destination-out';
      next.ctx.drawImage(biteHistory.canvas, -next.x, -next.y);
      next.ctx.restore();
    }
    textLayers[index] = next;

    const left = Math.max(0, Math.floor(Math.min(prior.x, next.x)));
    const top = Math.max(0, Math.floor(Math.min(prior.y, next.y)));
    const right = Math.min(mask.w, Math.ceil(Math.max(prior.x + prior.w, next.x + next.w)));
    const bottom = Math.min(mask.h, Math.ceil(Math.max(prior.y + prior.h, next.y + next.h)));
    const patch = makeCanvas(right - left, bottom - top);
    const context = patch.getContext('2d', {willReadFrequently:true});
    context.drawImage(mask.canvas, -left, -top);
    for (const layer of textLayers) {
      if (layer.x >= right || layer.y >= bottom || layer.x + layer.w <= left || layer.y + layer.h <= top) continue;
      context.drawImage(layer.canvas, layer.x-left, layer.y-top, layer.w, layer.h);
    }
    const pixels = context.getImageData(0, 0, patch.width, patch.height).data;
    let delta = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const position = y * mask.w + x;
      const present = pixels[((y-top) * patch.width+x-left) * 4 + 3] > 40 ? 1 : 0;
      delta += present - mask.data[position];
      mask.data[position] = present;
    }
    remaining += delta;
    total += delta;
    rebuildBoundary();
    if (remaining > 0 && state !== 'feeding') {
      state = 'feeding';
      if (!ants.length) for (let i = 0; i < Number(antCountControl.value); i++) spawnAnt();
      if (!paused && !raf) {
        lastTime = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }
    emit();
    render();
    return true;
  }

  function bite(ant) {
    if (!ant.target || !mask || !occupied(ant.target.x, ant.target.y)) {
      ant.target = chooseTarget(ant.lastFood);
      ant.state = ant.target ? 'seeking' : 'exiting';
      return;
    }
    const centerX = Math.floor((ant.target.x-mask.x)*mask.sx), centerY = Math.floor((ant.target.y-mask.y)*mask.sy);
    const preset = material[cycleConfig.preset] || material.soft;
    const biteRadius = Math.max(1, Math.round(preset.radius * Math.sqrt(Number(decaySpeedControl.value) || 1)));
    const points = [];
    for (let dy = -biteRadius; dy <= biteRadius; dy++) {
      for (let dx = -biteRadius; dx <= biteRadius; dx++) {
        if (dx * dx + dy * dy > biteRadius * biteRadius + .25) continue;
        const x = centerX + dx, y = centerY + dy;
        if (x < 0 || y < 0 || x >= mask.w || y >= mask.h) continue;
        const index = y * mask.w + x;
        if (mask.data[index]) points.push(index);
      }
    }
    if (!points.length) return;
    if (biteTokens < 1) return;
    biteTokens -= 1;

    let removed = 0;
    for (const index of points) {
      if (!mask.data[index]) continue;
      mask.data[index] = 0;
      removed++;
    }
    recordStain(points);
    const brush=biteBrush(biteRadius), feather=brush.extent;
    if (!biteHistory && source.trim()) biteHistory = makeCanvas(mask.w, mask.h).getContext('2d');
    if (biteHistory) biteHistory.drawImage(brush.canvas, centerX+.5-feather, centerY+.5-feather, feather*2, feather*2);
    if (hasRaster) {
      mask.ctx.save();
      mask.ctx.globalCompositeOperation = 'destination-out';
      mask.ctx.drawImage(brush.canvas,centerX+.5-feather,centerY+.5-feather,feather*2,feather*2);
      mask.ctx.restore();
    }
    for (const layer of textLayers) {
      const localX = centerX - layer.x, localY = centerY - layer.y;
      if (localX < -feather || localY < -feather || localX > layer.w + feather || localY > layer.h + feather) continue;
      const highResCtx = layer.ctx;
      highResCtx.save();
      highResCtx.setTransform(layer.scale, 0, 0, layer.scaleY ?? layer.scale, 0, 0);
      highResCtx.globalCompositeOperation = 'destination-out';
      highResCtx.drawImage(brush.canvas,localX+.5-feather,localY+.5-feather,feather*2,feather*2);
      highResCtx.restore();
    }
    remaining -= removed;
    ant.load += removed;
    ant.feed += removed;
    ant.patchBites++;
    ant.lastFood = { x: ant.target.x, y: ant.target.y, until: age + 18 };
    bites++;

    for (const index of points) {
      const x = index % mask.w, y = Math.floor(index / mask.w);
      if (x > 0) addBoundary(index - 1);
      if (x + 1 < mask.w) addBoundary(index + 1);
      if (y > 0) addBoundary(index - mask.w);
      if (y + 1 < mask.h) addBoundary(index + mask.w);
    }
    const crumbLimit = width < 700 ? 56 : 140;
    if (Math.random() < .35 && crumbs.length < crumbLimit) {
      crumbs.push({ x: ant.target.x, y: ant.target.y, vx: rand(-15, 15), vy: rand(-23, -7), life: rand(.35, .8), size: rand(1.2, 2.5) });
    }

    const carryAmount=preset.carryAt*(Number(decaySpeedControl.value)||1);
    const next = ant.feed >= carryAmount || ant.patchBites >= 10 ? null : targetNear(ant.target.x, ant.target.y, 4);
    if (next) { ant.target = next; ant.state = 'feeding'; }
    else { ant.target = null; ant.state = ant.load ? 'carrying' : 'seeking'; ant.exit = ant.load ? exitPoint(ant) : null; }
  }

  function exitPoint(ant) {
    const [minY, maxY] = antTravelBand();
    const y = clamp(ant.y, minY, maxY);
    const options = [{ x: -25, y }, { x: width + 25, y }];
    return options.sort((a, b) => Math.hypot(a.x - ant.x, a.y - ant.y) - Math.hypot(b.x - ant.x, b.y - ant.y))[0];
  }

  function steer(ant, target, dt) {
    const chaos = Number(antChaosControl.value) / 100;
    // Brief random heading offsets create a wandering path without accumulating into circles.
    ant.wanderClock -= dt;
    if (ant.wanderClock <= 0) {
      ant.wanderAngle = rand(-1, 1) * chaos * 1.3;
      ant.wanderClock = rand(.3, .9);
    }
    const desired = Math.atan2(target.y - ant.y, target.x - ant.x) + ant.wanderAngle;
    const turn = Math.atan2(Math.sin(desired - ant.angle), Math.cos(desired - ant.angle));
    const previousAngle = ant.angle;
    ant.angle += clamp(turn, -dt * (2.5 + chaos * .7), dt * (2.5 + chaos * .7));
    const headingChange = Math.atan2(Math.sin(ant.angle - previousAngle), Math.cos(ant.angle - previousAngle));
    const turnDirection = Math.sign(headingChange);
    if (turnDirection) {
      if (turnDirection === ant.turnDirection) ant.turnRun += Math.abs(headingChange);
      else { ant.turnDirection = turnDirection; ant.turnRun = Math.abs(headingChange); }
    }
    // Break a full orbit early, and reroute ants that stop closing distance to a target.
    const targetDistance = Math.hypot(target.x - ant.x, target.y - ant.y);
    if (targetDistance < ant.bestDistance - 1) { ant.bestDistance = targetDistance; ant.stuckClock = 0; }
    else ant.stuckClock += dt;
    if (ant.turnRun >= Math.PI * 2 || ant.stuckClock > 2.6) {
      ant.turnRun = 0; ant.turnDirection = 0; ant.wanderAngle = 0; ant.wanderClock = rand(.4, .8);
      if (ant.state === 'seeking') {
        ant.lastFood = { x: ant.x, y: ant.y, until: age + 12 };
        ant.target = chooseTarget(ant.lastFood);
      } else {
        const [minY, maxY] = antTravelBand();
        ant.exit = { x: ant.x < width / 2 ? width + 25 : -25, y: clamp(ant.y, minY, maxY) };
      }
      ant.bestDistance = Infinity; ant.stuckClock = 0;
    }
    const pace = Number(antSpeedControl.value);
    ant.x += Math.cos(ant.angle) * ant.speed * ant.variation * pace * dt;
    ant.y += Math.sin(ant.angle) * ant.speed * ant.variation * pace * dt;
  }

  function updateAnts(dt) {
    const bitesBefore = bites;
    const antLimit = Math.max(2, Math.round(Number(antCountControl.value) || 24));
    if (state === 'feeding' && ants.length > antLimit) {
      let excess = ants.length - antLimit;
      for (let index = ants.length - 1; index >= 0 && excess > 0; index--) {
        const ant = ants[index];
        if (ant.retiring) continue;
        ant.retiring = true; ant.state = 'exiting'; ant.target = null; ant.load = 0; ant.exit = exitPoint(ant); excess--;
      }
    }
    if (state === 'feeding' && ants.length < antLimit && Math.random() < dt * 2.5) spawnAnt();
    const frequency = Number(eatingFrequencyControl.value);
    const resistance = Number(resistanceControl.value) / 100;
    const preset = material[cycleConfig.preset] || material.soft;
    for (let index = ants.length - 1; index >= 0; index--) {
      const ant = ants[index];
      ant.phase += dt * (ant.state === 'feeding' ? 1 : 8);
      if (ant.state === 'seeking') {
        if (!ant.target || !occupied(ant.target.x, ant.target.y)) {
          ant.target = chooseTarget(ant.lastFood);
          ant.bestDistance = Infinity; ant.stuckClock = 0;
        }
        if (!ant.target) { ant.state = ant.load ? 'carrying' : 'exiting'; ant.exit = exitPoint(ant); }
        else if (Math.hypot(ant.target.x - ant.x, ant.target.y - ant.y) < 4) { ant.state = 'feeding'; ant.feed = 0; ant.patchBites = 0; ant.turnRun = 0; ant.turnDirection = 0; }
        else steer(ant, ant.target, dt);
      } else if (ant.state === 'feeding') {
        if (!ant.target || !occupied(ant.target.x, ant.target.y)) {
          ant.target = chooseTarget(ant.lastFood);
          ant.bestDistance = Infinity; ant.stuckClock = 0;
          ant.state = ant.target ? 'seeking' : (ant.load ? 'carrying' : 'exiting');
          if (!ant.target) { ant.exit = exitPoint(ant); ant.bestDistance = Infinity; ant.stuckClock = 0; }
        } else {
          ant.x += (ant.target.x - ant.x) * Math.min(1, dt * 7);
          ant.y += (ant.target.y - ant.y) * Math.min(1, dt * 7);
          // Eating frequency changes bites per second independently of walking speed.
          ant.biteClock = Math.min(4,ant.biteClock + dt * 14 * frequency * (1 - resistance * .82) * preset.rate);
          const biteLimit = width < 700 ? 2 : 6;
          let biteCount = 0;
          while (ant.biteClock >= 1 && biteTokens >= 1 && ant.state === 'feeding' && biteCount++ < biteLimit) { ant.biteClock -= 1; bite(ant); }
        }
      } else if (ant.state === 'carrying' || ant.state === 'exiting') {
        ant.exit ||= exitPoint(ant);
        steer(ant, ant.exit, dt);
        const hasLeft = ant.x < -24 || ant.x > width + 24 || ant.y < -24 || ant.y > height + 24;
        if (hasLeft) {
          if (remaining > 0 && ant.state === 'carrying') {
            ant.load = 0; ant.feed = 0; ant.target = null; ant.state = 'seeking'; enterFromOutside(ant);
          } else ants.splice(index, 1);
        }
      }
    }
    if (bites > bitesBefore) emitProgress();
  }

  function clearTrails() {
    trails = [];
    trailDotCount = 0;
    for (const ant of ants) ant.trailX = ant.trailY = null;
  }

  function trailDotLimit() { return width < 700 ? 4200 : 8000; }

  function updateTrails() {
    const duration = Number(trailsControl.value);
    if (duration <= 0) {
      if (trails.length) clearTrails();
      return;
    }
    while (trails.length && age - trails[0].born >= duration) trailDotCount -= trails.shift().count;

    const spacing = 5.5, radius = 1.1;
    const slice = Math.floor(age / .15);
    let batch = trails.at(-1);
    for (const ant of ants) {
      if (ant.state === 'feeding' || ant.x < 0 || ant.x > width || ant.y < 0 || ant.y > height) {
        ant.trailX = ant.trailY = null;
        continue;
      }
      if (ant.trailX == null) {
        ant.trailX = ant.x;
        ant.trailY = ant.y;
        continue;
      }
      const dx = ant.x - ant.trailX, dy = ant.y - ant.trailY, distance = Math.hypot(dx, dy);
      const steps = Math.floor(distance / spacing);
      if (!steps) continue;
      if (batch?.slice !== slice) {
        batch = { slice, born:age, path:new Path2D(), count:0 };
        trails.push(batch);
      }
      const sx = dx / distance * spacing, sy = dy / distance * spacing;
      for (let step = 0; step < steps; step++) {
        ant.trailX += sx;
        ant.trailY += sy;
        batch.path.moveTo(ant.trailX + radius, ant.trailY);
        batch.path.arc(ant.trailX, ant.trailY, radius, 0, Math.PI * 2);
      }
      batch.count += steps;
      trailDotCount += steps;
    }
    const dotLimit = trailDotLimit();
    while (trailDotCount > dotLimit && trails.length > 1) trailDotCount -= trails.shift().count;
  }

  function drawTrails() {
    const duration = Number(trailsControl.value);
    if (duration <= 0 || !trails.length) return;
    ctx.fillStyle = darkMode ? '#ededed' : '#444';
    const time = age + accumulator;
    const dotLimit = trailDotLimit(), fadeBand = dotLimit * .2;
    let dotsAhead = trailDotCount;
    for (const trail of trails) {
      const budgetFade = clamp((dotLimit - dotsAhead) / fadeBand, 0, 1);
      dotsAhead -= trail.count;
      const strength = clamp(1 - (time - trail.born) / duration, 0, 1) * budgetFade;
      if (strength <= 0) continue;
      ctx.globalAlpha = .72 * strength * strength * (3 - 2 * strength);
      ctx.fill(trail.path);
    }
    ctx.globalAlpha = 1;
  }

  function update(dt) {
    if (paused || !body) return;
    age += dt;
    biteTokens=Math.min(biteTokens+targetBitesPerSecond()*dt,Math.max(1,targetBitesPerSecond()*.5));
    updateAnts(dt);
    updateTrails();
    for (let i = crumbs.length - 1; i >= 0; i--) {
      const crumb = crumbs[i];
      crumb.life -= dt; crumb.x += crumb.vx * dt; crumb.y += crumb.vy * dt; crumb.vy += 55 * dt;
      if (crumb.life <= 0) crumbs.splice(i, 1);
    }
    if (remaining === 0 && state !== 'finished') {
      state = 'clearing';
      if (!ants.length && !crumbs.length) { state = 'finished'; emit(); }
    }
  }

  function drawDefaultLegs(ant, walking) {
    const reach = [5.4, 7.4, 6.1], rootY = [-2.8, -1.2, .45], tipY = [-5.05, -1.15, 3.65];
    ctx.save();
    ctx.strokeStyle = darkMode ? '#f0f0f0' : '#181818'; ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = .95; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const knees=[];
    ctx.beginPath();
    for (let leg = 0; leg < 6; leg++) {
      const pair = Math.floor(leg / 2), side = leg % 2 === 0 ? -1 : 1;
      const rate = ant.legRates?.[leg] ?? (1 + leg * .037);
      const phase = ant.phase * rate + (ant.legPhases?.[leg] ?? leg * 1.13);
      const swing = Math.sin(phase), lift = Math.max(0, Math.cos(phase)) * (walking ? 1.2 : .2);
      const stride = walking ? 1.35 : .2;
      const footX = side * (reach[pair] + swing * stride);
      const footY = tipY[pair] - lift + Math.sin(phase * .73) * stride * .45;
      const kneeX = side * (reach[pair] * .46 + Math.cos(phase + .6) * stride * .28);
      const kneeY = rootY[pair] + (footY - rootY[pair]) * .5;
      knees.push([kneeX,kneeY]);
      ctx.moveTo(0, rootY[pair]); ctx.lineTo(kneeX, kneeY); ctx.lineTo(footX, footY);
    }
    ctx.stroke();
    ctx.beginPath();
    for(const [kneeX,kneeY] of knees){
      ctx.moveTo(kneeX+.48,kneeY);ctx.arc(kneeX,kneeY,.48,0,Math.PI*2);
    }
    ctx.fill();
    ctx.restore();
  }

  function drawAnt(ant) {
    const walking = ant.state !== 'feeding';
    const gait = Math.sin(ant.phase * 1.4 + ant.warpPhase);
    const bob = walking ? Math.abs(gait) * .42 : Math.sin(ant.phase * .25 + ant.warpPhase) * .12;
    const wobble = Math.sin(ant.phase * .8 + ant.warpPhase) * (walking ? .065 : .025);
    const custom = !!customAntUrl;
    if (antSprites) {
      ctx.save(); ctx.translate(ant.x + Math.cos(ant.angle) * bob, ant.y + Math.sin(ant.angle) * bob);
      // Artwork is top-facing: its top edge is the head for both default and custom ants.
      ctx.rotate(ant.angle + Math.PI / 2 + wobble);
      ctx.transform(1, gait * (walking ? .035 : .012), -gait * .022, 1, 0, 0);
      ctx.scale(1 + gait * .035, 1 - gait * .025);
      if (!custom) drawDefaultLegs(ant, walking);
      ctx.drawImage(darkMode ? antSprites.dark : antSprites.light, -antSprites.width / 2, -antSprites.height / 2, antSprites.width, antSprites.height);
      ctx.restore(); return;
    }
    ctx.save(); ctx.translate(ant.x + Math.cos(ant.angle) * bob, ant.y + Math.sin(ant.angle) * bob);
    ctx.rotate(ant.angle + Math.PI / 2 + wobble); ctx.transform(1, gait * .035, -gait * .022, 1, 0, 0);
    ctx.fillStyle = darkMode ? '#f0f0f0' : '#181818'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = .9;
    drawDefaultLegs(ant, walking);
    ctx.beginPath(); ctx.ellipse(0, 5, 2.2, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -2, 2, 2.65, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -6.4, 2.15, 2.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-.65, -8.1); ctx.quadraticCurveTo(-1.15, -8.9, -1.25, -9.4); ctx.moveTo(.65, -8.1); ctx.quadraticCurveTo(1.15, -8.9, 1.25, -9.4); ctx.stroke();
    if (ant.load) { ctx.fillStyle = darkMode ? '#aaa' : '#9a9a9a'; ctx.beginPath(); ctx.arc(0, 10, 1.55, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = darkMode ? '#252525' : '#e7e7e7'; ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    if (body && mask) {
      const deform = Number(deformationControl.value) / 100;
      const sag = Math.sin(age * .14) * deform * Math.min(mask.h * .03, 3);
      const stain = stainCanvas();
      if (stain) {
        ctx.globalAlpha = .12;
        ctx.drawImage(stain, body.x, body.y + sag, body.w, body.h);
        ctx.globalAlpha = 1;
      }
      if (hasRaster) ctx.drawImage(mask.canvas, body.x, body.y + sag, body.w, body.h);
      for (const layer of textLayers) {
        const layerX = body.x + layer.x / mask.sx;
        const layerY = body.y + layer.y / mask.sy + sag;
        ctx.drawImage(layer.canvas, layerX, layerY, layer.w / mask.sx, layer.h / mask.sy);
      }
    }
    drawTrails();
    for (const crumb of crumbs) {
      ctx.globalAlpha = clamp(crumb.life / .8, 0, 1); ctx.fillStyle = '#989898';
      ctx.beginPath(); ctx.arc(crumb.x, crumb.y, crumb.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const ant of ants) drawAnt(ant);
  }

  function frame(now) {
    if (!raf) return;
    const frameSeconds = Math.max(0, (now - lastTime) / 1000);
    const dt = Math.min(.05, frameSeconds);
    lastTime = now;
    if (!paused) {
      stainTime += frameSeconds;
      if (state === 'feeding' || state === 'clearing') elapsed += frameSeconds;
      const step = 1 / 60;
      accumulator += dt;
      while (accumulator >= step) { update(step); accumulator -= step; }
      if (Math.floor(elapsed) !== emittedSecond) emit();
    }
    render();
    raf = state === 'finished' && !trails.length && !timedStainIsVisible() ? 0 : requestAnimationFrame(frame);
  }

  function pause() { paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function resume() { paused = false; lastTime = performance.now(); if (!raf && body) raf = requestAnimationFrame(frame); }
  function pauseForHidden() { if (!paused) { wasPaused = paused; paused = true; hiddenPause = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } } }
  function resumeFromHidden() { if (hiddenPause) { paused = wasPaused; hiddenPause = false; lastTime = performance.now(); if (!paused && !raf && body) raf = requestAnimationFrame(frame); } }
  function exportPng() {
    if (!body) throw new Error('There is no scene to export yet.');
    const scale = Math.max(3, dpr);
    const output = makeCanvas(Math.round(width * scale), Math.round(height * scale));
    const liveContext = ctx;
    ctx = output.getContext('2d', {alpha:false});
    try {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingQuality = 'high';
      render();
    } finally {
      ctx = liveContext;
    }
    output.toBlob(blob => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'natural-decay.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/png');
  }

  function setAntImage(image, url = null) {
    if (customAntUrl) URL.revokeObjectURL(customAntUrl);
    customAntUrl = url;
    antSprites = image ? makeAntSprites(image) : null;
    antImage = image || new Image();
    if (!image) {
      antImage.onload = () => { antSprites = makeAntSprites(antImage); render(); };
      antImage.onerror = () => { antSprites = null; render(); };
      antImage.src = './assets/ant-default.svg';
    }
    render();
  }

  return {
    start, addImages, removeLiveChalk, updatePrimaryText, cancel, pause, resume, pauseForHidden, resumeFromHidden, resize, exportPng, setAntImage, setStainDuration,
    setTheme(value) { darkMode = !!value; render(); },
    refreshTrails() {
      if (Number(trailsControl.value) === 0) clearTrails();
      render();
    },
    onUpdate(callback) { onUpdate = callback; },
    isTextAt(x, y) { return !!mask && occupied(x, y); },
    get paused() { return paused; },
    get state() { return state; },
    get consumed() { return total ? 1-remaining/total : 0; },
    get originalText() { return source; }
  };
}
