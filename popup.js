/**
 * FFmpeg Studio — popup.js
 * Full processing pipeline with FFmpeg.wasm (v0.12.x)
 * ─────────────────────────────────────────────────────
 * Uses @ffmpeg/ffmpeg ESM via jsDelivr CDN.
 * All processing is 100% local (no file is uploaded anywhere).
 */

import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
import { fetchFile, toBlobURL } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js';

// ══════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════
let ffmpeg = null;
let sourceFile = null;
let outputURL = null;
let processingCancelled = false;
let originalWidth = null;
let originalHeight = null;

// ══════════════════════════════════════════════
//  DOM REFS
// ══════════════════════════════════════════════
const $ = id => document.getElementById(id);

const dom = {
  engineStatus:   $('engineStatus'),
  engineLabel:    $('engineLabel'),
  dropZone:       $('dropZone'),
  fileInput:      $('fileInput'),
  fileMeta:       $('fileMeta'),
  metaName:       $('metaName'),
  metaSize:       $('metaSize'),
  metaType:       $('metaType'),
  scaleFactor:    $('scaleFactor'),
  scaleDisplay:   $('scaleDisplay'),
  resolutionHint: $('resolutionHint'),
  codecSelect:    $('codecSelect'),
  bitrateInput:   $('bitrateInput'),
  formatSelect:   $('formatSelect'),
  crfSlider:      $('crfSlider'),
  crfDisplay:     $('crfDisplay'),
  crfQuality:     $('crfQuality'),
  interpToggle:   $('interpToggle'),
  interpState:    $('interpState'),
  interpOptions:  $('interpOptions'),
  interpAlgo:     $('interpAlgo'),
  targetFps:      $('targetFps'),
  terminalBody:   $('terminalBody'),
  termIdle:       $('termIdle'),
  progressSection:$('progressSection'),
  progressLabel:  $('progressLabel'),
  progressPct:    $('progressPct'),
  progressFill:   $('progressFill'),
  progressGlow:   $('progressGlow'),
  progressDetail: $('progressDetail'),
  processBtn:     $('processBtn'),
  cancelBtn:      $('cancelBtn'),
  downloadArea:   $('downloadArea'),
  downloadBtn:    $('downloadBtn'),
  dlDetail:       $('dlDetail'),
};

// ══════════════════════════════════════════════
//  TERMINAL LOG
// ══════════════════════════════════════════════
function termLog(msg, type = '') {
  if (dom.termIdle) dom.termIdle.remove();
  dom.termIdle = null;
  const line = document.createElement('span');
  line.className = `term-line ${type}`;
  line.textContent = `> ${msg}`;
  dom.terminalBody.appendChild(line);
  dom.terminalBody.scrollTop = dom.terminalBody.scrollHeight;
}

function termClear() {
  dom.terminalBody.innerHTML = '';
  const idle = document.createElement('span');
  idle.id = 'termIdle'; idle.className = 'term-idle';
  idle.textContent = 'Waiting for input...';
  const prompt = document.createElement('span');
  prompt.className = 'term-prompt'; prompt.textContent = '$';
  dom.terminalBody.appendChild(prompt);
  dom.terminalBody.appendChild(idle);
  dom.termIdle = idle;
}

// ══════════════════════════════════════════════
//  PROGRESS
// ══════════════════════════════════════════════
function setProgress(pct, detail = '') {
  const p = Math.min(100, Math.max(0, pct));
  dom.progressFill.style.width = `${p}%`;
  dom.progressGlow.style.left  = `${p}%`;
  dom.progressPct.textContent  = `${Math.round(p)}%`;
  if (detail) dom.progressDetail.textContent = detail;
}

// ══════════════════════════════════════════════
//  ENGINE STATUS
// ══════════════════════════════════════════════
function setEngineStatus(state, label) {
  dom.engineStatus.className = `status-pill ${state}`;
  dom.engineLabel.textContent = label;
}

// ══════════════════════════════════════════════
//  FFMPEG INIT
// ══════════════════════════════════════════════
async function initFFmpeg() {
  setEngineStatus('', 'LOADING ENGINE');
  termLog('Initialising FFmpeg.wasm engine...');

  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    // Parse progress from FFmpeg stderr
    const timeMatch = message.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/);
    if (timeMatch) {
      termLog(message.trim(), 'warn');
    }
  });

  ffmpeg.on('progress', ({ progress, time }) => {
    const pct = Math.round(progress * 100);
    const secs = (time / 1_000_000).toFixed(1);
    setProgress(pct, `Encoding... ${pct}% — ${secs}s processed`);
  });

  try {
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL:   await toBlobURL(`${baseURL}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL:   await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    setEngineStatus('ready', 'ENGINE READY');
    termLog('FFmpeg engine loaded — ready to process.', 'ok');
  } catch (err) {
    setEngineStatus('error', 'ENGINE ERROR');
    termLog(`Engine load failed: ${err.message}`, 'err');
    console.error(err);
  }
}

// ══════════════════════════════════════════════
//  FILE SELECT
// ══════════════════════════════════════════════
function handleFileSelect(file) {
  if (!file) return;
  sourceFile = file;

  // Reset output
  if (dom.downloadArea) dom.downloadArea.style.display = 'none';
  if (outputURL) { URL.revokeObjectURL(outputURL); outputURL = null; }

  // Show meta
  if (dom.fileMeta) dom.fileMeta.style.display = 'block';
  if (dom.metaName) dom.metaName.textContent = file.name;
  if (dom.metaSize) dom.metaSize.textContent = formatBytes(file.size);
  if (dom.metaType) dom.metaType.textContent = file.type || 'unknown';

  // Drop zone label
  if (dom.dropZone) {
    const main = dom.dropZone.querySelector('.drop-main');
    const sub = dom.dropZone.querySelector('.drop-sub');
    if (main) main.textContent = '✓ FILE LOADED';
    if (sub) sub.textContent = file.name;
    dom.dropZone.style.borderColor = 'var(--amber)';
  }

  // Vista previa de video
  const previewRow = document.getElementById('previewRow');
  const previewVid = document.getElementById('filePreview');
  if (previewRow && previewVid) {
    previewRow.style.display = 'flex';
    previewVid.src = URL.createObjectURL(file);
    previewVid.load();
  }

  // Obtener dimensiones de video
  originalWidth = null; originalHeight = null;
  const url = URL.createObjectURL(file);
  const vid  = document.createElement('video');
  vid.preload = 'metadata';
  vid.onloadedmetadata = () => {
    originalWidth  = vid.videoWidth;
    originalHeight = vid.videoHeight;
    URL.revokeObjectURL(url);
    updateResolutionHint();
  };
  vid.onerror = () => URL.revokeObjectURL(url);
  vid.src = url;

  // Actualizar sliders
  if (dom.scaleFactor && dom.scaleDisplay) {
    dom.scaleDisplay.textContent = `${parseFloat(dom.scaleFactor.value).toFixed(2)}×`;
    updateResolutionHint();
  }
  if (dom.crfSlider && dom.crfDisplay) {
    dom.crfDisplay.textContent = dom.crfSlider.value;
    updateCrfLabel();
  }

  if (dom.processBtn) dom.processBtn.disabled = false;
  termLog(`File loaded: ${file.name} (${formatBytes(file.size)})`, 'ok');
}

// ══════════════════════════════════════════════
//  RESOLUTION HINT
// ══════════════════════════════════════════════
function updateResolutionHint() {
  const scale = parseFloat(dom.scaleFactor.value);
  dom.scaleDisplay.textContent = `${scale.toFixed(2)}×`;
  if (originalWidth && originalHeight) {
    const w = Math.round(originalWidth  * scale / 2) * 2; // must be even
    const h = Math.round(originalHeight * scale / 2) * 2;
    dom.resolutionHint.textContent = `→ ${w}×${h}`;
  } else {
    dom.resolutionHint.textContent = `→ auto`;
  }
}

// ══════════════════════════════════════════════
//  CRF QUALITY LABEL
// ══════════════════════════════════════════════
function updateCrfLabel() {
  const v = parseInt(dom.crfSlider.value);
  dom.crfDisplay.textContent = v;
  if      (v <= 10) dom.crfQuality.textContent = 'VISUALLY LOSSLESS';
  else if (v <= 18) dom.crfQuality.textContent = 'HIGH QUALITY';
  else if (v <= 28) dom.crfQuality.textContent = 'BALANCED';
  else if (v <= 38) dom.crfQuality.textContent = 'COMPRESSED';
  else              dom.crfQuality.textContent = 'LOW QUALITY';
}

// ══════════════════════════════════════════════
//  BUILD FFMPEG ARGS
// ══════════════════════════════════════════════
function buildArgs(inputName, outputName) {
  const args = ['-i', inputName];

  const codec      = dom.codecSelect.value;
  const bitrate    = dom.bitrateInput.value.trim();
  const scale      = parseFloat(dom.scaleFactor.value);
  const crf        = dom.crfSlider.value;
  const useInterp  = dom.interpToggle.checked;
  const interpAlgo = dom.interpAlgo.value;
  const targetFps  = dom.targetFps.value;

  // ── Video filters chain ──────────────────
  const vf = [];

  // Scale (only if not 1.0)
  if (Math.abs(scale - 1.0) > 0.01) {
    // Use -2 to keep aspect ratio with even dimensions
    if (originalWidth && originalHeight) {
      const w = Math.round(originalWidth  * scale / 2) * 2;
      const h = Math.round(originalHeight * scale / 2) * 2;
      vf.push(`scale=${w}:${h}`);
    } else {
      vf.push(`scale=iw*${scale}:ih*${scale}`);
    }
  }

  // Frame interpolation
  if (useInterp) {
    if (interpAlgo === 'mci') {
      vf.push(`minterpolate='mi_mode=mci:mc_mode=aobmc:me_mode=bidir:fps=${targetFps}'`);
    } else if (interpAlgo === 'blend') {
      vf.push(`minterpolate='mi_mode=blend:fps=${targetFps}'`);
    } else {
      // duplicate — simple fps filter
      vf.push(`fps=${targetFps}`);
    }
  }

  if (vf.length > 0) {
    args.push('-vf', vf.join(','));
  }

  // ── Codec ────────────────────────────────
  if (codec === 'copy') {
    args.push('-c', 'copy');
  } else {
    args.push('-c:v', codec);

    // Rate control
    if (bitrate) {
      args.push('-b:v', `${bitrate}k`);
    } else {
      // CRF mode
      if (codec === 'libx264' || codec === 'libx265') {
        args.push('-crf', crf);
      } else if (codec === 'libvpx-vp9') {
        args.push('-crf', crf, '-b:v', '0');
      }
    }

    // Preset for speed/compression tradeoff
    if (codec === 'libx264') args.push('-preset', 'fast');
    if (codec === 'libx265') args.push('-preset', 'fast');

    // Audio passthrough
    args.push('-c:a', 'copy');
  }

  args.push('-y', outputName); // -y = overwrite
  return args;
}

// ══════════════════════════════════════════════
//  PROCESS VIDEO
// ══════════════════════════════════════════════
async function processVideo() {
  if (!sourceFile) {
    termLog('No se ha seleccionado ningún archivo.', 'err');
    return;
  }
  if (!ffmpeg) {
    termLog('El motor FFmpeg no está listo. Espera a que el estado sea "ENGINE READY".', 'err');
    if (dom.processBtn) dom.processBtn.disabled = true;
    return;
  }
  if (dom.engineLabel && dom.engineLabel.textContent !== 'ENGINE READY') {
    termLog('El motor FFmpeg aún no está listo. Espera a que el estado sea "ENGINE READY".', 'err');
    if (dom.processBtn) dom.processBtn.disabled = true;
    return;
  }
  processingCancelled = false;

  // UI: processing state
  dom.processBtn.style.display  = 'none';
  dom.cancelBtn.style.display   = 'block';
  dom.downloadArea.style.display = 'none';
  dom.progressSection.style.display = 'block';
  setProgress(0, 'Reading source file...');

  const fmt        = dom.formatSelect.value;
  const inputName  = 'input_' + Date.now() + '.' + getExtension(sourceFile.name);
  const outputName = 'output_' + Date.now() + '.' + fmt;

  try {
    // ── Write input to MEMFS ──────────────
    termLog(`Writing ${inputName} to virtual FS...`);
    setProgress(5, 'Loading file into memory...');
    const fileData = await fetchFile(sourceFile);
    await ffmpeg.writeFile(inputName, fileData);

    termLog('Building filter graph...', 'warn');
    setProgress(10, 'Building filter graph...');

    const args = buildArgs(inputName, outputName);
    termLog(`FFmpeg args: ${args.join(' ')}`, 'warn');

    if (processingCancelled) throw new Error('CANCELLED');

    // ── Execute ───────────────────────────
    termLog('Starting encode...', 'warn');
    setProgress(12, 'Encoding — this may take a while...');
    await ffmpeg.exec(args);

    if (processingCancelled) throw new Error('CANCELLED');

    // ── Read output ───────────────────────
    termLog('Reading output from virtual FS...', 'ok');
    setProgress(98, 'Reading output file...');
    const data = await ffmpeg.readFile(outputName);

    // ── Cleanup MEMFS ─────────────────────
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    // ── Create blob URL ───────────────────
    const mimeMap = { mp4:'video/mp4', webm:'video/webm', mkv:'video/x-matroska', mov:'video/quicktime' };
    const blob    = new Blob([data.buffer], { type: mimeMap[fmt] || 'video/mp4' });
    outputURL     = URL.createObjectURL(blob);

    const sizeFmt = formatBytes(blob.size);
    dom.dlDetail.textContent      = `${outputName} — ${sizeFmt}`;
    dom.downloadBtn.href          = outputURL;
    dom.downloadBtn.download      = outputName;
    dom.downloadArea.style.display = 'flex';

    setProgress(100, `Done! Output: ${sizeFmt}`);
    termLog(`Encoding complete — ${sizeFmt}`, 'ok');

  } catch (err) {
    if (err.message === 'CANCELLED') {
      termLog('Processing cancelled by user.', 'warn');
      setProgress(0, 'Cancelled.');
    } else {
      termLog(`Error: ${err.message}`, 'err');
      setProgress(0, `Error: ${err.message}`);
      console.error(err);
    }
  } finally {
    dom.processBtn.style.display = 'block';
    dom.cancelBtn.style.display  = 'none';
    dom.processBtn.disabled      = !sourceFile;
  }
}

// ══════════════════════════════════════════════
//  CANCEL
// ══════════════════════════════════════════════
async function cancelProcessing() {
  processingCancelled = true;
  try {
    await ffmpeg.terminate();
    ffmpeg = null;
    termLog('FFmpeg terminated. Re-initialising...', 'warn');
    await initFFmpeg(); // restart engine
  } catch (e) {
    console.warn('Cancel error:', e);
  }
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
function formatBytes(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 ** 2)   return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3)   return (bytes / 1024 ** 2).toFixed(2) + ' MB';
  return (bytes / 1024 ** 3).toFixed(2) + ' GB';
}

function getExtension(filename) {
  return filename.split('.').pop() || 'mp4';
}


// ══════════════════════════════════════════════
//  EVENT WIRING (dentro de DOMContentLoaded)
// ══════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
  // Listeners solo si los elementos existen
  if (dom.fileInput) {
    dom.fileInput.addEventListener('change', e => {
      if (e.target.files[0]) handleFileSelect(e.target.files[0]);
    });
  }
  if (dom.dropZone) {
    dom.dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dom.dropZone.classList.add('drag-over');
    });
    dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('drag-over'));
    dom.dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dom.dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
    });
  }
  if (dom.scaleFactor && dom.scaleDisplay) {
    dom.scaleFactor.addEventListener('input', (e) => {
      dom.scaleDisplay.textContent = `${parseFloat(e.target.value).toFixed(2)}×`;
      updateResolutionHint();
      dom.scaleDisplay.style.background = '#222';
      setTimeout(() => { dom.scaleDisplay.style.background = 'var(--bg-panel)'; }, 200);
    });
  }
  if (dom.crfSlider && dom.crfDisplay) {
    dom.crfSlider.addEventListener('input', (e) => {
      dom.crfDisplay.textContent = e.target.value;
      updateCrfLabel();
      dom.crfDisplay.style.background = '#222';
      setTimeout(() => { dom.crfDisplay.style.background = 'var(--bg-panel)'; }, 200);
    });
  }
  if (dom.interpToggle) {
    dom.interpToggle.addEventListener('change', () => {
      const on = dom.interpToggle.checked;
      dom.interpState.textContent      = on ? 'ON' : 'OFF';
      dom.interpOptions.style.display  = on ? 'grid' : 'none';
    });
  }
  if (dom.processBtn) {
    dom.processBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (dom.processBtn.disabled) {
        alert('Debes seleccionar un archivo primero.');
        return;
      }
      processVideo();
    });
  }
  if (dom.cancelBtn) {
    dom.cancelBtn.addEventListener('click', cancelProcessing);
  }

  // Forzar actualización de sliders y botón
  if (dom.scaleFactor) {
    dom.scaleDisplay.textContent = `${parseFloat(dom.scaleFactor.value).toFixed(2)}×`;
    updateResolutionHint();
  }
  if (dom.crfSlider) {
    dom.crfDisplay.textContent = dom.crfSlider.value;
    updateCrfLabel();
  }
  if (dom.processBtn) dom.processBtn.disabled = !sourceFile;
  initFFmpeg();
});


