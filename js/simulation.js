const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);

export function createSimulation(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  let width = 1, height = 1, dpr = 1;
  let raf = 0, lastTime = 0, lastRenderTime = 0, accumulator = 0;
  let paused = false, hiddenPause = false, wasPaused = false;
  let state = 'editing', age = 0, body = null, mask = null, silhouetteCanvas = null, silhouetteCtx = null;
  let ants = [], crumbs = [], trails = [], boundary = [], boundaryFlags = null, textLayers = [];
  let total = 0, remaining = 0, source = '', cycleConfig = null, bites = 0;
  let biteTokens = 0;
  let onUpdate = () => {};
  let trailClock = 0, customAntUrl = null, antSprites = null, lastBoundaryCompact = 0;
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
    const canvas=makeCanvas(sourceCanvas.width,sourceCanvas.height),context=canvas.getContext('2d');
    context.drawImage(sourceCanvas,0,0);context.globalCompositeOperation='source-in';context.fillStyle='#777';context.fillRect(0,0,canvas.width,canvas.height);context.globalCompositeOperation='source-over';
    silhouetteCanvas=canvas;silhouetteCtx=context;
  }
  function addSilhouette(image,x,y,w,h) {
    if(!silhouetteCanvas||!image)return;
    const layer=makeCanvas(Math.max(1,Math.ceil(w)),Math.max(1,Math.ceil(h))),layerCtx=layer.getContext('2d');
    layerCtx.drawImage(image,0,0,layer.width,layer.height);layerCtx.globalCompositeOperation='source-in';layerCtx.fillStyle='#777';layerCtx.fillRect(0,0,layer.width,layer.height);
    silhouetteCtx.drawImage(layer,x,y,w,h);
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

  function emit() { onUpdate({ state, remaining, total }); }

  function targetBitesPerSecond() {
    const maxAnts=48;
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
    const scaleX = width / rect.width, scaleY = height / rect.height;
    width = rect.width;
    height = rect.height;
    // Text is drawn separately at high resolution; the moving scene can use a lighter canvas on phones.
    // A small mobile resolution bump sharpens ant edges without paying for full device DPR.
    dpr = Math.min(window.devicePixelRatio || 1, width < 700 ? 1.25 : 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mask && body) {
      if (body.scene) {
        const scale=Math.min(width/mask.w,height/mask.h);
        body.w=mask.w*scale; body.h=mask.h*scale;
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

  function textUnits(text) {
    return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(part=>part.segment);
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

  function wrapLines(text, font, size, maxWidth, tracking) {
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `600 ${size}px ${font}`;
    const spacing=size*tracking;
    const lines = [];
    for (const sourceLine of text.split('\n')) {
      let line = '';
      for (const word of sourceLine.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (trackedWidth(measure,candidate,spacing) <= maxWidth) { line = candidate; continue; }
        if (line) lines.push(line);
        if (trackedWidth(measure,word,spacing) <= maxWidth) { line = word; continue; }
        line = '';
        for (const grapheme of textUnits(word)) {
          if (line && trackedWidth(measure,line+grapheme,spacing) > maxWidth) { lines.push(line); line = grapheme; }
          else line += grapheme;
        }
      }
      lines.push(line);
    }
    return { lines, measure };
  }

  function makeTextLayer(config, lines, size, maskW, maskH) {
    if (!lines.length) return null;
    const lineHeight = size * 1.12, spacing = size * (config.tracking || 0);
    const scale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    const canvasLayer = makeCanvas(Math.ceil(maskW * scale), Math.ceil(maskH * scale));
    const layerCtx = canvasLayer.getContext('2d'); layerCtx.scale(scale, scale);
    layerCtx.fillStyle = config.textColor || '#5b5b5b';
    layerCtx.font = `600 ${size}px ${config.font}`;
    layerCtx.textBaseline = 'alphabetic'; layerCtx.textAlign = 'center';
    const x = config.images?.length ? 0 : 0;
    const y = config.images?.length ? 0 : 0;
    const startY = config.images?.length ? maskH / 2 - lines.length * lineHeight / 2 : 0;
    for (let row = 0; row < lines.length; row++) {
      const metrics = layerCtx.measureText(lines[row]);
      const ascent = metrics.actualBoundingBoxAscent || size * .78;
      const baseline = config.images?.length
        ? startY + row * lineHeight + ascent
        : row * lineHeight + ascent + size * .2;
      drawTracked(layerCtx, lines[row], maskW / 2, baseline, spacing);
    }
    return { canvas:canvasLayer, ctx:canvasLayer.getContext('2d'), x, y, w:maskW, h:maskH, scale };
  }

  async function start(config) {
    cancel();
    source = config.text;
    cycleConfig = { ...config };
    state = 'preparing';
    emit();
    await new Promise(resolve => requestAnimationFrame(resolve));

    const maxWidth = Math.max(80, width - 90), maxHeight = Math.max(80, height * .58), minSize = 24;
    let size = config.size, lines = [], measure;
    let maskW, maskH, maskCanvas, maskCtx;
    const importedTextLayers=[];
    if (config.images?.length) {
      maskW=Math.max(1,Math.ceil(width)); maskH=Math.max(1,Math.ceil(height));
      maskCanvas=makeCanvas(maskW,maskH); maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true});
      for (const item of config.images) {
        const itemW=Math.max(1,Math.ceil(item.w*maskW)),itemH=Math.max(1,Math.ceil(item.h*maskH));
        const layerCanvas=makeCanvas(itemW,itemH),layerCtx=layerCanvas.getContext('2d',{willReadFrequently:true});
        layerCtx.drawImage(item.image,0,0,itemW,itemH);
        maskCtx.drawImage(layerCanvas,item.x*maskW,item.y*maskH,item.w*maskW,item.h*maskH);
        if(item.kind==='live-text'){
          const x=item.x*maskW,y=item.y*maskH,w=item.w*maskW,h=item.h*maskH;
          importedTextLayers.push({canvas:item.image,ctx:item.image.getContext('2d'),x,y,w,h,scale:item.image.width/Math.max(1,w)});
        }
      }
    }

    if (config.text?.trim()) {
      if (config.auto) {
        for (size = Math.min(config.size, 180); size >= minSize; size -= 2) {
          ({ lines, measure } = wrapLines(config.text, config.font, size, maxWidth, config.tracking || 0));
          const widest = Math.max(0, ...lines.map(line => trackedWidth(measure,line,size*(config.tracking||0))));
          if (lines.length * size * 1.15 <= maxHeight && widest <= maxWidth) break;
        }
        if (size < minSize) throw new Error('This text cannot fit legibly here. Shorten it or make the window larger.');
      } else {
        ({ lines, measure } = wrapLines(config.text, config.font, size, maxWidth, config.tracking || 0));
        if (lines.length * size * 1.15 > maxHeight) throw new Error('This size overflows the scene. Turn on Auto fit or choose a smaller size.');
      }
    }

    if (!config.images?.length) {
      if (!lines.length) throw new Error('Add text or an image before starting.');
      const lineHeight = size * 1.12;
      measure.font = `600 ${size}px ${config.font}`;
      const spacing=size*(config.tracking||0);
      const widths = lines.map(line => trackedWidth(measure,line,spacing));
      maskW = Math.ceil(Math.max(1, ...widths) + size * .5);
      maskH = Math.ceil(lines.length * lineHeight + size * .5);
      if (maskW > width - 24 || maskH > height * .82) throw new Error('This text needs a larger scene or less content.');
      maskCanvas = makeCanvas(maskW, maskH);
      maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
      maskCtx.fillStyle = config.textColor || '#5b5b5b';
      maskCtx.font = `600 ${size}px ${config.font}`;
      maskCtx.textBaseline = 'alphabetic'; maskCtx.textAlign = 'center';
      for (let row = 0; row < lines.length; row++) {
        const metrics = maskCtx.measureText(lines[row]);
        const ascent = metrics.actualBoundingBoxAscent || size * .78;
        drawTracked(maskCtx,lines[row],maskW/2,row*lineHeight+ascent+size*.2,spacing);
      }
    } else if (lines.length) {
      const lineHeight = size * 1.12, spacing = size * (config.tracking || 0);
      maskCtx.fillStyle = config.textColor || '#5b5b5b';
      maskCtx.font = `600 ${size}px ${config.font}`;
      maskCtx.textBaseline = 'alphabetic'; maskCtx.textAlign = 'center';
      const totalHeight = lines.length * lineHeight;
      for (let row = 0; row < lines.length; row++) {
        const metrics = maskCtx.measureText(lines[row]);
        const ascent = metrics.actualBoundingBoxAscent || size * .78;
        drawTracked(maskCtx, lines[row], maskW/2, maskH/2-totalHeight/2+row*lineHeight+ascent, spacing);
      }
    }

    textLayers = [];
    if (lines.length) {
      const vectorLayer = makeTextLayer(config, lines, size, maskW, maskH);
      if (config.images?.length) {
        vectorLayer.x = (maskW - vectorLayer.w) / 2;
        vectorLayer.y = (maskH - vectorLayer.h) / 2;
      }
      textLayers.push(vectorLayer);
    }
    textLayers.push(...importedTextLayers);

    makeSilhouette(maskCanvas);

    const rgba = maskCtx.getImageData(0, 0, maskW, maskH).data;
    const cells = new Uint8Array(maskW * maskH);
    total = 0;
    for (let i = 0; i < cells.length; i++) {
      if (rgba[i * 4 + 3] > 40) { cells[i] = 1; total++; }
    }
    if (!total) throw new Error('No visible material was found. Try another image or text.');

    mask = { canvas: maskCanvas, ctx: maskCtx, w: maskW, h: maskH, data: cells, initial: cells.slice(), x: 0, y: 0 };
    remaining = total;
    biteTokens = targetBitesPerSecond() * .35;
    body = config.images?.length
      ? { w:width,h:height,x:0,y:0,scene:true }
      : { w: maskW, h: maskH, x: (width - maskW) / 2, y: (height - maskH) / 2 };
    mask.x = body.x; mask.y = body.y; mask.sx=mask.w/body.w; mask.sy=mask.h/body.h;
    ants = []; crumbs = []; trails = []; trailClock = 0; bites = 0;
    rebuildBoundary();
    age = 0; lastBoundaryCompact = 0; paused = false; state = 'feeding';
    const colonySize = Math.max(2, Math.round(Number(antCountControl.value) || 12));
    for (let i = 0; i < colonySize; i++) spawnAnt();
    if (!raf) { lastTime = performance.now(); raf = requestAnimationFrame(frame); }
    emit();
  }

  function cancel() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    ants = []; crumbs = []; trails = []; boundary = []; boundaryFlags = null; textLayers = [];
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
      const expandedSilhouette=makeCanvas(Math.ceil(width),Math.ceil(height)),expandedSilhouetteCtx=expandedSilhouette.getContext('2d');
      expandedSilhouetteCtx.drawImage(silhouetteCanvas,body.x,body.y,body.w,body.h);silhouetteCanvas=expandedSilhouette;silhouetteCtx=expandedSilhouetteCtx;
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
      layerCtx.drawImage(item.image, 0, 0, iw, ih);
      mask.ctx.drawImage(layer, x, y, w, h);
      addSilhouette(layer,x,y,w,h);
      if (item.kind === 'live-text') {
        textLayers.push({ canvas:item.image, ctx:item.image.getContext('2d'), x, y, w, h,
          scale:item.image.width / Math.max(1, w) });
      }
      left = Math.min(left, Math.max(0, Math.floor(x) - 2));
      top = Math.min(top, Math.max(0, Math.floor(y) - 2));
      right = Math.max(right, Math.min(mask.w, Math.ceil(x + w) + 2));
      bottom = Math.max(bottom, Math.min(mask.h, Math.ceil(y + h) + 2));
    }

    const scan = mask.ctx.getImageData(left, top, right - left, bottom - top).data;
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
    emit(); render();
    return added;
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
    const feather = biteRadius + 1.45;
    const edge = mask.ctx.createRadialGradient(centerX + .5, centerY + .5, 0, centerX + .5, centerY + .5, feather);
    edge.addColorStop(0, 'rgba(0,0,0,1)');
    edge.addColorStop(.78, 'rgba(0,0,0,1)');
    edge.addColorStop(.94, 'rgba(0,0,0,.48)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    mask.ctx.save();
    mask.ctx.globalCompositeOperation = 'destination-out';
    mask.ctx.filter = width < 700 ? 'none' : 'blur(.55px)';
    mask.ctx.fillStyle = edge;
    mask.ctx.beginPath(); mask.ctx.arc(centerX + .5, centerY + .5, feather, 0, Math.PI * 2); mask.ctx.fill();
    mask.ctx.restore();
    for (const layer of textLayers) {
      const localX = centerX - layer.x, localY = centerY - layer.y;
      if (localX < -feather || localY < -feather || localX > layer.w + feather || localY > layer.h + feather) continue;
      const highResCtx = layer.ctx;
      highResCtx.save();
      highResCtx.setTransform(layer.scale, 0, 0, layer.scale, 0, 0);
      const textEdge = highResCtx.createRadialGradient(localX + .5, localY + .5, 0, localX + .5, localY + .5, feather);
      textEdge.addColorStop(0, 'rgba(0,0,0,1)');
      textEdge.addColorStop(.78, 'rgba(0,0,0,1)');
      textEdge.addColorStop(.94, 'rgba(0,0,0,.48)');
      textEdge.addColorStop(1, 'rgba(0,0,0,0)');
      highResCtx.globalCompositeOperation = 'destination-out';
      highResCtx.filter = width < 700 ? 'none' : 'blur(.45px)';
      highResCtx.fillStyle = textEdge;
      highResCtx.beginPath(); highResCtx.arc(localX + .5, localY + .5, feather, 0, Math.PI * 2); highResCtx.fill();
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
    if (bites > bitesBefore) emit();
  }

  function update(dt) {
    if (paused || !body) return;
    age += dt;
    biteTokens=Math.min(biteTokens+targetBitesPerSecond()*dt,Math.max(1,targetBitesPerSecond()*.5));
    updateAnts(dt);
    const trailDuration = Number(trailsControl.value);
    if (trailDuration <= 0) trails = [];
    else {
      trailClock += dt;
      if (trailClock >= .075) {
        trailClock = 0;
        const life = trailDuration;
        const trailLimit = width < 700 ? 320 : 7000;
        for (const ant of ants) if (ant.state !== 'feeding' && trails.length < trailLimit)
          trails.push({ x:ant.x, y:ant.y, age:0, life, size:.65 + trailDuration * .035 });
      }
      for (let i = trails.length - 1; i >= 0; i--) { trails[i].age += dt; if (trails[i].age >= trails[i].life) trails.splice(i, 1); }
    }
    for (let i = crumbs.length - 1; i >= 0; i--) {
      const crumb = crumbs[i];
      crumb.life -= dt; crumb.x += crumb.vx * dt; crumb.y += crumb.vy * dt; crumb.vy += 55 * dt;
      if (crumb.life <= 0) crumbs.splice(i, 1);
    }
    if (remaining === 0) {
      state = 'clearing';
      if (!ants.length && !crumbs.length) { state = 'finished'; emit(); }
    }
  }

  function drawDefaultLegs(ant, walking) {
    const reach = [5.4, 7.4, 6.1], rootY = [-2.8, -1.2, .45], tipY = [-5.05, -1.15, 3.65];
    ctx.save();
    ctx.strokeStyle = darkMode ? '#f0f0f0' : '#181818'; ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = .95; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
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
      ctx.beginPath(); ctx.moveTo(0, rootY[pair]); ctx.lineTo(kneeX, kneeY); ctx.lineTo(footX, footY); ctx.stroke();
      ctx.beginPath(); ctx.arc(kneeX, kneeY, .48, 0, Math.PI * 2); ctx.fill();
    }
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
    for (const trail of trails) {
      ctx.globalAlpha = clamp(1 - trail.age / trail.life, 0, 1) * .42;
      ctx.fillStyle = darkMode ? '#bdbdbd' : '#555'; ctx.beginPath(); ctx.arc(trail.x, trail.y, trail.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (body && mask) {
      const deform = Number(deformationControl.value) / 100;
      const sag = Math.sin(age * .14) * deform * Math.min(mask.h * .03, 3);
      if(silhouetteCanvas){ctx.globalAlpha=.12;ctx.drawImage(silhouetteCanvas,body.x,body.y+sag,body.w,body.h);ctx.globalAlpha=1;}
      ctx.drawImage(mask.canvas, body.x, body.y + sag, body.w, body.h);
      for (const layer of textLayers) {
        const layerX = body.x + layer.x / mask.sx;
        const layerY = body.y + layer.y / mask.sy + sag;
        ctx.drawImage(layer.canvas, layerX, layerY, layer.w / mask.sx, layer.h / mask.sy);
      }
    }
    for (const crumb of crumbs) {
      ctx.globalAlpha = clamp(crumb.life / .8, 0, 1); ctx.fillStyle = '#989898';
      ctx.beginPath(); ctx.arc(crumb.x, crumb.y, crumb.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const ant of ants) drawAnt(ant);
  }

  function frame(now) {
    if (!raf) return;
    const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (!paused) {
      const step = 1 / 60;
      accumulator += dt;
      while (accumulator >= step) { update(step); accumulator -= step; }
    }
    const renderEvery = 1000 / 60;
    if (now - lastRenderTime >= renderEvery) { render(); lastRenderTime = now; }
    raf = requestAnimationFrame(frame);
  }

  function pause() { paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function resume() { paused = false; lastTime = performance.now(); if (!raf && body) raf = requestAnimationFrame(frame); }
  function pauseForHidden() { if (!paused) { wasPaused = paused; paused = true; hiddenPause = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } } }
  function resumeFromHidden() { if (hiddenPause) { paused = wasPaused; hiddenPause = false; lastTime = performance.now(); if (!paused && !raf && body) raf = requestAnimationFrame(frame); } }
  function exportPng() {
    if (!body) throw new Error('There is no scene to export yet.');
    const wasPaused = paused, wasDpr = dpr, wasWidth = canvas.width, wasHeight = canvas.height;
    paused = true; dpr = Math.min(Math.max(wasDpr, 3), 4);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); render();
    canvas.toBlob(blob => {
      if (blob) {
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
        link.download = 'natural-decay.png'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
      dpr = wasDpr; canvas.width = wasWidth; canvas.height = wasHeight; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); render();
      paused = wasPaused;
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
    start, addImages, cancel, pause, resume, pauseForHidden, resumeFromHidden, resize, exportPng, setAntImage,
    setTheme(value) { darkMode = !!value; render(); },
    onUpdate(callback) { onUpdate = callback; },
    isTextAt(x, y) { return !!mask && occupied(x, y); },
    get paused() { return paused; },
    get state() { return state; },
    get consumed() { return total ? 1-remaining/total : 0; },
    get originalText() { return source; }
  };
}
