import { createApp, computed, onMounted, onUnmounted, ref } from 'https://unpkg.com/vue@3.5.43/dist/vue.esm-browser.prod.js'

createApp({
  template: '#app-template',
  setup() {
    const CACHE_KEY = 'transformers-cache'
    const models = [
      { id: 'ormbg', name: 'ORMBG', source: 'onnx-community/ormbg-ONNX', license: 'Apache 2.0', size: '44 MB', note: 'Portraits and people · compare backends', url: 'https://huggingface.co/onnx-community/ormbg-ONNX' },
      { id: 'bria', name: 'BRIA RMBG 1.4', source: 'briaai/RMBG-1.4', license: 'Non-commercial', size: '44–88 MB', note: 'Original model · compare backends', url: 'https://huggingface.co/briaai/RMBG-1.4' },
      { id: 'modnet', name: 'MODNet', source: 'Xenova/modnet', license: 'Apache 2.0', size: '26 MB', note: 'Portrait matte · WASM FP32', url: 'https://huggingface.co/Xenova/modnet' },
    ]
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
    const outputs = ref({})
    const selectedModel = ref('ormbg')
    const selectedBackends = ref({ ormbg: 'wasm', bria: 'wasm', modnet: 'wasm' })
    const loadedModel = ref('')
    const loadedChoice = ref('')
    const selected = ref('transparent')
    const phase = ref('idle')
    const backend = ref('')
    const downloadFile = ref('')
    const downloadProgress = ref(null)
    const elapsedSeconds = ref(0)
    const statusDetail = ref('Choose a photo to begin with ORMBG.')
    const error = ref('')
    const dragOver = ref(false)
    const showOriginal = ref(false)
    const cacheFiles = ref(0)
    const cacheBytes = ref(0)
    const cacheAvailable = ref(true)
    const origin = window.location.origin
    const webgpuAvailable = !!navigator.gpu
    let worker
    let imageBitmap = null
    let requestId = 0
    let queuedFile = null
    let runTimer = null

    function stopTimer() { if (runTimer) clearInterval(runTimer); runTimer = null }

    const busy = computed(() => ['loading', 'processing', 'compositing'].includes(phase.value))
    const currentModel = computed(() => models.find(model => model.id === selectedModel.value) || models[0])
    const currentBackendChoice = computed(() => selectedBackends.value[selectedModel.value] || 'auto')
    const loadedSelected = computed(() => loadedModel.value === selectedModel.value && loadedChoice.value === currentBackendChoice.value)
    const comparisonItems = computed(() => models.flatMap(model => {
      const options = ['ormbg', 'bria'].includes(model.id) ? ['wasm', 'webgpu'] : ['wasm']
      return options.map(choice => ({ model, choice, key: `${model.id}:${choice}`, label: choice === 'wasm' ? `WASM · ${model.id === 'modnet' ? 'FP32' : 'Q8'}` : choice === 'webgpu' ? 'WebGPU · FP16' : '' }))
    }))
    const currentChoice = computed(() => choices.find(choice => choice.id === selected.value) || choices[0])
    const currentOutput = computed(() => outputs.value[`${selectedModel.value}:${currentBackendChoice.value}`] || null)
    const stageText = computed(() => ({ idle: 'Model not loaded', loading: 'Loading model', ready: 'Model ready', processing: 'Removing background', compositing: 'Finishing image', complete: 'Image ready', error: 'Needs attention' })[phase.value])
    const cacheSize = computed(() => cacheBytes.value ? `${(cacheBytes.value / 1048576).toFixed(1)} MB` : 'Size unavailable')
    const previewStyle = computed(() => {
      const choice = currentChoice.value
      if (choice.kind === 'solid') return { background: choice.color }
      if (choice.kind === 'gradient') return { background: `linear-gradient(135deg, ${choice.colors.join(', ')})` }
      return {}
    })
    const completedCount = computed(() => Object.keys(outputs.value).length)

    function makeWorker() {
      worker = new Worker(new URL('./model.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = onWorkerMessage
      worker.onerror = event => fail(new Error(event.message || 'The model worker stopped unexpectedly.'))
    }
    function resetWorker() {
      worker?.terminate()
      stopTimer()
      makeWorker()
      loadedModel.value = ''
      loadedChoice.value = ''
      backend.value = ''
    }
    function revoke(url) { if (url) URL.revokeObjectURL(url) }
    function prepareWorker(modelId, choice) {
      if (loadedModel.value && (loadedModel.value !== modelId || loadedChoice.value !== choice)) resetWorker()
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
        for (const request of requests) {
          const response = await cache.match(request)
          const length = Number(response?.headers.get('content-length'))
          if (Number.isFinite(length) && length > 0) total += length
          else if (response) total += (await response.blob()).size
        }
        cacheBytes.value = total
      } catch { cacheAvailable.value = false }
    }
    async function clearCache() {
      if (busy.value) return
      try {
        resetWorker()
        await caches.delete(CACHE_KEY)
        phase.value = currentOutput.value ? 'complete' : 'idle'
        statusDetail.value = 'All model downloads cleared. Existing image results are still available.'
        await refreshCache()
      } catch (cause) { error.value = `Could not clear the model cache: ${cause.message || cause}` }
    }
    function loadModel() {
      if (busy.value || loadedSelected.value) return
      error.value = ''
      prepareWorker(selectedModel.value, currentBackendChoice.value)
      phase.value = 'loading'
      statusDetail.value = `Loading ${currentModel.value.name} for ${currentBackendChoice.value} from Hugging Face…`
      worker.postMessage({ type: 'load', model: selectedModel.value, choice: currentBackendChoice.value })
    }
    function selectModel(id, choice) {
      if (busy.value || !models.some(model => model.id === id)) return
      selectedModel.value = id
      if (choice && ['ormbg', 'bria', 'modnet'].includes(id)) selectedBackends.value = { ...selectedBackends.value, [id]: choice }
      error.value = ''
      resultUrl.value = currentOutput.value?.url || ''
      exportUrl.value = ''
      phase.value = resultUrl.value ? 'complete' : loadedSelected.value ? 'ready' : 'idle'
      statusDetail.value = resultUrl.value
        ? `${currentModel.value.name} ${currentBackendChoice.value} result ready. Compare it below or download it.`
        : `Select Run ${currentModel.value.name} to test ${currentBackendChoice.value} on the same photo.`
      if (resultUrl.value) updateExport()
    }
    function selectBackend(choice) {
      if (busy.value || !['wasm', 'webgpu'].includes(choice) || (choice === 'webgpu' && !webgpuAvailable)) return
      selectModel(selectedModel.value, choice)
    }
    function runSelected() {
      if (!originalUrl.value || busy.value) return
      error.value = ''
      prepareWorker(selectedModel.value, currentBackendChoice.value)
      requestId += 1
      phase.value = loadedSelected.value ? 'processing' : 'loading'
      statusDetail.value = loadedSelected.value
        ? `Sending photo to ${currentModel.value.name}…`
        : `Loading ${currentModel.value.name} before processing…`
      worker.postMessage({ type: 'process', id: requestId, model: selectedModel.value, choice: currentBackendChoice.value, url: originalUrl.value })
    }
    function cancelRun() {
      if (!busy.value) return
      requestId += 1
      resetWorker()
      phase.value = currentOutput.value ? 'complete' : 'idle'
      statusDetail.value = 'Run cancelled. Results from other models are still available.'
      downloadProgress.value = null
    }
    function onWorkerMessage({ data }) {
      if (data.type === 'loading') {
        phase.value = 'loading'
        statusDetail.value = `Preparing ${currentModel.value.name} on ${data.backend}…`
      } else if (data.type === 'download') {
        downloadFile.value = data.file.split('/').pop() || 'Model file'
        downloadProgress.value = data.status === 'progress' && Number.isFinite(data.progress) ? Math.round(data.progress) : null
        statusDetail.value = data.status === 'done'
          ? `${downloadFile.value} downloaded. Initializing model…`
          : `Downloading ${downloadFile.value}${downloadProgress.value !== null ? ` · ${downloadProgress.value}%` : ''}`
      } else if (data.type === 'backend-failed') {
        statusDetail.value = `${data.backend} could not load this model.`
      } else if (data.type === 'ready') {
        loadedModel.value = data.model
        loadedChoice.value = data.choice
        backend.value = data.backend
        phase.value = 'ready'
        statusDetail.value = `${currentModel.value.name} loaded on ${data.backend}.`
        downloadProgress.value = null
        refreshCache()
      } else if (data.type === 'processing') {
        if (data.id !== requestId) return
        phase.value = 'processing'
        elapsedSeconds.value = 0
        stopTimer()
        const started = performance.now()
        runTimer = setInterval(() => { elapsedSeconds.value = Math.round((performance.now() - started) / 1000) }, 1000)
        statusDetail.value = `${currentModel.value.name} is building a subject mask…`
      } else if (data.type === 'result') {
        if (data.id !== requestId) return
        stopTimer()
        phase.value = 'compositing'
        statusDetail.value = 'Applying the mask to your full-resolution photo…'
        compose(data).catch(fail)
      } else if (data.type === 'error') {
        if (data.id && data.id !== requestId) return
        fail(new Error(data.message))
      }
    }
    function fail(cause) {
      stopTimer()
      phase.value = 'error'
      error.value = cause?.message || String(cause)
      statusDetail.value = 'The other saved results are still available. Try another model or photo.'
    }
    async function acceptFile(file) {
      if (!file) return
      if (!file.type.startsWith('image/')) { fail(new Error('Choose a JPG, PNG, WebP, or another browser-supported image.')); return }
      if (busy.value) { queuedFile = file; return }
      error.value = ''
      revoke(originalUrl.value)
      revoke(exportUrl.value)
      for (const result of Object.values(outputs.value)) revoke(result.url)
      outputs.value = {}
      resultUrl.value = ''
      exportUrl.value = ''
      imageBitmap?.close()
      try {
        imageBitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        originalUrl.value = URL.createObjectURL(file)
        fileName.value = file.name
        dimensions.value = `${imageBitmap.width.toLocaleString()} × ${imageBitmap.height.toLocaleString()} px`
        showOriginal.value = false
        runSelected()
      } catch (cause) { fail(new Error(`This image could not be opened: ${cause.message || cause}`)) }
    }
    function onFileChange(event) { acceptFile(event.target.files?.[0]); event.target.value = '' }
    function onDrop(event) { dragOver.value = false; acceptFile(event.dataTransfer?.files?.[0]) }
    async function compose(mask) {
      const { width, height } = imageBitmap
      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = mask.width
      maskCanvas.height = mask.height
      const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
      const maskImage = maskContext.createImageData(mask.width, mask.height)
      for (let i = 0; i < mask.width * mask.height; i++) {
        const value = mask.pixels[i]
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
      const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Could not create the transparent image.')
      const key = `${mask.model}:${mask.choice}`
      const previous = outputs.value[key]
      if (previous) revoke(previous.url)
      const url = URL.createObjectURL(blob)
      outputs.value = { ...outputs.value, [key]: { url, canvas: output, seconds: (mask.elapsedMs / 1000).toFixed(1), backend: mask.backend } }
      resultUrl.value = url
      phase.value = 'complete'
      statusDetail.value = `${currentModel.value.name} on ${mask.backend} finished in ${(mask.elapsedMs / 1000).toFixed(1)} seconds. Compare results below.`
      await updateExport()
      if (queuedFile) { const next = queuedFile; queuedFile = null; await acceptFile(next) }
    }
    async function updateExport() {
      const cutoutCanvas = currentOutput.value?.canvas
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
    onUnmounted(() => {
      stopTimer()
      worker?.terminate()
      imageBitmap?.close()
      revoke(originalUrl.value)
      revoke(exportUrl.value)
      for (const result of Object.values(outputs.value)) revoke(result.url)
    })
    return {
      CACHE_KEY, models, choices, fileInput, fileName, dimensions, originalUrl, resultUrl, exportUrl,
      outputs, selectedModel, selectedBackends, loadedModel, loadedChoice, selected, phase, backend, downloadFile, downloadProgress, elapsedSeconds,
      statusDetail, error, dragOver, showOriginal, cacheFiles, cacheBytes, cacheAvailable, origin, webgpuAvailable,
      busy, currentModel, currentBackendChoice, loadedSelected, comparisonItems, currentChoice, currentOutput, stageText, cacheSize, previewStyle, completedCount,
      refreshCache, clearCache, loadModel, selectModel, selectBackend, runSelected, cancelRun, acceptFile, onFileChange, onDrop, selectBackground,
    }
  },
}).mount('#app')
