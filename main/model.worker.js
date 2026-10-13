import { env, pipeline, RawImage } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0'

const MODEL_ID = 'onnx-community/ormbg-ONNX'
env.useBrowserCache = true
env.cacheKey = 'transformers-cache'

let segmenter = null
let backend = null
let loading = null
let gpuFailed = false

function progress(event) {
  if (event.status === 'progress' || event.status === 'initiate' || event.status === 'done') {
    self.postMessage({ type: 'download', status: event.status, file: event.file || '', progress: event.progress ?? null })
  }
}

async function loadModel(forceWasm = false) {
  if (segmenter && (!forceWasm || backend === 'WASM · Q8')) return backend
  if (loading) return loading
  loading = (async () => {
    if (forceWasm && segmenter) {
      try { await segmenter.dispose?.() } catch { /* Continue with the CPU fallback. */ }
      segmenter = null
      backend = null
    }
    const choices = !forceWasm && !gpuFailed && self.navigator?.gpu
      ? [
          { device: 'webgpu', dtype: 'fp16', label: 'WebGPU · FP16' },
          { device: 'wasm', dtype: 'q8', label: 'WASM · Q8' },
        ]
      : [{ device: 'wasm', dtype: 'q8', label: 'WASM · Q8' }]
    let lastError
    for (const choice of choices) {
      try {
        self.postMessage({ type: 'loading', backend: choice.label })
        segmenter = await pipeline('background-removal', MODEL_ID, {
          device: choice.device,
          dtype: choice.dtype,
          progress_callback: progress,
        })
        backend = choice.label
        self.postMessage({ type: 'ready', backend })
        return backend
      } catch (error) {
        lastError = error
        if (choice.device === 'webgpu') gpuFailed = true
        self.postMessage({ type: 'backend-failed', backend: choice.label, message: String(error?.message || error) })
      }
    }
    throw lastError
  })()
  try { return await loading } finally { loading = null }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      await loadModel(Boolean(data.forceWasm))
    } else if (data.type === 'process') {
      if (!(data.pixels instanceof Uint8ClampedArray) || data.width !== 1024 || data.height !== 1024 || data.pixels.length !== 1024 * 1024 * 4) throw new Error('Invalid model input. Reload the page and try again.')
      await loadModel(Boolean(data.forceWasm))
      const input = new RawImage(data.pixels, data.width, data.height, 4).rgb()
      self.postMessage({ type: 'processing', id: data.id })
      self.postMessage({ type: 'diagnostic', id: data.id, stage: 'inference-start', details: { backend, width: input.width, height: input.height } })
      let result
      const started = performance.now()
      try {
        result = await segmenter(input)
      } catch (error) {
        if (backend !== 'WebGPU · FP16') throw error
        gpuFailed = true
        self.postMessage({ type: 'backend-failed', backend, message: String(error?.message || error) })
        await loadModel(true)
        self.postMessage({ type: 'processing', id: data.id })
        result = await segmenter(input)
      }
      self.postMessage({ type: 'diagnostic', id: data.id, stage: 'inference-end', details: { backend, milliseconds: Math.round(performance.now() - started) } })
      const image = Array.isArray(result) ? result[0] : result
      if (!image?.data || !image.width || !image.height || ![1, 4].includes(image.channels)) throw new Error('The model returned an unexpected image format.')
      const pixels = new Uint8Array(image.width * image.height)
      for (let i = 0; i < pixels.length; i++) pixels[i] = image.data[i * image.channels + (image.channels === 4 ? 3 : 0)]
      self.postMessage({ type: 'result', id: data.id, width: image.width, height: image.height, channels: 1, pixels }, [pixels.buffer])
    }
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, message: String(error?.message || error), stack: String(error?.stack || '').slice(0, 2500) })
  }
}
