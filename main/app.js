import { createApp, computed, nextTick, onMounted, onUnmounted, ref } from './vendor/vue-3.5.43.esm-browser.prod.js'
import { APP_VERSION, createDiagnostics } from './diagnostics.js'
import { createPwa } from './pwa.js'

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
    const cacheSizeKnown = ref(true)
    const exportBusy = ref(false)
    const shareBusy = ref(false)
    const canShareFile = ref(false)
    const exportMessage = ref('')
    const diagnosticText = ref('')
    const diagnosticMessage = ref('')
    const preferWasm = ref(false)
    const canRetry = ref(false)
    const pwaState = ref({ installed: false, installable: false, offline: false, updateAvailable: false, message: '' })
    const diagnostics = createDiagnostics()
    const interruptedNotice = diagnostics.previous ? `An earlier session ended during “${diagnostics.previous.stage}”. Its last steps are included in Copy diagnostics.` : ''
    const origin = window.location.origin

    let worker
    let imageBitmap = null
    let cutoutCanvas = null
    let requestId = 0
    let activeRequest = null
    let queuedFile = null
    let sourceFile = null
    let cutoutBlob = null
    let exportFile = null
    let exportTask = null
    let exportPending = false
    let slowTimer
    let pwa

    const busy = computed(() => exportBusy.value || ['preparing', 'loading', 'processing', 'compositing'].includes(phase.value))
    const currentChoice = computed(() => choices.find(choice => choice.id === selected.value) || choices[0])
    const stageText = computed(() => exportBusy.value ? 'Preparing download' : ({ idle: 'Model not loaded', offline: 'Connection needed', preparing: 'Preparing photo', loading: 'Loading model', ready: 'Model ready', processing: 'Removing background', compositing: 'Finishing image', complete: 'Image ready', error: 'Needs attention' })[phase.value])
    const cacheSize = computed(() => !cacheSizeKnown.value ? 'Size unavailable' : `${(cacheBytes.value / 1048576).toFixed(1)} MB`)
    const previewStyle = computed(() => {
      const choice = currentChoice.value
      if (choice.kind === 'solid') return { background: choice.color }
      if (choice.kind === 'gradient') return { background: `linear-gradient(135deg, ${choice.colors.join(', ')})` }
      return {}
    })

    function makeWorker() {
      worker = new Worker(new URL('./model.worker.js', import.meta.url), { type: 'module' })
      const currentWorker = worker
      worker.onmessage = event => { if (worker === currentWorker) onWorkerMessage(event) }
      worker.onerror = event => {
        if (worker !== currentWorker) return
        fail(new Error(event.message || 'The model worker stopped unexpectedly.'))
        worker.terminate()
        worker = null
        backend.value = ''
      }
      worker.onmessageerror = () => {
        if (worker !== currentWorker) return
        fail(new Error('The model worker returned an unreadable message.'))
        worker.terminate()
        worker = null
        backend.value = ''
      }
    }

    function revoke(url) { if (url) nextTick(() => URL.revokeObjectURL(url)) }
    function releaseCanvas(canvas) { if (canvas) { canvas.width = 0; canvas.height = 0 } }
    function context2d(canvas, options) {
      const context = canvas.getContext('2d', options)
      if (!context) throw new Error('The browser could not allocate image memory. Try a smaller photo.')
      return context
    }
    async function createPreview(image) {
      const scale = Math.min(1, 1280 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      try {
        const context = context2d(canvas)
        context.imageSmoothingQuality = 'high'
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        if (!blob) throw new Error('Could not create the image preview. Try a smaller photo.')
        return { blob, width: canvas.width, height: canvas.height }
      } finally { releaseCanvas(canvas) }
    }
    function mark(stage, details = {}, active = true) {
      diagnostics.record(stage, details, { stage, active })
    }
    function errorDetails(cause) {
      const names = [exportFile?.name, sourceFile?.name, fileName.value].filter(Boolean)
      const redact = value => names.reduce((text, name) => text.split(name).join('[selected image]'), String(value))
      return { name: cause?.name || 'Error', message: redact(cause?.message || cause).slice(0, 1000), stack: redact(cause?.stack || '').slice(0, 2500) }
    }
    function globalError(event) { diagnostics.record('page-error', errorDetails(event.error || event.message)) }
    function rejectedPromise(event) { diagnostics.record('unhandled-rejection', errorDetails(event.reason)) }
    function pageHidden() { diagnostics.record('visibility', { state: document.visibilityState }) }
    function pageLeaving() { diagnostics.record('pagehide') }

    async function copyDiagnostics() {
      const text = diagnostics.report({ phase: phase.value, backend: backend.value, requestedBackend: preferWasm.value ? 'wasm' : 'auto', error: error.value ? errorDetails(error.value).message : '', backdrop: selected.value, pwa: pwaState.value })
      try {
        await navigator.clipboard.writeText(text)
        diagnosticText.value = ''
        diagnosticMessage.value = 'Diagnostics copied. Paste them into our chat.'
      } catch {
        diagnosticText.value = text
        diagnosticMessage.value = 'Select and copy the report below.'
      }
    }

    function previewError() {
      diagnostics.record('preview-load-error', { showingResult: Boolean(resultUrl.value && !showOriginal.value) })
      error.value = 'The image preview could not be displayed. Copy diagnostics, then try the image again.'
    }

    async function refreshCache() {
      try {
        if (!('caches' in window)) { cacheAvailable.value = false; return }
        const names = await caches.keys()
        if (!names.includes(CACHE_KEY)) { cacheFiles.value = 0; cacheBytes.value = 0; return }
        const cache = await caches.open(CACHE_KEY)
        const requests = await cache.keys()
        cacheFiles.value = requests.length
        let total = 0
        let known = true
        for (const request of requests) {
          const response = await cache.match(request)
          const length = Number(response?.headers.get('content-length'))
          if (Number.isFinite(length) && length > 0) total += length
          else known = false
        }
        cacheBytes.value = total
        cacheSizeKnown.value = known
      } catch (cause) {
        cacheAvailable.value = false
        diagnostics.record('cache-read-error', errorDetails(cause))
      }
    }

    async function clearCache() {
      if (busy.value) return
      try {
        worker?.terminate()
        worker = null
        await caches.delete(CACHE_KEY)
        backend.value = ''
        phase.value = resultUrl.value ? 'complete' : 'idle'
        statusDetail.value = 'Model cache cleared. The next run will download it again.'
        mark('cache-cleared', {}, false)
        await refreshCache()
      } catch (cause) {
        error.value = `Could not clear the model cache: ${cause.message || cause}`
      }
    }

    function loadModel(forceWasm = preferWasm.value) {
      if (busy.value || (backend.value && (!forceWasm || backend.value === 'WASM · Q8'))) return
      if (navigator.onLine === false) {
        phase.value = 'offline'
        statusDetail.value = 'Connect to the internet to load the model. Your photo will wait on this device.'
        return
      }
      if (!worker) makeWorker()
      error.value = ''
      phase.value = 'loading'
      statusDetail.value = 'Connecting to Hugging Face for the model files…'
      mark('model-load-requested', { forceWasm })
      worker.postMessage({ type: 'load', forceWasm })
    }

    function runQueuedFile() {
      if (!queuedFile || busy.value) return
      const next = queuedFile
      queuedFile = null
      acceptFile(next.file, next.forceWasm)
    }

    function onWorkerMessage({ data }) {
      if (data.id !== undefined && data.id !== requestId) return
      if (data.type === 'diagnostic') { diagnostics.record(`worker:${data.stage}`, data.details || {}); return }
      if (data.type === 'loading') {
        phase.value = 'loading'
        statusDetail.value = `Preparing ${data.backend} engine…`
        mark('model-loading', { backend: data.backend })
      } else if (data.type === 'download') {
        downloadFile.value = data.file.split('/').pop() || 'Model file'
        downloadProgress.value = data.status === 'progress' && Number.isFinite(data.progress) ? Math.round(data.progress) : null
        if (data.status === 'done') statusDetail.value = `${downloadFile.value} downloaded. Initializing model…`
        else statusDetail.value = `Downloading ${downloadFile.value}${downloadProgress.value !== null ? ` · ${downloadProgress.value}%` : ''}`
      } else if (data.type === 'backend-failed') {
        clearTimeout(slowTimer)
        diagnostics.record('backend-failed', { backend: data.backend, message: String(data.message).slice(0, 1000) })
        backend.value = ''
        if (data.backend.startsWith('WebGPU')) {
          phase.value = 'loading'
          statusDetail.value = 'WebGPU could not run this model; switching to WASM…'
        } else {
          statusDetail.value = 'WASM could not load this model.'
        }
      } else if (data.type === 'ready') {
        backend.value = data.backend
        phase.value = activeRequest === requestId ? 'processing' : 'ready'
        statusDetail.value = `ORMBG loaded on ${backend.value}. Ready to process.`
        downloadProgress.value = null
        mark('model-ready', { backend: data.backend }, activeRequest === requestId)
        refreshCache()
        runQueuedFile()
      } else if (data.type === 'processing') {
        if (data.id !== requestId) return
        phase.value = 'processing'
        statusDetail.value = 'Analyzing the subject and building a detailed mask…'
        mark('inference', { backend: backend.value })
        clearTimeout(slowTimer)
        slowTimer = setTimeout(() => {
          diagnostics.record('inference-still-running', { seconds: 45 })
          statusDetail.value = 'Still processing. You can stop this run and copy diagnostics if it seems stuck.'
        }, 45000)
      } else if (data.type === 'result') {
        if (data.id !== requestId) return
        phase.value = 'compositing'
        clearTimeout(slowTimer)
        mark('compositing', { maskWidth: data.width, maskHeight: data.height })
        statusDetail.value = 'Applying the mask to your full-resolution photo…'
        compose(data).catch(cause => fail(cause))
      } else if (data.type === 'error') {
        if (data.id && data.id !== requestId) return
        fail(Object.assign(new Error(data.message), { stack: data.stack || data.message }))
      }
    }

    function fail(cause) {
      clearTimeout(slowTimer)
      activeRequest = null
      mark('error', errorDetails(cause), false)
      console.error('[Cutout]', cause)
      imageBitmap?.close()
      imageBitmap = null
      if (!cutoutBlob) { releaseCanvas(cutoutCanvas); cutoutCanvas = null }
      phase.value = 'error'
      error.value = cause?.message || String(cause)
      statusDetail.value = 'Copy diagnostics to report this, or try again with WASM.'
      queuedFile = null
    }

    function cancelRun() {
      requestId += 1
      activeRequest = null
      clearTimeout(slowTimer)
      queuedFile = null
      worker?.terminate()
      worker = null
      backend.value = ''
      imageBitmap?.close()
      imageBitmap = null
      phase.value = 'error'
      error.value = 'Processing stopped.'
      statusDetail.value = 'Try again with WASM or choose a different image.'
      mark('cancelled', {}, false)
    }

    function retryWasm() {
      if (!sourceFile || busy.value) return
      worker?.terminate()
      worker = null
      backend.value = ''
      preferWasm.value = true
      acceptFile(sourceFile, true)
    }

    async function acceptFile(file, forceWasm = preferWasm.value) {
      if (!file) return
      if (!file.type.startsWith('image/')) {
        if (!busy.value) fail(new Error('Choose a JPG, PNG, WebP, or other browser-supported image.'))
        return
      }
      if (busy.value) {
        queuedFile = { file, forceWasm }
        if (activeRequest === null && phase.value === 'loading') {
          sourceFile = file
          canRetry.value = true
        }
        diagnostics.record('image-queued', { forceWasm })
        return
      }
      sourceFile = file
      canRetry.value = true
      if (!backend.value || (forceWasm && backend.value !== 'WASM · Q8')) {
        queuedFile = { file, forceWasm }
        diagnostics.record('image-waiting-for-model', { forceWasm })
        loadModel(forceWasm)
        return
      }
      const id = ++requestId
      activeRequest = id
      sourceFile = file
      phase.value = 'preparing'
      statusDetail.value = 'Preparing a smaller model input; your export keeps the original dimensions…'
      error.value = ''
      revoke(originalUrl.value)
      revoke(resultUrl.value)
      revoke(exportUrl.value)
      resultUrl.value = ''
      exportUrl.value = ''
      originalUrl.value = ''
      exportFile = null
      canShareFile.value = false
      exportMessage.value = ''
      releaseCanvas(cutoutCanvas)
      cutoutCanvas = null
      cutoutBlob = null
      imageBitmap?.close()
      imageBitmap = null
      exportPending = false
      try {
        // Let Vue detach the previous previews before decoding the next photo.
        await nextTick()
        if (id !== requestId) return
        mark('previous-image-released')
        mark('image-decoding', { type: file.type, bytes: file.size }, true)
        diagnostics.record('image-metadata', {}, { image: { type: file.type, bytes: file.size } })
        const decoded = await createImageBitmap(file, { imageOrientation: 'from-image' })
        if (id !== requestId) { decoded.close(); return }
        imageBitmap = decoded
        fileName.value = file.name
        dimensions.value = `${imageBitmap.width.toLocaleString()} × ${imageBitmap.height.toLocaleString()} px`
        showOriginal.value = false
        diagnostics.record('image-decoded', { width: decoded.width, height: decoded.height }, { image: { type: file.type, bytes: file.size, width: decoded.width, height: decoded.height } })
        const input = document.createElement('canvas')
        const decodedRGBABytesEstimate = decoded.width * decoded.height * 4
        input.width = 1024
        input.height = 1024
        let pixels
        let preview
        try {
          const context = context2d(input, { willReadFrequently: true })
          context.imageSmoothingQuality = 'high'
          context.drawImage(imageBitmap, 0, 0, input.width, input.height)
          pixels = context.getImageData(0, 0, input.width, input.height).data
          releaseCanvas(input)
          mark('original-preview-encoding')
          preview = await createPreview(decoded)
        } finally {
          releaseCanvas(input)
          decoded.close()
          if (imageBitmap === decoded) imageBitmap = null
        }
        if (id !== requestId) return
        originalUrl.value = URL.createObjectURL(preview.blob)
        mark('original-released-before-inference', {
          decodedRGBABytesEstimate,
          previewWidth: preview.width,
          previewHeight: preview.height,
        })
        mark('model-input-ready', { width: 1024, height: 1024, forceWasm })
        phase.value = backend.value ? 'processing' : 'loading'
        statusDetail.value = backend.value ? 'Sending photo to the model…' : 'Loading model before processing…'
        worker.postMessage({ type: 'process', id, width: 1024, height: 1024, pixels, forceWasm }, [pixels.buffer])
      } catch (cause) {
        if (id === requestId) fail(cause)
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
      const id = requestId
      if (!sourceFile) throw new Error('The original photo is no longer available. Please choose it again.')
      mark('export-image-decoding')
      const bitmap = await createImageBitmap(sourceFile, { imageOrientation: 'from-image' })
      if (id !== requestId) { bitmap.close(); return }
      imageBitmap = bitmap
      const { width, height } = bitmap
      mark('export-image-decoded', { width, height })
      const maskCanvas = document.createElement('canvas')
      const output = document.createElement('canvas')
      try {
        maskCanvas.width = mask.width
        maskCanvas.height = mask.height
        const maskContext = context2d(maskCanvas)
        const maskImage = maskContext.createImageData(mask.width, mask.height)
        for (let i = 0; i < mask.width * mask.height; i++) maskImage.data[i * 4 + 3] = mask.pixels[i * mask.channels]
        maskContext.putImageData(maskImage, 0, 0)
        output.width = width
        output.height = height
        const context = context2d(output)
        context.drawImage(bitmap, 0, 0)
        context.globalCompositeOperation = 'destination-in'
        context.imageSmoothingQuality = 'high'
        context.drawImage(maskCanvas, 0, 0, width, height)
        context.globalCompositeOperation = 'source-over'
      } catch (cause) { releaseCanvas(output); throw cause }
      finally {
        releaseCanvas(maskCanvas)
        bitmap.close()
        if (imageBitmap === bitmap) imageBitmap = null
      }
      cutoutCanvas = output
      mark('encoding-cutout', { width, height })
      const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'))
      if (id !== requestId) { releaseCanvas(output); return }
      if (!blob) {
        releaseCanvas(output)
        cutoutCanvas = null
        throw new Error('Could not create the transparent image.')
      }
      revoke(resultUrl.value)
      mark('result-preview-encoding')
      const preview = await createPreview(output)
      if (id !== requestId) { releaseCanvas(output); return }
      resultUrl.value = URL.createObjectURL(preview.blob)
      cutoutBlob = blob
      await updateExport()
      if (id !== requestId || phase.value === 'error') return
      phase.value = 'complete'
      activeRequest = null
      statusDetail.value = `Background removed on ${backend.value}. Choose a backdrop, then download or share your image.`
      mark('complete', { pngBytes: exportFile?.size }, false)
      runQueuedFile()
    }

    function updateExport() {
      if (!cutoutBlob) return Promise.resolve()
      exportPending = true
      if (exportTask) return exportTask
      exportBusy.value = true
      exportTask = (async () => {
        while (exportPending && cutoutCanvas) {
          exportPending = false
          const currentResult = resultUrl.value
          const choice = currentChoice.value
          let canvas = cutoutCanvas
          mark('encoding-export', { backdrop: choice.id })
          try {
            if (choice.kind !== 'transparent') {
              canvas = document.createElement('canvas')
              canvas.width = cutoutCanvas.width
              canvas.height = cutoutCanvas.height
              const context = context2d(canvas)
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
            const blob = choice.kind === 'transparent' ? cutoutBlob : await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
            if (!blob) throw new Error('Could not export this image. Try a smaller photo.')
            if (currentResult !== resultUrl.value || choice.id !== selected.value) continue
            revoke(exportUrl.value)
            exportUrl.value = URL.createObjectURL(blob)
            exportFile = new File([blob], `${fileName.value.replace(/\.[^.]+$/, '') || 'image'}-${choice.id}.png`, { type: 'image/png' })
            canShareFile.value = Boolean(navigator.share && navigator.canShare?.({ files: [exportFile] }))
            exportMessage.value = ''
            mark('export-ready', { backdrop: choice.id, bytes: blob.size, fileSharing: canShareFile.value }, phase.value === 'compositing')
          } finally { if (canvas !== cutoutCanvas) releaseCanvas(canvas) }
        }
      })().catch(fail).finally(() => {
        exportBusy.value = false
        exportTask = null
        if (phase.value === 'complete' && queuedFile) {
          runQueuedFile()
        }
      })
      return exportTask
    }

    function selectBackground(id) { selected.value = id; updateExport() }

    async function shareImage() {
      if (!exportFile || busy.value || shareBusy.value) return
      shareBusy.value = true
      diagnostics.record('share-opened')
      try {
        await navigator.share({ files: [exportFile] })
        exportMessage.value = 'Image shared with the selected action.'
        diagnostics.record('share-finished')
      } catch (cause) {
        if (cause.name !== 'AbortError') {
          exportMessage.value = 'Sharing could not open. Use Download image instead.'
          diagnostics.record('share-error', errorDetails(cause))
        }
      } finally { shareBusy.value = false }
    }

    onMounted(() => {
      mark('app-opened', { version: APP_VERSION }, false)
      refreshCache()
      pwa = createPwa({
        isBusy: () => busy.value || shareBusy.value,
        onDiagnostic: (event, details) => diagnostics.record(event, details),
        onChange: state => {
          pwaState.value = state
          if (!state.offline && phase.value === 'offline') loadModel(queuedFile?.forceWasm ?? preferWasm.value)
        },
      })
      window.addEventListener('error', globalError)
      window.addEventListener('unhandledrejection', rejectedPromise)
      window.addEventListener('pagehide', pageLeaving)
      document.addEventListener('visibilitychange', pageHidden)
      loadModel()
    })
    onUnmounted(() => {
      pwa?.dispose()
      clearTimeout(slowTimer)
      worker?.terminate(); imageBitmap?.close(); releaseCanvas(cutoutCanvas)
      revoke(originalUrl.value); revoke(resultUrl.value); revoke(exportUrl.value)
      window.removeEventListener('error', globalError)
      window.removeEventListener('unhandledrejection', rejectedPromise)
      window.removeEventListener('pagehide', pageLeaving)
      document.removeEventListener('visibilitychange', pageHidden)
    })
    return { CACHE_KEY, choices, fileInput, fileName, dimensions, originalUrl, resultUrl, exportUrl,
  selected, phase, backend, downloadFile, downloadProgress, statusDetail, error,
  dragOver, showOriginal, cacheFiles, cacheBytes, cacheAvailable, origin,
  busy, currentChoice, stageText, cacheSize, previewStyle,
  refreshCache, clearCache, loadModel, acceptFile, onFileChange, onDrop,
  selectBackground, shareImage, shareBusy, canShareFile, exportMessage, exportBusy,
  copyDiagnostics, diagnosticText, diagnosticMessage, interruptedNotice, cancelRun, retryWasm, previewError, preferWasm, canRetry, APP_VERSION,
  pwaState, installApp: () => pwa?.install(), updateApp: () => pwa?.update() }
  },
}).mount('#app')
