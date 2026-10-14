const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')

function serviceWorker(scope) {
  const handlers = {}, stores = new Map(), fetched = []
  let claimed = 0, activated = 0, offline = false
  const cacheFor = name => {
    if (!stores.has(name)) stores.set(name, new Map())
    const entries = stores.get(name)
    return {
      async addAll(requests) {
        for (const request of requests) {
          const relative = new URL(request.url).pathname.slice(new URL(scope).pathname.length)
          const file = path.join(root, 'main', relative || 'index.html')
          assert.ok(fs.existsSync(file), `Missing precache file ${file}`)
          entries.set(request.url, new Response(fs.readFileSync(file)))
        }
      },
      async match(url) { return entries.get(url)?.clone() },
    }
  }
  const caches = {
    async open(name) { return cacheFor(name) },
    async keys() { return [...stores.keys()] },
    async delete(name) { return stores.delete(name) },
  }
  const self = {
    registration: { scope }, clients: { async claim() { claimed++ } },
    skipWaiting() { activated++ },
    addEventListener(name, fn) { handlers[name] = fn },
  }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'main/service-worker.js'), 'utf8'), {
    self, caches, URL, Request,
    fetch: async request => { fetched.push(request.url); if (offline) throw Error('offline'); return new Response('network') },
  })
  return { stores, fetched, caches,
    setOffline() { offline = true },
    counts: () => ({ claimed, activated }),
    async lifecycle(name) { let promise; handlers[name]({ waitUntil(value) { promise = value } }); await promise },
    message(data) { handlers.message({ data }) },
    async get(url, method = 'GET') {
      let promise
      handlers.fetch({ request: new Request(url, { method }), respondWith(value) { promise = value } })
      return promise ? await promise : null
    },
  }
}

for (const pathname of ['/', '/main/']) {
  test(`shell works offline at ${pathname} and leaves model caches alone`, async () => {
    const scope = `https://cutout.example${pathname}`
    const worker = serviceWorker(scope)
    const prefix = `cutout-shell:${pathname}:`
    worker.stores.set(`${prefix}old-release`, new Map())
    worker.stores.set('transformers-cache', new Map([['weights', 'keep']]))
    worker.stores.set('another-app', new Map())
    await worker.lifecycle('install')
    assert.equal(worker.counts().activated, 0, 'Installation must wait rather than interrupt a running app')
    await worker.lifecycle('activate')
    assert.equal(worker.counts().claimed, 1)
    assert.ok(!worker.stores.has(`${prefix}old-release`))
    assert.ok(worker.stores.has('transformers-cache'))
    assert.ok(worker.stores.has('another-app'))
    worker.setOffline()
    assert.match(await (await worker.get(scope)).text(), /Cutout/)
    assert.match(await (await worker.get(`${scope}app.js?source=test`)).text(), /createApp/)
    assert.match(await (await worker.get(`${scope}vendor/vue-3.5.43.esm-browser.prod.js`)).text(), /vue v3/)
    assert.equal(await worker.get('https://huggingface.co/model.onnx'), null)
    assert.equal(await worker.get(`${scope}photo.png`), null)
    assert.equal(await worker.get(`${scope}app.js`, 'POST'), null)
    worker.message({ type: 'OTHER' })
    assert.equal(worker.counts().activated, 0)
    worker.message({ type: 'ACTIVATE_UPDATE' })
    assert.equal(worker.counts().activated, 1)
    assert.equal(worker.fetched.length, 0)
  })
}

function events(properties = {}) {
  const listeners = new Map()
  return Object.assign(properties, {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn) },
    emit(name, event = {}) { for (const fn of listeners.get(name) || []) fn(event) },
  })
}

test('automatic updates preserve active images, processing, and sharing', async () => {
  let reloads = 0, busy = true, hasImage = true, prompted = 0, prevented = 0, checks = 0
  const changes = [], diagnostics = [], messages = []
  const media = events({ matches: false })
  const registration = events({ scope: 'https://cutout.example/', installing: null, waiting: { postMessage: data => messages.push(data) }, update: async () => { checks++ } })
  const service = events({ controller: {}, ready: Promise.resolve(registration), register: async () => registration })
  const navigator = { onLine: true, serviceWorker: service }
  const window = events({ isSecureContext: true, matchMedia: () => media, location: { reload() { reloads++ } } })
  const source = fs.readFileSync(path.join(root, 'main/pwa.js'), 'utf8')
    .replace('export function', 'function').replace('import.meta.url', JSON.stringify('https://cutout.example/pwa.js'))
  const document = events({ visibilityState: 'visible' })
  const context = vm.createContext({ window, navigator, document, URL, setInterval, clearInterval })
  vm.runInContext(source, context)
  const pwa = context.createPwa({ onChange: value => changes.push(value), onDiagnostic: (...args) => diagnostics.push(args), isBusy: () => busy, hasImage: () => hasImage })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(changes.at(-1).offlineReady, true)
  assert.equal(changes.at(-1).updateAvailable, true)
  pwa.tryUpdate()
  assert.equal(messages.length, 0, 'Do not update during processing or sharing')
  busy = false
  pwa.tryUpdate()
  assert.equal(messages.length, 0, 'An exported photo must remain available until Start over')
  hasImage = false
  pwa.tryUpdate()
  assert.equal(messages[0].type, 'ACTIVATE_UPDATE')
  pwa.tryUpdate()
  assert.equal(messages.length, 1, 'Request activation only once')
  hasImage = true
  service.emit('controllerchange')
  assert.equal(reloads, 0, 'A photo selected during activation must survive until cleared')
  hasImage = false
  pwa.tryUpdate()
  assert.equal(reloads, 1)
  pwa.tryUpdate()
  assert.equal(reloads, 1, 'Reload only once per update')
  window.emit('focus')
  assert.equal(checks, 1, 'Repeated focus events must not flood update checks')
  navigator.onLine = false
  window.emit('offline')
  assert.equal(changes.at(-1).offline, true)
  navigator.onLine = true
  window.emit('online')
  assert.equal(changes.at(-1).offline, false)
  window.emit('beforeinstallprompt', { preventDefault() { prevented++ }, async prompt() { prompted++ }, userChoice: Promise.resolve({ outcome: 'accepted' }) })
  assert.equal(prevented, 1)
  assert.equal(prompted, 0, 'Only prompt after a user clicks Install')
  assert.equal(changes.at(-1).installable, true)
  await pwa.install()
  assert.equal(prompted, 1)
  window.emit('appinstalled')
  assert.equal(changes.at(-1).installed, true)
  assert.ok(diagnostics.some(([name]) => name === 'pwa-install-choice'))
  pwa.dispose()
  const count = changes.length
  window.emit('offline')
  assert.equal(changes.length, count)
})

test('first installation does not reload, while another window’s update waits for an image to close', async () => {
  let reloads = 0, image = false, clock = 100000, interval
  const registration = events({ scope: 'https://cutout.example/', installing: null, waiting: null, update: async () => {} })
  const service = events({ controller: null, ready: Promise.resolve(registration), register: async () => registration })
  const navigator = { onLine: true, serviceWorker: service }
  const window = events({ isSecureContext: true, matchMedia: () => events({ matches: false }), location: { reload() { reloads++ } } })
  const document = events({ visibilityState: 'visible' })
  const context = vm.createContext({ window, navigator, document, URL, Date: { now: () => clock }, setInterval: fn => { interval = fn; return 1 }, clearInterval() {} })
  vm.runInContext(fs.readFileSync(path.join(root, 'main/pwa.js'), 'utf8').replace('export function', 'function').replace('import.meta.url', JSON.stringify('https://cutout.example/pwa.js')), context)
  const pwa = context.createPwa({ onChange() {}, onDiagnostic() {}, isBusy: () => false, hasImage: () => image })
  await new Promise(resolve => setImmediate(resolve))
  service.controller = {}
  service.emit('controllerchange')
  assert.equal(reloads, 0)
  image = true
  service.emit('controllerchange')
  assert.equal(reloads, 0)
  image = false
  clock += 300000
  interval()
  assert.equal(reloads, 1)
  pwa.dispose()
})

test('manifest and icon files remain portable and have the advertised PNG sizes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'main/manifest.webmanifest')))
  assert.equal(manifest.scope, './')
  assert.equal(manifest.start_url, './')
  assert.equal(manifest.id, './')
  assert.equal(manifest.display, 'standalone')
  for (const icon of manifest.icons) {
    const bytes = fs.readFileSync(path.join(root, 'main', icon.src))
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes)
  }
})

test('offline uploads wait for connectivity and model readiness; worker failures do not loop', async () => {
  const mounted = [], messages = [], records = [], workers = []
  let app, pwaHooks, decodes = 0
  const navigator = { onLine: false }
  const window = events({ location: { origin: 'https://cutout.example' } })
  class Worker {
    constructor() { workers.push(this) }
    postMessage(message) { messages.push(message) }
    terminate() { this.terminated = true }
  }
  const source = fs.readFileSync(path.join(root, 'main/app.js'), 'utf8')
    .replace(/^import .*\n/gm, '').replaceAll('import.meta.url', JSON.stringify('https://cutout.example/app.js'))
  const context = vm.createContext({
    window, navigator, URL, Worker, Error, Uint8ClampedArray,
    document: events({}), console: { error() {} }, setTimeout, clearTimeout,
    ref: value => ({ value }), computed: getter => ({ get value() { return getter() } }),
    nextTick: callback => Promise.resolve().then(callback), onMounted: fn => mounted.push(fn), onUnmounted() {},
    APP_VERSION: 'test', createDiagnostics: () => ({ record: name => records.push(name), report() {} }),
    createPwa: hooks => { pwaHooks = hooks; return { dispose() {} } },
    createImageBitmap: async () => { decodes++; throw Error('Synthetic decode failure') },
    createApp: options => ({ mount() { app = options.setup(); mounted.forEach(fn => fn()) } }),
  })
  vm.runInContext(source, context)
  assert.equal(workers.length, 0)
  assert.equal(app.phase.value, 'offline')
  await app.acceptFile({ name: 'local.png', type: 'image/png', size: 100 })
  assert.equal(decodes, 0)
  assert.equal(workers.length, 0)
  navigator.onLine = true
  pwaHooks.onChange({ offline: false })
  assert.equal(messages[0].type, 'load')
  assert.equal(decodes, 0)
  const oldErrorHandler = workers[0].onerror
  workers[0].onmessage({ data: { type: 'ready', backend: 'WebGPU · FP16' } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(decodes, 1)
  assert.ok(records.indexOf('model-ready') < records.indexOf('image-decoding'))
  assert.equal(app.phase.value, 'error')
  oldErrorHandler({ message: 'Synthetic worker import failure' })
  assert.equal(workers.length, 1, 'Do not recreate a failing import in a loop')
  app.loadModel()
  assert.equal(workers.length, 2, 'Explicit retry can recreate the worker')
})
