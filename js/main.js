import { createSimulation } from './simulation.js';

const $ = id => document.getElementById(id);
const ui = {
  canvas:$('scene'), editor:$('copy'), fontOptions:$('font-options'), color:$('text-color'), size:$('size'), autofit:$('autofit'),
  imageLayer:$('image-layer'), drawingLayer:$('drawing-layer'), imageFile:$('image-file'), editSize:$('edit-size'), trails:$('trails'),
  editToolbar:$('edit-toolbar'), editHint:$('edit-hint'), hint:$('hint'), state:$('state-label'), remaining:$('remaining'),
  typeStyle:$('type-style'), imageTools:$('image-tools'), drawSettings:$('draw-settings'), addTextLayer:$('add-text-layer'), modeText:$('mode-text'), modeImage:$('mode-image'), modeDraw:$('mode-draw'),
  playPause:$('play-pause'), replay:$('replay'), edit:$('edit'), preset:$('preset'),
  antSpeed:$('ant-speed'), antCount:$('ant-count'), decaySpeed:$('decay-speed'), antChaos:$('ant-chaos'), frequency:$('eating-frequency'), resistance:$('resistance'), deform:$('deform'), dialog:$('tweaks'), theme:$('theme-toggle')
};
const sim = createSimulation(ui.canvas);
let editMode = true, committing = false;
let contentMode = 'text';
let images = [], selectedImageId = null, imageSequence = 0, cycleText = '';
let drawingStrokes = [], activeStroke = null, drawColor = '#5b5b5b';
const drawContext = ui.drawingLayer.getContext('2d');
let fontValue = 'dm-sans';
const fonts = {
  'dm-sans':'"DM Sans", sans-serif',
  'space-grotesk':'"Space Grotesk", sans-serif',
  manrope:'Manrope, sans-serif',
  playfair:'"Playfair Display", Georgia, serif',
  fraunces:'Fraunces, Georgia, serif',
  'dm-mono':'"DM Mono", monospace',
  'plex-mono':'"IBM Plex Mono", monospace'
};
const stylePopovers = [...document.querySelectorAll('.style-popover')];
function closeStylePopovers(except = null) {
  for (const popover of stylePopovers) if (popover !== except) popover.open = false;
}
for (const popover of stylePopovers) {
  popover.addEventListener('toggle', () => {
    if (popover.open) {
      closeStylePopovers(popover);
      $('tweaks').close();
      $('about').close();
    }
  });
}
document.addEventListener('click', event => {
  if (!event.target.closest('.style-popover')) closeStylePopovers();
});
for (const [value, label] of [['dm-sans','DM Sans'],['space-grotesk','Space Grotesk'],['manrope','Manrope'],['playfair','Playfair Display'],['fraunces','Fraunces'],['dm-mono','DM Mono'],['plex-mono','IBM Plex Mono']]) {
  const option = document.createElement('button');
  option.type = 'button'; option.className = 'font-option'; option.setAttribute('role','option'); option.dataset.font = value; option.textContent = label;
  option.addEventListener('click', () => { fontValue = value; document.querySelectorAll('.font-option').forEach(node=>node.setAttribute('aria-selected',String(node===option))); preview(); document.querySelector('.style-popover[name="toolbar-popover"][open]')?.removeAttribute('open'); });
  ui.fontOptions.append(option);
}

function graphemes(text) { return [...new Intl.Segmenter(undefined, { granularity:'grapheme' }).segment(text)].length; }
function config() {
  const compositionImages = images.filter(item=>!item.pending).map(item=>({image:item.image,x:item.x,y:item.y,w:item.w,h:item.h,kind:item.isTextLayer?'live-text':'image'}));
  if (drawingStrokes.length) {
    renderDrawing();
    compositionImages.push({image:ui.drawingLayer,x:0,y:0,w:1,h:1});
  }
  return { text:ui.editor.value, font:fonts[fontValue], textColor:ui.color.value,
    size:Number(ui.size.value), auto:ui.autofit.checked, weight:600, style:'normal', tracking:-.055, preset:ui.preset.value,
    images:compositionImages };
}
function status(message, error = false) {
  ui.hint.textContent = message;
  ui.hint.classList.toggle('error', error);
}
function renderDrawing() {
  const rect=ui.drawingLayer.getBoundingClientRect();
  if(!rect.width||!rect.height||!drawContext)return;
  drawContext.clearRect(0,0,rect.width,rect.height); drawContext.lineCap='round'; drawContext.lineJoin='round';
  for(const stroke of drawingStrokes){
    if(stroke.points.length===1){drawContext.globalCompositeOperation='source-over';drawContext.globalAlpha=.84;drawContext.fillStyle=stroke.color;drawContext.beginPath();drawContext.arc(stroke.points[0].x*rect.width,stroke.points[0].y*rect.height,stroke.size/2,0,Math.PI*2);drawContext.fill();continue;}
    if(stroke.points.length<2)continue;
    drawContext.globalCompositeOperation='source-over'; drawContext.globalAlpha=.84; drawContext.strokeStyle=stroke.color; drawContext.lineWidth=stroke.size;
    drawContext.beginPath(); drawContext.moveTo(stroke.points[0].x*rect.width,stroke.points[0].y*rect.height);
    for(let i=1;i<stroke.points.length;i++)drawContext.lineTo(stroke.points[i].x*rect.width,stroke.points[i].y*rect.height);
    drawContext.stroke(); drawContext.globalCompositeOperation='destination-out'; drawContext.globalAlpha=.45;
    for(const grain of stroke.grain){drawContext.beginPath();drawContext.arc(grain.x*rect.width,grain.y*rect.height,grain.radius,0,Math.PI*2);drawContext.fill();}
  }
  drawContext.globalCompositeOperation='source-over';drawContext.globalAlpha=1;
}
function resizeDrawingLayer() {
  const rect=ui.canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
  if(!rect.width||!rect.height)return;
  const width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio);
  if(ui.drawingLayer.width!==width||ui.drawingLayer.height!==height){ui.drawingLayer.width=width;ui.drawingLayer.height=height;drawContext.setTransform(ratio,0,0,ratio,0,0);renderDrawing();}
}
function pushStrokePoint(stroke,x,y,rect) {
  const previous=stroke.points.at(-1),px=x/rect.width,py=y/rect.height;
  if(previous&&Math.hypot((px-previous.x)*rect.width,(py-previous.y)*rect.height)<1.2)return;
  stroke.points.push({x:px,y:py});if(!previous)return;
  const distance=Math.hypot((px-previous.x)*rect.width,(py-previous.y)*rect.height);
  const count=Math.max(1,Math.ceil(distance/Math.max(3,stroke.size*.42)));
  for(let i=1;i<=count;i++){const t=i/count,gx=previous.x+(px-previous.x)*t,gy=previous.y+(py-previous.y)*t;if(Math.random()<.8)stroke.grain.push({x:gx+(Math.random()-.5)*stroke.size*.72/rect.width,y:gy+(Math.random()-.5)*stroke.size*.72/rect.height,radius:.35+Math.random()*.75});}
}
ui.drawingLayer.addEventListener('pointerdown',event=>{
  if(contentMode!=='draw'||event.button!==0)return;
  event.preventDefault();ui.drawingLayer.setPointerCapture(event.pointerId);const rect=ui.drawingLayer.getBoundingClientRect();
  activeStroke={color:drawColor,size:Number($('draw-size').value),points:[],grain:[]};drawingStrokes.push(activeStroke);
  pushStrokePoint(activeStroke,event.clientX-rect.left,event.clientY-rect.top,rect);renderDrawing();preview();
});
ui.drawingLayer.addEventListener('pointermove',event=>{if(!activeStroke)return;const rect=ui.drawingLayer.getBoundingClientRect();pushStrokePoint(activeStroke,event.clientX-rect.left,event.clientY-rect.top,rect);renderDrawing();});
function finishStroke(){
  if(!activeStroke)return;
  const completedStroke=activeStroke;
  activeStroke=null;
  if(!editMode){
    const crop=cropLiveStroke(completedStroke);
    try{sim.addImages([{image:crop.image,x:crop.x,y:crop.y,w:crop.w,h:crop.h}]);saveLiveDrawing(crop.image,crop.x,crop.y,crop.w,crop.h);drawingStrokes=[];renderDrawing();status('Chalk added to the live simulation.');}
    catch(error){status(error.message||'Could not add this drawing.',true);}
  }else status('Drawing added. Keep sketching or press Play to feed it to the ants.');
}
ui.drawingLayer.addEventListener('pointerup',finishStroke);ui.drawingLayer.addEventListener('pointercancel',finishStroke);
function preview() {
  const current = config();
  const pending = images.some(item=>item.pending);
  const showText = editMode && (contentMode === 'text' || current.text.trim().length > 0);
  ui.editor.hidden = !showText;
  ui.editor.classList.toggle('is-hidden', !showText);
  ui.editor.readOnly = contentMode !== 'text';
  ui.editor.classList.toggle('composition-preview', contentMode !== 'text' && showText);
  ui.editToolbar.hidden = false;
  ui.editHint.hidden = !editMode || contentMode === 'image';
  ui.typeStyle.hidden = !editMode || contentMode !== 'text';
  ui.imageTools.hidden = contentMode !== 'image';
  ui.drawSettings.hidden = contentMode !== 'draw';
  ui.addTextLayer.hidden = editMode || contentMode !== 'text';
  ui.addTextLayer.disabled = sim.consumed < .5;
  ui.addTextLayer.title = sim.consumed < .5 ? 'Unlocks after half the current material has been eaten' : 'Add another text layer';
  ui.drawingLayer.hidden = contentMode !== 'draw' && !editMode;
  if (!ui.drawingLayer.hidden) renderDrawing();
  ui.modeDraw.disabled = false;
  document.querySelector('.stage-wrap').classList.toggle('is-drawing',contentMode==='draw');
  document.querySelector('.toolbar-top').classList.toggle('image-mode', contentMode === 'image');
  document.querySelector('.toolbar-top').classList.toggle('draw-mode', contentMode === 'draw');
  ui.modeText.classList.toggle('active', contentMode === 'text');
  ui.modeImage.classList.toggle('active', contentMode === 'image');
  ui.modeDraw.classList.toggle('active', contentMode === 'draw');
  ui.modeText.setAttribute('aria-pressed', String(contentMode === 'text'));
  ui.modeImage.setAttribute('aria-pressed', String(contentMode === 'image'));
  ui.modeDraw.setAttribute('aria-pressed', String(contentMode === 'draw'));
  ui.imageLayer.hidden = !(editMode && images.length) && !pending;
  if (contentMode === 'draw') ui.editHint.textContent = 'Draw on the scene. Open brush settings to change size or color.';
  $('clear-image').hidden = !selectedImageId;
  renderImageLayers();
  ui.editor.style.fontFamily = current.font;
  const maxHeight = ui.canvas.clientHeight * .68;
  let previewSize = current.auto ? Math.min(current.size, Math.max(34, Math.min(ui.canvas.clientWidth * .13, ui.canvas.clientHeight * .24))) : current.size;
  ui.editor.style.fontSize = `${previewSize}px`;
  ui.editor.style.fontWeight = current.weight;
  ui.editor.style.color = current.textColor;
  ui.editor.style.height = 'auto';
  if (current.auto) {
    while (ui.editor.scrollHeight > maxHeight && previewSize > 34) {
      previewSize = Math.max(34, previewSize - 2);
      ui.editor.style.fontSize = `${previewSize}px`;
      ui.editor.style.height = 'auto';
    }
  }
  ui.editor.style.height = `${Math.min(ui.editor.scrollHeight, maxHeight)}px`;
  $('size-value').textContent = `${current.size} px`;
  ui.editSize.value = String(current.size);
  ui.editHint.textContent = contentMode === 'text'
    ? 'Enter to feed · Shift + Enter for a new line'
    : contentMode === 'draw' ? 'Draw on the scene. Open brush settings to change size or color.'
    : 'Add, drag, resize, or paste images. Click outside to commit.';
}
function setMode(mode) {
  if (mode === contentMode) {
    if (!editMode && mode === 'text') status(sim.consumed>=.5?'A new text layer is available in this mode.':'A new text layer unlocks after half the current material is eaten.');
    return;
  }
  contentMode = mode;
  preview();
  if (mode === 'draw') { status(editMode?'Sketch on the scene. Use Play when the composition is ready.':'Sketch and release to add chalk to the live scene.'); return; }
  status(!editMode
    ? (mode === 'image' ? 'Add images, then confirm with ✓ or cancel with ×.' : sim.consumed>=.5 ? 'Half the material is gone. Add a new text layer, then confirm it.' : 'The original text is fixed for this run. A new text layer unlocks after half the material is eaten.')
    : (mode === 'image' ? 'Text stays on top. Add images, then press Enter or Play to start.' : (images.length ? 'Text stays on top of your collage. Press Enter to start.' : 'Type in the center. Press Enter to feed.')));
}
ui.modeText.addEventListener('click', () => setMode('text'));
ui.modeImage.addEventListener('click', () => setMode('image'));
  ui.modeDraw.addEventListener('click', () => setMode('draw'));
function createLiveTextLayer(){
  if(editMode||sim.consumed<.5){status('A new text layer unlocks after half the current material has been eaten.',true);return;}
  const item={id:`text-${++imageSequence}`,name:'New text',text:'',font:fonts[fontValue],size:Number(ui.size.value)||72,color:ui.color.value||'#5b5b5b',x:.28,y:.4,w:.44,h:.2,pending:true,isTextLayer:true,image:null,url:''};
  images.push(item);selectedImageId=item.id;contentMode='text';preview();
  requestAnimationFrame(()=>ui.imageLayer.querySelector(`[data-image-id="${item.id}"] .live-text-entry`)?.focus());
  status('Type the new text, move or resize it, then confirm it.');
}
ui.addTextLayer.addEventListener('click',createLiveTextLayer);
function updatePlayButton() {
  const icon = ui.playPause.querySelector('.material-symbols-outlined');
  const active = !editMode && !sim.paused;
  const label = editMode ? 'Start feeding' : active ? 'Pause simulation' : 'Resume simulation';
  icon.textContent = editMode || !active ? 'play_arrow' : 'pause';
  ui.playPause.setAttribute('aria-label', label);
  ui.playPause.title = label;
}
function setEditing() {
  if (!editMode) ui.editor.value = cycleText;
  sim.cancel();
  editMode = true;
  ui.editor.classList.remove('is-hidden');
  ui.editor.disabled = false;
  ui.editToolbar.hidden = false;
  ui.editHint.hidden = false;
  ui.playPause.disabled = false;
  ui.replay.disabled = true;
  ui.edit.disabled = true;
  ui.state.textContent = 'EDITING / INTACT PREVIEW';
  ui.remaining.textContent = '';
  preview();
  updatePlayButton();
  status(contentMode === 'image' ? 'Arrange the collage, then press Enter to feed.' : contentMode === 'draw' ? 'Continue sketching or press Play to start.' : 'Type, choose a font, size, and color, then press Enter to feed.');
  if (contentMode === 'image' && images.length) ui.imageLayer.focus?.(); else if (contentMode === 'text') ui.editor.focus();
}
async function startFeeding() {
  if (committing || !editMode) return;
  const current = config();
  if (!current.images.length && !current.text.trim()) { status('Add text or an image before starting.', true); ui.editor.focus(); return; }
  if (current.text.trim() && graphemes(current.text) > 500) { status('This draft is over the 500 grapheme limit. Shorten it before starting; your full text is preserved.', true); return; }
  committing = true;
  cycleText = current.text;
  ui.playPause.disabled = true;
    status(current.images.length && current.text.trim() ? 'Preparing text and images…' : current.images.length ? 'Preparing the collage…' : 'Preparing the text…');
  try {
    await document.fonts.ready;
    await sim.start(current);
    if(drawingStrokes.length){const saved=copyDrawingCanvas();images.push({id:`drawing-${++imageSequence}`,name:'Chalk drawing',image:saved,url:saved.toDataURL('image/png'),x:0,y:0,w:1,h:1,pending:false});drawingStrokes=[];renderDrawing();}
    editMode = false;
    selectedImageId = null;
    ui.editor.classList.add('is-hidden');
    ui.imageLayer.hidden = true;
    ui.editHint.hidden = true;
    ui.playPause.disabled = false;
    ui.replay.disabled = false;
    ui.edit.disabled = false;
    ui.state.textContent = 'ANTS ARE FEEDING';
    preview();
    updatePlayButton();
    status('Double-click to edit.');
  } catch (error) {
    status(error.message || 'Could not prepare this composition.', true);
    ui.playPause.disabled = false;
  } finally { committing = false; }
}

ui.editor.addEventListener('input', () => {
  preview();
  if (graphemes(ui.editor.value) > 500) status('Over the 500 grapheme limit. Your complete draft is preserved.', true);
  else if (editMode) status('Press Enter to start feeding.');
});
ui.editor.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !event.repeat) {
    event.preventDefault();
    if (editMode) startFeeding();
  }
});
ui.size.addEventListener('input', preview);
ui.editSize.addEventListener('input', () => { ui.size.value = ui.editSize.value; preview(); });
ui.autofit.addEventListener('change', preview);
document.querySelector('.stage-wrap').addEventListener('dblclick', () => { if (!editMode) setEditing(); });

document.querySelectorAll('#type-style .color-swatch').forEach(swatch => swatch.addEventListener('click', () => {
  ui.color.value = swatch.dataset.color; preview();
  document.querySelectorAll('#type-style .color-swatch').forEach(node=>node.setAttribute('aria-pressed',String(node===swatch)));
  document.querySelector('.style-popover[name="toolbar-popover"][open]')?.removeAttribute('open');
}));
ui.color.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(ui.color.value)) preview(); });
document.querySelectorAll('.draw-color-swatch').forEach(swatch=>swatch.addEventListener('click',()=>{
  drawColor=swatch.dataset.color;$('draw-color').value=drawColor;
  document.querySelectorAll('.draw-color-swatch').forEach(node=>node.setAttribute('aria-pressed',String(node===swatch)));
}));
$('draw-color').addEventListener('input',()=>{
  const value=$('draw-color').value;
  if(/^#[0-9a-f]{6}$/i.test(value)){
    drawColor=value;
    document.querySelectorAll('.draw-color-swatch').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.color.toLowerCase()===value.toLowerCase())));
  }
});
$('draw-size').addEventListener('input',()=>{$('draw-size-value').textContent=`${$('draw-size').value} px`;});
$('clear-drawing').addEventListener('click',()=>{drawingStrokes=[];activeStroke=null;renderDrawing();preview();status('Drawing cleared.');});

function copyDrawingCanvas(){const canvas=document.createElement('canvas');canvas.width=ui.drawingLayer.width;canvas.height=ui.drawingLayer.height;canvas.getContext('2d').drawImage(ui.drawingLayer,0,0);return canvas;}
function cropLiveStroke(stroke){
  const rect=ui.drawingLayer.getBoundingClientRect(),scale=ui.drawingLayer.width/Math.max(1,rect.width),pad=stroke.size*2.2;
  const xs=stroke.points.map(point=>point.x*rect.width),ys=stroke.points.map(point=>point.y*rect.height);
  const left=Math.max(0,Math.floor((Math.min(...xs)-pad)*scale)),top=Math.max(0,Math.floor((Math.min(...ys)-pad)*scale));
  const right=Math.min(ui.drawingLayer.width,Math.ceil((Math.max(...xs)+pad)*scale)),bottom=Math.min(ui.drawingLayer.height,Math.ceil((Math.max(...ys)+pad)*scale));
  const image=document.createElement('canvas');image.width=Math.max(1,right-left);image.height=Math.max(1,bottom-top);
  image.getContext('2d').drawImage(ui.drawingLayer,left,top,image.width,image.height,0,0,image.width,image.height);
  return{image,x:left/ui.drawingLayer.width,y:top/ui.drawingLayer.height,w:image.width/ui.drawingLayer.width,h:image.height/ui.drawingLayer.height};
}
function saveLiveDrawing(canvas,x,y,w,h){images.push({id:`drawing-${++imageSequence}`,name:'Chalk drawing',image:canvas,url:canvas.toDataURL('image/png'),x,y,w,h,pending:false});}

ui.canvas.addEventListener('click', () => {
  if (editMode || committing) return;
  if (sim.paused) { sim.resume(); status('Feeding resumed.'); }
  else { sim.pause(); status('Feeding paused.'); }
  updatePlayButton();
});

ui.playPause.addEventListener('click', async () => {
  if (editMode) { await startFeeding(); return; }
  if (sim.paused) { sim.resume(); status('Feeding resumed.'); }
  else { sim.pause(); status('Feeding paused.'); }
  updatePlayButton();
});
ui.replay.addEventListener('click', () => { ui.editor.value = cycleText; editMode = true; startFeeding(); });
ui.edit.addEventListener('click', setEditing);

$('tweak-open').addEventListener('click', () => {
  closeStylePopovers();
  $('about').close();
  if (!ui.dialog.open) ui.dialog.showModal();
});
$('tweak-close').addEventListener('click', () => ui.dialog.close());
ui.dialog.addEventListener('click', event => { if (event.target === ui.dialog) ui.dialog.close(); });
const aboutDialog = $('about');
$('info-open').addEventListener('click', () => {
  closeStylePopovers();
  ui.dialog.close();
  if (!aboutDialog.open) aboutDialog.showModal();
});
$('about-close').addEventListener('click', () => aboutDialog.close());
aboutDialog.addEventListener('click', event => { if (event.target === aboutDialog) aboutDialog.close(); });
ui.theme.addEventListener('change', () => {
  const dark = ui.theme.checked;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  sim.setTheme(dark);
});

ui.preset.addEventListener('change', () => {
  const defaults = { soft:[35, 2], crumbly:[20, 3.5], firm:[72, .7] }[ui.preset.value];
  if (defaults) { ui.resistance.value = defaults[0]; ui.deform.value = defaults[1]; updateLabels(); }
});
function updateLabels() {
  $('ant-chaos-value').textContent = `${ui.antChaos.value}%`;
  $('ant-count-value').textContent = `${ui.antCount.value} ants`;
  $('decay-speed-value').textContent = `${Number(ui.decaySpeed.value).toFixed(1)}×`;
  $('ant-speed-value').textContent = `${Number(ui.antSpeed.value).toFixed(1)}×`;
  $('eating-frequency-value').textContent = `${Number(ui.frequency.value).toFixed(1)}×`;
  $('resistance-value').textContent = `${ui.resistance.value}%`;
  $('deform-value').textContent = `${Number(ui.deform.value).toFixed(1)}%`;
}
for (const input of [ui.antSpeed, ui.antCount, ui.decaySpeed, ui.antChaos, ui.frequency, ui.resistance, ui.deform]) {
  input.addEventListener('input', () => {
    updateLabels();
    if (input === ui.resistance || input === ui.deform) ui.preset.value = 'custom';
  });
}
$('copy-text').addEventListener('click', async () => {
  const original = sim.originalText || ui.editor.value;
  try { await navigator.clipboard.writeText(original); status('Original text copied.'); }
  catch { setEditing(); ui.editor.select(); status('Clipboard access was denied. The text is selected so you can copy it manually.', true); }
});
$('export').addEventListener('click', () => {
  try { editMode ? exportEditingFrame() : sim.exportPng(); }
  catch (error) { status(error.message || 'PNG export failed in this browser.', true); }
});
function exportEditingFrame() {
  const scale = 4, width = ui.canvas.clientWidth, height = ui.canvas.clientHeight;
  if (!width || !height) throw new Error('The scene is not ready to export.');
  const output = document.createElement('canvas'); output.width = width * scale; output.height = height * scale;
  const context = output.getContext('2d'); context.scale(scale, scale);
  context.drawImage(ui.canvas, 0, 0, width, height);
  for (const item of images) context.drawImage(item.image, item.x * width, item.y * height, item.w * width, item.h * height);
  if (drawingStrokes.length) context.drawImage(ui.drawingLayer,0,0,width,height);
  if (ui.editor.value.trim()) {
    const style = getComputedStyle(ui.editor), rect = ui.editor.getBoundingClientRect();
    const fontSize = parseFloat(style.fontSize), lineHeight = parseFloat(style.lineHeight) || fontSize * 1.04;
    const spacing = fontSize * -.055, maxWidth = rect.width;
    context.fillStyle = ui.color.value; context.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
    context.textAlign = 'center'; context.textBaseline = 'alphabetic';
    if ('letterSpacing' in context) context.letterSpacing = `${spacing}px`;
    const lines = [];
    for (const source of ui.editor.value.split('\n')) {
      let line = '';
      for (const word of source.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
        else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    const metrics = context.measureText('Mg'), ascent = metrics.actualBoundingBoxAscent || fontSize * .8;
    const totalHeight = Math.max(lineHeight, lines.length * lineHeight);
    const startY = height / 2 - totalHeight / 2 + ascent;
    for (let index = 0; index < lines.length; index++) context.fillText(lines[index], rect.left + rect.width / 2, startY + index * lineHeight);
  }
  output.toBlob(blob => {
    if (!blob) { status('Could not export this frame in this browser.', true); return; }
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'natural-decay.png'; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, 'image/png');
}
function renderImageLayers() {
  ui.imageLayer.replaceChildren();
  const visible = editMode ? images : images.filter(item=>item.pending);
  for (const item of visible) {
    const wrapper = document.createElement('div');
    wrapper.className = `image-item${item.isTextLayer?' is-live-text':''}${item.id === selectedImageId ? ' selected' : ''}`;
    wrapper.dataset.imageId = item.id;
    wrapper.style.left = `${item.x * 100}%`; wrapper.style.top = `${item.y * 100}%`;
    wrapper.style.width = `${item.w * 100}%`; wrapper.style.height = `${item.h * 100}%`;
    wrapper.setAttribute('role','group'); wrapper.setAttribute('aria-label',`${item.name}; drag to move, use corner handles to resize`);
    if(item.isTextLayer && item.pending){
      const entry=document.createElement('textarea');entry.className='live-text-entry';entry.placeholder='Type new text';entry.value=item.text;
      entry.setAttribute('aria-label','New text layer');entry.maxLength=500;entry.style.fontFamily=item.font;entry.style.fontSize=`${item.size}px`;entry.style.color=item.color;
      entry.addEventListener('input',()=>{item.text=entry.value;});
      wrapper.append(entry);
      const drag=document.createElement('div');drag.className='text-drag-handle';drag.innerHTML='<span class="material-symbols-outlined" aria-hidden="true">drag_indicator</span><span>Move text</span>';wrapper.append(drag);
    }else{
      const image = document.createElement('img'); image.src = item.url; image.alt = item.name; image.draggable = false;
      wrapper.append(image);
    }
    if (item.pending) {
      const actions = document.createElement('div'); actions.className = 'image-confirm-actions';
      const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'image-confirm'; confirm.title = item.isTextLayer?'Add this text':'Add this image'; confirm.setAttribute('aria-label',item.isTextLayer?'Add this text':'Add this image'); confirm.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">check</span>';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'image-cancel'; cancel.title = item.isTextLayer?'Cancel this text':'Cancel this image'; cancel.setAttribute('aria-label',item.isTextLayer?'Cancel this text':'Cancel this image'); cancel.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">close</span>';
      confirm.addEventListener('pointerdown', event=>event.stopPropagation()); cancel.addEventListener('pointerdown', event=>event.stopPropagation());
      confirm.addEventListener('click', event=>{event.stopPropagation();commitPendingImage(item);});
      cancel.addEventListener('click', event=>{event.stopPropagation();cancelPendingImage(item);});
      actions.append(confirm,cancel); wrapper.append(actions);
    }
    for (const corner of ['nw','ne','sw','se']) {
      const handle = document.createElement('span');
      handle.className = `resize-handle ${corner}`; handle.dataset.corner = corner;
      handle.setAttribute('role','button'); handle.setAttribute('aria-label',`Resize ${item.name} from ${corner.toUpperCase()}`);
      wrapper.append(handle);
    }
    wrapper.addEventListener('pointerdown', event => beginImageTransform(event, item, wrapper));
    ui.imageLayer.append(wrapper);
  }
}

function beginImageTransform(event, item, wrapper) {
  if ((!editMode && !item.pending) || event.button !== 0) return;
  if(item.isTextLayer&&item.pending&&!event.target.closest('.text-drag-handle,.resize-handle'))return;
  event.preventDefault();
  selectedImageId = item.id;
  ui.imageLayer.querySelectorAll('.image-item').forEach(node=>node.classList.toggle('selected',node===wrapper));
  const active = wrapper;
  const handle = event.target.closest('.resize-handle');
  const rect = ui.canvas.getBoundingClientRect();
  const start = { x:event.clientX, y:event.clientY, left:item.x, top:item.y, w:item.w, h:item.h };
  const direction = handle?.dataset.corner || '';
  active.setPointerCapture(event.pointerId);
  const move = moveEvent => {
    const dx = (moveEvent.clientX - start.x) / rect.width;
    const dy = (moveEvent.clientY - start.y) / rect.height;
    if (!direction) {
      item.x = Math.max(0,Math.min(1-item.w,start.left+dx));
      item.y = Math.max(0,Math.min(1-item.h,start.top+dy));
    } else {
      const sx = direction.includes('w') ? -1 : 1, sy = direction.includes('n') ? -1 : 1;
      const ratio = start.h / start.w;
      const fromX = start.w + sx * dx, fromY = start.w + sy * dy / ratio;
      const maxW=Math.min(.94,.94/ratio), candidate=Math.abs(fromX-start.w)>Math.abs(fromY-start.w)?fromX:fromY;
      const nextW=Math.max(Math.min(.07,maxW),Math.min(maxW,candidate));
      item.w = nextW; item.h = nextW * ratio;
      item.x = Math.max(0,Math.min(1-item.w,sx < 0 ? start.left + start.w - item.w : start.left));
      item.y = Math.max(0,Math.min(1-item.h,sy < 0 ? start.top + start.h - item.h : start.top));
    }
    active.style.left = `${item.x*100}%`; active.style.top = `${item.y*100}%`;
    active.style.width = `${item.w*100}%`; active.style.height = `${item.h*100}%`;
  };
  const done = () => { active.removeEventListener('pointermove',move); active.removeEventListener('pointerup',done); active.removeEventListener('pointercancel',done); };
  active.addEventListener('pointermove',move); active.addEventListener('pointerup',done); active.addEventListener('pointercancel',done);
}

function setImage(file, dropPoint = null) {
  if (!file || !/^(image\/(png|jpeg|svg\+xml))$/i.test(file.type)) {
    status('Choose a PNG, JPEG, or SVG image.', true); return;
  }
  const url = URL.createObjectURL(file), image = new Image();
  image.onload = () => {
    const rect = ui.canvas.getBoundingClientRect();
    let w = Math.min(.44,560/rect.width), h = w * image.naturalHeight / image.naturalWidth * rect.width / rect.height;
    if (h > .58) { w *= .58 / h; h = .58; }
    const index = images.length;
    const cx = dropPoint ? dropPoint.x : .5 + (index % 3 - 1) * .06;
    const cy = dropPoint ? dropPoint.y : .48 + (index % 3 - 1) * .05;
    const live = !editMode && ['feeding','clearing','finished'].includes(sim.state);
    const item = { id:`image-${++imageSequence}`, image, url, name:file.name || 'Pasted SVG', pending:live,
      w,h,x:Math.max(0,Math.min(1-w,cx-w/2)),y:Math.max(0,Math.min(1-h,cy-h/2)) };
    contentMode = 'image';
    images.push(item); selectedImageId = item.id;
    preview();
    status(live ? 'Position the image, then tap ✓ to add it or × to cancel.' : `${images.length} image${images.length===1?'':'s'} ready. Drag to move; use a corner handle to resize.`);
    if (!live) ui.playPause.focus();
  };
  image.onerror = () => { URL.revokeObjectURL(url); status('This image could not be opened.', true); };
  image.src = url;
}
ui.imageFile.addEventListener('change', () => {
  for (const file of ui.imageFile.files || []) setImage(file);
  ui.imageFile.value = '';
});
$('add-image').addEventListener('click', () => ui.imageFile.click());
$('clear-image').addEventListener('click', () => {
  const index = images.findIndex(item=>item.id===selectedImageId);
  if (index >= 0) { URL.revokeObjectURL(images[index].url); images.splice(index,1); }
  selectedImageId = images.at(-1)?.id || null;
  preview(); status(images.length ? `${images.length} images remain in the collage.` : 'Images removed. Type in the center to feed text.');
  if (!images.length) ui.editor.focus();
});
async function pasteImage() {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(t => /^(image\/(png|jpeg|svg\+xml)|text\/plain)$/i.test(t));
      if (!type) continue;
      const blob = await item.getType(type);
      if (type === 'text/plain') {
        const text = await blob.text();
        if (!/<svg[\s>]/i.test(text)) continue;
        setImage(new Blob([text], { type:'image/svg+xml' }));
      } else setImage(blob);
    }
    if (!items.some(item=>item.types.some(t=>/^(image\/(png|jpeg|svg\+xml)|text\/plain)$/i.test(t)))) status('No PNG, JPEG, or SVG image was found on the clipboard.', true);
  } catch { status('Clipboard access was blocked. Use Add image, or click the stage and press Ctrl+V.', true); }
}
$('paste-image').addEventListener('click', pasteImage);
document.querySelector('.stage-wrap').addEventListener('paste', event => {
  const files = [...(event.clipboardData?.items || [])].map(item => item.getAsFile?.()).filter(file => file && /^(image\/(png|jpeg|svg\+xml))$/i.test(file.type));
  if (files.length) { event.preventDefault(); for (const file of files) setImage(file); }
});
const stage = document.querySelector('.stage-wrap');
function commitPendingImages() {
  const pending = images.filter(item=>item.pending);
  if (!pending.length || editMode) return;
  try {
    sim.addImages(pending.map(({image,x,y,w,h})=>({image,x,y,w,h})));
    for (const item of pending) item.pending = false;
    selectedImageId = null;
    $('clear-image').hidden = true;
    ui.imageLayer.hidden = true;
    renderImageLayers();
    status('Image added to the live simulation. Existing decay is preserved.');
  } catch (error) { status(error.message || 'Could not add the image to the simulation.', true); }
}
function commitPendingImage(item) {
  if (!item?.pending || editMode) return;
  if(item.isTextLayer){
    if(!item.text.trim()){status('Type something before adding this text layer.',true);ui.imageLayer.querySelector('.live-text-entry')?.focus();return;}
    item.image=rasterizeLiveText(item);item.url=item.image.toDataURL('image/png');
  }
  try {
    sim.addImages([{image:item.image,x:item.x,y:item.y,w:item.w,h:item.h,kind:item.isTextLayer?'live-text':'image'}]);
    item.pending = false;
    selectedImageId = null;
    preview();
    status(item.isTextLayer?'Text layer added to the live simulation.':'Image added to the live simulation.');
  } catch (error) { status(error.message || 'Could not add the image to the simulation.', true); }
}
function rasterizeLiveText(item){
  const rect=ui.canvas.getBoundingClientRect(),scale=Math.min(window.devicePixelRatio||1,2.5);
  const cssWidth=Math.max(1,rect.width*item.w),cssHeight=Math.max(1,rect.height*item.h),canvas=document.createElement('canvas');
  canvas.width=Math.ceil(cssWidth*scale);canvas.height=Math.ceil(cssHeight*scale);
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle=item.color;ctx.font=`600 ${item.size}px ${item.font}`;ctx.textAlign='center';ctx.textBaseline='middle';
  const maxWidth=cssWidth*.92,lines=[];
  for(const para of item.text.split(/\n/)){let line='';for(const word of para.split(/\s+/)){const test=line?`${line} ${word}`:word;if(line&&ctx.measureText(test).width>maxWidth){lines.push(line);line=word;}else line=test;}lines.push(line);}
  const lineHeight=item.size*1.12,startY=cssHeight/2-(lines.length-1)*lineHeight/2;
  lines.forEach((line,index)=>ctx.fillText(line,cssWidth/2,startY+index*lineHeight,maxWidth));
  return canvas;
}
function cancelPendingImage(item) {
  const index = images.indexOf(item);
  if (index < 0 || !item.pending) return;
  if(item.url)URL.revokeObjectURL(item.url); images.splice(index,1);
  selectedImageId = null; preview(); status(item.isTextLayer?'Text layer cancelled. The simulation continues.':'Image cancelled. The simulation continues.');
}
stage.addEventListener('dragover', event => { if ([...(event.dataTransfer?.items||[])].some(item=>item.kind==='file')) {event.preventDefault();stage.classList.add('is-dragging');} });
stage.addEventListener('dragleave', event => { if (!stage.contains(event.relatedTarget)) stage.classList.remove('is-dragging'); });
stage.addEventListener('drop', event => {
  const files=[...(event.dataTransfer?.files||[])].filter(file=>/^(image\/(png|jpeg|svg\+xml))$/i.test(file.type));
  if (!files.length) return;
  event.preventDefault();stage.classList.remove('is-dragging');
  const rect=ui.canvas.getBoundingClientRect(), point={x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height};
  files.forEach((file,index)=>setImage(file,{x:point.x+index*.035,y:point.y+index*.035}));
});

$('ant-file').addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (file) {
    const image = new Image(), url = URL.createObjectURL(file);
    image.onload = () => { sim.setAntImage(image, url); status('Custom ant ready.'); };
    image.onerror = () => { URL.revokeObjectURL(url); status('This ant image could not be opened.', true); };
    image.src = url;
  }
});
$('reset-ant').addEventListener('click', () => { sim.setAntImage(null); $('ant-file').value = ''; status('Default ant restored.'); });
ui.trails.addEventListener('input', () => {
  const duration = Number(ui.trails.value);
  $('trail-value').textContent = duration === 0 ? 'Off' : `${duration} sec`;
});

sim.onUpdate(({ state, remaining, total }) => {
  ui.remaining.textContent = total ? `${Math.round(100 * remaining / total)}% MATERIAL` : '';
  ui.addTextLayer.hidden = editMode || contentMode !== 'text';
  ui.addTextLayer.disabled = sim.consumed < .5;
  ui.addTextLayer.title = sim.consumed < .5 ? 'Unlocks after half the current material has been eaten' : 'Add another text layer';
  if (!editMode && state) ui.state.textContent = state === 'feeding' ? 'ANTS ARE FEEDING' : state.toUpperCase();
});
function syncAntCountLimit() {
  ui.antCount.max = '48';
  updateLabels();
}
new ResizeObserver(() => { sim.resize(); resizeDrawingLayer(); syncAntCountLimit(); preview(); }).observe(ui.canvas.parentElement);
document.addEventListener('visibilitychange', () => document.hidden ? sim.pauseForHidden() : sim.resumeFromHidden());
resizeDrawingLayer();
updateLabels(); preview(); updatePlayButton();
