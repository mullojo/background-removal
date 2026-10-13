import { createApp, computed, onMounted, onUnmounted, ref } from 'https://unpkg.com/vue@3.5.43/dist/vue.esm-browser.prod.js'

createApp({
  template: '#app-template',
  setup() {

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
        backend.value = ''
        if (data.backend.startsWith('WebGPU')) {
          phase.value = 'loading'
          statusDetail.value = 'WebGPU could not run this model; switching to WASM…'
        } else {
          statusDetail.value = 'WASM could not load this model.'
        }
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
      statusDetail.value = `Background removed on ${backend.value}. Choose a backdrop and download your image.`
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
    return { CACHE_KEY, choices, fileInput, fileName, dimensions, originalUrl, resultUrl, exportUrl,
  selected, phase, backend, downloadFile, downloadProgress, statusDetail, error,
  dragOver, showOriginal, cacheFiles, cacheBytes, cacheAvailable, origin,
  busy, currentChoice, stageText, cacheSize, previewStyle,
  refreshCache, clearCache, loadModel, acceptFile, onFileChange, onDrop,
  selectBackground }
  },
}).mount('#app')
