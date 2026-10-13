import { env, pipeline, AutoModel, AutoProcessor, RawImage } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0'

const MODELS = {
  bria: { id: 'briaai/RMBG-1.4' },
  ormbg: { id: 'onnx-community/ormbg-ONNX' },
  modnet: { id: 'Xenova/modnet' },
}
env.useBrowserCache = true
env.cacheKey = 'transformers-cache'

let activeKey = null
let activeChoice = null
let engine = null
let backend = null
let loading = null

function progress(event) {
  if (['progress', 'initiate', 'done'].includes(event.status)) {
    self.postMessage({ type: 'download', status: event.status, file: event.file || '', progress: event.progress ?? null })
  }
}

async function loadModel(key, choice = 'auto') {
  if (!MODELS[key]) throw new Error('Unknown model.')
  if (activeKey === key && activeChoice === choice && engine) return backend
  if (loading) return loading
  loading = (async () => {
    if (engine?.dispose) await engine.dispose()
    if (engine?.model?.dispose) await engine.model.dispose()
    engine = null
    activeKey = null
    activeChoice = null
    backend = null
    const config = MODELS[key]
    const hasGPU = !!self.navigator?.gpu
    const options = key === 'ormbg' || key === 'bria'
      ? choice === 'webgpu'
        ? (hasGPU ? [{ device: 'webgpu', dtype: 'fp16', label: 'WebGPU · FP16' }] : [])
        : choice === 'wasm'
        ? [{ device: 'wasm', dtype: 'q8', label: 'WASM · Q8' }]
        : []
      : (choice === 'wasm' ? [{ device: 'wasm', dtype: 'fp32', label: 'WASM · FP32' }] : [])
    if (!options.length) throw new Error(choice.startsWith('webgpu') ? 'WebGPU is unavailable in this browser. Select WASM or use a browser with WebGPU.' : 'Choose a supported backend for this model.')
    let lastError
    for (const option of options) {
      try {
        self.postMessage({ type: 'loading', model: key, backend: option.label })
        if (key === 'bria') {
          const model = await AutoModel.from_pretrained(config.id, {
            device: option.device, dtype: option.dtype, progress_callback: progress,
          })
          const processor = await AutoProcessor.from_pretrained(config.id)
          engine = { model, processor }
        } else {
          engine = await pipeline('background-removal', config.id, {
            device: option.device, dtype: option.dtype, progress_callback: progress,
          })
        }
        activeKey = key
        activeChoice = choice
        backend = option.label
        self.postMessage({ type: 'ready', model: key, choice, backend })
        return backend
      } catch (error) {
        lastError = error
        self.postMessage({ type: 'backend-failed', model: key, backend: option.label, message: String(error?.message || error) })
      }
    }
    if (choice.startsWith('webgpu')) throw new Error(`WebGPU could not initialize ${key.toUpperCase()} in this browser. Try WASM or another WebGPU-capable browser. Runtime detail: ${String(lastError?.message || lastError)}`)
    throw lastError
  })()
  try { return await loading } finally { loading = null }
}

async function predict(key, url) {
  if (key === 'bria') {
    const image = await RawImage.fromURL(url)
    const { pixel_values } = await engine.processor(image)
    const { output } = await engine.model({ input: pixel_values })
    const matte = output?.[0]
    if (!matte?.data || !matte?.dims) throw new Error('BRIA returned an unexpected mask format.')
    const height = matte.dims.at(-2)
    const width = matte.dims.at(-1)
    const values = matte.data
    if (!width || !height || values.length !== width * height) throw new Error('BRIA returned an unexpected mask size.')
    let minimum = Infinity
    let maximum = -Infinity
    for (const value of values) { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value) }
    const pixels = new Uint8Array(values.length)
    const range = maximum - minimum
    for (let i = 0; i < values.length; i++) pixels[i] = range ? Math.round(255 * (values[i] - minimum) / range) : 0
    return { width, height, pixels }
  }
  const result = await engine(url)
  if (key === 'ormbg' || key === 'modnet') {
    const image = Array.isArray(result) ? result[0] : result
    if (!image?.data || ![1, 4].includes(image.channels)) throw new Error('The model returned an unexpected image format.')
    const pixels = new Uint8Array(image.width * image.height)
    for (let i = 0; i < pixels.length; i++) pixels[i] = image.data[i * image.channels + (image.channels === 4 ? 3 : 0)]
    return { width: image.width, height: image.height, pixels }
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      await loadModel(data.model, data.choice)
    } else if (data.type === 'process') {
      await loadModel(data.model, data.choice)
      self.postMessage({ type: 'processing', id: data.id, model: data.model })
      const started = performance.now()
      const mask = await predict(data.model, data.url)
      self.postMessage({ type: 'result', id: data.id, model: data.model, choice: data.choice, backend, elapsedMs: Math.round(performance.now() - started), ...mask }, [mask.pixels.buffer])
    }
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, model: data.model, message: String(error?.message || error) })
  }
}
