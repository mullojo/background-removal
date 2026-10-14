const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')

test('model sessions dispose before returning a mask, including GPU fallback', async () => {
  const sent = [], sequence = [], loaded = []
  const self = { navigator: { gpu: {} }, postMessage: message => { sent.push(message); sequence.push(message.stage || message.type) } }
  class RawImage { rgb() { return { width: 1024, height: 1024 } } }
  const source = fs.readFileSync(path.join(root, 'main/model.worker.js'), 'utf8').replace(/^import .*\n/gm, '')
  vm.runInNewContext(source, {
    self, env: {}, RawImage, Uint8Array, Uint8ClampedArray, performance,
    pipeline: async (task, model, options) => {
      const instance = { device: options.device, disposed: false }
      loaded.push(instance)
      const pipe = async () => {
        if (options.device === 'webgpu') throw Error('Synthetic GPU failure')
        return { width: 2, height: 2, channels: 1, data: new Uint8Array([0, 64, 128, 255]) }
      }
      pipe.dispose = async () => { instance.disposed = true; sequence.push(`disposed:${options.device}`) }
      return pipe
    },
  })
  await self.onmessage({ data: { type: 'process', id: 1, width: 1024, height: 1024, pixels: new Uint8ClampedArray(1024 * 1024 * 4) } })
  assert.ok(!sent.some(message => message.type === 'error'))
  assert.deepEqual(loaded.map(instance => instance.device), ['webgpu', 'wasm'])
  assert.ok(loaded.every(instance => instance.disposed))
  assert.ok(sequence.indexOf('disposed:wasm') < sequence.indexOf('result'))
  assert.deepEqual([...sent.find(message => message.type === 'result').pixels], [0, 64, 128, 255])
  assert.equal(sent.find(message => message.stage === 'mask-summary').details.foregroundPercent, 50)
})

test('failed inference disposes its session before reporting an error', async () => {
  const sent = []
  let disposed = false
  const self = { navigator: {}, postMessage: message => { if (message.type === 'error') assert.ok(disposed); sent.push(message) } }
  class RawImage { rgb() { return { width: 1024, height: 1024 } } }
  const pipe = async () => { throw Error('Synthetic inference failure') }
  pipe.dispose = async () => { disposed = true }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'main/model.worker.js'), 'utf8').replace(/^import .*\n/gm, ''), {
    self, env: {}, RawImage, Uint8Array, Uint8ClampedArray, performance, pipeline: async () => pipe,
  })
  await self.onmessage({ data: { type: 'process', id: 2, width: 1024, height: 1024, pixels: new Uint8ClampedArray(1024 * 1024 * 4) } })
  assert.equal(sent.at(-1).type, 'error')
  assert.ok(!sent.some(message => message.type === 'result'))
})

test('successive photos get new workers after releasing prior image resources', async () => {
  const mounted = [], workers = [], canvases = [], openBitmaps = new Set(), urls = new Map()
  let app, serial = 0, preparingExports = 0
  class Worker {
    constructor() {
      assert.equal(openBitmaps.size, 0)
      assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0), 'Old canvases must be released before a replacement model loads')
      workers.push(this)
      this.processes = 0
    }
    terminate() { this.terminated = true }
    postMessage(message) {
      assert.ok(!this.terminated)
      this.originalHandler = this.onmessage
      if (message.type === 'process') {
        assert.equal(++this.processes, 1)
        queueMicrotask(() => {
          this.onmessage({ data: { type: 'processing', id: message.id } })
          this.onmessage({ data: { type: 'result', id: message.id, width: 2, height: 2, channels: 1, pixels: new Uint8Array([0, 128, 255, 255]) } })
        })
      } else queueMicrotask(() => this.onmessage({ data: { type: 'ready', backend: 'WebGPU · FP16' } }))
    }
  }
  const context2d = {
    drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(1024 * 1024 * 4) }),
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData() {},
  }
  const document = {
    addEventListener() {}, removeEventListener() {}, createElement() {
      const canvas = { width: 0, height: 0, getContext: () => context2d, toBlob: callback => queueMicrotask(() => callback(new Blob(['PNG']))) }
      canvases.push(canvas)
      return canvas
    },
  }
  class LocalURL extends URL {
    static createObjectURL(blob) { const url = `blob:test-${++serial}`; urls.set(url, blob); return url }
    static revokeObjectURL(url) { urls.delete(url) }
  }
  const context = vm.createContext({
    console: { error() {} }, URL: LocalURL, Worker, Blob, File, Uint8ClampedArray, setTimeout, clearTimeout, document,
    window: { location: { origin: 'https://cutout.example' }, addEventListener() {}, removeEventListener() {} },
    navigator: { onLine: true },
    ref: value => ({ value }), computed: getter => ({ get value() { return getter() } }),
    nextTick: callback => Promise.resolve().then(callback), onMounted: fn => mounted.push(fn), onUnmounted() {},
    APP_VERSION: 'test', createDiagnostics: () => ({ record(name) { if (name === 'export-image-decoding') { preparingExports++; assert.ok(workers.at(-1).terminated, 'Release runtime before full-size export decode') } } }),
    createPwa: () => ({}),
    createImageBitmap: async () => {
      const bitmap = { width: 20, height: 10, close() { openBitmaps.delete(bitmap) } }
      openBitmaps.add(bitmap)
      return bitmap
    },
    createApp: options => ({ mount() { app = options.setup(); mounted.forEach(fn => fn()) } }),
  })
  vm.runInContext(fs.readFileSync(path.join(root, 'main/app.js'), 'utf8').replace(/^import .*\n/gm, '').replaceAll('import.meta.url', JSON.stringify('https://cutout.example/app.js')), context)
  const untilComplete = async () => {
    for (let i = 0; i < 100 && app.phase.value !== 'complete'; i++) await new Promise(resolve => setTimeout(resolve, 2))
    assert.equal(app.phase.value, 'complete')
  }
  const file = new File(['source'], 'local.png', { type: 'image/png' })
  for (let i = 0; i < 3; i++) {
    const oldURL = app.exportUrl.value
    await app.acceptFile(file)
    await untilComplete()
    assert.equal(workers.length, i + 1)
    assert.ok(workers.at(-1).terminated)
    assert.equal(app.modelLoaded.value, false)
    assert.equal(openBitmaps.size, 0)
    if (oldURL) assert.ok(!urls.has(oldURL))
  }
  assert.equal(preparingExports, 3)
  const previous = workers[0]
  assert.equal(previous.onmessage, null)
  previous.originalHandler({ data: { type: 'error', message: 'Late old-worker error' } })
  assert.equal(app.phase.value, 'complete')
})
