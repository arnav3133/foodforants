import { createSimulation } from './simulation.js';

const $ = id => document.getElementById(id);
const ui = {
  canvas:$('scene'), editor:$('copy'), font:$('font'), color:$('text-color'), size:$('size'), autofit:$('autofit'),
  imageLayer:$('image-layer'), imageFile:$('image-file'), editSize:$('edit-size'), trails:$('trails'),
  editToolbar:$('edit-toolbar'), editHint:$('edit-hint'), hint:$('hint'), state:$('state-label'), remaining:$('remaining'),
  typeStyle:$('type-style'), imageTools:$('image-tools'), modeText:$('mode-text'), modeImage:$('mode-image'),
  additionActions:$('addition-actions'), confirmAdd:$('confirm-add'), cancelAdd:$('cancel-add'),
  playPause:$('play-pause'), replay:$('replay'), edit:$('edit'), preset:$('preset'),
  antSpeed:$('ant-speed'), antChaos:$('ant-chaos'), frequency:$('eating-frequency'), resistance:$('resistance'), deform:$('deform'), dialog:$('tweaks'), theme:$('theme-toggle')
};
const sim = createSimulation(ui.canvas);
let editMode = true, committing = false;
let contentMode = 'text';
let images = [], selectedImageId = null, imageSequence = 0, cycleText = '';
const fonts = {
  'dm-sans':'"DM Sans", sans-serif',
  'space-grotesk':'"Space Grotesk", sans-serif',
  manrope:'Manrope, sans-serif',
  playfair:'"Playfair Display", Georgia, serif',
  fraunces:'Fraunces, Georgia, serif',
  'dm-mono':'"DM Mono", monospace',
  'plex-mono':'"IBM Plex Mono", monospace'
};

function graphemes(text) { return [...new Intl.Segmenter(undefined, { granularity:'grapheme' }).segment(text)].length; }
function config() {
  return { text:ui.editor.value, font:fonts[ui.font.value], textColor:ui.color.value,
    size:Number(ui.size.value), auto:ui.autofit.checked, weight:600, style:'normal', tracking:-.055, preset:ui.preset.value,
    images:images.filter(item=>!item.pending).map(({image,x,y,w,h})=>({image,x,y,w,h})) };
}
function status(message, error = false) {
  ui.hint.textContent = message;
  ui.hint.classList.toggle('error', error);
}
function preview() {
  const current = config();
  const pending = images.some(item=>item.pending);
  const showTextEntry = contentMode === 'text' && editMode;
  ui.editor.hidden = !showTextEntry;
  ui.editor.classList.toggle('is-hidden', !showTextEntry);
  ui.editToolbar.hidden = false;
  ui.editHint.hidden = !editMode || contentMode !== 'text';
  ui.typeStyle.hidden = !editMode || contentMode !== 'text';
  ui.imageTools.hidden = contentMode !== 'image';
  const additionActive = !editMode && pending;
  ui.additionActions.hidden = !additionActive;
  ui.cancelAdd.hidden = !additionActive;
  ui.modeText.classList.toggle('active', contentMode === 'text');
  ui.modeImage.classList.toggle('active', contentMode === 'image');
  ui.modeText.setAttribute('aria-pressed', String(contentMode === 'text'));
  ui.modeImage.setAttribute('aria-pressed', String(contentMode === 'image'));
  ui.imageLayer.hidden = !(editMode && images.length) && !pending;
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
    : 'Add, drag, resize, or paste images. Click outside to commit.';
}
function setMode(mode) {
  if (mode === contentMode) {
    if (!editMode && mode === 'text') status('Text is locked during a run. Use Edit to change it and start a new run.');
    return;
  }
  contentMode = mode;
  preview();
  status(!editMode
    ? (mode === 'image' ? 'Add images, then confirm with ✓ or cancel with ×.' : 'The original text is fixed for this run. Choose Images to add more material.')
    : (mode === 'image' ? 'Drop or add images. Press Enter to start feeding.' : 'Type in the center. Press Enter to feed.'));
}
ui.modeText.addEventListener('click', () => setMode('text'));
ui.modeImage.addEventListener('click', () => setMode('image'));
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
  status(contentMode === 'image' ? 'Arrange the collage, then press Enter to feed.' : 'Type, choose a font, size, and color, then press Enter to feed.');
  if (contentMode === 'image' && images.length) ui.imageLayer.focus?.(); else ui.editor.focus();
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
ui.font.addEventListener('change', preview);
ui.size.addEventListener('input', preview);
ui.editSize.addEventListener('input', () => { ui.size.value = ui.editSize.value; preview(); });
ui.autofit.addEventListener('change', preview);
ui.color.addEventListener('input', preview);
document.querySelector('.stage-wrap').addEventListener('dblclick', () => { if (!editMode) setEditing(); });

ui.cancelAdd.addEventListener('click', () => {
  for (let index = images.length - 1; index >= 0; index--) {
    const item = images[index];
    if (!item.pending) continue;
    URL.revokeObjectURL(item.url);
    images.splice(index, 1);
  }
  selectedImageId = null;
  contentMode = 'image';
  preview();
  status('Addition cancelled. The running scene continues.');
});

ui.confirmAdd.addEventListener('click', () => {
  if (images.some(item => item.pending)) commitPendingImages();
});

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

 $('tweak-open').addEventListener('click', () => { if (!ui.dialog.open) ui.dialog.showModal(); });
$('tweak-close').addEventListener('click', () => ui.dialog.close());
ui.dialog.addEventListener('click', event => { if (event.target === ui.dialog) ui.dialog.close(); });
const aboutDialog = $('about');
$('info-open').addEventListener('click', () => { if (!aboutDialog.open) aboutDialog.showModal(); });
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
  $('ant-speed-value').textContent = `${Number(ui.antSpeed.value).toFixed(1)}×`;
  $('eating-frequency-value').textContent = `${Number(ui.frequency.value).toFixed(1)}×`;
  $('resistance-value').textContent = `${ui.resistance.value}%`;
  $('deform-value').textContent = `${Number(ui.deform.value).toFixed(1)}%`;
}
for (const input of [ui.antSpeed, ui.antChaos, ui.frequency, ui.resistance, ui.deform]) {
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
    wrapper.className = `image-item${item.id === selectedImageId ? ' selected' : ''}`;
    wrapper.dataset.imageId = item.id;
    wrapper.style.left = `${item.x * 100}%`; wrapper.style.top = `${item.y * 100}%`;
    wrapper.style.width = `${item.w * 100}%`; wrapper.style.height = `${item.h * 100}%`;
    wrapper.setAttribute('role','group'); wrapper.setAttribute('aria-label',`${item.name}; drag to move, use corner handles to resize`);
    const image = document.createElement('img'); image.src = item.url; image.alt = item.name; image.draggable = false;
    wrapper.append(image);
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
  if (!editMode && state) ui.state.textContent = state === 'feeding' ? 'ANTS ARE FEEDING' : state.toUpperCase();
});
new ResizeObserver(() => { sim.resize(); preview(); }).observe(ui.canvas.parentElement);
document.addEventListener('visibilitychange', () => document.hidden ? sim.pauseForHidden() : sim.resumeFromHidden());
updateLabels(); preview(); updatePlayButton();
