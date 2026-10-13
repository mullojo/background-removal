<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const CACHE_KEY = 'transformers-cache'
const choices = [
  { id: 'transparent', name: 'Transparent', kind: 'transparent' },
  { id: 'white', name: 'White', kind: 'solid', color: '#ffffff' },
  { id: 'cream', name: 'Cream', kind: 'solid', color: '#f2eadc' },
  { id: 'sage', name: 'Sage', kind: 'solid', color: '#b7c8b1' },
  { id: 'ink', name: 'Ink', kind: 'solid', color: '#192b34' },
  { id: 'dawn', name: 'Dawn', kind: 'gradient', colors: ['#f8d2c4', '#d9cbea'] },
  { id: 'sky', name: 'Sky', kind: 'gradient', colors: ['#d8f1f0', '#b9cef3'] },
  { id: 'sunset', name: 'Sunset', kind: 'gradient', colors: ['#ffd7ad', '#e9adc3'] },
]

const fileInput = ref(null)
const fileName = ref('')
const dimensions = ref('')
const originalUrl = ref('')
const resultUrl = ref('')
const exportUrl = ref('')
const selected = ref('transparent')
const phase = ref('idle')
const backend = ref('')
const downloadFile = ref('')
const downloadProgress = ref(null)
const statusDetail = ref('Upload a photo to begin.')
const error = ref('')
const dragOver = ref(false)
const showOriginal = ref(false)
const cacheFiles = ref(0)
const cacheBytes = ref(0)
const cacheAvailable = ref(true)
const origin = window.location.origin

let worker
let imageBitmap = null
let cutoutCanvas = null
let requestId = 0
let queuedFile = null

const busy = computed(() => ['loading', 'processing', 'compositing'].includes(phase.value))
const currentChoice = computed(() => choices.find(choice => choice.id === selected.value) || choices[0])
const stageText = computed(() => ({ idle: 'Model not loaded', loading: 'Loading model', ready: 'Model ready', processing: 'Removing background', compositing: 'Finishing image', complete: 'Image ready', error: 'Needs attention' })[phase.value])
const cacheSize = computed(() => cacheBytes.value ? `${(cacheBytes.value / 1048576).toFixed(1)} MB` : 'Size unavailable')
const previewStyle = computed(() => {
  const choice = currentChoice.value
  if (choice.kind === 'solid') return { background: choice.color }
  if (choice.kind === 'gradient') return { background: `linear-gradient(135deg, ${choice.colors.join(', ')})` }
  return {}
})

function makeWorker() {
  worker = new Worker(new URL('./model.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = onWorkerMessage
  worker.onerror = event => {
    phase.value = 'error'
    error.value = event.message || 'The model worker stopped unexpectedly.'
  }
}

function revoke(url) { if (url) URL.revokeObjectURL(url) }

async function refreshCache() {
  try {
    if (!('caches' in window)) { cacheAvailable.value = false; return }
    const names = await caches.keys()
    if (!names.includes(CACHE_KEY)) { cacheFiles.value = 0; cacheBytes.value = 0; return }
    const cache = await caches.open(CACHE_KEY)
    const requests = await cache.keys()
    cacheFiles.value = requests.length
    let total = 0
    for (const request of requests) {
      const response = await cache.match(request)
      const length = Number(response?.headers.get('content-length'))
      if (Number.isFinite(length) && length > 0) total += length
      else if (response) total += (await response.blob()).size
    }
    cacheBytes.value = total
  } catch {
    cacheAvailable.value = false
  }
}

async function clearCache() {
  if (busy.value) return
  try {
    worker?.terminate()
    await caches.delete(CACHE_KEY)
    makeWorker()
    backend.value = ''
    phase.value = resultUrl.value ? 'complete' : 'idle'
    statusDetail.value = 'Model cache cleared. The next run will download it again.'
    await refreshCache()
  } catch (cause) {
    error.value = `Could not clear the model cache: ${cause.message || cause}`
  }
}

function loadModel() {
  if (busy.value || backend.value) return
  error.value = ''
  phase.value = 'loading'
  statusDetail.value = 'Connecting to Hugging Face for the model files…'
  worker.postMessage({ type: 'load' })
}

function onWorkerMessage({ data }) {
  if (data.type === 'loading') {
    phase.value = 'loading'
    statusDetail.value = `Preparing ${data.backend} engine…`
  } else if (data.type === 'download') {
    downloadFile.value = data.file.split('/').pop() || 'Model file'
    downloadProgress.value = data.status === 'progress' && Number.isFinite(data.progress) ? Math.round(data.progress) : null
    if (data.status === 'done') statusDetail.value = `${downloadFile.value} downloaded. Initializing model…`
    else statusDetail.value = `Downloading ${downloadFile.value}${downloadProgress.value !== null ? ` · ${downloadProgress.value}%` : ''}`
  } else if (data.type === 'backend-failed') {
    statusDetail.value = `${data.backend} unavailable; trying the browser CPU engine…`
  } else if (data.type === 'ready') {
    backend.value = data.backend
    phase.value = 'ready'
    statusDetail.value = `ORMBG loaded on ${backend.value}. Ready to process.`
    downloadProgress.value = null
    refreshCache()
  } else if (data.type === 'processing') {
    if (data.id !== requestId) return
    phase.value = 'processing'
    statusDetail.value = 'Analyzing the subject and building a detailed mask…'
  } else if (data.type === 'result') {
    if (data.id !== requestId) return
    phase.value = 'compositing'
    statusDetail.value = 'Applying the mask to your full-resolution photo…'
    compose(data).catch(cause => fail(cause))
  } else if (data.type === 'error') {
    if (data.id && data.id !== requestId) return
    fail(new Error(data.message))
  }
}

function fail(cause) {
  phase.value = 'error'
  error.value = cause?.message || String(cause)
  statusDetail.value = 'Please try again or choose another image.'
}

async function acceptFile(file) {
  if (!file) return
  if (!file.type.startsWith('image/')) { fail(new Error('Choose a JPG, PNG, WebP, or other browser-supported image.')); return }
  if (busy.value) { queuedFile = file; return }
  error.value = ''
  revoke(originalUrl.value)
  revoke(resultUrl.value)
  revoke(exportUrl.value)
  resultUrl.value = ''
  exportUrl.value = ''
  cutoutCanvas = null
  imageBitmap?.close()
  try {
    imageBitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    originalUrl.value = URL.createObjectURL(file)
    fileName.value = file.name
    dimensions.value = `${imageBitmap.width.toLocaleString()} × ${imageBitmap.height.toLocaleString()} px`
    showOriginal.value = false
    requestId += 1
    phase.value = backend.value ? 'processing' : 'loading'
    statusDetail.value = backend.value ? 'Sending photo to the model…' : 'Loading model before processing…'
    worker.postMessage({ type: 'process', id: requestId, url: originalUrl.value })
  } catch (cause) {
    fail(new Error(`This image could not be opened: ${cause.message || cause}`))
  }
}

function onFileChange(event) {
  acceptFile(event.target.files?.[0])
  event.target.value = ''
}
function onDrop(event) {
  dragOver.value = false
  acceptFile(event.dataTransfer?.files?.[0])
}

async function compose(mask) {
  const { width, height } = imageBitmap
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = mask.width
  maskCanvas.height = mask.height
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
  const maskImage = maskContext.createImageData(mask.width, mask.height)
  const channels = mask.channels
  for (let i = 0; i < mask.width * mask.height; i++) {
    const value = mask.pixels[i * channels]
    const offset = i * 4
    maskImage.data[offset] = value
    maskImage.data[offset + 1] = value
    maskImage.data[offset + 2] = value
    maskImage.data[offset + 3] = 255
  }
  maskContext.putImageData(maskImage, 0, 0)

  const scaled = document.createElement('canvas')
  scaled.width = width
  scaled.height = height
  const scaledContext = scaled.getContext('2d', { willReadFrequently: true })
  scaledContext.imageSmoothingEnabled = true
  scaledContext.imageSmoothingQuality = 'high'
  scaledContext.drawImage(maskCanvas, 0, 0, width, height)
  const alpha = scaledContext.getImageData(0, 0, width, height).data

  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const context = output.getContext('2d', { willReadFrequently: true })
  context.drawImage(imageBitmap, 0, 0)
  const image = context.getImageData(0, 0, width, height)
  for (let i = 0; i < image.data.length; i += 4) image.data[i + 3] = Math.round(image.data[i + 3] * alpha[i] / 255)
  context.putImageData(image, 0, 0)
  cutoutCanvas = output
  const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not create the transparent image.')
  revoke(resultUrl.value)
  resultUrl.value = URL.createObjectURL(blob)
  phase.value = 'complete'
  statusDetail.value = 'Background removed. Choose a backdrop and download your image.'
  await updateExport()
  if (queuedFile) { const next = queuedFile; queuedFile = null; await acceptFile(next) }
}

async function updateExport() {
  if (!cutoutCanvas) return
  const currentResult = resultUrl.value
  const choice = currentChoice.value
  let canvas = cutoutCanvas
  if (choice.kind !== 'transparent') {
    canvas = document.createElement('canvas')
    canvas.width = cutoutCanvas.width
    canvas.height = cutoutCanvas.height
    const context = canvas.getContext('2d')
    if (choice.kind === 'solid') context.fillStyle = choice.color
    else {
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, choice.colors[0])
      gradient.addColorStop(1, choice.colors[1])
      context.fillStyle = gradient
    }
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(cutoutCanvas, 0, 0)
  }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) { fail(new Error('Could not export this image.')); return }
  if (currentResult !== resultUrl.value || choice.id !== selected.value) return
  revoke(exportUrl.value)
  exportUrl.value = URL.createObjectURL(blob)
}

function selectBackground(id) { selected.value = id; updateExport() }

onMounted(() => { makeWorker(); refreshCache() })
onUnmounted(() => { worker?.terminate(); imageBitmap?.close(); revoke(originalUrl.value); revoke(resultUrl.value); revoke(exportUrl.value) })
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark"><span></span></span><span>cutout<span class="brand-dot">.</span></span></div>
      <div class="topbar-right"><span class="privacy-dot"></span> Private, in your browser <span class="topbar-separator"></span> <span class="topbar-version">STUDIO / 01</span></div>
    </header>

    <main class="main-layout">
      <section class="intro">
        <div class="eyebrow"><span class="eyebrow-line"></span> THE SIMPLE PHOTO STUDIO</div>
        <h1>Every image deserves<br><em>a fresh backdrop.</em></h1>
        <p>Remove the background from a photo, find the right finish, and take it with you. All right here in your browser.</p>
      </section>

      <div class="workspace">
        <section class="editor-panel" aria-label="Image editor">
          <div class="panel-head"><div><span class="section-index">01 / CANVAS</span><h2>Your workspace</h2></div><span class="panel-caption">{{ dimensions || 'READY WHEN YOU ARE' }}</span></div>
          <div class="stage" :class="{ 'stage-drag': dragOver, 'stage-empty': !originalUrl }" :style="resultUrl && !showOriginal ? previewStyle : {}" @dragover.prevent="dragOver = true" @dragleave.prevent="dragOver = false" @drop.prevent="onDrop">
            <div v-if="!originalUrl" class="empty-state">
              <div class="empty-icon"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="6" y="7" width="36" height="34" rx="4" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="18" r="3" stroke="currentColor" stroke-width="1.6"/><path d="m8 34 11-11 7 7 5-5 9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
              <h3>Drop your image here</h3><p>or choose a photo to get started</p>
              <button class="button button-dark" @click="fileInput.click()"><span>Choose a photo</span><span aria-hidden="true">↗</span></button>
              <small>JPG, PNG, WebP · One image at a time</small>
            </div>
            <template v-else>
              <div v-if="resultUrl && !showOriginal && selected === 'transparent'" class="checkerboard"></div>
              <img class="stage-image" :src="resultUrl && !showOriginal ? resultUrl : originalUrl" :alt="resultUrl && !showOriginal ? 'Photo with background removed' : 'Original uploaded photo'" />
              <div v-if="busy" class="processing-shade"><span class="spinner"></span><strong>{{ stageText }}</strong><small>{{ statusDetail }}</small></div>
              <span class="image-badge">{{ resultUrl && !showOriginal ? 'AFTER' : 'BEFORE' }}</span>
            </template>
          </div>
          <div class="canvas-footer"><div class="file-label"><span class="file-icon">▧</span><span class="truncate">{{ fileName || 'No image selected' }}</span></div><div class="canvas-actions"><button v-if="resultUrl" class="text-action" @pointerdown="showOriginal = true" @pointerup="showOriginal = false" @pointerleave="showOriginal = false" @keydown.space.prevent="showOriginal = true" @keyup.space="showOriginal = false">Hold to compare</button><button class="text-action" @click="fileInput.click()">{{ originalUrl ? 'Change image' : 'Upload image' }} <span aria-hidden="true">↗</span></button></div></div>
          <input ref="fileInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" @change="onFileChange" />
        </section>

        <aside class="controls-panel">
          <div class="control-section model-section"><div class="section-top"><span class="section-index">02 / PROCESS</span><span class="status-pill" :class="{ active: backend, danger: phase === 'error' }"><span></span>{{ backend ? 'MODEL LOADED' : phase === 'error' ? 'ERROR' : busy ? 'LOADING' : 'NOT LOADED' }}</span></div><h2>Remove the background</h2><p class="section-description">Powered by ORMBG. Your photo stays on your device.</p>
            <div class="status-card" role="status" aria-live="polite"><div class="status-icon" :class="{ spinning: busy }">✳</div><div class="status-copy"><strong>{{ stageText }}</strong><span>{{ statusDetail }}</span></div></div>
            <div v-if="phase === 'loading' && downloadProgress !== null" class="progress-wrap"><div class="progress-track"><span :style="{ width: `${downloadProgress}%` }"></span></div><small>{{ downloadFile }} · {{ downloadProgress }}%</small></div>
            <p v-if="error" class="error-text">{{ error }}</p>
            <button v-if="!backend && !busy" class="button button-outline full" @click="loadModel">Load model ahead of time <span aria-hidden="true">↗</span></button>
          </div>

          <div class="control-section backdrop-section"><span class="section-index">03 / FINISH</span><div class="section-title-row"><div><h2>Choose a backdrop</h2><p class="section-description">Preview a look, then export it as a PNG.</p></div></div>
            <div class="swatch-grid" role="group" aria-label="Background choices"><button v-for="choice in choices" :key="choice.id" class="swatch" :class="{ selected: selected === choice.id }" :aria-pressed="selected === choice.id" @click="selectBackground(choice.id)"><span class="swatch-color" :class="{ checkered: choice.kind === 'transparent' }" :style="choice.kind === 'solid' ? { background: choice.color } : choice.kind === 'gradient' ? { background: `linear-gradient(135deg, ${choice.colors.join(', ')})` } : {}"><span v-if="selected === choice.id" class="swatch-check">✓</span></span><span>{{ choice.name }}</span></button></div>
            <div class="export-box"><div><strong>Ready for the final touch?</strong><span>Full resolution · PNG</span></div><a v-if="exportUrl && !busy" class="button button-accent" :href="exportUrl" :download="`${fileName.replace(/\.[^.]+$/, '') || 'image'}-${selected}.png`"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12v2h10v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg> Download image</a><button v-else class="button button-accent" disabled>Download image</button></div>
          </div>

          <div class="cache-section"><div class="cache-top"><span class="section-index">MODEL STORAGE</span><span class="cache-indicator"></span></div><p>Saved in this browser’s <strong>Cache Storage</strong> for <code>{{ origin }}</code>. Find it in Developer Tools → Application → Cache Storage → <code>{{ CACHE_KEY }}</code>.</p><div class="cache-footer"><span>{{ cacheAvailable ? `${cacheFiles} cached files · ${cacheFiles ? cacheSize : 'No model saved yet'}` : 'Cache Storage unavailable' }}</span><button :disabled="!cacheFiles || busy" @click="clearCache">Clear model cache ↗</button></div></div>
        </aside>
      </div>
      <footer class="page-footer"><span>Made for simple, private image making.</span><span>POWERED BY TRANSFORMERS.JS + ORMBG</span></footer>
    </main>
  </div>
</template>
