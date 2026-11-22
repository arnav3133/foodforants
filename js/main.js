import { createSimulation, layoutText, paintText, textUnits } from './simulation.js';

const $ = id => document.getElementById(id);
const iconPaths = {
  light_mode:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4',
  dark_mode:'M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z',
  download:'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4',
  tune:'M4 6h16M4 12h16M4 18h16M9 3v6m6 0v6m-6 0v6',
  play_arrow:'m9 5 11 7-11 7Z',
  pause:'M9 5v14m6-14v14',
  restart_alt:'M3 8a8 8 0 1 1 1 10M3 3v5h5',
  edit:'m5 15-1 5 5-1L20 8l-4-4Zm9-9 4 4',
  font_download:'M4 4h16v16H4Zm4 12 4-9 4 9m-6-3h4',
  palette:'M12 3a9 9 0 1 0 0 18h1.5a1.5 1.5 0 0 0 1-2.6c-.8-.7-.4-1.9.7-1.9H17a4 4 0 0 0 4-4A9 9 0 0 0 12 3ZM7 11h.1m2-3h.1m4-.5h.1m4 2h.1',
  text_fields:'M3 6h12M9 6v13m4-8h8m-4 0v8',
  image:'M4 4h16v16H4Zm0 13 5-5 4 4 3-3 4 4M14 8h.1',
  content_paste:'M9 5H5v16h14V5h-4m-6-2h6v4H9Z',
  delete:'M4 6h16m-10 0V3h4v3m-7 0 1 15h8l1-15m-7 4v7m4-7v7',
  undo:'M9 6 4 11l5 5m-5-5h9a5 5 0 0 1 0 10',
  line_weight:'M4 6h16M4 12h16M4 17h16m-16 3h16',
  delete_sweep:'M3 6h12m-10 0 1 14h6l1-14M7 6V3h4v3m5 4h5m-5 4h5m-5 4h5',
  fullscreen:'M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5',
  close:'m6 6 12 12M18 6 6 18',
  content_copy:'M8 8h12v12H8Zm8-4H4v12',
  open_in_new:'M13 4h7v7m0-7-9 9m8 0v7H4V5h7',
  drag_indicator:'M9 5h.1m5.9 0h.1M9 12h.1m5.9 0h.1M9 19h.1m5.9 0h.1',
  check:'m5 12 4 4 10-10'
};
function setIcon(element, name) {
  const path = iconPaths[name];
  if (path) element.innerHTML = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="${path}"/></svg>`;
}
function renderIcons(container) {
  container.querySelectorAll('.material-symbols-outlined').forEach(icon => setIcon(icon, icon.textContent.trim()));
}
renderIcons(document);
const ui = {
  canvas:$('scene'), editor:$('copy'), textPreview:$('text-preview'), fontOptions:$('font-options'), color:$('text-color'), size:$('size'),
  imageLayer:$('image-layer'), drawingLayer:$('drawing-layer'), imageFile:$('image-file'), editSize:$('edit-size'), trails:$('trails'),
  editToolbar:$('edit-toolbar'), editHint:$('edit-hint'), hint:$('hint'), state:$('state-label'), remaining:$('remaining'),
  typeStyle:$('type-style'), imageTools:$('image-tools'), imageHuePanel:$('image-hue-panel'), drawSettings:$('draw-settings'), addTextLayer:$('add-text-layer'), undoDrawing:$('undo-drawing'), minimizeUI:$('minimize-ui'), restoreUI:$('restore-ui'), modeText:$('mode-text'), modeImage:$('mode-image'), modeDraw:$('mode-draw'),
  playPause:$('play-pause'), replay:$('replay'), scrap:$('scrap'), preset:$('preset'),
  antSpeed:$('ant-speed'), antCount:$('ant-count'), decaySpeed:$('decay-speed'), antChaos:$('ant-chaos'), frequency:$('eating-frequency'), resistance:$('resistance'), deform:$('deform'), dialog:$('tweaks'), theme:$('theme-toggle')
};
const sim = createSimulation(ui.canvas);
let editMode = true, committing = false;
let contentMode = 'text';
let images = [], selectedImageId = null, imageSequence = 0, cycleText = '';
let compositionGeneration = 0;
let drawingStrokes = [], activeStroke = null, liveStrokeIds = [], drawColor = '#5b5b5b', drawingRenderQueued = false;
const drawContext = ui.drawingLayer.getContext('2d');
const primaryTextStyle = {fontKey:'dm-sans', size:88, color:'#5b5b5b'};
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
const toolbarControls = document.querySelector('.toolbar-controls');
function closeStylePopovers(except = null) {
  for (const popover of stylePopovers) if (popover !== except) popover.open = false;
}
function placeStylePopover(popover) {
  if (!popover?.open) return;
  const panel = popover.querySelector(':scope > div');
  const trigger = popover.querySelector('summary').getBoundingClientRect();
  const dock = ui.editToolbar.getBoundingClientRect();
  const viewport = window.visualViewport;
  const margin = 10;
  const edge = viewport?.offsetLeft || 0;
  const width = viewport?.width || window.innerWidth;
  const top = (viewport?.offsetTop || 0) + margin;
  panel.style.setProperty('--panel-height', `${Math.max(48, dock.top - top - 8)}px`);
  panel.style.setProperty('--panel-left', '0px');
  panel.style.setProperty('--panel-offset-y', '0px');
  const panelRect = panel.getBoundingClientRect();
  const left = Math.max(edge + margin, Math.min(trigger.left, edge + width - panelRect.width - margin));
  panel.style.setProperty('--panel-left', `${left - panelRect.left}px`);
  panel.style.setProperty('--panel-offset-y', `${dock.top - 8 - panelRect.bottom}px`);
}
for (const popover of stylePopovers) {
  popover.addEventListener('toggle', () => {
    if (popover.open) {
      closeStylePopovers(popover);
      $('tweaks').close();
      $('about').close();
      placeStylePopover(popover);
    }
  });
}
window.addEventListener('resize', () => {
  for (const popover of stylePopovers) if (popover.open) placeStylePopover(popover);
}, { passive:true });
window.visualViewport?.addEventListener('resize', () => stylePopovers.forEach(placeStylePopover));
document.addEventListener('click', event => {
  if (!event.target.closest('.style-popover')) closeStylePopovers();
});
for (const [value, label] of [['dm-sans','DM Sans'],['space-grotesk','Space Grotesk'],['manrope','Manrope'],['playfair','Playfair Display'],['fraunces','Fraunces'],['dm-mono','DM Mono'],['plex-mono','IBM Plex Mono']]) {
  const option = document.createElement('button');
  option.type = 'button'; option.className = 'font-option'; option.setAttribute('role','option'); option.dataset.font = value; option.textContent = label;
  option.setAttribute('aria-selected', String(value === primaryTextStyle.fontKey));
  option.addEventListener('click', () => {
    const target = textStyleTarget();
    target.fontKey = value;
    applyTextSettings(target);
    loadTextFont(target)?.then(() => applyTextSettings(target));
    closeStylePopovers();
  });
  ui.fontOptions.append(option);
}

function graphemes(text) { return textUnits(text).length; }
function config() {
  const compositionImages = images.filter(item => !item.pending).map(item => ({
    image:item.isTextLayer ? rasterizeLiveText(item) : item.image,
    x:item.x, y:item.y, w:item.w, h:item.h, hue:item.hue || 0, kind:item.isTextLayer ? 'live-text' : 'image'
  }));
  if (drawingStrokes.length) {
    renderDrawing();
    compositionImages.push({image:ui.drawingLayer,x:0,y:0,w:1,h:1});
  }
  return { ...textConfig(), weight:600, style:'normal', preset:ui.preset.value,
    images:compositionImages };
}
function status(message, error = false) {
  ui.hint.textContent = message;
  ui.hint.classList.toggle('error', error);
}
function hueTarget() {
  const eligible = images.filter(item => !item.isTextLayer && (editMode || item.pending));
  return eligible.find(item => item.id === selectedImageId) || eligible.at(-1) || null;
}
function syncImageHue(){
  const item=hueTarget(),hue=Number(item?.hue)||0;
  $('image-hue').value=String(hue);$('image-hue-value').textContent=hue===0?'Original':`${hue}° hue shift`;
  $('image-hue-chip').style.background=hue===0?'linear-gradient(135deg,#555 0 50%,#ddd 50%)':`hsl(${hue} 74% 52%)`;
  $('image-hue').disabled=!item;$('image-hue-reset').disabled=!item||hue===0;
}
function applyImageHue(value){
  const item=hueTarget();if(!item){syncImageHue();status('Add or select an image before changing its hue.',true);return;}
  item.hue=Number(value)||0;
  const node=ui.imageLayer.querySelector(`[data-image-id="${item.id}"] img`);if(node)node.style.filter=item.hue?`hue-rotate(${item.hue}deg)`:'none';
  syncImageHue();
}
function renderDrawing() {
  const rect=ui.canvas.getBoundingClientRect();
  if(!rect.width||!rect.height||!drawContext)return;
  drawContext.clearRect(0,0,rect.width,rect.height); drawContext.lineCap='round'; drawContext.lineJoin='round';
  for(const stroke of drawingStrokes){
    if(stroke.points.length===1){drawContext.globalCompositeOperation='source-over';drawContext.globalAlpha=.72;drawContext.fillStyle=stroke.color;drawContext.beginPath();drawContext.ellipse(stroke.points[0].x*rect.width,stroke.points[0].y*rect.height,stroke.size*.38,stroke.size*.48,stroke.textureAngle||0,0,Math.PI*2);drawContext.fill();continue;}
    if(stroke.points.length<2)continue;
    const trace=(offsetX=0,offsetY=0)=>{const points=stroke.points;drawContext.beginPath();drawContext.moveTo(points[0].x*rect.width+offsetX,points[0].y*rect.height+offsetY);if(points.length===2){drawContext.lineTo(points[1].x*rect.width+offsetX,points[1].y*rect.height+offsetY);return;}for(let i=1;i<points.length-1;i++){const x=points[i].x*rect.width+offsetX,y=points[i].y*rect.height+offsetY,mx=(x+points[i+1].x*rect.width+offsetX)/2,my=(y+points[i+1].y*rect.height+offsetY)/2;drawContext.quadraticCurveTo(x,y,mx,my);}const last=points.at(-1);drawContext.lineTo(last.x*rect.width+offsetX,last.y*rect.height+offsetY);};
    drawContext.globalCompositeOperation='source-over';drawContext.strokeStyle=stroke.color;drawContext.globalAlpha=.20;drawContext.lineWidth=stroke.size*1.16;trace();drawContext.stroke();
    drawContext.globalAlpha=.76;drawContext.lineWidth=stroke.size*.82;trace();drawContext.stroke();
    drawContext.globalAlpha=.34;drawContext.lineWidth=Math.max(.7,stroke.size*.2);trace(stroke.dryX,stroke.dryY);drawContext.stroke();
    drawContext.globalCompositeOperation='destination-out';drawContext.globalAlpha=.45;
    for(const grain of stroke.grain){drawContext.beginPath();drawContext.ellipse(grain.x*rect.width,grain.y*rect.height,grain.radius,grain.radius*.65,grain.angle||0,0,Math.PI*2);drawContext.fill();}
  }
  drawContext.globalCompositeOperation='source-over';drawContext.globalAlpha=1;
  const remove = $('remove-drawing-layer');
  remove.hidden = !editMode || !!activeStroke || !drawingStrokes.length;
  if (!remove.hidden) {
    const bounds = drawingBounds(drawingStrokes, rect.width, rect.height);
    placeCornerButton(remove, bounds.right - 36, bounds.top + 4, rect.width, rect.height);
  }
}
function scheduleDrawingRender(){if(drawingRenderQueued)return;drawingRenderQueued=true;requestAnimationFrame(()=>{drawingRenderQueued=false;renderDrawing();});}
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
  for(let i=1;i<=count;i++){const t=i/count,gx=previous.x+(px-previous.x)*t,gy=previous.y+(py-previous.y)*t;if(Math.random()<.9)stroke.grain.push({x:gx+(Math.random()-.5)*stroke.size*.86/rect.width,y:gy+(Math.random()-.5)*stroke.size*.86/rect.height,radius:.35+Math.random()*1.15,angle:Math.random()*Math.PI});}
}
ui.drawingLayer.addEventListener('pointerdown',event=>{
  if (contentMode !== 'draw' || event.button !== 0 || activeStroke || committing) return;
  event.preventDefault();ui.drawingLayer.setPointerCapture(event.pointerId);const rect=ui.drawingLayer.getBoundingClientRect();
  activeStroke={color:drawColor,size:Number($('draw-size').value),points:[],grain:[],textureAngle:Math.random()*Math.PI,dryX:(Math.random()-.5)*Number($('draw-size').value)*.16,dryY:(Math.random()-.5)*Number($('draw-size').value)*.16};drawingStrokes.push(activeStroke);
  pushStrokePoint(activeStroke,event.clientX-rect.left,event.clientY-rect.top,rect);renderDrawing();preview();
});
ui.drawingLayer.addEventListener('pointermove',event=>{if(!activeStroke)return;const rect=ui.drawingLayer.getBoundingClientRect();pushStrokePoint(activeStroke,event.clientX-rect.left,event.clientY-rect.top,rect);scheduleDrawingRender();});
function finishStroke(){
  if(!activeStroke)return;
  const completedStroke=activeStroke;
  activeStroke=null;
  renderDrawing();
  if(!editMode){
    try {
      const crop = cropDrawing([completedStroke]);
      const id = `drawing-${++imageSequence}`;
      sim.addImages([{...crop, id, kind:'chalk'}]);
      images.push({...crop, id, name:'Chalk drawing', url:crop.image.toDataURL('image/png'), pending:false});
      liveStrokeIds.push(id);
      status('Chalk added to the live simulation.');
    } catch (error) {
      status(error.message || 'Could not add this drawing.', true);
    } finally {
      drawingStrokes = [];
      renderDrawing();
      updateBrushTools();
    }
  }else status('Drawing added. Keep sketching or press Play to feed it to the ants.');
}
ui.drawingLayer.addEventListener('pointerup', finishStroke);
ui.drawingLayer.addEventListener('pointercancel', () => {
  if (!activeStroke) return;
  drawingStrokes = drawingStrokes.filter(stroke => stroke !== activeStroke);
  activeStroke = null;
  renderDrawing();
  updateBrushTools();
});
function updateBrushTools() {
  const canUndo = editMode ? drawingStrokes.length > 0 : liveStrokeIds.length > 0;
  ui.undoDrawing.disabled = !canUndo;
  $('clear-drawing').disabled = !canUndo;
}
function undoLiveDrawing(count) {
  const ids = liveStrokeIds.splice(liveStrokeIds.length - count, count);
  if (!ids.length) return;
  sim.removeLiveChalk(ids);
  images = images.filter(item => !ids.includes(item.id));
}
function preview() {
  const current = textConfig();
  const pending = images.some(item=>item.pending);
  const showText = editMode && (contentMode === 'text' || current.text.trim().length > 0);
  ui.editor.hidden = !showText;
  ui.editor.classList.toggle('is-hidden', !showText);
  ui.editor.readOnly = contentMode !== 'text';
  ui.editor.classList.toggle('composition-preview', contentMode !== 'text' && showText);
  ui.editHint.hidden = !editMode || contentMode === 'image';
  ui.typeStyle.hidden = contentMode !== 'text';
  ui.addTextLayer.hidden = contentMode !== 'text';
  ui.imageTools.hidden = contentMode !== 'image';
  ui.imageHuePanel.hidden = contentMode !== 'image' || !hueTarget();
  ui.drawSettings.hidden = contentMode !== 'draw';
  ui.undoDrawing.hidden = contentMode !== 'draw';
  updateBrushTools();
  syncImageHue();
  ui.drawingLayer.hidden = contentMode !== 'draw' && !editMode;
  if (!ui.drawingLayer.hidden) renderDrawing();
  else $('remove-drawing-layer').hidden = true;
  ui.modeDraw.disabled = false;
  document.querySelector('.stage-wrap').classList.toggle('is-drawing',contentMode==='draw');
  toolbarControls.classList.toggle('image-mode', contentMode === 'image');
  toolbarControls.classList.toggle('draw-mode', contentMode === 'draw');
  ui.modeText.classList.toggle('active', contentMode === 'text');
  ui.modeImage.classList.toggle('active', contentMode === 'image');
  ui.modeDraw.classList.toggle('active', contentMode === 'draw');
  ui.modeText.setAttribute('aria-pressed', String(contentMode === 'text'));
  ui.modeImage.setAttribute('aria-pressed', String(contentMode === 'image'));
  ui.modeDraw.setAttribute('aria-pressed', String(contentMode === 'draw'));
  ui.imageLayer.hidden = !(editMode && images.length) && !pending;
  if (contentMode === 'draw') ui.editHint.textContent = 'Draw on the scene. Open brush settings to change size or color.';
  $('clear-image').hidden = !images.some(item => item.id === selectedImageId && !item.isTextLayer && (editMode || item.pending));
  renderImageLayers();
  updateTextAppearance();
  ui.editHint.textContent = contentMode === 'text'
    ? 'Enter to feed · Shift + Enter for a new line'
    : contentMode === 'draw' ? 'Draw on the scene. Open brush settings to change size or color.'
    : 'Add, drag, resize, or paste images. Click outside to commit.';
}
function applyTextLayout(canvas, config, layout, width, height) {
  const scale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
  const w = Math.ceil(width * scale), h = Math.ceil(height * scale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const context = canvas.getContext('2d');
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);
  if (config.text.trim()) paintText(context, config, layout, width / 2, height / 2);
}
function textConfig() {
  return {text:ui.editor.value, font:fonts[primaryTextStyle.fontKey],
    textColor:primaryTextStyle.color, size:primaryTextStyle.size, tracking:-.055};
}
function pendingTextLayer() {
  return images.find(item => item.isTextLayer && item.pending);
}
function selectedTextLayer() {
  if (contentMode !== 'text') return null;
  return images.find(item => item.id === selectedImageId && item.isTextLayer && (editMode || item.pending)) || null;
}
function textStyleTarget() {
  return selectedTextLayer() || primaryTextStyle;
}
function selectTextLayer(item = null) {
  if (contentMode !== 'text') return;
  selectedImageId = item?.id || null;
  for (const node of ui.imageLayer.querySelectorAll('.image-item')) {
    node.classList.toggle('selected', node.dataset.imageId === selectedImageId);
  }
  syncTextControls();
}
function updateTextAppearance() {
  const current = textConfig();
  const width = ui.canvas.clientWidth, height = ui.canvas.clientHeight;
  if (width < 1 || height < 1) return;
  const layout = layoutText(current, width, height);
  const editor = ui.editor;
  Object.assign(editor.style, {
    width:`${layout.maxWidth}px`,
    height:`${Math.min(layout.maxHeight, Math.max(layout.lineHeight, layout.height + 2))}px`,
    fontSize:`${layout.size}px`, lineHeight:`${layout.lineHeight}px`,
    fontFamily:current.font, letterSpacing:`${current.tracking}em`
  });
  editor.style.setProperty('--editor-ink', current.textColor);
  ui.textPreview.hidden = !editMode;
  const remove = $('remove-primary-text');
  remove.hidden = !editMode || !current.text.trim();
  if (!remove.hidden) {
    placeCornerButton(remove, (width + layout.widest) / 2 + 5, (height - layout.height) / 2 - 32, width, height);
  }
  if (editMode) {
    applyTextLayout(ui.textPreview, current, layout, width, height);
    if (ui.editor.value.trim()) ui.textPreview.classList.add('has-text');
    else ui.textPreview.classList.remove('has-text');
  }
  updatePrimarySelection(layout, width, height);
  syncTextControls(layout);
}
function updatePrimarySelection(layout, width, height) {
  const outline = $('primary-text-selection');
  outline.hidden = !editMode || contentMode !== 'text' || !!selectedTextLayer() || !ui.editor.value.trim();
  if (outline.hidden) return;
  const w = Math.min(width - 12, layout.widest + 20), h = Math.min(height - 12, layout.height + 12);
  Object.assign(outline.style, {width:`${w}px`, height:`${h}px`});
}
function syncTextControls(primaryLayout) {
  const layer = selectedTextLayer();
  const target = layer || primaryTextStyle;
  const width = ui.canvas.clientWidth, height = ui.canvas.clientHeight;
  const mainLayout = primaryLayout || layoutText(textConfig(), width, height);
  const layout = layer ? liveTextLayout(layer).layout : mainLayout;
  if (!primaryLayout) updatePrimarySelection(mainLayout, width, height);
  const preferred = target.size;
  const sizeLabel = layout.size === preferred ? `${preferred} px` : `${preferred} px (fits at ${layout.size})`;
  $('size-value').textContent = sizeLabel;
  $('edit-size-value').textContent = sizeLabel;
  ui.size.value = String(preferred);
  ui.editSize.value = String(preferred);
  ui.editSize.setAttribute('aria-valuetext', sizeLabel);
  ui.size.setAttribute('aria-valuetext', sizeLabel);
  ui.color.value = target.color;
  const words = (layer ? layer.text : ui.editor.value).trim().replace(/\s+/g, ' ');
  const context = words ? `Editing “${words.length > 42 ? words.slice(0, 42) + '…' : words}”` : layer ? 'Editing a new text box' : 'Editing the main text box';
  document.querySelectorAll('[data-text-target]').forEach(node => { node.textContent = context; });
  ui.fontOptions.querySelectorAll('.font-option').forEach(option => {
    option.setAttribute('aria-selected', String(option.dataset.font === target.fontKey));
  });
  document.querySelectorAll('#type-style .color-swatch').forEach(swatch => {
    swatch.setAttribute('aria-pressed', String(swatch.dataset.color === target.color.toLowerCase()));
  });
}
let styleUpdateTimer = 0;
function applyTextSettings(target) {
  if (target !== primaryTextStyle) {
    if (images.includes(target)) styleLiveText(target);
    if (textStyleTarget() === target) syncTextControls();
    return;
  }
  updateTextAppearance();
  if (editMode || !cycleText.trim() || styleUpdateTimer) return;
  styleUpdateTimer = setTimeout(() => {
    styleUpdateTimer = 0;
    if (!editMode) sim.updatePrimaryText(textConfig());
  }, 16);
}
function liveTextLayout(item) {
  const width = Math.max(1, ui.canvas.clientWidth * item.w);
  const height = Math.max(1, ui.canvas.clientHeight * item.h);
  const config = {text:item.text, font:fonts[item.fontKey], size:item.size, textColor:item.color, tracking:-.055};
  return {width, height, config, layout:layoutText(config, width, height, {
    width:Math.max(1,width - 12), height:Math.max(1,height - 12)
  })};
}
function styleLiveText(item, wrapper = ui.imageLayer.querySelector(`[data-image-id="${item.id}"]`)) {
  if (!wrapper) return;
  const {width, height, config, layout} = liveTextLayout(item);
  const canvas = wrapper.querySelector('.text-layer-preview');
  if (canvas) applyTextLayout(canvas, config, layout, width, height);
  const entry = wrapper.querySelector('.live-text-entry');
  if (entry) {
    Object.assign(entry.style, {fontFamily:config.font, fontSize:`${layout.size}px`, lineHeight:`${layout.lineHeight}px`,
      paddingTop:`${Math.max(6, (height - layout.height) / 2)}px`});
    entry.style.setProperty('--entry-ink', item.color);
  }
}
function loadTextFont(target = primaryTextStyle) {
  const text = target === primaryTextStyle ? ui.editor.value : target.text;
  return document.fonts?.load(`600 ${target.size}px ${fonts[target.fontKey]}`, text || 'Type').catch(() => {});
}
function setMode(mode) {
  if (mode !== contentMode) closeStylePopovers();
  if (mode === contentMode) return;
  contentMode = mode;
  preview();
  if (mode === 'draw') { status(editMode?'Sketch on the scene. Use Play when the composition is ready.':'Sketch and release to add chalk to the live scene.'); return; }
  status(!editMode
    ? (mode === 'image' ? 'Add images, then confirm with ✓ or cancel with ×.' : 'Add another text layer, or adjust the font, size, and color.')
    : (mode === 'image' ? 'Text stays on top. Add images, then press Enter or Play to start.' : (images.length ? 'Text stays on top of your collage. Press Enter to start.' : 'Type in the center. Press Enter to feed.')));
}
ui.modeText.addEventListener('click', () => setMode('text'));
ui.modeImage.addEventListener('click', () => setMode('image'));
  ui.modeDraw.addEventListener('click', () => setMode('draw'));
function openTextLayer() {
  if (committing) return;
  closeStylePopovers();
  let item = pendingTextLayer();
  if (!item) {
    const {fontKey, size, color} = textStyleTarget();
    const y = images.filter(layer => layer.isTextLayer).length % 2 ? .2 : .62;
    item = {id:`text-${++imageSequence}`, name:'Text box', text:'', fontKey,
      size, color, x:.18, y, w:.64, h:.19,
      pending:true, isTextLayer:true, image:null, url:''};
    images.push(item);
  }
  selectedImageId = item.id;
  contentMode = 'text';
  preview();
  ui.imageLayer.querySelector(`[data-image-id="${item.id}"] .live-text-entry`)?.focus();
  status('Type the new text, move or resize it, then confirm it.');
}
ui.addTextLayer.addEventListener('click',openTextLayer);
function updatePlayButton() {
  const icon = ui.playPause.querySelector('.material-symbols-outlined');
  const active = !editMode && !sim.paused;
  const label = editMode ? 'Start feeding' : active ? 'Pause simulation' : 'Resume simulation';
  setIcon(icon, editMode || !active ? 'play_arrow' : 'pause');
  ui.playPause.setAttribute('aria-label', label);
  ui.playPause.title = label;
}
function setEditing() {
  if (!editMode) ui.editor.value = cycleText;
  sim.cancel();
  liveStrokeIds = [];
  editMode = true;
  ui.editor.classList.remove('is-hidden');
  ui.editor.disabled = false;
  ui.editToolbar.hidden = false;
  ui.editHint.hidden = false;
  ui.playPause.disabled = false;
  ui.replay.disabled = true;
  ui.state.textContent = 'EDITING / INTACT PREVIEW';
  ui.remaining.textContent = '';
  preview();
  updatePlayButton();
  status(contentMode === 'image' ? 'Arrange the collage, then press Enter to feed.' : contentMode === 'draw' ? 'Continue sketching or press Play to start.' : 'Type, choose a font, size, and color, then press Enter to feed.');
  if (contentMode === 'image' && images.length) ui.imageLayer.focus?.(); else if (contentMode === 'text') ui.editor.focus();
}
async function startFeeding() {
  if (committing || !editMode) return;
  const draft = pendingTextLayer();
  if (draft && !commitPendingImage(draft)) return;
  for (const item of images.filter(item => item.pending && !item.isTextLayer)) commitPendingImage(item);
  let current = config();
  if (!current.images.length && !current.text.trim()) { status('Add text or an image before starting.', true); ui.editor.focus(); return; }
  if (current.text.trim() && graphemes(current.text) > 500) { status('This draft is over the 500 grapheme limit. Shorten it before starting; your full text is preserved.', true); return; }
  committing = true;
  ui.playPause.disabled = true;
  ui.scrap.disabled = true;
    status(current.images.length && current.text.trim() ? 'Preparing text and images…' : current.images.length ? 'Preparing the collage…' : 'Preparing the text…');
  try {
    await Promise.all([loadTextFont(), ...images.filter(item => item.isTextLayer).map(loadTextFont)]);
    current = config();
    const drawing = drawingStrokes.length ? cropDrawing(drawingStrokes) : null;
    current.layout = layoutText(current, ui.canvas.clientWidth, ui.canvas.clientHeight);
    applyTextLayout(ui.textPreview, current, current.layout, ui.canvas.clientWidth, ui.canvas.clientHeight);
    cycleText = current.text;
    await sim.start(current);
    if (drawing) {
      images.push({...drawing, id:`drawing-${++imageSequence}`, name:'Chalk drawing',
        url:drawing.image.toDataURL('image/png'), pending:false});
      drawingStrokes = [];
    }
    editMode = false;
    selectedImageId = null;
    ui.editor.classList.add('is-hidden');
    ui.imageLayer.hidden = true;
    ui.editHint.hidden = true;
    ui.playPause.disabled = false;
    ui.replay.disabled = false;
    ui.state.textContent = `ANTS ARE FEEDING · ${Math.round((1-sim.consumed)*100)}% MATERIAL LEFT`;
    preview();
    updatePlayButton();
    status('Use Reset to clear the decay and return to Edit.');
  } catch (error) {
    status(error.message || 'Could not prepare this composition.', true);
    ui.playPause.disabled = false;
  } finally { committing = false; ui.scrap.disabled = false; }
}

ui.editor.addEventListener('focus', () => selectTextLayer());
ui.editor.addEventListener('pointerdown', () => selectTextLayer());
ui.editor.addEventListener('input', () => {
  updateTextAppearance();
  if (graphemes(ui.editor.value) > 500) status('Over the 500 grapheme limit. Your complete draft is preserved.', true);
  else if (editMode) status('Press Enter to start feeding.');
});
ui.editor.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !event.repeat) {
    event.preventDefault();
    if (editMode) startFeeding();
  }
});
for (const slider of [ui.size, ui.editSize]) {
  slider.addEventListener('input', () => {
    const target = textStyleTarget();
    target.size = Number(slider.value);
    applyTextSettings(target);
  });
}
$('remove-primary-text').addEventListener('click', () => {
  if (!editMode) return;
  ui.editor.value = '';
  updateTextAppearance();
  status('Text removed.');
  if (contentMode === 'text') ui.editor.focus();
});

document.querySelectorAll('#type-style .color-swatch').forEach(swatch => swatch.addEventListener('click', () => {
  const target = textStyleTarget();
  target.color = swatch.dataset.color;
  applyTextSettings(target);
  closeStylePopovers();
}));
ui.color.addEventListener('input', () => {
  if (!/^#[0-9a-f]{6}$/i.test(ui.color.value)) return;
  const target = textStyleTarget();
  target.color = ui.color.value;
  applyTextSettings(target);
});
ui.color.addEventListener('blur', () => { ui.color.value = textStyleTarget().color; });
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
function clearDrawing() {
  if (!editMode) undoLiveDrawing(liveStrokeIds.length);
  drawingStrokes = [];
  activeStroke = null;
  renderDrawing();
  updateBrushTools();
  status('Drawing cleared.');
}
$('clear-drawing').addEventListener('click', clearDrawing);
$('remove-drawing-layer').addEventListener('click', clearDrawing);
ui.undoDrawing.addEventListener('click', () => {
  if (editMode) drawingStrokes.pop();
  else undoLiveDrawing(1);
  renderDrawing();
  updateBrushTools();
  status('Last chalk stroke undone.');
});
$('image-hue').addEventListener('input',event=>applyImageHue(event.target.value));
$('image-hue-reset').addEventListener('click',()=>applyImageHue(0));

function placeCornerButton(button, x, y, width, height) {
  button.style.left = `${Math.max(4, Math.min(width - 38, x))}px`;
  button.style.top = `${Math.max(4, Math.min(height - 38, y))}px`;
}
function drawingBounds(strokes, width, height) {
  let left = width, top = height, right = 0, bottom = 0;
  for (const stroke of strokes) {
    const padding = stroke.size * 2.2;
    for (const point of stroke.points) {
      left = Math.min(left, point.x * width - padding);
      right = Math.max(right, point.x * width + padding);
      top = Math.min(top, point.y * height - padding);
      bottom = Math.max(bottom, point.y * height + padding);
    }
  }
  return {left:Math.max(0, left), top:Math.max(0, top),
    right:Math.min(width, right), bottom:Math.min(height, bottom)};
}
function cropDrawing(strokes) {
  const rect = ui.canvas.getBoundingClientRect(), source = ui.drawingLayer;
  const bounds = drawingBounds(strokes, rect.width, rect.height);
  const sx = source.width / rect.width, sy = source.height / rect.height;
  const left = Math.floor(bounds.left * sx), top = Math.floor(bounds.top * sy);
  const right = Math.ceil(bounds.right * sx), bottom = Math.ceil(bounds.bottom * sy);
  const image = document.createElement('canvas');
  image.width = Math.max(1, right - left);
  image.height = Math.max(1, bottom - top);
  image.getContext('2d').drawImage(source, -left, -top);
  return {image, x:left/source.width, y:top/source.height, w:image.width/source.width, h:image.height/source.height};
}

function togglePlayback() {
  if (sim.paused) { sim.resume(); status('Feeding resumed.'); }
  else { sim.pause(); status('Feeding paused.'); }
  updatePlayButton();
}
ui.playPause.addEventListener('click', () => editMode ? startFeeding() : togglePlayback());
const confirmDialog = $('confirm-session');
function askSessionAction(action) {
  if (committing || confirmDialog.open) return;
  closeStylePopovers();
  const resetting = action === 'reset';
  $('confirm-title').textContent = resetting ? 'Do you want to reset the simulation?' : 'Scrap everything?';
  $('confirm-description').textContent = resetting
    ? 'Clear the decay and return to Edit with your composition intact.'
    : 'Remove all text, images, and drawings and clear this session.';
  $('confirm-session-action').textContent = resetting ? 'Reset and edit' : 'Scrap everything';
  confirmDialog.dataset.action = action;
  confirmDialog.showModal();
}
function scrapComposition() {
  compositionGeneration++;
  for (const item of images) if (item.url?.startsWith('blob:')) URL.revokeObjectURL(item.url);
  images = [];
  selectedImageId = null;
  drawingStrokes = [];
  activeStroke = null;
  cycleText = '';
  ui.editor.value = '';
  contentMode = 'text';
  setEditing();
  status('Start a new composition with text, images, or a drawing.');
}
ui.replay.addEventListener('click', () => askSessionAction('reset'));
ui.scrap.addEventListener('click', () => askSessionAction('scrap'));
confirmDialog.querySelector('form').addEventListener('submit', event => {
  event.preventDefault();
  confirmDialog.close();
  if (event.submitter?.value !== 'confirm') return;
  if (confirmDialog.dataset.action === 'scrap') scrapComposition();
  else {
    setEditing();
    status('Simulation reset. Edit the composition, then press Play.');
  }
  ui.playPause.focus();
});
const appShell=$('app');
function setInterfaceHidden(hidden){
  appShell.classList.toggle('ui-minimized',hidden);
  toolbarControls.inert = hidden;
  ui.restoreUI.inert = !hidden;
  ui.imageLayer.inert = hidden;
  if (hidden) document.activeElement?.blur();
}
ui.minimizeUI.addEventListener('click',()=>{
  const hide=!appShell.classList.contains('ui-minimized');
  if(hide){closeStylePopovers();$('tweaks').close();$('about').close();}
  setInterfaceHidden(hide);
  (hide ? ui.restoreUI : ui.minimizeUI).focus();
});
ui.restoreUI.addEventListener('click',()=>{setInterfaceHidden(false);ui.minimizeUI.focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&appShell.classList.contains('ui-minimized')){setInterfaceHidden(false);ui.minimizeUI.focus();}});

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
  catch { status('Clipboard access was denied.', true); }
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
  for (const item of images) {
    const image = item.isTextLayer ? (!item.pending && rasterizeLiveText(item)) : item.image;
    if (!image) continue;
    context.save();
    if (item.hue) context.filter = `hue-rotate(${item.hue}deg)`;
    context.drawImage(image, item.x * width, item.y * height, item.w * width, item.h * height);
    context.restore();
  }
  if (drawingStrokes.length) context.drawImage(ui.drawingLayer,0,0,width,height);
  const current = textConfig();
  if (current.text.trim()) paintText(context, current, layoutText(current, width, height), width / 2, height / 2);
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
    wrapper.classList.toggle('text-draft', item.isTextLayer && (item.pending || contentMode === 'text'));
    wrapper.dataset.imageId = item.id;
    wrapper.style.left = `${item.x * 100}%`; wrapper.style.top = `${item.y * 100}%`;
    wrapper.style.width = `${item.w * 100}%`; wrapper.style.height = `${item.h * 100}%`;
    wrapper.setAttribute('role','group'); wrapper.setAttribute('aria-label',`${item.name}; drag to move, use corner handles to resize`);
    if (item.isTextLayer) {
      const canvas = document.createElement('canvas');
      canvas.className = 'text-layer-preview';
      canvas.setAttribute('aria-hidden', 'true');
      wrapper.append(canvas);
      if (contentMode === 'text') {
        const entry = document.createElement('textarea');
        entry.className = 'live-text-entry';
        entry.placeholder = 'Type here';
        entry.value = item.text;
        entry.setAttribute('aria-label', 'Text box');
        entry.maxLength = 500;
        entry.addEventListener('focus', () => selectTextLayer(item));
        entry.addEventListener('input', () => {
          item.text = entry.value;
          applyTextSettings(item);
        });
        wrapper.append(entry);
        const drag = document.createElement('div');
        drag.className = 'text-drag-handle';
        drag.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">drag_indicator</span><span>Move text</span>';
        wrapper.append(drag);
      }
      styleLiveText(item, wrapper);
    }else{
    const image = document.createElement('img'); image.src = item.url; image.alt = item.name; image.draggable = false;
    if(item.hue)image.style.filter=`hue-rotate(${item.hue}deg)`;
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
    } else if (editMode) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'layer-remove image-remove';
      remove.title = `Remove ${item.name}`;
      remove.setAttribute('aria-label', remove.title);
      remove.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">close</span>';
      remove.addEventListener('pointerdown', event => event.stopPropagation());
      remove.addEventListener('click', () => removeCompositionItem(item));
      wrapper.append(remove);
    }
    placeImageActions(item, wrapper);
    for (const corner of ['nw','ne','sw','se']) {
      const handle = document.createElement('span');
      handle.className = `resize-handle ${corner}`; handle.dataset.corner = corner;
      handle.setAttribute('role','button'); handle.setAttribute('aria-label',`Resize ${item.name} from ${corner.toUpperCase()}`);
      wrapper.append(handle);
    }
    wrapper.addEventListener('pointerdown', event => beginImageTransform(event, item, wrapper));
    renderIcons(wrapper);
    ui.imageLayer.append(wrapper);
  }
}

function placeImageActions(item, wrapper) {
  const width = ui.canvas.clientWidth, height = ui.canvas.clientHeight;
  const itemLeft = item.x * width;
  const itemTop = item.y * height;
  const itemRight = (item.x + item.w) * width;
  const desired = itemRight - 78;
  const left = Math.max(5, Math.min(desired, width - 81));
  wrapper.style.setProperty('--image-actions-left', `${left - itemLeft}px`);
  const removeLeft = Math.max(4, Math.min(itemRight - 39, width - 38));
  const removeTop = Math.max(4, Math.min(itemTop + 5, height - 38));
  wrapper.style.setProperty('--image-remove-left', `${removeLeft - itemLeft}px`);
  wrapper.style.setProperty('--image-remove-top', `${removeTop - itemTop}px`);
}

function beginImageTransform(event, item, wrapper) {
  if ((!editMode && !item.pending) || event.button !== 0) return;
  if (item.isTextLayer && contentMode === 'text') {
    selectTextLayer(item);
    if (!event.target.closest('.text-drag-handle,.resize-handle')) return;
  }
  event.preventDefault();
  selectedImageId = item.id;
  ui.imageLayer.querySelectorAll('.image-item').forEach(node=>node.classList.toggle('selected',node===wrapper));
  ui.imageHuePanel.hidden = contentMode !== 'image' || !hueTarget();
  $('clear-image').hidden = contentMode !== 'image' || item.isTextLayer;
  syncImageHue();
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
    placeImageActions(item, active);
    if (item.isTextLayer) styleLiveText(item, active);
  };
  const done = () => {
    active.removeEventListener('pointermove', move);
    active.removeEventListener('pointerup', done);
    active.removeEventListener('pointercancel', done);
    if (item.isTextLayer) syncTextControls();
  };
  active.addEventListener('pointermove',move); active.addEventListener('pointerup',done); active.addEventListener('pointercancel',done);
}

function setImage(file, dropPoint = null) {
  if (!file || !/^(image\/(png|jpeg|svg\+xml))$/i.test(file.type)) {
    status('Choose a PNG, JPEG, or SVG image.', true); return;
  }
  const generation = compositionGeneration;
  const url = URL.createObjectURL(file), image = new Image();
  image.onload = () => {
    if (generation !== compositionGeneration) { URL.revokeObjectURL(url); return; }
    const rect = ui.canvas.getBoundingClientRect();
    let w = Math.min(.44,560/rect.width), h = w * image.naturalHeight / image.naturalWidth * rect.width / rect.height;
    if (h > .58) { w *= .58 / h; h = .58; }
    const index = images.length;
    const cx = dropPoint ? dropPoint.x : .5 + (index % 3 - 1) * .06;
    const cy = dropPoint ? dropPoint.y : .48 + (index % 3 - 1) * .05;
    const item = { id:`image-${++imageSequence}`, image, url, name:file.name || 'Pasted SVG', pending:true,hue:0,
      w,h,x:Math.max(0,Math.min(1-w,cx-w/2)),y:Math.max(0,Math.min(1-h,cy-h/2)) };
    contentMode = 'image';
    images.push(item); selectedImageId = item.id;
    preview();
    status('Drag or resize the image, then confirm it or click outside.');
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    if (generation === compositionGeneration) status('This image could not be opened.', true);
  };
  image.src = url;
}
ui.imageFile.addEventListener('change', () => {
  for (const file of ui.imageFile.files || []) setImage(file);
  ui.imageFile.value = '';
});
$('add-image').addEventListener('click', () => ui.imageFile.click());
$('clear-image').addEventListener('click', () => {
  const item = images.find(layer => layer.id === selectedImageId);
  if (item) removeCompositionItem(item);
});
function removeCompositionItem(item) {
  if (!editMode && !item.pending) return;
  if (item.pending) { cancelPendingImage(item); return; }
  if (item.url?.startsWith('blob:')) URL.revokeObjectURL(item.url);
  images = images.filter(layer => layer !== item);
  if (selectedImageId === item.id) selectedImageId = null;
  preview();
  status(`${item.name} removed.`);
}
async function pasteImage() {
  const generation = compositionGeneration;
  try {
    const items = await navigator.clipboard.read();
    let found = false;
    for (const item of items) {
      const type = item.types.find(t => /^(image\/(png|jpeg|svg\+xml))$/i.test(t))
        || item.types.find(t => t === 'text/plain');
      if (!type) continue;
      const blob = await item.getType(type);
      if (generation !== compositionGeneration) return;
      if (type === 'text/plain') {
        const text = await blob.text();
        if (generation !== compositionGeneration) return;
        if (!/<svg[\s>]/i.test(text)) continue;
        setImage(new Blob([text], { type:'image/svg+xml' }));
      } else setImage(blob);
      found = true;
    }
    if (!found && generation === compositionGeneration) status('No PNG, JPEG, or SVG image was found on the clipboard.', true);
  } catch {
    if (generation === compositionGeneration) status('Clipboard access was blocked. Use Add image, or click the stage and press Ctrl+V.', true);
  }
}
$('paste-image').addEventListener('click', pasteImage);
document.querySelector('.stage-wrap').addEventListener('paste', event => {
  const files = [...(event.clipboardData?.items || [])].map(item => item.getAsFile?.()).filter(file => file && /^(image\/(png|jpeg|svg\+xml))$/i.test(file.type));
  if (files.length) { event.preventDefault(); for (const file of files) setImage(file); }
});
const stage = document.querySelector('.stage-wrap');
stage.addEventListener('click', event => {
  if (appShell.classList.contains('ui-minimized') || event.target !== ui.canvas) return;
  const pendingImages = images.filter(item => item.pending && !item.isTextLayer);
  if (pendingImages.length) {
    for (const item of pendingImages) commitPendingImage(item);
  } else if (editMode && selectedImageId) {
    selectedImageId = null;
    preview();
  }
});
function commitPendingImage(item) {
  if (!item?.pending) return false;
  if (item.isTextLayer && !item.text.trim()) {
    status('Type something before adding this text layer, or cancel it.', true);
    ui.imageLayer.querySelector(`[data-image-id="${item.id}"] .live-text-entry`)?.focus();
    return false;
  }
  try {
    if (item.isTextLayer && !editMode) {
      item.image = rasterizeLiveText(item);
    }
    if (!editMode) sim.addImages([{image:item.image,x:item.x,y:item.y,w:item.w,h:item.h,hue:item.hue||0,kind:item.isTextLayer?'live-text':'image'}]);
    item.pending = false;
    selectedImageId = editMode && item.isTextLayer ? item.id : null;
    preview();
    const material = item.isTextLayer ? 'Text layer' : 'Image';
    status(editMode ? `${material} placed. Press Play when ready.` : `${material} added to the live simulation.`);
    return true;
  } catch (error) {
    status(error.message || 'Could not add this layer.', true);
    return false;
  }
}
function rasterizeLiveText(item) {
  const {width, height, config, layout} = liveTextLayout(item);
  const canvas = document.createElement('canvas');
  applyTextLayout(canvas, config, layout, width, height);
  return canvas;
}
function cancelPendingImage(item) {
  const index = images.indexOf(item);
  if (index < 0 || !item.pending) return;
  if(item.url)URL.revokeObjectURL(item.url); images.splice(index,1);
  selectedImageId = null;
  preview();
  status(item.isTextLayer ? 'Text layer cancelled.' : 'Image cancelled.');
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
  sim.refreshTrails();
});
const stainControl = $('stain-duration');
function updateStainDuration() {
  const value = Number(stainControl.value);
  const off = value === Number(stainControl.min);
  const session = value === Number(stainControl.max);
  const minutes = Math.floor(value / 60), seconds = value % 60;
  const duration = minutes ? `${minutes} min${seconds ? ` ${seconds} sec` : ''}` : `${seconds} sec`;
  const label = off ? 'Off' : session ? 'Session' : duration;
  $('stain-value').textContent = label;
  stainControl.setAttribute('aria-valuetext', label);
  sim.setStainDuration(off ? 0 : session ? Infinity : value);
}
stainControl.addEventListener('input', updateStainDuration);

const sessionElapsed = $('session-elapsed');
sim.onUpdate(({ state, remaining, total, elapsed }) => {
  const percent=total?Math.round(100*remaining/total):0;
  const label = state && total ? `${state === 'feeding' ? 'ANTS ARE FEEDING' : state.toUpperCase()} · ${percent}% MATERIAL LEFT` : state?.toUpperCase() || 'READY TO FEED';
  if (ui.state.textContent !== label) ui.state.textContent = label;
  const timestamp = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  if (sessionElapsed.textContent !== timestamp) {
    sessionElapsed.textContent = timestamp;
    sessionElapsed.dateTime = `PT${elapsed}S`;
  }
});
new ResizeObserver(() => { sim.resize(); resizeDrawingLayer(); preview(); }).observe(ui.canvas.parentElement);
document.addEventListener('visibilitychange', () => document.hidden ? sim.pauseForHidden() : sim.resumeFromHidden());
sim.resize();
updateStainDuration();
resizeDrawingLayer();
updateLabels(); preview(); updatePlayButton();
loadTextFont()?.then(updateTextAppearance);
