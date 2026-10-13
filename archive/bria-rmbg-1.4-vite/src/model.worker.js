import { env, pipeline } from '@huggingface/transformers'

const MODEL_ID = 'briaai/RMBG-1.4'
env.useBrowserCache = true
env.cacheKey = 'transformers-cache'

let segmenter = null
let backend = null
let loading = null

function progress(event) {
  if (event.status === 'progress' || event.status === 'initiate' || event.status === 'done') {
    self.postMessage({ type: 'download', status: event.status, file: event.file || '', progress: event.progress ?? null })
  }
}

async function loadModel() {
  if (segmenter) return backend
  if (loading) return loading
  loading = (async () => {
    const useGPU = !!self.navigator?.gpu
    const choices = useGPU
      ? [{ device: 'webgpu', dtype: 'fp16', label: 'WebGPU' }, { device: 'wasm', dtype: 'q8', label: 'WASM' }]
      : [{ device: 'wasm', dtype: 'q8', label: 'WASM' }]
    let lastError
    for (const choice of choices) {
      try {
        self.postMessage({ type: 'loading', backend: choice.label })
        segmenter = await pipeline('image-segmentation', MODEL_ID, {
          device: choice.device,
          dtype: choice.dtype,
          progress_callback: progress,
        })
        backend = choice.label
        self.postMessage({ type: 'ready', backend })
        return backend
      } catch (error) {
        lastError = error
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
      await loadModel()
    } else if (data.type === 'process') {
      await loadModel()
      self.postMessage({ type: 'processing', id: data.id })
      const result = await segmenter(data.url)
      const mask = Array.isArray(result) ? result[0]?.mask : result?.mask
      if (!mask?.data || !mask.width || !mask.height) throw new Error('The model returned an unexpected mask format.')
      const pixels = new Uint8Array(mask.data)
      self.postMessage({ type: 'result', id: data.id, width: mask.width, height: mask.height, channels: mask.channels || 1, pixels }, [pixels.buffer])
    }
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, message: String(error?.message || error) })
  }
}
