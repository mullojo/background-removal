import { env, pipeline } from '@huggingface/transformers'

const MODEL_ID = 'onnx-community/ormbg-ONNX'
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
    const choices = [{ device: 'wasm', dtype: 'q8', label: 'WASM' }]
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
      const image = Array.isArray(result) ? result[0] : result
      if (!image?.data || !image.width || !image.height || image.channels !== 4) throw new Error('The model returned an unexpected image format.')
      const pixels = new Uint8Array(image.width * image.height)
      for (let i = 0; i < pixels.length; i++) pixels[i] = image.data[i * 4 + 3]
      self.postMessage({ type: 'result', id: data.id, width: image.width, height: image.height, channels: 1, pixels }, [pixels.buffer])
    }
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, message: String(error?.message || error) })
  }
}
